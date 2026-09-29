import { useDeferredValue, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Card, CardBody, CardHeader, Toast } from "../../components/ui";
import lockOpenIcon from "../../components/assets/icons/actions/lock-open.svg";
import lockIcon from "../../components/assets/icons/actions/lock.svg";
import { queryKeys } from "../../lib/query-keys";
import {
  blockCustomer,
  getCustomers,
  unblockCustomer,
  type Customer
} from "./customers.api";

type CustomerStatus = "all" | "active" | "blocked";

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function getRiskTone(noShowCount: number) {
  if (noShowCount >= 3) return "high";
  if (noShowCount > 0) return "medium";
  return "low";
}

function getRiskLabel(noShowCount: number) {
  if (noShowCount >= 3) return "Riesgo alto";
  if (noShowCount > 0) return "Con ausencias";
  return "Sin ausencias";
}

export function DashboardCustomersView() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [status, setStatus] = useState<CustomerStatus>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [reason, setReason] = useState("");
  const [toast, setToast] = useState("");
  const [blockingId, setBlockingId] = useState("");
  const [unblockingId, setUnblockingId] = useState("");
  const canSearchCustomers = deferredSearch.length >= 2;
  const customersQuery = useQuery({
    queryKey: queryKeys.customers(deferredSearch, status, page),
    queryFn: () => getCustomers(deferredSearch, status, page),
    enabled: canSearchCustomers,
    staleTime: 2 * 60 * 1000
  });

  async function confirmBlock() {
    if (!selected || reason.trim().length < 3 || blockingId) return;
    setBlockingId(selected.id);
    try {
      await blockCustomer(selected.id, reason.trim());
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      setSelected(null);
      setReason("");
      setToast("Cliente bloqueado.");
    } finally {
      setBlockingId("");
    }
  }

  async function handleUnblock(customer: Customer) {
    if (unblockingId) return;
    setUnblockingId(customer.id);
    try {
      await unblockCustomer(customer.id);
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      setToast("Cliente desbloqueado.");
    } finally {
      setUnblockingId("");
    }
  }

  const customers = canSearchCustomers ? (customersQuery.data?.data ?? []) : [];
  const totalCustomers = canSearchCustomers ? (customersQuery.data?.pagination.total ?? 0) : 0;

  return (
    <section className="min-w-0 space-y-3">
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold">Clientes</h2>
              <p className="mt-0.5 text-[0.6875rem] text-[var(--color-muted-strong)]">
                Seguimiento de contacto, ausencias y bloqueos de reserva.
              </p>
            </div>
            <span className="w-fit rounded-full bg-[rgba(32,24,54,0.08)] px-3 py-1 text-[0.6875rem] font-semibold text-[var(--color-ink)]">
              {canSearchCustomers ? `${totalCustomers} registros` : "Búsqueda manual"}
            </span>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <div className="grid gap-3 border-b border-[var(--color-border)] bg-white p-3 lg:grid-cols-[minmax(280px,560px)_minmax(240px,300px)] lg:items-end">
            <label className="w-full min-w-0">
              <span className="mb-1.5 block text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                Buscar
              </span>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                style={{ fontSize: "0.75rem", lineHeight: "1rem" }}
                placeholder="Escribí al menos 2 letras, email o teléfono"
                className="h-9 w-full rounded-md border border-[var(--color-border-strong)] bg-[#ffffff] px-3 text-xs placeholder:text-xs outline-none focus:border-[var(--color-ink)] focus:ring-2 focus:ring-[rgba(32,24,54,0.1)]"
              />
            </label>
            <div className="w-full">
                <span className="mb-1.5 block text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                Estado
              </span>
              <div className="grid grid-cols-3 rounded-md border border-[var(--color-border)] bg-[#f6f7f9] p-1 text-xs">
                {([
                  ["all", "Todos"],
                  ["active", "Habilitados"],
                  ["blocked", "Bloqueados"]
                ] as [CustomerStatus, string][]).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setStatus(value);
                      setPage(1);
                    }}
                    style={{ fontSize: "0.75rem", lineHeight: "1rem" }}
                    className={`rounded px-2 py-1.5 font-medium transition-colors ${
                      status === value
                        ? "bg-[var(--color-ink)] text-[var(--color-button-text)]"
                        : "text-[var(--color-muted-strong)] hover:bg-white/70"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-2 bg-[#f6f7f9] p-3 sm:p-4">
            {customers.map((customer) => (
              <article
                key={customer.id}
                className="grid gap-3 rounded-lg border border-[var(--color-border)] bg-[#ffffff] p-3 lg:grid-cols-[minmax(220px,0.9fr)_minmax(250px,0.8fr)_auto] lg:items-center"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                      customer.blockedAt
                        ? "bg-[#fde8e5] text-[#9f1f16]"
                        : "bg-[var(--color-ink)] text-[var(--color-button-text)]"
                    }`}>
                      {getInitials(customer.fullName) || "?"}
                    </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-xs font-semibold text-[var(--color-ink)]">
                        {customer.fullName}
                      </p>
                      <CustomerStatusBadge blocked={Boolean(customer.blockedAt)} />
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--color-muted-strong)]">
                      <span>{customer.phone || "Sin teléfono"}</span>
                      <span>{customer.email || "Sin email"}</span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-x-4 gap-y-2 border-y border-[var(--color-border)] py-2 sm:grid-cols-2 lg:border-y-0 lg:border-l lg:py-0 lg:pl-4">
                  <CustomerInfoLine
                    label="Ausencias"
                    value={`${customer.noShowCount}`}
                    helper={getRiskLabel(customer.noShowCount)}
                  />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                      Seguimiento
                    </p>
                    <div className="mt-1">
                      <RiskBadge noShowCount={customer.noShowCount} />
                    </div>
                  </div>
                  {customer.blockedReason && (
                    <p className="rounded-md border border-[#e7b9b2] bg-[#fff6f5] px-2 py-1 text-xs text-[#8f1b13] sm:col-span-2">
                      Motivo: {customer.blockedReason}
                    </p>
                  )}
                </div>

                <div className="flex lg:justify-self-end">
                  {customer.blockedAt ? (
                    <button
                      type="button"
                      disabled={Boolean(unblockingId)}
                      title="Desbloquear cliente"
                      aria-label={`Desbloquear a ${customer.fullName}`}
                      onClick={() => void handleUnblock(customer)}
                      className="group inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-border-strong)] text-[var(--color-ink)] transition-all duration-200 ease-out hover:bg-white/75 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {unblockingId === customer.id ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-ink)]" />
                      ) : (
                        <img
                          src={lockOpenIcon}
                          alt=""
                          aria-hidden="true"
                          className="h-4 w-4 opacity-80 transition duration-200 group-hover:-rotate-6 group-hover:scale-110"
                        />
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={Boolean(blockingId)}
                      title="Bloquear cliente"
                      aria-label={`Bloquear a ${customer.fullName}`}
                      onClick={() => {
                        setSelected(customer);
                        setReason("");
                      }}
                      className="group inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#e7b9b2] text-[#b42318] transition-all duration-200 ease-out hover:bg-[#fff6f5] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {blockingId === customer.id ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#e7b9b2] border-t-[#b42318]" />
                      ) : (
                        <img
                          src={lockIcon}
                          alt=""
                          aria-hidden="true"
                          className="h-4 w-4 opacity-85 transition duration-200 group-hover:-rotate-6 group-hover:scale-110"
                        />
                      )}
                    </button>
                  )}
                </div>
              </article>
            ))}
            {!canSearchCustomers && (
              <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] bg-white/70 p-4 text-center">
                <p className="text-xs font-semibold text-[var(--color-ink)]">
                  Buscá un cliente para empezar
                </p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Podés buscar por nombre, email o número de teléfono.
                </p>
              </div>
            )}
            {canSearchCustomers && !customersQuery.isPending && customers.length === 0 && (
              <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] bg-white/50 p-4 text-center">
                <p className="text-sm font-semibold text-[var(--color-ink)]">
                  No encontramos clientes
                </p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Probá con otra búsqueda o cambiá el filtro activo.
                </p>
              </div>
            )}
          </div>
          {canSearchCustomers && (customersQuery.data?.pagination.totalPages ?? 0) > 1 && (
            <div className="flex items-center justify-between border-t border-[var(--color-border)] p-3 text-sm">
              <Button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Anterior
              </Button>
              <span className="text-[var(--color-muted-strong)]">
                Página {page} de {customersQuery.data?.pagination.totalPages}
              </span>
              <Button
                type="button"
                disabled={page >= (customersQuery.data?.pagination.totalPages ?? 1)}
                onClick={() => setPage((current) => current + 1)}
              >
                Siguiente
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {selected && (
        <div className="viewport-overlay modal-overlay-enter z-50 grid place-items-end bg-[rgba(32,24,54,0.6)] p-3 backdrop-blur-sm sm:place-items-center">
          <div className="modal-panel-enter modal-scroll-panel w-full max-w-lg rounded-lg border border-[#e7b9b2] bg-[#ffffff] p-5 shadow-[0_28px_90px_rgba(32,24,54,0.34)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b42318]">
              Control de reserva
            </p>
            <h2 className="mt-2 text-lg font-semibold">Bloquear a {selected.fullName}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-muted-strong)]">
              El cliente no podrá reservar online hasta que lo desbloquees. Esta acción conviene usarla sólo para ausencias reiteradas o casos operativos claros.
            </p>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Motivo del bloqueo"
              className="mt-4 min-h-28 w-full rounded-md border border-[var(--color-border-strong)] bg-white/70 p-3 text-sm outline-none focus:border-[#b42318] focus:ring-2 focus:ring-[rgba(180,35,24,0.14)]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                disabled={Boolean(blockingId)}
                onClick={() => setSelected(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={reason.trim().length < 3 || Boolean(blockingId)}
                onClick={() => void confirmBlock()}
                className="border-[#b42318] bg-[#b42318] text-white"
              >
                {blockingId ? "Bloqueando..." : "Confirmar bloqueo"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast("")} />}
    </section>
  );
}

function CustomerStatusBadge({ blocked }: { blocked: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        blocked
          ? "bg-[#fde8e5] text-[#b42318]"
          : "bg-[rgba(64,145,91,0.12)] text-[#347548]"
      }`}
    >
      {blocked ? "Bloqueado" : "Habilitado"}
    </span>
  );
}

function CustomerInfoLine({
  helper,
  label,
  value
}: {
  helper: string;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
        {label}
      </p>
      <p className="mt-1 font-mono text-sm font-semibold text-[var(--color-ink)]">
        {value}
      </p>
      <p className="mt-0.5 truncate text-xs text-[var(--color-muted-strong)]">
        {helper}
      </p>
    </div>
  );
}

function RiskBadge({ noShowCount }: { noShowCount: number }) {
  const tone = getRiskTone(noShowCount);
  const className =
    tone === "high"
      ? "bg-[#fde8e5] text-[#b42318]"
      : tone === "medium"
        ? "bg-[#fff3e3] text-[#a44b00]"
        : "bg-[rgba(32,24,54,0.07)] text-[var(--color-muted-strong)]";

  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}>
      {getRiskLabel(noShowCount)}
    </span>
  );
}
