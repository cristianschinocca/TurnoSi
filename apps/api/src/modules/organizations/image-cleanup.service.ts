import type { ImageStorageObject } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";
import { removeStoredImage } from "../../lib/image-storage.js";
import { logger } from "../../lib/logger.js";

export async function processImageCleanup() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return false;
  return prisma.$transaction(async (tx) => {
    // Upload and cleanup lock the same reservation; multiple workers skip busy rows.
    const [object] = await tx.$queryRaw<ImageStorageObject[]>`
      SELECT * FROM "ImageStorageObject" WHERE "deleteAfter" <= CURRENT_TIMESTAMP
      ORDER BY "deleteAfter", "id" LIMIT 1 FOR UPDATE SKIP LOCKED`;
    if (!object) return false;
    const attached = await tx.imageStorageObject.findUnique({
      where: { id: object.id }, select: { logo: true, galleryImage: true }
    });
    if (attached?.logo || attached?.galleryImage) {
      await tx.imageStorageObject.update({ where: { id: object.id }, data: { deleteAfter: null } });
      return true;
    }
    try {
      await removeStoredImage(object.bucket, object.path);
    } catch {
      await tx.imageStorageObject.update({ where: { id: object.id }, data: {
        attempts: { increment: 1 },
        deleteAfter: new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** Math.min(object.attempts, 7)))
      } });
      logger.warn("image storage cleanup deferred", { objectId: object.id });
      return true;
    }
    // Remove the durable reservation only after Storage confirms removal.
    await tx.imageStorageObject.delete({ where: { id: object.id } });
    return true;
  }, { timeout: 20_000 });
}

export function startImageCleanupWorker() {
  let stopped = false;
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const run = async () => {
    try { await processImageCleanup(); }
    catch { logger.error("image storage cleanup interrupted"); }
    if (!stopped) timer = setTimeout(tick, 1_000);
  };
  const tick = () => { running = run(); };
  timer = setTimeout(tick, 1_000);
  return async () => { stopped = true; clearTimeout(timer); await running; };
}
