ALTER TABLE "BillingPriceTask"
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "errorCode" TEXT;
DROP INDEX "BillingPriceTask_status_idx";
CREATE INDEX "BillingPriceTask_status_nextAttemptAt_idx" ON "BillingPriceTask"("status", "nextAttemptAt");
