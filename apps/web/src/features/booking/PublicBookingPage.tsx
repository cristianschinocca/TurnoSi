import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatArsCents } from "../../lib/format";

import { PageLayout } from "../../components/layout/PageLayout";
import { ApiError } from "../../lib/api";
import { queryKeys } from "../../lib/query-keys";
import { parseFormData } from "../../utils/validation";
import {
  createPublicAppointment,
  getPublicGalleryImageUrl,
  getPublicBooking,
  getPublicLogoUrl,
  getPublicSlots,
  type PublicBookingData
} from "./booking.api";
import { bookingConfirmSchema } from "./booking.schemas";

type PublicBookingPageProps = { brand: ReactNode };
type BookingStep = "branch" | "service" | "professional" | "schedule" | "details" | "success";
type ConfirmedAppointment = {
  branch: string;
  service: string;
  professional: string;
  date: string;
  time: string;
};

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  timeZone: "UTC"
});

const longDateFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC"
});

function formatPrice(priceCents: number | null) {
  return formatArsCents(priceCents);
}

function formatPublicPhone(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!digits) return "";
  if (digits.startsWith("549") && digits.length > 5) {
    return `+54 9 ${digits.slice(3)}`;
  }
  if (digits.startsWith("54") && digits.length > 4) {
    return `+54 ${digits.slice(2)}`;
  }
  return digits.replace(/^0+/, "");
}

function getValidText(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  if (!text || ["null", "undefined", "-", "."].includes(text.toLowerCase())) {
    return "";
  }
  return text;
}

function getUsefulDescription(value: string | null | undefined, fallback: string) {
  const text = getValidText(value);
  if (!text || text.toLowerCase() === fallback.trim().toLowerCase()) return "";
  return text;
}

function normalizeWhatsappNumber(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!digits) return "";
  if (digits.startsWith("54")) return digits;
  return `549${digits.replace(/^0+/, "")}`;
}

