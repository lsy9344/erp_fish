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

test("auth environment validates production secret strength", () => {
  const env = readFileSync(path.join(root, "src", "env.js"), "utf8");

  assert.match(env, /AUTH_SECRET:[\s\S]*z\.string\(\)\.trim\(\)\.min\(32/);
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
