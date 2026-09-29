import { prisma } from "./database/prisma.js";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { startPriceSyncWorker } from "./modules/billing/billing-prices.service.js";
import { startImageCleanupWorker } from "./modules/organizations/image-cleanup.service.js";
import { startPendingSubscriptionsWorker } from "./modules/billing/pending-subscriptions.service.js";

const app = createApp();
const stopPriceSyncWorker = startPriceSyncWorker();
const stopImageCleanupWorker = startImageCleanupWorker();
const stopPendingSubscriptionsWorker = startPendingSubscriptionsWorker();

const server = app.listen(env.PORT, () => {
  logger.info("api listening", { port: env.PORT });
});

function shutdown(signal: string) {
  const workerStopped = Promise.all([
    stopPriceSyncWorker(), stopImageCleanupWorker(), stopPendingSubscriptionsWorker()
  ]);
  logger.info("shutdown initiated", { signal });
  server.close(async () => {
    await workerStopped;
    await prisma.$disconnect();
    logger.info("shutdown complete");
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("shutdown forced after timeout");
    process.exit(1);
  }, 40_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (error) => {
  logger.error("unhandled rejection", { error });
  shutdown("unhandledRejection");
});
process.on("uncaughtException", (error) => {
  logger.error("uncaught exception", { error });
  shutdown("uncaughtException");
});
