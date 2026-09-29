import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, ModalCloseButton } from "../../components/ui";
import { queryKeys } from "../../lib/query-keys";
import { formatArsCents } from "../../lib/format";
import {
  getPublicBooking,
  getPublicSlots,
  type PublicBookingData
} from "../booking/booking.api";
import {
  createManualDashboardAppointment,
  type ManualAppointmentPayload
} from "./dashboard.api";

type ManualAppointmentModalProps = {
  organizationSlug: string;
  onClose: () => void;
  onCreated: () => void;
};

function formatPrice(cents?: number | null) {
  return cents == null ? "Precio a confirmar" : formatArsCents(cents);
}

function dayLabel(value: string) {
  return format(new Date(`${value}T12:00:00`), "EEE dd MMM", { locale: es });
}

function getBranchTeam(data: PublicBookingData | undefined, branchId: string) {
  return (data?.team ?? []).filter((member) => member.branchIds.includes(branchId));
}

export function ManualAppointmentModal({
  organizationSlug,
  onClose,
  onCreated
}: ManualAppointmentModalProps) {
  const queryClient = useQueryClient();
  const bookingQuery = useQuery({
    queryKey: queryKeys.publicBooking(organizationSlug),
    queryFn: () => getPublicBooking(organizationSlug)
  });
  const data = bookingQuery.data;
  const [serviceId, setServiceId] = useState("");
  const [branchId, setBranchId] = useState("");
  const effectiveBranchId = branchId || data?.branches[0]?.id || "";
  const branchTeam = useMemo(
    () => getBranchTeam(data, effectiveBranchId),
    [data, effectiveBranchId]
  );
  const requiresAssignee = branchTeam.length > 0;
  const [assigneeId, setAssigneeId] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [depositPaid, setDepositPaid] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedService = data?.services.find((service) => service.id === serviceId);
  const slotsQuery = useQuery({
    queryKey: queryKeys.publicSlots(
      organizationSlug,
      serviceId || "none",
      assigneeId || "auto",
      effectiveBranchId || "main"
    ),
    queryFn: () =>
      getPublicSlots(
        organizationSlug,
        serviceId,
        effectiveBranchId || undefined,
        assigneeId || undefined
      ),
    enabled:
      Boolean(serviceId && effectiveBranchId) &&
      (!requiresAssignee || Boolean(assigneeId))
  });
  const days = slotsQuery.data?.days ?? [];
  const effectiveSelectedDay =
    days.some((day) => day.date === selectedDay) ? selectedDay : days[0]?.date ?? "";
  const selectedSlots =
    days.find((day) => day.date === effectiveSelectedDay)?.slots ?? [];
  const depositEnabled = Boolean(
    data?.organization.deposit.enabled && data.organization.deposit.amountCents
  );
  const canSubmit = Boolean(
    serviceId &&
      effectiveBranchId &&
      startsAt &&
      customerName.trim().length >= 2 &&
      phone.trim().length >= 8 &&
      (!requiresAssignee || assigneeId)
  );

  function resetTime() {
    setSelectedDay("");
    setStartsAt("");
  }

  async function handleSubmit() {
    if (!canSubmit || isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      const payload: ManualAppointmentPayload = {
        serviceId,
        branchId: effectiveBranchId,
        assigneeId: assigneeId || undefined,
        startsAt,
        customerName: customerName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        depositPaid: depositEnabled ? depositPaid : false
      };
      await createManualDashboardAppointment(payload);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["appointments"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers })
      ]);
      onCreated();
    } catch {
      setError("No pudimos crear el turno. Revisá la disponibilidad o los datos.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="viewport-overlay modal-overlay-enter z-50 grid place-items-end bg-[rgba(32,24,54,0.58)] p-3 backdrop-blur-sm sm:place-items-center">
      <section className="modal-panel-enter modal-scroll-panel w-full max-w-4xl overflow-hidden rounded-xl border border-[var(--color-border)] bg-[#ffffff] shadow-[0_28px_90px_rgba(32,24,54,0.34)]">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Turno manual
            </p>
            <h2 className="mt-1 text-base font-semibold">Cargar un turno</h2>
            <p className="mt-1 text-xs text-[var(--color-muted-strong)]">
              Para reservarle un horario al cliente desde el local.
            </p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </header>

        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.25fr)_320px]">
          <div className="grid gap-4">
            <section className="rounded-xl border border-[var(--color-border)] bg-white/45 p-4">
              <h3 className="text-sm font-semibold">1. Servicio y profesional</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs">
                  <span className="font-semibold text-[var(--color-muted-strong)]">Servicio</span>
                  <select
                    value={serviceId}
                    onChange={(event) => {
                      setServiceId(event.target.value);
                      resetTime();
                    }}
                    className="h-10 rounded-md border border-[var(--color-border-strong)] bg-white/80 px-3 outline-none focus:border-[var(--color-ink)]"
                  >
                    <option value="">Elegir servicio</option>
                    {data?.services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                </label>
                {data && data.branches.length > 1 && (
                  <label className="grid gap-1.5 text-xs">
                    <span className="font-semibold text-[var(--color-muted-strong)]">Sede</span>
                    <select
                      value={effectiveBranchId}
                      onChange={(event) => {
                        setBranchId(event.target.value);
                        setAssigneeId("");
                        resetTime();
                      }}
                      className="h-10 rounded-md border border-[var(--color-border-strong)] bg-white/80 px-3 outline-none focus:border-[var(--color-ink)]"
                    >
                      {data.branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {requiresAssignee && (
                  <label className="grid gap-1.5 text-xs sm:col-span-2">
                    <span className="font-semibold text-[var(--color-muted-strong)]">
                      Profesional
                    </span>
                    <select
                      value={assigneeId}
                      onChange={(event) => {
                        setAssigneeId(event.target.value);
                        resetTime();
                      }}
                      className="h-10 rounded-md border border-[var(--color-border-strong)] bg-white/80 px-3 outline-none focus:border-[var(--color-ink)]"
                    >
                      <option value="">Elegir profesional</option>
                      {branchTeam.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-[var(--color-border)] bg-white/45 p-4">
              <h3 className="text-sm font-semibold">2. Día y horario</h3>
              {slotsQuery.isPending && serviceId && (!requiresAssignee || assigneeId) ? (
                <p className="mt-3 text-xs text-[var(--color-muted-strong)]">
                  Buscando horarios disponibles...
                </p>
              ) : days.length > 0 ? (
                <>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {days.slice(0, 9).map((day) => (
                      <button
                        key={day.date}
                        type="button"
                        onClick={() => {
                          setSelectedDay(day.date);
                          setStartsAt("");
                        }}
                        className={`rounded-lg border px-3 py-2 text-left text-xs ${
                          effectiveSelectedDay === day.date
                            ? "border-[var(--color-ink)] bg-[rgba(32,24,54,0.06)]"
                            : "border-[var(--color-border)] bg-white/60 hover:border-[var(--color-ink)]"
                        }`}
                      >
                        <span className="block font-semibold capitalize">{dayLabel(day.date)}</span>
                        <span className="text-xs text-[var(--color-muted-strong)]">
                          {day.slots.length} horarios
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedSlots.map((slot) => (
                      <button
                        key={slot.startsAt}
                        type="button"
                        onClick={() => setStartsAt(slot.startsAt)}
                        className={`rounded-md border px-3 py-2 font-mono text-xs font-semibold ${
                          startsAt === slot.startsAt
                            ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-button-text)]"
                            : "border-[var(--color-border)] bg-white/65 hover:border-[var(--color-ink)]"
                        }`}
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-3 rounded-lg border border-dashed border-[var(--color-border)] bg-white/45 px-3 py-3 text-xs text-[var(--color-muted-strong)]">
                  Elegí servicio y profesional para ver horarios disponibles.
                </p>
              )}
            </section>

            <section className="rounded-xl border border-[var(--color-border)] bg-white/45 p-4">
              <h3 className="text-sm font-semibold">3. Datos del cliente</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs">
                  <span className="font-semibold text-[var(--color-muted-strong)]">Nombre</span>
                  <input
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    placeholder="Nombre y apellido"
                    className="h-10 rounded-md border border-[var(--color-border-strong)] bg-white/80 px-3 outline-none focus:border-[var(--color-ink)]"
                  />
                </label>
                <label className="grid gap-1.5 text-xs">
                  <span className="font-semibold text-[var(--color-muted-strong)]">WhatsApp</span>
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="Ej: 1123456789"
                    className="h-10 rounded-md border border-[var(--color-border-strong)] bg-white/80 px-3 outline-none focus:border-[var(--color-ink)]"
                  />
                </label>
                <label className="grid gap-1.5 text-xs sm:col-span-2">
                  <span className="font-semibold text-[var(--color-muted-strong)]">
                    Email (opcional)
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="cliente@email.com"
                    className="h-10 rounded-md border border-[var(--color-border-strong)] bg-white/80 px-3 outline-none focus:border-[var(--color-ink)]"
                  />
                </label>
              </div>
            </section>
          </div>

          <aside className="h-fit rounded-xl border border-[var(--color-border)] bg-[#ffffff] p-4 lg:sticky lg:top-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
              Resumen
            </p>
            <div className="mt-3 space-y-2">
              <SummaryLine label="Servicio" value={selectedService?.name ?? "Sin elegir"} />
              <SummaryLine
                label="Precio"
                value={formatPrice(selectedService?.priceCents)}
              />
              <SummaryLine
                label="Duración"
                value={selectedService ? `${selectedService.durationMinutes} min` : "Sin elegir"}
              />
              <SummaryLine
                label="Horario"
                value={startsAt ? format(new Date(startsAt), "dd/MM/yyyy HH:mm") : "Sin elegir"}
              />
            </div>

            {depositEnabled && (
              <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-white/55 p-3">
                <p className="text-xs font-semibold">Seña</p>
                <p className="mt-1 text-xs text-[var(--color-muted-strong)]">
                  {formatPrice(data?.organization.deposit.amountCents)}
                </p>
                <div className="mt-3 grid gap-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      checked={depositPaid}
                      onChange={() => setDepositPaid(true)}
                      className="cursor-pointer accent-[var(--color-ink)]"
                    />
                    Abonó seña
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      checked={!depositPaid}
                      onChange={() => setDepositPaid(false)}
                      className="cursor-pointer accent-[var(--color-ink)]"
                    />
                    No abonó todavía
                  </label>
                </div>
              </div>
            )}

            <div className="mt-4 border-t border-[var(--color-border)] pt-3">
              {error && <p className="mb-3 text-xs font-semibold text-[#b42318]">{error}</p>}
              <div className="flex flex-col-reverse gap-2">
                <Button type="button" onClick={onClose} style={{ fontSize: "0.75rem", lineHeight: "1rem" }} className="h-8 w-full px-3 py-1">
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={!canSubmit || isSaving}
                  onClick={() => void handleSubmit()}
                  style={{ fontSize: "0.75rem", lineHeight: "1rem" }}
                  className="h-8 w-full px-3 py-1"
                >
                  {isSaving ? "Guardando..." : "Crear turno"}
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[var(--color-border)] pb-2 last:border-b-0 last:pb-0">
      <p className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-[var(--color-muted)]">{label}</p>
      <p className="mt-0.5 text-xs font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}
