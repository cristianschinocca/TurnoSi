import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx, get, update } = vi.hoisted(() => ({
  tx: {
    $queryRaw: vi.fn(),
    billingPlanPrice: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    billingPriceTask: { count: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    billingPriceChange: { create: vi.fn() },
    organizationSubscription: { findUnique: vi.fn(), findMany: vi.fn() }
  },
  get: vi.fn(), update: vi.fn()
}));
vi.mock("../../database/prisma.js", () => ({ prisma: {
  $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)
} }));
vi.mock("../../config/env.js", () => ({ env: { MERCADOPAGO_ACCESS_TOKEN: "test-token" } }));
vi.mock("mercadopago", () => ({
  MercadoPagoConfig: class {},
  PreApproval: class { get = get; update = update; }
}));

import { changeBillingPrice, changePriceSchema, processNextPriceTask, retryPriceChange, startPriceSyncWorker } from "./billing-prices.service.js";

const task = {
  id: "task-1", organizationId: "org-1", preapprovalId: "mp-1", attempts: 0,
  change: { plan: "initial", amountCents: 2_000_000 }
};
const remote = {
  status: "authorized", external_reference: "org-1:initial",
  auto_recurring: { currency_id: "ARS", transaction_amount: 15000 }
};

beforeEach(() => {
  vi.resetAllMocks();
  tx.$queryRaw.mockResolvedValue([{ locked: true }]);
  tx.billingPlanPrice.findUniqueOrThrow.mockResolvedValue({ amountCents: 1_500_000, revision: 0 });
  tx.billingPriceTask.count.mockResolvedValue(0);
  tx.billingPriceTask.findFirst.mockResolvedValue(task);
  tx.organizationSubscription.findUnique.mockResolvedValue({ mercadoPagoPreapprovalId: "mp-1", plan: "trial", source: "manual" });
  tx.organizationSubscription.findMany.mockResolvedValue([{ organizationId: "org-1", mercadoPagoPreapprovalId: "mp-1" }]);
  get.mockResolvedValue(remote);
  update.mockImplementation(async () => {
    get.mockResolvedValue({ ...remote, auto_recurring: { currency_id: "ARS", transaction_amount: 20000 } });
  });
});

