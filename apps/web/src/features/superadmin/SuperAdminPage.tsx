import { FormEvent, useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";

import { Brand } from "../../components/brand/Brand";
import loginPasswordIcon from "../../components/assets/icons/auth/login-password.svg";
import loginUserIcon from "../../components/assets/icons/auth/login-user.svg";
import navHomeIcon from "../../components/assets/icons/navigation/home.svg";
import navOrganizationsIcon from "../../components/assets/icons/settings/business-identity.svg";
import navSubscriptionsIcon from "../../components/assets/icons/settings/payments-wallet.svg";
import { Button } from "../../components/ui";
import { PlanPrices } from "./PlanPrices";
import {
  deleteSuperadminOrganization,
  getSuperadminOrganization,
  getSuperadminOrganizations,
  getSuperadminOverview,
  getSuperadminSession,
  superadminLogin,
  superadminLogout,
  updateSuperadminSubscription,
  type SuperadminSubscriptionActionPayload,
  type SuperadminOrganization
} from "./superadmin.api";

const planLabels = {
  trial: "Prueba",
  initial: "Inicial",
  professional: "Profesional",
  operation: "Operación"
} as const;

const statusLabels = {
  pending: "Pendiente",
  authorized: "Activa",
  paused: "Pausada",
  canceled: "Cancelada"
} as const;

const planOptions = [
  ["trial", "Prueba inicial"],
  ["initial", "Inicial"],
  ["professional", "Profesional"],
  ["operation", "Operación"]
] as const;

const actionLabels = {
  grant: "Asignar plan manual",
  extend: "Extender acceso",
  pause: "Pausar acceso",
  cancel: "Cancelar acceso"
} as const;

type SuperadminSection = "overview" | "organizations" | "subscriptions";

const superadminSections = [
  { id: "overview", label: "Resumen", icon: navHomeIcon },
  { id: "organizations", label: "Organizaciones", icon: navOrganizationsIcon },
  { id: "subscriptions", label: "Suscripciones", icon: navSubscriptionsIcon }
] as const;

function formatDate(value: string | null) {
  if (!value) return "Sin actividad";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function money(cents: number | null, currency = "ARS") {
  if (cents === null) return "-";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(cents / 100);
}

function subscriptionMeta(subscription: SuperadminOrganization["subscription"]) {
  if (!subscription) return "Sin configuración de plan";
  const date =
    subscription.trialEndsAt ??
    subscription.paymentGraceEndsAt ??
    subscription.nextPaymentAt;
  if (!date) {
    return subscription.mercadoPagoPreapprovalId
      ? "Vinculada a Mercado Pago"
      : "Asignación local";
  }
  if (subscription.trialEndsAt) return `Prueba hasta ${formatDate(date)}`;
  if (subscription.paymentGraceEndsAt) return `Gracia hasta ${formatDate(date)}`;
  return `Próximo cobro ${formatDate(date)}`;
}

function memberName(member: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}) {
  return [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email;
}

function SubscriptionPill({
  organization
}: {
  organization: SuperadminOrganization;
}) {
  const subscription = organization.subscription;
  if (!subscription) {
    return <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs">Sin plan</span>;
  }
  const isActive = subscription.status === "authorized";
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-semibold ${
        isActive
          ? "bg-emerald-50 text-emerald-700"
          : "bg-[rgba(253,134,6,0.12)] text-[var(--color-accent)]"
      }`}
    >
      {planLabels[subscription.plan]} · {statusLabels[subscription.status]}
    </span>
  );
}

function LoginPanel() {
  const queryClient = useQueryClient();
  const shouldReduceMotion = useReducedMotion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const loginMutation = useMutation({
    mutationFn: () => superadminLogin(email, password),
    onSuccess(data) {
      queryClient.setQueryData(["superadmin", "session"], data);
    }
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loginMutation.mutate();
  }

  return (
    <main className="grid min-h-screen bg-white text-[var(--color-ink)] lg:grid-cols-2">
      <aside className="auth-brand-panel relative hidden overflow-hidden bg-[var(--color-ink)] px-8 py-8 text-white lg:flex">
        <motion.div
          className="relative z-10 mx-auto flex w-full max-w-[34rem] flex-1 flex-col justify-center text-center"
          initial={shouldReduceMotion ? false : { opacity: 0, x: -28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="mb-10 flex justify-center [&_*]:text-white">
            <Brand boxed variant="turnoar" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-accent)]">
            Operación interna
          </p>
          <h1 className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl">
            Control central.
            <span className="block">Decisiones seguras.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-white/68">
            Administrá organizaciones, planes y accesos desde un entorno privado y auditado.
          </p>
          <div className="mx-auto mt-8 grid w-full max-w-md grid-cols-2 gap-3 text-left text-xs text-white/70">
            <span className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
              Sesión independiente
            </span>
            <span className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
              Acciones auditadas
            </span>
          </div>
        </motion.div>
      </aside>

      <section className="auth-surface-pattern relative flex min-w-0 flex-col overflow-hidden bg-white">
        <div className="relative z-10 flex justify-center bg-[var(--color-ink)] px-5 py-4 [&>div]:py-0 [&_img]:h-12 lg:hidden">
          <Brand boxed variant="turnoar" />
        </div>
        <div className="relative z-10 flex flex-1 items-center justify-center px-5 py-8 sm:px-7">
          <motion.form
            onSubmit={submit}
            className="w-full max-w-[500px] rounded-2xl border border-[rgba(32,24,54,0.11)] bg-white/90 px-7 py-7 shadow-[0_24px_70px_rgba(32,24,54,0.12)] backdrop-blur sm:px-9 sm:py-8 lg:-translate-y-2 lg:px-10 lg:py-9"
            initial={shouldReduceMotion ? false : { opacity: 0, x: 32, scale: 0.985 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.08 }}
          >
            <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-ink)]">
              Acceso Superadmin
            </p>
            <h2 className="mt-3 text-2xl font-semibold leading-tight sm:text-3xl">
              Iniciar sesión
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--color-muted-strong)]">
              Ingresá tus credenciales internas para continuar.
            </p>
            <div className="mt-6 space-y-4">
              <label className="block text-sm">
                <span className="mb-2 block font-medium">Email</span>
                <span className="group/auth-field relative block">
                  <img src={loginUserIcon} alt="" aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 z-10 h-[22px] w-[22px] -translate-y-1/2 opacity-60" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-11 w-full rounded-lg border border-[var(--color-border)] bg-white py-2.5 pl-12 pr-3 text-sm outline-none transition hover:border-[var(--color-accent)] focus:border-[var(--color-accent)]"
                    autoComplete="username"
                    required
                  />
                </span>
              </label>
              <label className="block text-sm">
                <span className="mb-2 block font-medium">Contraseña</span>
                <span className="group/auth-field relative block">
                  <img src={loginPasswordIcon} alt="" aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 z-10 h-[21px] w-[21px] -translate-y-1/2 opacity-60" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-11 w-full rounded-lg border border-[var(--color-border)] bg-white py-2.5 pl-12 pr-3 text-sm outline-none transition hover:border-[var(--color-accent)] focus:border-[var(--color-accent)]"
                    autoComplete="current-password"
                    required
                  />
                </span>
              </label>
            </div>
            {loginMutation.isError ? (
              <p role="alert" className="mt-4 rounded-lg border border-[#f0c9c5] bg-[#fff3f1] px-3 py-2 text-sm text-[#9f261d]">
                No pudimos iniciar sesión como superadmin.
              </p>
            ) : null}
            <Button
              type="submit"
              variant="accent"
              disabled={loginMutation.isPending}
              className="auth-submit-button mt-5 h-11 w-full rounded-lg shadow-[0_14px_30px_rgba(32,24,54,0.2)]"
            >
              {loginMutation.isPending ? "Entrando..." : "Entrar"}
            </Button>
            <div className="mt-5 border-t border-[var(--color-border)] pt-4 text-center text-xs text-[var(--color-muted)]">
              Acceso restringido · Actividad registrada
            </div>
          </motion.form>
        </div>
      </section>
    </main>
  );
}

export function SuperAdminPage() {
  const queryClient = useQueryClient();
  const shouldReduceMotion = useReducedMotion();
  const [activeSection, setActiveSection] = useState<SuperadminSection>("overview");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [subscriptionAction, setSubscriptionAction] =
    useState<SuperadminSubscriptionActionPayload["action"]>("grant");
  const [subscriptionPlan, setSubscriptionPlan] =
    useState<NonNullable<SuperadminSubscriptionActionPayload["plan"]>>("professional");
  const [extensionDays, setExtensionDays] = useState("7");
  const [actionReason, setActionReason] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    if (!selectedId) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedId]);

  const sessionQuery = useQuery({
    queryKey: ["superadmin", "session"],
    queryFn: getSuperadminSession,
    retry: false
  });
  const isLoggedIn = Boolean(sessionQuery.data);
  const overviewQuery = useQuery({
    queryKey: ["superadmin", "overview"],
    queryFn: getSuperadminOverview,
    enabled: isLoggedIn
  });
  const organizationsQuery = useQuery({
    queryKey: ["superadmin", "organizations", deferredSearch],
    queryFn: () => getSuperadminOrganizations(deferredSearch),
    enabled: isLoggedIn
  });
  const detailQuery = useQuery({
    queryKey: ["superadmin", "organizations", selectedId],
    queryFn: () => getSuperadminOrganization(selectedId!),
    enabled: isLoggedIn && Boolean(selectedId)
  });
  const logoutMutation = useMutation({
    mutationFn: superadminLogout,
    onSuccess() {
      queryClient.removeQueries({ queryKey: ["superadmin"] });
      setSelectedId(null);
    }
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteSuperadminOrganization(selectedId!),
    onSuccess() {
      setSelectedId(null);
      setDeleteConfirmation("");
      queryClient.invalidateQueries({ queryKey: ["superadmin", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin", "organizations"] });
    }
  });
  const subscriptionMutation = useMutation({
    mutationFn: () => {
      const payload: SuperadminSubscriptionActionPayload = {
        action: subscriptionAction,
        reason: actionReason.trim()
      };
      if (subscriptionAction === "grant") payload.plan = subscriptionPlan;
      if (subscriptionAction === "grant" || subscriptionAction === "extend") {
        const parsedDays = Number(extensionDays);
        if (Number.isFinite(parsedDays) && parsedDays > 0) {
          payload.extensionDays = parsedDays;
        }
      }
      return updateSuperadminSubscription(selectedId!, payload);
    },
    onSuccess() {
      setActionMessage("Cambio aplicado.");
      setActionReason("");
      queryClient.invalidateQueries({ queryKey: ["superadmin", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin", "organizations"] });
    },
    onError() {
      setActionMessage("No pudimos aplicar el cambio.");
    }
  });

  if (sessionQuery.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--color-bg)] text-sm text-[var(--color-muted-strong)]">
        Verificando acceso...
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginPanel />;
  }

  const organizations = organizationsQuery.data?.data ?? [];
  const detail = detailQuery.data?.data ?? null;
  const canDelete = Boolean(
    detail && deleteConfirmation.trim().toLowerCase() === detail.name.toLowerCase()
  );
  const canSubmitSubscriptionAction = Boolean(
    selectedId &&
    actionReason.trim().length >= 8 &&
    (subscriptionAction !== "extend" || Number(extensionDays) > 0)
  );
  const sectionCopy = {
    overview: ["Resumen general", "Estado actual de la operación interna"],
    organizations: ["Organizaciones", "Gestión de negocios y cuentas propietarias"],
    subscriptions: ["Suscripciones", "Control de planes y accesos activos"]
  } as const;

  return (
    <main className="dashboard-shell min-h-screen overflow-x-clip bg-[#f7f7f8] text-[var(--color-ink)]">
      <header className="dashboard-mobile-header dot-pattern-corner dot-pattern-bottom-left z-50 flex items-center justify-between border-b border-white/10 bg-[var(--color-ink)] px-4 py-3 text-white md:hidden">
        <div className="[&_*]:text-white [&_img]:h-12">
          <Brand boxed variant="turnoar" />
        </div>
      </header>
      <div className="dashboard-mobile-header-spacer md:hidden" aria-hidden="true" />

      <button
        type="button"
        aria-label={isMobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={isMobileMenuOpen}
        onClick={() => setIsMobileMenuOpen((current) => !current)}
        className={`dashboard-mobile-burger md:hidden ${isMobileMenuOpen ? "dashboard-mobile-burger--open" : ""}`}
      >
        <span />
        <span />
        <span />
      </button>

      {isMobileMenuOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-[60] bg-[rgba(18,13,31,0.42)] backdrop-blur-[3px] md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside className={`dashboard-sidebar dot-pattern-corner dot-pattern-bottom-left z-[70] flex flex-col border-r border-white/10 bg-[var(--color-ink)] px-5 py-5 text-white transition-transform duration-300 ease-out max-md:overflow-y-auto max-md:shadow-[-24px_0_70px_rgba(18,13,31,0.28)] md:z-40 md:px-4 md:py-4 ${
        isMobileMenuOpen ? "max-md:translate-x-0" : "max-md:translate-x-full"
      }`}>
        <div className="dashboard-sidebar-brand flex items-center justify-center max-md:justify-start">
          <div className="max-md:hidden [&_*]:text-white">
            <Brand boxed variant="turnoar" />
          </div>
          <p className="dashboard-sidebar-section-label dashboard-sidebar-section-label--mobile hidden max-md:block">
            Administración
          </p>
        </div>

        <p className="dashboard-sidebar-section-label max-md:hidden">Administración</p>
        <nav className="dashboard-sidebar-nav space-y-1 md:shrink-0" aria-label="Navegación del superadmin">
          {superadminSections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => {
                setActiveSection(section.id);
                setIsMobileMenuOpen(false);
              }}
              className={`dashboard-sidebar-nav-item block w-full text-left text-sm ${activeSection === section.id ? "is-active" : ""}`}
            >
              <span className="flex items-center gap-3">
                <img src={section.icon} alt="" aria-hidden="true" className="dashboard-sidebar-nav-icon h-5 w-5 shrink-0 invert" />
                <span>{section.label}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="dashboard-sidebar-footer mt-auto border-t border-white/10 pt-5">
          <div className="dashboard-sidebar-organization mb-5 rounded-xl border border-white/12 bg-white/[0.04] p-3">
            <p className="text-[0.625rem] font-semibold uppercase tracking-[0.15em] text-white/40">
              Cuenta interna
            </p>
            <p className="mt-2 truncate text-sm font-semibold text-white">Superadmin</p>
            <p className="mt-1 truncate text-xs text-white/55">{sessionQuery.data?.data.email}</p>
          </div>
          <button
            type="button"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="dashboard-sidebar-logout w-full rounded-md border border-white/20 px-4 py-2.5 text-sm font-medium text-white/72 hover:bg-white/10 hover:text-white disabled:opacity-60"
          >
            <span>{logoutMutation.isPending ? "Cerrando sesión..." : "Cerrar sesión"}</span>
          </button>
        </div>
      </aside>

      <section className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
        <div className="space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">
                Panel interno · {superadminSections.find((section) => section.id === activeSection)?.label}
              </p>
              <h1 className="mt-2 text-2xl font-semibold">{sectionCopy[activeSection][0]}</h1>
            </div>
            <p className="text-sm text-[var(--color-muted-strong)]">
              {sectionCopy[activeSection][1]}
            </p>
          </div>

          {activeSection === "subscriptions" && <PlanPrices />}
          {activeSection === "overview" ? (
          <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Negocios", overviewQuery.data?.data.organizations],
              ["Cuentas propietarias", overviewQuery.data?.data.ownerAccounts],
              ["Planes activos", overviewQuery.data?.data.activeSubscriptions]
            ].map(([label, value]) => (
              <article
                key={label}
                className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[0_8px_24px_rgba(32,24,54,0.04)]"
              >
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">
                  {label}
                </p>
                <p className="mt-2 text-xl font-semibold">{value ?? "-"}</p>
              </article>
            ))}
          </div>

          <section className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-[0_8px_24px_rgba(32,24,54,0.04)]">
            <div>
              <h2 className="text-lg font-semibold">Gestión rápida</h2>
              <p className="mt-1 text-sm text-[var(--color-muted-strong)]">
                Accedé directamente a las áreas operativas del sistema.
              </p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setActiveSection("organizations")}
                className="group flex items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[#f7f7f8] p-4 text-left transition hover:border-[var(--color-accent)] hover:bg-white"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white">
                  <img src={navOrganizationsIcon} alt="" aria-hidden="true" className="h-5 w-5 opacity-70" />
                </span>
                <span>
                  <strong className="block text-sm">Administrar organizaciones</strong>
                  <span className="mt-1 block text-xs text-[var(--color-muted-strong)]">Cuentas, propietarios y datos del negocio</span>
                </span>
                <span className="ml-auto text-lg text-[var(--color-muted)] transition group-hover:translate-x-1">→</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("subscriptions")}
                className="group flex items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[#f7f7f8] p-4 text-left transition hover:border-[var(--color-accent)] hover:bg-white"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white">
                  <img src={navSubscriptionsIcon} alt="" aria-hidden="true" className="h-5 w-5 opacity-70" />
                </span>
                <span>
                  <strong className="block text-sm">Gestionar suscripciones</strong>
                  <span className="mt-1 block text-xs text-[var(--color-muted-strong)]">Planes, estados y extensiones manuales</span>
                </span>
                <span className="ml-auto text-lg text-[var(--color-muted)] transition group-hover:translate-x-1">→</span>
              </button>
            </div>
          </section>
          </>
          ) : (

          <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-[0_8px_24px_rgba(32,24,54,0.04)]">
            <div className="flex flex-col gap-3 border-b border-[var(--color-border)] p-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">
                  {activeSection === "subscriptions" ? "Planes por organización" : "Organizaciones"}
                </h2>
                <p className="mt-1 text-sm text-[var(--color-muted-strong)]">
                  {activeSection === "subscriptions"
                    ? "Seleccioná una cuenta para administrar su plan y acceso."
                    : "Buscá por negocio, URL pública, dueño o email."}
                </p>
              </div>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar cuenta"
                className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-sm outline-none focus:border-[var(--color-accent)] sm:w-72"
              />
            </div>

            <div className="divide-y divide-[var(--color-border)]">
              <div className="hidden grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)_minmax(220px,auto)] gap-4 bg-[#f7f7f8] px-4 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[var(--color-muted)] md:grid">
                <span>Negocio</span>
                <span>Propietario</span>
                <span className="text-right">Suscripción</span>
              </div>
              {organizationsQuery.isLoading ? (
                <p className="p-4 text-sm text-[var(--color-muted-strong)]">
                  Cargando cuentas...
                </p>
              ) : null}
              {!organizationsQuery.isLoading && organizations.length === 0 ? (
                <p className="p-4 text-sm text-[var(--color-muted-strong)]">
                  No encontramos organizaciones.
                </p>
              ) : null}
              {organizations.map((organization) => (
                <button
                  key={organization.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(organization.id);
                    setDeleteConfirmation("");
                    setActionMessage("");
                    setActionReason("");
                  }}
                  className={`grid w-full gap-4 p-4 text-left transition hover:bg-[#f7f7f8] md:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)_minmax(220px,auto)] ${
                    selectedId === organization.id
                      ? "bg-[#f7f7f8] shadow-[inset_3px_0_0_var(--color-accent)]"
                      : ""
                  }`}
                >
                  <span>
                    <span className="block font-semibold">{organization.name}</span>
                    <span className="mt-1 block text-sm text-[var(--color-muted-strong)]">
                      /book/{organization.slug}
                    </span>
                    <span className="mt-1 block text-xs text-[var(--color-muted)]">
                      {organization.location || "Sin ubicación"} · creado {formatDate(organization.createdAt)}
                    </span>
                  </span>
                  <span className="text-sm">
                    <span className="block font-medium">{organization.owner.name}</span>
                    <span className="mt-1 block text-[var(--color-muted-strong)]">
                      {organization.owner.email}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 md:justify-end">
                    <SubscriptionPill organization={organization} />
                    <span className="w-full text-right text-xs text-[var(--color-muted)]">
                      {subscriptionMeta(organization.subscription)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
          )}
        </div>

        {selectedId && (
        <aside className="fixed inset-0 z-[90] flex justify-end" aria-label="Detalle de la organización">
          <motion.button
            type="button"
            aria-label="Cerrar detalle"
            onClick={() => setSelectedId(null)}
            className="absolute inset-0 bg-[rgba(32,24,54,0.34)] backdrop-blur-[2px]"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="superadmin-detail-title"
            className="relative z-10 h-full w-full max-w-[30rem] overflow-y-auto border-l border-[var(--color-border)] bg-white shadow-[-24px_0_70px_rgba(32,24,54,0.16)]"
            initial={shouldReduceMotion ? false : { x: "100%" }}
            animate={{ x: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            {detailQuery.isLoading ? (
              <p className="p-5 text-sm text-[var(--color-muted-strong)]">
                Cargando detalle...
              </p>
            ) : detail ? (
              <div>
                <div className="border-b border-[var(--color-border)] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent)]">
                        Cuenta
                      </p>
                      <h2 id="superadmin-detail-title" className="mt-2 text-xl font-semibold">{detail.name}</h2>
                      <p className="mt-1 text-sm text-[var(--color-muted-strong)]">
                        {detail.address || "Sin dirección"} · {detail.phone || "Sin teléfono"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      aria-label="Cerrar detalle"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] text-xl leading-none transition hover:bg-[#f1f1f3]"
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                    <span className="rounded-xl bg-[var(--color-bg)] p-3">
                      <strong className="block text-lg">{detail._count.branches}</strong>
                      sedes
                    </span>
                    <span className="rounded-xl bg-[var(--color-bg)] p-3">
                      <strong className="block text-lg">{detail._count.services}</strong>
                      servicios
                    </span>
                    <span className="rounded-xl bg-[var(--color-bg)] p-3">
                      <strong className="block text-lg">{detail._count.customers}</strong>
                      clientes
                    </span>
                  </div>
                </div>

                <div className="space-y-5 p-5">
                  <section className="rounded-xl border border-[var(--color-border)] bg-[#f7f7f8] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent)]">
                          Plan actual
                        </p>
                        <h3 className="mt-2 text-lg font-semibold">
                          {detail.subscription
                            ? planLabels[detail.subscription.plan]
                            : "Sin plan"}
                        </h3>
                        <p className="mt-1 text-sm text-[var(--color-muted-strong)]">
                          {detail.subscription
                            ? `${statusLabels[detail.subscription.status]} · ${subscriptionMeta(detail.subscription)}`
                            : "Todavía no tiene acceso configurado."}
                        </p>
                      </div>
                      {detail.subscription ? <SubscriptionPill organization={detail} /> : null}
                    </div>

                    <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                        Acciones internas
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[var(--color-muted-strong)]">
                        Solo superadmin. Asignar un plan manual no genera pago y desvincula la suscripción local de Mercado Pago.
                      </p>
                      <div className="mt-3 grid gap-3">
                        <label className="grid gap-1.5 text-sm">
                          <span className="font-semibold text-[var(--color-muted-strong)]">
                            Acción
                          </span>
                          <select
                            value={subscriptionAction}
                            onChange={(event) => {
                              setSubscriptionAction(
                                event.target.value as SuperadminSubscriptionActionPayload["action"]
                              );
                              setActionMessage("");
                            }}
                            className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-white px-3 outline-none focus:border-[var(--color-accent)]"
                          >
                            {Object.entries(actionLabels).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>

                        {subscriptionAction === "grant" && (
                          <label className="grid gap-1.5 text-sm">
                            <span className="font-semibold text-[var(--color-muted-strong)]">
                              Plan a asignar
                            </span>
                            <select
                              value={subscriptionPlan}
                              onChange={(event) =>
                                setSubscriptionPlan(
                                  event.target.value as NonNullable<
                                    SuperadminSubscriptionActionPayload["plan"]
                                  >
                                )
                              }
                              className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-white px-3 outline-none focus:border-[var(--color-accent)]"
                            >
                              {planOptions.map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}

                        {(subscriptionAction === "extend" ||
                          (subscriptionAction === "grant" &&
                            subscriptionPlan === "trial")) && (
                          <label className="grid gap-1.5 text-sm">
                            <span className="font-semibold text-[var(--color-muted-strong)]">
                              Días de extensión
                            </span>
                            <input
                              type="number"
                              min={1}
                              max={365}
                              value={extensionDays}
                              onChange={(event) => setExtensionDays(event.target.value)}
                              className="h-10 rounded-lg border border-[var(--color-border-strong)] bg-white px-3 outline-none focus:border-[var(--color-accent)]"
                            />
                          </label>
                        )}

                        <label className="grid gap-1.5 text-sm">
                          <span className="font-semibold text-[var(--color-muted-strong)]">
                            Motivo interno
                          </span>
                          <textarea
                            value={actionReason}
                            onChange={(event) => setActionReason(event.target.value)}
                            placeholder="Ej: extensión por soporte, cortesía comercial o regularización manual."
                            className="min-h-20 rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 outline-none focus:border-[var(--color-accent)]"
                          />
                        </label>

                        {actionMessage && (
                          <p className="rounded-lg bg-[rgba(32,24,54,0.06)] px-3 py-2 text-sm text-[var(--color-muted-strong)]">
                            {actionMessage}
                          </p>
                        )}

                        <Button
                          type="button"
                          variant="accent"
                          disabled={
                            !canSubmitSubscriptionAction ||
                            subscriptionMutation.isPending
                          }
                          onClick={() => subscriptionMutation.mutate()}
                        >
                          {subscriptionMutation.isPending
                            ? "Aplicando..."
                            : "Aplicar cambio"}
                        </Button>
                      </div>
                    </div>
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold">Cuenta propietaria</h3>
                    <div className="mt-2 space-y-2">
                      {detail.memberships
                        .filter((membership) => membership.role === "owner")
                        .map((membership) => (
                        <div
                          key={membership.user.id}
                          className="rounded-xl border border-[var(--color-border)] bg-white/55 p-3 text-sm"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold">{memberName(membership.user)}</span>
                            <span className="capitalize text-[var(--color-muted)]">
                              {membership.role}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[var(--color-muted-strong)]">
                            {membership.user.email}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold">Pagos recientes</h3>
                    <div className="mt-2 space-y-2">
                      {detail.subscriptionPayments.length === 0 ? (
                        <p className="text-sm text-[var(--color-muted-strong)]">
                          Sin pagos registrados.
                        </p>
                      ) : null}
                      {detail.subscriptionPayments.map((payment) => (
                        <div
                          key={payment.id}
                          className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-white/55 p-3 text-sm"
                        >
                          <span>{payment.status}</span>
                          <span className="font-semibold">
                            {money(payment.amountCents, payment.currencyId ?? "ARS")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-red-200 bg-red-50 p-4">
                    <h3 className="font-semibold text-red-800">Eliminar organización</h3>
                    <p className="mt-2 text-sm leading-5 text-red-700">
                      Borra negocio, sedes, equipo, turnos, clientes, servicios y pagos locales. Si hay suscripción activa, se cancela en Mercado Pago.
                    </p>
                    <label className="mt-4 grid gap-1.5 text-sm text-red-800">
                      <span>Escribí el nombre exacto para confirmar</span>
                      <input
                        value={deleteConfirmation}
                        onChange={(event) => setDeleteConfirmation(event.target.value)}
                        className="h-10 rounded-lg border border-red-200 bg-white px-3 outline-none focus:border-red-500"
                        placeholder={detail.name}
                      />
                    </label>
                    {deleteMutation.isError ? (
                      <p className="mt-3 text-sm text-red-700">
                        No pudimos eliminar esta organización.
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      disabled={!canDelete || deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate()}
                      className="mt-4 w-full border-red-300 text-red-800 hover:bg-red-100"
                    >
                      {deleteMutation.isPending ? "Eliminando..." : "Eliminar definitivamente"}
                    </Button>
                  </section>
                </div>
              </div>
            ) : (
              <p className="p-5 text-sm text-[var(--color-muted-strong)]">
                No pudimos cargar esta cuenta.
              </p>
            )}
          </motion.section>
        </aside>
        )}
      </section>
    </main>
  );
}
