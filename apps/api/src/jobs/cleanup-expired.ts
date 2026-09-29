import { prisma } from "../database/prisma.js";
import { logger } from "../lib/logger.js";
import { cleanupPendingSubscriptions } from "../modules/billing/pending-subscriptions.service.js";

const now = new Date();
const retentionLimit = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

const [sessions, passwordResets, rateLimits] = await prisma.$transaction([
  prisma.authSession.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        { revokedAt: { lt: retentionLimit } }
      ]
    }
  }),
  prisma.passwordResetToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        { usedAt: { lt: retentionLimit } }
      ]
    }
  }),
  prisma.rateLimitBucket.deleteMany({
    where: { resetsAt: { lt: retentionLimit } }
  })
]);

logger.info("cleanup completed", {
  sessions: sessions.count,
  passwordResets: passwordResets.count,
  rateLimits: rateLimits.count
});

const pendingSubscriptions = await cleanupPendingSubscriptions();

const graceExpiredSubscriptions = await prisma.organizationSubscription.updateMany({
  where: {
    status: "authorized",
    plan: { not: "trial" },
    lastPaymentStatus: {
      in: ["rejected", "cancelled", "refunded", "charged_back"]
    },
    paymentGraceEndsAt: { lte: now }
  },
  data: { status: "paused" }
});

logger.info("billing cleanup completed", {
  pendingSubscriptions,
  graceExpiredSubscriptions: graceExpiredSubscriptions.count,
});

await prisma.$disconnect();
