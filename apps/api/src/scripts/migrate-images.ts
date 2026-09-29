import { env } from "../config/env.js";
import { prisma } from "../database/prisma.js";
import { requireImageStorageConfig } from "../lib/image-storage.js";
import { saveOrganizationImage } from "../modules/organizations/organization-images.service.js";

try {
  requireImageStorageConfig();
  if (env.IMAGE_STORAGE_PROVIDER !== "supabase") throw new Error("Enable Supabase first");
  let migrated = 0;
  // One image at a time; safe to restart and does not load every byte into memory.
  for (;;) {
    const logo = await prisma.organizationLogo.findFirst({ where: { data: { not: null } } });
    if (!logo) break;
    if (await saveOrganizationImage(logo.organizationId, "logo", {
      data: logo.data!, contentType: logo.contentType
    }, logo.updatedAt)) migrated++;
  }
  for (;;) {
    const image = await prisma.organizationGalleryImage.findFirst({ where: { data: { not: null } } });
    if (!image) break;
    if (image.slot !== 0 && image.slot !== 1) throw new Error("Invalid image slot");
    if (await saveOrganizationImage(image.organizationId, image.slot, {
      data: image.data!, contentType: image.contentType
    }, image.updatedAt)) migrated++;
  }
  console.info(`Migrated ${migrated} images to Storage`);
} catch {
  console.error("Image migration stopped. Check database and Storage configuration; safe to retry.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
