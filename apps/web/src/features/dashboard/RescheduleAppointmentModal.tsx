import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import calendarIcon from "../../components/assets/icons/appointments/calendar.svg";
import clockIcon from "../../components/assets/icons/appointments/clock.svg";
import { ModalCloseButton } from "../../components/ui";
import { ApiError } from "../../lib/api";
import { queryKeys } from "../../lib/query-keys";
import {
  getDashboardAppointmentRescheduleSlots,
  rescheduleDashboardAppointment
} from "./dashboard.api";
import type { DashboardAppointment } from "./dashboard.data";
import type { BookingDay } from "../booking/booking.api";

type RescheduleAppointmentModalProps = {
  appointment: DashboardAppointment;
  onClose: () => void;
  onRescheduled: (startsAt: string) => void;
};

const emptyDays: BookingDay[] = [];

function dayLabel(value: string) {
  return format(new Date(`${value}T12:00:00`), "EEE dd MMM", { locale: es });
}

function dateTimeLabel(value?: string) {
  return value
    ? format(new Date(value), "EEEE dd 'de' MMMM 'de' yyyy, HH:mm", { locale: es })
    : "Fecha no disponible";
}

export function RescheduleAppointmentModal({
  appointment,
  onClose,
  onRescheduled
}: RescheduleAppointmentModalProps) {
  const [selectedDay, setSelectedDay] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const slotsQuery = useQuery({
    queryKey: queryKeys.appointmentRescheduleSlots(appointment.id),
    queryFn: () => getDashboardAppointmentRescheduleSlots(appointment.id)
  });
  const days = slotsQuery.data?.days ?? emptyDays;
  const effectiveSelectedDay = days.some((day) => day.date === selectedDay)
    ? selectedDay
    : days[0]?.date ?? "";
  const selectedSlots =
    days.find((day) => day.date === effectiveSelectedDay)?.slots ?? [];

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onClose]);

  async function handleSubmit() {
    if (!startsAt || isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      const result = await rescheduleDashboardAppointment(appointment.id, startsAt);
      onRescheduled(result.data.startsAt);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError &&
          requestError.code === "SLOT_UNAVAILABLE"
          ? "Ese horario acaba de ocuparse. Elegí otro."
          : "No pudimos reprogramar el turno. Probá con otro horario."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="viewport-overlay modal-overlay-enter z-[80] grid place-items-center bg-[rgba(32,24,54,0.58)] p-3 backdrop-blur-sm"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="reschedule-title"
        className="modal-panel-enter modal-scroll-panel w-full max-w-xl overflow-hidden rounded-xl border border-[rgba(32,24,54,0.12)] bg-[#ffffff] shadow-[0_28px_90px_rgba(32,24,54,0.34)]"
      >
        <header className="flex items-start justify-between gap-4 px-4 pb-4 pt-4 sm:px-5 sm:pt-5">
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[var(--color-muted)]">
              Reprogramar turno
            </p>
            <h2
              id="reschedule-title"
              className="mt-2 text-base font-semibold leading-tight text-[var(--color-ink)]"
            >
              Elegí un nuevo horario
            </h2>
            <p className="mt-1 truncate text-[0.6875rem] text-[var(--color-muted)]">
              {appointment.service} · {appointment.client}
            </p>
          </div>
          <ModalCloseButton disabled={isSaving} onClick={onClose} />
        </header>

        <div className="border-y border-[var(--color-border)] px-4 py-3 sm:px-5">
          <div className="grid gap-2 sm:grid-cols-2">
            <SummaryCard
              icon={calendarIcon}
              label="Horario actual"
              value={dateTimeLabel(appointment.startsAt)}
            />
            <SummaryCard
              icon={clockIcon}
              label="Nuevo horario"
              value={startsAt ? dateTimeLabel(startsAt) : "Sin elegir"}
            />
          </div>
        </div>

        <div className="grid gap-4 px-4 py-4 sm:px-5">
          {slotsQuery.isPending ? (
            <p className="rounded-lg border border-[var(--color-border)] bg-[#ffffff] px-4 py-4 text-xs text-[var(--color-muted-strong)]">
              Buscando horarios disponibles...
            </p>
          ) : days.length > 0 ? (
            <>
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-muted)]">
                  Día
                </h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {days.slice(0, 9).map((day) => (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => {
                        setSelectedDay(day.date);
                        setStartsAt("");
                      }}
                      style={{ fontSize: "0.6875rem" }}
                      className={`rounded-lg border px-3 py-2.5 text-left text-[0.6875rem] transition ${
                        effectiveSelectedDay === day.date
                          ? "border-[var(--color-ink)] bg-[rgba(32,24,54,0.055)]"
                          : "border-[var(--color-border)] bg-[#ffffff] hover:border-[var(--color-accent)]"
                      }`}
                    >
                      <span className="block font-semibold capitalize text-[var(--color-ink)]">
                        {dayLabel(day.date)}
                      </span>
                      <span className="mt-1 block text-[0.625rem] text-[var(--color-muted)]">
                        {day.slots.length} horarios
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-muted)]">
                  Hora
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedSlots.map((slot) => (
                    <button
                      key={slot.startsAt}
                      type="button"
                      onClick={() => setStartsAt(slot.startsAt)}
                      style={{ fontSize: "0.6875rem" }}
                      className={`rounded-md border px-3 py-1.5 font-mono text-[0.6875rem] font-semibold transition ${
                        startsAt === slot.startsAt
                          ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-button-text)]"
                          : "border-[var(--color-border)] bg-[#ffffff] text-[var(--color-ink)] hover:border-[var(--color-accent)]"
                      }`}
                    >
                      {slot.time}
                    </button>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-[var(--color-border)] bg-[#ffffff] px-4 py-3 text-xs text-[var(--color-muted-strong)]">
              No encontramos horarios disponibles para este turno.
            </p>
          )}

          {error && <p className="text-xs font-semibold text-[#b42318]">{error}</p>}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-[var(--color-border)] px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            style={{ fontSize: "0.75rem", lineHeight: "1rem" }}
            className="h-8 rounded-md border border-[var(--color-border-strong)] bg-[#ffffff] px-3 font-semibold text-[var(--color-ink)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!startsAt || isSaving}
            onClick={() => void handleSubmit()}
            style={{ fontSize: "0.75rem", lineHeight: "1rem" }}
            className={`h-8 rounded-md px-3 font-semibold transition ${
              startsAt && !isSaving
                ? "bg-[var(--color-ink)] text-[var(--color-button-text)] hover:-translate-y-0.5"
                : "cursor-not-allowed bg-[rgba(32,24,54,0.12)] text-[var(--color-muted)]"
            }`}
          >
            {isSaving ? "Guardando..." : "Guardar cambio"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[var(--color-border)] bg-[#ffffff] p-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[rgba(32,24,54,0.055)]">
        <img src={icon} alt="" aria-hidden="true" className="h-4 w-4 opacity-85" />
      </span>
      <span className="min-w-0">
        <span className="block text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-[var(--color-muted)]">
          {label}
        </span>
        <strong className="mt-1 block text-[0.6875rem] font-semibold capitalize leading-4 text-[var(--color-ink)]">
          {value}
        </strong>
      </span>
    </div>
  );
}
