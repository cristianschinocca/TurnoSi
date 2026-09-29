import express, { Router } from "express";

import { prisma } from "../../database/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";
import { clearAuthCookies } from "../../lib/cookies.js";
import { encryptSecret } from "../../lib/crypto.js";
import { ok } from "../../lib/http.js";
import { optimizeImage } from "../../lib/image-optimizer.js";
import { verifyPassword } from "../../lib/password.js";
import { slugify } from "../../lib/slugify.js";
import { assertMembership } from "../../lib/membership.js";
import { organizationParamsSchema } from "../../lib/schemas.js";
import { authRateLimit } from "../../middlewares/rate-limit.js";
import { auditLog } from "../audit/audit.service.js";
import { serveGalleryImage, serveLogo } from "../../lib/logo.js";
import { appointmentsRouter } from "../appointments/appointments.routes.js";
import { assertPlanLimitAvailable } from "../billing/plan-limits.service.js";
import { customersRouter } from "../customers/customers.routes.js";
import { servicesRouter } from "../services/services.routes.js";
import { deleteOrganizationWithData } from "./delete-organization.service.js";
import { deleteOrganizationImage, saveOrganizationImage } from "./organization-images.service.js";
import {
  branchParamsSchema,
  branchSchema,
  updateOrganizationBusinessSettingsSchema,
  updateOrganizationContactSettingsSchema,
  updateOrganizationPageSettingsSchema,
  updateOrganizationPaymentsSettingsSchema,
  updateOrganizationSettingsSchema,
  updateOrganizationSettingsSectionSchema
} from "./organizations.schemas.js";

export const organizationsRouter = Router();

const logoContentTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const gallerySlots = new Set([0, 1]);

type SettingsUpdateData = {
  name?: string;
  category?: string;
  phone?: string;
  whatsapp?: string;
  publicEmail?: string;
  address?: string;
  city?: string;
  province?: string;
  instagram?: string;
  description?: string;
  mercadoPagoAccessToken?: string;
  mercadoPagoDisconnect?: boolean;
  depositEnabled?: boolean;
  depositAmountCents?: number | null;
  galleryFocus?: {
    slot: 0 | 1;
    focusX: number;
    focusY: number;
    zoom: number;
  }[];
};

type SettingsSection = "business" | "contact" | "page" | "payments";

type SettingsCompletionSource = {
  name: string | null;
  category: string | null;
  phone: string | null;
  whatsapp: string | null;
  publicEmail: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  description: string | null;
  mercadoPagoAccessTokenEncrypted: string | null;
  depositEnabled: boolean;
};

function buildSettingsCompletion(organization: SettingsCompletionSource) {
  return {
    business: Boolean(
      organization.name && organization.category && organization.description
    ),
    contact: Boolean(
      organization.phone && organization.whatsapp && organization.publicEmail
    ),
    page: Boolean(
      organization.address && organization.city && organization.province
    ),
    payments: Boolean(
      organization.mercadoPagoAccessTokenEncrypted || !organization.depositEnabled
    )
  };
}

