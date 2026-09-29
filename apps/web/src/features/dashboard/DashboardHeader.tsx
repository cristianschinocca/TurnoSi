import type { DashboardView } from "./dashboard.types";

type DashboardHeaderProps = {
  activeView: DashboardView;
};

export function DashboardHeader({
  activeView
}: DashboardHeaderProps) {
  const pageTitle =
    activeView === "agenda"
      ? "Agenda"
      : activeView === "customers"
        ? "Clientes"
      : activeView === "team"
        ? "Equipo"
      : activeView === "availability"
        ? "Disponibilidad"
        : activeView === "settings"
          ? "Configuración"
        : "Resumen del negocio";
  const pageDescription =
    activeView === "agenda"
      ? "Gestioná tus turnos y horarios."
      : activeView === "customers"
        ? "Gestioná clientes, ausencias y bloqueos de reservas."
      : activeView === "team"
        ? "Definí quién atiende, quién aparece online y cuánta carga diaria toma cada persona."
      : activeView === "availability"
        ? "Configurá los horarios de atención, descansos y días no laborables."
        : activeView === "settings"
          ? "Administrá los datos del local, cuenta y presencia pública."
      : "Operación diaria, cierre de caja y analítica del negocio.";

  return (
    <header className="bg-[var(--color-dashboard-page)] px-4 py-2 sm:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="mt-1 text-[1.125rem] font-extrabold">{pageTitle}</h1>
          <p className="mt-1 max-w-2xl text-[0.6875rem] leading-5 text-[var(--color-muted-strong)]">
            {pageDescription}
          </p>
        </div>
      </div>
    </header>
  );
}
