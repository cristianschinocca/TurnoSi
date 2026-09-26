import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import { env } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../lib/app-error.js";
import { parseCookies } from "../../lib/cookies.js";
import { ok } from "../../lib/http.js";
import { authRateLimit } from "../../middlewares/rate-limit.js";
import { auditLog } from "../audit/audit.service.js";
import { deleteOrganizationWithData } from "../organizations/delete-organization.service.js";
import { changeBillingPrice, changePriceSchema, getPriceChanges, pricePlanSchema, retryPriceChange } from "../billing/billing-prices.service.js";

export const superadminRouter = Router();

const cookieName = "superadmin_token";
const sessionTtlSeconds = 60 * 60 * 2;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const organizationParamsSchema = z.object({
  organizationId: z.string().min(1)
});

const subscriptionActionSchema = z
  .object({
    action: z.enum(["grant", "extend", "pause", "cancel"]),
    plan: z.enum(["trial", "initial", "professional", "operation"]).optional(),
    extensionDays: z.coerce.number().int().min(1).max(365).optional(),
    reason: z.string().trim().min(8).max(300)
  })
  .superRefine((data, context) => {
    if (data.action === "grant" && !data.plan) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["plan"],
        message: "Plan is required for manual grants"
      });
    }
    if (data.action === "extend" && !data.extensionDays) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["extensionDays"],
        message: "Extension days are required"
      });
    }
  });

const organizationsQuerySchema = z.object({
  search: z.string().trim().max(80).optional()
});

