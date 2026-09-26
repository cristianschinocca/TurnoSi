import { afterEach, describe, expect, it, vi } from "vitest";
import { MercadoPagoConfig, PreApproval } from "mercadopago";
import { billingRequestOptions } from "./billing-prices.service.js";

afterEach(() => vi.unstubAllGlobals());

describe("Mercado Pago SDK price update contract", () => {
  it("does not retry ambiguous writes inside the SDK", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 503 }), {
      status: 503, headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new PreApproval(new MercadoPagoConfig({
      accessToken: "test-only", options: billingRequestOptions
    }));
    await expect(client.update({ id: "test-id", body: {
      auto_recurring: { transaction_amount: 20000, currency_id: "ARS" }
    } })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
