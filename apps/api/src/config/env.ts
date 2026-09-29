import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const optionalEnv = (schema: z.ZodString) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const currentDir = dirname(fileURLToPath(import.meta.url));
const envFiles = [resolve(currentDir, "../../../../.env")];

for (const envFile of envFiles) {
  if (!existsSync(envFile)) {
    continue;
  }

  const contents = readFileSync(envFile, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  DATABASE_SLOW_QUERY_MS: z.coerce.number().int().nonnegative().default(1000),
  DATABASE_TRANSACTION_MAX_WAIT_MS: z.coerce.number().int().positive().default(2000),
  DATABASE_TRANSACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  WEB_ORIGIN: z.string().min(1),
  API_PUBLIC_URL: optionalEnv(z.string().url()),
  SUPABASE_URL: optionalEnv(z.string().url()),
  IMAGE_STORAGE_PROVIDER: z.enum(["database", "supabase"]).default("database"),
  SUPABASE_SERVICE_ROLE_KEY: optionalEnv(z.string().min(1)),
  SUPABASE_STORAGE_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/).default("organization-images"),
  MERCADOPAGO_ACCESS_TOKEN: optionalEnv(z.string().min(1)),
  MERCADOPAGO_WEBHOOK_SECRET: optionalEnv(z.string().min(1)),
  MERCADOPAGO_TEST_PAYER_EMAIL: optionalEnv(z.string().email()),
  RESEND_API_KEY: optionalEnv(z.string().min(1)),
  EMAIL_FROM: optionalEnv(z.string().min(1)),
  AUTH_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32).default("dev-only-auth-secret-change-before-prod")
  ),
  SUPERADMIN_EMAIL: optionalEnv(z.string().email()),
  SUPERADMIN_PASSWORD_HASH: optionalEnv(z.string().regex(/^[a-f0-9]{64}$/i)),
  AUTH_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().max(60 * 60).default(60 * 15),
  AUTH_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30)
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const missing = result.error.issues.map((i) => i.path.join(".")).join(", ");
  console.error(`[env] Missing or invalid environment variables: ${missing}`);
  process.exit(1);
}

export const env = result.data;

if (env.NODE_ENV === "production") {
  const productionErrors: string[] = [];
  const origins = env.WEB_ORIGIN.split(",").map((origin) => origin.trim());
  const placeholderPattern = /replace|example\.com/i;

  if (env.AUTH_SECRET.startsWith("dev-") || placeholderPattern.test(env.AUTH_SECRET)) {
    productionErrors.push("AUTH_SECRET must be replaced");
  }
  if (!env.SUPERADMIN_EMAIL || !env.SUPERADMIN_PASSWORD_HASH) {
    productionErrors.push("SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD_HASH are required");
  }
  if (placeholderPattern.test(env.WEB_ORIGIN)) {
    productionErrors.push("WEB_ORIGIN must be your real production URL");
  }
  if (env.API_PUBLIC_URL && placeholderPattern.test(env.API_PUBLIC_URL)) {
    productionErrors.push("API_PUBLIC_URL must be your real production URL");
  }
  if (origins.some((origin) => !origin.startsWith("https://"))) {
    productionErrors.push("WEB_ORIGIN must contain only HTTPS origins");
  }
  if (env.API_PUBLIC_URL && !env.API_PUBLIC_URL.startsWith("https://")) {
    productionErrors.push("API_PUBLIC_URL must use HTTPS");
  }
  if (/localhost|127\.0\.0\.1/i.test(env.DATABASE_URL)) {
    productionErrors.push("DATABASE_URL cannot point to localhost");
  }
  if (!env.MERCADOPAGO_ACCESS_TOKEN?.startsWith("APP_USR-")) {
    productionErrors.push("MERCADOPAGO_ACCESS_TOKEN must be a production token");
  }
  if (!env.MERCADOPAGO_WEBHOOK_SECRET) {
    productionErrors.push("MERCADOPAGO_WEBHOOK_SECRET is required");
  }
  if (
    env.MERCADOPAGO_WEBHOOK_SECRET &&
    placeholderPattern.test(env.MERCADOPAGO_WEBHOOK_SECRET)
  ) {
    productionErrors.push("MERCADOPAGO_WEBHOOK_SECRET must be replaced");
  }
  if (env.MERCADOPAGO_TEST_PAYER_EMAIL) {
    productionErrors.push("MERCADOPAGO_TEST_PAYER_EMAIL is forbidden");
  }
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    productionErrors.push("RESEND_API_KEY and EMAIL_FROM are required");
  }
  if (
    (env.RESEND_API_KEY && placeholderPattern.test(env.RESEND_API_KEY)) ||
    (env.EMAIL_FROM && placeholderPattern.test(env.EMAIL_FROM))
  ) {
    productionErrors.push("RESEND_API_KEY and EMAIL_FROM must be production values");
  }
  if (productionErrors.length > 0) {
    throw new Error(`Unsafe production environment: ${productionErrors.join("; ")}`);
  }
}