async function updateCurrentOrganizationSettings({
  action,
  data,
  organizationId,
  userId
}: {
  action: string;
  data: SettingsUpdateData;
  organizationId: string;
  userId: string;
}) {
  const {
    galleryFocus,
    mercadoPagoAccessToken,
    mercadoPagoDisconnect,
    depositEnabled,
    depositAmountCents,
    ...organizationData
  } = data;
  const paymentSettings: {
    mercadoPagoAccessTokenEncrypted?: string | null;
    depositEnabled?: boolean;
    depositAmountCents?: number | null;
  } = {};

  if (mercadoPagoAccessToken) {
    paymentSettings.mercadoPagoAccessTokenEncrypted = encryptSecret(
      mercadoPagoAccessToken,
      env.AUTH_SECRET
    );
  }
  if (mercadoPagoDisconnect) {
    paymentSettings.mercadoPagoAccessTokenEncrypted = null;
    paymentSettings.depositEnabled = false;
  }
  if (depositEnabled !== undefined) {
    paymentSettings.depositEnabled = depositEnabled;
  }
  if (depositAmountCents !== undefined) {
    paymentSettings.depositAmountCents = depositAmountCents;
  }

  const organization = await prisma.organization.update({
    where: { id: organizationId },
    data: {
      ...organizationData,
      ...paymentSettings,
      ...(organizationData.publicEmail !== undefined
        ? { publicEmail: organizationData.publicEmail || null }
        : {})
    }
  });

  if (galleryFocus?.length) {
    await prisma.$transaction(
      galleryFocus.map((image) =>
        prisma.organizationGalleryImage.updateMany({
          where: {
            organizationId,
            slot: image.slot
          },
          data: {
            focusX: image.focusX,
            focusY: image.focusY,
            zoom: image.zoom
          }
        })
      )
    );
  }

  await auditLog({
    organizationId,
    userId,
    action,
    entityType: "Organization",
    entityId: organizationId,
    metadata: { fields: Object.keys(data) }
  });

  return organization;
}

async function ensureMainBranch(organizationId: string) {
  const existing = await prisma.branch.findFirst({
    where: { organizationId, isMain: true }
  });
  if (existing) return existing;
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId }
  });
  return prisma.branch.create({
    data: {
      organizationId,
      name: "Sede principal",
      slug: "sede-principal",
      phone: organization.phone,
      whatsapp: organization.whatsapp,
      address: organization.address,
      city: organization.city,
      province: organization.province,
      isMain: true
    }
  });
}

