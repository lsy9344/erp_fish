import { createEnv } from "@t3-oss/env-nextjs";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const exampleAuthSecret =
  "replace-with-a-random-string-of-at-least-32-characters";
const productionAuthSecretSchema = z
  .string()
  .trim()
  .min(32)
  .refine((value) => value !== exampleAuthSecret, {
    message:
      "AUTH_SECRET must not use the .env.example placeholder in production.",
  });

/**
 * Some local shells expose SQLAlchemy-style PostgreSQL URLs. Prisma accepts the
 * same connection details, but only with the standard PostgreSQL protocol.
 *
 * @param {string | undefined} value
 */
function normalizePrismaDatabaseUrl(value) {
  if (!value) {
    return value;
  }

  return value
    .replace(/^postgresql\+asyncpg:\/\//, "postgresql://")
    .replace(/^postgres\+asyncpg:\/\//, "postgres://");
}

function readProjectDatabaseUrl() {
  if (process.env.NODE_ENV === "production") {
    return undefined;
  }

  const envPath = path.join(process.cwd(), ".env");

  if (!existsSync(envPath)) {
    return undefined;
  }

  const match = readFileSync(envPath, "utf8").match(/^DATABASE_URL=(.*)$/m);
  const value = match?.[1]?.trim();

  if (!value) {
    return undefined;
  }

  return value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
}

const inheritedDatabaseUrl = process.env.DATABASE_URL;
const projectDatabaseUrl = readProjectDatabaseUrl();
const shouldPreferProjectDatabaseUrl =
  !!projectDatabaseUrl &&
  /^postgres(?:ql)?\+asyncpg:\/\//.test(inheritedDatabaseUrl ?? "");
const databaseUrl = normalizePrismaDatabaseUrl(
  shouldPreferProjectDatabaseUrl ? projectDatabaseUrl : inheritedDatabaseUrl,
);

if (databaseUrl !== process.env.DATABASE_URL) {
  process.env.DATABASE_URL = databaseUrl;
}

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? productionAuthSecretSchema
        : z.string().trim().min(32).optional(),
    DATABASE_URL: z.string().url(),
    SEED_HQ_EMAIL: z.string().email().optional(),
    SEED_HQ_PASSWORD: z.string().min(12).optional(),
    SEED_HQ_NAME: z.string().optional(),
    ALLOW_PRODUCTION_SEED: z.enum(["true"]).optional(),
    ALLOW_SEED_PASSWORD_ROTATION: z.enum(["true"]).optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    AUTH_SECRET: process.env.AUTH_SECRET,
    DATABASE_URL: databaseUrl,
    SEED_HQ_EMAIL: process.env.SEED_HQ_EMAIL,
    SEED_HQ_PASSWORD: process.env.SEED_HQ_PASSWORD,
    SEED_HQ_NAME: process.env.SEED_HQ_NAME,
    ALLOW_PRODUCTION_SEED: process.env.ALLOW_PRODUCTION_SEED,
    ALLOW_SEED_PASSWORD_ROTATION: process.env.ALLOW_SEED_PASSWORD_ROTATION,
    NODE_ENV: process.env.NODE_ENV,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
