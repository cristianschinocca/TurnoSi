import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ search: vi.fn(), get: vi.fn(), update: vi.fn(), local: vi.fn(), save: vi.fn() }));
vi.mock("../../config/env.js", () => ({ env: { MERCADOPAGO_ACCESS_TOKEN: "test-only" } }));
vi.mock("../../database/prisma.js", () => ({ prisma: {
  organizationSubscription: { findMany: mocks.local, updateMany: mocks.save }
} }));
vi.mock("mercadopago", () => ({
  MercadoPagoConfig: class {}, PreApproval: class { search = mocks.search; get = mocks.get; update = mocks.update; }
}));
import { cleanupPendingSubscriptions, startPendingSubscriptionsWorker } from "./pending-subscriptions.service.js";

const now = new Date("2026-09-28T18:00:00Z");
const expired = { id: "old", reason: "Turnosi Inicial", status: "pending", date_created: "2026-09-28T17:00:00Z" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  mocks.local.mockResolvedValue([]);
  mocks.save.mockResolvedValue({ count: 1 });
  mocks.search.mockResolvedValue({ paging: { total: 1 }, results: [expired] });
  mocks.get.mockResolvedValue(expired);
  mocks.update.mockImplementation(async () => {
    mocks.get.mockResolvedValue({ ...expired, status: "cancelled" });
  });
});
afterEach(() => vi.useRealTimers());

describe("pending subscription expiration", () => {
  it("cancels remote checkouts before updating only the matching local pending subscription", async () => {
    expect(await cleanupPendingSubscriptions()).toEqual({ canceled: 1, reconciled: 1, failed: 0 });
    expect(mocks.update).toHaveBeenCalledWith({ id: "old", body: { status: "cancelled" } });
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({
      where: { mercadoPagoPreapprovalId: "old", source: "mercadopago", status: "pending" },
      data: { status: "canceled", nextPaymentAt: null }
    });
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("collects all pages before canceling, including unlinked checkouts", async () => {
    mocks.search.mockResolvedValueOnce({ paging: { total: 101 }, results: Array.from({ length: 100 }, (_, i) => ({
      id: String(i), reason: "Turnosi Inicial", status: "pending", date_created: now.toISOString()
    })) }).mockResolvedValueOnce({ paging: { total: 101 }, results: [expired] });
    await cleanupPendingSubscriptions();
    expect(mocks.search).toHaveBeenNthCalledWith(1, { options: { status: "pending", limit: 100, offset: 0 } });
    expect(mocks.search).toHaveBeenNthCalledWith(2, { options: { status: "pending", limit: 100, offset: 100 } });
    expect(mocks.search.mock.invocationCallOrder[1]).toBeLessThan(mocks.update.mock.invocationCallOrder[0]);
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it.each([
    { ...expired, date_created: "2026-09-28T17:31:00Z" },
    { ...expired, date_created: "invalid" },
    { ...expired, date_created: undefined },
    { ...expired, status: "authorized" },
    { ...expired, status: "paused" },
    { ...expired, reason: "Another application" }
  ])("does not expire recent, invalid, authorized, paused or unrelated subscriptions", async (remote) => {
    mocks.search.mockResolvedValue({ paging: { total: 1 }, results: [remote] });
    await cleanupPendingSubscriptions();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("does not cancel a checkout authorized after the search", async () => {
    mocks.get.mockResolvedValue({ ...expired, status: "authorized" });
    await cleanupPendingSubscriptions();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("keeps local state on provider failure and retries on the next sweep", async () => {
    mocks.update.mockRejectedValueOnce(new Error("provider unavailable"));
    expect((await cleanupPendingSubscriptions()).failed).toBe(1);
    expect(mocks.save).not.toHaveBeenCalled();
    expect((await cleanupPendingSubscriptions()).canceled).toBe(1);
  });

  it("does not report cancellation until confirmed by a fresh read", async () => {
    mocks.update.mockResolvedValue({ status: "cancelled" });
    expect((await cleanupPendingSubscriptions()).failed).toBe(1);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("reconciles a previous remote success after a crash without repeating cancellation", async () => {
    mocks.local.mockResolvedValue([{ mercadoPagoPreapprovalId: "old" }]);
    mocks.search.mockResolvedValue({ paging: { total: 0 }, results: [] });
    mocks.get.mockResolvedValue({ ...expired, status: "cancelled" });
    expect((await cleanupPendingSubscriptions()).reconciled).toBe(1);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("uses remote creation time even when the local checkout was just refreshed", async () => {
    mocks.local.mockResolvedValue([{ mercadoPagoPreapprovalId: "old", updatedAt: now }]);
    expect((await cleanupPendingSubscriptions()).canceled).toBe(1);
  });

  it("starts automatically, waits five minutes between sweeps, and stops on shutdown", async () => {
    mocks.search.mockResolvedValue({ paging: { total: 0 }, results: [] });
    const stop = startPendingSubscriptionsWorker();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mocks.search).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * 60_000 - 1);
    expect(mocks.search).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.search).toHaveBeenCalledTimes(2);
    await stop();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(mocks.search).toHaveBeenCalledTimes(2);
  });
});
