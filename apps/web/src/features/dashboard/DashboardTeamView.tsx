import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ModalCloseButton,
  PasswordRequirementField,
  Toast
} from "../../components/ui";
import { ApiError } from "../../lib/api";
import { queryKeys } from "../../lib/query-keys";
import {
  createTeamMember,
  deleteTeamMember,
  getTeamMembers,
  resetTeamMemberPassword,
  updateTeamMember,
  type CreateTeamMemberData,
  type TeamMember
} from "./team.api";
import { getBranches, type Branch } from "./branches.api";
import { useSessionQuery } from "../auth/auth.queries";
import pencilIcon from "../../components/assets/icons/actions/pencil.svg";
import statusCheckIcon from "../../components/assets/icons/status/status-check.svg";

type TeamFormDraft = Pick<
  TeamMember,
  | "firstName"
  | "lastName"
  | "phone"
  | "role"
  | "bookingsEnabled"
  | "visibleInPublicBooking"
  | "hourlyCapacity"
  | "branchIds"
>;

type TeamDraftMap = Record<string, TeamFormDraft>;

const initialCreateDraft: CreateTeamMemberData = {
  firstName: "",
  lastName: "",
  phone: "",
  username: "",
  password: "",
  role: "member",
  bookingsEnabled: true,
  visibleInPublicBooking: true,
  hourlyCapacity: 2,
  branchIds: []
};

function roleLabel(role: TeamMember["role"]) {
  if (role === "owner") return "Propietario";
  if (role === "admin") return "Administrador";
  return "Miembro";
}

function memberInitials(member: TeamMember) {
  const initials = [member.firstName, member.lastName]
    .filter(Boolean)
    .map((part) => part?.trim().charAt(0))
    .join("");
  return (initials || member.username || member.email.charAt(0)).slice(0, 2).toUpperCase();
}

function toDraft(member: TeamMember): TeamFormDraft {
  return {
    firstName: member.firstName ?? "",
    lastName: member.lastName ?? "",
    phone: member.phone ?? "",
    role: member.role,
    bookingsEnabled: member.bookingsEnabled,
    visibleInPublicBooking: member.visibleInPublicBooking,
    hourlyCapacity: member.hourlyCapacity,
    branchIds: member.branchIds
  };
}

function getCreateMemberErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return "No pudimos crear el miembro.";
  if (error.code === "USERNAME_ALREADY_IN_USE") {
    return "Ese usuario ya existe. Elegí otro nombre de usuario.";
  }
  if (error.code === "VALIDATION_ERROR") {
    return "Revisá los datos: el usuario es obligatorio y la contraseña debe tener al menos 12 caracteres.";
  }
  if (error.code === "INVALID_BRANCH") {
    return "Elegí una sede válida para este integrante.";
  }
  if (error.code === "FORBIDDEN") {
    return "No tenés permisos para crear integrantes con ese rol.";
  }
  return error.message || "No pudimos crear el miembro.";
}

