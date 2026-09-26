import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ client: null as PrismaClient | null, get: vi.fn(), update: vi.fn() }));
vi.mock("../../database/prisma.js", () => ({ get prisma() { return state.client; } }));
vi.mock("../../config/env.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../config/env.js")>();
  return { env: { ...original.env, MERCADOPAGO_ACCESS_TOKEN: "test-only" } };
});
vi.mock("mercadopago", () => ({
  MercadoPagoConfig: class {}, PreApproval: class { get = state.get; update = state.update; }
}));

import { env } from "../../config/env.js";
import { changeBillingPrice, getPriceChanges, lockBillingPrices, processNextPriceTask } from "./billing-prices.service.js";

// Opt-in: an isolated schema in local PostgreSQL, never live Mercado Pago or tenant tables.
describe.skipIf(process.env.BILLING_DB_TESTS !== "1")("billing prices with PostgreSQL", () => {
  const schema = `billing_price_test_${randomUUID().replaceAll("-", "")}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let remoteAmount: number;
  let created = false;

  beforeAll(async () => {
    const url = new URL(env.DATABASE_URL);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Integration tests require local PostgreSQL");
    admin = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set("schema", schema);
    execFileSync(process.execPath, [createRequire(import.meta.url).resolve("prisma/build/index.js"),
      "db", "push", "--skip-generate", "--schema", "prisma/schema.prisma"
    ], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    state.client = db;
  });

  beforeEach(async () => {
    await db.billingPriceTask.deleteMany();
    await db.billingPriceChange.deleteMany();
    await db.billingPlanPrice.deleteMany();
    await db.organizationSubscription.deleteMany();
    await db.organization.deleteMany();
    await db.organization.create({ data: { id: "test-org", name: "Test", slug: "test-only" } });
    await db.billingPlanPrice.create({ data: { plan: "initial", amountCents: 1500000 } });
    await db.organizationSubscription.create({ data: {
      organizationId: "test-org", plan: "initial", status: "authorized", mercadoPagoPreapprovalId: "test-mp"
    } });
    remoteAmount = 15000;
    state.get.mockReset().mockImplementation(async () => ({
      status: "authorized", external_reference: "test-org:initial",
      auto_recurring: { transaction_amount: remoteAmount, currency_id: "ARS" }
    }));
    state.update.mockReset().mockImplementation(async ({ body }) => { remoteAmount = body.auto_recurring.transaction_amount; });
  });

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  it("allows only one concurrent change of the same revision", async () => {
    const results = await Promise.allSettled([
      changeBillingPrice("initial", { amountCents: 2000000, revision: 0 }, "first@test.invalid"),
      changeBillingPrice("initial", { amountCents: 2100000, revision: 0 }, "second@test.invalid")
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.billingPriceChange.count()).toBe(1);
    expect(await db.billingPriceTask.count()).toBe(1);
    await processNextPriceTask();
    const [price] = await getPriceChanges();
    expect(price.change).toMatchObject({ pending: 0, failed: 0, updated: 1 });
    expect(remoteAmount * 100).toBe(price.amountCents);
  });

  it("rolls back the catalog when saving the audit/queue fails", async () => {
    await db.$executeRawUnsafe(`ALTER TABLE "BillingPriceChange" ADD CONSTRAINT reject_test_price CHECK ("amountCents" <> 2100000)`);
    try {
      await expect(changeBillingPrice("initial", { amountCents: 2100000, revision: 0 }, "admin@test.invalid")).rejects.toThrow();
      expect(await db.billingPlanPrice.findUnique({ where: { plan: "initial" } })).toMatchObject({ amountCents: 1500000, revision: 0 });
      expect(await db.billingPriceTask.count()).toBe(0);
    } finally {
      await db.$executeRawUnsafe(`ALTER TABLE "BillingPriceChange" DROP CONSTRAINT reject_test_price`);
    }
  });

  it("serializes workers without blocking checkout's price lock", async () => {
    await changeBillingPrice("initial", { amountCents: 2000000, revision: 0 }, "admin@test.invalid");
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const released = new Promise<void>((resolve) => { release = resolve; });
    state.update.mockImplementationOnce(async () => { enter(); await released; remoteAmount = 20000; });
    const first = processNextPriceTask();
    await entered;
    try {
      expect(await processNextPriceTask()).toBe(false);
      await db.$transaction(async (tx) => { await lockBillingPrices(tx); }, { timeout: 2000 });
    } finally {
      release();
      await first;
    }
    expect(state.update).toHaveBeenCalledTimes(1);
  });

  it("recovers after a remote success followed by a database rollback", async () => {
    await changeBillingPrice("initial", { amountCents: 2000000, revision: 0 }, "admin@test.invalid");
    await db.$executeRawUnsafe(`ALTER TABLE "BillingPriceTask" ADD CONSTRAINT reject_test_completion CHECK ("status" <> 'updated')`);
    try {
      await expect(processNextPriceTask()).rejects.toThrow();
      expect(remoteAmount).toBe(20000);
      expect(await db.billingPriceTask.findFirst()).toMatchObject({ status: "pending", attempts: 0 });
    } finally {
      await db.$executeRawUnsafe(`ALTER TABLE "BillingPriceTask" DROP CONSTRAINT reject_test_completion`);
    }
    await processNextPriceTask();
    expect(state.update).toHaveBeenCalledTimes(1);
    expect(await db.billingPriceTask.findFirst()).toMatchObject({ status: "updated" });
  });
});
