import { MercadoPagoConfig, PreApproval } from "mercadopago";
import { env } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";
import { logger } from "../../lib/logger.js";
import { billingRequestOptions } from "./billing-prices.service.js";

const pendingTtlMs = 30 * 60 * 1000;
type RemoteSubscription = {
  id?: string; reason?: string; status?: string; date_created?: string | number;
};

function isExpired(subscription: RemoteSubscription, now: number) {
  return subscription.status === "pending" && Boolean(subscription.date_created) &&
    new Date(subscription.date_created!).getTime() <= now - pendingTtlMs;
}

export async function cleanupPendingSubscriptions(shouldStop = () => false) {
  const counts = { canceled: 0, reconciled: 0, failed: 0 };
  if (!env.MERCADOPAGO_ACCESS_TOKEN) return counts;
  const client = new PreApproval(new MercadoPagoConfig({
    accessToken: env.MERCADOPAGO_ACCESS_TOKEN, options: billingRequestOptions
  }));
  const local = await prisma.organizationSubscription.findMany({
    where: { status: "pending", source: "mercadopago", mercadoPagoPreapprovalId: { not: null } },
    select: { mercadoPagoPreapprovalId: true }
  });
  const candidates = new Set(local.map((item) => item.mercadoPagoPreapprovalId!));
  const now = Date.now();
  // Collect every page before mutations, so changing status/order cannot shift pages.
  // Search remotely too: replaced checkout links may no longer exist in our database.
  for (let offset = 0; !shouldStop();) {
    const page = await client.search({ options: { status: "pending", limit: 100, offset } });
    const results = page.results ?? [];
    for (const subscription of results) {
      if (subscription.id && /^Turnosi\b/i.test(subscription.reason ?? "") && isExpired(subscription, now)) {
        candidates.add(subscription.id);
      }
    }
    offset += results.length;
    if (typeof page.paging?.total === "number" && offset >= page.paging.total) break;
    if (!results.length) {
      if (typeof page.paging?.total === "number") throw new Error("Incomplete subscription search");
      break;
    }
  }
  for (const id of candidates) {
    if (shouldStop()) break;
    try {
      // Never cancel from a stale search result: the buyer may have authorized it.
      let remote = await client.get({ id });
      if (!/^Turnosi\b/i.test(remote.reason ?? "")) continue;
      if (isExpired(remote, Date.now())) {
        await client.update({ id, body: { status: "cancelled" } });
        remote = await client.get({ id });
        if (remote.status !== "cancelled" && remote.status !== "canceled") {
          throw new Error("Cancellation not confirmed");
        }
        counts.canceled++;
      }
      if (remote.status === "cancelled" || remote.status === "canceled") {
        const result = await prisma.organizationSubscription.updateMany({
          where: { mercadoPagoPreapprovalId: id, source: "mercadopago", status: "pending" },
          data: { status: "canceled", nextPaymentAt: null }
        });
        counts.reconciled += result.count;
      }
    } catch {
      counts.failed++;
      // Keep pending state on failures; next sweep retries, including after restart.
      logger.warn("pending subscription cancellation deferred", { preapprovalId: id });
    }
  }
  return counts;
}

export function startPendingSubscriptionsWorker() {
  let stopped = false;
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const run = async () => {
    try {
      const counts = await cleanupPendingSubscriptions(() => stopped);
      if (counts.canceled || counts.reconciled || counts.failed) {
        logger.info("pending subscription cleanup completed", counts);
      }
    } catch { logger.error("pending subscription cleanup interrupted"); }
    if (!stopped) timer = setTimeout(tick, 5 * 60_000);
  };
  const tick = () => { running = run(); };
  timer = setTimeout(tick, 1_000);
  return async () => { stopped = true; clearTimeout(timer); await running; };
}