export function DashboardTeamView() {
  const queryClient = useQueryClient();
  const sessionQuery = useSessionQuery();
  const teamQuery = useQuery({
    queryKey: queryKeys.teamMembers,
    queryFn: getTeamMembers
  });
  const branchesQuery = useQuery({
    queryKey: queryKeys.organizationBranches,
    queryFn: getBranches
  });
  const [drafts, setDrafts] = useState<TeamDraftMap>({});
  const [createDraft, setCreateDraft] = useState<CreateTeamMemberData>(initialCreateDraft);
  const [savingId, setSavingId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [toast, setToast] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [openMemberMenuId, setOpenMemberMenuId] = useState("");
  const [passwordResetMember, setPasswordResetMember] = useState<TeamMember | null>(null);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  useEffect(() => {
    if (!openMemberMenuId) return;
    function closeMenu(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-team-menu]")) setOpenMemberMenuId("");
    }
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, [openMemberMenuId]);

  useEffect(() => {
    if (!teamQuery.data) return;
    // The editor keeps local drafts until each member is explicitly saved.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrafts(
      Object.fromEntries(teamQuery.data.map((member) => [member.id, toDraft(member)]))
    );
  }, [teamQuery.data]);

  function updateDraft(
    memberId: string,
    field: keyof TeamFormDraft,
    value: string | boolean | number | string[]
  ) {
    setDrafts((current) => ({
      ...current,
      [memberId]: {
        ...current[memberId],
        [field]: value
      }
    }));
  }

  async function saveMember(member: TeamMember) {
    const draft = drafts[member.id];
    if (!draft || savingId) return;
    setSavingId(member.id);
    try {
      const updated = await updateTeamMember(member.id, draft);
      queryClient.setQueryData<TeamMember[]>(queryKeys.teamMembers, (current = []) =>
        current.map((item) =>
          item.id === member.id
            ? {
                ...item,
                ...updated,
                todayAssignedCount: item.todayAssignedCount,
                upcomingAssignedCount: item.upcomingAssignedCount
              }
            : item
        )
      );
      setToast("Miembro actualizado.");
      setEditingId("");
    } catch (error) {
      setToast(
        error instanceof ApiError && error.code === "EMAIL_ALREADY_IN_USE"
          ? "Ese email ya está en uso."
          : "No pudimos guardar este miembro."
      );
    } finally {
      setSavingId("");
    }
  }

  async function handleCreate() {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const created = await createTeamMember(createDraft);
      queryClient.setQueryData<TeamMember[]>(queryKeys.teamMembers, (current = []) => [
        ...current,
        created
      ]);
      setCreateDraft(initialCreateDraft);
      setIsCreateOpen(false);
      setToast(
        created.isNewUser
          ? "Miembro creado con acceso al sistema."
          : "Miembro agregado al equipo."
      );
    } catch (error) {
      setToast(getCreateMemberErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleResetPassword() {
    if (!passwordResetMember || passwordDraft.length < 12 || isResettingPassword) return;
    setIsResettingPassword(true);
    try {
      await resetTeamMemberPassword(passwordResetMember.id, passwordDraft);
      setPasswordResetMember(null);
      setPasswordDraft("");
      setToast("Contraseña actualizada.");
    } catch {
      setToast("No pudimos cambiar la contraseña.");
    } finally {
      setIsResettingPassword(false);
    }
  }

  async function handleDelete(member: TeamMember) {
    if (!window.confirm(`¿Eliminar a ${member.name} del equipo? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteTeamMember(member.id);
      queryClient.setQueryData<TeamMember[]>(queryKeys.teamMembers, (current = []) =>
        current.filter((item) => item.id !== member.id)
      );
      setToast("Miembro eliminado del equipo.");
    } catch {
      setToast("No pudimos eliminar este miembro.");
    }
  }

  const teamMembers = teamQuery.data ?? [];
  const currentRole = sessionQuery.data?.data.organizations?.[0]?.role;

  return (
    <section id="team" className="min-w-0 space-y-3" onClick={() => setOpenMemberMenuId("")}>
      <Card className="overflow-visible">
        <CardHeader>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Tu equipo</h2>
              </div>
              <p className="mt-0.5 text-[0.6875rem] text-[var(--color-muted-strong)]">
                Gestioná datos, permisos y capacidad de cada persona.
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              style={{ fontSize: "0.75rem", lineHeight: "1rem" }}
              className="h-8 px-3 py-1"
              onClick={() => {
                const mainBranchId =
                  branchesQuery.data?.find((branch) => branch.isMain)?.id ??
                  branchesQuery.data?.[0]?.id ??
                  "";
                setCreateDraft({
                  ...initialCreateDraft,
                  branchIds: mainBranchId ? [mainBranchId] : []
                });
                setIsCreateOpen(true);
              }}
            >
              + Agregar integrante
            </Button>
          </div>
        </CardHeader>
        <CardBody className="bg-[#f6f7f9] p-3 sm:p-4">
          <div className="grid gap-2">
            {teamMembers.map((member) => {
              const canEditMember = currentRole === "owner" || member.role !== "owner";
              const canDeleteMember = currentRole === "owner" && member.role !== "owner" && member.userId !== sessionQuery.data?.data.user?.id;
              const branchesLabel = member.branches.length
                ? member.branches.map((branch) => branch.name).join(", ")
                : "Sede principal";
              return (
                <article
                  key={member.id}
                  className="relative overflow-visible rounded-lg border border-[var(--color-border)] bg-[#ffffff]"
                >
                  <div className="grid gap-3 p-3 pr-12 lg:grid-cols-[minmax(280px,1fr)_minmax(320px,1.2fr)] lg:items-center">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-ink)] text-xs font-semibold text-[var(--color-button-text)]">
                        {memberInitials(member)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate text-xs font-semibold text-[var(--color-ink)]">{member.name}</p>
                          <RoleBadge role={member.role} />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-[var(--color-muted-strong)]">
                          {member.username ? `@${member.username}` : member.email}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                          {member.phone || "Sin teléfono cargado"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <StatusLabel active={member.bookingsEnabled} label="Toma turnos" />
                          <StatusLabel active={member.visibleInPublicBooking} label="Visible online" />
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 border-t border-[var(--color-border)] pt-3 lg:border-l lg:border-t-0 lg:py-0 lg:pl-4 lg:pt-0">
                      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                        <TeamInfoLine label="Sede" value={branchesLabel} />
                        <TeamInfoLine label="Capacidad" value={`${member.hourlyCapacity} por hora`} />
                        <TeamInfoLine label="Hoy" value={`${member.todayAssignedCount} turnos`} />
                        <TeamInfoLine label="Próximos" value={`${member.upcomingAssignedCount} turnos`} />
                      </div>
                    </div>
                  </div>
                  {canEditMember ? (
                    <div className="absolute right-3 top-3">
                      <button
                        type="button"
                        data-team-menu
                        title="Opciones"
                        aria-label={`Opciones de ${member.name}`}
                        aria-expanded={openMemberMenuId === member.id}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-transparent text-[var(--color-ink)] transition-colors hover:bg-[#f6f7f9]"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenMemberMenuId((current) => (current === member.id ? "" : member.id));
                        }}
                      >
                        <span className="flex items-center gap-0.5" aria-hidden="true">
                          <span className="h-1 w-1 rounded-full bg-current" />
                          <span className="h-1 w-1 rounded-full bg-current" />
                          <span className="h-1 w-1 rounded-full bg-current" />
                        </span>
                      </button>
                      {openMemberMenuId === member.id && (
                        <div
                          data-team-menu
                          className="absolute right-0 z-30 mt-1.5 w-40 overflow-hidden rounded-md border border-[var(--color-border)] bg-white py-1 text-xs shadow-[0_14px_34px_rgba(32,24,54,0.14)]"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[0.6875rem] font-semibold text-[var(--color-ink)] hover:bg-[#f6f7f9]"
                            onClick={() => {
                              setOpenMemberMenuId("");
                              setEditingId(member.id);
                            }}
                          >
                            <img src={pencilIcon} alt="" aria-hidden="true" className="h-3.5 w-3.5 opacity-70" />
                            Editar
                          </button>
                          {member.role !== "owner" && (
                            <button
                              type="button"
                              className="block w-full px-3 py-1.5 text-left text-[0.6875rem] font-semibold text-[var(--color-ink)] hover:bg-[#f6f7f9]"
                              onClick={() => {
                                setOpenMemberMenuId("");
                                setPasswordResetMember(member);
                                setPasswordDraft("");
                              }}
                            >
                              Cambiar clave
                            </button>
                          )}
                          {canDeleteMember && (
                            <button
                              type="button"
                              className="block w-full px-3 py-1.5 text-left text-[0.6875rem] font-semibold text-[#b42318] hover:bg-[#fff4f2]"
                              onClick={() => {
                                setOpenMemberMenuId("");
                                void handleDelete(member);
                              }}
                            >
                              Eliminar del equipo
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="absolute right-3 top-3 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-center text-xs font-semibold text-[var(--color-muted-strong)]">
                      Solo lectura
                    </span>
                  )}
                </article>
              );
            })}

            {!teamQuery.isPending && (teamQuery.data?.length ?? 0) === 0 && (
              <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] bg-white/50 p-4 text-center">
                <p className="text-sm font-semibold text-[var(--color-ink)]">
                  No hay personas en el equipo todavía
                </p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Agregá integrantes para asignar turnos y permisos.
                </p>
              </div>
            )}
          </div>
        </CardBody>
      </Card>
      {isCreateOpen && (
        <TeamModal
          branches={branchesQuery.data ?? []}
          mode="create"
          title="Agregar integrante"
          description="Definí su usuario, contraseña inicial, rol y sedes."
          draft={createDraft}
          isSaving={isCreating}
          submitLabel="Agregar al equipo"
          onChange={(field, value) =>
            setCreateDraft((current) => ({ ...current, [field]: value }))
          }
          onClose={() => {
            if (!isCreating) setIsCreateOpen(false);
          }}
          onSubmit={() => void handleCreate()}
        />
      )}
      {editingId && teamQuery.data?.some((member) => member.id === editingId) && (
        <TeamModal
          branches={branchesQuery.data ?? []}
          mode="edit"
          title="Editar integrante"
          description="Actualizá sus datos, permisos y capacidad."
          draft={drafts[editingId] ?? toDraft(teamQuery.data.find((member) => member.id === editingId)!)}
          isSaving={savingId === editingId}
          submitLabel="Guardar cambios"
          onChange={(field, value) => {
            if (field === "password" || field === "username") return;
            updateDraft(editingId, field, value);
          }}
          onClose={() => {
            if (!savingId) setEditingId("");
          }}
          onSubmit={() =>
            void saveMember(teamQuery.data.find((member) => member.id === editingId)!)
          }
        />
      )}
      {passwordResetMember && (
        <PasswordResetModal
          member={passwordResetMember}
          password={passwordDraft}
          isSaving={isResettingPassword}
          onChange={setPasswordDraft}
          onClose={() => {
            if (!isResettingPassword) {
              setPasswordResetMember(null);
              setPasswordDraft("");
            }
          }}
          onSubmit={() => void handleResetPassword()}
        />
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast("")} />}
    </section>
  );
}

function PasswordResetModal({
  isSaving,
  member,
  onChange,
  onClose,
  onSubmit,
  password
}: {
  isSaving: boolean;
  member: TeamMember;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  password: string;
}) {
  return createPortal(
    <div className="viewport-overlay modal-overlay-enter z-50 grid place-items-end bg-[rgba(32,24,54,0.58)] p-3 backdrop-blur-sm sm:place-items-center">
      <section
        role="dialog"
        aria-modal="true"
        className="modal-panel-enter modal-scroll-panel w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[#ffffff] shadow-[0_28px_90px_rgba(32,24,54,0.34)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] p-4">
          <div>
            <h2 className="text-lg font-semibold">Cambiar contraseña</h2>
            <p className="mt-1 text-sm text-[var(--color-muted-strong)]">
              Nuevo acceso para {member.name}.
            </p>
          </div>
          <ModalCloseButton disabled={isSaving} onClick={onClose} />
        </div>
        <div className="p-4">
          <PasswordRequirementField
            label="Nueva contraseña"
            value={password}
            onChange={(event) => onChange(event.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-border)] p-4 sm:flex-row sm:justify-end">
          <Button type="button" disabled={isSaving} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={isSaving || password.length < 12}
            onClick={onSubmit}
          >
            {isSaving ? "Guardando..." : "Guardar contraseña"}
          </Button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function TeamModal({
  branches,
  description,
  draft,
  isSaving,
  mode,
  onChange,
  onClose,
  onSubmit,
  submitLabel,
  title
}: {
  branches: Branch[];
  description: string;
  draft: TeamFormDraft | CreateTeamMemberData;
  isSaving: boolean;
  mode: "create" | "edit";
  onChange: (
    field: keyof TeamFormDraft | keyof CreateTeamMemberData,
    value: string | boolean | number | string[]
  ) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  title: string;
}) {
  const isInvalid =
    !(draft.firstName ?? "").trim() ||
    !(draft.lastName ?? "").trim() ||
    !(draft.phone ?? "").trim() ||
    (mode === "create" &&
      (!("username" in draft) ||
        draft.username.trim().length < 3 ||
        !("password" in draft) ||
        draft.password.length < 12)) ||
    draft.branchIds.length === 0;

  function toggleBranch(branchId: string) {
    const next = draft.branchIds.includes(branchId)
      ? draft.branchIds.filter((id) => id !== branchId)
      : [...draft.branchIds, branchId];
    onChange("branchIds", next);
  }

  return createPortal(
    <div
      className="viewport-overlay modal-overlay-enter z-50 grid place-items-end bg-[rgba(32,24,54,0.58)] p-3 backdrop-blur-sm sm:place-items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (!isSaving && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-modal-title"
        className="modal-panel-enter modal-scroll-panel w-full max-w-2xl rounded-lg border border-[var(--color-border)] bg-[#ffffff] shadow-[0_28px_90px_rgba(32,24,54,0.34)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] p-4">
          <div>
            <h2 id="team-modal-title" className="text-base font-semibold">
              {title}
            </h2>
            <p className="mt-1 text-xs text-[var(--color-muted-strong)]">
              {description}
            </p>
          </div>
          <ModalCloseButton disabled={isSaving} onClick={onClose} />
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field
            label="Nombre"
            value={draft.firstName ?? ""}
            onChange={(value) => onChange("firstName", value)}
          />
          <Field
            label="Apellido"
            value={draft.lastName ?? ""}
            onChange={(value) => onChange("lastName", value)}
          />
          <Field
            label="Teléfono"
            value={draft.phone ?? ""}
            onChange={(value) => onChange("phone", value)}
          />
          {mode === "create" && "username" in draft && "password" in draft && (
            <>
              <Field
                label="Usuario de acceso"
                value={draft.username}
                onChange={(value) => onChange("username", value)}
                helper="Sin espacios. Ej: juan.ramos"
              />
              <PasswordRequirementField
                label="Contraseña inicial"
                value={draft.password}
                onChange={(event) => onChange("password", event.target.value)}
                autoComplete="new-password"
              />
            </>
          )}
          <div className="sm:col-span-2">
            <p className="border-t border-[var(--color-border)] pt-4 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-muted-strong)]">
              Acceso y agenda
            </p>
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <p className="text-xs font-medium text-[var(--color-muted-strong)]">
              Sedes donde atiende
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {branches.map((branch) => {
                const checked = draft.branchIds.includes(branch.id);
                return (
                  <button
                    key={branch.id}
                    type="button"
                    onClick={() => toggleBranch(branch.id)}
                    className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition ${
                      checked
                        ? "border-[var(--color-ink)] bg-[rgba(32,24,54,0.06)] text-[var(--color-ink)]"
                        : "border-[var(--color-border)] bg-white/60 text-[var(--color-muted-strong)]"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{branch.name}</span>
                      {branch.isMain && (
                        <span className="text-xs text-[var(--color-muted)]">Principal</span>
                      )}
                    </span>
                    <span
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-xs font-bold ${
                        checked
                          ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white"
                          : "border-[var(--color-border-strong)] text-transparent"
                      }`}
                    >
                      {checked && <img src={statusCheckIcon} alt="" aria-hidden="true" className="h-3.5 w-3.5 invert" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <SelectField
            label="Rol en el negocio"
            value={draft.role}
            onChange={(value) => onChange("role", value)}
            options={
              mode === "create"
                ? [
                    ["admin", "Administrador"],
                    ["member", "Miembro"]
                  ]
                : [
                    ["owner", "Propietario"],
                    ["admin", "Administrador"],
                    ["member", "Miembro"]
                  ]
            }
          />
          <Field
            label="Turnos por hora"
            type="number"
            value={String(draft.hourlyCapacity)}
            onChange={(value) => onChange("hourlyCapacity", Number(value) || 1)}
          />
          <ToggleField
            label="Toma turnos"
            checked={draft.bookingsEnabled}
            onChange={(checked) => onChange("bookingsEnabled", checked)}
          />
          <ToggleField
            label="Visible online"
            checked={draft.visibleInPublicBooking}
            onChange={(checked) => onChange("visibleInPublicBooking", checked)}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-border)] p-4 sm:flex-row sm:justify-end">
          <Button type="button" disabled={isSaving} onClick={onClose} style={{ fontSize: "0.75rem", lineHeight: "1rem" }} className="h-8 px-3 py-1">
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={isSaving || isInvalid}
            onClick={onSubmit}
            style={{ fontSize: "0.75rem", lineHeight: "1rem" }}
            className="h-8 px-3 py-1"
          >
            {isSaving ? "Guardando..." : submitLabel}
          </Button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function StatusLabel({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
        active
          ? "bg-[rgba(64,145,91,0.12)] text-[#347548]"
          : "bg-[rgba(32,24,54,0.07)] text-[var(--color-muted-strong)]"
      }`}
    >
      {active ? label : `${label}: No`}
    </span>
  );
}

function RoleBadge({ role }: { role: TeamMember["role"] }) {
  const isOwner = role === "owner";
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] ${
        isOwner
          ? "bg-[rgba(253,134,6,0.09)] text-[var(--color-accent)]"
          : "bg-[rgba(32,24,54,0.08)] text-[var(--color-ink)]"
      }`}
    >
      {roleLabel(role)}
    </span>
  );
}

function TeamInfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
        {label}
      </p>
      <p className="mt-0.5 truncate text-xs font-semibold text-[var(--color-ink)]" title={value}>
        {value}
      </p>
    </div>
  );
}

