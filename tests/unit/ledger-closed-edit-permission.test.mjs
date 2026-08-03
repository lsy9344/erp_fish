import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();

function readProjectFile(...segments) {
  return readFileSync(path.join(root, ...segments), "utf8");
}

// DESIGN.md D4: 마감 장부 직접 수정 전용 권한은 enum 추가, OWNER/HQ_ADMIN 전용
// 부여, 서버 최종 판정의 세 지점으로 구성된다. 이메일·이름 기반 판별을 금지한다.
test("LEDGER_CLOSED_EDIT action exists in schema, migration and seed", () => {
  const schemaSource = readProjectFile("prisma", "schema.prisma");
  assert.match(schemaSource, /enum PermissionAction[\s\S]*LEDGER_CLOSED_EDIT/);

  const migrationDirs = readdirSync(path.join(root, "prisma", "migrations"));
  const enumMigrationSource = readProjectFile(
    "prisma",
    "migrations",
    "20260731120000_add_ledger_closed_edit_permission",
    "migration.sql",
  );
  assert.match(
    enumMigrationSource,
    /ALTER TYPE "PermissionAction" ADD VALUE IF NOT EXISTS 'LEDGER_CLOSED_EDIT'/,
  );
  // 새 enum 값 추가 마이그레이션은 같은 트랜잭션에서 값을 사용할 수 없어 DML 금지.
  assert.doesNotMatch(enumMigrationSource, /INSERT|UPDATE|DELETE/i);

  // 기존 운영 DB는 migrate deploy만 돌리므로 별도 마이그레이션에서 OWNER/HQ_ADMIN에
  // 권한을 부여한다. ON CONFLICT DO NOTHING으로 재실행에도 안전해야 한다.
  const grantMigrationDir = migrationDirs.find((entry) =>
    entry.includes("grant_ledger_closed_edit"),
  );
  assert.ok(
    grantMigrationDir,
    "OWNER/HQ_ADMIN 권한 부여 마이그레이션이 있어야 한다",
  );
  const grantMigrationSource = readProjectFile(
    "prisma",
    "migrations",
    grantMigrationDir,
    "migration.sql",
  );
  assert.match(
    grantMigrationSource,
    /INSERT INTO "PermissionProfileAction"[\s\S]*'LEDGER_CLOSED_EDIT'/,
  );
  assert.match(
    grantMigrationSource,
    /"code" IN \('OWNER', 'HQ_ADMIN'\)/,
  );
  assert.match(grantMigrationSource, /ON CONFLICT[\s\S]*DO NOTHING/);
  // OWNER/HQ_ADMIN 외 프로파일에는 부여하지 않는다.
  assert.doesNotMatch(
    grantMigrationSource,
    /HQ_STAFF|CLOSE_MANAGER|SETTINGS_ADMIN|HQ_READONLY|STORE_MANAGER/,
  );

  const seedSource = readProjectFile("prisma", "seed.ts");
  // OWNER는 ALL_PERMISSION_ACTIONS 전체를 받으므로 새 action이 포함되어야 한다.
  assert.match(
    seedSource,
    /ALL_PERMISSION_ACTIONS = \[[\s\S]*PermissionAction\.LEDGER_CLOSED_EDIT[\s\S]*\] as const/,
  );
  // HQ_ADMIN 프로파일에도 명시적으로 부여한다.
  assert.match(
    seedSource,
    /code: "HQ_ADMIN"[\s\S]*?actions: \[[\s\S]*?PermissionAction\.LEDGER_CLOSED_EDIT/,
  );
  // HQ_STAFF/CLOSE_MANAGER에는 부여하지 않는다.
  assert.doesNotMatch(
    seedSource,
    /code: "HQ_STAFF"[\s\S]*?actions: \[[\s\S]*?LEDGER_CLOSED_EDIT/,
  );
  assert.doesNotMatch(
    seedSource,
    /code: "CLOSE_MANAGER"[\s\S]*?actions: \[[\s\S]*?LEDGER_CLOSED_EDIT/,
  );
});

test("server authz gates closed-ledger edits with LEDGER_CLOSED_EDIT on top of LEDGER_EDIT", () => {
  const authzSource = readProjectFile("src", "server", "authz.ts");

  // 기존 LEDGER_EDIT 게이트는 유지한다(다른 호출부 회귀 방지).
  assert.match(
    authzSource,
    /export async function requireLedgerHqEditAccess\(\) \{\s*return requireHeadquartersActionPermission\(PermissionAction\.LEDGER_EDIT\);/,
  );
  // 마감 편집 문맥은 LEDGER_EDIT 통과 후 LEDGER_CLOSED_EDIT 보유 여부를 반환한다.
  assert.match(
    authzSource,
    /export async function requireLedgerHqEditContext\(\)/,
  );
  assert.match(
    authzSource,
    /const user = await requireLedgerHqEditAccess\(\);/,
  );
  assert.match(
    authzSource,
    /hasActionPermission\(\s*user\.id,\s*PermissionAction\.LEDGER_CLOSED_EDIT,?\s*\)/,
  );
  assert.match(authzSource, /return \{ user, closedEditAllowed \};/);
  // 이메일·사용자 이름으로 마스터를 판별하지 않는다.
  assert.doesNotMatch(
    authzSource,
    /requireLedgerHqEditContext[\s\S]*?email\s*===/,
  );
});
