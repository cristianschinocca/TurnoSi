import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Navigate, useSearchParams } from "react-router-dom";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfWeek,
  format,
  isSameMonth,
  isWithinInterval,
  startOfMonth,
  startOfWeek,
  startOfToday,
  subDays,
  subMonths,
  subWeeks
} from "date-fns";
import { es } from "date-fns/locale";

import { PageLayout } from "../../components/layout/PageLayout";
import { ModalCloseButton } from "../../components/ui";
import { queryKeys } from "../../lib/query-keys";
import { useSessionQuery } from "../auth/auth.queries";
import type { AuthResult } from "../auth/auth.types";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardSidebar } from "./DashboardSidebar";
import { DashboardSummaryView } from "./DashboardSummaryView";
import { ManualAppointmentModal } from "./ManualAppointmentModal";
import { RescheduleAppointmentModal } from "./RescheduleAppointmentModal";
import { StatusChangeModal } from "./StatusChangeModal";
import {
  type AppointmentStatusLabel,
  type ScheduleView,
  type StatusChangeDraft
} from "./dashboard.constants";
import { type DashboardAppointment } from "./dashboard.data";
import {
  clearDashboardAppointmentDepositPayment,
  getDashboardAppointments,
  getRecentDashboardReservations,
  getReservationNotificationState,
  markDashboardAppointmentDepositPaid,
  updateDashboardAppointmentStatus,
  updateReservationNotificationState
} from "./dashboard.api";
import type { DashboardView } from "./dashboard.types";
import { getSubscription } from "../billing/billing.api";
import { BillingSettings } from "./BillingSettings";
import { canAccessDashboardView, getAllowedDashboardViews } from "./dashboard.permissions";
import notificationSoundUrl from "../../components/assets/audio/notification-sound.mp3";

const DashboardAgendaView = lazy(() =>
  import("./DashboardAgendaView").then((module) => ({
    default: module.DashboardAgendaView
  }))
);
const DashboardAvailabilityView = lazy(() =>
  import("./DashboardAvailabilityView").then((module) => ({
    default: module.DashboardAvailabilityView
  }))
);
const DashboardCustomersView = lazy(() =>
  import("./DashboardCustomersView").then((module) => ({
    default: module.DashboardCustomersView
  }))
);
const DashboardTeamView = lazy(() =>
  import("./DashboardTeamView").then((module) => ({
    default: module.DashboardTeamView
  }))
);
const DashboardSettingsView = lazy(() =>
  import("./DashboardSettingsView").then((module) => ({
    default: module.DashboardSettingsView
  }))
);
type DashboardPageProps = {
  brand: ReactNode;
};

const dashboardViewStorageKey = "turnosi.dashboard.activeView";
const calendarMinMonth = new Date(2026, 0, 1);
const dashboardViews: DashboardView[] = [
  "summary",
  "agenda",
  "customers",
  "team",
  "availability",
  "settings"
];
const emptyDashboardAppointments: DashboardAppointment[] = [];

function reservationSeenStorageKey(organizationId: string) {
  return `turnosi.dashboard.reservationsSeenUntil.${organizationId}`;
}

function readReservationSeenUntil(organizationId?: string) {
  if (!organizationId || typeof window === "undefined") return 0;
  return Number(window.localStorage.getItem(reservationSeenStorageKey(organizationId)) ?? 0);
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "R";
}

function isSameDate(firstDate: Date, secondDate: Date) {
  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
}

function getInitialDashboardView(): DashboardView {
  if (typeof window === "undefined") return "summary";

  const storedView = window.localStorage.getItem(dashboardViewStorageKey);
  return dashboardViews.includes(storedView as DashboardView)
    ? (storedView as DashboardView)
    : "summary";
}

function DashboardSectionFallback() {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[#ffffff] p-5 shadow-[0_16px_44px_rgba(32,24,54,0.05)]">
      <p className="text-sm font-medium text-[var(--color-ink)]">
        Cargando sección...
      </p>
    </div>
  );
}