function Field({
  helper,
  label,
  onChange,
  type = "text",
  value
}: {
  helper?: string;
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm text-[var(--color-muted-strong)]">
      <span className="text-xs font-medium">{label}</span>
      <input
        type={type}
        min={type === "number" ? 1 : undefined}
        max={type === "number" ? 100 : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-0 rounded-md border border-[var(--color-border-strong)] bg-white/70 px-3 text-[var(--color-ink)] outline-none transition-colors focus:border-[var(--color-ink)] focus:ring-2 focus:ring-[rgba(32,24,54,0.08)]"
      />
      {helper && <span className="text-xs text-[var(--color-muted)]">{helper}</span>}
    </label>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: [string, string][];
  value: string;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm text-[var(--color-muted-strong)]">
      <span className="text-xs font-medium">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-0 rounded-md border border-[var(--color-border-strong)] bg-white/70 px-3 text-[var(--color-ink)] outline-none transition-colors focus:border-[var(--color-ink)] focus:ring-2 focus:ring-[rgba(32,24,54,0.08)]"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleField({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-white/60 px-3 py-1.5 text-sm text-[var(--color-ink)]">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-accent)] ${
          checked ? "bg-[var(--color-ink)]" : "bg-[rgba(32,24,54,0.16)]"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </span>
    </label>
  );
}
