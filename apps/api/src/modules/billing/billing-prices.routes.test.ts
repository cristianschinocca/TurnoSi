import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(), save: vi.fn(), price: vi.fn(),
  change: vi.fn(), list: vi.fn(), retry: vi.fn(), lock: vi.fn()
}));
vi.mock("../../config/env.js", () => ({ env: {
  NODE_ENV: "test", AUTH_SECRET: "test-secret", SUPERADMIN_EMAIL: "admin@example.test",
  SUPERADMIN_PASSWORD_HASH: "test-hash", MERCADOPAGO_ACCESS_TOKEN: "test-token", WEB_ORIGIN: "https://example.test"
} }));
vi.mock("../../database/prisma.js", () => ({ prisma: {
  user: { findUnique: vi.fn(async () => ({ email: "payer@example.test" })) },
  $transaction: async (callback: (tx: unknown) => unknown) => callback({
    billingPlanPrice: { findUniqueOrThrow: mocks.price },
    organizationSubscription: { findUnique: vi.fn(async () => null), upsert: mocks.save }
  })
} }));
vi.mock("mercadopago", () => ({
  MercadoPagoConfig: class {}, PreApproval: class { create = mocks.create; },
  Invoice: class {}, Payment: class {}, InvalidWebhookSignatureError: class extends Error {},
  WebhookSignatureValidator: {}
}));
vi.mock("./billing-prices.service.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./billing-prices.service.js")>(),
  changeBillingPrice: mocks.change, getPriceChanges: mocks.list,
  retryPriceChange: mocks.retry, lockBillingPrices: mocks.lock
}));

import { superadminRouter } from "../superadmin/superadmin.routes.js";
import { billingRouter } from "./billing.routes.js";
import { errorHandler } from "../../middlewares/error-handler.js";
import { resetRateLimitsForTests } from "../../middlewares/rate-limit.js";

const app = express();
app.use(express.json());
app.use("/superadmin", superadminRouter);
app.use((req, _res, next) => {
  req.tenant = { organizationId: "org-1", userId: "user-1", role: "owner", timezone: "America/Argentina/Buenos_Aires" };
  req.auth = { sub: "user-1" } as NonNullable<typeof req.auth>;
  next();
});
app.use("/billing", billingRouter);
app.use(errorHandler);

function adminCookie() {
  const payload = Buffer.from(JSON.stringify({ scope: "superadmin", email: "admin@example.test", exp: Math.floor(Date.now() / 1000) + 60 })).toString("base64url");
  const signature = createHmac("sha256", "test-secret").update(payload).digest("base64url");
  return `superadmin_token=${payload}.${signature}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitsForTests();
  mocks.list.mockResolvedValue([]);
  mocks.price.mockResolvedValue({ amountCents: 2_345_678 });
  mocks.create.mockResolvedValue({ id: "mp-1", init_point: "https://example.test/checkout", status: "pending" });
});

describe("billing price HTTP boundaries", () => {
  it("requires superadmin authentication for read, write and retry", async () => {
    await request(app).get("/superadmin/prices").expect(401);
    await request(app).patch("/superadmin/prices/initial").send({ amountCents: 2000000, revision: 0 }).expect(401);
    await request(app).post("/superadmin/prices/initial/retry").expect(401);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.change).not.toHaveBeenCalled();
    expect(mocks.retry).not.toHaveBeenCalled();
  });

  it("validates plan, amount and revision on the backend", async () => {
    for (const [plan, body] of [
      ["trial", { amountCents: 2000000, revision: 0 }],
      ["initial", { amountCents: -1, revision: 0 }],
      ["initial", { amountCents: 2000000 }]
    ] as const) {
      await request(app).patch(`/superadmin/prices/${plan}`).set("Cookie", adminCookie()).send(body).expect(400);
    }
    expect(mocks.change).not.toHaveBeenCalled();
  });

  it("uses the authenticated admin identity for the price audit", async () => {
    await request(app).patch("/superadmin/prices/initial").set("Cookie", adminCookie())
      .send({ amountCents: 2000000, revision: 0 }).expect(200);
    expect(mocks.change).toHaveBeenCalledWith("initial", { amountCents: 2000000, revision: 0 }, "admin@example.test");
  });

  it("new checkouts use persisted cents, under the same price lock", async () => {
    await request(app).post("/billing/subscription").send({ plan: "initial", payerEmail: "payer@example.test" }).expect(201);
    expect(mocks.lock).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({
      auto_recurring: expect.objectContaining({ transaction_amount: 23456.78, currency_id: "ARS" })
    }) }));
    expect(mocks.save).toHaveBeenCalledOnce();
  });
});
