import { Router } from "express";
import {
  Invoice,
  InvalidWebhookSignatureError,
  MercadoPagoConfig,
  Payment,
  PreApproval,
  WebhookSignatureValidator
} from "mercadopago";

import { env } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../lib/app-error.js";
import { ok } from "../../lib/http.js";
import { requireEditor } from "../../lib/membership.js";
import { paidBillingPlans } from "./billing.plans.js";
import { createSubscriptionSchema } from "./billing.schemas.js";
import { billingRequestOptions, lockBillingPrices } from "./billing-prices.service.js";

export const billingRouter = Router();
export const billingPublicRouter = Router();

const plans = paidBillingPlans;
const failedPaymentGraceMs = 3 * 24 * 60 * 60 * 1000;

type MercadoPagoSubscription = {
  id?: string;
  status?: string;
  external_reference?: string | null;
  payer_email?: string | null;
  next_payment_date?: string | null;
  date_created?: string | null;
};

type MercadoPagoInvoice = {
  id?: string;
  external_reference?: string | null;
  preapproval_id?: string | null;
  debit_date?: string | null;
  transaction_amount?: number | null;
  currency_id?: string | null;
  payment?: {
    id?: string | number;
    status?: string;
    status_detail?: string;
  } | null;
};

function mercadoPagoConfig() {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) {
    throw new AppError(
      503,
      "BILLING_NOT_CONFIGURED",
      "Mercado Pago is not configured"
    );
  }
  return new MercadoPagoConfig({ accessToken: env.MERCADOPAGO_ACCESS_TOKEN, options: billingRequestOptions });
}

function mercadoPagoClient() {
  return new PreApproval(mercadoPagoConfig());
}

function mercadoPagoPaymentClient() {
  return new Payment(mercadoPagoConfig());
}

function mercadoPagoInvoiceClient() {
  return new Invoice(mercadoPagoConfig());
}

function normalizeStatus(status?: string) {
  if (status === "authorized") return "authorized" as const;
  if (status === "paused") return "paused" as const;
  if (status === "cancelled" || status === "canceled") return "canceled" as const;
  return "pending" as const;
}

function planFromExternalReference(reference?: string | null) {
  const [, plan] = (reference ?? "").split(":");
  return plan in plans ? (plan as keyof typeof plans) : null;
}

function organizationFromExternalReference(reference?: string | null) {
  return (reference ?? "").split(":")[0] || null;
}

function normalizePaymentStatus(status?: string) {
  if (status === "approved") return "approved" as const;
  if (status === "rejected") return "rejected" as const;
  if (status === "cancelled" || status === "canceled") return "cancelled" as const;
  if (status === "refunded") return "refunded" as const;
  if (status === "charged_back") return "charged_back" as const;
  if (status === "pending" || status === "in_process" || status === "authorized") {
    return "pending" as const;
  }
  return "unknown" as const;
}

function paymentStatusNeedsGrace(status: ReturnType<typeof normalizePaymentStatus>) {
  return (
    status === "rejected" ||
    status === "cancelled" ||
    status === "refunded" ||
    status === "charged_back"
  );
}

function amountToCents(amount?: number | null) {
  return typeof amount === "number" ? Math.round(amount * 100) : null;
}

async function findAuthorizedMercadoPagoSubscription(organizationId: string) {
  const result = await mercadoPagoClient().search({ options: { limit: 50 } });
  const subscriptions = (result.results ?? []) as MercadoPagoSubscription[];

  return (
    subscriptions
      .filter(
        (subscription) =>
          subscription.status === "authorized" &&
          subscription.external_reference?.startsWith(`${organizationId}:`) &&
          planFromExternalReference(subscription.external_reference)
      )
      .sort(
        (first, second) =>
          new Date(second.date_created ?? 0).getTime() -
          new Date(first.date_created ?? 0).getTime()
      )[0] ?? null
  );
}

async function findInvoiceByPayment(paymentId: string) {
  const result = await mercadoPagoInvoiceClient().search({
    options: { payment_id: Number(paymentId), limit: 1 }
  });
  return (result.results?.[0] ?? null) as MercadoPagoInvoice | null;
}

