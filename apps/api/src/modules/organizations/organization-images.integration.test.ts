import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ client: null as PrismaClient | null, upload: vi.fn(), remove: vi.fn() }));
vi.mock("../../database/prisma.js", () => ({ get prisma() { return state.client; } }));
vi.mock("../../config/env.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../config/env.js")>();
  return { env: { ...original.env, IMAGE_STORAGE_PROVIDER: "supabase", SUPABASE_URL: "https://test.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "test-only", SUPABASE_STORAGE_BUCKET: "test-images" } };
});
vi.mock("../../lib/image-storage.js", () => ({
  requireImageStorageConfig: vi.fn(), uploadStoredImage: state.upload, removeStoredImage: state.remove
}));

import { env } from "../../config/env.js";
import { deleteOrganizationImage, saveOrganizationImage } from "./organization-images.service.js";
import { processImageCleanup } from "./image-cleanup.service.js";

describe.skipIf(process.env.IMAGE_DB_TESTS !== "1")("image lifecycle with PostgreSQL triggers", () => {
  const schema = `image_test_${randomUUID().replaceAll("-", "")}`;
  const image = { data: Buffer.from("optimized-image"), contentType: "image/webp" };
  let admin: PrismaClient;
  let db: PrismaClient;
  let created = false;

  beforeAll(async () => {
    const url = new URL(env.DATABASE_URL);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Local PostgreSQL required");
    admin = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set("schema", schema);
    // Actual migrations, not db push: the cleanup triggers are part of the contract.
    execFileSync(process.execPath, [createRequire(import.meta.url).resolve("prisma/build/index.js"),
      "migrate", "deploy", "--schema", "prisma/schema.prisma"
    ], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    state.client = db;
  }, 30_000);

  beforeEach(async () => {
    env.IMAGE_STORAGE_PROVIDER = "supabase";
    await db.organization.deleteMany();
    await db.imageStorageObject.deleteMany();
    await db.organization.create({ data: { id: "org-test", name: "Test", slug: "test" } });
    state.upload.mockReset().mockResolvedValue(undefined);
    state.remove.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  it("uploads without retaining bytes and deletes both the reference and remote object", async () => {
    await saveOrganizationImage("org-test", 0, image);
    const saved = await db.organizationGalleryImage.findFirstOrThrow({ include: { storageObject: true } });
    expect(saved.data).toBeNull();
    expect(saved.storageObject?.deleteAfter).toBeNull();
    expect(state.upload).toHaveBeenCalledWith("test-images", saved.storageObject!.path, image.data, image.contentType);
    expect(await processImageCleanup()).toBe(false);
    await deleteOrganizationImage("org-test", 0);
    expect(await db.organizationGalleryImage.count()).toBe(0);
    expect(await processImageCleanup()).toBe(true);
    expect(state.remove).toHaveBeenCalledWith("test-images", saved.storageObject!.path);
    expect(await db.imageStorageObject.count()).toBe(0);
  });

  it("keeps local database uploads and deletion working until Supabase is enabled", async () => {
    env.IMAGE_STORAGE_PROVIDER = "database";
    await saveOrganizationImage("org-test", "logo", image);
    expect((await db.organizationLogo.findFirstOrThrow()).data).toEqual(new Uint8Array(image.data));
    expect(await db.imageStorageObject.count()).toBe(0);
    expect(state.upload).not.toHaveBeenCalled();
    await deleteOrganizationImage("org-test", "logo");
    expect(await db.organizationLogo.count()).toBe(0);
  });

  it("retains a reservation when Storage succeeds but saving the reference rolls back", async () => {
    await db.$executeRawUnsafe(`ALTER TABLE "OrganizationLogo" ADD CONSTRAINT reject_test_upload CHECK ("storageObjectId" IS NULL)`);
    try {
      await expect(saveOrganizationImage("org-test", "logo", image)).rejects.toThrow();
      expect(state.upload).toHaveBeenCalledOnce();
      expect(await db.organizationLogo.count()).toBe(0);
      const queued = await db.imageStorageObject.findFirstOrThrow();
      expect(queued.deleteAfter).not.toBeNull();
      await db.imageStorageObject.update({ where: { id: queued.id }, data: { deleteAfter: new Date(0) } });
      await processImageCleanup();
      expect(await db.imageStorageObject.count()).toBe(0);
    } finally {
      await db.$executeRawUnsafe(`ALTER TABLE "OrganizationLogo" DROP CONSTRAINT reject_test_upload`);
    }
  });

  it("replacement removes only the old object and preserves gallery framing", async () => {
    await saveOrganizationImage("org-test", 1, image);
    await db.organizationGalleryImage.updateMany({ data: { focusX: 25, zoom: 140 } });
    const old = await db.imageStorageObject.findFirstOrThrow();
    await saveOrganizationImage("org-test", 1, image);
    await processImageCleanup();
    expect(state.remove).toHaveBeenCalledWith(old.bucket, old.path);
    expect(await db.organizationGalleryImage.findFirst()).toMatchObject({ focusX: 25, zoom: 140 });
    expect(await db.imageStorageObject.count()).toBe(1);
  });

  it("organization cascade deletion also schedules logo and gallery cleanup", async () => {
    await saveOrganizationImage("org-test", "logo", image);
    await saveOrganizationImage("org-test", 0, image);
    await db.organization.delete({ where: { id: "org-test" } });
    expect(await db.organizationLogo.count()).toBe(0);
    expect(await db.organizationGalleryImage.count()).toBe(0);
    await processImageCleanup();
    await processImageCleanup();
    expect(state.remove).toHaveBeenCalledTimes(2);
    expect(await db.imageStorageObject.count()).toBe(0);
  });

  it("keeps the previous image and a cleanup reservation after upload failure", async () => {
    await saveOrganizationImage("org-test", "logo", image);
    const original = await db.organizationLogo.findFirstOrThrow();
    state.upload.mockRejectedValue(new Error("ambiguous timeout"));
    await expect(saveOrganizationImage("org-test", "logo", image)).rejects.toThrow();
    expect((await db.organizationLogo.findFirstOrThrow()).storageObjectId).toBe(original.storageObjectId);
    await db.imageStorageObject.updateMany({ where: { deleteAfter: { not: null } }, data: { deleteAfter: new Date(0) } });
    await processImageCleanup();
    expect(await db.imageStorageObject.count()).toBe(1);
  });

  it("does not lose cleanup work on Storage failure and removes it after retry", async () => {
    await saveOrganizationImage("org-test", "logo", image);
    await deleteOrganizationImage("org-test", "logo");
    state.remove.mockRejectedValueOnce(new Error("provider unavailable"));
    await processImageCleanup();
    const queued = await db.imageStorageObject.findFirstOrThrow();
    expect(queued.attempts).toBe(1);
    expect(queued.deleteAfter!.getTime()).toBeGreaterThan(Date.now());
    await db.imageStorageObject.update({ where: { id: queued.id }, data: { deleteAfter: new Date(0) } });
    await processImageCleanup();
    expect(await db.imageStorageObject.count()).toBe(0);
  });

  it("rolls back a delete and its cleanup task together", async () => {
    await saveOrganizationImage("org-test", "logo", image);
    await expect(db.$transaction(async (tx) => {
      await tx.organizationLogo.deleteMany();
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    expect(await db.organizationLogo.count()).toBe(1);
    expect(await processImageCleanup()).toBe(false);
  });

  it("migrates legacy bytes but never overwrites a newer or deleted image", async () => {
    const old = await db.organizationLogo.create({ data: { organizationId: "org-test", ...image } });
    expect(await saveOrganizationImage("org-test", "logo", image, old.updatedAt)).toBe(true);
    expect((await db.organizationLogo.findFirstOrThrow()).data).toBeNull();
    expect(await saveOrganizationImage("org-test", "logo", image, old.updatedAt)).toBe(false);
    await deleteOrganizationImage("org-test", "logo");
    expect(await saveOrganizationImage("org-test", "logo", image, old.updatedAt)).toBe(false);
    expect(await db.organizationLogo.count()).toBe(0);
    expect(state.upload).toHaveBeenCalledOnce();
  });

  it("serializes concurrent replacement and retains exactly the current object", async () => {
    await Promise.all([
      saveOrganizationImage("org-test", 0, image),
      saveOrganizationImage("org-test", 0, image)
    ]);
    await Promise.all([processImageCleanup(), processImageCleanup()]);
    expect(await db.organizationGalleryImage.count()).toBe(1);
    expect(await db.imageStorageObject.count()).toBe(1);
    expect(state.remove).toHaveBeenCalledOnce();
  });
});
