import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function projectPath(...segments) {
  return path.join(root, ...segments);
}

function readProjectFile(...segments) {
  return readFileSync(projectPath(...segments), "utf8");
}

function assertProjectFile(...segments) {
  const filePath = projectPath(...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return filePath;
}

test("Prisma schema supports user active status and modification timestamps", () => {
  const schema = readProjectFile("prisma", "schema.prisma");
  const migrationsRoot = projectPath("prisma", "migrations");
  const migrationNames = existsSync(migrationsRoot)
    ? readdirSync(migrationsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
  const storyMigration = migrationNames
    .filter((name) => name > "20260529125000_add_store_audit_fields")
    .find((name) => {
      const migrationPath = path.join(migrationsRoot, name, "migration.sql");
      return (
        existsSync(migrationPath) &&
        /ALTER TABLE "User" ADD COLUMN "isActive"/.test(
          readFileSync(migrationPath, "utf8"),
        )
      );
    });

  assert.match(
    schema,
    /model\s+User\s*{[^}]*isActive\s+Boolean\s+@default\(true\)[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+User\s*{[^}]*createdAt\s+DateTime\s+@default\(now\(\)\)[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+User\s*{[^}]*updatedAt\s+DateTime\s+@updatedAt[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+UserStoreAssignment\s*{[^}]*@@id\(\[userId,\s*storeId\]\)[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+AuditLog\s*{[^}]*actor\s+User\s+@relation\("AuditActor"[^}]*onDelete:\s*Restrict[^}]*}/s,
  );
  assert.ok(
    storyMigration,
    "Story 1.4 must add User isActive/timestamps in a new migration after Story 1.3",
  );
});

test("user management schemas normalize input and return Korean field errors", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "master-data",
    "user-schemas.ts",
  );
  const { createUserAccountSchema, updateUserAccountSchema } = await import(
    pathToFileURL(schemaPath).href
  );

  assert.equal(typeof createUserAccountSchema?.safeParse, "function");
  assert.equal(typeof updateUserAccountSchema?.safeParse, "function");

  const parsed = createUserAccountSchema.parse({
    name: "  스토리14 지점장  ",
    email: " STORY14@EXAMPLE.COM ",
    role: "STORE_MANAGER",
    initialPassword: "correct-password",
    storeIds: ["store-gangnam"],
  });

  assert.equal(parsed.name, "스토리14 지점장");
  assert.equal(parsed.email, "story14@example.com");
  assert.equal(parsed.isActive, true);

  const blankName = createUserAccountSchema.safeParse({
    name: " ",
    email: "story14@example.com",
    role: "HEADQUARTERS",
    initialPassword: "correct-password",
    storeIds: [],
  });
  assert.equal(blankName.success, false);
  assert.deepEqual(blankName.error.flatten().fieldErrors.name, [
    "이름을 입력해 주세요.",
  ]);

  const weakPassword = createUserAccountSchema.safeParse({
    name: "스토리14 지점장",
    email: "story14@example.com",
    role: "STORE_MANAGER",
    initialPassword: "short",
    storeIds: ["store-gangnam"],
  });
  assert.equal(weakPassword.success, false);
  assert.deepEqual(weakPassword.error.flatten().fieldErrors.initialPassword, [
    "초기 비밀번호는 12자 이상이어야 합니다.",
  ]);

  const noStore = createUserAccountSchema.safeParse({
    name: "스토리14 지점장",
    email: "story14@example.com",
    role: "STORE_MANAGER",
    initialPassword: "correct-password",
    storeIds: [],
  });
  assert.equal(noStore.success, false);
  assert.deepEqual(noStore.error.flatten().fieldErrors.storeIds, [
    "지점장은 하나 이상의 활성 지점에 배정해야 합니다.",
  ]);
});

test("user management server actions enforce auth, transactions, audit, hashing, and revalidation", () => {
  const actions = readProjectFile(
    "src",
    "features",
    "master-data",
    "user-actions.ts",
  );
  const queries = readProjectFile(
    "src",
    "features",
    "master-data",
    "user-queries.ts",
  );

  assert.match(actions, /"use server"/);
  assert.match(actions, /export\s+async\s+function\s+createUserAccount/);
  assert.match(actions, /export\s+async\s+function\s+updateUserAccount/);
  assert.match(actions, /export\s+async\s+function\s+updateUserStatus/);
  assert.match(actions, /requireUserPermissionAccess\(\)/);
  assert.match(actions, /db\.\$transaction/);
  assert.match(actions, /writeAuditLog/);
  assert.match(actions, /hashPassword/);
  assert.match(actions, /function\s+toAuditUserSnapshot/);
  assert.match(
    actions,
    /requiredAction:\s*PermissionAction\.USER_PERMISSION_MANAGE/,
  );
  assert.match(actions, /\.sort\(\)/);
  assert.match(
    actions,
    /before:\s*toAuditUserSnapshot\(before,\s*actorContext\)/,
  );
  assert.match(
    actions,
    /after:\s*toAuditUserSnapshot\(after,\s*actorContext\)/,
  );
  assert.match(actions, /user\.created/);
  assert.match(actions, /user\.role_changed/);
  assert.match(actions, /user\.store_assignments_changed/);
  assert.match(actions, /user\.deactivated/);
  assert.match(actions, /revalidatePath\("\/app\/master-data\/users"\)/);
  assert.match(actions, /SELF_PERMISSION_CHANGE/);
  assert.doesNotMatch(actions, /export\s+async\s+function\s+deleteUser/);
  assert.doesNotMatch(actions, /user\.delete/);

  assert.match(queries, /getUsersForHeadquarters/);
  assert.match(queries, /getUserManagementOptions/);
  assert.match(queries, /requireUserPermissionAccess\(\)/);
  assert.match(queries, /storeAssignments/);
  assert.match(queries, /updatedAt/);
});

test("seed preserves an intentionally disabled headquarters account", () => {
  const seed = readProjectFile("prisma", "seed.ts");
  const updateBlock = seed.match(
    /const headquartersUser = await prisma\.user\.upsert\(\{[\s\S]*?update:\s*{(?<body>[\s\S]*?)\n\s*},\n\s*}\);/,
  );

  assert.ok(
    updateBlock?.groups?.body,
    "seed headquarters update block should exist",
  );
  assert.doesNotMatch(
    updateBlock.groups.body,
    /isActive:\s*true/,
    "seed reruns must not reactivate a disabled headquarters account",
  );
});

test("user management client recovers from action exceptions and exposes action errors", () => {
  const client = readProjectFile(
    "src",
    "features",
    "master-data",
    "components",
    "user-management-client.tsx",
  );

  assert.match(client, /setFormError\(result\.error\.message\)/);
  assert.match(client, /catch\s*(?:\([^)]*\))?\s*{/);
  assert.match(client, /finally\s*{\s*setIsSaving\(false\);/);
  assert.match(client, /finally\s*{\s*setRowSavingId\(null\);/);
});

test("inactive users are blocked at login and protected server boundaries", () => {
  const authConfig = readProjectFile("src", "server", "auth", "config.ts");
  const authz = readProjectFile("src", "server", "authz.ts");
  const loginPage = readProjectFile("src", "app", "login", "page.tsx");

  assert.match(authConfig, /isActive/);
  assert.match(authConfig, /if\s*\(!user\.isActive\)/);
  assert.match(authz, /isActive:\s*true/);
  assert.match(authz, /getCurrentUserRecord/);
  assert.match(authz, /redirect\("\/login/);
  assert.match(loginPage, /appHomePath\.startsWith\("\/login"\)/);
});

test("headquarters navigation exposes user management without replacing store management", () => {
  const sidebar = readProjectFile("src", "components", "app-sidebar.tsx");
  const usersPage = readProjectFile(
    "src",
    "app",
    "app",
    "master-data",
    "users",
    "page.tsx",
  );

  assert.match(sidebar, /\/app\/master-data\/stores/);
  assert.match(sidebar, /\/app\/master-data\/users/);
  assert.match(usersPage, /requireUserPermissionAccess/);
  assert.match(usersPage, /HeadquartersShell/);
});
