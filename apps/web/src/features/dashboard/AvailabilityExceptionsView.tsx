import { StatusBadge } from "../../components/ui";
import pencilIcon from "../../components/assets/icons/actions/pencil.svg";
import { buttonMotionClass } from "./dashboard.constants";
import type { AvailabilityException } from "./availability.types";

type AvailabilityExceptionsViewProps = {
  exceptions: AvailabilityException[];
  onEdit: (index: number) => void;
};

export function AvailabilityExceptionsView({
  exceptions,
  onEdit
}: AvailabilityExceptionsViewProps) {
  const sortedExceptions = [...exceptions].sort((first, second) =>
    first.date.localeCompare(second.date)
  );
  const nextException = sortedExceptions[0];

  return (
    <div className="grid gap-5 px-4 py-4">
      <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[#ffffff] shadow-[0_12px_34px_rgba(32,24,54,0.04)]">
          <aside className="bg-[rgba(32,24,54,0.04)] p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-strong)]">
              Próxima regla
            </p>
            {nextException ? (
              <button
                type="button"
                onClick={() => onEdit(getOriginalIndex(exceptions, nextException))}
                className={`mt-3 w-full rounded-xl border border-[var(--color-border)] bg-white/70 p-4 text-left shadow-[0_12px_34px_rgba(32,24,54,0.05)] ${buttonMotionClass}`}
              >
                <span className="font-mono text-[0.7rem] font-semibold text-[var(--color-ink)]">
                  {formatDateLabel(nextException.date)}
                </span>
                <span className="mt-1 block text-xs font-semibold text-[var(--color-ink)]">
                  {nextException.title}
                </span>
                <span className="mt-1 block text-xs text-[var(--color-muted-strong)]">
                  {getScheduleLabel(nextException)}
                </span>
              </button>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-[var(--color-border)] bg-white/48 p-4">
                <p className="text-sm font-semibold">Sin fechas especiales</p>
                <p className="mt-1 text-xs text-[var(--color-muted-strong)]">
                  El horario semanal se aplica sin cambios.
                </p>
              </div>
            )}
          </aside>
      </section>

      {sortedExceptions.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[#ffffff]">
          <header className="flex flex-col gap-2 border-b border-[var(--color-border)] px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h4 className="text-sm font-semibold">Fechas configuradas</h4>
              <p className="mt-1 text-xs text-[var(--color-muted-strong)]">
                Editá cada fecha cuando cambie la atención del local.
              </p>
            </div>
            <span className="w-fit rounded-full bg-[rgba(32,24,54,0.07)] px-3 py-1 text-xs font-semibold text-[var(--color-ink)]">
              Prioridad sobre semanal
            </span>
          </header>

          <div className="divide-y divide-[var(--color-border)]">
            {sortedExceptions.map((exception) => {
              const originalIndex = getOriginalIndex(exceptions, exception);

              return (
                <article
                  key={exception.id ?? `${exception.date}-${exception.title}`}
                  className="grid gap-4 px-5 py-4 transition-colors hover:bg-white/40 md:grid-cols-[92px_minmax(0,1fr)_150px_auto] md:items-center"
                >
                  <div className="w-fit rounded-xl border border-[var(--color-border)] bg-white/66 px-3 py-2 text-center">
                    <p className="font-mono text-base font-semibold leading-none text-[var(--color-ink)]">
                      {formatDay(exception.date)}
                    </p>
                    <p className="mt-1 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--color-muted-strong)]">
                      {formatMonth(exception.date)}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">{exception.title}</p>
                      <StatusBadge enabled={exception.enabled} status={exception.status} />
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-muted-strong)]">
                      {exception.detail || "Sin detalle adicional."}
                    </p>
                  </div>

                  <div>
                    <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--color-muted-strong)]">
                      Atención
                    </p>
                    <p className="mt-1 font-mono text-xs font-semibold text-[var(--color-ink)]">
                      {getScheduleLabel(exception)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onEdit(originalIndex)}
                    aria-label={`Editar ${exception.title}`}
                    title={`Editar ${exception.title}`}
                    className={`group grid h-8 w-8 place-items-center rounded-md border border-[var(--color-border-strong)] bg-white/62 text-[var(--color-ink)] md:justify-self-end ${buttonMotionClass}`}
                  >
                    <img src={pencilIcon} alt="" aria-hidden="true" className="h-3.5 w-3.5 opacity-75 transition duration-200 group-hover:-rotate-6 group-hover:scale-110 group-hover:opacity-100" />
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[#ffffff] p-8 text-center">
          <p className="text-sm font-semibold">Todavía no hay excepciones</p>
          <p className="mt-1 text-xs text-[var(--color-muted-strong)]">
            Usá "Agregar excepción" para cargar feriados, cierres o días con horario especial.
          </p>
        </section>
      )}
    </div>
  );
}

function getOriginalIndex(exceptions: AvailabilityException[], exception: AvailabilityException) {
  return exceptions.findIndex((item) =>
    exception.id ? item.id === exception.id : item === exception
  );
}

function getScheduleLabel(exception: AvailabilityException) {
  if (exception.status === "No laborable") return "Cerrado";
  if (exception.status === "Bloque parcial" && exception.startTime && exception.endTime) {
    return `Bloqueado ${exception.startTime} - ${exception.endTime}`;
  }
  if (exception.startTime && exception.endTime) {
    return `${exception.startTime} - ${exception.endTime}`;
  }
  return "Horario habitual";
}

function formatDateLabel(date: string) {
  const [year, month, day] = date.split("-");
  return day && month && year ? `${day}/${month}/${year}` : date;
}

function formatDay(date: string) {
  const [, , day] = date.split("-");
  return day ?? date;
}

function formatMonth(date: string) {
  const [, month] = date.split("-");
  const monthNames = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const monthIndex = Number(month) - 1;
  return monthNames[monthIndex] ?? "fecha";
}