type SuperadminTokenPayload = {
  scope: "superadmin";
  email: string;
  exp: number;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function signPayload(payload: SuperadminTokenPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", env.AUTH_SECRET)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function superadminConfig() {
  if (!env.SUPERADMIN_EMAIL || !env.SUPERADMIN_PASSWORD_HASH) {
    throw new AppError(
      503,
      "SUPERADMIN_NOT_CONFIGURED",
      "Superadmin credentials are not configured"
    );
  }

  return {
    email: env.SUPERADMIN_EMAIL,
    passwordHash: env.SUPERADMIN_PASSWORD_HASH.toLowerCase()
  };
}

function readPayload(token: string | undefined, expectedEmail: string) {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = createHmac("sha256", env.AUTH_SECRET)
    .update(encoded)
    .digest("base64url");
  if (!safeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as Partial<SuperadminTokenPayload>;
    if (
      payload.scope !== "superadmin" ||
      payload.email !== expectedEmail ||
      !payload.exp ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload as SuperadminTokenPayload;
  } catch {
    return null;
  }
}

function setSuperadminCookie(response: Response, token: string) {
  const cookie = [
    `${cookieName}=${encodeURIComponent(token)}`,
    "Path=/api/v1/superadmin",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${sessionTtlSeconds}`
  ];
  if (env.NODE_ENV === "production") cookie.push("Secure");
  response.setHeader("Set-Cookie", cookie.join("; "));
}

function clearSuperadminCookie(response: Response) {
  const secure = env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${cookieName}=; Path=/api/v1/superadmin; HttpOnly; SameSite=Strict; Max-Age=0${secure}`
  );
}

function requireSuperadmin(request: Request) {
  const config = superadminConfig();
  const token = parseCookies(request.headers.cookie)[cookieName];
  const payload = readPayload(token, config.email);
  if (!payload) {
    throw new AppError(401, "SUPERADMIN_UNAUTHORIZED", "Superadmin session required");
  }
  return payload;
}

function fullName(user: { firstName: string | null; lastName: string | null }) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || "Sin nombre";
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

superadminRouter.post("/login", authRateLimit, async (request, response) => {
  const config = superadminConfig();
  const credentials = loginSchema.parse(request.body);
  const email = credentials.email.toLowerCase();
  const expectedEmail = config.email.toLowerCase();
  const passwordHash = sha256(credentials.password).toLowerCase();

  if (
    !safeEqual(email, expectedEmail) ||
    !safeEqual(passwordHash, config.passwordHash)
  ) {
    throw new AppError(401, "INVALID_SUPERADMIN_LOGIN", "Invalid credentials");
  }

  const token = signPayload({
    scope: "superadmin",
    email: config.email,
    exp: Math.floor(Date.now() / 1000) + sessionTtlSeconds
  });
  setSuperadminCookie(response, token);
  response.json(ok({ email: config.email }));
});

superadminRouter.post("/logout", authRateLimit, (_request, response) => {
  clearSuperadminCookie(response);
  response.json(ok({ loggedOut: true }));
});

superadminRouter.get("/me", (request, response) => {
  const session = requireSuperadmin(request);
  response.json(ok({ email: session.email }));
});

superadminRouter.get("/overview", async (request, response) => {
  requireSuperadmin(request);
  const [organizations, ownerAccounts, activeSubscriptions] =
    await Promise.all([
      prisma.organization.count(),
      prisma.membership.count({ where: { role: "owner" } }),
      prisma.organizationSubscription.count({
        where: { status: "authorized" }
      })
    ]);

  response.json(
    ok({ organizations, ownerAccounts, activeSubscriptions })
  );
});

superadminRouter.get("/prices", async (request, response) => {
  requireSuperadmin(request);
  response.json(ok(await getPriceChanges()));
});

superadminRouter.patch("/prices/:plan", authRateLimit, async (request, response) => {
  const session = requireSuperadmin(request);
  const plan = pricePlanSchema.parse(request.params.plan);
  const input = changePriceSchema.parse(request.body);
  await changeBillingPrice(plan, input, session.email);
  response.json(ok(await getPriceChanges()));
});

superadminRouter.post("/prices/:plan/retry", authRateLimit, async (request, response) => {
  requireSuperadmin(request);
  await retryPriceChange(pricePlanSchema.parse(request.params.plan));
  response.json(ok(await getPriceChanges()));
});

superadminRouter.get("/organizations", async (request, response) => {
  requireSuperadmin(request);
  const { search } = organizationsQuerySchema.parse(request.query);
  const normalizedSearch = search?.trim();

  const organizations = await prisma.organization.findMany({
    where: normalizedSearch
      ? {
          OR: [
            { name: { contains: normalizedSearch, mode: "insensitive" } },
            { slug: { contains: normalizedSearch, mode: "insensitive" } },
            {
              memberships: {
                some: {
                  user: {
                    OR: [
                      {
                        email: {
                          contains: normalizedSearch,
                          mode: "insensitive"
                        }
                      },
                      {
                        firstName: {
                          contains: normalizedSearch,
                          mode: "insensitive"
                        }
                      },
                      {
                        lastName: {
                          contains: normalizedSearch,
                          mode: "insensitive"
                        }
                      }
                    ]
                  }
                }
              }
            }
          ]
        }
      : undefined,
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      city: true,
      province: true,
      createdAt: true,
      onboardingCompletedAt: true,
      subscription: {
        select: {
          plan: true,
          status: true,
          trialEndsAt: true,
          paymentGraceEndsAt: true,
          nextPaymentAt: true,
          mercadoPagoPreapprovalId: true,
          payerEmail: true,
          lastPaymentStatus: true
        }
      },
      memberships: {
        where: { role: "owner" },
        take: 1,
        select: {
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      },
      _count: {
        select: {
          branches: true,
          memberships: true,
          services: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 80
  });

  response.json(
    ok(
      organizations.map((organization) => {
        const owner = organization.memberships[0]?.user;
        return {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          category: organization.category,
          location: [organization.city, organization.province]
            .filter(Boolean)
            .join(", "),
          createdAt: organization.createdAt,
          onboardingCompletedAt: organization.onboardingCompletedAt,
          owner: owner
            ? { name: fullName(owner), email: owner.email }
            : { name: "Sin dueño", email: "" },
          subscription: organization.subscription,
          counts: organization._count
        };
      })
    )
  );
});

superadminRouter.get("/organizations/:organizationId", async (request, response) => {
  requireSuperadmin(request);
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      phone: true,
      whatsapp: true,
      publicEmail: true,
      address: true,
      city: true,
      province: true,
      description: true,
      onboardingCompletedAt: true,
      createdAt: true,
      updatedAt: true,
      subscription: true,
      branches: {
        orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          city: true,
          province: true,
          isMain: true,
          isActive: true
        }
      },
      memberships: {
        where: { role: "owner" },
        orderBy: { createdAt: "asc" },
        select: {
          role: true,
          bookingsEnabled: true,
          visibleInPublicBooking: true,
          hourlyCapacity: true,
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              firstName: true,
              lastName: true,
              phone: true,
              emailVerifiedAt: true
            }
          }
        }
      },
      services: {
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          name: true,
          category: true,
          durationMinutes: true,
          isActive: true,
          isOnlineBookable: true
        }
      },
      subscriptionPayments: {
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          status: true,
          amountCents: true,
          currencyId: true,
          paidAt: true,
          createdAt: true
        }
      },
      _count: {
        select: {
          branches: true,
          customers: true,
          memberships: true,
          services: true
        }
      }
    }
  });

  if (!organization) {
    throw new AppError(404, "NOT_FOUND", "Business not found");
  }

  response.json(ok(organization));
});