function matchesImageSignature(data: Buffer, contentType: string) {
  if (contentType === "image/png") {
    return data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (contentType === "image/jpeg") {
    return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }
  return (
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

organizationsRouter.get("/current/logo", async (request, response) => {
  await serveLogo(request.tenant!.organizationId, response);
});

organizationsRouter.get("/current/gallery/:slot", async (request, response) => {
  const slot = Number(request.params.slot);
  if (!gallerySlots.has(slot)) return response.sendStatus(404);
  await serveGalleryImage(request.tenant!.organizationId, slot, response);
});

organizationsRouter.get("/current/branches", async (request, response) => {
  const tenant = request.tenant!;
  await ensureMainBranch(tenant.organizationId);
  const branches = await prisma.branch.findMany({
    where: { organizationId: tenant.organizationId, isActive: true },
    orderBy: [{ isMain: "desc" }, { name: "asc" }]
  });
  response.json(ok(branches.map((branch) => ({
    id: branch.id,
    name: branch.name,
    slug: branch.slug,
    phone: branch.phone ?? "",
    whatsapp: branch.whatsapp ?? "",
    address: branch.address ?? "",
    city: branch.city ?? "",
    province: branch.province ?? "",
    isMain: branch.isMain
  }))));
});

organizationsRouter.post("/current/branches", authRateLimit, async (request, response) => {
  const tenant = request.tenant!;
  if (tenant.role !== "owner" && tenant.role !== "admin") {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  const data = branchSchema.parse(request.body);
  const branchCount = await prisma.branch.count({
    where: { organizationId: tenant.organizationId, isActive: true }
  });
  await assertPlanLimitAvailable(tenant.organizationId, "branches", branchCount);
  const baseSlug = slugify(data.name) || "sede";
  const branch = await prisma.branch.create({
    data: {
      organizationId: tenant.organizationId,
      name: data.name,
      slug: `${baseSlug}-${Date.now().toString(36)}`,
      phone: data.phone,
      whatsapp: data.whatsapp,
      address: data.address,
      city: data.city,
      province: data.province
    }
  });
  response.status(201).json(ok({ id: branch.id }));
});

organizationsRouter.patch("/current/branches/:branchId", authRateLimit, async (request, response) => {
  const tenant = request.tenant!;
  if (tenant.role !== "owner" && tenant.role !== "admin") {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  const { branchId } = branchParamsSchema.parse(request.params);
  const data = branchSchema.parse(request.body);
  const result = await prisma.branch.updateMany({
    where: { id: branchId, organizationId: tenant.organizationId },
    data
  });
  if (!result.count) throw new AppError(404, "NOT_FOUND", "Branch not found");
  response.json(ok({ updated: true }));
});

organizationsRouter.delete("/current/branches/:branchId", authRateLimit, async (request, response) => {
  const tenant = request.tenant!;
  if (tenant.role !== "owner" && tenant.role !== "admin") {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  const { branchId } = branchParamsSchema.parse(request.params);
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, organizationId: tenant.organizationId }
  });
  if (!branch) throw new AppError(404, "NOT_FOUND", "Branch not found");
  if (branch.isMain) {
    throw new AppError(400, "MAIN_BRANCH", "Main branch cannot be deleted");
  }
  await prisma.branch.update({
    where: { id: branch.id },
    data: { isActive: false }
  });
  response.json(ok({ deleted: true }));
});

organizationsRouter.put(
  "/current/logo",
  authRateLimit,
  express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "8mb" }),
  async (request, response) => {
    const contentType = request.get("content-type")?.split(";")[0] ?? "";
    if (
      !logoContentTypes.has(contentType) ||
      !Buffer.isBuffer(request.body) ||
      request.body.length === 0 ||
      !matchesImageSignature(request.body, contentType)
    ) {
      return response.status(400).json({
        success: false,
        message: "Logo must be a PNG, JPEG or WebP image",
        code: "INVALID_LOGO"
      });
    }

    const tenant = request.tenant!;
    if (tenant.role !== "owner" && tenant.role !== "admin") {
      return response.status(403).json({
        success: false,
        message: "Insufficient permissions",
        code: "FORBIDDEN"
      });
    }

    let optimizedLogo;
    try {
      optimizedLogo = await optimizeImage(request.body, "logo");
    } catch {
      return response.status(400).json({
        success: false,
        message: "Logo must be a valid image",
        code: "INVALID_LOGO"
      });
    }
    await saveOrganizationImage(tenant.organizationId, "logo", optimizedLogo);
    response.json(ok({ uploaded: true }));
  }
);

organizationsRouter.delete("/current/logo", authRateLimit, async (request, response) => {
  const tenant = request.tenant!;
  if (tenant.role !== "owner" && tenant.role !== "admin") {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  await deleteOrganizationImage(tenant.organizationId, "logo");
  response.json(ok({ deleted: true }));
});

organizationsRouter.put(
  "/current/gallery/:slot",
  authRateLimit,
  express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "10mb" }),
  async (request, response) => {
    const slot = Number(request.params.slot);
    if (!gallerySlots.has(slot)) {
      return response.status(400).json({
        success: false,
        message: "Gallery slot must be 0 or 1",
        code: "INVALID_GALLERY_SLOT"
      });
    }

    const contentType = request.get("content-type")?.split(";")[0] ?? "";
    if (
      !logoContentTypes.has(contentType) ||
      !Buffer.isBuffer(request.body) ||
      request.body.length === 0 ||
      !matchesImageSignature(request.body, contentType)
    ) {
      return response.status(400).json({
        success: false,
        message: "Gallery image must be a PNG, JPEG or WebP image",
        code: "INVALID_GALLERY_IMAGE"
      });
    }

    const tenant = request.tenant!;
    if (tenant.role !== "owner" && tenant.role !== "admin") {
      return response.status(403).json({
        success: false,
        message: "Insufficient permissions",
        code: "FORBIDDEN"
      });
    }

    let optimizedImage;
    try {
      optimizedImage = await optimizeImage(
        request.body,
        slot === 0 ? "galleryHorizontal" : "galleryVertical"
      );
    } catch {
      return response.status(400).json({
        success: false,
        message: "Gallery image must be a valid image",
        code: "INVALID_GALLERY_IMAGE"
      });
    }
    await saveOrganizationImage(tenant.organizationId, slot as 0 | 1, optimizedImage);
    response.json(
      ok({
        uploaded: true,
        originalBytes: request.body.length,
        optimizedBytes: optimizedImage.data.length,
        contentType: optimizedImage.contentType
      })
    );
  }
);

