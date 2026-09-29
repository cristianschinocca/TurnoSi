import { StatusBadge } from "../../components/ui";
import { formatArsAmount } from "../../lib/format";
import pencilIcon from "../../components/assets/icons/actions/pencil.svg";
import trashIcon from "../../components/assets/icons/actions/trash.svg";
import { buttonMotionClass } from "./dashboard.constants";
import type {
  AvailabilityResource,
  AvailabilityServiceCategory
} from "./availability.types";

type AvailabilityResourcesViewProps = {
  categories: AvailabilityServiceCategory[];
  onDeleteCategory: (category: AvailabilityServiceCategory) => void;
  onDeleteResource: (index: number) => void;
  onEditRules: (index: number) => void;
  resources: AvailabilityResource[];
};

export function AvailabilityResourcesView({
  categories,
  onDeleteCategory,
  onDeleteResource,
  onEditRules,
  resources
}: AvailabilityResourcesViewProps) {
  const groupedResources = resources.reduce<Record<string, AvailabilityResource[]>>(
    (groups, service) => {
      const category = service.category.trim() || "Sin categoría";
      return { ...groups, [category]: [...(groups[category] ?? []), service] };
    },
    {}
  );
  const hasUncategorizedServices = Boolean(groupedResources["Sin categoría"]?.length);
  const categoryNames = [
    ...categories.map((category) => category.name),
    ...resources.map((service) => service.category.trim()).filter(Boolean),
    ...(hasUncategorizedServices || categories.length === 0 ? ["Sin categoría"] : [])
  ].filter((category, index, all) => all.indexOf(category) === index);

  return (
    <div className="grid gap-4 px-3 py-3">
      {categoryNames.map((category) => {
        const services = groupedResources[category] ?? [];
        const savedCategory = categories.find((item) => item.name === category);

        return (
          <section
            key={category}
            className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[#ffffff]"
          >
            <header className="flex flex-col gap-2 border-b border-[var(--color-border)] bg-white/42 px-4 py-2.5 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="truncate text-xs font-semibold">{category}</h4>
                  <span className="rounded-full bg-[rgba(32,24,54,0.08)] px-2.5 py-1 text-xs font-semibold text-[var(--color-muted-strong)]">
                    {services.length} {services.length === 1 ? "servicio" : "servicios"}
                  </span>
                </div>
                <p className="mt-1 text-[0.6875rem] text-[var(--color-muted-strong)]">
                  {category === "Sin categoría"
                    ? "Servicios pendientes de asignar a una categoría."
                    : "Grupo visible en la página pública de reservas."}
                </p>
              </div>
              {savedCategory && services.length === 0 && (
                <button
                  type="button"
                  onClick={() => onDeleteCategory(savedCategory)}
                  className={`w-fit rounded-md border border-[#e7b9b2] px-3 py-1.5 text-xs font-semibold text-[#9f1f16] hover:bg-[#fde8e5] ${buttonMotionClass}`}
                >
                  Eliminar categoría
                </button>
              )}
            </header>

            {services.length > 0 ? (
              <div>
                <div className="hidden grid-cols-[minmax(180px,1.3fr)_120px_120px_minmax(150px,1fr)_90px_130px] gap-3 border-b border-[var(--color-border)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)] lg:grid">
                  <span>Servicio</span>
                  <span>Duración</span>
                  <span>Cupos</span>
                  <span>Asignación</span>
                  <span>Estado</span>
                  <span className="text-right">Acciones</span>
                </div>
                <div className="divide-y divide-[var(--color-border)]">
                {services.map((service) => {
                  const originalIndex = resources.findIndex((item) =>
                    service.id ? item.id === service.id : item === service
                  );
                  const safeIndex = Math.max(0, originalIndex);

                  return (
                    <article
                      key={service.id ?? service.name}
                      className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(180px,1.3fr)_120px_120px_minmax(150px,1fr)_90px_130px] lg:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{service.name}</p>
                        <p className="mt-1 text-xs text-[var(--color-muted-strong)]">
                          {service.price ? formatArsAmount(service.price) : "Sin precio cargado"}
                        </p>
                      </div>
                      <Detail label="Duración" value={service.duration} helper={`Margen ${service.buffer}`} />
                      <Detail label="Cupos" value={service.capacity} helper="por horario" />
                      <Detail label="Asignación" value={service.resource || "Sin asignar"} helper="recurso opcional" />
                      <div className="flex lg:block">
                        <StatusBadge
                          enabled={service.online}
                          status={service.online ? "Visible" : "Interno"}
                        />
                      </div>

                      <div className="flex items-center gap-2 lg:justify-end">
                        <button
                          type="button"
                          aria-label={`Editar ${service.name}`}
                          title={`Editar ${service.name}`}
                          onClick={() => onEditRules(safeIndex)}
                          className={`group grid h-8 w-8 place-items-center rounded-md border border-[var(--color-border)] bg-white text-[var(--color-ink)] hover:border-[var(--color-border-strong)] hover:bg-[rgba(32,24,54,0.04)] ${buttonMotionClass}`}
                        >
                          <img
                            src={pencilIcon}
                            alt=""
                            aria-hidden="true"
                            className="h-4 w-4 opacity-75 transition duration-200 group-hover:-rotate-6 group-hover:scale-110 group-hover:opacity-100"
                          />
                        </button>
                        <button
                          type="button"
                          aria-label={`Eliminar ${service.name}`}
                          title={`Eliminar ${service.name}`}
                          onClick={() => onDeleteResource(safeIndex)}
                          className={`group grid h-8 w-8 place-items-center rounded-md border border-[var(--color-border)] bg-white hover:border-[#e7b9b2] hover:bg-[#fde8e5]/45 ${buttonMotionClass}`}
                        >
                          <img
                            src={trashIcon}
                            alt=""
                            aria-hidden="true"
                            className="h-4 w-4 opacity-75 transition duration-200 group-hover:rotate-[-6deg] group-hover:scale-110 group-hover:opacity-100 [filter:invert(18%)_sepia(85%)_saturate(2628%)_hue-rotate(352deg)_brightness(91%)_contrast(93%)]"
                          />
                        </button>
                      </div>
                    </article>
                  );
                })}
                </div>
              </div>
            ) : (
              <div className="px-4 py-3">
                <p className="rounded-lg border border-dashed border-[var(--color-border)] bg-white/40 px-3 py-3 text-xs text-[var(--color-muted-strong)]">
                  Esta categoría todavía no tiene servicios. Tocá “Agregar servicio” y elegí esta categoría.
                </p>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Detail({
  helper,
  label,
  value
}: {
  helper: string;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--color-border)] bg-white/45 px-3 py-2 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-muted)] lg:hidden">
        {label}
      </p>
      <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{value}</p>
      <p className="mt-0.5 truncate text-xs text-[var(--color-muted-strong)]">{helper}</p>
    </div>
  );
}
