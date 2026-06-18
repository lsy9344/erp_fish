import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();
const authSchemaModuleUrl = pathToFileURL(
  path.join(root, "src", "features", "auth", "schema.ts"),
);

test("Prisma models include internal roles and password hash storage", () => {
  const schema = readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");

  assert.match(schema, /enum\s+UserRole\s*{[^}]*HEADQUARTERS[^}]*STORE_MANAGER[^}]*}/s);
  assert.match(schema, /model\s+User\s*{[^}]*role\s+UserRole\s+@default\(STORE_MANAGER\)[^}]*}/s);
  assert.match(schema, /model\s+User\s*{[^}]*passwordHash\s+String\?[^}]*}/s);
});

test("Prisma models include active stores and explicit user-store assignments", () => {
  const schema = readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
  const migrationsRoot = path.join(root, "prisma", "migrations");
  const migrationNames = existsSync(migrationsRoot)
    ? readdirSync(migrationsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
  const storeMigration = migrationNames
    .filter((name) => name !== "20260529120000_init")
    .find((name) =>
      existsSync(path.join(migrationsRoot, name, "migration.sql")) &&
      /CREATE TABLE "Store"|CREATE TABLE "UserStoreAssignment"/.test(
        readFileSync(path.join(migrationsRoot, name, "migration.sql"), "utf8"),
      ),
    );

  assert.match(schema, /model\s+Store\s*{[^}]*id\s+String\s+@id\s+@default\(cuid\(\)\)[^}]*}/s);
  assert.match(schema, /model\s+Store\s*{[^}]*name\s+String[^}]*isActive\s+Boolean\s+@default\(true\)[^}]*}/s);
  assert.match(schema, /model\s+Store\s*{[^}]*createdAt\s+DateTime\s+@default\(now\(\)\)[^}]*updatedAt\s+DateTime\s+@updatedAt[^}]*}/s);
  assert.match(schema, /model\s+UserStoreAssignment\s*{[^}]*userId\s+String[^}]*storeId\s+String[^}]*}/s);
  assert.match(schema, /model\s+UserStoreAssignment\s*{[^}]*@@id\(\[userId,\s*storeId\]\)[^}]*}/s);
  assert.match(schema, /model\s+User\s*{[^}]*storeAssignments\s+UserStoreAssignment\[\][^}]*}/s);
  assert.ok(storeMigration, "Store tables must be added in a new migration, not the init migration");
  assert.ok(
    storeMigration > "20260529120000_init",
    "Store assignment migration must run after the init migration that creates User",
  );
});

test("Prisma models include explicit permission profiles and action assignments", () => {
  const schema = readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
  const migrationsRoot = path.join(root, "prisma", "migrations");
  const migrationNames = existsSync(migrationsRoot)
    ? readdirSync(migrationsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
  const permissionMigration = migrationNames.find((name) =>
    existsSync(path.join(migrationsRoot, name, "migration.sql")) &&
    /CREATE TABLE "PermissionProfile"|CREATE TYPE "PermissionAction"/.test(
      readFileSync(path.join(migrationsRoot, name, "migration.sql"), "utf8"),
    ),
  );

  assert.match(schema, /enum\s+StoreAccessMode\s*{[^}]*ALL_STORES[^}]*ASSIGNED_STORES[^}]*}/s);
  assert.match(schema, /enum\s+PermissionAction\s*{[^}]*LEDGER_CREATE[^}]*LEDGER_EDIT[^}]*LEDGER_HQ_CLOSE[^}]*CORRECTION_CREATE[^}]*UPLOAD_PREVIEW[^}]*UPLOAD_COMMIT[^}]*SETTINGS_MANAGE[^}]*REPORT_VIEW[^}]*EXPORT_CREATE[^}]*USER_PERMISSION_MANAGE[^}]*}/s);
  assert.match(schema, /model\s+PermissionProfile\s*{[^}]*id\s+String\s+@id\s+@default\(cuid\(\)\)[^}]*code\s+String\s+@unique[^}]*name\s+String[^}]*description\s+String\?[^}]*isSystem\s+Boolean\s+@default\(false\)[^}]*isActive\s+Boolean\s+@default\(true\)[^}]*storeAccessMode\s+StoreAccessMode[^}]*createdAt\s+DateTime\s+@default\(now\(\)\)[^}]*updatedAt\s+DateTime\s+@updatedAt[^}]*}/s);
  assert.match(schema, /model\s+PermissionProfileAction\s*{[^}]*profileId\s+String[^}]*action\s+PermissionAction[^}]*@@id\(\[profileId,\s*action\]\)[^}]*}/s);
  assert.match(schema, /model\s+UserPermissionProfile\s*{[^}]*userId\s+String[^}]*profileId\s+String[^}]*@@id\(\[userId,\s*profileId\]\)[^}]*}/s);
  assert.match(schema, /model\s+User\s*{[^}]*permissionProfiles\s+UserPermissionProfile\[\][^}]*}/s);
  assert.ok(permissionMigration, "permission profile tables must be added in a new migration");
});

