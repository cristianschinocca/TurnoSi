import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Card, CardBody, CardHeader } from "../../components/ui";
import { ApiError } from "../../lib/api";
import { useSessionQuery } from "../auth/auth.queries";
import {
  createSubscription,
  getSubscription,
  startFreeTrial,
  type BillingPlan
} from "../billing/billing.api";
import { billingPlans } from "../billing/billing.plans";
import { formatPlanPrice, useBillingPrices } from "../billing/billing-prices";

const statusLabels = {
  pending: "Pendiente de autorización",
  paused: "Pausado",
  canceled: "Cancelado"
} as const;

export function BillingSettings({ compact = false }: { compact?: boolean }) {
  const prices = useBillingPrices();
  const session = useSessionQuery();
  const queryClient = useQueryClient();
  const subscriptionQuery = useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: getSubscription,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? 5_000 : false
  });
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan | "trial" | null>(
    null
  );
  const [payerEmail, setPayerEmail] = useState("");
  const [message, setMessage] = useState("");
  const subscription = subscriptionQuery.data;
  const currentPlanName =
    subscription?.plan === "trial"
      ? "Prueba Inicial"
      : billingPlans.find((plan) => plan.id === subscription?.plan)?.name;
  const subscriptionStatusLabel =
    subscription?.status === "authorized" && currentPlanName
      ? `Plan actual: ${currentPlanName}`
      : subscription && subscription.status !== "authorized"
        ? statusLabels[subscription.status]
        : "";
  const hasActivePaidSubscription =
    subscription?.status === "authorized" && subscription.plan !== "trial";
  const effectivePayerEmail =
    payerEmail ||
    subscription?.payerEmail ||
    session.data?.data.user.email ||
    "";

  async function subscribe(plan: BillingPlan) {
    if (selectedPlan !== null) return;
    setSelectedPlan(plan);
    setMessage("");
    let checkoutUrl: string;

    try {
      ({ checkoutUrl } = await createSubscription(
        plan,
        effectivePayerEmail.trim()
      ));
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.code === "SUBSCRIPTION_ALREADY_ACTIVE"
          ? "Ya tenés un plan pago activo. Si querés cambiarlo, primero hay que cancelar o reemplazar la suscripción actual."
          : "No pudimos iniciar el pago. Revisá la configuración de Mercado Pago."
      );
      setSelectedPlan(null);
      return;
    }

    window.location.assign(checkoutUrl);
  }

  async function activateTrial() {
    if (selectedPlan !== null) return;
    setSelectedPlan("trial");
    setMessage("");
    try {
      await startFreeTrial();
      await queryClient.invalidateQueries({
        queryKey: ["billing", "subscription"]
      });
    } catch {
      setMessage("No pudimos activar la prueba gratuita.");
    } finally {
      setSelectedPlan(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Plan y facturación</h2>
            <p className="mt-1 text-sm text-[var(--color-muted-strong)]">
              La prueba se activa en TurnoSi. Los planes pagos usan Mercado Pago.
            </p>
          </div>
          {subscription && (
            <span className="w-fit rounded-full bg-[rgba(32,24,54,0.08)] px-3 py-1 text-xs font-semibold">
              {subscriptionStatusLabel}
            </span>
          )}
        </div>
      </CardHeader>
      <CardBody className={compact ? "p-4" : "p-4 sm:p-6"}>
        <div className="mx-auto max-w-6xl">
          {!compact && (
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--color-accent)]">
                Activá tu cuenta
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">
                Elegí cómo querés empezar
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted-strong)]">
                Podés probar el plan Inicial gratis por 7 días o activar un plan mensual con Mercado Pago.
              </p>
            </div>
          )}

          {!hasActivePaidSubscription ? (
            <label className={`mx-auto grid max-w-md gap-1.5 text-left text-sm ${compact ? "mt-1" : "mt-5"}`}>
              <span className="font-semibold text-[var(--color-muted-strong)]">
                Email de la cuenta de Mercado Pago
              </span>
              <input
                type="email"
                value={effectivePayerEmail}
                onChange={(event) => setPayerEmail(event.target.value)}
                placeholder="Ej: comprador@mercadopago.com"
                className="h-11 rounded-lg border border-[var(--color-border-strong)] bg-white/80 px-3 text-center outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[rgba(253,134,6,0.18)]"
              />
            </label>
          ) : null}

          <div className={`${compact ? "mt-5" : "mt-8"} grid justify-items-center gap-4 lg:grid-cols-3`}>
            {!subscription?.trialStartedAt && (
              <div className="lg:col-span-3">
                <article className="mx-auto flex w-full max-w-2xl flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[#ffffff] p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">
                      Prueba gratis
                    </p>
                    <h3 className="mt-2 text-xl font-semibold">7 días del plan Inicial</h3>
                    <p className="mt-1 text-sm text-[var(--color-muted-strong)]">
                      Sin Mercado Pago ni tarjeta. Después podés elegir un plan mensual.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="accent"
                    disabled={selectedPlan !== null}
                    onClick={() => void activateTrial()}
                    className="w-full sm:w-auto"
                  >
                    {selectedPlan === "trial"
                      ? "Activando..."
                      : "Probar gratis"}
                  </Button>
                </article>
              </div>
            )}
            {billingPlans.map((plan) => {
              const current =
                subscription?.plan === plan.id &&
                subscription.status === "authorized";
              return (
                <article
                  key={plan.id}
                  className={`dashboard-billing-plan-card${compact ? " is-compact" : ""}${plan.recommended ? " is-recommended" : ""}${current ? " is-current" : ""}`}
                >
                  {plan.recommended && (
                    <span className="dashboard-billing-plan-badge is-recommended">
                      Más elegido
                    </span>
                  )}
                  {current && (
                    <span className="dashboard-billing-plan-badge is-current">
                      Plan actual
                    </span>
                  )}
                  <h3>{plan.name}</h3>
                  <p className="dashboard-billing-plan-description">
                    {plan.description}
                  </p>

                  <div className="dashboard-billing-plan-price">
                    <p>{formatPlanPrice(prices.data, plan.id)}</p>
                    <span>{plan.period}</span>
                  </div>

                  <ul className="dashboard-billing-plan-features">
                    {plan.features.slice(0, compact ? 3 : 5).map((feature) => (
                      <li key={feature}>
                        <span />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="dashboard-billing-plan-action">
                    <Button
                      type="button"
                      variant={current ? "secondary" : plan.recommended ? "accent" : "secondary"}
                      disabled={
                        current ||
                        !prices.data || selectedPlan !== null ||
                        !effectivePayerEmail.trim()
                      }
                      onClick={() => void subscribe(plan.id)}
                      className="dashboard-billing-plan-button w-full"
                    >
                      <span>
                        {current
                          ? "Plan actual"
                          : selectedPlan === plan.id
                            ? "Abriendo Mercado Pago..."
                            : "Elegir plan"}
                      </span>
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
        {message && (
          <p className="mt-4 rounded-md border border-[#e7b9b2] bg-[#fde8e5] px-3 py-2 text-sm text-[#9f1f16]">
            {message}
          </p>
        )}
        {!effectivePayerEmail && (
          <p className="mt-4 text-sm font-medium text-[#9f1f16]">
            Ingresá el email del comprador de Mercado Pago para habilitar los planes.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
