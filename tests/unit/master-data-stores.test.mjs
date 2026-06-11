import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function readProjectFile(...segments) {
  return readFileSync(path.join(root, ...segments), "utf8");
}

function assertProjectFile(...segments) {
  const filePath = path.join(root, ...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return filePath;
}

test("Prisma schema supports store last modifier and audit logs", () => {
  const schema = readProjectFile("prisma", "schema.prisma");
  const migrationsRoot = path.join(root, "prisma", "migrations");
  const migrationNames = existsSync(migrationsRoot)
    ? readdirSync(migrationsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
  const storyMigration = migrationNames
    .filter((name) => name > "20260529121000_add_store_assignments")
    .find((name) => {
      const migrationPath = path.join(migrationsRoot, name, "migration.sql");
      return (
        existsSync(migrationPath) &&
        /CREATE TABLE "AuditLog"/.test(readFileSync(migrationPath, "utf8"))
      );
    });

  assert.match(schema, /model\s+Store\s*{[^}]*updatedById\s+String\?[^}]*}/s);
  assert.match(schema, /model\s+Store\s*{[^}]*name\s+String\s+@unique[^}]*}/s);
  assert.match(
    schema,
    /model\s+Store\s*{[^}]*updatedBy\s+User\?[^}]*@relation/s,
  );
  assert.match(schema, /model\s+User\s*{[^}]*updatedStores\s+Store\[\][^}]*}/s);
  assert.match(schema, /model\s+User\s*{[^}]*auditLogs\s+AuditLog\[\][^}]*}/s);
  assert.match(schema, /model\s+AuditLog\s*{[^}]*action\s+String[^}]*}/s);
  assert.match(
    schema,
    /model\s+AuditLog\s*{[^}]*targetType\s+String[^}]*targetId\s+String[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+AuditLog\s*{[^}]*actorId\s+String[^}]*actor\s+User[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+AuditLog\s*{[^}]*before\s+Json\?[^}]*after\s+Json\?[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+AuditLog\s*{[^}]*createdAt\s+DateTime\s+@default\(now\(\)\)[^}]*}/s,
  );
  assert.ok(
    storyMigration,
    "Story 1.3 must add AuditLog in a new migration after Store assignments",
  );
  assert.match(
    readFileSync(
      path.join(migrationsRoot, storyMigration, "migration.sql"),
      "utf8",
    ),
    /CREATE UNIQUE INDEX "Store_name_key" ON "Store"\("name"\)/,
  );
});

test("master-data store schema trims names and returns Korean field errors", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "master-data",
    "schemas.ts",
  );
  const { storeFormSchema } = await import(pathToFileURL(schemaPath).href);

  assert.equal(
    storeFormSchema.parse({ name: "  노량진점  ", isActive: true }).name,
    "노량진점",
  );

  const blank = storeFormSchema.safeParse({ name: "   ", isActive: true });
  assert.equal(blank.success, false);
  assert.deepEqual(blank.error.flatten().fieldErrors.name, [
    "지점명을 입력해 주세요.",
  ]);

  const tooLong = storeFormSchema.safeParse({
    name: "가".repeat(81),
    isActive: true,
  });
  assert.equal(tooLong.success, false);
  assert.deepEqual(tooLong.error.flatten().fieldErrors.name, [
    "지점명은 80자 이하여야 합니다.",
  ]);
});

test("master-data actions enforce headquarters authorization, audit, transactions, and revalidation", () => {
  const actions = readProjectFile(
    "src",
    "features",
    "master-data",
    "actions.ts",
  );

  assert.match(actions, /"use server"/);
  assert.match(actions, /export\s+async\s+function\s+createStore/);
  assert.match(actions, /export\s+async\s+function\s+updateStore/);
  assert.match(actions, /export\s+async\s+function\s+updateStoreStatus/);
  assert.match(actions, /requireSettingsAccess\(\)/);
  assert.match(actions, /db\.\$transaction/);
  assert.match(actions, /writeAuditLog/);
  assert.match(actions, /store\.created/);
  assert.match(actions, /store\.updated/);
  assert.match(actions, /store\.activated/);
  assert.match(actions, /store\.deactivated/);
  assert.match(actions, /revalidatePath\("\/app\/master-data\/stores"\)/);
  assert.match(actions, /status:\s*"unchanged"/);
  assert.match(
    actions,
    /if\s*\(existing\.isActive\s*===\s*parsed\.data\.isActive\)/,
  );
  assert.doesNotMatch(actions, /export\s+async\s+function\s+deleteStore/);
  assert.doesNotMatch(actions, /\.delete\(/);
});

test("master-data queries and audit helper use the shared server boundaries", () => {
  const queries = readProjectFile(
    "src",
    "features",
    "master-data",
    "queries.ts",
  );
  const audit = readProjectFile("src", "server", "audit.ts");
  const actionResult = readProjectFile("src", "lib", "action-result.ts");

  assert.match(queries, /getStoresForHeadquarters/);
  assert.match(queries, /getActiveStoreOptions/);
  assert.match(queries, /requireSettingsAccess\(\)/);
  assert.match(queries, /isActive:\s*true/);
  assert.match(audit, /export\s+async\s+function\s+writeAuditLog/);
  assert.match(audit, /actorId/);
  assert.match(audit, /targetType/);
  assert.match(audit, /before/);
  assert.match(audit, /after/);
  assert.match(actionResult, /type\s+ActionResult/);
  assert.match(actionResult, /fieldErrors/);
});

test("headquarters navigation points 기준정보 to the store management route", () => {
  const sidebar = readProjectFile("src", "components", "app-sidebar.tsx");
  const storesPage = readProjectFile(
    "src",
    "app",
    "app",
    "master-data",
    "stores",
    "page.tsx",
  );

  assert.match(sidebar, /href:\s*"\/app\/master-data\/stores"/);
  assert.doesNotMatch(sidebar, /dashboard#master-data/);
  assert.match(storesPage, /requireSettingsAccess/);
  assert.match(storesPage, /HeadquartersShell/);
});

test("store management UI preserves combined filters and uses status-only row saves", () => {
  const client = readProjectFile(
    "src",
    "features",
    "master-data",
    "components",
    "store-management-client.tsx",
  );

  assert.match(client, /updateStoreStatus/);
  assert.match(
    client,
    /pushFilters\(\{\s*q:\s*filters\.q,\s*status:\s*nextStatus\s*\}\)/,
  );
  assert.match(client, /const result = await updateStoreStatus/);
  assert.match(client, /if \(!result\.ok\)/);
  assert.match(client, /!isRowStatusChanged/);
});

test("e2e global setup requires an isolated test database", () => {
  const globalSetup = readProjectFile("tests", "e2e", "global-setup.ts");
  const playwrightConfig = readProjectFile("playwright.config.ts");

  assert.match(globalSetup, /DATABASE_URL is required/);
  assert.match(globalSetup, /test|e2e/);
  assert.doesNotMatch(globalSetup, /localhost:55432\/erp_fish"/);
  assert.match(playwrightConfig, /erp_fish_e2e/);
});
