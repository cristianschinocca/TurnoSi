import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useEffect } from "react";

import calendarIcon from "../../components/assets/icons/appointments/calendar.svg";
import clockIcon from "../../components/assets/icons/appointments/clock.svg";
import userIcon from "../../components/assets/icons/appointments/user.svg";
import { ModalCloseButton } from "../../components/ui";
import { buttonMotionClass } from "./dashboard.constants";
import {
  getDepositPaymentBadgeClassName,
  getDepositPaymentLabel,
  type DashboardAppointment
} from "./dashboard.data";

type AppointmentDetailsModalProps = {
  appointment: DashboardAppointment;
  onClose: () => void;
  onRequestReschedule?: () => void;
  onRequestStatusChange: () => void;
};

export function AppointmentDetailsModal({
  appointment,
  onClose,
  onRequestReschedule,
  onRequestStatusChange
}: AppointmentDetailsModalProps) {
  const startsAt = appointment.startsAt ? new Date(appointment.startsAt) : null;
  const dateLabel = startsAt
    ? format(startsAt, "EEEE dd 'de' MMMM 'de' yyyy", { locale: es })
    : appointment.day ?? "Fecha no disponible";
  const compactDateLabel = startsAt
    ? format(startsAt, "EEEE dd 'de' MMMM 'de' yyyy", { locale: es })
    : appointment.day ?? "Fecha no disponible";
  const dateTimeLabel = `${dateLabel}, ${appointment.time}`;
  const depositLabel = getDepositPaymentLabel(appointment);
  const isPending = appointment.status === "En espera";
  const primaryStatusActionLabel = isPending ? "Confirmar turno" : "Cambiar estado";

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="viewport-overlay modal-overlay-enter z-[100] grid place-items-center bg-[rgba(32,24,54,0.58)] p-3 backdrop-blur-sm"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="appointment-details-title"
        className="modal-panel-enter modal-scroll-panel w-full max-w-xl overflow-x-hidden rounded-xl border border-[rgba(32,24,54,0.12)] bg-[#ffffff] shadow-[0_28px_90px_rgba(32,24,54,0.34)]"
      >
        <div className="relative overflow-hidden px-4 pb-4 pt-4 sm:px-5 sm:pb-5 sm:pt-5">
          <div className="pointer-events-none absolute -right-20 -top-24 h-48 w-48 rounded-full border border-[rgba(32,24,54,0.05)]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-muted)]">
                Detalle del turno
              </p>
              <h2
                id="appointment-details-title"
                className="mt-3 truncate text-lg font-semibold leading-tight text-[var(--color-ink)]"
              >
                {appointment.service}
              </h2>
              <p className="mt-1 truncate text-sm text-[var(--color-muted)]">
                {appointment.client}
              </p>
            </div>
            <ModalCloseButton onClick={onClose} />
          </div>

          <div className="mt-4 flex flex-col gap-2 text-xs text-[var(--color-ink)] sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <MetaItem icon={calendarIcon} value={compactDateLabel} capitalize />
            <MetaDivider />
            <MetaItem icon={clockIcon} value={appointment.time} />
            <MetaDivider />
            <MetaItem icon={userIcon} value={appointment.assignee || "Sin asignar"} />
          </div>
        </div>

        <div className="border-t border-[var(--color-border)] px-4 sm:px-5">
          <div className="divide-y divide-[var(--color-border)]">
            <AppointmentDetail label="Cliente" value={appointment.client} />
            <AppointmentDetail
              label="Contacto"
              value={appointment.customerPhone || "Sin teléfono cargado"}
            />
            <AppointmentStatusDetail
              status={appointment.status}
              onClick={onRequestStatusChange}
            />
            <AppointmentDetail label="Origen" value={appointment.channel} />
            <AppointmentDetail
              label="Profesional"
              value={appointment.assignee || "Sin asignar"}
            />
            <AppointmentDetail label="Fecha y hora" value={dateTimeLabel} capitalize />
            {depositLabel && (
              <div className="flex items-center justify-between gap-5 py-3 text-xs">
                <span className="text-[var(--color-muted-strong)]">Seña</span>
                <span className={getDepositPaymentBadgeClassName(appointment)}>
                  {depositLabel}
                </span>
              </div>
            )}
          </div>
        </div>

        <footer className="mt-1 flex flex-col-reverse gap-2 border-t border-[var(--color-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <button
            type="button"
            onClick={onClose}
            style={{ fontSize: "0.75rem", lineHeight: "1rem" }}
            className={`h-8 w-full rounded-md border border-[var(--color-border-strong)] bg-[#ffffff] px-3 font-semibold text-[var(--color-muted)] transition hover:border-[var(--color-ink)] hover:text-[var(--color-ink)] sm:w-auto ${buttonMotionClass}`}
          >
            Cancelar
          </button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onRequestReschedule}
              disabled={!onRequestReschedule}
              style={{ fontSize: "0.75rem", lineHeight: "1rem" }}
              className={`h-8 rounded-md border border-[var(--color-border-strong)] bg-[#ffffff] px-3 font-semibold text-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-50 ${buttonMotionClass}`}
            >
              Reprogramar turno
            </button>
            <button
              type="button"
              onClick={onRequestStatusChange}
              style={{ fontSize: "0.75rem", lineHeight: "1rem" }}
              className={`h-8 rounded-md px-3 font-semibold ${
                isPending
                  ? "bg-[var(--color-ink)] text-[var(--color-button-text)]"
                  : "border border-[var(--color-border-strong)] bg-[#ffffff] text-[var(--color-ink)] shadow-none"
              } ${buttonMotionClass}`}
            >
              {primaryStatusActionLabel}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function MetaItem({
  capitalize = false,
  icon,
  value
}: {
  capitalize?: boolean;
  icon: string;
  value: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[rgba(32,24,54,0.055)]">
        <img src={icon} alt="" aria-hidden="true" className="h-4 w-4 opacity-85" />
      </span>
      <span className={`truncate font-medium ${capitalize ? "capitalize" : ""}`}>
        {value}
      </span>
    </span>
  );
}

function MetaDivider() {
  return (
    <span
      aria-hidden="true"
      className="hidden h-7 w-px bg-[var(--color-border)] sm:block"
    />
  );
}

function AppointmentStatusDetail({
  onClick,
  status
}: {
  onClick: () => void;
  status: string;
}) {
  return (
    <div className="flex items-center justify-between gap-5 py-3 text-xs">
      <span className="text-[var(--color-muted-strong)]">Estado</span>
      <button
        type="button"
        onClick={onClick}
        aria-label="Cambiar estado"
        className="inline-flex items-center gap-2 rounded-full bg-[rgba(253,134,6,0.12)] px-2.5 py-1 text-xs font-medium text-[var(--color-accent)] transition hover:bg-[rgba(253,134,6,0.18)]"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
        {status}
      </button>
    </div>
  );
}

function AppointmentDetail({
  capitalize = false,
  label,
  value
}: {
  capitalize?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-5 py-3 text-xs">
      <span className="text-[var(--color-muted-strong)]">{label}</span>
      <strong
        className={`text-right font-semibold text-[var(--color-ink)] ${
          capitalize ? "capitalize" : ""
        }`}
      >
        {value}
      </strong>
    </div>
  );
}
