CREATE TABLE "BillingPlanPrice" (
  "plan" "SubscriptionPlan" PRIMARY KEY,
  "amountCents" INTEGER NOT NULL CHECK ("amountCents" > 0),
  "revision" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
INSERT INTO "BillingPlanPrice" ("plan", "amountCents", "updatedAt") VALUES
  ('initial', 1500000, CURRENT_TIMESTAMP),
  ('professional', 2400000, CURRENT_TIMESTAMP),
  ('operation', 3900000, CURRENT_TIMESTAMP);

CREATE TABLE "BillingPriceChange" (
  "id" TEXT PRIMARY KEY,
  "plan" "SubscriptionPlan" NOT NULL,
  "previousCents" INTEGER NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL,
  "changedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "BillingPriceChange_plan_revision_key" ON "BillingPriceChange"("plan", "revision");
CREATE TYPE "BillingPriceTaskStatus" AS ENUM ('pending', 'updated', 'skipped', 'failed');
CREATE TABLE "BillingPriceTask" (
  "id" TEXT PRIMARY KEY,
  "changeId" TEXT NOT NULL REFERENCES "BillingPriceChange"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "organizationId" TEXT NOT NULL,
  "preapprovalId" TEXT NOT NULL,
  "status" "BillingPriceTaskStatus" NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "BillingPriceTask_changeId_preapprovalId_key" ON "BillingPriceTask"("changeId", "preapprovalId");
CREATE INDEX "BillingPriceTask_status_idx" ON "BillingPriceTask"("status");