async function syncSubscriptionPayment(
  paymentId: string,
  knownInvoice?: MercadoPagoInvoice | null
) {
  const payment = await mercadoPagoPaymentClient().get({ id: paymentId });
  const invoice = knownInvoice ?? (await findInvoiceByPayment(paymentId));
  const reference = invoice?.external_reference ?? payment.external_reference;
  const organizationId = organizationFromExternalReference(reference);
  const plan = planFromExternalReference(reference);
  const preapprovalId =
    invoice?.preapproval_id ??
    (typeof payment.metadata?.preapproval_id === "string"
      ? payment.metadata.preapproval_id
      : null);

  const subscription = organizationId
    ? await prisma.organizationSubscription.findUnique({ where: { organizationId } })
    : preapprovalId
      ? await prisma.organizationSubscription.findUnique({
          where: { mercadoPagoPreapprovalId: preapprovalId }
        })
      : null;

  if (!subscription) return;

  const status = normalizePaymentStatus(payment.status ?? invoice?.payment?.status);
  const now = new Date();
  const graceEndsAt = paymentStatusNeedsGrace(status)
    ? subscription.paymentGraceEndsAt ?? new Date(now.getTime() + failedPaymentGraceMs)
    : null;

  await prisma.$transaction([
    prisma.organizationSubscriptionPayment.upsert({
      where: { mercadoPagoPaymentId: paymentId },
      create: {
        organizationId: subscription.organizationId,
        subscriptionId: subscription.id,
        mercadoPagoPaymentId: paymentId,
        mercadoPagoInvoiceId: invoice?.id ?? null,
        mercadoPagoPreapprovalId: preapprovalId ?? subscription.mercadoPagoPreapprovalId,
        status,
        statusDetail: payment.status_detail ?? invoice?.payment?.status_detail ?? null,
        amountCents: amountToCents(payment.transaction_amount ?? invoice?.transaction_amount),
        currencyId: payment.currency_id ?? invoice?.currency_id ?? null,
        paidAt: payment.date_approved ? new Date(payment.date_approved) : null,
        dueAt: invoice?.debit_date ? new Date(invoice.debit_date) : null,
        raw: payment as object
      },
      update: {
        subscriptionId: subscription.id,
        mercadoPagoInvoiceId: invoice?.id ?? undefined,
        mercadoPagoPreapprovalId: preapprovalId ?? subscription.mercadoPagoPreapprovalId,
        status,
        statusDetail: payment.status_detail ?? invoice?.payment?.status_detail ?? null,
        amountCents: amountToCents(payment.transaction_amount ?? invoice?.transaction_amount),
        currencyId: payment.currency_id ?? invoice?.currency_id ?? null,
        paidAt: payment.date_approved ? new Date(payment.date_approved) : null,
        dueAt: invoice?.debit_date ? new Date(invoice.debit_date) : null,
        raw: payment as object
      }
    }),
    prisma.organizationSubscription.update({
      where: { id: subscription.id },
      data: {
        ...(plan ? { plan } : {}),
        lastPaymentStatus: status,
        paymentGraceEndsAt: status === "approved" ? null : graceEndsAt,
        ...(status === "approved"
          ? { source: "mercadopago" as const, status: "authorized" as const, trialEndsAt: null }
          : {})
      }
    })
  ]);
}

async function syncSubscriptionInvoice(invoiceId: string) {
  const invoice = (await mercadoPagoInvoiceClient().get({
    id: invoiceId
  })) as MercadoPagoInvoice;
  const paymentId = invoice.payment?.id ? String(invoice.payment.id) : "";
  if (!paymentId) return;
  await syncSubscriptionPayment(paymentId, invoice);
}

async function syncRecentSubscriptionPayments(preapprovalId: string) {
  const result = await mercadoPagoInvoiceClient().search({
    options: { preapproval_id: preapprovalId, limit: 5 }
  });
  for (const invoice of (result.results ?? []) as MercadoPagoInvoice[]) {
    const paymentId = invoice.payment?.id ? String(invoice.payment.id) : "";
    if (paymentId) await syncSubscriptionPayment(paymentId, invoice);
  }
}