organizationsRouter.delete(
  "/current/gallery/:slot",
  authRateLimit,
  async (request, response) => {
    const slot = Number(request.params.slot);
    if (!gallerySlots.has(slot)) {
      return response.status(400).json({
        success: false,
        message: "Gallery slot must be 0 or 1",
        code: "INVALID_GALLERY_SLOT"
      });
    }

    const tenant = request.tenant!;
    if (tenant.role !== "owner" && tenant.role !== "admin") {
      return response.status(403).json({
        success: false,
        message: "Insufficient permissions",
        code: "FORBIDDEN"
      });
    }

    await deleteOrganizationImage(tenant.organizationId, slot as 0 | 1);
    response.json(ok({ deleted: true }));
  }
);

organizationsRouter.get("/current/settings", async (request, response) => {
  const tenant = request.tenant!;
  if (tenant.role !== "owner" && tenant.role !== "admin") {
    response.status(403).json({ success: false, message: "Insufficient permissions", code: "FORBIDDEN" });
    return;
  }
  const organization = await prisma.organization.findUnique({
    where: { id: tenant.organizationId },
    include: {
      logo: { select: { organizationId: true, updatedAt: true } },
      galleryImages: { select: { slot: true, focusX: true, focusY: true, zoom: true, updatedAt: true } }
    }
  });

  if (!organization) {
    response.status(404).json({ success: false, message: "Organization not found", code: "NOT_FOUND" });
    return;
  }

  response.json(ok({
    name: organization.name,
    slug: organization.slug,
    category: organization.category ?? "",
    phone: organization.phone ?? "",
    whatsapp: organization.whatsapp ?? "",
    publicEmail: organization.publicEmail ?? "",
    address: organization.address ?? "",
    city: organization.city ?? "",
    province: organization.province ?? "",
    instagram: organization.instagram ?? "",
    description: organization.description ?? "",
    mercadoPagoConnected: Boolean(organization.mercadoPagoAccessTokenEncrypted),
    depositEnabled: organization.depositEnabled,
    depositAmountCents: organization.depositAmountCents,
    onboardingCompleted: Boolean(organization.onboardingCompletedAt),
    completion: buildSettingsCompletion(organization),
    hasLogo: Boolean(organization.logo),
    logoVersion: organization.logo?.updatedAt.getTime() ?? null,
    galleryImageSlots: organization.galleryImages.map((image) => image.slot).sort(),
    galleryVersions: organization.galleryImages
      .map((image) => ({
        slot: image.slot,
        version: image.updatedAt.getTime()
      }))
      .sort((first, second) => first.slot - second.slot),
    galleryFocus: organization.galleryImages
      .map((image) => ({
        slot: image.slot,
        focusX: image.focusX,
        focusY: image.focusY,
        zoom: image.zoom
      }))
      .sort((first, second) => first.slot - second.slot)
  }));
});

