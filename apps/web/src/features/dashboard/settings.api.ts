import { ApiError, apiRequest, getApiUrl } from "../../lib/api";
import type {
  OrganizationSettings,
  OrganizationSettingsInput,
  OrganizationSettingsSectionData,
  OrganizationSettingsSection
} from "./settings.types";

export async function getOrganizationSettings() {
  const response = await apiRequest<{ success: true; data: OrganizationSettings }>(
    "/api/v1/organizations/current/settings"
  );
  return response.data;
}

export async function getOrganizationSettingsSection(
  section: OrganizationSettingsSection
) {
  const response = await apiRequest<{
    success: true;
    data: OrganizationSettingsSectionData;
  }>(`/api/v1/organizations/current/settings/${section}`);
  return response.data;
}

export function updateOrganizationSettings(data: OrganizationSettingsInput) {
  return apiRequest<{ success: true; data: { onboardingCompleted: true } }>(
    "/api/v1/organizations/current/settings",
    { method: "PATCH", body: JSON.stringify(data) }
  );
}

export function updateOrganizationSettingsSection(
  section: OrganizationSettingsSection,
  data: OrganizationSettingsInput
) {
  return apiRequest<{ success: true; data: { id: string } }>(
    `/api/v1/organizations/current/settings/${section}`,
    { method: "PATCH", body: JSON.stringify(data) }
  );
}

export function uploadOrganizationLogo(file: File) {
  return apiRequest<{ success: true; data: { uploaded: true } }>(
    "/api/v1/organizations/current/logo",
    {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file
    }
  );
}

export function deleteOrganizationLogo() {
  return apiRequest<{ success: true; data: { deleted: true } }>(
    "/api/v1/organizations/current/logo", { method: "DELETE" }
  );
}

export type GalleryUploadResult = {
  uploaded: true;
  originalBytes: number;
  optimizedBytes: number;
  contentType: string;
};

export function uploadOrganizationGalleryImage(
  slot: 0 | 1,
  file: File,
  onProgress?: (progress: number) => void
) {
  return new Promise<{ success: true; data: GalleryUploadResult }>(
    (resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("PUT", getApiUrl(`/api/v1/organizations/current/gallery/${slot}`));
      request.withCredentials = true;
      request.setRequestHeader("Content-Type", file.type);

      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        onProgress?.(Math.min(95, Math.round((event.loaded / event.total) * 95)));
      };

      request.onload = () => {
        try {
          const body = JSON.parse(request.responseText || "{}") as
            | { success: true; data: GalleryUploadResult }
            | { success: false; message?: string; code?: string };

          if (request.status >= 200 && request.status < 300 && body.success) {
            onProgress?.(100);
            resolve(body);
            return;
          }

          reject(
            new ApiError(
              body.success === false ? body.message ?? "Request failed" : "Request failed",
              body.success === false ? body.code ?? "REQUEST_FAILED" : "REQUEST_FAILED",
              request.status
            )
          );
        } catch {
          reject(new ApiError("Request failed", "REQUEST_FAILED", request.status));
        }
      };

      request.onerror = () => {
        reject(new ApiError("Network error", "NETWORK_ERROR", request.status));
      };

      request.send(file);
    }
  );
}

export function deleteOrganizationGalleryImage(slot: 0 | 1) {
  return apiRequest<{ success: true; data: { deleted: true } }>(
    `/api/v1/organizations/current/gallery/${slot}`,
    { method: "DELETE" }
  );
}

export function completeOnboarding() {
  return apiRequest<{ success: true; data: { onboardingCompleted: true } }>(
    "/api/v1/organizations/current/complete-onboarding",
    { method: "POST" }
  );
}

export function deleteCurrentOrganization(password: string) {
  return apiRequest<{ success: true; data: { deleted: true } }>(
    "/api/v1/organizations/current",
    {
      method: "DELETE",
      body: JSON.stringify({ password })
    }
  );
}