describe("billing price changes", () => {
  it.each([0, -1, 10.5, 100_000_001, NaN])("rejects invalid amount %s", (amountCents) => {
    expect(changePriceSchema.safeParse({ amountCents, revision: 0 }).success).toBe(false);
  });

  it("rejects stale prices and unresolved changes before changing anything", async () => {
    await expect(changeBillingPrice("initial", { amountCents: 2_000_000, revision: 1 }, "admin@example.test"))
      .rejects.toMatchObject({ code: "PRICE_CHANGED" });
    tx.billingPriceTask.count.mockResolvedValue(1);
    await expect(changeBillingPrice("initial", { amountCents: 2_000_000, revision: 0 }, "admin@example.test"))
      .rejects.toMatchObject({ code: "PRICE_SYNC_PENDING" });
    expect(tx.billingPlanPrice.update).not.toHaveBeenCalled();
  });

  it("saves the new price, audit data and durable work in the transaction", async () => {
    await changeBillingPrice("initial", { amountCents: 2_000_000, revision: 0 }, "admin@example.test");
    expect(tx.billingPlanPrice.update).toHaveBeenCalledWith({
      where: { plan: "initial" }, data: { amountCents: 2_000_000, revision: { increment: 1 } }
    });
    expect(tx.billingPriceChange.create).toHaveBeenCalledWith({ data: {
      plan: "initial", previousCents: 1_500_000, amountCents: 2_000_000, revision: 1,
      changedBy: "admin@example.test", tasks: { create: [{ organizationId: "org-1", preapprovalId: "mp-1" }] }
    } });
  });

  it("updates the remote paid plan even when local access is still trial/manual", async () => {
    await processNextPriceTask();
    expect(update).toHaveBeenCalledWith({ id: "mp-1", requestOptions: { idempotencyKey: "task-1" }, body: {
      auto_recurring: { transaction_amount: 20000, currency_id: "ARS" }
    } });
    expect(get).toHaveBeenCalledTimes(2);
    expect(tx.billingPriceTask.update).toHaveBeenCalledWith({ where: { id: "task-1" }, data: expect.objectContaining({
      status: "updated", attempts: { increment: 1 }, errorCode: null
    }) });
  });

  it("does not repeat an update already applied before a crash", async () => {
    get.mockResolvedValue({ ...remote, auto_recurring: { currency_id: "ARS", transaction_amount: 20000 } });
    await processNextPriceTask();
    expect(update).not.toHaveBeenCalled();
    expect(tx.billingPriceTask.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "updated" }) }));
  });

  it.each([
    { ...remote, status: "cancelled" },
    { ...remote, external_reference: "org-1:professional" }
  ])("skips cancelled subscriptions and other plans", async (subscription) => {
    get.mockResolvedValue(subscription);
    await processNextPriceTask();
    expect(update).not.toHaveBeenCalled();
    expect(tx.billingPriceTask.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "skipped" }) }));
  });

  it("does not touch another organization's agreement", async () => {
    get.mockResolvedValue({ ...remote, external_reference: "another-org:initial" });
    await processNextPriceTask();
    expect(update).not.toHaveBeenCalled();
    expect(tx.billingPriceTask.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) }));
  });

  it("flags replaced or deleted local agreements for review instead of claiming completion", async () => {
    tx.organizationSubscription.findUnique.mockResolvedValue(null);
    await processNextPriceTask();
    expect(get).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    expect(tx.billingPriceTask.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: "failed", errorCode: "SUBSCRIPTION_CHANGED"
    }) }));
  });

  it("records provider failures without exposing the error and only retries failed work", async () => {
    update.mockRejectedValue({ status: 400, message: "secret provider details" });
    await processNextPriceTask();
    expect(tx.billingPriceTask.update).toHaveBeenCalledWith({ where: { id: "task-1" }, data: expect.objectContaining({
      status: "failed", attempts: { increment: 1 }, errorCode: "PROVIDER_REJECTED"
    }) });
    await retryPriceChange("initial");
    expect(tx.billingPriceTask.updateMany).toHaveBeenCalledWith({
      where: { change: { plan: "initial" }, status: "failed" },
      data: { status: "pending", attempts: 0, errorCode: null, nextAttemptAt: expect.any(Date) }
    });
  });

  it("allows resolving a detached agreement by confirming cancellation at Mercado Pago", async () => {
    tx.organizationSubscription.findUnique.mockResolvedValue(null);
    get.mockResolvedValue({ ...remote, status: "cancelled" });
    await processNextPriceTask();
    expect(update).not.toHaveBeenCalled();
    expect(tx.billingPriceTask.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "skipped" }) }));
  });

  it("does not run concurrently with another worker", async () => {
    tx.$queryRaw.mockResolvedValue([{ locked: false }]);
    expect(await processNextPriceTask()).toBe(false);
    expect(tx.billingPriceTask.findFirst).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it.each([429, 500, 503, 0])("retries temporary provider failures (%s) with a durable delay", async (status) => {
    get.mockRejectedValue({ status });
    const before = Date.now();
    await processNextPriceTask();
    const data = tx.billingPriceTask.update.mock.calls[0][0].data;
    expect(data.status).toBe("pending");
    expect(data.errorCode).toBe("PROVIDER_UNAVAILABLE");
    expect(data.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 30_000);
  });

  it("stops automatic retries after five attempts", async () => {
    tx.billingPriceTask.findFirst.mockResolvedValue({ ...task, attempts: 4 });
    get.mockRejectedValue({ status: 503 });
    await processNextPriceTask();
    expect(tx.billingPriceTask.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) }));
  });

  it("does not report success when a successful PUT fails read-back verification", async () => {
    update.mockResolvedValue({});
    await processNextPriceTask();
    expect(tx.billingPriceTask.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: "pending", errorCode: "AMOUNT_NOT_CONFIRMED"
    }) }));
  });

  it("recovers an ambiguous timeout by reading the amount before another PUT", async () => {
    update.mockRejectedValue(new Error("timeout"));
    await processNextPriceTask();
    get.mockResolvedValue({ ...remote, auto_recurring: { currency_id: "ARS", transaction_amount: 20000 } });
    await processNextPriceTask();
    expect(update).toHaveBeenCalledTimes(1);
    expect(tx.billingPriceTask.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "updated" }) }));
  });

  it("drains in-flight work before stopping and does not schedule another task", async () => {
    vi.useFakeTimers();
    let release!: (value: unknown) => void;
    get.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const stop = startPriceSyncWorker();
    try {
      await vi.advanceTimersByTimeAsync(1000);
      let drained = false;
      const stopping = stop().then(() => { drained = true; });
      await Promise.resolve();
      expect(drained).toBe(false);
      release({ ...remote, auto_recurring: { currency_id: "ARS", transaction_amount: 20000 } });
      await stopping;
      await vi.advanceTimersByTimeAsync(5000);
      expect(tx.billingPriceTask.findFirst).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