organizationsRouter.get("/current/settings/:section", async (request, response) => {
  const section = updateOrganizationSettingsSectionSchema.parse(
    request.params.section
  ) as SettingsSection;
  const tenant = request.tenant!;
  if (tenant.role !== "owner" && tenant.role !== "admin") {
    response.status(403).json({
      success: false,
      message: "Insufficient permissions",
      code: "FORBIDDEN"
    });
    return;
  }

  const organization = await prisma.organization.findUnique({
    where: { id: tenant.organizationId },
    select: {
      name: true,
      slug: true,
      category: true,
      phone: true,
      whatsapp: true,
      publicEmail: true,
      address: true,
      city: true,
      province: true,
      instagram: true,
      description: true,
      mercadoPagoAccessTokenEncrypted: true,
      depositEnabled: true,
      depositAmountCents: true,
      onboardingCompletedAt: true,
      ...(section === "business"
        ? {
            logo: { select: { organizationId: true, updatedAt: true } },
            galleryImages: {
              select: {
                slot: true,
                focusX: true,
                focusY: true,
                zoom: true,
                updatedAt: true
              }
            }
          }
        : {})
    }
  });

  if (!organization) {
    response.status(404).json({
      success: false,
      message: "Organization not found",
      code: "NOT_FOUND"
    });
    return;
  }

  const completion = buildSettingsCompletion(organization);
  const base = {
    slug: organization.slug,
    onboardingCompleted: Boolean(organization.onboardingCompletedAt),
    completion
  };

  if (section === "business") {
    const galleryImages = "galleryImages" in organization ? organization.galleryImages : [];
    response.json(ok({
      ...base,
      name: organization.name,
      category: organization.category ?? "",
      description: organization.description ?? "",
      hasLogo: Boolean("logo" in organization && organization.logo),
      logoVersion:
        "logo" in organization ? organization.logo?.updatedAt.getTime() ?? null : null,
      galleryImageSlots: galleryImages.map((image) => image.slot).sort(),
      galleryVersions: galleryImages
        .map((image) => ({ slot: image.slot, version: image.updatedAt.getTime() }))
        .sort((first, second) => first.slot - second.slot),
      galleryFocus: galleryImages
        .map((image) => ({
          slot: image.slot,
          focusX: image.focusX,
          focusY: image.focusY,
          zoom: image.zoom
        }))
        .sort((first, second) => first.slot - second.slot)
    }));
    return;
  }

  if (section === "contact") {
    response.json(ok({
      ...base,
      phone: organization.phone ?? "",
      whatsapp: organization.whatsapp ?? "",
      publicEmail: organization.publicEmail ?? "",
      address: organization.address ?? "",
      city: organization.city ?? "",
      province: organization.province ?? "",
      instagram: organization.instagram ?? ""
    }));
    return;
  }

  if (section === "payments") {
    response.json(ok({
      ...base,
      mercadoPagoConnected: Boolean(organization.mercadoPagoAccessTokenEncrypted),
      depositEnabled: organization.depositEnabled,
      depositAmountCents: organization.depositAmountCents
    }));
    return;
  }

  response.json(ok(base));
});

organizationsRouter.patch("/current/settings/:section", authRateLimit, async (request, response) => {
  const section = updateOrganizationSettingsSectionSchema.parse(request.params.section);
  const tenant = request.tenant!;

  if (tenant.role !== "owner" && tenant.role !== "admin") {
    response.status(403).json({ success: false, message: "Insufficient permissions", code: "FORBIDDEN" });
    return;
  }

  const schemas = {
    business: updateOrganizationBusinessSettingsSchema,
    contact: updateOrganizationContactSettingsSchema,
    page: updateOrganizationPageSettingsSchema,
    payments: updateOrganizationPaymentsSettingsSchema
  };
  const data = schemas[section].parse(request.body);
  const organization = await updateCurrentOrganizationSettings({
    action: `organization.settings_${section}_updated`,
    data,
    organizationId: tenant.organizationId,
    userId: request.auth!.sub
  });

  response.json(ok({ id: organization.id }));
});

organizationsRouter.patch("/current/settings", authRateLimit, async (request, response) => {
  const data = updateOrganizationSettingsSchema.parse(request.body);
  const tenant = request.tenant!;

  if (tenant.role !== "owner" && tenant.role !== "admin") {
    response.status(403).json({ success: false, message: "Insufficient permissions", code: "FORBIDDEN" });
    return;
  }

  const organization = await updateCurrentOrganizationSettings({
    action: "organization.settings_updated",
    data,
    organizationId: tenant.organizationId,
    userId: request.auth!.sub
  });

  response.json(ok({ id: organization.id }));
});

