import type { Prisma } from "@prisma/client";
import { MercadoPagoConfig, PreApproval } from "mercadopago";
import { z } from "zod";

import { env } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../lib/app-error.js";
import { logger } from "../../lib/logger.js";
import type { PaidBillingPlan } from "./billing.plans.js";

// The SDK forwards retries at runtime but omits it from its Options declaration.
// Retries belong to the durable queue, not to an in-memory HTTP request.
export const billingRequestOptions = { timeout: 8_000, retries: 0 };

export const pricePlanSchema = z.enum(["initial", "professional", "operation"]);
export const changePriceSchema = z.object({
  amountCents: z.number().int().min(100).max(100_000_000),
  revision: z.number().int().nonnegative()
}).strict();

// Also used by checkout creation, so a concurrent checkout cannot miss a price change.
export async function lockBillingPrices(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(730251)::text`;
}

export async function getBillingPrices() {
  return prisma.billingPlanPrice.findMany({ orderBy: { amountCents: "asc" } });
}

export async function getPriceChanges() {
  const prices = await getBillingPrices();
  return Promise.all(prices.map(async (price) => {
    const change = await prisma.billingPriceChange.findUnique({
      where: { plan_revision: { plan: price.plan, revision: price.revision } },
    });
    const counts = { pending: 0, updated: 0, skipped: 0, failed: 0 };
    const groups = change ? await prisma.billingPriceTask.groupBy({
      by: ["status"], where: { changeId: change.id }, _count: true
    }) : [];
    for (const group of groups) counts[group.status] = group._count;
    const failures = change ? await prisma.billingPriceTask.findMany({
      where: { changeId: change.id, errorCode: { not: null }, status: { in: ["pending", "failed"] } },
      select: { organizationId: true, preapprovalId: true, errorCode: true, attempts: true, nextAttemptAt: true },
      orderBy: { id: "asc" }, take: 20
    }) : [];
    return {
      ...price,
      change: change ? { id: change.id, createdAt: change.createdAt, changedBy: change.changedBy, ...counts, failures } : null
    };
  }));
}

export async function changeBillingPrice(plan: PaidBillingPlan, input: z.infer<typeof changePriceSchema>, email: string) {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) {
    throw new AppError(503, "BILLING_NOT_CONFIGURED", "Mercado Pago is not configured");
  }
  return prisma.$transaction(async (tx) => {
    await lockBillingPrices(tx);
    const price = await tx.billingPlanPrice.findUniqueOrThrow({ where: { plan } });
    if (price.revision !== input.revision) {
      throw new AppError(409, "PRICE_CHANGED", "El precio cambio. Actualiza el panel.");
    }
    if (price.amountCents === input.amountCents) {
      throw new AppError(400, "PRICE_UNCHANGED", "El precio no cambio.");
    }
    const unfinished = await tx.billingPriceTask.count({
      where: { change: { plan }, status: { in: ["pending", "failed"] } }
    });
    if (unfinished) {
      throw new AppError(409, "PRICE_SYNC_PENDING", "Hay suscripciones pendientes de actualizar.");
    }
    const subscriptions = await tx.organizationSubscription.findMany({
      where: { mercadoPagoPreapprovalId: { not: null } },
      select: { organizationId: true, mercadoPagoPreapprovalId: true }
    });
    await tx.billingPlanPrice.update({
      where: { plan }, data: { amountCents: input.amountCents, revision: { increment: 1 } }
    });
    return tx.billingPriceChange.create({
      data: {
        plan, previousCents: price.amountCents, amountCents: input.amountCents,
        revision: price.revision + 1, changedBy: email,
        tasks: { create: subscriptions.map((subscription) => ({
          organizationId: subscription.organizationId,
          preapprovalId: subscription.mercadoPagoPreapprovalId!
        })) }
      }
    });
  }, { timeout: 30_000 });
}

export async function retryPriceChange(plan: PaidBillingPlan) {
  await prisma.$transaction(async (tx) => {
    await lockBillingPrices(tx);
    await tx.billingPriceTask.updateMany({
      where: { change: { plan }, status: "failed" },
      data: { status: "pending", attempts: 0, errorCode: null, nextAttemptAt: new Date() }
    });
  }, { timeout: 30_000 });
}

export async function processNextPriceTask() {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) return false;
  const client = new PreApproval(new MercadoPagoConfig({
    accessToken: env.MERCADOPAGO_ACCESS_TOKEN, options: billingRequestOptions
  }));
  return prisma.$transaction(async (tx) => {
    // Serialize workers only. Pending tasks already prevent a newer price for this plan.
    const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(730252) AS locked`;
    if (!lock?.locked) return false;
    const task = await tx.billingPriceTask.findFirst({
      where: { status: "pending", nextAttemptAt: { lte: new Date() } },
      orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }], include: { change: true }
    });
    if (!task) return false;
    let status: "pending" | "updated" | "skipped" | "failed" = "failed";
    let errorCode: string | null = null;
    let retryable = false;
    try {
      const subscription = await tx.organizationSubscription.findUnique({
        where: { organizationId: task.organizationId }
      });
      const remote = await client.get({ id: task.preapprovalId });
      if (remote.status === "cancelled" || remote.status === "canceled") {
        status = "skipped";
      } else if (remote.external_reference !== `${task.organizationId}:${task.change.plan}`) {
        // Local trial/manual access may coexist with a checkout for another paid plan.
        const otherPlan = remote.external_reference?.slice(`${task.organizationId}:`.length);
        if (remote.external_reference?.startsWith(`${task.organizationId}:`) && pricePlanSchema.safeParse(otherPlan).success) {
          status = "skipped";
        } else {
          errorCode = "REFERENCE_MISMATCH";
        }
      } else if (subscription?.mercadoPagoPreapprovalId !== task.preapprovalId) {
        errorCode = "SUBSCRIPTION_CHANGED";
      } else if (!["authorized", "pending", "paused"].includes(remote.status ?? "")) {
        errorCode = "STATUS_UNSUPPORTED";
      } else if (remote.auto_recurring?.currency_id !== "ARS") {
        errorCode = "CURRENCY_MISMATCH";
      } else {
        if (Math.round((remote.auto_recurring.transaction_amount ?? 0) * 100) !== task.change.amountCents) {
          await client.update({ id: task.preapprovalId, requestOptions: { idempotencyKey: task.id }, body: {
            auto_recurring: { transaction_amount: task.change.amountCents / 100, currency_id: "ARS" }
          } });
          const confirmed = await client.get({ id: task.preapprovalId });
          if (
            confirmed.external_reference !== remote.external_reference ||
            confirmed.auto_recurring?.currency_id !== "ARS" ||
            !["authorized", "pending", "paused"].includes(confirmed.status ?? "") ||
            Math.round((confirmed.auto_recurring.transaction_amount ?? 0) * 100) !== task.change.amountCents
          ) {
            errorCode = "AMOUNT_NOT_CONFIRMED";
            retryable = true;
          }
        }
        if (!errorCode) status = "updated";
      }
    } catch (error) {
      // Never persist provider errors: they can include credentials or payer data.
      const providerStatus = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
      retryable = !providerStatus || providerStatus === 408 || providerStatus === 429 || providerStatus >= 500;
      errorCode = retryable ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REJECTED";
    }
    const attempts = task.attempts + 1;
    if (retryable && attempts < 5) status = "pending";
    await tx.billingPriceTask.update({ where: { id: task.id }, data: {
      status, attempts: { increment: 1 }, errorCode,
      nextAttemptAt: new Date(Date.now() + (status === "pending" ? 30_000 * 2 ** (attempts - 1) : 0))
    } });
    if (status === "failed") logger.error("billing price synchronization failed", { taskId: task.id, errorCode });
    return true;
  }, { timeout: 35_000 });
}

export function startPriceSyncWorker() {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  let running: Promise<void> | undefined;
  const tick = () => { running = run(); };
  const run = async () => {
    try {
      await processNextPriceTask();
    } catch {
      logger.error("billing price synchronization interrupted");
    }
    if (!stopped) timer = setTimeout(tick, 1_000);
  };
  timer = setTimeout(tick, 1_000);
  return async () => { stopped = true; clearTimeout(timer); await running; };
}