superadminRouter.patch("/organizations/:organizationId/subscription", authRateLimit, async (request, response) => {
  const session = requireSuperadmin(request);
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const input = subscriptionActionSchema.parse(request.body);
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, subscription: true }
  });

  if (!organization) {
    throw new AppError(404, "NOT_FOUND", "Business not found");
  }

  const now = new Date();
  const extensionEndsAt = input.extensionDays ? addDays(now, input.extensionDays) : null;
  const current = organization.subscription;
  let subscription;

  if (input.action === "grant") {
    const plan = input.plan!;
    const trialEndsAt = plan === "trial" ? extensionEndsAt ?? addDays(now, 7) : null;
    subscription = await prisma.organizationSubscription.upsert({
      where: { organizationId },
      create: {
        organizationId,
        plan,
        status: "authorized",
        source: "manual",
        mercadoPagoPreapprovalId: null,
        payerEmail: null,
        nextPaymentAt: null,
        trialStartedAt: plan === "trial" ? now : null,
        trialEndsAt,
        paymentGraceEndsAt: null,
        lastPaymentStatus: null,
        lastWebhookAt: null
      },
      update: {
        plan,
        status: "authorized",
        source: "manual",
        mercadoPagoPreapprovalId: null,
        payerEmail: null,
        nextPaymentAt: null,
        trialStartedAt:
          plan === "trial" ? current?.trialStartedAt ?? now : current?.trialStartedAt,
        trialEndsAt,
        paymentGraceEndsAt: null,
        lastPaymentStatus: null,
        lastWebhookAt: null
      }
    });
  } else if (input.action === "extend") {
    if (!current) {
      throw new AppError(409, "SUBSCRIPTION_REQUIRED", "Subscription required");
    }
    subscription = await prisma.organizationSubscription.update({
      where: { organizationId },
      data: {
        status: "authorized",
        source: "manual",
        mercadoPagoPreapprovalId: null,
        payerEmail: null,
        nextPaymentAt: null,
        ...(current.plan === "trial"
          ? { trialEndsAt: extensionEndsAt }
          : {
              paymentGraceEndsAt: extensionEndsAt,
              lastPaymentStatus: current.lastPaymentStatus ?? "rejected"
            })
      }
    });
  } else {
    subscription = await prisma.organizationSubscription.upsert({
      where: { organizationId },
      create: {
        organizationId,
        plan: input.plan ?? "initial",
        status: input.action === "pause" ? "paused" : "canceled",
        mercadoPagoPreapprovalId: null,
        payerEmail: null,
        nextPaymentAt: null
      },
      update: {
        status: input.action === "pause" ? "paused" : "canceled",
        mercadoPagoPreapprovalId: null,
        payerEmail: null,
        paymentGraceEndsAt: null,
        nextPaymentAt: null,
        lastPaymentStatus: null
      }
    });
  }

  await auditLog({
    organizationId,
    action: `superadmin.subscription.${input.action}`,
    entityType: "organization_subscription",
    entityId: subscription.id,
    metadata: {
      superadminEmail: session.email,
      reason: input.reason,
      plan: subscription.plan,
      status: subscription.status,
      extensionDays: input.extensionDays ?? null
    }
  });

  response.json(ok(subscription));
});

superadminRouter.delete("/organizations/:organizationId", authRateLimit, async (request, response) => {
  requireSuperadmin(request);
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const result = await deleteOrganizationWithData(organizationId);
  response.json(ok(result));
});
