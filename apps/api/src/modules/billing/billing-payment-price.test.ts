import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  payment: vi.fn(), invoice: vi.fn(), subscription: vi.fn(),
  savePayment: vi.fn(), saveSubscription: vi.fn(), price: vi.fn()
}));

vi.mock("../../config/env.js", () => ({ env: {
  MERCADOPAGO_ACCESS_TOKEN: "test-only", MERCADOPAGO_WEBHOOK_SECRET: "test-only"
} }));
vi.mock("../../database/prisma.js", () => ({ prisma: {
  organizationSubscription: { findUnique: mocks.subscription, update: mocks.saveSubscription },
  organizationSubscriptionPayment: { upsert: mocks.savePayment },
  billingPlanPrice: { findUniqueOrThrow: mocks.price },
  $transaction: (operations: Promise<unknown>[]) => Promise.all(operations)
} }));
vi.mock("mercadopago", () => ({
  MercadoPagoConfig: class {}, PreApproval: class {},
  Payment: class { get = mocks.payment; },
  Invoice: class { search = mocks.invoice; },
  InvalidWebhookSignatureError: class extends Error {},
  WebhookSignatureValidator: { validate: vi.fn() }
}));

import { billingPublicRouter } from "./billing.routes.js";
import { subscriptionGrantsAccess } from "./subscription-access.service.js";

const app = express();
app.use(express.json());
app.use("/webhooks", billingPublicRouter);

const subscription = {
  id: "sub-1", organizationId: "org-1", mercadoPagoPreapprovalId: "mp-1",
  plan: "initial", status: "authorized", trialEndsAt: null,
  lastPaymentStatus: "approved", paymentGraceEndsAt: null
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.subscription.mockResolvedValue(subscription);
  mocks.price.mockResolvedValue({ plan: "initial", amountCents: 2_000_000, revision: 1 });
  mocks.invoice.mockResolvedValue({ results: [{
    id: "invoice-1", external_reference: "org-1:initial", preapproval_id: "mp-1"
  }] });
});

describe("approved payments after a catalog price increase", () => {
  it.each([15000, 20000])("keeps access and records the actual paid amount of %s ARS", async (amount) => {
    mocks.payment.mockResolvedValue({
      id: 123, status: "approved", transaction_amount: amount,
      currency_id: "ARS", external_reference: "org-1:initial",
      date_approved: "2026-09-25T12:00:00Z"
    });

    await request(app).post("/webhooks/mercadopago")
      .send({ type: "payment", data: { id: "123" } }).expect(200);

    expect(mocks.savePayment).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: "approved", amountCents: amount * 100 }),
      update: expect.objectContaining({ status: "approved", amountCents: amount * 100 })
    }));
    expect(mocks.saveSubscription).toHaveBeenCalledExactlyOnceWith({
      where: { id: "sub-1" },
      data: {
        plan: "initial", lastPaymentStatus: "approved", paymentGraceEndsAt: null,
        source: "mercadopago", status: "authorized", trialEndsAt: null
      }
    });
    const saved = { ...subscription, ...mocks.saveSubscription.mock.calls[0][0].data };
    expect(subscriptionGrantsAccess(saved)).toBe(true);
    // An approved historical payment is not re-priced against today's catalog.
    expect(mocks.price).not.toHaveBeenCalled();
  });
});