billingRouter.get("/subscription", async (request, response) => {
  let subscription = await prisma.organizationSubscription.findUnique({
    where: { organizationId: request.tenant!.organizationId }
  });
  if (
    subscription?.plan === "trial" &&
    subscription.status === "authorized" &&
    subscription.trialEndsAt &&
    subscription.trialEndsAt <= new Date()
  ) {
    subscription = await prisma.organizationSubscription.update({
      where: { id: subscription.id },
      data: { status: "canceled" }
    });
  }
  if (subscription?.mercadoPagoPreapprovalId && env.MERCADOPAGO_ACCESS_TOKEN) {
    try {
      const remote = await mercadoPagoClient().get({
        id: subscription.mercadoPagoPreapprovalId
      });
      const authorizedRemote =
        normalizeStatus(remote.status) === "authorized"
          ? remote
          : await findAuthorizedMercadoPagoSubscription(
              request.tenant!.organizationId
            );
      const remoteSubscription = authorizedRemote ?? remote;
      const remoteStatus = normalizeStatus(remoteSubscription.status);
      const remotePlan = planFromExternalReference(
        remoteSubscription.external_reference
      );
      const keepActiveTrial =
        subscription.plan === "trial" &&
        subscription.status === "authorized" &&
        remoteStatus !== "authorized";
      const keepManualAccess =
        subscription.status === "authorized" &&
        subscription.plan !== "trial" &&
        subscription.source === "manual" &&
        remoteStatus !== "authorized";

      subscription = await prisma.organizationSubscription.update({
        where: { id: subscription.id },
        data: {
          ...(keepActiveTrial || keepManualAccess
            ? {}
            : {
                source: "mercadopago",
                status: remoteStatus,
                ...(remotePlan ? { plan: remotePlan } : {}),
                ...(remoteStatus === "authorized" ? { trialEndsAt: null } : {})
              }),
          ...(remoteSubscription.id
            ? { mercadoPagoPreapprovalId: remoteSubscription.id }
            : {}),
          ...(remoteSubscription.payer_email
            ? { payerEmail: remoteSubscription.payer_email }
            : {}),
          nextPaymentAt: remoteSubscription.next_payment_date
            ? new Date(remoteSubscription.next_payment_date)
            : null
        }
      });
      if (remoteSubscription.id) {
        await syncRecentSubscriptionPayments(remoteSubscription.id);
        subscription = await prisma.organizationSubscription.findUnique({
          where: { organizationId: request.tenant!.organizationId }
        });
      }
    } catch {
      // Return the last webhook-backed state if Mercado Pago is temporarily unavailable.
    }
  }
  response.json(ok(subscription));
});

billingRouter.post("/trial", async (request, response) => {
  const tenant = request.tenant!;
  requireEditor(tenant.role);
  const existing = await prisma.organizationSubscription.findUnique({
    where: { organizationId: tenant.organizationId }
  });

  if (existing?.trialStartedAt) {
    throw new AppError(
      409,
      "TRIAL_ALREADY_USED",
      "Organization already used its free trial"
    );
  }
  if (existing?.status === "authorized") {
    throw new AppError(
      409,
      "SUBSCRIPTION_ALREADY_ACTIVE",
      "Organization already has an active subscription"
    );
  }

  const trialStartedAt = new Date();
  const trialEndsAt = new Date(trialStartedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  await prisma.organizationSubscription.upsert({
    where: { organizationId: tenant.organizationId },
    create: {
      organizationId: tenant.organizationId,
      plan: "trial",
      status: "authorized",
      trialStartedAt,
      trialEndsAt
    },
    update: {
      plan: "trial",
      status: "authorized",
      mercadoPagoPreapprovalId: null,
      payerEmail: null,
      nextPaymentAt: null,
      trialStartedAt,
      trialEndsAt
    }
  });

  response.status(201).json(ok({ trialEndsAt }));
});

billingRouter.post("/subscription", async (request, response) => {
  const tenant = request.tenant!;
  requireEditor(tenant.role);
  const { plan, payerEmail } = createSubscriptionSchema.parse(request.body);
  const user = await prisma.user.findUnique({
    where: { id: request.auth!.sub },
    select: { email: true }
  });
  if (!user) throw new AppError(404, "NOT_FOUND", "User not found");
  const billingEmail =
    env.MERCADOPAGO_TEST_PAYER_EMAIL ??
    payerEmail?.toLowerCase() ??
    user.email;

  const checkoutUrl = await prisma.$transaction(async (tx) => {
    await lockBillingPrices(tx);
    const existing = await tx.organizationSubscription.findUnique({
      where: { organizationId: tenant.organizationId }
    });
    const activeExisting =
      existing &&
      existing.status === "authorized" &&
      existing.plan !== "trial" &&
      Boolean(existing.mercadoPagoPreapprovalId);
    if (activeExisting) {
      throw new AppError(409, "SUBSCRIPTION_ALREADY_ACTIVE", "Organization already has an active subscription");
    }
    const price = await tx.billingPlanPrice.findUniqueOrThrow({ where: { plan } });
    const subscription = await mercadoPagoClient().create({
      body: {
        reason: plans[plan].mercadoPagoName,
        external_reference: `${tenant.organizationId}:${plan}`,
        payer_email: billingEmail,
        back_url: `${env.WEB_ORIGIN.split(",")[0]}/dashboard?subscription=return`,
        status: "pending",
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: price.amountCents / 100,
          currency_id: "ARS"
        }
      }
    });
    if (!subscription.id || !subscription.init_point) {
      throw new AppError(502, "PAYMENT_PROVIDER_ERROR", "Mercado Pago did not return a checkout URL");
    }
    const keepCurrentAccess =
      existing?.status === "authorized" &&
      (existing.plan === "trial" || existing.source === "manual");
    await tx.organizationSubscription.upsert({
      where: { organizationId: tenant.organizationId },
      create: {
        organizationId: tenant.organizationId,
        plan,
        status: normalizeStatus(subscription.status),
        mercadoPagoPreapprovalId: subscription.id,
        payerEmail: billingEmail,
        nextPaymentAt: subscription.next_payment_date ? new Date(subscription.next_payment_date) : null
      },
      update: {
        ...(keepCurrentAccess ? {} : {
          plan,
          status: normalizeStatus(subscription.status),
          trialEndsAt: null
        }),
        mercadoPagoPreapprovalId: subscription.id,
        payerEmail: billingEmail,
        nextPaymentAt: subscription.next_payment_date ? new Date(subscription.next_payment_date) : null
      }
    });
    return subscription.init_point;
  }, { timeout: 25_000 });
  response.status(201).json(ok({ checkoutUrl }));
});

