import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { StatusBadge, TimeInput } from "../../components/ui";
import trashIcon from "../../components/assets/icons/actions/trash.svg";
import { dayToneClassName } from "./availability.constants";
import type { WeeklyAvailabilityDay } from "./availability.types";

type AvailabilityWeeklyScheduleProps = {
  activeDayMenu: number | null;
  availability: WeeklyAvailabilityDay[];
  onDuplicateAll: (dayIndex: number) => void;
  onCloseDayMenu: () => void;
  onRemoveSlot: (dayIndex: number, slotIndex: number) => void;
  onDuplicateDay: (dayIndex: number) => void;
  onToggleBreak: (dayIndex: number) => void;
  onToggleDayMenu: (dayIndex: number) => void;
  onToggleDayStatus: (dayIndex: number) => void;
  onUpdateBreakTime: (dayIndex: number, field: "start" | "end", value: string) => void;
  onUpdateSlotTime: (
    dayIndex: number,
    slotIndex: number,
    field: "start" | "end",
    value: string
  ) => void;
};

export function AvailabilityWeeklySchedule({
  activeDayMenu,
  availability,
  onDuplicateAll,
  onCloseDayMenu,
  onRemoveSlot,
  onDuplicateDay,
  onToggleBreak,
  onToggleDayMenu,
  onToggleDayStatus,
  onUpdateBreakTime,
  onUpdateSlotTime
}: AvailabilityWeeklyScheduleProps) {
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [activeDayData, setActiveDayData] = useState<{ enabled: boolean; hasBreak: boolean; dayIndex: number } | null>(null);

  const toggleDayMenu = (dayIndex: number, button: HTMLButtonElement, enabled: boolean, hasBreak: boolean) => {
    const rect = button.getBoundingClientRect();
    const menuWidth = 176;
    setMenuPosition({
      left: Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth)),
      top: rect.bottom + 6
    });
    setActiveDayData({ enabled, hasBreak, dayIndex });
    onToggleDayMenu(dayIndex);
  };

  useEffect(() => {
    if (activeDayMenu === null) return;

    const closeOnOutsidePointer = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && (target.closest("[data-day-actions]") || target.closest("[data-day-menu]"))) return;
      onCloseDayMenu();
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [activeDayMenu, onCloseDayMenu]);

  return (
    <>
      <div className="divide-y divide-[var(--color-border)] min-[1500px]:hidden">
        {availability.map((day, dayIndex) => (
          <div key={day.day} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold ${dayToneClassName[day.tone]}`}
                >
                  {day.shortDay}
                </span>
                <p className="text-sm font-semibold">{day.day}</p>
              </div>
              <div data-day-actions className="relative flex shrink-0 items-center gap-2">
                <StatusBadge enabled={day.enabled} status={day.status} />
                <button
                  type="button"
                  onClick={(event) => toggleDayMenu(dayIndex, event.currentTarget, day.enabled, Boolean(day.break))}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-transparent text-[var(--color-ink)] transition-colors hover:bg-[#f6f7f9]"
                >
                  <span className="flex items-center gap-0.5" aria-hidden="true">
                    <span className="h-1 w-1 rounded-full bg-current" />
                    <span className="h-1 w-1 rounded-full bg-current" />
                    <span className="h-1 w-1 rounded-full bg-current" />
                  </span>
                </button>
              </div>
            </div>

            {day.enabled ? (
              <div className="mt-3 grid gap-2 min-[900px]:grid-cols-2">
                {day.slots.map((slot, index) => (
                  <ScheduleChip
                    key={`${day.day}-mobile-slot-${index}`}
                    label={index === 0 ? "Mañana" : "Tarde"}
                    onRemove={() => onRemoveSlot(dayIndex, index)}
                    removeLabel={`Quitar horario de ${day.day}`}
                  >
                    <CompactTimeRange
                      end={slot.end}
                      endLabel={`${day.day} fin del turno ${index + 1}`}
                      onEndChange={(value) => onUpdateSlotTime(dayIndex, index, "end", value)}
                      onStartChange={(value) => onUpdateSlotTime(dayIndex, index, "start", value)}
                      start={slot.start}
                      startLabel={`${day.day} inicio del turno ${index + 1}`}
                    />
                  </ScheduleChip>
                ))}

                {day.break && (
                  <BreakChip
                    className="min-[900px]:col-span-2"
                    label="Descanso"
                    onRemove={() => onToggleBreak(dayIndex)}
                    removeLabel={`Quitar descanso de ${day.day}`}
                  >
                    <CompactTimeRange
                      end={day.break.end}
                      endLabel={`${day.day} fin del descanso`}
                      onEndChange={(value) => onUpdateBreakTime(dayIndex, "end", value)}
                      onStartChange={(value) => onUpdateBreakTime(dayIndex, "start", value)}
                      start={day.break.start}
                      startLabel={`${day.day} inicio del descanso`}
                    />
                  </BreakChip>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-muted)]">No disponible</p>
            )}
          </div>
        ))}
      </div>

      <div className="stable-scrollbar hidden overflow-x-auto overflow-y-visible min-[1500px]:block">
        <div className="min-w-[820px] px-4 pb-4">
          <div className="grid grid-cols-[130px_minmax(170px,1fr)_150px_88px_34px] min-[1720px]:grid-cols-[130px_minmax(300px,1fr)_150px_88px_34px] px-2 py-3 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted-strong)]">
            <span className="text-left">Día</span>
            <span>Horarios de atención</span>
            <span>Descanso</span>
            <span>Estado</span>
            <span />
          </div>

          <div className="space-y-2">
            {availability.map((day, dayIndex) => (
              <div
                key={day.day}
                className="relative grid grid-cols-[130px_minmax(170px,1fr)_150px_88px_34px] min-[1720px]:grid-cols-[130px_minmax(300px,1fr)_150px_88px_34px] items-center rounded-lg border border-[var(--color-border)] bg-white/58 px-3 py-2.5 shadow-[0_10px_24px_rgba(32,24,54,0.035)]"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold ${dayToneClassName[day.tone]}`}
                  >
                    {day.shortDay}
                  </span>
                  <span className="truncate text-sm font-bold">{day.day}</span>
                </div>

                <div className="flex justify-center">
                  {day.enabled ? (
                    <div className="grid justify-items-center gap-1.5 min-[1720px]:flex min-[1720px]:items-end min-[1720px]:justify-center">
                      {day.slots.map((slot, index) => (
                        <div
                          key={`${day.day}-slot-${index}`}
                          className="flex items-end gap-0.5 whitespace-nowrap"
                        >
                          <CompactTimeRange
                            end={slot.end}
                            endLabel={`${day.day} fin del turno ${index + 1}`}
                            label={index === 0 ? "Mañana" : "Tarde"}
                            onEndChange={(value) => onUpdateSlotTime(dayIndex, index, "end", value)}
                            onStartChange={(value) =>
                              onUpdateSlotTime(dayIndex, index, "start", value)
                            }
                            start={slot.start}
                            startLabel={`${day.day} inicio del turno ${index + 1}`}
                          />
                          <RemoveButton
                            label={`Quitar horario de ${day.day}`}
                            onClick={() => onRemoveSlot(dayIndex, index)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-[var(--color-muted)]">No disponible</span>
                  )}
                </div>

                <div className="flex justify-center">
                  {day.break ? (
                    <CompactTimeRange
                      end={day.break.end}
                      endLabel={`${day.day} fin del descanso`}
                      onEndChange={(value) => onUpdateBreakTime(dayIndex, "end", value)}
                      onStartChange={(value) => onUpdateBreakTime(dayIndex, "start", value)}
                      start={day.break.start}
                      startLabel={`${day.day} inicio del descanso`}
                    />
                  ) : (
                    <span className="text-sm text-[var(--color-muted)]">-</span>
                  )}
                </div>

                <div className="flex justify-center">
                  <StatusBadge enabled={day.enabled} status={day.status} />
                </div>
                <div data-day-actions className="relative">
                  <button
                    type="button"
                    onClick={(event) => toggleDayMenu(dayIndex, event.currentTarget, day.enabled, Boolean(day.break))}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-transparent text-[var(--color-ink)] transition-colors hover:bg-[#f6f7f9]"
                  >
                    <span className="flex items-center gap-0.5" aria-hidden="true">
                      <span className="h-1 w-1 rounded-full bg-current" />
                      <span className="h-1 w-1 rounded-full bg-current" />
                      <span className="h-1 w-1 rounded-full bg-current" />
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--color-border)] px-4 py-3">
        <p className="rounded-md border border-[var(--color-border)] bg-white/42 px-3 py-2 text-sm text-[var(--color-muted-strong)]">
          Los horarios se aplican semanalmente. Podés agregar excepciones para días específicos en feriados.
        </p>
      </div>

      {activeDayMenu !== null && activeDayData && menuPosition &&
        createPortal(
          <div data-day-menu style={{ position: "fixed", left: menuPosition.left, top: menuPosition.top, zIndex: 50 }}>
            <DayActionsMenu
              enabled={activeDayData.enabled}
              hasBreak={activeDayData.hasBreak}
              onDuplicateAll={() => onDuplicateAll(activeDayData.dayIndex)}
              onDuplicate={() => onDuplicateDay(activeDayData.dayIndex)}
              onToggleBreak={() => onToggleBreak(activeDayData.dayIndex)}
              onToggleStatus={() => onToggleDayStatus(activeDayData.dayIndex)}
            />
          </div>,
          document.body
        )}
    </>
  );
}

function DayActionsMenu({
  enabled,
  hasBreak,
  onDuplicateAll,
  onDuplicate,
  onToggleBreak,
  onToggleStatus
}: {
  enabled: boolean;
  hasBreak: boolean;
  onDuplicateAll: () => void;
  onDuplicate: () => void;
  onToggleBreak: () => void;
  onToggleStatus: () => void;
}) {
  return (
    <div className="w-40 overflow-hidden rounded-md border border-[var(--color-border)] bg-[#ffffff] p-1 text-left shadow-[0_18px_42px_rgba(32,24,54,0.16)]">
      <button
        type="button"
        onClick={onDuplicateAll}
        style={{ fontSize: "0.6875rem", lineHeight: "1rem" }}
        className="block w-full rounded px-3 py-1.5 text-left text-[0.6875rem] font-semibold leading-4 text-[var(--color-ink)] hover:bg-[#f6f7f9]"
      >
        Duplicar a todos
      </button>
      <button
        type="button"
        onClick={onDuplicate}
        style={{ fontSize: "0.6875rem", lineHeight: "1rem" }}
        className="block w-full rounded px-3 py-1.5 text-left text-[0.6875rem] font-semibold leading-4 text-[var(--color-ink)] hover:bg-[#f6f7f9]"
      >
        Elegir días
      </button>
      <button
        type="button"
        onClick={onToggleBreak}
        style={{ fontSize: "0.6875rem", lineHeight: "1rem" }}
        className="mt-1 block w-full rounded border-t border-[var(--color-border)] px-3 py-1.5 pt-2 text-left text-[0.6875rem] font-semibold leading-4 text-[var(--color-ink)] hover:bg-[#f6f7f9]"
      >
        {hasBreak ? "Quitar descanso" : "Agregar descanso"}
      </button>
      <button
        type="button"
        onClick={onToggleStatus}
        style={{ fontSize: "0.6875rem", lineHeight: "1rem" }}
        className={`block w-full rounded px-3 py-1.5 text-left text-[0.6875rem] font-semibold leading-4 hover:bg-[#f6f7f9] ${enabled ? "text-[#b42318]" : "text-[#347548]"}`}
      >
        {enabled ? "Desactivar día" : "Activar día"}
      </button>
    </div>
  );
}

function CompactTimeRange({
  end,
  endLabel,
  label,
  onEndChange,
  onStartChange,
  start,
  startLabel
}: {
  end: string;
  endLabel: string;
  label?: string;
  onEndChange: (value: string) => void;
  onStartChange: (value: string) => void;
  start: string;
  startLabel: string;
}) {
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);

  function selectNearestTime(event: PointerEvent<HTMLSpanElement>) {
    if ((event.target as HTMLElement).tagName === "INPUT") return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const targetInput =
      event.clientX < bounds.left + bounds.width / 2 ? startInputRef.current : endInputRef.current;

    event.preventDefault();
    targetInput?.focus();
    targetInput?.select();
  }

  return (
    <span className="grid justify-items-center gap-1">
      {label && (
        <span className="text-[10px] font-bold leading-none text-[var(--color-muted)]">
          {label}
        </span>
      )}
      <span
        onPointerDown={selectNearestTime}
        className="inline-flex h-8 min-w-[108px] cursor-text items-center justify-center rounded-md border border-[var(--color-border)] bg-[rgba(255,255,255,0.74)] px-1 font-mono text-[12px] font-semibold shadow-[0_8px_18px_rgba(32,24,54,0.03)] transition-colors duration-200 hover:border-[var(--color-ink)] focus-within:border-[var(--color-accent)] focus-within:ring-2 focus-within:ring-[rgba(253,134,6,0.14)]"
      >
        <TimeInput
          ariaLabel={startLabel}
          className="!h-7 !w-[45px] !min-w-[45px] !rounded-none !border-0 !bg-transparent !px-0 !text-[12px] !leading-7 !shadow-none !outline-none hover:!border-transparent focus:!border-transparent focus:!ring-0 xl:!w-[45px] xl:!min-w-[45px]"
          inputRef={startInputRef}
          onChange={onStartChange}
          selectOnFocus
          value={start}
        />
        <span className="px-0.5 text-[var(--color-muted)]">-</span>
        <TimeInput
          ariaLabel={endLabel}
          className="!h-7 !w-[45px] !min-w-[45px] !rounded-none !border-0 !bg-transparent !px-0 !text-[12px] !leading-7 !shadow-none !outline-none hover:!border-transparent focus:!border-transparent focus:!ring-0 xl:!w-[45px] xl:!min-w-[45px]"
          inputRef={endInputRef}
          onChange={onEndChange}
          selectOnFocus
          value={end}
        />
      </span>
    </span>
  );
}

function ScheduleChip({
  children,
  className = "",
  label,
  onRemove,
  removeLabel
}: {
  children: ReactNode;
  className?: string;
  label: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div
      className={`grid min-h-[66px] grid-cols-[1fr_auto] gap-2 rounded-lg border border-[var(--color-border)] bg-white/50 px-3 py-2 shadow-[0_8px_22px_rgba(32,24,54,0.025)] min-[520px]:grid-cols-[78px_minmax(0,1fr)_28px] min-[520px]:items-center ${className}`}
    >
      <span className="text-xs font-bold text-[var(--color-muted-strong)]">
        {label}
      </span>
      <div className="col-span-2 flex justify-center min-[520px]:col-span-1">{children}</div>
      <div className="col-start-2 row-start-1 justify-self-end min-[520px]:col-start-auto min-[520px]:row-start-auto">
        <RemoveButton label={removeLabel} onClick={onRemove} />
      </div>
    </div>
  );
}

function BreakChip({
  children,
  className = "",
  label,
  onRemove,
  removeLabel
}: {
  children: ReactNode;
  className?: string;
  label: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border border-dashed border-[var(--color-border)] bg-[rgba(32,24,54,0.025)] px-3 py-2 ${className}`}
    >
      <span className="text-xs font-bold text-[var(--color-muted-strong)]">{label}</span>
      <div className="flex flex-1 justify-center">{children}</div>
      <RemoveButton label={removeLabel} onClick={onRemove} />
    </div>
  );
}

function RemoveButton({
  label,
  onClick
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="group grid h-7 w-7 place-items-center rounded-md transition duration-200 hover:-translate-y-0.5 hover:bg-[#fde8e5]/45 active:translate-y-0"
    >
      <img
        src={trashIcon}
        alt=""
        aria-hidden="true"
        className="h-4 w-4 opacity-80 transition duration-200 group-hover:rotate-[-6deg] group-hover:scale-110 group-hover:opacity-100 [filter:invert(18%)_sepia(85%)_saturate(2628%)_hue-rotate(352deg)_brightness(91%)_contrast(93%)]"
      />
    </button>
  );
}
