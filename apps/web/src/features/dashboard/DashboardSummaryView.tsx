import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import averageTicketIcon from "../../components/assets/icons/analytics/badge-dollar-sign.svg";
import completedAppointmentsIcon from "../../components/assets/icons/analytics/calendar-check-2.svg";
import cancellationIcon from "../../components/assets/icons/analytics/calendar-x-2.svg";
import incomeIcon from "../../components/assets/icons/analytics/circle-dollar-sign.svg";
import occupancyIcon from "../../components/assets/icons/analytics/gauge.svg";
import expenseIcon from "../../components/assets/icons/analytics/receipt-text.svg";
import netIncomeIcon from "../../components/assets/icons/analytics/trending-up.svg";
import noShowIcon from "../../components/assets/icons/analytics/user-x.svg";
import calendarRangeIcon from "../../components/assets/icons/navigation/calendar-range.svg";
import analyticsIcon from "../../components/assets/icons/navigation/chart-no-axes-combined.svg";
import { ModalCloseButton } from "../../components/ui/ModalCloseButton";
import { formatArsCents } from "../../lib/format";
import { DashboardPerformanceChart } from "./DashboardPerformanceChart";
import {
  createDashboardExpense,
  deleteDashboardExpense,
  getAnalyticsReportPdf,
  getDailyClosingPdf,
  getDashboardExpenses,
  getDashboardSummary,
  type DashboardExpense,
  type DashboardSummary,
  type DashboardSummaryPeriod
} from "./dashboard-summary.api";

const periods: Array<{ value: DashboardSummaryPeriod; label: string }> = [
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "current_month", label: "Este mes" },
  { value: "previous_month", label: "Mes anterior" }
];

const expenseCategories = ["General", "Insumos", "Alquiler", "Servicios", "Sueldos", "Limpieza", "Marketing", "Otro"];
const paymentMethods = [
  { label: "Efectivo", value: "cash" },
  { label: "Transferencia", value: "bank_transfer" },
  { label: "Mercado Pago", value: "mercadopago" },
  { label: "Otro", value: "other" }
];

function formatMoney(cents: number) {
  return formatArsCents(cents);
}

function formatExpenseMethod(value: string | null) {
  return paymentMethods.find((method) => method.value === value)?.label ?? "Sin método";
}