function buildWhatsappUrl(phone: string | null | undefined, message: string) {
  const normalizedPhone = normalizeWhatsappNumber(phone);
  if (!normalizedPhone) return "";
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

function isResourceOnlyBooking(category: string | null) {
  return category?.toLowerCase().includes("cancha") ?? false;
}

export function PublicBookingPage({ brand }: PublicBookingPageProps) {
  const { organizationSlug = "" } = useParams();
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [step, setStep] = useState<BookingStep>("service");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedAppointment, setConfirmedAppointment] =
    useState<ConfirmedAppointment | null>(null);
  const queryClient = useQueryClient();
  const bookingQuery = useQuery({
    queryKey: queryKeys.publicBooking(organizationSlug),
    queryFn: () => getPublicBooking(organizationSlug),
    staleTime: 0,
    refetchOnMount: "always"
  });
  const data: PublicBookingData | undefined = bookingQuery.data;
  const fallbackBranchId =
    data && data.branches.length <= 1 ? data.branches[0]?.id ?? "" : "";
  const activeBranchId = selectedBranchId || fallbackBranchId;
  const slotsQuery = useQuery({
    queryKey: queryKeys.publicSlots(
      organizationSlug,
      selectedServiceId,
      selectedAssigneeId || "auto",
      activeBranchId || "main"
    ),
    queryFn: () =>
      getPublicSlots(
        organizationSlug,
        selectedServiceId,
        activeBranchId || undefined,
        selectedAssigneeId || undefined
      ),
    enabled: Boolean(selectedServiceId) && Boolean(activeBranchId),
    staleTime: 30 * 1000
  });
  const days = slotsQuery.data?.days ?? [];
  const galleryImageSlots =
    data?.organization.galleryImageSlots.filter(
      (slot): slot is 0 | 1 => slot === 0 || slot === 1
    ) ?? [];

  if (bookingQuery.isPending) {
    return (
      <PageLayout>
        <main className="booking-page mx-auto w-full max-w-7xl px-3 py-4 sm:px-5 sm:py-8">
          <section className="booking-hero mb-6 grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(390px,1fr)]">
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="booking-skeleton h-20 w-20 rounded-xl" />
                <div className="flex-1 space-y-3">
                  <div className="booking-skeleton h-3 w-28 rounded-full" />
                  <div className="booking-skeleton h-10 w-64 max-w-full rounded-lg" />
                  <div className="booking-skeleton h-4 w-full max-w-md rounded-full" />
                  <div className="booking-skeleton h-4 w-3/4 max-w-sm rounded-full" />
                </div>
              </div>
              <div className="border-t border-[var(--color-border)] pt-5">
                <div className="booking-skeleton h-3 w-20 rounded-full" />
                <div className="mt-3 booking-skeleton h-5 w-56 max-w-full rounded-full" />
                <div className="mt-5 grid gap-3">
                  <div className="booking-skeleton h-4 w-full rounded-full" />
                  <div className="booking-skeleton h-4 w-5/6 rounded-full" />
                  <div className="booking-skeleton h-4 w-2/3 rounded-full" />
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
              <div className="booking-skeleton min-h-[300px] rounded-2xl" />
              <div className="booking-skeleton min-h-[300px] rounded-2xl" />
            </div>
          </section>
          <div className="booking-stepper mb-5 p-3">
            <div className="grid grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="booking-skeleton h-9 rounded-lg" />
              ))}
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="booking-step-card p-5">
              <div className="booking-skeleton h-4 w-20 rounded-full" />
              <div className="mt-3 booking-skeleton h-7 w-64 max-w-full rounded-lg" />
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="booking-skeleton h-28 rounded-xl" />
                <div className="booking-skeleton h-28 rounded-xl" />
              </div>
            </div>
            <aside className="booking-summary h-72 p-6" />
          </div>
        </main>
      </PageLayout>
    );
  }
  if (!data) {
    const isNotFound =
      bookingQuery.error instanceof ApiError &&
      bookingQuery.error.status === 404;

    return (
      <PageLayout>
        <div className="grid min-h-screen bg-[var(--color-page)] px-5 py-8">
          <div className="mx-auto flex w-full max-w-3xl flex-col justify-between gap-8">
            <header className="flex items-center rounded-2xl bg-[var(--color-ink)] px-4 py-3 text-white shadow-[0_12px_30px_rgba(36,36,36,0.18)] [&_img]:h-12 sm:[&_img]:h-16">
              {brand}
            </header>

            <main className="flex flex-1 items-center justify-center">
              <section className="w-full rounded-3xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.9)] px-6 py-10 text-center shadow-[0_18px_50px_rgba(36,36,36,0.06)] sm:px-10">
                <p className="font-mono text-6xl font-semibold text-[var(--color-accent)]">
                  {isNotFound ? "404" : "!"}
                </p>
                <h1 className="mt-4 text-3xl font-semibold text-[var(--color-ink)]">
                  {isNotFound
                    ? "No encontramos este negocio"
                    : "No pudimos cargar la reserva"}
                </h1>
                <p className="mt-3 text-sm leading-7 text-[var(--color-muted-strong)]">
                  {isNotFound
                    ? "El enlace no corresponde a un negocio activo o fue escrito con un error."
                    : "Hubo un problema temporal al consultar la disponibilidad. Probá de nuevo en unos segundos."}
                </p>
                <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                  <Link
                    to="/"
                    className="rounded-md bg-[var(--color-ink)] px-5 py-3 text-sm font-medium text-[var(--color-button-text)] hover:bg-[var(--color-accent)]"
                  >
                    Volver al inicio
                  </Link>
                  <Link
                    to="/login"
                    className="rounded-md border border-[var(--color-border-strong)] px-5 py-3 text-sm font-medium text-[var(--color-ink)] hover:bg-white/60"
                  >
                    Ir al acceso
                  </Link>
                </div>
              </section>
            </main>
          </div>
        </div>
      </PageLayout>
    );
  }

  const organizationName = data.organization.name;
  const serviceId = selectedServiceId;
  const resourceOnlyBooking = isResourceOnlyBooking(data.organization.category);
  const hasBranchStep = data.branches.length > 1;
  const activeStep: BookingStep =
    hasBranchStep && !selectedBranchId && step !== "success" ? "branch" : step;
  const selectedBranch =
    data.branches.find((branch) => branch.id === activeBranchId) ??
    data.branches.find((branch) => branch.isMain) ??
    data.branches[0];
  const availableTeam = activeBranchId
    ? data.team.filter((member) => member.branchIds.includes(activeBranchId))
    : data.team;
  const suggestedAssigneeId = slotsQuery.data?.suggestedAssigneeId ?? null;
  const selectedAssignee =
    availableTeam.find((member) => member.id === selectedAssigneeId) ?? null;
  const suggestedAssignee =
    availableTeam.find((member) => member.id === suggestedAssigneeId) ?? null;
  const date = days.some((day) => day.date === selectedDate) ? selectedDate : "";
  const service = data.services.find((item) => item.id === serviceId);
  const selectedServiceName = service?.name || "";
  const deposit = data.organization.deposit;
  const selectedDay = days.find((day) => day.date === date);
  const selectedSlot = selectedDay?.slots.find((slot) => slot.startsAt === startsAt);
  const publicPhone = selectedBranch?.phone ?? data.organization.phone;
  const publicWhatsapp = selectedBranch?.whatsapp ?? data.organization.whatsapp;
  const formattedPublicPhone = formatPublicPhone(publicPhone);
  const formattedPublicWhatsapp = formatPublicPhone(publicWhatsapp);
  const publicDescription = getValidText(data.organization.description);
  const publicEmail = getValidText(data.organization.publicEmail);
  const galleryFocusBySlot = new Map(
    data.organization.galleryFocus.map((item) => [item.slot, item])
  );
  const galleryVersionBySlot = new Map(
    data.organization.galleryVersions.map((item) => [item.slot, item.version])
  );
  const publicLocation = [
    selectedBranch?.address ?? data.organization.address,
    selectedBranch?.city ?? data.organization.city,
    selectedBranch?.province ?? data.organization.province
  ]
    .filter(Boolean)
    .join(", ");
  const steps = [
    ...(hasBranchStep ? [{ id: "branch" as const, label: "Sede" }] : []),
    { id: "service" as const, label: resourceOnlyBooking ? "Cancha" : "Servicio" },
    ...(!resourceOnlyBooking && availableTeam.length > 0
      ? [{ id: "professional" as const, label: "Profesional" }]
      : []),
    { id: "schedule" as const, label: "Fecha y hora" },
    { id: "details" as const, label: "Tus datos" }
  ];
  const currentStepIndex = steps.findIndex((item) => item.id === activeStep);
  const stepNumber = (id: BookingStep) =>
    Math.max(1, steps.findIndex((item) => item.id === id) + 1);

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const result = parseFormData(
      bookingConfirmSchema,
      Object.fromEntries(new FormData(event.currentTarget).entries())
    );
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    if (!serviceId || !startsAt) {
      setStatus("Elegí un horario para continuar.");
      return;
    }
    setIsSubmitting(true);
    try {
      const confirmation = {
        branch: selectedBranch?.name ?? "",
        service: selectedServiceName || "Cancha",
        professional:
          selectedAssignee?.name ??
          suggestedAssignee?.name ??
          (resourceOnlyBooking ? "" : "Profesional según disponibilidad"),
        date,
        time: selectedSlot?.time ?? ""
      };
      const whatsappMessage = [
        `Hola, solicité un turno en ${organizationName}.`,
        "",
        `Nombre: ${result.parsed.name}`,
        `WhatsApp: ${result.parsed.phone}`,
        confirmation.branch ? `Sede: ${confirmation.branch}` : "",
        `${resourceOnlyBooking ? "Cancha" : "Servicio"}: ${confirmation.service}`,
        `Fecha: ${longDateFormatter.format(new Date(`${date}T00:00:00Z`))}`,
        `Horario: ${confirmation.time}`,
        !resourceOnlyBooking && confirmation.professional
          ? `Profesional: ${confirmation.professional}`
          : ""
      ]
        .filter(Boolean)
        .join("\n");
      const whatsappUrl = buildWhatsappUrl(publicWhatsapp || publicPhone, whatsappMessage);
      const appointmentResponse = await createPublicAppointment(organizationSlug, {
        ...result.parsed,
        serviceId,
        branchId: activeBranchId || undefined,
        startsAt,
        assigneeId: selectedAssigneeId || undefined
      });
      if (appointmentResponse.data.checkoutUrl) {
        setStatus("Reserva iniciada. Te llevamos a Mercado Pago para pagar la seña.");
        window.location.assign(appointmentResponse.data.checkoutUrl);
        return;
      }
      setErrors({});
      setStatus(
        whatsappUrl
          ? "Tu reserva quedó recibida. Te llevamos a WhatsApp para avisarle al local."
          : "Tu reserva quedó recibida y espera confirmación del local."
      );
      setConfirmedAppointment(confirmation);
      setStep("success");
      void queryClient.invalidateQueries({
        queryKey: queryKeys.publicSlots(
          organizationSlug,
          serviceId,
          selectedAssigneeId || "auto",
          activeBranchId || "main"
        )
      });
      if (whatsappUrl) {
        window.setTimeout(() => {
          window.location.assign(whatsappUrl);
        }, 800);
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === "SLOT_UNAVAILABLE") {
        setStartsAt("");
        setStep("schedule");
      }
      if (error instanceof ApiError && error.code === "CUSTOMER_DAILY_LIMIT") {
        setStep("schedule");
      }
      setStatus(
        error instanceof ApiError && error.code === "SLOT_UNAVAILABLE"
          ? "Ese horario acaba de ocuparse. Elegí otro."
          : error instanceof ApiError && error.code === "CUSTOMER_DAILY_LIMIT"
            ? "Ya tenés un turno reservado para ese día. Si necesitás cambiarlo, escribile al local."
            : "No pudimos confirmar el turno."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageLayout>
      <main className="booking-page mx-auto w-full max-w-7xl px-3 py-4 sm:px-5 sm:py-8">
        <section className="booking-public-hero mb-5 grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)] lg:items-stretch">
          <div className="booking-business-copy flex min-w-0 flex-col">
            <div className="flex min-w-0 items-start gap-4">
              {data.organization.hasLogo ? (
                <img
                  src={getPublicLogoUrl(
                    organizationSlug,
                    data.organization.logoVersion
                  )}
                  alt={data.organization.name}
                  className="h-20 w-20 shrink-0 rounded-2xl border border-[var(--color-border)] bg-white object-cover sm:h-24 sm:w-24"
                />
              ) : null}
              <div className="min-w-0">
                <p className="booking-kicker text-xs font-semibold uppercase text-[var(--color-muted)]">
                  Reserva online
                </p>
                <h1 className="mt-1 truncate text-3xl font-semibold leading-tight text-[var(--color-ink)] sm:text-4xl">
                  {data.organization.name}
                </h1>
                <p className="mt-2 text-sm leading-6 text-[var(--color-muted-strong)] sm:text-base">
                  Reservá en pocos pasos: servicio, profesional, fecha y tus datos.
                </p>
              </div>
            </div>

            <div className="booking-venue-panel mt-5">
              <div className="booking-venue-details">
                <p className="font-medium text-[var(--color-ink)]">
                  {[data.organization.category, selectedBranch?.city ?? data.organization.city]
                    .filter(Boolean)
                    .join(" · ") || "Turnos online"}
                </p>
                {publicDescription && (
                  <p className="booking-venue-description">
                    {publicDescription}
                  </p>
                )}
                {publicLocation && (
                  <p className="booking-venue-row">
                    <span>Dirección</span>
                    <strong>{publicLocation}</strong>
                  </p>
                )}
                {(formattedPublicWhatsapp || formattedPublicPhone) && (
                  <p className="booking-venue-row">
                    <span>Contacto</span>
                    <a
                      href={`tel:${(publicWhatsapp || publicPhone || "").replace(/\D/g, "")}`}
                    >
                      {formattedPublicWhatsapp || formattedPublicPhone}
                    </a>
                  </p>
                )}
                {publicEmail && (
                  <p className="booking-venue-row">
                    <span>Email</span>
                    <a href={`mailto:${publicEmail}`}>{publicEmail}</a>
                  </p>
                )}
              </div>
            </div>

            <p className="mt-auto hidden pt-5 text-xs text-[var(--color-muted)] lg:block">
              Los horarios disponibles se calculan en tiempo real según la agenda del local.
            </p>
          </div>

          <div
            className={`booking-gallery booking-cover-grid ${
              galleryImageSlots.length > 1 ? "sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.72fr)]" : ""
            }`}
          >
            {galleryImageSlots.length > 0 ? (
              galleryImageSlots.slice(0, 2).map((slot, index) => (
                <div
                  key={slot}
                  className={`booking-gallery-frame booking-cover-frame overflow-hidden border border-[var(--color-border)] bg-[rgba(36,36,36,0.06)] ${
                    index === 0 ? "booking-cover-main" : "booking-cover-side"
                  }`}
                >
                  <img
                    src={getPublicGalleryImageUrl(
                      organizationSlug,
                      slot,
                      galleryVersionBySlot.get(slot) ?? null
                    )}
                    alt={`${data.organization.name} ${slot + 1}`}
                    className="h-full w-full object-cover"
                    style={{
                      objectPosition: `${galleryFocusBySlot.get(slot)?.focusX ?? 50}% ${
                        galleryFocusBySlot.get(slot)?.focusY ?? 50
                      }%`,
                      transform: `scale(${(galleryFocusBySlot.get(slot)?.zoom ?? 100) / 100})`,
                      transformOrigin: `${galleryFocusBySlot.get(slot)?.focusX ?? 50}% ${
                        galleryFocusBySlot.get(slot)?.focusY ?? 50
                      }%`
                    }}
                  />
                </div>
              ))
            ) : (
              <div className="booking-gallery-empty booking-cover-empty grid min-h-[260px] place-items-center p-6 text-center sm:min-h-[330px]">
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    {data.organization.name}
                  </p>
                  <p className="mt-3 text-xl font-semibold text-[var(--color-ink)]">
                    Tu próxima visita empieza acá
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {activeStep !== "success" && (
          <nav className="booking-stepper mb-4 p-2 sm:p-3" aria-label="Pasos de reserva">
            <ol
              className="grid gap-1 sm:flex sm:items-center sm:gap-0"
              style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
            >
              {steps.map((item, index) => {
                const active = item.id === activeStep;
                const completed = index < currentStepIndex;
                return (
                  <li key={item.id} className="flex min-w-0 items-center sm:flex-1">
                    <button
                      type="button"
                      disabled={!completed}
                      onClick={() => setStep(item.id)}
                      aria-current={active ? "step" : undefined}
                      className={`booking-step-button flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 text-center text-[10px] sm:flex-row sm:gap-2 sm:px-2 sm:text-sm ${
                        active
                          ? "font-semibold text-[var(--color-ink)]"
                          : completed
                            ? "text-[var(--color-muted-strong)]"
                            : "text-[var(--color-muted)]"
                      }`}
                    >
                      <span
                        className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${
                          active || completed
                            ? "bg-[var(--color-ink)] text-white shadow-[0_8px_18px_rgba(36,36,36,0.16)]"
                            : "border border-[var(--color-border-strong)]"
                        }`}
                      >
                        {completed ? "✓" : index + 1}
                      </span>
                      <span className="truncate">
                        <span className="hidden text-[10px] uppercase tracking-[0.08em] opacity-60 sm:block">
                          Paso {index + 1}
                        </span>
                        {item.label}
                      </span>
                    </button>
                    {index < steps.length - 1 && (
                      <span className="hidden h-px flex-1 bg-[linear-gradient(90deg,rgba(36,36,36,0.14),rgba(126,120,108,0.22),rgba(36,36,36,0.1))] sm:block" />
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        {activeStep === "success" ? (
          <section className="booking-success mx-auto max-w-2xl p-6 text-center sm:p-10">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[rgba(64,145,91,0.14)] text-2xl text-[#347548]">✓</span>
            <h2 className="mt-5 text-2xl font-semibold">Reserva recibida</h2>
            <p className="mt-2 text-sm text-[var(--color-muted-strong)]">
              Tu reserva en {data.organization.name} quedó registrada y espera confirmación.
            </p>
            <div className="mx-auto mt-6 max-w-sm divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)] bg-white/55 px-4 text-left text-sm">
              <ConfirmationRow
                label="Sede"
                value={confirmedAppointment?.branch || selectedBranch?.name || "Sede principal"}
              />
              <ConfirmationRow
                label={resourceOnlyBooking ? "Cancha" : "Servicio"}
                value={
                  confirmedAppointment?.service ??
                  (resourceOnlyBooking ? "Cancha" : "Servicio")
                }
              />
              <ConfirmationRow
                label="Fecha y hora"
                value={`${dateFormatter.format(
                  new Date(`${confirmedAppointment?.date ?? date}T00:00:00Z`)
                )} · ${confirmedAppointment?.time ?? ""}`}
              />
              {!resourceOnlyBooking && (
                <ConfirmationRow
                  label="Profesional"
                  value={
                    confirmedAppointment?.professional ??
                    "Profesional según disponibilidad"
                  }
                />
              )}
            </div>
            <p className="mt-5 text-xs text-[var(--color-muted)]">
              Guardá estos datos para recordar tu reserva.
            </p>
          </section>
        ) : (
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="booking-panel-enter">
              {activeStep === "branch" && (
                <StepCard
                  eyebrow={`Paso ${stepNumber("branch")}`}
                  title="Elegí la sede"
                  description="Seleccioná dónde querés atenderte para ver los horarios de esa sucursal."
                >
                  <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
                    {data.branches.map((branch) => {
                      const location = [branch.address, branch.city, branch.province]
                        .filter(Boolean)
                        .join(", ");
                      const area = [branch.city, branch.province].filter(Boolean).join(", ");
                      return (
                        <button
                          key={branch.id}
                          type="button"
                          onClick={() => {
                            setSelectedBranchId(branch.id);
                            setSelectedServiceId("");
                            setSelectedAssigneeId("");
                            setSelectedDate("");
                            setStartsAt("");
                          }}
                          className={`booking-choice rounded-xl border p-4 text-left ${
                            branch.id === activeBranchId
                              ? "booking-choice-selected border-[var(--color-ink)]"
                              : "border-[var(--color-border)] bg-white/55 hover:border-[var(--color-border-strong)]"
                          }`}
                        >
                          <span className="flex items-start justify-between gap-3">
                            <strong className="text-lg">{branch.name}</strong>
                            {branch.isMain && (
                              <span className="rounded-full bg-[rgba(36,36,36,0.08)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-accent)]">
                                Principal
                              </span>
                            )}
                          </span>
                          {(location || area) && (
                            <span className="mt-2 block text-sm text-[var(--color-muted-strong)]">
                              {location || area}
                            </span>
                          )}
                          {(branch.phone || branch.whatsapp) && (
                            <span className="mt-3 block text-xs font-medium text-[var(--color-muted)]">
                              {branch.whatsapp ? `WhatsApp ${branch.whatsapp}` : branch.phone}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <StepActions
                    nextDisabled={!activeBranchId}
                    onNext={() => setStep("service")}
                  />
                </StepCard>
              )}

              {activeStep === "service" && (
                <StepCard
                  eyebrow={`Paso ${stepNumber("service")}`}
                  title={
                    resourceOnlyBooking
                      ? "¿Qué cancha querés reservar?"
                      : "¿Qué servicio necesitás?"
                  }
                  description={
                    resourceOnlyBooking
                      ? "Elegí la cancha y después seleccioná un horario disponible."
                      : "Elegí una opción para consultar su disponibilidad."
                  }
                >
                  <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
                    {data.services.map((item) => {
                      const serviceDisplayName = resourceOnlyBooking
                        ? item.resourceName || item.name
                        : item.name;
                      const usefulDescription = getUsefulDescription(
                        item.description,
                        serviceDisplayName
                      );
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setSelectedServiceId(item.id);
                            setSelectedAssigneeId("");
                            setSelectedDate("");
                            setStartsAt("");
                          }}
                          className={`booking-choice rounded-xl border p-4 text-left ${
                            item.id === serviceId
                              ? "booking-choice-selected border-[var(--color-ink)]"
                              : "border-[var(--color-border)] bg-white/55 hover:border-[var(--color-border-strong)]"
                          }`}
                        >
                          <span className="flex items-start justify-between gap-3">
                            <strong className="text-lg">
                              {serviceDisplayName}
                            </strong>
                            <span className="shrink-0 text-sm font-semibold">
                              {formatPrice(item.priceCents)}
                            </span>
                          </span>
                          {usefulDescription && (
                            <span className="mt-2 block text-sm text-[var(--color-muted-strong)]">
                              {usefulDescription}
                            </span>
                          )}
                          <span className="mt-3 block text-xs font-medium text-[var(--color-muted)]">
                            {item.durationMinutes} min · Precio confirmado al elegir
                          </span>
                        </button>
                      );
                    })}
                    {data.services.length === 0 && (
                      <div className="rounded-xl border border-dashed border-[var(--color-border-strong)] bg-white/55 p-5 text-center sm:col-span-2">
                        <p className="text-base font-semibold text-[var(--color-ink)]">
                          Todavía no hay servicios para reservar
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[var(--color-muted-strong)]">
                          El local aún no publicó servicios online. Contactalo para consultar disponibilidad.
                        </p>
                        {(formattedPublicWhatsapp || formattedPublicPhone) && (
                          <p className="mt-3 text-sm font-semibold text-[var(--color-accent)]">
                            {formattedPublicWhatsapp || formattedPublicPhone}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <StepActions
                    nextDisabled={!serviceId}
                    onBack={hasBranchStep ? () => setStep("branch") : undefined}
                    onNext={() =>
                      setStep(
                        !resourceOnlyBooking && availableTeam.length > 0
                          ? "professional"
                          : "schedule"
                      )
                    }
                  />
                </StepCard>
              )}

              {activeStep === "professional" && (
                <StepCard
                  eyebrow={`Paso ${stepNumber("professional")}`}
                  title="¿Con quién querés atenderte?"
                  description="Podés elegir una persona o dejar que asignemos la mejor opción."
                >
                  <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
                    <ProfessionalOption
                      selected={selectedAssigneeId === ""}
                      title="Mejor disponibilidad"
                      detail={
                        suggestedAssignee
                          ? `Te recomendamos a ${suggestedAssignee.name}.`
                          : "Asignaremos automáticamente al profesional disponible."
                      }
                      recommended
                      onClick={() => {
                        setSelectedAssigneeId("");
                        setSelectedDate("");
                        setStartsAt("");
                      }}
                    />
                    {availableTeam.map((member) => (
                      <ProfessionalOption
                        key={member.id}
                        selected={member.id === selectedAssigneeId}
                        title={member.name}
                        detail={`Hasta ${member.hourlyCapacity} turnos por hora`}
                        recommended={member.id === suggestedAssigneeId}
                        onClick={() => {
                          setSelectedAssigneeId(member.id);
                          setSelectedDate("");
                          setStartsAt("");
                        }}
                      />
                    ))}
                  </div>
                  <StepActions
                  onBack={() => setStep("service")}
                    onNext={() => setStep("schedule")}
                  />
                </StepCard>
              )}

              {activeStep === "schedule" && (
                <StepCard
                  eyebrow={`Paso ${stepNumber("schedule")}`}
                  title="Elegí fecha y horario"
                  description="Sólo mostramos horarios realmente disponibles."
                >
                  <div className="p-4 sm:p-5">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-muted-strong)]">
                      Fecha
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {days.slice(0, 9).map((day) => (
                        <button
                          key={day.date}
                          type="button"
                          onClick={() => {
                            setSelectedDate(day.date);
                            setStartsAt("");
                          }}
                          className={`booking-date-card rounded-lg border p-3 text-left ${
                            day.date === date
                              ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white shadow-[0_12px_26px_rgba(36,36,36,0.18)]"
                              : "border-[var(--color-border)] bg-white/55"
                          }`}
                        >
                          <span className="block text-sm font-semibold">
                            {dateFormatter.format(new Date(`${day.date}T00:00:00Z`))}
                          </span>
                          <span className="mt-1 block text-xs opacity-70">
                            {day.slots.length} horarios
                          </span>
                        </button>
                      ))}
                    </div>
                    {slotsQuery.isPending && (
                      <p className="py-5 text-sm text-[var(--color-muted)]">
                        Consultando horarios...
                      </p>
                    )}
                    {!slotsQuery.isPending && days.length === 0 && (
                      <p className="py-5 text-sm text-[var(--color-muted)]">
                        No hay fechas disponibles próximamente.
                      </p>
                    )}
                    {selectedDay && (
                      <>
                        <p className="mb-3 mt-6 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-muted-strong)]">
                          Horario
                        </p>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                          {selectedDay.slots.map((slot) => (
                            <button
                              key={slot.startsAt}
                              type="button"
                              onClick={() => setStartsAt(slot.startsAt)}
                              className={`booking-time-chip rounded-md border px-3 py-2.5 text-sm font-medium ${
                                slot.startsAt === startsAt
                                  ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white shadow-[0_10px_22px_rgba(36,36,36,0.16)]"
                                  : "border-[var(--color-border)] bg-white/55"
                              }`}
                            >
                              {slot.time}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <StepActions
                    nextDisabled={!startsAt}
                    onBack={() =>
                      setStep(
                    !resourceOnlyBooking && availableTeam.length > 0
                          ? "professional"
                          : "service"
                      )
                    }
                    onNext={() => setStep("details")}
                  />
                </StepCard>
              )}

              {activeStep === "details" && (
                <StepCard
                  eyebrow={`Paso ${steps.length}`}
                  title="Completá tus datos"
                  description="Los usaremos únicamente para identificar y confirmar tu turno."
                >
              <BookingConfirmForm
                errors={errors}
                deposit={deposit}
                isSubmitting={isSubmitting}
                onSubmit={confirm}
              />
                  <div className="border-t border-[var(--color-border)] p-4 sm:p-5">
                    <button
                      type="button"
                      onClick={() => setStep("schedule")}
                      className="text-sm font-semibold text-[var(--color-muted-strong)]"
                    >
                      ← Volver a fecha y hora
                    </button>
                  </div>
                </StepCard>
              )}
            </div>

            <aside className="lg:sticky lg:top-5 lg:self-start">
              <div className="booking-summary p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                  Tu reserva
                </p>
                {hasBranchStep && (
                  <SummaryRow label="Sede" value={selectedBranch?.name ?? "Sin elegir"} />
                )}
                <SummaryRow
                  label={resourceOnlyBooking ? "Cancha" : "Servicio"}
                  value={selectedServiceName || "Sin elegir"}
                />
                {!resourceOnlyBooking && (
                  <SummaryRow
                    label="Profesional"
                    value={
                      selectedAssignee?.name ??
                      suggestedAssignee?.name ??
                      "Mejor disponibilidad"
                    }
                  />
                )}
                <SummaryRow
                  label="Fecha"
                  value={
                    date
                      ? longDateFormatter.format(new Date(`${date}T00:00:00Z`))
                      : "Sin elegir"
                  }
                />
                <SummaryRow label="Horario" value={selectedSlot?.time ?? "Sin elegir"} />
                <div className="mt-4 border-t border-[var(--color-border)] pt-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-[var(--color-muted-strong)]">Precio</span>
                    <strong className="text-2xl font-semibold text-[var(--color-ink)]">
                      {service ? formatPrice(service.priceCents) : "A confirmar"}
                    </strong>
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    Se confirma al elegir un servicio.
                  </p>
                </div>
                {deposit.enabled && deposit.amountCents ? (
                  <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[rgba(36,36,36,0.035)] p-3">
                    <span className="text-xs text-[var(--color-muted)]">Seña requerida</span>
                    <strong className="mt-1 block text-lg text-[var(--color-ink)]">
                      {formatPrice(deposit.amountCents)}
                    </strong>
                    <p className="mt-1 text-xs text-[var(--color-muted-strong)]">
                      El turno se confirma cuando Mercado Pago aprueba el pago.
                    </p>
                  </div>
                ) : null}
                {status && (
                  <p className="mt-4 rounded-xl border border-[var(--color-border)] bg-[rgba(36,36,36,0.04)] p-3 text-sm text-[var(--color-muted-strong)]">
                    {status}
                  </p>
                )}
                <div className="mt-4 border-t border-[var(--color-border)] pt-4 text-xs leading-5 text-[var(--color-muted)]">
                  {formattedPublicWhatsapp || formattedPublicPhone
                    ? `Ayuda: ${formattedPublicWhatsapp || formattedPublicPhone}`
                    : "Contactá al local si necesitás modificar tu reserva."}
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>
      <BookingFooter organization={data.organization} />
    </PageLayout>
  );
}

function BookingFooter({
  organization
}: {
  organization: PublicBookingData["organization"];
}) {
  const storedWhatsapp = organization.whatsapp?.replace(/\D/g, "") ?? "";
  const whatsappNumber = storedWhatsapp.startsWith("54")
    ? storedWhatsapp
    : storedWhatsapp
      ? `549${storedWhatsapp}`
      : "";
  const instagramUrl = organization.instagram
    ? organization.instagram.startsWith("http")
      ? organization.instagram
      : `https://instagram.com/${organization.instagram.replace(/^@/, "")}`
    : "";

  return (
    <footer className="mt-auto border-t border-[var(--color-border)] bg-[rgba(255,251,244,0.82)] px-4 py-6 backdrop-blur-sm sm:px-5">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            {organization.name}
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted-strong)]">
            Reservas online
          </p>
        </div>
        <div className="flex flex-col gap-3 text-xs text-[var(--color-muted-strong)] sm:items-end">
          <div className="flex flex-wrap gap-2">
            {whatsappNumber && (
              <a
                href={`https://wa.me/${whatsappNumber}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-[var(--color-border-strong)] px-3 py-1.5 font-semibold text-[var(--color-ink)] hover:bg-white/70"
              >
                WhatsApp
              </a>
            )}
            {instagramUrl && (
              <a
                href={instagramUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-[var(--color-border-strong)] px-3 py-1.5 font-semibold text-[var(--color-ink)] hover:bg-white/70"
              >
                Instagram
              </a>
            )}
          </div>
          <span>
            Reservas gestionadas por{" "}
            <strong className="font-semibold text-[var(--color-ink)]">Turnosi</strong>
          </span>
        </div>
      </div>
    </footer>
  );
}

function StepCard({
  children,
  description,
  eyebrow,
  title
}: {
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="booking-step-card overflow-hidden">
      <div className="border-b border-[var(--color-border)] bg-white/55 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
          {eyebrow}
        </p>
        <h2 className="mt-1.5 text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-strong)]">{description}</p>
      </div>
      {children}
    </section>
  );
}

function StepActions({
  nextDisabled = false,
  onBack,
  onNext
}: {
  nextDisabled?: boolean;
  onBack?: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-border)] bg-white/35 p-4 sm:flex-row sm:justify-between">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="w-full rounded-md px-4 py-2.5 text-sm font-semibold text-[var(--color-muted-strong)] transition hover:bg-[rgba(36,36,36,0.04)] sm:w-auto"
        >
          ← Atrás
        </button>
      ) : (
        <span />
      )}
      <button
        type="button"
        disabled={nextDisabled}
        onClick={onNext}
        className="w-full rounded-md bg-[var(--color-ink)] px-5 py-2.5 text-sm font-semibold text-[var(--color-button-text)] transition hover:bg-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
      >
        Continuar
      </button>
    </div>
  );
}

function ProfessionalOption({
  detail,
  onClick,
  recommended = false,
  selected,
  title
}: {
  detail: string;
  onClick: () => void;
  recommended?: boolean;
  selected: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`booking-choice relative rounded-xl border p-4 text-left ${
        selected
          ? "booking-choice-selected border-[var(--color-ink)]"
          : "border-[var(--color-border)] bg-white/55 hover:border-[var(--color-border-strong)]"
      }`}
    >
      <span className="flex items-center justify-between gap-3">
        <strong>{title}</strong>
        <span
          className={`grid h-5 w-5 place-items-center rounded-full border ${
            selected
              ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-xs text-white"
              : "border-[var(--color-border-strong)]"
          }`}
        >
          {selected ? "✓" : ""}
        </span>
      </span>
      <span className="mt-2 block text-sm text-[var(--color-muted-strong)]">
        {detail}
      </span>
      {recommended && (
        <span className="mt-3 inline-block rounded-full bg-[rgba(36,36,36,0.08)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-accent)]">
          Recomendado
        </span>
      )}
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3 border-t border-[var(--color-border)] pt-3">
      <span className="block text-xs font-medium text-[var(--color-muted)]">{label}</span>
      <strong className="mt-1 block text-sm font-semibold text-[var(--color-ink)]">{value}</strong>
    </div>
  );
}

function ConfirmationRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <span className="text-[var(--color-muted-strong)]">{label}</span>
      <strong className="text-right font-semibold text-[var(--color-ink)]">
        {value}
      </strong>
    </div>
  );
}

function BookingConfirmForm({
  deposit,
  errors,
  isSubmitting,
  onSubmit
}: {
  deposit: PublicBookingData["organization"]["deposit"];
  errors: Record<string, string>;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const fields = [
    {
      autoComplete: "name",
      label: "Nombre completo",
      name: "name",
      placeholder: "Ej: Laura Méndez",
      type: "text"
    },
    {
      autoComplete: "tel",
      label: "WhatsApp",
      name: "phone",
      placeholder: "Ej: 1123456789",
      type: "tel"
    },
    {
      autoComplete: "email",
      label: "Email",
      name: "email",
      placeholder: "Ej: cliente@email.com",
      type: "email"
    }
  ];

  return (
    <form onSubmit={onSubmit} className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
      {fields.map(({ autoComplete, label, name, placeholder, type }) => (
        <label
          key={name}
          className={`block text-xs font-medium text-[var(--color-muted-strong)] ${
            name === "email" ? "sm:col-span-2" : ""
          }`}
        >
          {label}
          <input
            autoComplete={autoComplete}
            name={name}
            placeholder={placeholder}
            type={type}
            className="mt-1.5 h-11 w-full rounded-md border border-[var(--color-border-strong)] bg-white/76 px-3 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[rgba(36,36,36,0.14)]"
          />
          {errors[name] && (
            <span className="mt-1 block text-[#a33b32]">{errors[name]}</span>
          )}
        </label>
      ))}
      {deposit.enabled && deposit.amountCents ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white/70 p-3 text-sm text-[var(--color-muted-strong)] sm:col-span-2">
          Para confirmar el turno vas a pagar una seña de{" "}
          <strong className="text-[var(--color-ink)]">
            {formatPrice(deposit.amountCents)}
          </strong>{" "}
          por Mercado Pago.
        </div>
      ) : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-1 rounded-md bg-[var(--color-accent)] px-4 py-3 font-semibold text-[var(--color-button-text)] shadow-[0_14px_30px_rgba(36,36,36,0.18)] transition hover:-translate-y-0.5 hover:bg-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:col-span-2"
      >
        {isSubmitting
          ? deposit.enabled
            ? "Preparando pago..."
            : "Confirmando..."
          : deposit.enabled
            ? "Pagar seña y reservar"
            : "Confirmar turno"}
      </button>
    </form>
  );
}