export function DashboardPage({ brand }: DashboardPageProps) {
  const shouldReduceMotion = useReducedMotion();
  const [activeView, setActiveView] = useState<DashboardView>(
    getInitialDashboardView
  );
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [scheduleView, setScheduleView] = useState<ScheduleView>("day");
  const [selectedDate, setSelectedDate] = useState(() => startOfToday());
  const [settingsHaveUnsavedChanges, setSettingsHaveUnsavedChanges] =
    useState(false);
  const [pendingDashboardView, setPendingDashboardView] =
    useState<DashboardView | null>(null);
  const [billingError, setBillingError] = useState("");
  const [billingMessage, setBillingMessage] = useState("");
  const [showBillingPlans, setShowBillingPlans] = useState(false);
  const [showManualAppointment, setShowManualAppointment] = useState(false);
  const [appointmentStatusChanges, setAppointmentStatusChanges] = useState<
    Record<string, AppointmentStatusLabel>
  >({});
  const [pendingStatusChange, setPendingStatusChange] =
    useState<StatusChangeDraft | null>(null);
  const [pendingRescheduleAppointment, setPendingRescheduleAppointment] =
    useState<DashboardAppointment | null>(null);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [reservationSeenUntil, setReservationSeenUntil] = useState(0);
  const [notificationFallbackSince] = useState(
    () => Date.now() - 24 * 60 * 60 * 1000
  );
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastSoundReservationIdRef = useRef<string | null>(null);
  const notificationFeedLoadedRef = useRef(false);
  const [hiddenToastReservationId, setHiddenToastReservationId] =
    useState<string | null>(null);
  const [isReservationToastLeaving, setIsReservationToastLeaving] = useState(false);
  const session = useSessionQuery();
  const subscriptionQuery = useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: getSubscription,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? 5_000 : false
  });
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const monthStart = useMemo(() => startOfMonth(selectedDate), [selectedDate]);
  const monthEnd = useMemo(() => addMonths(monthStart, 1), [monthStart]);
  const canGoToPreviousCalendarMonth = monthStart > calendarMinMonth;
  const appointmentsKey = queryKeys.appointments(format(monthStart, "yyyy-MM"));
  const appointmentsQuery = useQuery({
    queryKey: appointmentsKey,
    queryFn: () => getDashboardAppointments(monthStart, monthEnd),
    staleTime: 10 * 1000,
    refetchInterval: 10 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    enabled:
      activeView === "agenda" &&
      Boolean(session.data?.data.organizations?.[0]) &&
      session.data?.data.organizations?.[0]?.onboardingCompleted !== false
  });
  const allAppointments = appointmentsQuery.data ?? emptyDashboardAppointments;

  const handleEscape = useCallback((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      setPendingStatusChange(null);
    }
  }, []);

  useEffect(() => {
    if (session.data) {
      const role = session.data.data.organizations?.[0]?.role;
      const required =
        session.data.data.organizations?.[0]?.onboardingCompleted === false;
      // Session state can force the first dashboard view.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOnboardingRequired(required);
      if (required) setActiveView("settings");
      else if (!canAccessDashboardView(role, activeView)) {
        setActiveView(getAllowedDashboardViews(role)[0] ?? "agenda");
      }
    }
  }, [activeView, session.data]);

  useEffect(() => {
    if (searchParams.get("subscription") !== "return") return;
    void getSubscription()
      .then((subscription) => {
        setBillingMessage(
          subscription?.status === "authorized"
            ? "Tu suscripción quedó activa."
            : "Estamos confirmando tu suscripción con Mercado Pago."
        );
        setSearchParams({}, { replace: true });
      })
      .catch(() => {
        setBillingError("No pudimos consultar el estado de la suscripción.");
      });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [handleEscape]);

  useEffect(() => {
    window.localStorage.setItem(dashboardViewStorageKey, activeView);
  }, [activeView]);

  useEffect(() => {
    const handleSettingsDirty = (event: Event) => {
      setSettingsHaveUnsavedChanges(
        Boolean((event as CustomEvent<boolean>).detail)
      );
    };
    window.addEventListener("turnosi:settings-dirty", handleSettingsDirty);
    return () =>
      window.removeEventListener("turnosi:settings-dirty", handleSettingsDirty);
  }, []);


  const appointments = getAppointmentsForSelectedPeriod();
  const filteredAppointments = appointments;

  function patchAppointmentCaches(
    appointmentId: string,
    patch: (appointment: DashboardAppointment) => DashboardAppointment
  ) {
    queryClient.setQueryData<DashboardAppointment[]>(
      appointmentsKey,
      (current = []) =>
        current.map((appointment) =>
          appointment.id === appointmentId ? patch(appointment) : appointment
        )
    );
    void queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
  }

  function getAppointmentStatus(
    appointment: DashboardAppointment
  ): AppointmentStatusLabel {
    const status =
      appointmentStatusChanges[appointment.id] ??
      (appointment.attended ? "Asistido" : appointment.status);

    if (
      status === "Confirmado" &&
      appointment.depositPayment?.status === "approved" &&
      !appointment.confirmedByBusinessAt
    ) {
      return "Señado";
    }

    return status;
  }

  function getAppointmentsForSelectedPeriod(): DashboardAppointment[] {
    const selectedWeek = {
      start: startOfWeek(selectedDate, { weekStartsOn: 1 }),
      end: endOfWeek(selectedDate, { weekStartsOn: 1 })
    };

    if (scheduleView === "day") {
      return allAppointments.filter((appointment) =>
        appointment.startsAt
          ? isSameDate(new Date(appointment.startsAt), selectedDate)
          : false
      );
    }

    if (scheduleView === "week") {
      return allAppointments.filter((appointment) =>
        appointment.startsAt
          ? isWithinInterval(new Date(appointment.startsAt), selectedWeek)
          : false
      );
    }

    return allAppointments.filter((appointment) =>
      appointment.startsAt
        ? isSameMonth(new Date(appointment.startsAt), selectedDate)
        : false
    );
  }

  function selectScheduleView(view: ScheduleView) {
    setScheduleView(view);
  }

  function goToToday() {
    setSelectedDate(startOfToday());
    setScheduleView("day");
  }

  function goToPreviousPeriod() {
    setSelectedDate((current) => {
      const previous =
        scheduleView === "day"
          ? subDays(current, 1)
          : scheduleView === "week"
            ? subWeeks(current, 1)
            : subMonths(current, 1);
      return previous < calendarMinMonth ? current : previous;
    });
  }

  function goToNextPeriod() {
    setSelectedDate((current) => {
      if (scheduleView === "day") return addDays(current, 1);
      if (scheduleView === "week") return addWeeks(current, 1);
      return addMonths(current, 1);
    });
  }

  function goToPreviousCalendarMonth() {
    setSelectedDate((current) => {
      const previous = startOfMonth(subMonths(current, 1));
      return previous < calendarMinMonth ? current : previous;
    });
  }

  function goToNextCalendarMonth() {
    setSelectedDate((current) => addMonths(current, 1));
  }


  function requestStatusChange(
    appointment: DashboardAppointment,
    currentStatus: AppointmentStatusLabel,
    isCorrection = false
  ) {
    setPendingStatusChange({
      appointment,
      currentStatus,
      depositAmount: appointment.depositPayment?.amountCents
        ? String(appointment.depositPayment.amountCents / 100)
        : "",
      depositMethod:
        appointment.depositPayment?.method === "bank_transfer"
          ? "bank_transfer"
          : appointment.depositPayment?.method === "other"
            ? "other"
            : "cash",
      nextStatus: "",
      isCorrection
    });
  }

  function selectNextStatus(nextStatus: AppointmentStatusLabel) {
    setPendingStatusChange((current) =>
      current
        ? {
            ...current,
            nextStatus
          }
        : current
    );
  }

  function updatePendingDepositPayment(
    updates: Partial<Pick<StatusChangeDraft, "depositAmount" | "depositMethod">>
  ) {
    setPendingStatusChange((current) =>
      current
        ? {
            ...current,
            ...updates
          }
        : current
    );
  }

  async function confirmStatusChange() {
    const draft = pendingStatusChange;

    if (!draft?.nextStatus || isChangingStatus) return;

    setIsChangingStatus(true);
    try {
      const nextStatus = draft.nextStatus as AppointmentStatusLabel;
      const depositAmountCents = Math.round(
        Number(draft.depositAmount.replace(",", ".")) * 100
      );
      if (nextStatus === "Señado" && (!Number.isFinite(depositAmountCents) || depositAmountCents <= 0)) {
        return;
      }
      const paidDepositResult =
        nextStatus === "Señado"
          ? await markDashboardAppointmentDepositPaid(draft.appointment.id, {
              amountCents: depositAmountCents,
              method: draft.depositMethod
            })
          : null;
      const canClearDepositPayment =
        draft.appointment.depositPayment &&
        draft.appointment.depositPayment.method !== "mercadopago";
      const clearedDepositResult =
        draft.currentStatus === "Señado" && nextStatus === "Confirmado" && canClearDepositPayment
          ? await clearDashboardAppointmentDepositPayment(draft.appointment.id)
          : null;

      if (nextStatus !== "Señado") {
        await updateDashboardAppointmentStatus(draft.appointment.id, nextStatus);
      }

      patchAppointmentCaches(draft.appointment.id, (appointment) => ({
        ...appointment,
        status: nextStatus === "Señado" ? "Confirmado" : nextStatus,
        confirmedByBusinessAt:
          nextStatus === "Confirmado" ? new Date().toISOString() : null,
        depositPayment: clearedDepositResult
          ? null
          : paidDepositResult?.data.depositPayment ?? appointment.depositPayment,
        attended: nextStatus === "Asistido"
      }));
      if (
        draft.currentStatus === "No asistió" ||
        nextStatus === "No asistió"
      ) {
        await queryClient.invalidateQueries({ queryKey: ["customers"] });
      }
      setAppointmentStatusChanges((current) => ({
        ...current,
        [draft.appointment.id]: nextStatus
      }));
      setPendingStatusChange(null);
    } finally {
      setIsChangingStatus(false);
    }
  }

  async function clearPendingDepositPayment() {
    const draft = pendingStatusChange;
    if (!draft || isChangingStatus) return;

    setIsChangingStatus(true);
    try {
      await clearDashboardAppointmentDepositPayment(draft.appointment.id);
      patchAppointmentCaches(draft.appointment.id, (appointment) => ({
        ...appointment,
        status: "Confirmado",
        confirmedByBusinessAt: new Date().toISOString(),
        depositPayment: null,
        attended: false
      }));
      setAppointmentStatusChanges((current) => ({
        ...current,
        [draft.appointment.id]: "Confirmado"
      }));
      setPendingStatusChange(null);
    } finally {
      setIsChangingStatus(false);
    }
  }

  function handleAppointmentRescheduled(startsAt: string) {
    const appointment = pendingRescheduleAppointment;
    if (!appointment) return;

    const nextDate = new Date(startsAt);
    patchAppointmentCaches(appointment.id, (item) => ({
      ...item,
      startsAt,
      day: format(nextDate, "yyyy-MM-dd"),
      time: format(nextDate, "HH:mm")
    }));
    setSelectedDate(nextDate);
    setScheduleView("day");
    setActiveView("agenda");
    setPendingRescheduleAppointment(null);
    void queryClient.invalidateQueries({ queryKey: ["appointments"], exact: false });
  }

  function changeDashboardView(view: DashboardView) {
    if (!canAccessDashboardView(currentOrganization?.role, view)) return;
    if (onboardingRequired && view !== "settings") return;
    if (view === activeView) return;
    if (activeView === "settings" && settingsHaveUnsavedChanges) {
      window.dispatchEvent(new Event("turnosi:show-settings-dirty"));
      setPendingDashboardView(view);
      return;
    }
    if (view === "agenda") markReservationNotificationsSeen();
    setActiveView(view);
  }

  const currentOrganization = session.data?.data.organizations?.[0];
  const reservationNotificationStateQuery = useQuery({
    queryKey: queryKeys.reservationNotifications(currentOrganization?.id ?? "none"),
    queryFn: getReservationNotificationState,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    enabled:
      Boolean(currentOrganization) &&
      currentOrganization?.onboardingCompleted !== false
  });
  const notificationStateReady =
    reservationNotificationStateQuery.isFetched ||
    reservationNotificationStateQuery.isError;
  const storedReservationSeenUntil = readReservationSeenUntil(
    currentOrganization?.id
  );
  const backendReservationSeenUntil = reservationNotificationStateQuery.data ?? 0;
  const hasNoSyncedReservationSeenUntil =
    notificationStateReady &&
    backendReservationSeenUntil === 0 &&
    storedReservationSeenUntil === 0 &&
    reservationSeenUntil === 0;
  const initialReservationSeenBaseline =
    hasNoSyncedReservationSeenUntil
      ? Math.max(
          0,
          ...allAppointments
            .filter((appointment) => appointment.channel === "web" && appointment.createdAt)
            .map((appointment) => Date.parse(appointment.createdAt!))
        )
      : 0;
  const effectiveReservationSeenUntil = Math.max(
    reservationSeenUntil,
    storedReservationSeenUntil,
    backendReservationSeenUntil,
    initialReservationSeenBaseline
  );
  const notificationSinceMs =
    effectiveReservationSeenUntil || notificationFallbackSince;
  const notificationSinceIso = new Date(notificationSinceMs).toISOString();
  const recentReservationsQuery = useQuery({
    queryKey: queryKeys.recentReservations(notificationSinceIso),
    queryFn: () => getRecentDashboardReservations(new Date(notificationSinceMs)),
    staleTime: 0,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    enabled:
      Boolean(currentOrganization) &&
      currentOrganization?.onboardingCompleted !== false &&
      notificationStateReady
  });
  const reservationNotificationSource =
    recentReservationsQuery.data ?? allAppointments;
  const recentReservationSeenBaseline =
    hasNoSyncedReservationSeenUntil && recentReservationsQuery.data
      ? Math.max(
          0,
          ...recentReservationsQuery.data
            .filter((appointment) => appointment.channel === "web" && appointment.createdAt)
            .map((appointment) => Date.parse(appointment.createdAt!))
        )
      : 0;
  const newReservations = useMemo(
    () => {
      if (!notificationStateReady) return [];
      if (hasNoSyncedReservationSeenUntil) return [];
      const uniqueAppointments = new Map<string, DashboardAppointment>();
      [...reservationNotificationSource, ...allAppointments].forEach(
        (appointment) => uniqueAppointments.set(appointment.id, appointment)
      );
      return Array.from(uniqueAppointments.values())
        .filter((appointment) => {
          if (appointment.channel !== "web" || !appointment.createdAt) return false;
          if (appointment.status === "Cancelado") return false;
          return Date.parse(appointment.createdAt) > effectiveReservationSeenUntil;
        })
        .sort(
          (first, second) =>
            Date.parse(second.createdAt ?? "") - Date.parse(first.createdAt ?? "")
        );
    },
    [
      allAppointments,
      effectiveReservationSeenUntil,
      hasNoSyncedReservationSeenUntil,
      notificationStateReady,
      reservationNotificationSource
    ]
  );
  const latestNewReservation = newReservations[0];

  useEffect(() => {
    if (!currentOrganization || !reservationNotificationStateQuery.data) return;
    const backendSeenUntil = reservationNotificationStateQuery.data;
    const storedSeenUntil = readReservationSeenUntil(currentOrganization.id);
    if (backendSeenUntil <= storedSeenUntil) return;
    window.localStorage.setItem(
      reservationSeenStorageKey(currentOrganization.id),
      String(backendSeenUntil)
    );
  }, [currentOrganization, reservationNotificationStateQuery.data]);

  useEffect(() => {
    if (!currentOrganization || !notificationStateReady) return;
    const seenUntilToSync = Math.max(
      readReservationSeenUntil(currentOrganization.id),
      initialReservationSeenBaseline,
      recentReservationSeenBaseline
    );
    if (seenUntilToSync <= backendReservationSeenUntil) return;

    window.localStorage.setItem(
      reservationSeenStorageKey(currentOrganization.id),
      String(seenUntilToSync)
    );
    queryClient.setQueryData(
      queryKeys.reservationNotifications(currentOrganization.id),
      seenUntilToSync
    );
    void updateReservationNotificationState(new Date(seenUntilToSync)).catch(
      () => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.reservationNotifications(currentOrganization.id)
        });
      }
    );
  }, [
    backendReservationSeenUntil,
    currentOrganization,
    initialReservationSeenBaseline,
    notificationStateReady,
    queryClient,
    recentReservationSeenBaseline
  ]);

  useEffect(() => {
    const latestReservationId = latestNewReservation?.id;
    if (!recentReservationsQuery.isFetched) return;

    if (!notificationFeedLoadedRef.current) {
      notificationFeedLoadedRef.current = true;
      lastSoundReservationIdRef.current = latestReservationId ?? null;
      return;
    }
    if (!latestReservationId || lastSoundReservationIdRef.current === latestReservationId) {
      return;
    }

    lastSoundReservationIdRef.current = latestReservationId;
    setHiddenToastReservationId(null);
    setIsReservationToastLeaving(false);
    const audio =
      notificationAudioRef.current ?? new Audio(notificationSoundUrl);
    notificationAudioRef.current = audio;
    audio.volume = 0.55;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, [latestNewReservation?.id, recentReservationsQuery.isFetched]);
  const shouldShowReservationToast =
    Boolean(latestNewReservation) &&
    hiddenToastReservationId !== latestNewReservation?.id;

  useEffect(() => {
    if (!shouldShowReservationToast || !latestNewReservation?.id) return;
    let hideTimeoutId: number | undefined;
    const timeoutId = window.setTimeout(() => {
      setIsReservationToastLeaving(true);
      hideTimeoutId = window.setTimeout(() => {
        setHiddenToastReservationId(latestNewReservation.id);
        setIsReservationToastLeaving(false);
      }, 220);
    }, 10_000);
    return () => {
      window.clearTimeout(timeoutId);
      if (hideTimeoutId) window.clearTimeout(hideTimeoutId);
    };
  }, [latestNewReservation?.id, shouldShowReservationToast]);
  const effectiveActiveView = canAccessDashboardView(
    currentOrganization?.role,
    activeView
  )
    ? activeView
    : "summary";
  const requiresSubscription =
    currentOrganization?.role === "owner" &&
    subscriptionQuery.isSuccess &&
    subscriptionQuery.data?.status !== "authorized";

  function markReservationNotificationsSeen() {
    if (!currentOrganization || newReservations.length === 0) return;
    const latestSeen = Math.max(
      ...newReservations.map((appointment) =>
        Date.parse(appointment.createdAt ?? new Date().toISOString())
      )
    );
    const nextSeenUntil = Math.max(latestSeen, effectiveReservationSeenUntil);
    window.localStorage.setItem(
      reservationSeenStorageKey(currentOrganization.id),
      String(nextSeenUntil)
    );
    setReservationSeenUntil(nextSeenUntil);
    queryClient.setQueryData(
      queryKeys.reservationNotifications(currentOrganization.id),
      nextSeenUntil
    );
    void updateReservationNotificationState(new Date(nextSeenUntil)).catch(
      () => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.reservationNotifications(currentOrganization.id)
        });
      }
    );
  }

  function openLatestReservation() {
    if (latestNewReservation?.startsAt) {
      setSelectedDate(new Date(latestNewReservation.startsAt));
      setScheduleView("day");
    }
    markReservationNotificationsSeen();
    void queryClient.invalidateQueries({ queryKey: ["appointments"], exact: false });
    changeDashboardView("agenda");
  }

  if (requiresSubscription) {
    return <Navigate to="/planes" replace />;
  }

  return (
    <PageLayout className="dashboard-page">
      <motion.div
        className="dashboard-shell min-h-screen overflow-x-clip"
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        <DashboardSidebar
          activeView={effectiveActiveView}
          brand={brand}
          navigationLocked={onboardingRequired}
          subscription={subscriptionQuery.data}
          role={currentOrganization?.role}
          unreadReservationsCount={newReservations.length}
          onOpenBillingPlans={() => setShowBillingPlans(true)}
          onOpenManualAppointment={() => setShowManualAppointment(true)}
          onChangeView={changeDashboardView}
        />

        <motion.section
          className="min-w-0 max-w-full overflow-x-clip"
          initial={shouldReduceMotion ? false : { opacity: 0, x: 18, y: 8 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ duration: 0.58, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        >
          <DashboardHeader
            activeView={effectiveActiveView}
          />

          <div
            className={`min-w-0 max-w-full overflow-x-clip ${
              effectiveActiveView === "summary"
                ? "space-y-3 px-4 pb-8 pt-2 sm:px-6 sm:pb-10"
                : `space-y-4 pb-10 pt-4 sm:pb-12 ${
                    effectiveActiveView === "settings" ? "px-3 sm:px-5" : "px-5 sm:px-7"
                  }`
            }`}
          >
            {billingError && (
              <div className="rounded-lg border border-[#e7b9b2] bg-[#fde8e5] px-4 py-3 text-sm font-medium text-[#9f1f16]">
                {billingError}
              </div>
            )}
            {billingMessage && (
              <div className="rounded-lg border border-[#b9d8bf] bg-[#eef8ee] px-4 py-3 text-sm font-medium text-[#28633a]">
                {billingMessage}
              </div>
            )}
            <Suspense fallback={<DashboardSectionFallback />}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={effectiveActiveView}
                  className="dashboard-view-transition"
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 14, scale: 0.995 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={shouldReduceMotion ? undefined : { opacity: 0, y: -7, scale: 0.998 }}
                  transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                >
                {effectiveActiveView === "agenda" ? (
                <DashboardAgendaView
                  appointments={allAppointments}
                  disablePreviousMonth={!canGoToPreviousCalendarMonth}
                  filteredAppointments={filteredAppointments}
                  getAppointmentStatus={getAppointmentStatus}
                  minDate={calendarMinMonth}
                  onNextMonth={goToNextCalendarMonth}
                  scheduleView={scheduleView}
                  searchTerm=""
                  selectedDate={selectedDate}
                  onNextPeriod={goToNextPeriod}
                  onToday={goToToday}
                  onPreviousMonth={goToPreviousCalendarMonth}
                  onPreviousPeriod={goToPreviousPeriod}
                  onRequestStatusChange={requestStatusChange}
                  onRequestReschedule={setPendingRescheduleAppointment}
                  onSelectDate={setSelectedDate}
                  onSelectScheduleView={selectScheduleView}
                />
              ) : effectiveActiveView === "customers" ? (
                <DashboardCustomersView />
              ) : effectiveActiveView === "team" ? (
                <DashboardTeamView />
              ) : effectiveActiveView === "availability" ? (
                <DashboardAvailabilityView subscription={subscriptionQuery.data} />
              ) : effectiveActiveView === "settings" ? (
                <DashboardSettingsView
                  isOnboarding={onboardingRequired}
                  onCompleted={() => {
                    setOnboardingRequired(false);
                    queryClient.setQueryData<AuthResult>(
                      queryKeys.session,
                      (current) =>
                        current
                          ? {
                              ...current,
                              data: {
                                ...current.data,
                                organizations: current.data.organizations?.map(
                                  (organization, index) =>
                                    index === 0
                                      ? {
                                          ...organization,
                                          onboardingCompleted: true
                                        }
                                      : organization
                                )
                              }
                            }
                          : current
                    );
                    setActiveView("summary");
                  }}
                />
              ) : (
                <DashboardSummaryView onViewAgenda={() => changeDashboardView("agenda")} />
              )}
                </motion.div>
              </AnimatePresence>
            </Suspense>
          </div>
        </motion.section>
      </motion.div>

      {pendingStatusChange && (
        <StatusChangeModal
          draft={pendingStatusChange}
          isConfirming={isChangingStatus}
          onCancel={() => {
            if (!isChangingStatus) setPendingStatusChange(null);
          }}
          onClearDepositPayment={
            pendingStatusChange.appointment.depositPayment?.method === "mercadopago"
              ? undefined
              : clearPendingDepositPayment
          }
          onConfirm={confirmStatusChange}
          onDepositPaymentChange={updatePendingDepositPayment}
          onSelectNextStatus={(status) => {
            if (!isChangingStatus) selectNextStatus(status);
          }}
        />
      )}
      {showBillingPlans && (
        <div className="viewport-overlay modal-overlay-enter z-[80] grid place-items-end bg-[rgba(32,24,54,0.58)] p-3 backdrop-blur-sm sm:place-items-center">
          <section
            role="dialog"
            aria-modal="true"
            className="modal-panel-enter modal-scroll-panel w-full max-w-6xl rounded-xl border border-[var(--color-border)] bg-[#ffffff] shadow-[0_28px_90px_rgba(32,24,54,0.34)]"
          >
            <div className="billing-modal-header flex items-start justify-between gap-4 border-b border-[var(--color-border)] p-4 sm:p-5">
              <div>
                <h2 className="text-xl font-semibold">Planes y facturación</h2>
              </div>
              <ModalCloseButton onClick={() => setShowBillingPlans(false)} />
            </div>
            <div className="billing-modal-content p-3 sm:p-5">
              <BillingSettings embedded />
            </div>
          </section>
        </div>
      )}
      {showManualAppointment && currentOrganization?.slug && (
        <ManualAppointmentModal
          organizationSlug={currentOrganization.slug}
          onClose={() => setShowManualAppointment(false)}
          onCreated={() => {
            setShowManualAppointment(false);
            setActiveView("agenda");
          }}
        />
      )}
      {pendingRescheduleAppointment && (
        <RescheduleAppointmentModal
          appointment={pendingRescheduleAppointment}
          onClose={() => setPendingRescheduleAppointment(null)}
          onRescheduled={handleAppointmentRescheduled}
        />
      )}
      {shouldShowReservationToast && latestNewReservation && (
        <div
          role="status"
          className="fixed bottom-4 left-4 right-4 z-[75] mx-auto sm:left-1/2 sm:right-auto sm:w-full sm:max-w-sm sm:-translate-x-1/2"
        >
          <button
            type="button"
            onClick={openLatestReservation}
            className={`dashboard-reservation-toast group w-full overflow-hidden rounded-xl border border-[rgba(255,255,255,0.12)] bg-[linear-gradient(135deg,#141019_0%,#18151f_58%,#201824_100%)] p-3 text-left text-white shadow-[0_18px_44px_rgba(4,2,12,0.32)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(4,2,12,0.38)] ${
              isReservationToastLeaving ? "dashboard-reservation-toast-out" : ""
            }`}
          >
            <div className="flex items-start gap-3 pr-8">
              <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-sm font-extrabold text-[var(--color-button-text)]">
                {getInitials(latestNewReservation.client)}
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#141019] bg-[#49d17a]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-extrabold text-white">
                  {newReservations.length > 1
                    ? `${newReservations.length} reservas nuevas`
                    : "Nueva reserva recibida"}
                  <span className="h-2 w-2 rounded-full bg-[#49d17a]" />
                </span>
                <span className="mt-1 block truncate text-xs font-semibold text-white/82">
                  {latestNewReservation.service} ·{" "}
                  {latestNewReservation.startsAt
                    ? format(new Date(latestNewReservation.startsAt), "EEE dd 'a las' HH:mm", {
                        locale: es
                      })
                    : latestNewReservation.time}
                </span>
                <span className="mt-0.5 block text-xs text-white/58">
                  Desde tu página pública
                </span>
              </span>
            </div>
          </button>
          <button
            type="button"
            aria-label="Marcar reservas como vistas"
            onClick={markReservationNotificationsSeen}
            className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full text-lg leading-none text-white/62 transition-all duration-200 hover:rotate-90 hover:bg-white/12 hover:text-white"
          >
            ×
          </button>
        </div>
      )}
      {pendingDashboardView && (
        <div className="viewport-overlay modal-overlay-enter z-[80] grid place-items-end bg-[rgba(32,24,54,0.58)] p-3 backdrop-blur-sm sm:place-items-center">
          <section
            role="dialog"
            aria-modal="true"
            className="modal-panel-enter modal-scroll-panel w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[#ffffff] p-5 shadow-[0_28px_90px_rgba(32,24,54,0.34)]"
          >
            <h2 className="text-lg font-semibold">Tenés cambios sin guardar</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-muted-strong)]">
              Si salís de Configuración, los cambios realizados se perderán.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new Event("turnosi:hide-settings-dirty"));
                  setPendingDashboardView(null);
                }}
                className="rounded-md border border-[var(--color-border-strong)] px-4 py-2 text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveView(pendingDashboardView);
                  setPendingDashboardView(null);
                }}
                className="rounded-md bg-[var(--color-ink)] px-4 py-2 text-sm font-semibold text-[var(--color-button-text)]"
              >
                Descartar cambios
              </button>
            </div>
          </section>
        </div>
      )}
    </PageLayout>
  );
}
