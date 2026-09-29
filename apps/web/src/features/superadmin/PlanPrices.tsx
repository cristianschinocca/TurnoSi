import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui";
import { ApiError } from "../../lib/api";
import { formatArsCents } from "../../lib/format";
import { billingPlans } from "../billing/billing.plans";
import { getSuperadminPrices, retrySuperadminPrice, updateSuperadminPrice, type SuperadminPrice } from "./superadmin.api";

function money(cents: number) {
  return formatArsCents(cents);
}

const priceErrorMessages: Record<string, string> = {
  SUBSCRIPTION_CHANGED: "La suscripción fue reemplazada o desvinculada. Requiere revisión.",
  REFERENCE_MISMATCH: "Mercado Pago no identifica el negocio y plan esperados.",
  STATUS_UNSUPPORTED: "Estado de suscripción no reconocido.",
  CURRENCY_MISMATCH: "La moneda de la suscripción no es ARS.",
  AMOUNT_NOT_CONFIRMED: "Mercado Pago todavía no confirmó el nuevo importe.",
  PROVIDER_UNAVAILABLE: "Mercado Pago no respondió correctamente.",
  PROVIDER_REJECTED: "Mercado Pago rechazó la solicitud. Revisá la cuenta y la suscripción."
};

function PriceRow({ price }: { price: SuperadminPrice }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(String(price.amountCents / 100));
  const [confirmation, setConfirmation] = useState(false);
  const cents = Math.round(Number(amount) * 100);
  const valid = Number.isFinite(cents) && cents >= 100 && cents <= 100_000_000 && cents !== price.amountCents;
  const unfinished = Boolean(price.change && (price.change.pending || price.change.failed));
  const mutation = useMutation({
    mutationFn: (retry: boolean) => retry
      ? retrySuperadminPrice(price.plan)
      : updateSuperadminPrice(price.plan, cents, price.revision),
    onSuccess: (result) => {
      setConfirmation(false);
      queryClient.setQueryData(["superadmin", "prices"], result);
      void queryClient.invalidateQueries({ queryKey: ["billing", "prices"] });
    },
    onError: () => { void queryClient.invalidateQueries({ queryKey: ["superadmin", "prices"] }); }
  });

  return (
    <div className="border-b border-[var(--color-border)] py-5">
      <form className="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_180px_auto]" onSubmit={(event) => {
        event.preventDefault();
        if (valid && !unfinished) setConfirmation(true);
      }}>
        <div>
          <h3 className="font-semibold">{billingPlans.find((plan) => plan.id === price.plan)?.name}</h3>
          <p className="mt-1 text-sm text-[var(--color-muted-strong)]">Vigente: {money(price.amountCents)} / mes</p>
        </div>
        <label className="grid gap-1 text-sm">
          Precio mensual (ARS)
          <input type="number" min="1" max="1000000" step="0.01" required value={amount}
            disabled={unfinished || mutation.isPending}
            onChange={(event) => { setAmount(event.target.value); setConfirmation(false); }}
            className="h-10 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3" />
        </label>
        <Button type="submit" disabled={!valid || unfinished || mutation.isPending}>Cambiar precio</Button>
      </form>
      {confirmation && (
        <div className="mt-4 space-y-3 border-l-2 border-[var(--color-accent)] pl-4" role="alert">
          <p className="text-sm">Cambiar de {money(price.amountCents)} a {money(cents)} mensuales para nuevas altas y suscripciones de Mercado Pago existentes. No modifica pagos ya emitidos.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate(false)}>
              {mutation.isPending ? "Guardando..." : "Confirmar actualización"}
            </Button>
            <Button type="button" disabled={mutation.isPending} onClick={() => setConfirmation(false)}>Cancelar</Button>
          </div>
        </div>
      )}
      {price.change && (
        <div className="mt-3 space-y-2 text-sm" aria-live="polite">
          <p>{price.change.pending ? "Actualizando suscripciones" : price.change.failed ? "Actualización incompleta" : "Actualización finalizada"}: {price.change.updated} actualizadas, {price.change.pending} pendientes, {price.change.failed} con error, {price.change.skipped} no aplicables.</p>
          <p className="text-xs text-[var(--color-muted-strong)]">{new Date(price.change.createdAt).toLocaleString("es-AR")} · {price.change.changedBy}</p>
          {price.change.failed > 0 && <Button type="button" disabled={mutation.isPending || price.change.pending > 0} onClick={() => mutation.mutate(true)}>Reintentar fallidas</Button>}
          {price.change.failures.length > 0 && <details>
            <summary className="cursor-pointer">Incidencias (hasta 20)</summary>
            <ul className="mt-2 space-y-2">
              {price.change.failures.map((failure) => <li key={failure.preapprovalId} className="break-words">
                <span className="font-medium">Suscripción {failure.preapprovalId}</span>: {priceErrorMessages[failure.errorCode ?? ""] ?? "Requiere revisión."} Intentos: {failure.attempts}.
              </li>)}
            </ul>
          </details>}
        </div>
      )}
      {mutation.isError && <p role="alert" className="mt-3 text-sm text-red-700">{mutation.error instanceof ApiError && mutation.error.status === 409 ? mutation.error.message : "No pudimos aplicar el cambio. Revisá el estado y volvé a intentar."}</p>}
    </div>
  );
}

export function PlanPrices() {
  const query = useQuery({
    queryKey: ["superadmin", "prices"], queryFn: getSuperadminPrices, refetchInterval: 3_000
  });
  return (
    <section className="min-w-0" aria-label="Precios de planes">
      <h2 className="text-lg font-semibold">Precios de planes</h2>
      {query.isLoading && <p className="py-4 text-sm">Cargando precios...</p>}
      {query.isError && <p role="alert" className="py-4 text-sm text-red-700">No pudimos consultar los precios.</p>}
      {query.data?.data.map((price) => <PriceRow key={`${price.plan}:${price.revision}`} price={price} />)}
    </section>
  );
}
