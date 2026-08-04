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
  // main의 첫 번째 운영 migration에 enum·supersede 스키마 변경을 함께 보존한다.
  const enumAndSupersedeMigrationSource = readProjectFile(
    "prisma",
    "migrations",
    "20260731112000_add_closed_ledger_edit_and_correction_supersede",
    "migration.sql",
  );
  assert.match(
    enumAndSupersedeMigrationSource,
    /ALTER TYPE "PermissionAction" ADD VALUE IF NOT EXISTS 'LEDGER_CLOSED_EDIT'/,
  );
  for (const field of ["supersededAt", "supersededById", "supersedeReason"]) {
    assert.match(enumAndSupersedeMigrationSource, new RegExp(`"${field}"`));
  }
  assert.match(
    enumAndSupersedeMigrationSource,
    /CorrectionRecord_supersededById_fkey[\s\S]*ON DELETE SET NULL/,
  );

  // 같은 enum 값을 사용하는 OWNER/HQ_ADMIN 권한 부여는 main의 후속 migration에서
  // 수행한다. 중복 feature migration은 최종 트리에 남기지 않는다.
  const permissionMigrationSource = readProjectFile(
    "prisma",
    "migrations",
    "20260731120000_add_ledger_closed_edit_permission",
    "migration.sql",
  );
  assert.match(
    permissionMigrationSource,
    /INSERT INTO "PermissionProfileAction"[\s\S]*'LEDGER_CLOSED_EDIT'/,
  );
  assert.match(
    permissionMigrationSource,
    /"code" IN \('OWNER', 'HQ_ADMIN'\)/,
  );
  assert.match(permissionMigrationSource, /ON CONFLICT[\s\S]*DO NOTHING/);
  assert.doesNotMatch(permissionMigrationSource, /ALTER TYPE/);
  assert.doesNotMatch(
    migrationDirs.join("\n"),
    /20260803120000_add_correction_superseded_at|20260803130000_grant_ledger_closed_edit_permission/,
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
