import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

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
import { useSessionQuery } from "../auth/auth.queries";
import type { AuthResult } from "../auth/auth.types";
import { queryKeys } from "../../lib/query-keys";
import { changeAccountPassword, updateAccountProfile } from "./account.api";
import pencilIcon from "../../components/assets/icons/actions/pencil.svg";

export function AccountAccessSettings({
  highlightChanges = false,
  onDirtyChange
}: {
  highlightChanges?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState({ firstName: "", lastName: "", email: "" });
  const [savedProfile, setSavedProfile] = useState({ firstName: "", lastName: "", email: "" });
  const [profileMessage, setProfileMessage] = useState("");
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "" });
  const [passwordMessage, setPasswordMessage] = useState("");
  const [toast, setToast] = useState("");
  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const sessionQuery = useSessionQuery();
  const queryClient = useQueryClient();
  const hasProfileChanges =
    JSON.stringify(profile) !== JSON.stringify(savedProfile);

  useEffect(() => {
    if (sessionQuery.data) {
      const { data } = sessionQuery.data;
      const loadedProfile = {
        firstName: data.user.firstName ?? "",
        lastName: data.user.lastName ?? "",
        email: data.user.email
      };
      // The editable draft intentionally snapshots server state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfile(loadedProfile);
      setSavedProfile(loadedProfile);
      setIsProfileEditing(false);
    }
  }, [sessionQuery.data]);

  useEffect(() => {
    onDirtyChange?.(hasProfileChanges);
    return () => onDirtyChange?.(false);
  }, [hasProfileChanges, onDirtyChange]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSavingProfile) return;
    if (
      profile.firstName === savedProfile.firstName &&
      profile.lastName === savedProfile.lastName &&
      profile.email === savedProfile.email
    ) {
      setToast("No hay cambios por guardar.");
      return;
    }
    setProfileMessage("");
    setIsSavingProfile(true);
    try {
      const response = await updateAccountProfile({
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email
      });
      setSavedProfile(profile);
      queryClient.setQueryData<AuthResult>(queryKeys.session, (current) =>
        current
          ? {
              ...current,
              data: { ...current.data, user: response.data }
            }
          : current
      );
      setProfileMessage("");
      setToast("✓ Cambios guardados.");
      setIsProfileEditing(false);
    } catch (error) {
      setProfileMessage(
        error instanceof ApiError && error.code === "EMAIL_ALREADY_IN_USE"
          ? "Ese email ya está registrado."
          : "No pudimos actualizar los datos."
      );
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSavingPassword) return;
    if (!passwords.currentPassword) {
      setPasswordMessage("Ingresá tu contraseña actual.");
      return;
    }
    if (!passwords.newPassword) {
      setPasswordMessage("Ingresá una contraseña nueva.");
      return;
    }
    if (passwords.newPassword.length < 12) {
      setPasswordMessage("La contraseña nueva debe tener al menos 12 caracteres.");
      return;
    }
    if (passwords.currentPassword.length > 128 || passwords.newPassword.length > 128) {
      setPasswordMessage("La contraseña no puede superar los 128 caracteres.");
      return;
    }
    if (passwords.currentPassword === passwords.newPassword) {
      setPasswordMessage("La contraseña nueva debe ser diferente de la actual.");
      return;
    }
    setPasswordMessage("");
    setIsSavingPassword(true);
    try {
      await changeAccountPassword(passwords);
      queryClient.clear();
      navigate("/login", { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "INVALID_CURRENT_PASSWORD") {
          setPasswordMessage("La contraseña actual no es correcta.");
        } else if (error.code === "PASSWORD_UNCHANGED") {
          setPasswordMessage("La contraseña nueva debe ser diferente de la actual.");
        } else if (error.code === "VALIDATION_ERROR") {
          setPasswordMessage("Revisá que ambas contraseñas sean válidas.");
        } else {
          setPasswordMessage("No pudimos cambiar la contraseña.");
        }
      } else {
        setPasswordMessage("No pudimos cambiar la contraseña.");
      }
    } finally {
      setIsSavingPassword(false);
    }
  }

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Cuenta y acceso</h2>
            <p className="mt-1 text-[0.6875rem] text-[var(--color-muted-strong)]">
              Estos cambios se guardan independientemente del negocio.
            </p>
          </div>
          {!isProfileEditing && (
            <Button
              type="button"
              style={{ fontSize: "0.9375rem", lineHeight: "1rem" }}
              className="group h-8 gap-1.5 px-3 py-1 text-xs"
              onClick={() => setIsProfileEditing(true)}
            >
              <img
                src={pencilIcon}
                alt=""
                aria-hidden="true"
                className="h-4 w-4 opacity-75 transition duration-200 group-hover:-rotate-6 group-hover:scale-110"
              />
              Editar datos
            </Button>
          )}
        </div>
      </CardHeader>
      <CardBody className="space-y-3 p-3 sm:p-4">
        <form
          onSubmit={saveProfile}
          className="grid max-w-4xl gap-3 rounded-xl border border-[var(--color-border)] bg-[#ffffff] p-3 md:grid-cols-2 sm:p-4 xl:grid-cols-[minmax(0,240px)_minmax(0,240px)_minmax(0,320px)]"
        >
          <AccountField
            label="Nombre del propietario"
            placeholder="Ej: Laura"
            disabled={!isProfileEditing}
            highlightChanges={highlightChanges}
            savedValue={savedProfile.firstName}
            value={profile.firstName}
            onChange={(firstName) => setProfile((current) => ({ ...current, firstName }))}
          />
          <AccountField
            label="Apellido del propietario"
            placeholder="Ej: Pérez"
            disabled={!isProfileEditing}
            highlightChanges={highlightChanges}
            savedValue={savedProfile.lastName}
            value={profile.lastName}
            onChange={(lastName) => setProfile((current) => ({ ...current, lastName }))}
          />
          <AccountField
            label="Email de acceso"
            placeholder="Ej: propietario@negocio.com"
            disabled={!isProfileEditing}
            highlightChanges={highlightChanges}
            savedValue={savedProfile.email}
            type="email"
            value={profile.email}
            onChange={(email) => setProfile((current) => ({ ...current, email }))}
          />
          {isProfileEditing && (
            <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[#ffffff] px-3 py-3 md:col-span-2 xl:col-span-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[0.6875rem] text-[var(--color-muted-strong)]">
                Guardá los cambios para actualizar tu acceso.
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  disabled={isSavingProfile}
                  style={{ fontSize: "0.9375rem", lineHeight: "1rem" }}
                  className="h-8 px-3 py-1 text-xs"
                  onClick={() => {
                    setProfile(savedProfile);
                    setIsProfileEditing(false);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSavingProfile}
                  style={{ fontSize: "0.9375rem", lineHeight: "1rem" }}
                  className="h-8 bg-[var(--color-ink)] px-3 py-1 text-xs text-white"
                >
                  {isSavingProfile ? "Guardando..." : "Guardar cuenta"}
                </Button>
              </div>
              {profileMessage && (
                <p className="text-sm text-[var(--color-muted-strong)] sm:hidden">
                  {profileMessage}
                </p>
              )}
            </div>
          )}
        </form>

        <section className="max-w-4xl rounded-xl border border-[var(--color-border)] bg-[#ffffff] p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Seguridad</p>
              <p className="mt-1 text-[0.6875rem] text-[var(--color-muted-strong)]">
                Actualizá tu contraseña solo cuando necesites reforzar el acceso.
              </p>
            </div>
            <Button
              type="button"
              style={{ fontSize: "0.9375rem", lineHeight: "1rem" }}
              className="h-8 w-full px-3 py-1 text-xs sm:w-auto"
              onClick={() => {
                setPasswordMessage("");
                setShowPasswordModal(true);
              }}
            >
              Cambiar contraseña
            </Button>
          </div>
        </section>
      </CardBody>
      {toast && <Toast message={toast} onDismiss={() => setToast("")} />}
    </Card>
    {showPasswordModal && (
      <div className="viewport-overlay modal-overlay-enter z-[80] grid place-items-end bg-[rgba(32,24,54,0.58)] p-3 backdrop-blur-sm sm:place-items-center">
        <form
          noValidate
          onSubmit={savePassword}
          role="dialog"
          aria-modal="true"
          aria-labelledby="password-modal-title"
          className="modal-panel-enter modal-scroll-panel w-full max-w-lg rounded-xl border border-[var(--color-border)] bg-[#ffffff] shadow-[0_28px_90px_rgba(32,24,54,0.34)]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent)]">
                Seguridad
              </p>
              <h2 id="password-modal-title" className="mt-2 text-xl font-semibold">
                Cambiar contraseña
              </h2>
              <p className="mt-1 text-sm text-[var(--color-muted-strong)]">
                Al confirmar, se cerrarán todas las sesiones activas.
              </p>
            </div>
            <ModalCloseButton
              disabled={isSavingPassword}
              onClick={() => {
                setShowPasswordModal(false);
                setPasswordMessage("");
                setPasswords({ currentPassword: "", newPassword: "" });
              }}
            />
          </div>
          <div className="grid gap-4 p-5">
            <AccountField
              label="Contraseña actual"
              placeholder="Ingresá tu contraseña actual"
              type="password"
              autoComplete="current-password"
              value={passwords.currentPassword}
              onChange={(currentPassword) => {
                setPasswordMessage("");
                setPasswords((current) => ({ ...current, currentPassword }));
              }}
            />
            <PasswordRequirementField
              label="Nueva contraseña"
              placeholder="Mínimo 12 caracteres"
              autoComplete="new-password"
              minLength={12}
              value={passwords.newPassword}
              onChange={(event) => {
                setPasswordMessage("");
                setPasswords((current) => ({
                  ...current,
                  newPassword: event.target.value
                }));
              }}
            />
            {passwordMessage && <p className="text-sm text-[#b42318]">{passwordMessage}</p>}
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-border)] p-5 sm:flex-row sm:justify-end">
            <Button
              type="button"
              disabled={isSavingPassword}
              onClick={() => {
                setShowPasswordModal(false);
                setPasswordMessage("");
                setPasswords({ currentPassword: "", newPassword: "" });
              }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSavingPassword}
              className="bg-[var(--color-ink)] text-white"
            >
              {isSavingPassword ? "Cambiando..." : "Guardar contraseña"}
            </Button>
          </div>
        </form>
      </div>
    )}
    </>
  );
}

