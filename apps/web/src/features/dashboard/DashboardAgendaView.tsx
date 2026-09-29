import {
  addDays,
  differenceInCalendarDays,
  format,
  isSameDay,
  isSameMonth,
  startOfWeek
} from "date-fns";
import { es } from "date-fns/locale";
import { useState } from "react";

import { AppointmentDetailsModal } from "./AppointmentDetailsModal";
import {
  scheduleOptions,
  type AppointmentStatusLabel,
  type ScheduleView
} from "./dashboard.constants";
import {
  DashboardCalendarCard
} from "./DashboardCalendarCard";
import { getMonthCalendarDays } from "./dashboard.calendar-utils";
import {
  getDepositPaymentBadgeClassName,
  getDepositPaymentLabel,
  type DashboardAppointment
} from "./dashboard.data";

type AgendaTone =
  | "paid"
  | "confirmed"
  | "pending"
  | "attended"
  | "cancelled"
  | "noShow"
  | "available"
  | "empty";

function getAgendaEventClassName(tone: AgendaTone) {
  if (tone === "paid") {
    return "border-[#9bc7a4] bg-[#eef8ee] text-[#1f6b35]";
  }

  if (tone === "confirmed") {
    return "border-[#f0b56f] bg-[#fff3e3] text-[#a44b00]";
  }

  if (tone === "pending") {
    return "border-[var(--color-ink)] bg-[#ffffff] text-[var(--color-ink)]";
  }

  if (tone === "attended") {
    return "border-[#c8b8ee] bg-[#f3edff] text-[#4d2f9b]";
  }

  if (tone === "cancelled") {
    return "border-[#e7b9b2] bg-[#fde8e5] text-[#9f1f16]";
  }

  if (tone === "noShow") {
    return "border-[#d9b7a6] bg-[#ffffff] text-[#8a3f22]";
  }

  if (tone === "available") {
    return "border-dashed border-[#f0b56f] bg-[#ffffff] text-[#8a5a22]";
  }

  return "border-dashed border-[var(--color-border-strong)] bg-white/40 text-[var(--color-muted-strong)]";
}

function getAgendaTone(status: AppointmentStatusLabel): AgendaTone {
  if (status === "En espera") return "pending";
  if (status === "Asistido") return "attended";
  if (status === "Señado" || status === "Pagado") return "paid";
  if (status === "Cancelado") return "cancelled";
  if (status === "No asistió") return "noShow";
  return "confirmed";
}

function getStatusBadgeClassName(status: AppointmentStatusLabel) {
  if (status === "Pagado") {
    return "bg-[#dcf5e3] text-[#1b6c3d] ring-[#9bc7a4]";
  }

  if (status === "Señado") {
    return "bg-[#e5f4e8] text-[#1f6b35] ring-[#b9dfc0]";
  }

  if (status === "Confirmado") {
    return "bg-[#fff3e3] text-[#a44b00] ring-[#f0b56f]";
  }

  if (status === "En espera") {
    return "bg-[var(--color-ink)] text-white ring-[var(--color-ink)]";
  }

  if (status === "Asistido") {
    return "bg-[#f3edff] text-[#4d2f9b] ring-[#c8b8ee]";
  }

  if (status === "Cancelado") {
    return "bg-[#fde8e5] text-[#9f1f16] ring-[#e7b9b2]";
  }

  return "bg-[#ffffff] text-[#8a3f22] ring-[#d9b7a6]";
}

function getAgendaHours(appointments: DashboardAppointment[]) {
  const appointmentHours = appointments
    .filter((appointment) => appointment.startsAt)
    .map((appointment) => new Date(appointment.startsAt!).getHours());
  const minHour = Math.min(9, ...appointmentHours);
  const maxHour = Math.max(20, ...appointmentHours);

  return Array.from({ length: maxHour - minHour + 1 }, (_, index) => {
    const hour = minHour + index;
    return {
      hour,
      label: `${String(hour).padStart(2, "0")}:00`
    };
  });
}

function sentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type DashboardAgendaViewProps = {
  appointments: DashboardAppointment[];
  disablePreviousMonth?: boolean;
  filteredAppointments: DashboardAppointment[];
  getAppointmentStatus: (appointment: DashboardAppointment) => AppointmentStatusLabel;
  minDate?: Date;
  onNextMonth: () => void;
  onNextPeriod: () => void;
  onToday: () => void;
  onPreviousMonth: () => void;
  onPreviousPeriod: () => void;
  onRequestStatusChange: (
    appointment: DashboardAppointment,
    currentStatus: AppointmentStatusLabel,
    isCorrection?: boolean
  ) => void;
  onRequestReschedule: (appointment: DashboardAppointment) => void;
  onSelectDate: (date: Date) => void;
  onSelectScheduleView: (view: ScheduleView) => void;
  searchTerm: string;
  scheduleView: ScheduleView;
  selectedDate: Date;
};

export function DashboardAgendaView({
  appointments,
  disablePreviousMonth = false,
  filteredAppointments,
  getAppointmentStatus,
  minDate,
  onNextMonth,
  onNextPeriod,
  onToday,
  onPreviousMonth,
  onPreviousPeriod,
  onRequestStatusChange,
  onRequestReschedule,
  onSelectDate,
  onSelectScheduleView,
  searchTerm,
  scheduleView,
  selectedDate
}: DashboardAgendaViewProps) {
  const [selectedAppointment, setSelectedAppointment] =
    useState<DashboardAppointment | null>(null);
  function selectAppointment(appointment: DashboardAppointment | null) {
    setSelectedAppointment(
      appointment
        ? {
            ...appointment,
            status: getAppointmentStatus(appointment)
          }
        : null
    );
  }
  const appointmentDays = Array.from(
    new Set(
      appointments
        .map((appointment) => appointment.day)
        .filter((day): day is string => Boolean(day))
    )
  );
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const agendaHours = getAgendaHours(appointments);
  const agendaEvents = appointments
    .filter((appointment) => appointment.startsAt)
    .map((appointment) => {
      const startsAt = new Date(appointment.startsAt!);
      return {
        id: appointment.id,
        day: differenceInCalendarDays(startsAt, weekStart),
        hour: startsAt.getHours(),
        time: appointment.time,
        title: appointment.service,
        client: appointment.client,
        assignee: appointment.assignee,
        status: appointment.status,
        depositPaid: appointment.depositPayment?.status === "approved",
        tone: getAgendaTone(appointment.status)
      };
    });
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    return {
      active: isSameDay(date, selectedDate),
      date,
      dateLabel: format(date, "dd"),
      index,
      label: format(date, "EEE", { locale: es }).replace(".", "")
    };
  });
  const visibleDays =
    scheduleView === "day"
      ? weekDays.filter((day) => day.active)
      : weekDays;
  const gridTemplateColumns =
    scheduleView === "day"
      ? "52px minmax(0,1fr)"
      : `58px repeat(${visibleDays.length}, minmax(0,1fr))`;
  const periodLabel =
    scheduleView === "day"
      ? sentenceCase(format(selectedDate, "EEEE dd 'de' MMMM", { locale: es }))
      : `${format(weekStart, "dd", { locale: es })} al ${format(addDays(weekStart, 6), "dd 'de' MMMM", { locale: es })}`;
  const sortedMatches = [...filteredAppointments].sort((first, second) =>
    (first.startsAt ?? "").localeCompare(second.startsAt ?? "")
  );
  const emptyMessage = searchTerm.trim()
    ? "No hay turnos que coincidan con la búsqueda."
    : "Todavía no hay turnos para este período.";

  if (scheduleView === "month") {
    return (
      <AgendaMonthView
        appointments={filteredAppointments}
        selectedDate={selectedDate}
        onNextMonth={onNextMonth}
        onNextPeriod={onNextPeriod}
        onToday={onToday}
        onPreviousMonth={onPreviousMonth}
        onPreviousPeriod={onPreviousPeriod}
        onSelectDate={onSelectDate}
        onSelectScheduleView={onSelectScheduleView}
        scheduleView={scheduleView}
      />
    );
  }

  return (
    <>
    <section className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <article className="min-w-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[#ffffff] shadow-[0_16px_44px_rgba(32,24,54,0.05)]">
        <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[rgba(32,24,54,0.035)] px-3 py-2 text-left text-xs lg:w-72">
            <span className="min-w-0">
              <span className="block text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                {scheduleView === "day" ? "Día" : "Semana del"}
              </span>
              <span className="mt-0.5 block truncate whitespace-nowrap text-xs font-semibold text-[var(--color-ink)]">
                {periodLabel}
              </span>
            </span>
          </div>
          <AgendaViewControls
            onNextPeriod={onNextPeriod}
            onToday={onToday}
            onPreviousPeriod={onPreviousPeriod}
            onSelectScheduleView={onSelectScheduleView}
            scheduleView={scheduleView}
          />
        </div>
        <div className="min-h-[70px] border-b border-[var(--color-border)] bg-white/42 px-3 py-3">
          {sortedMatches.length === 0 && (
            <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[#ffffff] px-4 py-3 text-xs text-[var(--color-muted-strong)]">
                {emptyMessage}
            </div>
          )}
        </div>

        <div className="stable-scrollbar overflow-x-auto bg-[#ffffff]">
          <div className={scheduleView === "day" ? "min-w-0" : "min-w-[820px]"}>
            <div
              className="grid border-b border-[var(--color-border)]"
              style={{ gridTemplateColumns }}
            >
              <div />
              {visibleDays.map((day) => (
                <button
                  key={day.date.toISOString()}
                  type="button"
                  onClick={() => onSelectDate(day.date)}
                  style={{ fontSize: "0.6875rem", lineHeight: "1rem" }}
                  className="flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[0.6875rem] font-medium text-[var(--color-muted-strong)] transition hover:bg-white/60"
                >
                  <span>{day.label}</span>
                  <span
                    style={{ fontSize: "0.6875rem", lineHeight: "1rem" }}
                    className={`flex h-7 w-7 items-center justify-center rounded-full ${
                      day.active
                        ? "bg-[var(--color-ink)] text-white"
                        : "text-[var(--color-muted-strong)]"
                    }`}
                  >
                    {day.dateLabel}
                  </span>
                </button>
              ))}
            </div>

            <div className="grid" style={{ gridTemplateColumns }}>
              {agendaHours.map(({ hour, label }) => (
                <div key={hour} className="contents">
                  <div className="border-r border-[rgba(32,24,54,0.12)] bg-[rgba(32,24,54,0.035)] px-2 py-3 text-[0.625rem] text-[var(--color-muted)] sm:px-3">
                    {label}
                  </div>
                  {visibleDays.map((day) => {
                    const events = agendaEvents.filter(
                      (item) => item.day === day.index && item.hour === hour
                    );

                    return (
                      <div
                        key={`${label}-${day.label}`}
                        className="min-h-[42px] border-r border-b border-[rgba(32,24,54,0.12)] bg-[#ffffff] p-1"
                                >
                        {events.length > 0 && (
                          <div
                            className={
                              scheduleView === "day"
                                ? "flex flex-wrap gap-1.5"
                                : "space-y-1"
                            }
                          >
                            {events.map((event) => (
                              <button
                                key={event.id}
                                type="button"
                                onClick={() =>
                                  selectAppointment(
                                    appointments.find(
                                      (appointment) => appointment.id === event.id
                                    ) ?? null
                                  )
                                }
                                className={`rounded border px-2 py-1.5 text-left text-[0.6875rem] leading-4 shadow-sm ${
                                  scheduleView === "day"
                                    ? "w-full sm:max-w-[260px]"
                                    : "w-full"
                                } ${getAgendaEventClassName(event.tone)}`}
                              >
                                <span className="flex items-center justify-between gap-2">
                                  <span className="text-[0.625rem] font-semibold tabular-nums">
                                    {event.time}
                                  </span>
                                  {event.depositPaid && (
                                    <span
                                      title="Seña pagada"
                                      className="inline-flex h-4 shrink-0 items-center gap-1 rounded-full border border-[rgba(253,134,6,0.22)] bg-[rgba(32,24,54,0.92)] px-1.5 text-[0.5625rem] font-semibold text-white shadow-[0_8px_18px_rgba(32,24,54,0.14)]"
                                    >
                                      <span className="h-1.5 w-1.5 rounded-full bg-[#45d47e]" />
                                      Seña
                                    </span>
                                  )}
                                  <span
                                    className={`inline-flex h-4 shrink-0 items-center rounded-full px-1.5 text-[0.5625rem] font-semibold ring-1 ${getStatusBadgeClassName(event.status)}`}
                                  >
                                    {event.status}
                                  </span>
                                </span>
                                <span className="mt-0.5 block truncate text-[0.6875rem] font-semibold leading-4">
                                  {event.title}
                                </span>
                                {event.client && (
                                  <span className="mt-0.5 block truncate text-[0.625rem] opacity-70">
                                    {event.client}
                                  </span>
                                )}
                                <span className="mt-1 block truncate text-[0.625rem] opacity-60">
                                  {event.assignee || "Sin profesional"}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </article>

      <aside className="min-w-0 space-y-2 xl:sticky xl:top-4 xl:self-start">
        <DashboardCalendarCard
          appointmentDays={appointmentDays}
          compact
          disablePreviousMonth={disablePreviousMonth}
          minDate={minDate}
          onNextMonth={onNextMonth}
          onPreviousMonth={onPreviousMonth}
          onSelectDate={onSelectDate}
          selectedDate={selectedDate}
        />
        <AgendaMatchesCard
          appointments={sortedMatches}
          onSelectAppointment={selectAppointment}
          scheduleView={scheduleView}
          selectedDate={selectedDate}
        />
      </aside>
    </section>
    {selectedAppointment && (
      <AppointmentDetailsModal
        appointment={selectedAppointment}
        onClose={() => setSelectedAppointment(null)}
        onRequestReschedule={() => {
          onRequestReschedule(selectedAppointment);
          setSelectedAppointment(null);
        }}
        onRequestStatusChange={() => {
          onRequestStatusChange(
            selectedAppointment,
            selectedAppointment.status,
            true
          );
          setSelectedAppointment(null);
        }}
      />
    )}
    </>
  );
}

function getMobileMonthItems(selectedDate: Date, appointments: DashboardAppointment[]) {
  const grouped = new Map<string, { count: number; date: Date }>();
  for (const appointment of appointments) {
    if (!appointment.startsAt) continue;
    const date = new Date(appointment.startsAt);
    if (!isSameMonth(date, selectedDate)) continue;
    const key = format(date, "yyyy-MM-dd");
    const current = grouped.get(key);
    grouped.set(key, { count: (current?.count ?? 0) + 1, date });
  }
  return [...grouped.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

function getMonthEventCount(day: Date, appointments: DashboardAppointment[]) {
  return appointments.filter(
    (appointment) =>
      appointment.startsAt && isSameDay(new Date(appointment.startsAt), day)
  ).length;
}

function AgendaMonthView({
  appointments,
  disablePreviousMonth = false,
  minDate,
  onNextMonth,
  onNextPeriod,
  onToday,
  onPreviousMonth,
  onPreviousPeriod,
  onSelectDate,
  onSelectScheduleView,
  scheduleView,
  selectedDate
}: {
  appointments: DashboardAppointment[];
  disablePreviousMonth?: boolean;
  minDate?: Date;
  onNextMonth: () => void;
  onNextPeriod: () => void;
  onToday: () => void;
  onPreviousMonth: () => void;
  onPreviousPeriod: () => void;
  onSelectDate: (date: Date) => void;
  onSelectScheduleView: (view: ScheduleView) => void;
  scheduleView: ScheduleView;
  selectedDate: Date;
}) {
  const [showAllMonthItems, setShowAllMonthItems] = useState(false);
  const calendarDays = getMonthCalendarDays(selectedDate);
  const appointmentDays = Array.from(
    new Set(
      appointments
        .map((appointment) => appointment.day)
        .filter((day): day is string => Boolean(day))
    )
  );
  const mobileMonthItems = getMobileMonthItems(selectedDate, appointments);
  const visibleMobileMonthItems = showAllMonthItems
    ? mobileMonthItems
    : mobileMonthItems.slice(0, 5);
  const hasHiddenMobileMonthItems =
    mobileMonthItems.length > visibleMobileMonthItems.length;

  return (
    <section className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <article className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[#ffffff] p-3 shadow-[0_16px_44px_rgba(32,24,54,0.05)]">
        <div className="flex flex-col gap-3 border-b border-[var(--color-border)] pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex w-full min-w-0 items-center rounded-lg border border-[var(--color-border)] bg-[rgba(32,24,54,0.035)] px-3 py-2 text-left text-xs lg:w-72">
            <span className="min-w-0">
              <span className="block text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                Mes
              </span>
              <span className="mt-0.5 block truncate whitespace-nowrap text-xs font-semibold capitalize text-[var(--color-ink)]">
                {format(selectedDate, "MMMM yyyy", { locale: es })}
              </span>
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <AgendaViewControls
              onNextPeriod={onNextPeriod}
              onToday={onToday}
              onPreviousPeriod={onPreviousPeriod}
              onSelectScheduleView={onSelectScheduleView}
              scheduleView={scheduleView}
            />
          </div>
        </div>
        <div className="mt-3 space-y-2 md:hidden">
          {visibleMobileMonthItems.map(({ count, date }) => (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => {
                onSelectDate(date);
                onSelectScheduleView("day");
              }}
              className="w-full rounded-md border border-[var(--color-border)] bg-[#ffffff] px-3 py-2.5 text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] opacity-75">
                    {format(date, "EEE dd", { locale: es })}
                  </p>
                  <p className="mt-1 truncate text-xs font-semibold">
                    {count} {count === 1 ? "turno" : "turnos"} agendados
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[rgba(253,134,6,0.14)] px-2.5 py-1 font-mono text-[0.6875rem] font-semibold text-[var(--color-ink)]">
                  {count}
                </span>
              </div>
            </button>
          ))}

          {hasHiddenMobileMonthItems ? (
            <button
              type="button"
              onClick={() => setShowAllMonthItems(true)}
              className="mx-auto mt-3 block rounded-md border border-[var(--color-border-strong)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-ink)]"
            >
              Ver más
            </button>
          ) : (
            showAllMonthItems &&
            mobileMonthItems.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllMonthItems(false)}
                className="mx-auto mt-3 block rounded-md border border-[var(--color-border-strong)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-ink)]"
              >
                Ver menos
              </button>
            )
          )}
        </div>

        <div className="mt-3 hidden grid-cols-7 gap-1 md:grid">
          {["L", "M", "X", "J", "V", "S", "D"].map((day) => (
            <span
              key={day}
              className="px-2 py-1 text-center text-[0.6875rem] font-semibold text-[var(--color-muted)]"
            >
              {day}
            </span>
          ))}
          {calendarDays.map((day) => {
            const dayEventsCount = isSameMonth(day, selectedDate)
              ? getMonthEventCount(day, appointments)
              : 0;

            return (
              <div
                key={day.toISOString()}
                className={`min-h-24 rounded-md border border-[var(--color-border)] bg-[#ffffff] p-2 ${
                  isSameDay(day, selectedDate) ? "ring-1 ring-[var(--color-ink)]" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-[0.6875rem] font-semibold ${
                      isSameDay(day, selectedDate)
                        ? "bg-[var(--color-ink)] text-white"
                        : !isSameMonth(day, selectedDate)
                          ? "text-[var(--color-muted)]/45"
                          : "text-[var(--color-ink)]"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                </div>

                <div className="mt-2 space-y-1.5">
                  {dayEventsCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectDate(day);
                        onSelectScheduleView("day");
                      }}
                      className="w-full rounded border border-[rgba(253,134,6,0.24)] bg-[rgba(253,134,6,0.1)] px-2 py-1.5 text-center transition-colors hover:border-[var(--color-accent)] hover:bg-[rgba(253,134,6,0.18)]"
                    >
                      <span className="font-mono text-xs font-semibold text-[var(--color-ink)]">
                        {dayEventsCount}
                      </span>
                      <span className="ml-1 text-[0.625rem] font-semibold text-[var(--color-muted-strong)]">
                        {dayEventsCount === 1 ? "turno" : "turnos"}
                      </span>
                    </button>
                  ) : (
                    <p className="rounded border border-dashed border-[var(--color-border)] px-2 py-2 text-[0.6875rem] text-[var(--color-muted)]">
                      Sin turnos
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </article>

      <aside className="min-w-0 space-y-2 xl:sticky xl:top-4 xl:self-start">
        <DashboardCalendarCard
          appointmentDays={appointmentDays}
          compact
          disablePreviousMonth={disablePreviousMonth}
          minDate={minDate}
          onNextMonth={onNextMonth}
          onPreviousMonth={onPreviousMonth}
          onSelectDate={onSelectDate}
          selectedDate={selectedDate}
        />
      </aside>
    </section>
  );
}

function AgendaMatchesCard({
  appointments,
  onSelectAppointment,
  scheduleView,
  selectedDate
}: {
  appointments: DashboardAppointment[];
  onSelectAppointment: (appointment: DashboardAppointment) => void;
  scheduleView: ScheduleView;
  selectedDate: Date;
}) {
  const title =
    scheduleView === "day"
      ? "Turnos del día"
      : scheduleView === "week"
        ? "Turnos de la semana"
        : "Turnos del mes";

  return (
    <article className={`min-w-0 rounded-lg border border-[var(--color-border)] bg-[#ffffff] p-2.5 shadow-[0_16px_44px_rgba(32,24,54,0.05)] ${scheduleView === "month" ? "min-h-[220px]" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[0.8125rem] font-semibold">{title}</h2>
          <p className="mt-1 text-[0.6875rem] text-[var(--color-muted)]">
            {format(selectedDate, "dd 'de' MMMM", { locale: es })}
          </p>
        </div>
        <span className="rounded-full bg-[rgba(253,134,6,0.14)] px-2.5 py-1 font-mono text-[0.6875rem] font-semibold text-[var(--color-ink)]">
          {appointments.length}
        </span>
      </div>
      <div className="mt-2 space-y-2">
        {appointments.slice(0, 8).map((item) => {
          const tone = getAgendaTone(item.status);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectAppointment(item)}
              className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors hover:border-[var(--color-accent)] ${
                tone === "cancelled" || tone === "noShow"
                  ? getAgendaEventClassName(tone)
                  : "border-[var(--color-border)] bg-white/60 hover:bg-white/80"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs font-semibold text-[var(--color-accent)]">
                  {item.time}
                </span>
                <span className="text-[0.6875rem] text-[var(--color-muted)]">
                  {item.day ?? ""}
                </span>
              </div>
              <p className="mt-1 text-xs font-semibold text-[var(--color-ink)]">
                {item.service}
              </p>
              <p className="mt-0.5 text-[0.6875rem] text-[var(--color-muted-strong)]">
                {item.client} · {item.assignee}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span
                  className={`inline-flex rounded-md px-2 py-1 text-[0.625rem] font-semibold ring-1 ${getStatusBadgeClassName(item.status)}`}
                >
                  {item.status}
                </span>
                {item.depositPayment?.status === "approved" && (
                  <span className={getDepositPaymentBadgeClassName(item)}>
                    {getDepositPaymentLabel(item)}
                  </span>
                )}
              </div>
            </button>
          );
        })}
        {appointments.length === 0 && (
          <p className="text-xs text-[var(--color-muted)]">
            No encontramos turnos con esos filtros.
          </p>
        )}
      </div>
    </article>
  );
}

function AgendaViewControls({
  onNextPeriod,
  onToday,
  onPreviousPeriod,
  onSelectScheduleView,
  scheduleView
}: {
  onNextPeriod: () => void;
  onToday: () => void;
  onPreviousPeriod: () => void;
  onSelectScheduleView: (view: ScheduleView) => void;
  scheduleView: ScheduleView;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
      <div className="flex w-full rounded-lg border border-[var(--color-border)] bg-white/45 p-1 text-xs sm:w-auto">
        <button
          type="button"
          onClick={onPreviousPeriod}
          aria-label="Período anterior"
          className="grid w-8 shrink-0 place-items-center rounded text-[var(--color-ink)] transition-colors duration-200 hover:bg-white/70"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={onToday}
          className="mr-1 flex-1 rounded bg-[var(--color-accent)] px-3 py-1.5 font-semibold text-[var(--color-button-text)] transition-colors duration-200 hover:bg-[#e97805] sm:flex-none"
        >
          Hoy
        </button>
        <span className="mx-1 hidden w-px bg-[var(--color-border)] sm:block" />
        {scheduleOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelectScheduleView(option.value)}
            className={`flex-1 rounded px-3 py-1.5 transition-colors duration-200 sm:flex-none ${
              scheduleView === option.value
                ? "bg-[var(--color-ink)] text-[var(--color-button-text)]"
                : "text-[var(--color-muted-strong)] hover:bg-white/60 hover:text-[var(--color-ink)]"
            }`}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onNextPeriod}
          aria-label="Período siguiente"
          className="grid w-8 shrink-0 place-items-center rounded text-[var(--color-ink)] transition-colors duration-200 hover:bg-white/70"
        >
          ›
        </button>
      </div>
    </div>
  );
}
