import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ModalCloseButton, Toast } from "../../components/ui";
import { queryKeys } from "../../lib/query-keys";
import { AvailabilityEditPanel } from "./AvailabilityEditPanel";
import { AvailabilityExceptionsView } from "./AvailabilityExceptionsView";
import { AvailabilityResourcesView } from "./AvailabilityResourcesView";
import { AvailabilitySidePanel } from "./AvailabilitySidePanel";
import { AvailabilityWeeklySchedule } from "./AvailabilityWeeklySchedule";
import { availabilityTabs } from "./availability.constants";
import { argentinaProvinces } from "./dashboard.options";
import {
  createBranch,
  deleteBranch,
  getBranches,
  updateBranch,
  type BranchDraft
} from "./branches.api";
import type {
  AvailabilityException,
  AvailabilityPanel,
  AvailabilityResource,
  AvailabilityServiceCategory,
  AvailabilityTab,
  WeeklyAvailabilityDay
} from "./availability.types";
import { buttonMotionClass } from "./dashboard.constants";
import { weeklyAvailability } from "./dashboard.data";
import type { SubscriptionStatus } from "../billing/billing.api";
import {
  getAvailabilityCatalog,
  getAvailabilityExceptions,
  getWeeklyAvailability,
  deleteAvailabilityException,
  deleteAvailabilityCatalogItem,
  deleteAvailabilityCategory,
  saveAvailabilityCatalogItem,
  saveAvailabilityCategory,
  saveAvailabilityException,
  updateWeeklyAvailability
} from "./availability.api";

const defaultMorningSlot = { start: "09:00", end: "12:00" };
const defaultAfternoonSlot = { start: "17:00", end: "20:00" };
const emptyBranchDraft: BranchDraft = {
  name: "",
  phone: "",
  whatsapp: "",
  address: "",
  city: "",
  province: ""
};

function minuteToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function timeToMinute(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

type DuplicateDayDraft = {
  sourceIndex: number;
  targetIndices: number[];
} | null;

function cloneDaySchedule(source: WeeklyAvailabilityDay, target: WeeklyAvailabilityDay) {
  return {
    ...target,
    enabled: source.enabled,
    status: source.status,
    slots: source.slots.map((slot) => ({ ...slot })),
    break: source.break ? { ...source.break } : null
  };
}

type DashboardAvailabilityViewProps = {
  subscription?: SubscriptionStatus;
};

export function DashboardAvailabilityView({ subscription }: DashboardAvailabilityViewProps) {
  const [activeTab, setActiveTab] = useState<AvailabilityTab>("weekly");
  const [activeDayMenu, setActiveDayMenu] = useState<number | null>(null);
  const [activePanel, setActivePanel] = useState<AvailabilityPanel>(null);
  const [duplicateDraft, setDuplicateDraft] = useState<DuplicateDayDraft>(null);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [resources, setResources] = useState<AvailabilityResource[]>([]);
  const [serviceCategories, setServiceCategories] = useState<AvailabilityServiceCategory[]>([]);
  const [categoryDraft, setCategoryDraft] = useState<string | null>(null);
  const [branchDraft, setBranchDraft] = useState<BranchDraft | null>(null);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [availability, setAvailability] = useState<WeeklyAvailabilityDay[]>(() =>
    weeklyAvailability.map((day) => ({
      ...day,
      break: day.break ? { ...day.break } : null,
      slots: day.slots.map((slot) => ({ ...slot }))
    }))
  );
  const [savedAvailability, setSavedAvailability] = useState<WeeklyAvailabilityDay[]>([]);
  const [toast, setToast] = useState("");
  const [isSavingWeekly, setIsSavingWeekly] = useState(false);
  const hasWeeklyChanges =
    savedAvailability.length > 0 &&
    JSON.stringify(availability) !== JSON.stringify(savedAvailability);
  const queryClient = useQueryClient();
  const branchesQuery = useQuery({
    queryKey: queryKeys.organizationBranches,
    queryFn: getBranches
  });
  const fallbackBranchId =
    branchesQuery.data?.find((branch) => branch.isMain)?.id ?? branchesQuery.data?.[0]?.id ?? "";
  const activeBranchId = selectedBranchId || fallbackBranchId;
  const selectedBranch = branchesQuery.data?.find((branch) => branch.id === activeBranchId);
  const canManageMultipleBranches =
    subscription?.plan === "professional" || subscription?.plan === "operation";
  const weeklyQuery = useQuery({
    queryKey: queryKeys.weeklyAvailability(activeBranchId),
    queryFn: () => getWeeklyAvailability(activeBranchId),
    enabled: activeTab === "weekly" && Boolean(activeBranchId)
  });
  const exceptionsQuery = useQuery({
    queryKey: queryKeys.availabilityExceptions(activeBranchId),
    queryFn: () => getAvailabilityExceptions(activeBranchId),
    enabled: Boolean(activeBranchId),
    refetchOnMount: "always"
  });
  const catalogQuery = useQuery({
    queryKey: queryKeys.availabilityCatalog(activeBranchId),
    queryFn: () => getAvailabilityCatalog(activeBranchId),
    enabled: activeTab === "resources" && Boolean(activeBranchId)
  });

  useEffect(() => {
    if (!weeklyQuery.data) return;
    let cancelled = false;
    const { data } = weeklyQuery.data;
    const loaded = weeklyAvailability.map((metadata, weekday) => {
      const slots = (data.days.find((day) => day.weekday === weekday)?.slots ?? [])
        .map((slot) => ({
          start: minuteToTime(slot.startMinute),
          end: minuteToTime(slot.endMinute)
        }));
      return {
        ...metadata,
        enabled: slots.length > 0,
        status: slots.length > 0 ? "Activo" : "Inactivo",
        slots,
        break:
          slots.length >= 2 && slots[0].end !== slots[1].start
            ? { start: slots[0].end, end: slots[1].start }
            : null
      } satisfies WeeklyAvailabilityDay;
    });

    queueMicrotask(() => {
      if (cancelled) return;
      setAvailability(loaded);
      setSavedAvailability(loaded);
    });

    return () => {
      cancelled = true;
    };
  }, [weeklyQuery.data]);

  useEffect(() => {
    if (!exceptionsQuery.data) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setExceptions(exceptionsQuery.data);
    });
    return () => {
      cancelled = true;
    };
  }, [exceptionsQuery.data]);

  useEffect(() => {
    if (!catalogQuery.data) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setResources(catalogQuery.data.services);
      setServiceCategories(catalogQuery.data.categories);
    });
    return () => {
      cancelled = true;
    };
  }, [catalogQuery.data]);

  function updateSlotTime(
    dayIndex: number,
    slotIndex: number,
    field: "start" | "end",
    value: string
  ) {
    setAvailability((current) =>
      current.map((day, currentDayIndex) =>
        currentDayIndex === dayIndex
          ? {
              ...day,
              slots: day.slots.map((slot, currentSlotIndex) =>
                currentSlotIndex === slotIndex ? { ...slot, [field]: value } : slot
              )
            }
          : day
      )
    );
  }

  function updateBreakTime(dayIndex: number, field: "start" | "end", value: string) {
    setAvailability((current) =>
      current.map((day, currentDayIndex) =>
        currentDayIndex === dayIndex && day.break
          ? {
              ...day,
              break: { ...day.break, [field]: value },
              slots: day.slots.map((slot, slotIndex) =>
                field === "start" && slotIndex === 0
                  ? { ...slot, end: value }
                  : field === "end" && slotIndex === 1
                    ? { ...slot, start: value }
                    : slot
              )
            }
          : day
      )
    );
  }

  function removeSlot(dayIndex: number, slotIndex: number) {
    setAvailability((current) =>
      current.map((day, currentDayIndex) =>
        currentDayIndex === dayIndex
          ? {
              ...day,
              slots: day.slots.filter((_, currentSlotIndex) => currentSlotIndex !== slotIndex)
            }
          : day
      )
    );
  }

  function openDuplicateDialog(sourceIndex: number) {
    setDuplicateDraft({
      sourceIndex,
      targetIndices: availability
        .map((_, index) => index)
        .filter((index) => index !== sourceIndex)
    });
    setActiveDayMenu(null);
  }

  function duplicateDayToAll(sourceIndex: number) {
    setAvailability((current) =>
      current.map((day, index) =>
        index === sourceIndex ? day : cloneDaySchedule(current[sourceIndex], day)
      )
    );
    setToast("Horarios duplicados en todos los días.");
    setActiveDayMenu(null);
  }

  function toggleDuplicateTarget(index: number) {
    setDuplicateDraft((current) =>
      current
        ? {
            ...current,
            targetIndices: current.targetIndices.includes(index)
              ? current.targetIndices.filter((target) => target !== index)
              : [...current.targetIndices, index].sort((a, b) => a - b)
          }
        : current
    );
  }

  function selectAllDuplicateTargets() {
    setDuplicateDraft((current) =>
      current
        ? {
            ...current,
            targetIndices: availability
              .map((_, index) => index)
              .filter((index) => index !== current.sourceIndex)
          }
        : current
    );
  }

  function clearDuplicateTargets() {
    setDuplicateDraft((current) => (current ? { ...current, targetIndices: [] } : current));
  }

  function applyDuplicateSchedule() {
    if (!duplicateDraft) return;

    const { sourceIndex, targetIndices } = duplicateDraft;
    if (targetIndices.length === 0) {
      setToast("Elegí al menos un día destino.");
      return;
    }

    setAvailability((current) =>
      current.map((day, index) =>
        index === sourceIndex || !targetIndices.includes(index)
          ? day
          : cloneDaySchedule(current[sourceIndex], day)
      )
    );
    setToast("Horarios duplicados.");
    setDuplicateDraft(null);
  }

  function toggleDayStatus(dayIndex: number) {
    setAvailability((current) =>
      current.map((day, currentDayIndex) =>
        currentDayIndex === dayIndex
          ? {
              ...day,
              enabled: !day.enabled,
              status: day.enabled ? "Inactivo" : "Activo",
              slots:
                !day.enabled && day.slots.length === 0
                  ? [defaultMorningSlot, defaultAfternoonSlot]
                  : day.slots
            }
          : day
      )
    );
    setActiveDayMenu(null);
  }

  function toggleBreak(dayIndex: number) {
    setAvailability((current) =>
      current.map((day, currentDayIndex) =>
        currentDayIndex === dayIndex
          ? day.break
            ? {
                ...day,
                break: null,
                slots:
                  day.slots.length >= 2
                    ? [{ start: day.slots[0].start, end: day.slots[day.slots.length - 1].end }]
                    : day.slots
              }
            : {
                ...day,
                break: { start: "13:00", end: "14:00" },
                slots:
                  day.slots.length === 1
                    ? [
                        { start: day.slots[0].start, end: "13:00" },
                        { start: "14:00", end: day.slots[0].end }
                      ]
                    : day.slots
              }
          : day
      )
    );
    setActiveDayMenu(null);
  }

  function addException() {
    const today = new Date().toISOString().slice(0, 10);
    const existingIndex = exceptions.findIndex((exception) => exception.date === today);
    if (existingIndex >= 0) {
      setActivePanel({ type: "exception", index: existingIndex });
      setToast("Ya existe una excepción para hoy.");
      return;
    }
    const nextIndex = exceptions.length;

    setExceptions((current) => [
      ...current,
      {
        date: today,
        title: "Cierre del local",
        detail: "El local no atenderá en esta fecha.",
        status: "No laborable",
        enabled: false
      }
    ]);
    setActivePanel({ type: "exception", index: nextIndex });
  }

  function addResource() {
    setActivePanel({ type: "rules", index: -1 });
  }

  async function saveException(index: number, draft: AvailabilityException) {
    const duplicate = exceptions.some((item, currentIndex) =>
      currentIndex !== index && item.date === draft.date
    );
    if (duplicate) {
      setToast("Ya existe una excepción para esa fecha.");
      throw new Error("Duplicate exception date");
    }
    try {
      const result = await saveAvailabilityException(draft, activeBranchId);
      const saved = { ...draft, id: draft.id ?? result.data.id };
      setExceptions((current) =>
        current.map((item, currentIndex) =>
          currentIndex === index ? saved : item
        )
      );
      queryClient.setQueryData<AvailabilityException[]>(
        queryKeys.availabilityExceptions(activeBranchId),
        (current = []) =>
          draft.id
            ? current.map((item) => (item.id === draft.id ? saved : item))
            : [...current, saved]
      );
      setToast("Excepción guardada.");
    } catch {
      setToast("No pudimos guardar la excepción.");
      throw new Error("Unable to save exception");
    }
  }

  async function removeException(index: number) {
    const exception = exceptions[index];
    if (!exception?.id) return;
    try {
      await deleteAvailabilityException(exception.id, activeBranchId);
      setExceptions((current) => current.filter((_, currentIndex) => currentIndex !== index));
      queryClient.setQueryData<AvailabilityException[]>(
        queryKeys.availabilityExceptions(activeBranchId),
        (current = []) => current.filter((item) => item.id !== exception.id)
      );
      setToast("Excepción eliminada.");
    } catch {
      setToast("No pudimos eliminar la excepción.");
      throw new Error("Unable to delete exception");
    }
  }

  async function saveResource(index: number, draft: AvailabilityResource) {
    try {
      const result = await saveAvailabilityCatalogItem(draft, activeBranchId);
      const saved = { ...draft, id: draft.id ?? result.data.id };
      setResources((current) =>
        index < 0
          ? [...current, saved]
          : current.map((item, currentIndex) =>
              currentIndex === index ? saved : item
            )
      );
      queryClient.setQueryData<{
        categories: AvailabilityServiceCategory[];
        services: AvailabilityResource[];
      }>(
        queryKeys.availabilityCatalog(activeBranchId),
        (current) => {
          const categories = current?.categories ?? serviceCategories;
          const services = current?.services ?? [];
          return {
            categories,
            services:
              index < 0
                ? [...services, saved]
                : draft.id
                  ? services.map((item) => (item.id === draft.id ? saved : item))
                  : [...services, saved]
          };
        }
      );
      setToast("Servicio guardado.");
    } catch {
      setToast("No pudimos guardar el servicio.");
      throw new Error("Unable to save service");
    }
  }

  async function saveCategory(name: string) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setToast("Escribí un nombre de categoría.");
      return;
    }
    try {
      const result = await saveAvailabilityCategory(trimmedName);
      const saved = result.data;
      setServiceCategories((current) => {
        const exists = current.some((category) => category.id === saved.id);
        return exists
          ? current.map((category) => (category.id === saved.id ? saved : category))
          : [...current, saved].sort((first, second) => first.name.localeCompare(second.name));
      });
      queryClient.setQueryData<{
        categories: AvailabilityServiceCategory[];
        services: AvailabilityResource[];
      }>(queryKeys.availabilityCatalog(activeBranchId), (current) => ({
        categories: [
          ...((current?.categories ?? serviceCategories).filter(
            (category) => category.id !== saved.id
          )),
          saved
        ].sort((first, second) => first.name.localeCompare(second.name)),
        services: current?.services ?? resources
      }));
      setCategoryDraft(null);
      setToast("Categoría creada.");
    } catch {
      setToast("No pudimos guardar la categoría.");
    }
  }

  async function removeResource(index: number) {
    const resource = resources[index];
    if (!resource?.id) return;
    try {
      await deleteAvailabilityCatalogItem(resource.id, activeBranchId);
      setResources((current) => current.filter((_, currentIndex) => currentIndex !== index));
      queryClient.setQueryData<{
        categories: AvailabilityServiceCategory[];
        services: AvailabilityResource[];
      }>(queryKeys.availabilityCatalog(activeBranchId), (current) => ({
        categories: current?.categories ?? serviceCategories,
        services: (current?.services ?? resources).filter((item) => item.id !== resource.id)
      }));
      setToast("Servicio eliminado.");
    } catch {
      setToast("No pudimos eliminar el servicio.");
    }
  }

  async function removeCategory(categoryId: string, categoryName: string) {
    try {
      await deleteAvailabilityCategory(categoryId);
      setServiceCategories((current) => current.filter((category) => category.id !== categoryId));
      setResources((current) =>
        current.map((resource) =>
          resource.category === categoryName ? { ...resource, category: "" } : resource
        )
      );
      queryClient.setQueryData<{
        categories: AvailabilityServiceCategory[];
        services: AvailabilityResource[];
      }>(queryKeys.availabilityCatalog(activeBranchId), (current) => ({
        categories: (current?.categories ?? serviceCategories).filter(
          (category) => category.id !== categoryId
        ),
        services: (current?.services ?? resources).map((resource) =>
          resource.category === categoryName ? { ...resource, category: "" } : resource
        )
      }));
      setToast("Categoría eliminada.");
    } catch {
      setToast("No pudimos eliminar la categoría.");
    }
  }

  async function handlePrimaryAction() {
    if (activeTab === "weekly") {
      if (isSavingWeekly) return;
      if (JSON.stringify(availability) === JSON.stringify(savedAvailability)) {
        setToast("No hay cambios por guardar.");
        return;
      }
      const days = availability.map((day, weekday) => ({
        weekday,
        slots: day.enabled
          ? day.slots.map((slot) => ({
              startMinute: timeToMinute(slot.start),
              endMinute: timeToMinute(slot.end)
            }))
          : []
      }));
      const invalid = days.some((day) =>
        day.slots.some((slot, index) =>
          slot.startMinute >= slot.endMinute ||
          (index > 0 && slot.startMinute < day.slots[index - 1].endMinute)
        )
      );
      if (invalid) {
        setToast("Revisá los horarios: hay rangos inválidos o superpuestos.");
        return;
      }
      setIsSavingWeekly(true);
      try {
        await updateWeeklyAvailability(days, activeBranchId);
        queryClient.setQueryData(queryKeys.weeklyAvailability(activeBranchId), {
          success: true,
          data: {
            timezone: weeklyQuery.data?.data.timezone ?? "America/Argentina/Buenos_Aires",
            days
          }
        });
        setSavedAvailability(availability);
        setToast("Disponibilidad guardada.");
      } catch {
        setToast("No pudimos guardar la disponibilidad.");
      } finally {
        setIsSavingWeekly(false);
      }
      return;
    }
    if (activeTab === "exceptions") addException();
    if (activeTab === "resources") addResource();
  }

  function cancelWeeklyChanges() {
    setAvailability(
      savedAvailability.map((day) => ({
        ...day,
        break: day.break ? { ...day.break } : null,
        slots: day.slots.map((slot) => ({ ...slot }))
      }))
    );
    setActiveDayMenu(null);
    setToast("Cambios descartados.");
  }

  function handleBranchChange(branchId: string) {
    if (hasWeeklyChanges) {
      setToast("Guardá o cancelá los cambios antes de cambiar de sede.");
      return;
    }
    setSelectedBranchId(branchId);
    setActiveDayMenu(null);
  }

  function openCreateBranch() {
    setEditingBranchId(null);
    setBranchDraft(emptyBranchDraft);
  }

  function openEditBranch() {
    if (!selectedBranch) return;
    setEditingBranchId(selectedBranch.id);
    setBranchDraft({
      name: selectedBranch.name,
      phone: selectedBranch.phone,
      whatsapp: selectedBranch.whatsapp,
      address: selectedBranch.address,
      city: selectedBranch.city,
      province: selectedBranch.province
    });
  }

  async function saveBranch() {
    if (!branchDraft?.name.trim()) {
      setToast("Escribí el nombre de la sede.");
      return;
    }
    try {
      if (editingBranchId) {
        await updateBranch(editingBranchId, branchDraft);
      } else {
        const created = await createBranch(branchDraft);
        setSelectedBranchId(created.id);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.organizationBranches });
      setBranchDraft(null);
      setEditingBranchId(null);
      setToast(editingBranchId ? "Sede actualizada." : "Sede creada.");
    } catch {
      setToast(editingBranchId ? "No pudimos actualizar la sede." : "No pudimos crear la sede.");
    }
  }

  async function removeBranch() {
    if (!editingBranchId || selectedBranch?.isMain) return;
    try {
      await deleteBranch(editingBranchId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.organizationBranches });
      const fallback = branchesQuery.data?.find((branch) => branch.isMain)?.id ?? "";
      setSelectedBranchId(fallback);
      setBranchDraft(null);
      setEditingBranchId(null);
      setToast("Sede eliminada.");
    } catch {
      setToast("No pudimos eliminar la sede.");
    }
  }

  return (
    <section className="grid min-w-0 gap-5 min-[1700px]:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-3">
        {canManageMultipleBranches && (
          <div className="flex flex-col gap-2 px-1 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
            <div className="flex min-w-0 items-center gap-3">
                <span className="shrink-0 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                Sede
              </span>
              <select
                value={activeBranchId}
                onChange={(event) => handleBranchChange(event.target.value)}
                className="h-8 w-full rounded-md border border-[var(--color-border-strong)] bg-[#ffffff] px-3 text-xs font-semibold text-[var(--color-ink)] outline-none transition-colors hover:border-[var(--color-ink)] focus:border-[var(--color-accent)] sm:w-[260px]"
                aria-label="Seleccionar sede"
              >
                {(branchesQuery.data ?? []).map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                    {branch.isMain ? " · Principal" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={openCreateBranch}
                className={`h-8 shrink-0 whitespace-nowrap rounded-md border border-[var(--color-border-strong)] bg-[#ffffff] px-3 text-xs font-semibold text-[var(--color-ink)] ${buttonMotionClass}`}
              >
                + Nueva sede
              </button>
              <button
                type="button"
                disabled={!selectedBranch}
                onClick={openEditBranch}
                className={`h-8 shrink-0 whitespace-nowrap rounded-md border border-[var(--color-border-strong)] bg-[#ffffff] px-3 text-xs font-semibold text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-50 ${buttonMotionClass}`}
              >
                Editar sede
              </button>
            </div>
          </div>
        )}

        <article className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[#ffffff] shadow-[0_16px_44px_rgba(32,24,54,0.05)]">
        <div className="border-b border-[var(--color-border)] px-4 pt-4">
          <div className="stable-scrollbar flex gap-4 overflow-x-auto whitespace-nowrap text-xs font-medium text-[var(--color-muted-strong)] sm:gap-6">
            {availabilityTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={`border-b-2 pb-3 ${
                  activeTab === tab.value
                    ? "border-[var(--color-ink)] text-[var(--color-ink)]"
                    : "border-transparent hover:text-[var(--color-ink)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "exceptions" && (
          <AvailabilityActionBar
            title="Excepciones y feriados"
            description="Agregá días no laborables o ajustes puntuales de horario."
            actionLabel="+ Agregar excepción"
            onAction={() => void handlePrimaryAction()}
          />
        )}

        {activeTab === "resources" && (
          <AvailabilityActionBar
            title="Servicios y recursos"
            description="Configurá los servicios disponibles para la sede seleccionada."
            actionLabel="+ Agregar servicio"
            secondaryActionLabel="+ Crear categoría"
            onAction={() => void handlePrimaryAction()}
            onSecondaryAction={() => setCategoryDraft("")}
          />
        )}

        {activeTab === "weekly" && (
          <AvailabilityWeeklySchedule
            activeDayMenu={activeDayMenu}
            availability={availability}
            onCloseDayMenu={() => setActiveDayMenu(null)}
            onDuplicateAll={duplicateDayToAll}
            onDuplicateDay={openDuplicateDialog}
            onRemoveSlot={removeSlot}
            onToggleBreak={toggleBreak}
            onToggleDayMenu={(dayIndex) =>
              setActiveDayMenu(activeDayMenu === dayIndex ? null : dayIndex)
            }
            onToggleDayStatus={toggleDayStatus}
            onUpdateBreakTime={updateBreakTime}
            onUpdateSlotTime={updateSlotTime}
          />
        )}
        {activeTab === "weekly" && hasWeeklyChanges && (
          <div className="flex flex-col-reverse items-center justify-center gap-2 border-t border-[var(--color-border)] px-4 py-5 sm:flex-row">
            <button
              type="button"
              disabled={isSavingWeekly}
              onClick={cancelWeeklyChanges}
              className={`rounded-md border border-[var(--color-border-strong)] px-5 py-2.5 text-sm font-semibold text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-60 ${buttonMotionClass}`}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isSavingWeekly}
              onClick={() => void handlePrimaryAction()}
              className={`rounded-md bg-[var(--color-ink)] px-5 py-2.5 text-sm font-semibold text-[var(--color-button-text)] disabled:cursor-not-allowed disabled:opacity-60 ${buttonMotionClass}`}
            >
              {isSavingWeekly ? "Guardando..." : "Guardar horarios"}
            </button>
          </div>
        )}

        {activeTab === "exceptions" && (
          <AvailabilityExceptionsView
            exceptions={exceptions}
            onEdit={(index) => setActivePanel({ type: "exception", index })}
          />
        )}

        {activeTab === "resources" && (
          <AvailabilityResourcesView
            categories={serviceCategories}
            onDeleteCategory={(category) => void removeCategory(category.id, category.name)}
            onDeleteResource={(index) => void removeResource(index)}
            onEditRules={(index) => setActivePanel({ type: "rules", index })}
            resources={resources}
          />
        )}
        </article>
      </div>

      <AvailabilitySidePanel activeTab={activeTab} availability={availability} />

      {activePanel && (
        <AvailabilityEditPanel
          exceptions={exceptions}
          panel={activePanel}
          resources={resources}
          categories={serviceCategories}
          onClose={() => setActivePanel(null)}
          onDeleteException={removeException}
          onSaveException={saveException}
          onSaveResource={saveResource}
        />
      )}
      {categoryDraft !== null && (
        <CategoryModal
          value={categoryDraft}
          onChange={setCategoryDraft}
          onClose={() => setCategoryDraft(null)}
          onSave={() => void saveCategory(categoryDraft)}
        />
      )}
      {branchDraft && (
        <BranchModal
          canDelete={Boolean(editingBranchId && !selectedBranch?.isMain)}
          mode={editingBranchId ? "edit" : "create"}
          value={branchDraft}
          onChange={setBranchDraft}
          onClose={() => {
            setBranchDraft(null);
            setEditingBranchId(null);
          }}
          onDelete={() => void removeBranch()}
          onSave={() => void saveBranch()}
        />
      )}
      {duplicateDraft && (
        <DuplicateDayModal
          availability={availability}
          draft={duplicateDraft}
          onClose={() => setDuplicateDraft(null)}
          onClear={clearDuplicateTargets}
          onSelectAll={selectAllDuplicateTargets}
          onToggleTarget={toggleDuplicateTarget}
          onApply={applyDuplicateSchedule}
        />
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast("")} />}
    </section>
  );
}

function AvailabilityActionBar({
  actionLabel,
  description,
  onAction,
  onSecondaryAction,
  secondaryActionLabel,
  title
}: {
  actionLabel: string;
  description: string;
  onAction: () => void;
  onSecondaryAction?: () => void;
  secondaryActionLabel?: string;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[var(--color-border)] bg-[#ffffff] px-4 py-4 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-[var(--color-ink)]">{title}</h3>
        <p className="mt-1 text-[0.6875rem] text-[var(--color-muted-strong)]">{description}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {secondaryActionLabel && onSecondaryAction && (
          <button
            type="button"
            onClick={onSecondaryAction}
            style={{ fontSize: "0.75rem", lineHeight: "1rem" }}
            className={`h-8 rounded-md border border-[var(--color-border-strong)] bg-[#ffffff] px-2.5 font-semibold text-[var(--color-ink)] ${buttonMotionClass}`}
          >
            {secondaryActionLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onAction}
          style={{ fontSize: "0.75rem", lineHeight: "1rem" }}
          className={`h-8 rounded-md bg-[var(--color-ink)] px-2.5 font-semibold text-[var(--color-button-text)] ${buttonMotionClass}`}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function BranchModal({
  canDelete,
  mode,
  value,
  onChange,
  onClose,
  onDelete,
  onSave
}: {
  canDelete: boolean;
  mode: "create" | "edit";
  value: BranchDraft;
  onChange: (value: BranchDraft) => void;
  onClose: () => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  function updateField(field: keyof BranchDraft, nextValue: string) {
    onChange({ ...value, [field]: nextValue });
  }

  return (
    <div
      className="viewport-overlay modal-overlay-enter z-50 grid place-items-end bg-[rgba(32,24,54,0.58)] px-3 py-3 backdrop-blur-sm sm:place-items-center"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-panel-enter modal-scroll-panel w-full max-w-2xl rounded-lg border border-[var(--color-border)] bg-[#ffffff] p-4 shadow-[0_28px_90px_rgba(32,24,54,0.34)] sm:p-5">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
              Multi sede
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              {mode === "edit" ? "Editar sede" : "Nueva sede"}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted-strong)]">
              {mode === "edit"
                ? "Actualizá los datos públicos de esta sede."
                : "Cada sede puede tener sus propios horarios y excepciones."}
            </p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm sm:col-span-2">
            <span className="font-semibold text-[var(--color-muted-strong)]">Nombre de la sede</span>
            <input
              autoFocus
              value={value.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="Ej. Sucursal centro"
              className="h-10 rounded-md border border-[var(--color-border-strong)] bg-white/70 px-3 outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[rgba(253,134,6,0.2)]"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold text-[var(--color-muted-strong)]">Teléfono</span>
            <input
              value={value.phone}
              onChange={(event) => updateField("phone", event.target.value)}
              placeholder="Ej. 1122334455"
              className="h-10 rounded-md border border-[var(--color-border-strong)] bg-white/70 px-3 outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold text-[var(--color-muted-strong)]">WhatsApp</span>
            <input
              value={value.whatsapp}
              onChange={(event) => updateField("whatsapp", event.target.value)}
              placeholder="Ej. 91122334455"
              className="h-10 rounded-md border border-[var(--color-border-strong)] bg-white/70 px-3 outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <label className="grid gap-1.5 text-sm sm:col-span-2">
            <span className="font-semibold text-[var(--color-muted-strong)]">Dirección</span>
            <input
              value={value.address}
              onChange={(event) => updateField("address", event.target.value)}
              placeholder="Ej. Av. Rivadavia 123"
              className="h-10 rounded-md border border-[var(--color-border-strong)] bg-white/70 px-3 outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold text-[var(--color-muted-strong)]">Localidad</span>
            <input
              value={value.city}
              onChange={(event) => updateField("city", event.target.value)}
              placeholder="Ej. Tapiales"
              className="h-10 rounded-md border border-[var(--color-border-strong)] bg-white/70 px-3 outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold text-[var(--color-muted-strong)]">Provincia</span>
            <select
              value={value.province}
              onChange={(event) => updateField("province", event.target.value)}
              className="h-10 rounded-md border border-[var(--color-border-strong)] bg-white/70 px-3 outline-none focus:border-[var(--color-accent)]"
            >
              <option value="">Seleccionar provincia</option>
              {argentinaProvinces.map((province) => (
                <option key={province} value={province}>
                  {province}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[var(--color-border)] pt-4 sm:flex-row sm:justify-between">
          {canDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className={`rounded-md border border-[#efb0aa] px-4 py-2 text-sm font-semibold text-[#a33b32] ${buttonMotionClass}`}
            >
              Eliminar sede
            </button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onClose}
            className={`rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-muted-strong)] ${buttonMotionClass}`}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            className={`rounded-md bg-[var(--color-ink)] px-4 py-2 text-sm font-semibold text-[var(--color-button-text)] ${buttonMotionClass}`}
          >
            {mode === "edit" ? "Guardar cambios" : "Crear sede"}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryModal({
  value,
  onChange,
  onClose,
  onSave
}: {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div
      className="viewport-overlay modal-overlay-enter z-50 grid place-items-end bg-[rgba(32,24,54,0.58)] px-3 py-3 backdrop-blur-sm sm:place-items-center"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="category-modal-title" className="modal-panel-enter modal-scroll-panel w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[#ffffff] p-4 shadow-[0_28px_90px_rgba(32,24,54,0.34)]">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-3">
          <div>
          <h2 id="category-modal-title" className="text-base font-semibold">Nueva categoría</h2>
          <p className="mt-1 text-xs text-[var(--color-muted-strong)]">
            Después vas a poder crear servicios dentro de esta categoría.
          </p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </div>
        <label className="mt-4 grid gap-1.5 text-xs">
          <span className="font-semibold text-[var(--color-muted-strong)]">Nombre</span>
          <input
            autoFocus
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Ej. Cabello, Manos, Canchas"
            className="h-10 rounded-md border border-[var(--color-border-strong)] bg-white/70 px-3 outline-none focus:border-[var(--color-ink)] focus:ring-2 focus:ring-[rgba(32,24,54,0.12)]"
          />
        </label>
        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[var(--color-border)] pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            style={{ fontSize: "0.75rem", lineHeight: "1rem" }}
            className={`h-8 rounded-md border border-[var(--color-border)] px-3 py-1 font-semibold text-[var(--color-muted-strong)] ${buttonMotionClass}`}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            style={{ fontSize: "0.75rem", lineHeight: "1rem" }}
            className={`h-8 rounded-md bg-[var(--color-ink)] px-3 py-1 font-semibold text-[var(--color-button-text)] ${buttonMotionClass}`}
          >
            Crear categoría
          </button>
        </div>
      </div>
    </div>
  );
}

function DuplicateDayModal({
  availability,
  draft,
  onApply,
  onClear,
  onClose,
  onSelectAll,
  onToggleTarget
}: {
  availability: WeeklyAvailabilityDay[];
  draft: NonNullable<DuplicateDayDraft>;
  onApply: () => void;
  onClear: () => void;
  onClose: () => void;
  onSelectAll: () => void;
  onToggleTarget: (index: number) => void;
}) {
  const source = availability[draft.sourceIndex];

  return (
    <div className="viewport-overlay modal-overlay-enter z-50 grid place-items-end bg-[rgba(32,24,54,0.58)] px-3 py-3 backdrop-blur-sm sm:place-items-center">
      <div className="modal-panel-enter modal-scroll-panel w-full max-w-2xl rounded-lg border border-[var(--color-border)] bg-[#ffffff] p-4 shadow-[0_28px_90px_rgba(32,24,54,0.34)] sm:p-5">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-3">
          <div>
            <h2 className="text-lg font-semibold">Duplicar horarios</h2>
            <p className="mt-1 text-sm text-[var(--color-muted-strong)]">
              Copiá la disponibilidad de {source.day} a uno o varios días.
            </p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-white/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[var(--color-ink)]">
              Origen:
            </span>
            <span className="rounded-full bg-[rgba(32,24,54,0.08)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink)]">
              {source.day}
            </span>
            <span className="text-sm text-[var(--color-muted-strong)]">
              {source.enabled ? `${source.slots.length} bloques` : "Inactivo"}
            </span>
          </div>
          <p className="mt-2 text-sm text-[var(--color-muted-strong)]">
            Se copiarán horarios, descanso y estado. Los días destino mantienen su nombre y color.
          </p>
          <button
            type="button"
            onClick={onApply}
            className={`mt-4 w-full rounded-md bg-[var(--color-ink)] px-4 py-2 text-sm font-semibold text-[var(--color-button-text)] ${buttonMotionClass}`}
          >
            Duplicar a los días seleccionados
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            className="rounded-full border border-[var(--color-border-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)] hover:bg-[rgba(253,134,6,0.08)]"
          >
            Seleccionar todos
          </button>
          <button
            type="button"
            onClick={onClear}
            className="rounded-full border border-[var(--color-border-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)] hover:bg-[rgba(253,134,6,0.08)]"
          >
            Limpiar selección
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {availability.map((day, index) => {
            const selected = draft.targetIndices.includes(index);
            const source = index === draft.sourceIndex;

            return (
              <button
                key={day.day}
                type="button"
                disabled={source}
                onClick={() => onToggleTarget(index)}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                  source
                    ? "cursor-not-allowed border-[var(--color-border)] bg-[rgba(32,24,54,0.04)] opacity-60"
                    : selected
                      ? "border-[var(--color-ink)] bg-[rgba(32,24,54,0.06)]"
                      : "border-[var(--color-border)] bg-white/70 hover:border-[var(--color-accent)] hover:bg-[rgba(253,134,6,0.08)]"
                }`}
              >
                <span>
                  <span className="block text-sm font-semibold text-[var(--color-ink)]">
                    {day.day}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--color-muted-strong)]">
                    {day.enabled ? `${day.slots.length} bloques` : "Inactivo"}
                  </span>
                </span>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs font-bold ${
                    selected
                      ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white"
                      : "border-[var(--color-border-strong)] text-transparent"
                  }`}
                >
                  ✓
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[var(--color-border)] pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className={`rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-muted-strong)] ${buttonMotionClass}`}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