function AccountField({
  label,
  autoComplete,
  disabled,
  highlightChanges = false,
  minLength,
  onChange,
  placeholder,
  savedValue,
  type = "text",
  value
}: {
  label: string;
  autoComplete?: string;
  disabled?: boolean;
  highlightChanges?: boolean;
  minLength?: number;
  onChange: (value: string) => void;
  placeholder?: string;
  savedValue?: string;
  type?: string;
  value: string;
}) {
  const changed =
    highlightChanges && savedValue !== undefined && value !== savedValue;

  return (
    <label className="relative grid gap-1 text-xs">
      <span className="font-semibold text-[var(--color-muted-strong)]">{label}</span>
      <input
        required
        disabled={disabled}
        type={type}
        value={value}
        minLength={minLength}
        placeholder={placeholder}
        autoComplete={autoComplete ?? (type === "email" ? "email" : "name")}
        onChange={(event) => onChange(event.target.value)}
        className={`h-9 rounded-md border bg-[#ffffff] px-3 text-xs outline-none transition placeholder:text-[var(--color-muted)] hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:bg-[#ffffff] focus:ring-2 ${
          changed
            ? "border-[#d65a50] focus:border-[#d65a50] focus:ring-[rgba(214,90,80,0.16)]"
            : "border-[var(--color-border-strong)] focus:border-[var(--color-accent)] focus:ring-[rgba(253,134,6,0.2)]"
        }`}
      />
    </label>
  );
}
