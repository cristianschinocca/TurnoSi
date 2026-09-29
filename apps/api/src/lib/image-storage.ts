import { env } from "../config/env.js";
import { AppError } from "./app-error.js";

export function requireImageStorageConfig() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError(503, "IMAGE_STORAGE_NOT_CONFIGURED", "Image storage is not configured");
  }
  return { url: env.SUPABASE_URL.replace(/\/$/, ""), key: env.SUPABASE_SERVICE_ROLE_KEY };
}

async function storageRequest(path: string, init: RequestInit = {}) {
  const config = requireImageStorageConfig();
  try {
    const response = await fetch(`${config.url}/storage/v1/${path}`, {
      ...init,
      headers: { ...init.headers, apikey: config.key, Authorization: `Bearer ${config.key}` },
      signal: AbortSignal.timeout(8_000),
      redirect: "error"
    });
    if (!response.ok) throw new Error("Storage request failed");
    return response;
  } catch {
    throw new AppError(502, "IMAGE_STORAGE_UNAVAILABLE", "Image storage is temporarily unavailable");
  }
}

function objectPath(bucket: string, path: string) {
  return `${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export async function uploadStoredImage(bucket: string, path: string, data: Uint8Array, contentType: string) {
  await storageRequest(`object/${objectPath(bucket, path)}`, {
    method: "POST",
    headers: { "Content-Type": contentType, "x-upsert": "false" },
    body: new Uint8Array(data)
  });
}

export async function downloadStoredImage(bucket: string, path: string) {
  const response = await storageRequest(`object/authenticated/${objectPath(bucket, path)}`);
  try {
    return Buffer.from(await response.arrayBuffer());
  } catch {
    throw new AppError(502, "IMAGE_STORAGE_UNAVAILABLE", "Image storage is temporarily unavailable");
  }
}

export async function removeStoredImage(bucket: string, path: string) {
  // Bulk removal is idempotent: an already absent object is successful too.
  await storageRequest(`object/${encodeURIComponent(bucket)}`, {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [path] })
  });
}
