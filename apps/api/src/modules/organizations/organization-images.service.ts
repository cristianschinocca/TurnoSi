import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../lib/app-error.js";
import { requireImageStorageConfig, uploadStoredImage } from "../../lib/image-storage.js";

type ImageInput = { data: Uint8Array; contentType: string };

export async function saveOrganizationImage(
  organizationId: string,
  slot: 0 | 1 | "logo",
  image: ImageInput,
  // Migration must not overwrite an image edited/deleted since it was read.
  expectedUpdatedAt?: Date
) {
  const useStorage = env.IMAGE_STORAGE_PROVIDER === "supabase";
  if (useStorage) requireImageStorageConfig();
  const object = useStorage ? await prisma.imageStorageObject.create({ data: {
    bucket: env.SUPABASE_STORAGE_BUCKET,
    path: `${organizationId}/${slot}/${randomUUID()}`,
    // Reserved before uploading: a crash/rollback cannot lose the cleanup record.
    deleteAfter: new Date(Date.now() + 60 * 60 * 1000)
  } }) : null;

  return prisma.$transaction(async (tx) => {
    const organizations = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`;
    if (!organizations.length) throw new AppError(404, "NOT_FOUND", "Business not found");
    if (expectedUpdatedAt) {
      const current = slot === "logo"
        ? await tx.organizationLogo.findUnique({ where: { organizationId } })
        : await tx.organizationGalleryImage.findUnique({ where: { organizationId_slot: { organizationId, slot } } });
      if (!current?.data || current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) return false;
    }
    if (object) {
      const objects = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "ImageStorageObject" WHERE "id" = ${object.id} FOR UPDATE`;
      if (!objects.length) throw new AppError(409, "IMAGE_UPLOAD_EXPIRED", "Please upload the image again");
      await uploadStoredImage(object.bucket, object.path, image.data, image.contentType);
    }
    const data = {
      contentType: image.contentType,
      data: object ? null : new Uint8Array(image.data),
      storageObjectId: object?.id ?? null
    };
    if (slot === "logo") {
      await tx.organizationLogo.upsert({
        where: { organizationId }, create: { organizationId, ...data }, update: data
      });
    } else {
      await tx.organizationGalleryImage.upsert({
        where: { organizationId_slot: { organizationId, slot } },
        create: { organizationId, slot, ...data }, update: data
      });
    }
    if (object) await tx.imageStorageObject.update({ where: { id: object.id }, data: { deleteAfter: null } });
    return true;
  }, { timeout: 20_000 });
}

export async function deleteOrganizationImage(organizationId: string, slot: 0 | 1 | "logo") {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`;
    // PostgreSQL triggers also schedule Storage cleanup, atomically with deletion.
    if (slot === "logo") await tx.organizationLogo.deleteMany({ where: { organizationId } });
    else await tx.organizationGalleryImage.deleteMany({ where: { organizationId, slot } });
  });
}
