import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api";
import type { BillingPlan } from "./billing.api";

export type BillingPrice = { plan: BillingPlan; amountCents: number; revision: number };

export function useBillingPrices() {
  return useQuery({
    queryKey: ["billing", "prices"],
    queryFn: async () => (await apiRequest<{ data: BillingPrice[] }>("/api/v1/public/billing/prices", {}, false)).data,
    staleTime: 0,
    refetchInterval: 30_000
  });
}

export function formatPlanPrice(prices: BillingPrice[] | undefined, plan: BillingPlan) {
  const price = prices?.find((item) => item.plan === plan);
  return price ? new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 2
  }).format(price.amountCents / 100) : "Precio no disponible";
}