test("seed flow uses environment-provided headquarters credentials", () => {
  const seedPath = path.join(root, "prisma", "seed.ts");
  assert.ok(existsSync(seedPath), "prisma/seed.ts should exist");

  const seed = readFileSync(seedPath, "utf8");
  assert.match(seed, /SEED_HQ_EMAIL/);
  assert.match(seed, /SEED_HQ_PASSWORD/);
  assert.match(seed, /SEED_HQ_PASSWORD_MIN_LENGTH/);
  assert.match(seed, /ALLOW_PRODUCTION_SEED/);
  assert.match(seed, /ALLOW_SEED_PASSWORD_ROTATION/);
  assert.match(seed, /existingUser\.role !== UserRole\.HEADQUARTERS/);
  assert.doesNotMatch(seed, /password123|admin123|changeme/i);

  const envExample = readFileSync(path.join(root, ".env.example"), "utf8");
  assert.match(envExample, /AUTH_SECRET=/);
  assert.match(envExample, /DATABASE_URL=/);
  assert.match(envExample, /SEED_HQ_EMAIL=/);
  assert.match(envExample, /SEED_HQ_PASSWORD=/);
  assert.match(envExample, /ALLOW_PRODUCTION_SEED=/);
  assert.match(envExample, /ALLOW_SEED_PASSWORD_ROTATION=/);
});

test("seed flow idempotently creates system permission profiles and safe fixtures", () => {
  const seed = readFileSync(path.join(root, "prisma", "seed.ts"), "utf8");

  for (const profile of [
    "OWNER",
    "HQ_ADMIN",
    "HQ_STAFF",
    "CLOSE_MANAGER",
    "UPLOAD_STAFF",
    "SETTINGS_ADMIN",
    "HQ_READONLY",
    "STORE_MANAGER",
  ]) {
    assert.match(seed, new RegExp(`code:\\s*"${profile}"`));
  }

  for (const action of [
    "LEDGER_CREATE",
    "LEDGER_EDIT",
    "LEDGER_HQ_CLOSE",
    "CORRECTION_CREATE",
    "UPLOAD_PREVIEW",
    "UPLOAD_COMMIT",
    "SETTINGS_MANAGE",
    "REPORT_VIEW",
    "EXPORT_CREATE",
    "USER_PERMISSION_MANAGE",
  ]) {
    assert.match(seed, new RegExp(`PermissionAction\\.${action}`));
  }

  assert.match(seed, /permissionProfile\.upsert/);
  assert.match(seed, /permissionProfileAction\.deleteMany/);
  assert.match(seed, /notIn:\s*\[\.\.\.profileDefinition\.actions\]/);
  assert.match(seed, /permissionProfileAction\.upsert/);
  assert.match(seed, /userPermissionProfile\.upsert/);
  assert.match(seed, /userStoreAssignment\.upsert/);
  assert.match(seed, /SEED_STORE_MANAGER_EMAIL/);
  assert.match(seed, /SEED_STORE_MANAGER_PASSWORD/);
  assert.match(seed, /SEED_SAMPLE_STORE_NAME/);
  assert.doesNotMatch(seed, /correct-password|store-password|manager123|password123|changeme/i);
});

test("auth environment validates production secret strength", () => {
  const env = readFileSync(path.join(root, "src", "env.js"), "utf8");

  assert.match(env, /AUTH_SECRET:[\s\S]*z\.string\(\)\.trim\(\)\.min\(32/);
});

test("auth environment prefers project .env over inherited Python-style PostgreSQL URLs", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousAuthSecret = process.env.AUTH_SECRET;
  const previousNodeEnv = process.env.NODE_ENV;
  const envExample = readFileSync(path.join(root, ".env"), "utf8");
  const expectedDatabaseUrl = envExample
    .match(/^DATABASE_URL=(.*)$/m)?.[1]
    ?.trim()
    .replace(/^"(.*)"$/, "$1");

  process.env.DATABASE_URL =
    "postgresql+asyncpg://postgres:password@127.0.0.1:55434/rider";
  process.env.AUTH_SECRET = "test-auth-secret-at-least-32-characters";
  process.env.NODE_ENV = "development";

  try {
    await import(
      `${pathToFileURL(path.join(root, "src", "env.js")).href}?normalize=${Date.now()}`
    );

    assert.equal(process.env.DATABASE_URL, expectedDatabaseUrl);
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }

    if (previousAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = previousAuthSecret;
    }

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test("login schema limits password input length", async () => {
  const { loginSchema } = await import(authSchemaModuleUrl.href);

  const result = loginSchema.safeParse({
    email: "hq@example.com",
    password: "x".repeat(1025),
  });

  assert.equal(result.success, false);
});

test("e2e global setup resets seeded store assignments before recreating fixtures", () => {
  const setup = readFileSync(path.join(root, "tests", "e2e", "global-setup.ts"), "utf8");

  assert.match(setup, /prisma\.userStoreAssignment\.deleteMany/);
  assert.match(setup, /userId:\s*{\s*in:/s);
  assert.match(setup, /manager\.id/);
  assert.match(setup, /unassignedManager\.id/);
  assert.match(setup, /inactiveOnlyManager\.id/);
});

test("login form clears pending state when sign-in throws", () => {
  const loginForm = readFileSync(path.join(root, "src", "features", "auth", "login-form.tsx"), "utf8");

  assert.match(loginForm, /try\s*{/);
  assert.match(loginForm, /catch\s*\{/);
  assert.match(loginForm, /finally\s*\{/);
  assert.match(loginForm, /setIsPending\(false\)/);
});
