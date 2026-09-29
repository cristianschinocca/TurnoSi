import type { Response } from "express";

import { prisma } from "../database/prisma.js";
import { downloadStoredImage } from "./image-storage.js";

export async function serveLogo(organizationId: string, response: Response, options?: { cacheControl?: string }) {
  const logo = await prisma.organizationLogo.findUnique({
    where: { organizationId }, include: { storageObject: true }
  });
  if (!logo) {
    response.sendStatus(404);
    return;
  }
  const data = logo.storageObject
    ? await downloadStoredImage(logo.storageObject.bucket, logo.storageObject.path)
    : Buffer.from(logo.data!);
  response.setHeader("Content-Type", logo.contentType);
  response.setHeader("Cache-Control", options?.cacheControl ?? "private, max-age=300");
  response.send(data);
}

export async function serveGalleryImage(
  organizationId: string,
  slot: number,
  response: Response,
  options?: { cacheControl?: string }
) {
  const image = await prisma.organizationGalleryImage.findUnique({
    where: {
      organizationId_slot: {
        organizationId,
        slot
      }
    },
    include: { storageObject: true }
  });
  if (!image) {
    response.sendStatus(404);
    return;
  }
  const data = image.storageObject
    ? await downloadStoredImage(image.storageObject.bucket, image.storageObject.path)
    : Buffer.from(image.data!);
  response.setHeader("Content-Type", image.contentType);
  response.setHeader("Cache-Control", options?.cacheControl ?? "private, max-age=300");
  response.send(data);
}