billingPublicRouter.post("/mercadopago", async (request, response) => {
  if (!env.MERCADOPAGO_WEBHOOK_SECRET) {
    throw new AppError(503, "BILLING_NOT_CONFIGURED", "Webhook is not configured");
  }

  const dataId =
    String(request.query["data.id"] ?? "") ||
    String((request.body as { data?: { id?: string } }).data?.id ?? "");
  try {
    WebhookSignatureValidator.validate({
      xSignature: request.headers["x-signature"],
      xRequestId: request.headers["x-request-id"],
      dataId,
      secret: env.MERCADOPAGO_WEBHOOK_SECRET,
      toleranceSeconds: 300
    });
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      response.sendStatus(401);
      return;
    }
    throw error;
  }

  const type = String(request.query.type ?? request.body?.type ?? "");
  if (!dataId) {
    response.sendStatus(200);
    return;
  }

  if (type === "payment") {
    await syncSubscriptionPayment(dataId);
    response.sendStatus(200);
    return;
  }

  if (type === "subscription_authorized_payment") {
    await syncSubscriptionInvoice(dataId);
    response.sendStatus(200);
    return;
  }

  if (type !== "subscription_preapproval") {
    response.sendStatus(200);
    return;
  }

  const subscription = await mercadoPagoClient().get({ id: dataId });
  const [organizationId, plan] = (subscription.external_reference ?? "").split(":");
  if (!organizationId || !(plan in plans)) {
    response.sendStatus(200);
    return;
  }

  const status = normalizeStatus(subscription.status);
  const existing = await prisma.organizationSubscription.findUnique({
    where: { organizationId }
  });
  if (
    existing?.plan === "trial" &&
    existing.status === "authorized" &&
    status !== "authorized"
  ) {
    response.sendStatus(200);
    return;
  }
  if (
    existing?.status === "authorized" &&
    existing.plan !== "trial" &&
    existing.source === "manual" &&
    status !== "authorized"
  ) {
    response.sendStatus(200);
    return;
  }

  await prisma.organizationSubscription.upsert({
    where: { organizationId },
    create: {
      organizationId,
      plan: plan as keyof typeof plans,
      status,
      source: "mercadopago",
      mercadoPagoPreapprovalId: dataId,
      payerEmail: subscription.payer_email,
      nextPaymentAt: subscription.next_payment_date
        ? new Date(subscription.next_payment_date)
        : null,
      lastWebhookAt: new Date()
    },
    update: {
      source: "mercadopago",
      plan: plan as keyof typeof plans,
      status,
      ...(status === "authorized" ? { trialEndsAt: null } : {}),
      ...(subscription.payer_email
        ? { payerEmail: subscription.payer_email }
        : {}),
      nextPaymentAt: subscription.next_payment_date
        ? new Date(subscription.next_payment_date)
        : null,
      lastWebhookAt: new Date()
    }
  });

  response.sendStatus(200);
});
