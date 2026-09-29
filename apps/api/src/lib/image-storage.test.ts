import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({ env: {
  SUPABASE_URL: "https://storage.example.test", SUPABASE_SERVICE_ROLE_KEY: "server-test-key"
} }));
import { downloadStoredImage, removeStoredImage, uploadStoredImage } from "./image-storage.js";

afterEach(() => vi.unstubAllGlobals());

describe("Supabase image storage HTTP contract", () => {
  it("uploads binary bytes with server authorization and without overwriting objects", async () => {
    const fetch = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await uploadStoredImage("images", "org/logo/id", Buffer.from("image"), "image/webp");
    expect(fetch).toHaveBeenCalledWith("https://storage.example.test/storage/v1/object/images/org/logo/id",
      expect.objectContaining({ method: "POST", redirect: "error", headers: {
        "Content-Type": "image/webp", "x-upsert": "false", apikey: "server-test-key", Authorization: "Bearer server-test-key"
      }, body: new Uint8Array(Buffer.from("image")) }));
  });

  it("downloads private objects through the backend", async () => {
    const fetch = vi.fn(async () => new Response("image"));
    vi.stubGlobal("fetch", fetch);
    expect(await downloadStoredImage("images", "org/logo/id")).toEqual(Buffer.from("image"));
    expect(fetch).toHaveBeenCalledWith(
      "https://storage.example.test/storage/v1/object/authenticated/images/org/logo/id", expect.any(Object));
  });

  it("deletes using the Storage API, including an already absent object", async () => {
    const fetch = vi.fn(async () => new Response("[]"));
    vi.stubGlobal("fetch", fetch);
    await removeStoredImage("images", "org/logo/id");
    expect(fetch).toHaveBeenCalledWith("https://storage.example.test/storage/v1/object/images",
      expect.objectContaining({ method: "DELETE", body: JSON.stringify({ prefixes: ["org/logo/id"] }) }));
  });

  it("sanitizes provider errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("secret-provider-details", { status: 403 })));
    await expect(removeStoredImage("images", "org/logo/id")).rejects.toMatchObject({
      code: "IMAGE_STORAGE_UNAVAILABLE", message: "Image storage is temporarily unavailable"
    });
  });
});