function localDateInputValue(value: Date | string = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric"
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDateValue(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function expenseDateBounds(period: DashboardSummaryPeriod) {
  const today = localDateInputValue();
  const currentMonthStart = `${today.slice(0, 7)}-01`;
  const previousMonthEnd = shiftDateValue(currentMonthStart, -1);
  const previousMonthStart = `${previousMonthEnd.slice(0, 7)}-01`;

  if (period === "7d") return { min: shiftDateValue(today, -6), max: today };
  if (period === "30d") return { min: shiftDateValue(today, -29), max: today };
  if (period === "previous_month") return { min: previousMonthStart, max: previousMonthEnd };
  return { min: currentMonthStart, max: today };
}

function formatExpenseDate(date: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${date}T12:00:00.000Z`));
}

function Change({ value }: { value: number | null }) {
  if (value == null) return <span>Sin período comparable</span>;
  if (value === 0) return <span className="text-[var(--color-muted)]">Sin cambios</span>;
  return (
    <span className={value > 0 ? "text-[#287553]" : "text-[#b04b43]"}>
      {value > 0 ? "+" : ""}
      {value.toLocaleString("es-AR")}% vs período anterior
    </span>
  );
}

export function DashboardSummaryView({
  onViewAgenda
}: {
  onViewAgenda: () => void;
}) {
  const [activeSection, setActiveSection] = useState<"daily" | "analytics">("daily");
  const [period, setPeriod] = useState<DashboardSummaryPeriod>("current_month");
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [isOpeningClosingPdf, setIsOpeningClosingPdf] = useState(false);
  const [isDailyCashOpen, setIsDailyCashOpen] = useState(false);
  const [isExpenseFormOpen, setIsExpenseFormOpen] = useState(false);
  const maxClosingDate = localDateInputValue();
  const [isAnalyticsReportOpen, setIsAnalyticsReportOpen] = useState(false);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  const [analyticsReportError, setAnalyticsReportError] = useState("");
  const [analyticsReportDates, setAnalyticsReportDates] = useState({
    from: `${maxClosingDate.slice(0, 7)}-01`,
    to: maxClosingDate
  });
  const [closingDate, setClosingDate] = useState(maxClosingDate);
  const [expense, setExpense] = useState({
    amount: "",
    category: "General",
    date: localDateInputValue(),
    description: "",
    paymentMethod: "cash"
  });
  const [expenseErrors, setExpenseErrors] = useState<Partial<Record<keyof typeof expense, string>>>({});
  const queryClient = useQueryClient();
  const expensesPeriod: DashboardSummaryPeriod = activeSection === "daily" ? "current_month" : period;
  const summaryQuery = useQuery({
    queryKey: ["dashboard", "summary", period],
    queryFn: () => getDashboardSummary(period),
    staleTime: 60_000,
    refetchOnWindowFocus: false
  });
  const expensesQuery = useQuery({
    queryKey: ["dashboard", "expenses", expensesPeriod],
    queryFn: () => getDashboardExpenses(expensesPeriod),
    staleTime: 60_000,
    refetchOnWindowFocus: false
  });
  const expenseMutation = useMutation({
    mutationFn: () =>
      createDashboardExpense({
        amountCents: Math.round(Number(expense.amount.replace(",", ".")) * 100),
        category: expense.category,
        description: expense.description,
        paymentMethod: expense.paymentMethod,
        occurredOn: new Date(`${expense.date}T12:00:00`).toISOString()
      }),
    onSuccess: async () => {
      setExpense({
        amount: "",
        category: "General",
        date: localDateInputValue(),
        description: "",
        paymentMethod: "cash"
      });
      setExpenseErrors({});
      setIsExpenseFormOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "expenses"] })
      ]);
    }
  });
  const deleteExpenseMutation = useMutation({
    mutationFn: deleteDashboardExpense,
    onSettled: () => setDeletingExpenseId(null),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "expenses"] })
      ]);
    }
  });
  const data = summaryQuery.data;

  function submitExpense() {
    const amount = Number(expense.amount.replace(",", "."));
    const nextErrors: Partial<Record<keyof typeof expense, string>> = {};
    if (expense.description.trim().length < 2) nextErrors.description = "Ingresá una descripción.";
    if (!expense.category) nextErrors.category = "Elegí una categoría.";
    if (!Number.isFinite(amount) || amount <= 0) nextErrors.amount = "Ingresá un monto válido.";
    if (!expense.date) nextErrors.date = "Elegí una fecha.";
    if (!expense.paymentMethod) nextErrors.paymentMethod = "Elegí un método.";
    setExpenseErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) expenseMutation.mutate();
  }

  async function openDailyClosingPdf() {
    setIsOpeningClosingPdf(true);
    try {
      const blob = await getDailyClosingPdf(closingDate);
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        const link = document.createElement("a");
        link.href = url;
        link.download = `cierre-caja-${closingDate}.pdf`;
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setIsDailyCashOpen(false);
    } finally {
      setIsOpeningClosingPdf(false);
    }
  }

  async function downloadAnalyticsReport() {
    const { from, to } = analyticsReportDates;
    if (!from || !to) {
      setAnalyticsReportError("Elegí ambas fechas.");
      return;
    }
    if (from > to) {
      setAnalyticsReportError("La fecha desde no puede ser posterior a la fecha hasta.");
      return;
    }
    const days = (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000 + 1;
    if (days > 366) {
      setAnalyticsReportError("El rango máximo es de 366 días.");
      return;
    }

    setAnalyticsReportError("");
    setIsDownloadingReport(true);
    try {
      const blob = await getAnalyticsReportPdf(from, to);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `resumen-analitico-${from}-${to}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setIsAnalyticsReportOpen(false);
    } catch {
      setAnalyticsReportError("No se pudo generar el resumen. Intentá nuevamente.");
    } finally {
      setIsDownloadingReport(false);
    }
  }

  if (summaryQuery.isLoading) {
    return (
      <div className="grid min-h-80 place-items-center rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-muted)]">
        Cargando rendimiento del negocio...
      </div>
    );
  }

  if (!data || summaryQuery.isError) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-white p-8 text-center text-sm text-[var(--color-muted)]">
        No pudimos cargar el resumen. Intentá nuevamente.
      </div>
    );
  }

  const cards = [
    {
      change: data.metrics.changes.incomePercent,
      helper: "Ingresos reconocidos: turnos pagados/completados y señas aprobadas.",
      icon: incomeIcon,
      label: "Ingresos",
      value: formatMoney(data.metrics.incomeCents)
    },
    {
      change: data.metrics.changes.expensePercent,
      helper: "Gastos registrados dentro del período seleccionado.",
      icon: expenseIcon,
      label: "Gastos",
      value: formatMoney(data.metrics.expenseCents)
    },
    {
      change: data.metrics.changes.netIncomePercent,
      helper: "Ingresos menos gastos del período seleccionado.",
      icon: netIncomeIcon,
      label: "Ganancia neta",
      value: formatMoney(data.metrics.netIncomeCents)
    },
    {
      change: data.metrics.changes.completedPercent,
      helper: "Turnos cobrados o completados dentro del período.",
      icon: completedAppointmentsIcon,
      label: "Turnos realizados",
      value: String(data.metrics.completedAppointments)
    },
    {
      change: data.metrics.changes.averageTicketPercent,
      helper: "Promedio facturado por turno realizado en el período seleccionado.",
      icon: averageTicketIcon,
      label: "Ticket promedio",
      value: formatMoney(data.metrics.averageTicketCents)
    },
    {
      change: data.metrics.changes.occupancyPercent,
      helper: "Turnos confirmados o completados sobre el total agendado. No mide ocupación horaria real.",
      icon: occupancyIcon,
      label: "Ocupación",
      value: `${data.metrics.occupancyPercent.toLocaleString("es-AR")}%`
    },
    {
      change: data.metrics.changes.cancellationRatePercent,
      helper: "Porcentaje de turnos cancelados sobre el total agendado.",
      icon: cancellationIcon,
      label: "Cancelación",
      value: `${data.metrics.cancellationRatePercent.toLocaleString("es-AR")}%`
    },
    {
      change: data.metrics.changes.noShowRatePercent,
      helper: "Porcentaje de turnos marcados como No asistió sobre el total agendado.",
      icon: noShowIcon,
      label: "No asistencia",
      value: `${data.metrics.noShowRatePercent.toLocaleString("es-AR")}%`
    }
  ];

  const todayStatusCards = [
    { label: "Pendiente", value: data.today.pending, tone: "bg-sky-500" },
    { label: "Confirmado", value: data.today.confirmed, tone: "bg-emerald-500" },
    { label: "Completado", value: data.today.completed, tone: "bg-[var(--color-ink)]" },
    { label: "Cancelado", value: data.today.canceled, tone: "bg-rose-500" },
    { label: "No asistió", value: data.today.noShow, tone: "bg-zinc-500" }
  ];

  const statusCards = [
    {
      accent: "bg-emerald-500",
      className: "border-zinc-200 bg-[rgba(32,24,54,0.08)]",
      label: "Confirmados",
      value: data.metrics.confirmedAppointments
    },
    {
      accent: "bg-[var(--color-ink)]",
      className: "border-zinc-200 bg-[rgba(32,24,54,0.08)]",
      label: "Completados",
      value: data.metrics.completedAppointments
    },
    {
      accent: "bg-sky-500",
      className: "border-zinc-200 bg-[rgba(32,24,54,0.08)]",
      label: "Pendientes",
      value: data.metrics.pendingAppointments
    },
    {
      accent: "bg-rose-500",
      className: "border-zinc-200 bg-[rgba(32,24,54,0.08)]",
      label: "Cancelados",
      value: data.metrics.canceledAppointments
    },
    {
      accent: "bg-zinc-500",
      className: "border-zinc-200 bg-[rgba(32,24,54,0.08)]",
      label: "No asistencias",
      value: data.metrics.noShowAppointments
    }
  ];
  const paymentCards = [
    {
      accent: "bg-[var(--color-accent)]",
      className: "border-zinc-200 bg-[rgba(32,24,54,0.08)]",
      helper: "Cantidad de reservas con seña aprobada en el período.",
      label: "Señas cobradas",
      value: data.metrics.depositedAppointments
    },
    {
      accent: "bg-emerald-500",
      className: "border-zinc-200 bg-[rgba(32,24,54,0.08)]",
      helper: "Importe total cobrado como seña en el período.",
      label: "Total en señas",
      value: formatMoney(data.metrics.depositIncomeCents)
    },
    {
      accent: "bg-sky-500",
      className: "border-zinc-200 bg-[rgba(32,24,54,0.08)]",
      helper: "Saldo estimado por cobrar de turnos pendientes o confirmados, descontando señas aprobadas.",
      label: "Pendiente de cobro",
      value: formatMoney(data.metrics.pendingCollectionCents)
    }
  ];

  return (
    <div className="min-w-0 space-y-3 text-[13px] 2xl:max-w-[1480px]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SummarySectionTabs
          active={activeSection}
          onChange={setActiveSection}
        />
        {activeSection === "daily" ? (
          <DailyCashLauncher
            netIncomeCents={data.today.netIncomeCents}
            onOpen={() => setIsDailyCashOpen(true)}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setAnalyticsReportError("");
              setIsAnalyticsReportOpen(true);
            }}
            className="h-8 rounded-md border border-[var(--color-border-strong)] bg-white px-4 text-xs font-semibold text-[var(--color-ink)] hover:bg-[rgba(32,24,54,0.04)]"
          >
            Descargar resumen
          </button>
        )}
      </div>

      {activeSection === "daily" ? (
        <div className="w-full space-y-6">
          <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.62fr)]">
            <article className="rounded-lg border border-[var(--color-border)] bg-white p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Resumen de hoy</h2>
                  <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">Qué pasó hoy en turnos y caja.</p>
                </div>
                <button
                  type="button"
                  onClick={onViewAgenda}
                  className="text-xs font-semibold text-[var(--color-accent)]"
                >
                  Ver agenda
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                <TodayMetric label="Turnos" tone="bg-[var(--color-accent)]" value={String(data.today.appointments)} />
                <TodayMetric label="Ingresos" tone="bg-emerald-500" value={formatMoney(data.today.estimatedIncomeCents)} />
                <TodayMetric label="Gastos" tone="bg-rose-500" value={formatMoney(data.today.expenseCents)} />
                <TodayMetric label="Caja esperada" tone="bg-[var(--color-ink)]" value={formatMoney(data.today.netIncomeCents)} />
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                {todayStatusCards.map((item) => (
                  <StatusPill
                    key={item.label}
                    label={item.label}
                    tone={item.tone}
                    value={String(item.value)}
                  />
                ))}
              </div>
            </article>
            <UpcomingAppointments appointments={data.today.upcoming} onManage={onViewAgenda} compact />
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <DailyMovements
              expenseCents={data.today.expenseCents}
              movements={data.today.movements}
            />
            <ExpensesList
              key="daily-expenses"
              deletingId={deletingExpenseId}
              expenses={expensesQuery.data ?? []}
              isLoading={expensesQuery.isLoading}
              period="current_month"
              onDelete={(expenseId) => {
                setDeletingExpenseId(expenseId);
                deleteExpenseMutation.mutate(expenseId);
              }}
            />
          </section>

          {isDailyCashOpen ? (
            <DailyCashModal
              closingDate={closingDate}
              expenseCents={data.today.expenseCents}
              incomeCents={data.today.estimatedIncomeCents}
              isOpening={isOpeningClosingPdf}
              maxClosingDate={maxClosingDate}
              netIncomeCents={data.today.netIncomeCents}
              paymentMethods={data.today.paymentMethods}
              onChangeDate={setClosingDate}
              onClose={() => setIsDailyCashOpen(false)}
              onOpenPdf={openDailyClosingPdf}
              onRegisterExpense={() => {
                setIsDailyCashOpen(false);
                setIsExpenseFormOpen(true);
              }}
            />
          ) : null}

          {isExpenseFormOpen && (
            <ExpenseModal onClose={() => setIsExpenseFormOpen(false)}>
              <ExpenseForm
                expense={expense}
                errors={expenseErrors}
                isSaving={expenseMutation.isPending}
                onChange={(nextExpense) => {
                  setExpense(nextExpense);
                  setExpenseErrors({});
                }}
                onSubmit={submitExpense}
              />
            </ExpenseModal>
          )}
        </div>
      ) : (
        <>
          <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <article
                key={card.label}
                title={card.helper}
                className="flex min-h-[5.25rem] items-center gap-3 rounded-lg border border-[var(--color-border)] bg-white px-3 py-3 shadow-[0_8px_22px_rgba(32,24,54,0.03)]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[rgba(32,24,54,0.08)]">
                  <img src={card.icon} alt="" aria-hidden="true" className="h-[1.125rem] w-[1.125rem] opacity-70" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-[var(--color-muted-strong)]">
                    {card.label}
                  </p>
                  <div className="mt-1 flex min-w-0 items-end justify-between gap-2">
                    <p className="shrink-0 font-mono text-base font-semibold leading-none tracking-tight text-[var(--color-ink)]">
                      {card.value}
                    </p>
                    <p className="truncate text-right text-[10px] leading-4 text-[var(--color-muted)]">
                      <Change value={card.change} />
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </section>

          <section className="min-w-0 rounded-lg border border-[var(--color-border)] bg-white p-3">
        <div className="flex flex-col gap-2.5 border-b border-[var(--color-border)] pb-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Ingresos y gastos</h2>
            <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
              Valores reconocidos desde turnos y gastos registrados
            </p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-md border border-[var(--color-border)] p-1">
            {periods.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setPeriod(item.value)}
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  period === item.value
                    ? "bg-[var(--color-ink)] text-[var(--color-button-text)]"
                    : "text-[var(--color-muted-strong)] hover:bg-[rgba(32,24,54,0.04)]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="pt-3">
          <DashboardPerformanceChart data={data.chart} />
        </div>
          </section>

          <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.55fr)]">
        <article className="rounded-lg border border-[var(--color-border)] bg-white p-2.5">
          <h2 className="text-sm font-semibold">Estado de turnos</h2>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-5">
            {statusCards.map((item) => (
              <div
                key={item.label}
                className={`rounded-lg border px-2.5 py-2 ${item.className}`}
              >
                <div className={`mb-1.5 h-1 w-7 rounded-full ${item.accent}`} />
                <p className="font-mono text-lg font-semibold text-[var(--color-ink)]">{item.value}</p>
                <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">{item.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-2.5 border-t border-[var(--color-border)] pt-2.5">
            <h3 className="text-xs font-semibold text-[var(--color-muted-strong)]">Pago y seña</h3>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
              {paymentCards.map((item) => (
                <div key={item.label} title={item.helper} className={`rounded-lg border px-2.5 py-2 ${item.className}`}>
                  <div className={`mb-1.5 h-1 w-7 rounded-full ${item.accent}`} />
                  <p className="font-mono text-base font-semibold text-[var(--color-ink)]">{item.value}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </article>
        <ExpenseDistribution expenses={expensesQuery.data ?? []} isLoading={expensesQuery.isLoading} />
          </section>

          <section className={`grid gap-3 ${data.team.length > 0 ? "xl:grid-cols-2" : ""}`}>
        <PerformanceList
          rows={data.services.map((item) => ({
            details: [
              `${item.appointments} turnos`,
              `Ticket ${formatMoney(item.averageTicketCents)}`,
              `${item.incomeSharePercent.toLocaleString("es-AR")}% de la facturación`
            ],
            id: item.id,
            title: item.name,
            value: formatMoney(item.incomeCents)
          }))}
          title="Rendimiento por servicio"
        />
        {data.team.length > 0 && (
          <PerformanceList
            rows={data.team.map((item) => ({
              details: [
                `${item.completedAppointments} realizados`,
                `Ticket ${formatMoney(item.averageTicketCents)}`,
                `${item.occupancyPercent.toLocaleString("es-AR")}% de realizados`
              ],
              id: item.id,
              title: item.name,
              value: formatMoney(item.incomeCents)
            }))}
            title="Rendimiento del equipo"
          />
        )}
          </section>
          {isAnalyticsReportOpen ? (
            <AnalyticsReportModal
              dates={analyticsReportDates}
              error={analyticsReportError}
              isDownloading={isDownloadingReport}
              maxDate={maxClosingDate}
              onChange={(dates) => {
                setAnalyticsReportDates(dates);
                setAnalyticsReportError("");
              }}
              onClose={() => setIsAnalyticsReportOpen(false)}
              onSubmit={() => void downloadAnalyticsReport()}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function SummarySectionTabs({
  active,
  onChange
}: {
  active: "daily" | "analytics";
  onChange: (section: "daily" | "analytics") => void;
}) {
  const tabs = [
    { icon: calendarRangeIcon, label: "Diario", value: "daily" as const },
    { icon: analyticsIcon, label: "Analítica", value: "analytics" as const }
  ];

  return (
    <nav className="inline-flex overflow-hidden rounded-lg border border-[var(--color-border)] bg-white p-0.5 shadow-[0_8px_20px_rgba(32,24,54,0.035)]">
      {tabs.map((tab, index) => (
        <div key={tab.value} className="flex items-center">
          {index > 0 && <span className="mx-1 h-4 w-px bg-[var(--color-border)]" />}
          <button
            type="button"
            onClick={() => onChange(tab.value)}
            className={`group inline-flex h-8 w-[8.25rem] shrink-0 items-center justify-center gap-2 rounded-md px-3 text-[0.75rem] font-semibold leading-4 transition-colors ${
              active === tab.value
                ? "bg-[var(--color-ink)] text-[var(--color-button-text)]"
                : "text-[var(--color-muted-strong)] hover:bg-[rgba(32,24,54,0.04)]"
            }`}
          >
            <img
              src={tab.icon}
              alt=""
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 opacity-75 transition duration-200 group-hover:scale-110 ${
                active === tab.value ? "invert" : ""
              }`}
            />
            {tab.label}
          </button>
        </div>
      ))}
    </nav>
  );
}

function DailyCashLauncher({
  netIncomeCents,
  onOpen
}: {
  netIncomeCents: number;
  onOpen: () => void;
}) {
  return (
    <section className="flex h-9 w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
      <span className="text-xs font-semibold text-[var(--color-muted-strong)]">Caja diaria</span>
      <span className="rounded-full bg-[rgba(32,24,54,0.08)] px-2 py-1 font-mono text-[0.6875rem] font-semibold text-[var(--color-ink)]">
        Neto {formatMoney(netIncomeCents)}
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="h-8 rounded-md bg-[var(--color-ink)] px-4 text-xs font-semibold text-[var(--color-button-text)]"
      >
        Ver caja
      </button>
    </section>
  );
}

function DailyCashModal({
  closingDate,
  expenseCents,
  incomeCents,
  isOpening,
  maxClosingDate,
  netIncomeCents,
  paymentMethods,
  onChangeDate,
  onClose,
  onOpenPdf,
  onRegisterExpense
}: {
  closingDate: string;
  expenseCents: number;
  incomeCents: number;
  isOpening: boolean;
  maxClosingDate: string;
  netIncomeCents: number;
  paymentMethods: DashboardSummary["today"]["paymentMethods"];
  onChangeDate: (date: string) => void;
  onClose: () => void;
  onOpenPdf: () => void;
  onRegisterExpense: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isOpening) onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpening, onClose]);

  return (
    <div
      className="viewport-overlay modal-overlay-enter z-[100] grid place-items-center bg-[rgba(32,24,54,0.58)] p-3 backdrop-blur-sm"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !isOpening) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-cash-title"
        className="modal-panel-enter modal-scroll-panel w-full max-w-lg overflow-x-hidden rounded-xl border border-[rgba(32,24,54,0.12)] bg-white shadow-[0_28px_90px_rgba(32,24,54,0.34)]"
      >
        <header className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <h2 id="daily-cash-title" className="text-sm font-semibold text-[var(--color-ink)]">Caja diaria</h2>
            <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">Balance y cierre de caja.</p>
          </div>
          <ModalCloseButton disabled={isOpening} onClick={onClose} />
        </header>
        <div className="p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <ClosingMetric label="Ingresos" value={formatMoney(incomeCents)} />
            <ClosingMetric label="Gastos" value={formatMoney(expenseCents)} />
            <ClosingMetric label="Neto / caja esperada" value={formatMoney(netIncomeCents)} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-3">
            {paymentMethods.length === 0 ? (
              <span className="text-[11px] text-[var(--color-muted)]">Sin cobros registrados</span>
            ) : (
              paymentMethods.map((item) => (
                <span key={item.method} className="rounded-md bg-[rgba(32,24,54,0.08)] px-2 py-1 text-[11px] text-[var(--color-muted-strong)]">
                  {item.method}: <strong className="font-mono text-[var(--color-ink)]">{formatMoney(item.amountCents)}</strong>
                </span>
              ))
            )}
          </div>
        </div>
        <footer className="grid gap-3 border-t border-[var(--color-border)] px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="text-[11px] font-semibold text-[var(--color-muted-strong)]">
            Fecha del cierre
            <input
              type="date"
              max={maxClosingDate}
              value={closingDate}
              onChange={(event) => onChangeDate(event.target.value > maxClosingDate ? maxClosingDate : event.target.value)}
              className="mt-1 h-8 w-full rounded-md border border-[var(--color-border-strong)] bg-white px-2 text-xs font-normal text-[var(--color-ink)]"
            />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={isOpening}
              onClick={onRegisterExpense}
              className="h-8 rounded-md border border-[var(--color-border-strong)] bg-white px-4 text-xs font-semibold text-[var(--color-ink)] disabled:opacity-60"
            >
              Registrar gasto
            </button>
            <button
              type="button"
              disabled={isOpening}
              onClick={onOpenPdf}
              className="h-8 rounded-md bg-[var(--color-ink)] px-4 text-xs font-semibold text-[var(--color-button-text)] disabled:cursor-wait disabled:opacity-60"
            >
              {isOpening ? "Generando..." : "Cerrar caja y descargar"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function ClosingMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[rgba(32,24,54,0.08)] px-3 py-2.5">
      <p className="text-[10px] font-medium text-[var(--color-muted)]">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

function TodayMetric({
  label,
  tone,
  value
}: {
  label: string;
  tone: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-[rgba(32,24,54,0.08)] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-[var(--color-muted)]">{label}</p>
        <span className={`h-1.5 w-1.5 rounded-full ${tone}`} />
      </div>
      <p className="mt-1 font-mono text-base font-semibold">{value}</p>
    </div>
  );
}

function StatusPill({
  label,
  tone,
  value
}: {
  label: string;
  tone: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md bg-[rgba(32,24,54,0.08)] px-2.5 py-1 text-[11px] text-[var(--color-muted-strong)]">
      <span className={`h-1.5 w-1.5 rounded-full ${tone}`} />
      <strong className="font-mono text-[var(--color-ink)]">{value}</strong>
      {label}
    </span>
  );
}

function UpcomingAppointments({
  appointments,
  compact = false,
  onManage
}: {
  appointments: DashboardSummary["today"]["upcoming"];
  compact?: boolean;
  onManage: () => void;
}) {
  return (
    <article className="min-w-0 rounded-lg border border-[var(--color-border)] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Próximos turnos</h2>
          <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">Agenda pendiente de hoy.</p>
        </div>
      </div>
      {appointments.length === 0 ? (
        <p className="mt-3 rounded-lg bg-[rgba(32,24,54,0.08)] p-3 text-center text-xs text-[var(--color-muted)]">
          No quedan turnos para hoy.
        </p>
      ) : (
        compact ? (
          <div className="mt-4 space-y-2.5">
            {appointments.map((appointment) => (
              <div key={appointment.id} className="grid gap-2 rounded-md bg-[rgba(32,24,54,0.08)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">
                      <span className="font-mono">{appointment.time}</span> · {appointment.client}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--color-muted)]">
                      {appointment.service} · {appointment.professional}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onManage}
                    className="shrink-0 rounded-md border border-[var(--color-border)] px-2 py-1 text-[10px] font-semibold text-[var(--color-ink)] hover:bg-white"
                  >
                    Gestionar
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <SummaryBadge label={appointment.status} tone="appointment" />
                  <SummaryBadge label={appointment.paymentStatus} tone="payment" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="text-[10px] uppercase text-[var(--color-muted)]">
              <tr className="border-b border-[var(--color-border)]">
                <th className="py-2 pr-3 font-semibold">Hora</th>
                <th className="py-2 pr-3 font-semibold">Cliente</th>
                <th className="py-2 pr-3 font-semibold">Servicio</th>
                <th className="py-2 pr-3 font-semibold">Profesional</th>
                <th className="py-2 pr-3 font-semibold">Turno</th>
                <th className="py-2 font-semibold">Pago</th>
                <th className="py-2 text-right font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {appointments.map((appointment) => (
                <tr key={appointment.id}>
                  <td className="py-1.5 pr-3 font-mono font-semibold">{appointment.time}</td>
                  <td className="py-1.5 pr-3 font-semibold">{appointment.client}</td>
                  <td className="py-1.5 pr-3 text-[var(--color-muted-strong)]">{appointment.service}</td>
                  <td className="py-1.5 pr-3 text-[var(--color-muted-strong)]">{appointment.professional}</td>
                  <td className="py-1.5 pr-3"><SummaryBadge label={appointment.status} tone="appointment" /></td>
                  <td className="py-1.5"><SummaryBadge label={appointment.paymentStatus} tone="payment" /></td>
                  <td className="py-1.5 text-right">
                    <button
                      type="button"
                      onClick={onManage}
                      className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[10px] font-semibold text-[var(--color-ink)] hover:bg-[rgba(32,24,54,0.04)]"
                    >
                      Gestionar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )
      )}
    </article>
  );
}

function SummaryBadge({ label, tone }: { label: string; tone: "appointment" | "payment" }) {
  const normalizedLabel = label.toLowerCase();
  const className =
    tone === "payment"
      ? normalizedLabel.includes("pag")
        ? "bg-emerald-50 text-[#287553] border-emerald-200"
        : normalizedLabel.includes("pendiente")
          ? "bg-zinc-50 text-[var(--color-muted-strong)] border-zinc-200"
          : "bg-zinc-50 text-[var(--color-muted-strong)] border-zinc-200"
      : label === "Cancelado" || label === "No asistió"
        ? "bg-rose-50 text-[#b04b43] border-rose-200"
        : label === "Pendiente"
          ? "bg-sky-50 text-[#246b8f] border-sky-200"
          : "bg-[rgba(32,24,54,0.08)] text-[var(--color-ink)] border-[var(--color-border)]";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${className}`}>{label}</span>;
}

function DailyMovements({
  expenseCents,
  movements
}: {
  expenseCents: number;
  movements: DashboardSummary["today"]["movements"];
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <article className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Movimientos del día</h2>
            <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">Ingresos y gastos ordenados por hora.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[rgba(32,24,54,0.08)] px-2 py-1 font-mono text-xs font-semibold text-[var(--color-ink)]">
              Gastos {formatMoney(expenseCents)}
            </span>
          </div>
        </div>
        {movements.length === 0 ? (
          <p className="mt-3 rounded-lg bg-[rgba(32,24,54,0.08)] p-4 text-center text-xs text-[var(--color-muted)]">
            Sin movimientos registrados.
          </p>
        ) : (
          <div className="mt-4">
            <MovementRows movements={movements.slice(0, 3)} />
            {movements.length > 3 ? (
              <button
                type="button"
                onClick={() => setIsOpen(true)}
                className="mt-2 w-full rounded-md border border-[var(--color-border)] bg-white py-1.5 text-[11px] font-semibold text-[var(--color-ink)] hover:bg-[rgba(32,24,54,0.04)]"
              >
                Ver todos ({movements.length})
              </button>
            ) : null}
          </div>
        )}
      </article>
      {isOpen ? <DailyMovementsModal movements={movements} onClose={() => setIsOpen(false)} /> : null}
    </>
  );
}

function MovementRows({ movements }: { movements: DashboardSummary["today"]["movements"] }) {
  return (
    <div className="space-y-2">
      {movements.map((movement, index) => (
        <div key={`${movement.kind}-${movement.sortAt}-${index}`} className="flex items-center justify-between gap-3 rounded-md bg-[rgba(32,24,54,0.08)] px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{movement.time} · {movement.concept}</p>
            <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">{movement.method} · {movement.kind === "expense" ? "Gasto" : "Ingreso"} · {movement.label}</p>
          </div>
          <span className={`shrink-0 font-mono text-xs font-semibold ${movement.kind === "expense" ? "text-[#b04b43]" : "text-[#287553]"}`}>
            {movement.kind === "expense" ? "-" : "+"}{formatMoney(movement.amountCents)}
          </span>
        </div>
      ))}
    </div>
  );
}

function DailyMovementsModal({
  movements,
  onClose
}: {
  movements: DashboardSummary["today"]["movements"];
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

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
        aria-labelledby="daily-movements-title"
        className="modal-panel-enter modal-scroll-panel w-full max-w-xl overflow-x-hidden rounded-xl border border-[rgba(32,24,54,0.12)] bg-white shadow-[0_28px_90px_rgba(32,24,54,0.34)]"
      >
        <header className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <h2 id="daily-movements-title" className="text-sm font-semibold text-[var(--color-ink)]">Movimientos del día</h2>
            <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">{movements.length} movimientos registrados.</p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </header>
        <div className="p-3">
          <MovementRows movements={movements} />
        </div>
      </section>
    </div>
  );
}

function ExpenseModal({
  children,
  onClose
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

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
      <div className="modal-panel-enter modal-scroll-panel w-full max-w-md overflow-x-hidden rounded-xl border border-[rgba(32,24,54,0.12)] bg-white shadow-[0_28px_90px_rgba(32,24,54,0.34)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">Registrar gasto</h2>
            <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">Cargá un egreso para el cierre del día.</p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </div>
        <div className="p-3">{children}</div>
      </div>
    </div>
  );
}

function AnalyticsReportModal({
  dates,
  error,
  isDownloading,
  maxDate,
  onChange,
  onClose,
  onSubmit
}: {
  dates: { from: string; to: string };
  error: string;
  isDownloading: boolean;
  maxDate: string;
  onChange: (dates: { from: string; to: string }) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isDownloading) onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDownloading, onClose]);

  return (
    <div
      className="viewport-overlay modal-overlay-enter z-[100] grid place-items-center bg-[rgba(32,24,54,0.58)] p-3 backdrop-blur-sm"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !isDownloading) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="analytics-report-title"
        className="modal-panel-enter modal-scroll-panel w-full max-w-md overflow-x-hidden rounded-xl border border-[rgba(32,24,54,0.12)] bg-white shadow-[0_28px_90px_rgba(32,24,54,0.34)]"
      >
        <header className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <h2 id="analytics-report-title" className="text-sm font-semibold text-[var(--color-ink)]">
              Descargar resumen
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
              Elegí el período que querés incluir.
            </p>
          </div>
          <ModalCloseButton disabled={isDownloading} onClick={onClose} />
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-[var(--color-muted-strong)]">
              Desde
              <input
                type="date"
                max={dates.to || maxDate}
                value={dates.from}
                onChange={(event) => onChange({ ...dates, from: event.target.value })}
                className="mt-1 h-9 w-full rounded-md border border-[var(--color-border-strong)] bg-white px-2 text-xs font-normal text-[var(--color-ink)]"
              />
            </label>
            <label className="text-xs font-semibold text-[var(--color-muted-strong)]">
              Hasta
              <input
                type="date"
                min={dates.from}
                max={maxDate}
                value={dates.to}
                onChange={(event) => onChange({ ...dates, to: event.target.value })}
                className="mt-1 h-9 w-full rounded-md border border-[var(--color-border-strong)] bg-white px-2 text-xs font-normal text-[var(--color-ink)]"
              />
            </label>
            {error ? <p className="text-[11px] font-medium text-[#b04b43] sm:col-span-2">{error}</p> : null}
          </div>
          <footer className="flex flex-col-reverse gap-2 border-t border-[var(--color-border)] px-4 py-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={isDownloading}
              onClick={onClose}
              className="h-8 rounded-md border border-[var(--color-border-strong)] bg-white px-4 text-xs font-semibold text-[var(--color-ink)] disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isDownloading}
              className="h-8 rounded-md bg-[var(--color-ink)] px-4 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60"
            >
              {isDownloading ? "Generando..." : "Descargar PDF"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function ExpenseDistribution({
  expenses,
  isLoading
}: {
  expenses: DashboardExpense[];
  isLoading: boolean;
}) {
  const total = expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
  const categories = Array.from(
    expenses.reduce((groups, expense) => {
      groups.set(expense.category, (groups.get(expense.category) ?? 0) + expense.amountCents);
      return groups;
    }, new Map<string, number>()),
    ([category, amountCents]) => ({ amountCents, category })
  ).sort((a, b) => b.amountCents - a.amountCents);

  return (
    <article className="rounded-lg border border-[var(--color-border)] bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Distribución de gastos</h2>
          <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">Participación por categoría</p>
        </div>
        <span className="rounded-full bg-[rgba(32,24,54,0.08)] px-2 py-0.5 font-mono text-xs font-semibold">
          {formatMoney(total)}
        </span>
      </div>
      {isLoading ? (
        <p className="mt-3 rounded-md bg-[rgba(32,24,54,0.08)] p-4 text-center text-xs text-[var(--color-muted)]">
          Cargando gastos...
        </p>
      ) : categories.length === 0 ? (
        <p className="mt-3 rounded-md bg-[rgba(32,24,54,0.08)] p-4 text-center text-xs text-[var(--color-muted)]">
          No hay gastos en este período.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {categories.map((item) => {
            const percentage = total ? Math.round((item.amountCents / total) * 1000) / 10 : 0;
            return (
              <div key={item.category}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-semibold text-[var(--color-ink)]">{item.category}</span>
                  <span className="shrink-0 font-mono font-semibold text-[var(--color-ink)]">
                    {formatMoney(item.amountCents)} · {percentage.toLocaleString("es-AR")}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[rgba(32,24,54,0.08)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-accent)]"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

function ExpensesList({
  deletingId,
  expenses,
  isLoading,
  onDelete,
  period
}: {
  deletingId: string | null;
  expenses: DashboardExpense[];
  isLoading: boolean;
  onDelete: (expenseId: string) => void;
  period: DashboardSummaryPeriod;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isAllOpen, setIsAllOpen] = useState(false);
  const bounds = expenseDateBounds(period);
  const activeDate = selectedDate ?? (expenses[0] ? localDateInputValue(expenses[0].occurredOn) : bounds.max);
  const selectedExpenses = expenses.filter((expense) => localDateInputValue(expense.occurredOn) === activeDate);
  const selectedTotal = selectedExpenses.reduce((sum, item) => sum + item.amountCents, 0);
  const visibleExpenses = selectedExpenses.slice(0, 3);

  return (
    <>
      <article className="rounded-lg border border-[var(--color-border)] bg-white p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Gastos registrados</h2>
            <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">Gestionados por día</p>
          </div>
          <span className="rounded-full bg-[rgba(32,24,54,0.08)] px-2 py-0.5 font-mono text-xs font-semibold">
            {formatMoney(selectedTotal)}
          </span>
        </div>
        <div className="mt-2.5 pr-1">
          {isLoading ? (
            <p className="rounded-lg bg-[rgba(32,24,54,0.08)] p-4 text-center text-xs text-[var(--color-muted)]">
              Cargando gastos...
            </p>
          ) : (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Ver día anterior"
                  disabled={activeDate <= bounds.min}
                  onClick={() => setSelectedDate(shiftDateValue(activeDate, -1))}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[var(--color-border)] text-base leading-none text-[var(--color-muted-strong)] hover:bg-[rgba(32,24,54,0.05)] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  ‹
                </button>
                <input
                  type="date"
                  aria-label="Fecha de los gastos"
                  min={bounds.min}
                  max={bounds.max}
                  value={activeDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="h-8 min-w-0 flex-1 rounded-md border border-[var(--color-border-strong)] bg-white px-2 text-[11px] font-semibold text-[var(--color-ink)]"
                />
                <button
                  type="button"
                  aria-label="Ver día siguiente"
                  disabled={activeDate >= bounds.max}
                  onClick={() => setSelectedDate(shiftDateValue(activeDate, 1))}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[var(--color-border)] text-base leading-none text-[var(--color-muted-strong)] hover:bg-[rgba(32,24,54,0.05)] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  ›
                </button>
              </div>
              {selectedExpenses.length === 0 ? (
                <p className="rounded-md bg-[rgba(32,24,54,0.08)] p-4 text-center text-xs text-[var(--color-muted)]">
                  No hay gastos registrados este día.
                </p>
              ) : (
                <ExpenseRows
                  deletingId={deletingId}
                  expenses={visibleExpenses}
                  onDelete={onDelete}
                />
              )}
              {selectedExpenses.length > 3 ? (
              <button
                type="button"
                onClick={() => setIsAllOpen(true)}
                className="mt-2 w-full rounded-md border border-[var(--color-border)] bg-white py-1.5 text-[11px] font-semibold text-[var(--color-ink)] hover:bg-[rgba(32,24,54,0.04)]"
              >
                Ver todos ({selectedExpenses.length})
              </button>
              ) : null}
            </section>
          )}
        </div>
      </article>
      {isAllOpen ? (
        <ExpensesDayModal
          date={activeDate}
          deletingId={deletingId}
          expenses={selectedExpenses}
          onClose={() => setIsAllOpen(false)}
          onDelete={onDelete}
        />
      ) : null}
    </>
  );
}

function ExpenseRows({
  deletingId,
  expenses,
  onDelete
}: {
  deletingId: string | null;
  expenses: DashboardExpense[];
  onDelete: (expenseId: string) => void;
}) {
  return (
    <div className="divide-y divide-[var(--color-border)] rounded-md bg-[rgba(32,24,54,0.08)] px-2">
      {expenses.map((item) => (
        <div key={item.id} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{item.description}</p>
            <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
              {item.category} · {formatExpenseMethod(item.paymentMethod)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-xs font-semibold">{formatMoney(item.amountCents)}</p>
            <button
              type="button"
              disabled={deletingId === item.id}
              onClick={() => onDelete(item.id)}
              className="mt-0.5 text-[11px] font-semibold text-[#b04b43] disabled:opacity-50"
            >
              {deletingId === item.id ? "Eliminando..." : "Eliminar"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ExpensesDayModal({
  date,
  deletingId,
  expenses,
  onClose,
  onDelete
}: {
  date: string;
  deletingId: string | null;
  expenses: DashboardExpense[];
  onClose: () => void;
  onDelete: (expenseId: string) => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const total = expenses.reduce((sum, item) => sum + item.amountCents, 0);

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
        aria-labelledby="expenses-day-title"
        className="modal-panel-enter modal-scroll-panel w-full max-w-md overflow-x-hidden rounded-xl border border-[rgba(32,24,54,0.12)] bg-white shadow-[0_28px_90px_rgba(32,24,54,0.34)]"
      >
        <header className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <h2 id="expenses-day-title" className="text-sm font-semibold text-[var(--color-ink)]">
              Gastos del día
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
              {formatExpenseDate(date)} · {formatMoney(total)}
            </p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </header>
        <div className="p-3">
          <ExpenseRows deletingId={deletingId} expenses={expenses} onDelete={onDelete} />
        </div>
      </section>
    </div>
  );
}

function ExpenseForm({
  expense,
  errors,
  isSaving,
  onChange,
  onSubmit
}: {
  expense: { amount: string; category: string; date: string; description: string; paymentMethod: string };
  errors: Partial<Record<keyof typeof expense, string>>;
  isSaving: boolean;
  onChange: (expense: { amount: string; category: string; date: string; description: string; paymentMethod: string }) => void;
  onSubmit: () => void;
}) {
  return (
    <article className="bg-white">
      <form
        noValidate
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label className="text-xs font-semibold text-[var(--color-muted-strong)]">
          Descripción
          <input
            maxLength={160}
            value={expense.description}
            onChange={(event) =>
              onChange({ ...expense, description: event.target.value })
            }
            placeholder="Ej: Insumos, limpieza, alquiler"
            className="mt-1 h-10 w-full rounded-md border border-[var(--color-border-strong)] px-3 text-sm font-normal text-[var(--color-ink)]"
          />
          {errors.description && <FieldError>{errors.description}</FieldError>}
        </label>
        <label className="text-xs font-semibold text-[var(--color-muted-strong)]">
          Categoría
          <select
            value={expense.category}
            onChange={(event) => onChange({ ...expense, category: event.target.value })}
            className="mt-1 h-10 w-full rounded-md border border-[var(--color-border-strong)] bg-white px-3 text-sm font-normal text-[var(--color-ink)]"
          >
            {expenseCategories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          {errors.category && <FieldError>{errors.category}</FieldError>}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-[var(--color-muted-strong)]">
            Monto
            <input
              step="0.01"
              type="number"
              value={expense.amount}
              onChange={(event) => onChange({ ...expense, amount: event.target.value })}
              placeholder="$ 0"
              className="mt-1 h-10 w-full rounded-md border border-[var(--color-border-strong)] px-3 text-sm font-normal text-[var(--color-ink)]"
            />
            {errors.amount && <FieldError>{errors.amount}</FieldError>}
          </label>
          <label className="text-xs font-semibold text-[var(--color-muted-strong)]">
            Fecha
            <input
              type="date"
              value={expense.date}
              onChange={(event) => onChange({ ...expense, date: event.target.value })}
              className="mt-1 h-10 w-full rounded-md border border-[var(--color-border-strong)] px-2 text-sm font-normal text-[var(--color-ink)]"
            />
            {errors.date && <FieldError>{errors.date}</FieldError>}
          </label>
        </div>
        <label className="text-xs font-semibold text-[var(--color-muted-strong)]">
          Método de pago
          <select
            value={expense.paymentMethod}
            onChange={(event) => onChange({ ...expense, paymentMethod: event.target.value })}
            className="mt-1 h-10 w-full rounded-md border border-[var(--color-border-strong)] bg-white px-3 text-sm font-normal text-[var(--color-ink)]"
          >
            {paymentMethods.map((method) => (
              <option key={method.value} value={method.value}>{method.label}</option>
            ))}
          </select>
          {errors.paymentMethod && <FieldError>{errors.paymentMethod}</FieldError>}
        </label>
        <button
          disabled={isSaving}
          className="mt-1 h-10 rounded-md bg-[var(--color-ink)] text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60"
        >
          {isSaving ? "Guardando..." : "Guardar gasto"}
        </button>
      </form>
    </article>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return <span className="mt-1 block text-[11px] font-medium text-[#b04b43]">{children}</span>;
}

function PerformanceList({
  rows,
  title
}: {
  rows: Array<{ details: string[]; id: string; title: string; value: string }>;
  title: string;
}) {
  return (
    <article className="rounded-lg border border-[var(--color-border)] bg-white p-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-2.5 divide-y divide-[var(--color-border)]">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--color-muted)]">
            Todavía no hay datos suficientes para este período.
          </p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="grid gap-2 py-2 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{row.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {row.details.map((detail) => (
                    <span key={detail} className="inline-flex items-center rounded-md bg-[rgba(32,24,54,0.08)] px-1.5 py-0.5 text-[10px] leading-4 text-[var(--color-muted-strong)]">
                      {detail}
                    </span>
                  ))}
                </div>
              </div>
              <span className="justify-self-start whitespace-nowrap font-mono text-xs font-semibold text-[var(--color-ink)] sm:justify-self-end">
                {row.value}
              </span>
            </div>
          ))
        )}
      </div>
    </article>
  );
}
