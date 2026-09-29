import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useEffect } from "react";

import trashIcon from "../../components/assets/icons/actions/trash.svg";
import { ModalCloseButton } from "../../components/ui";
import {
  buttonMotionClass,
  getStatusModalDescription,
  statusClassName,
  statusCorrectionOptions,
  statusDotClassName,
  statusModalLabel,
  statusTransitionOptions,
  type AppointmentStatusLabel,
  type StatusChangeDraft
} from "./dashboard.constants";

type StatusChangeModalProps = {
  draft: StatusChangeDraft;
  isConfirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onClearDepositPayment?: () => void;
  onDepositPaymentChange: (
    updates: Partial<Pick<StatusChangeDraft, "depositAmount" | "depositMethod">>
  ) => void;
  onSelectNextStatus: (status: AppointmentStatusLabel) => void;
};

export function StatusChangeModal({
  draft,
  isConfirming = false,
  onCancel,
  onClearDepositPayment,
  onConfirm,
  onDepositPaymentChange,
  onSelectNextStatus
}: StatusChangeModalProps) {
  const options = draft.isCorrection
    ? statusCorrectionOptions[draft.currentStatus]
    : statusTransitionOptions[draft.currentStatus].filter(
        (status) => status !== draft.currentStatus
      );
  const startsAt = draft.appointment.startsAt
    ? new Date(draft.appointment.startsAt)
    : null;
  const appointmentDate = startsAt
    ? format(startsAt, "dd MMM yyyy", { locale: es })
    : draft.appointment.day ?? "Hoy";
  const depositAmount = Number(draft.depositAmount.replace(",", "."));
  const depositIsValid =
    draft.nextStatus !== "Señado" ||
    (Number.isFinite(depositAmount) && depositAmount > 0);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isConfirming) onCancel();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isConfirming, onCancel]);

  return (
    <div
      aria-modal="true"
      className="viewport-overlay modal-overlay-enter z-[100] grid place-items-end bg-[rgba(32,24,54,0.58)] p-3 backdrop-blur-sm sm:place-items-center"
      role="dialog"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          if (!isConfirming) onCancel();
        }
      }}
    >
      <div className="modal-panel-enter modal-scroll-panel w-full max-w-xl rounded-xl border border-[rgba(32,24,54,0.12)] bg-[#ffffff] p-4 shadow-[0_28px_90px_rgba(32,24,54,0.38)] sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
              {draft.isCorrection ? "Editar estado" : "Cambiar estado"}
            </p>
            <h2 className="mt-2 text-lg font-semibold leading-tight text-[var(--color-ink)]">
              Cambiar estado del turno
            </h2>
          </div>
          <ModalCloseButton disabled={isConfirming} onClick={onCancel} />
        </div>

        <section className="mt-4 rounded-lg border border-[var(--color-border)] bg-[#ffffff] p-3">
          <div className="border-l-2 border-[var(--color-ink)] pl-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
                {draft.appointment.service}
              </p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                {draft.appointment.client} · {appointmentDate} · {draft.appointment.time}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 border-t border-[var(--color-border)] pt-3 text-xs sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[var(--color-muted-strong)]">Estado actual</span>
              <span
                  className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  statusClassName[draft.currentStatus]
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                {draft.currentStatus}
              </span>
            </div>
            {draft.currentStatus === "Señado" && onClearDepositPayment && (
              <button
                type="button"
                disabled={isConfirming}
                onClick={onClearDepositPayment}
                className={`inline-flex w-fit items-center gap-2 rounded-md border border-[#e7b9b2] bg-[#ffffff] px-3 py-1.5 text-xs font-semibold text-[#b42318] disabled:cursor-not-allowed disabled:opacity-60 ${buttonMotionClass}`}
              >
                <img src={trashIcon} alt="" aria-hidden="true" className="h-4 w-4" />
                Eliminar seña
              </button>
            )}
          </div>
        </section>

        <section className="mt-4">
          <h3 className="text-xs font-semibold text-[var(--color-muted-strong)]">
            Seleccioná el nuevo estado
          </h3>
          <div className="mt-3 divide-y divide-[var(--color-border)]">
          {options.map((status) => (
            <button
              key={status}
              type="button"
              disabled={isConfirming}
              onClick={() => onSelectNextStatus(status)}
              className={`group flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 sm:px-3 ${
                draft.nextStatus === status
                    ? "border border-[rgba(32,24,54,0.16)] bg-[rgba(32,24,54,0.04)]"
                  : "border border-transparent hover:bg-[rgba(32,24,54,0.025)]"
              }`}
            >
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${
                  draft.nextStatus === status
                    ? "border-[var(--color-ink)]"
                    : "border-[rgba(32,24,54,0.28)]"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    draft.nextStatus === status
                      ? statusDotClassName[status]
                      : "bg-transparent"
                  }`}
                />
              </span>
              <span className="grid min-w-0 gap-1 sm:grid-cols-[150px_1fr] sm:items-center">
                <span className="text-xs font-semibold text-[var(--color-ink)]">
                  {statusModalLabel[status]}
                </span>
                <span className="text-[0.6875rem] text-[var(--color-muted)]">
                  {getStatusModalDescription(status)}
                </span>
              </span>
            </button>
          ))}
          </div>
        </section>

        {draft.nextStatus === "Señado" && (
          <section className="mt-4 rounded-lg border border-[rgba(86,145,101,0.22)] bg-[rgba(86,145,101,0.045)] p-3">
            <p className="text-xs font-semibold text-[var(--color-ink)]">
              Datos de la seña
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_190px]">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                  Monto
                </span>
                <input
                  value={draft.depositAmount}
                  disabled={isConfirming}
                  inputMode="decimal"
                  onChange={(event) =>
                    onDepositPaymentChange({ depositAmount: event.target.value })
                  }
                  placeholder="Ej: 1500"
                  className="h-9 w-full rounded-md border border-[var(--color-border-strong)] bg-[#ffffff] px-3 text-xs font-semibold text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[rgba(253,134,6,0.16)] disabled:opacity-60"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                  Medio
                </span>
                <select
                  value={draft.depositMethod}
                  disabled={isConfirming}
                  onChange={(event) =>
                    onDepositPaymentChange({
                      depositMethod: event.target.value as StatusChangeDraft["depositMethod"]
                    })
                  }
                  className="h-9 w-full rounded-md border border-[var(--color-border-strong)] bg-[#ffffff] px-3 text-xs font-semibold text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[rgba(253,134,6,0.16)] disabled:opacity-60"
                >
                  <option value="cash">Efectivo</option>
                  <option value="bank_transfer">Transferencia</option>
                  <option value="other">Otro</option>
                </select>
              </label>
            </div>
            {!depositIsValid && (
              <p className="mt-2 text-xs font-semibold text-[#b42318]">
                Ingresá un monto válido para registrar la seña.
              </p>
            )}
          </section>
        )}

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={isConfirming}
            onClick={onCancel}
            style={{ fontSize: "0.75rem", lineHeight: "1rem" }}
            className={`h-8 rounded-md border border-[var(--color-border-strong)] bg-[#ffffff] px-3 font-semibold text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-60 ${buttonMotionClass}`}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!draft.nextStatus || !depositIsValid || isConfirming}
            onClick={onConfirm}
            style={{ fontSize: "0.75rem", lineHeight: "1rem" }}
            className={`h-8 rounded-md px-3 font-semibold ${buttonMotionClass} ${
              draft.nextStatus
                ? "bg-[var(--color-ink)] text-[var(--color-button-text)]"
                : "cursor-not-allowed bg-[rgba(32,24,54,0.12)] text-[var(--color-muted)]"
            }`}
          >
            {isConfirming ? "Guardando..." : "Guardar cambio"}
          </button>
        </div>
      </div>
    </div>
  );
}