organizationsRouter.post("/current/complete-onboarding", authRateLimit, async (request, response) => {
  const tenant = request.tenant!;
  if (tenant.role !== "owner" && tenant.role !== "admin") {
    response.status(403).json({ success: false, message: "Insufficient permissions", code: "FORBIDDEN" });
    return;
  }

  const [user, organization] = await Promise.all([
    prisma.user.findUnique({
      where: { id: request.auth!.sub },
      select: { firstName: true, lastName: true }
    }),
    prisma.organization.findUnique({
      where: { id: tenant.organizationId },
      select: {
        name: true,
        category: true,
        phone: true,
        address: true,
        city: true,
        province: true,
        description: true
      }
    })
  ]);
  const missing = [
    ...(!user?.firstName || !user.lastName ? ["ownerProfile"] : []),
    ...(!organization?.name || !organization.category || !organization.phone
      ? ["business"]
      : []),
    ...(!organization?.address || !organization.city || !organization.province
      ? ["location"]
      : []),
    ...(!organization?.description ? ["publicProfile"] : [])
  ];
  if (missing.length > 0) {
    throw new AppError(
      409,
      "ONBOARDING_INCOMPLETE",
      `Missing onboarding tasks: ${missing.join(",")}`
    );
  }

  await prisma.organization.update({
    where: { id: tenant.organizationId },
    data: { onboardingCompletedAt: new Date() }
  });

  response.json(ok({ onboardingCompleted: true }));
});

organizationsRouter.delete("/current", authRateLimit, async (request, response) => {
  const tenant = request.tenant!;
  if (tenant.role !== "owner") {
    throw new AppError(403, "FORBIDDEN", "Only the owner can delete the business");
  }
  const password =
    typeof request.body?.password === "string" ? request.body.password : "";
  if (password.length < 6) {
    throw new AppError(400, "INVALID_PASSWORD", "Password is required");
  }

  const [user, organization] = await Promise.all([
    prisma.user.findUnique({
      where: { id: request.auth!.sub },
      select: { passwordHash: true }
    }),
    prisma.organization.findUnique({
      where: { id: tenant.organizationId },
      select: { id: true }
    })
  ]);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new AppError(400, "INVALID_PASSWORD", "Password is incorrect");
  }
  if (!organization) {
    throw new AppError(404, "NOT_FOUND", "Business not found");
  }

  await deleteOrganizationWithData(tenant.organizationId);

  clearAuthCookies(response);
  response.json(ok({ deleted: true }));
});

organizationsRouter.get("/", async (request, response) => {
  const memberships = await prisma.membership.findMany({
    where: { userId: request.auth!.sub },
    include: {
      organization: {
        select: {
          id: true, name: true, slug: true, timezone: true,
          bookingIntervalMinutes: true, category: true, phone: true,
          whatsapp: true, publicEmail: true, address: true, city: true,
          province: true, countryCode: true, instagram: true, description: true,
          depositEnabled: true, depositAmountCents: true,
          onboardingCompletedAt: true, createdAt: true, updatedAt: true
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  response.json(ok(memberships.map((m) => m.organization)));
});

organizationsRouter.get("/:organizationId", async (request, response) => {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  await assertMembership(request.auth!.sub, organizationId);

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true, name: true, slug: true, timezone: true,
      bookingIntervalMinutes: true, category: true, phone: true,
      whatsapp: true, publicEmail: true, address: true, city: true,
      province: true, countryCode: true, instagram: true, description: true,
      depositEnabled: true, depositAmountCents: true,
      onboardingCompletedAt: true, createdAt: true, updatedAt: true
    }
  });

  if (!organization) {
    response.status(404).json({
      success: false,
      message: "Organization not found",
      code: "NOT_FOUND"
    });
    return;
  }

  response.json(ok(organization));
});

organizationsRouter.use("/:organizationId/services", servicesRouter);
organizationsRouter.use("/:organizationId/customers", customersRouter);
organizationsRouter.use("/:organizationId/appointments", appointmentsRouter);
