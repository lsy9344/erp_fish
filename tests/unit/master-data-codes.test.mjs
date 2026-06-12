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

test("Prisma schema adds ledger input codes without hard-delete semantics", () => {
  const schema = readProjectFile("prisma", "schema.prisma");
  const migrationsRoot = projectPath("prisma", "migrations");
  const migrationNames = existsSync(migrationsRoot)
    ? readdirSync(migrationsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
  const storyMigration = migrationNames
    .filter(
      (name) => name > "20260529150000_add_product_and_purchase_standards",
    )
    .find((name) => {
      const migrationPath = path.join(migrationsRoot, name, "migration.sql");
      return (
        existsSync(migrationPath) &&
        /CREATE TYPE "LedgerInputCodeGroup"/.test(
          readFileSync(migrationPath, "utf8"),
        ) &&
        /CREATE TABLE "LedgerInputCode"/.test(
          readFileSync(migrationPath, "utf8"),
        )
      );
    });

  assert.match(
    schema,
    /enum\s+LedgerInputCodeGroup\s*{[^}]*PAYMENT_METHOD[^}]*EXPENSE_ITEM[^}]*LOSS_TYPE[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+LedgerInputCode\s*{[^}]*id\s+String\s+@id[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+LedgerInputCode\s*{[^}]*group\s+LedgerInputCodeGroup[^}]*}/s,
  );
  assert.match(schema, /model\s+LedgerInputCode\s*{[^}]*name\s+String[^}]*}/s);
  assert.match(
    schema,
    /model\s+LedgerInputCode\s*{[^}]*displayOrder\s+Int[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+LedgerInputCode\s*{[^}]*isActive\s+Boolean\s+@default\(true\)[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+LedgerInputCode\s*{[^}]*updatedById\s+String\?[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+LedgerInputCode\s*{[^}]*updatedBy\s+User\?[^}]*@relation/s,
  );
  assert.match(
    schema,
    /model\s+LedgerInputCode\s*{[^}]*@@unique\(\[group,\s*name\]\)[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+LedgerInputCode\s*{[^}]*@@index\(\[group,\s*displayOrder\]\)[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+User\s*{[^}]*updatedLedgerInputCodes\s+LedgerInputCode\[\][^}]*}/s,
  );
  assert.ok(
    storyMigration,
    "LedgerInputCode must be present from the existing code-management migration",
  );
  const migrationSql = readFileSync(
    path.join(migrationsRoot, storyMigration, "migration.sql"),
    "utf8",
  );
  assert.match(
    migrationSql,
    /CREATE UNIQUE INDEX "LedgerInputCode_group_name_key" ON "LedgerInputCode"\("group", "name"\)/,
  );
});

test("ledger input code schemas normalize input and return Korean field errors", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "master-data",
    "code-schemas.ts",
  );
  const {
    LEDGER_INPUT_CODE_GROUPS,
    ledgerInputCodeFormSchema,
    ledgerInputCodeStatusSchema,
  } = await import(pathToFileURL(schemaPath).href);

  assert.deepEqual(
    LEDGER_INPUT_CODE_GROUPS.map((group) => group.value),
    ["PAYMENT_METHOD", "EXPENSE_ITEM", "LOSS_TYPE"],
  );
  assert.deepEqual(
    ledgerInputCodeFormSchema.parse({
      group: "PAYMENT_METHOD",
      name: "  스토리54 현금  ",
      displayOrder: "10",
    }),
    {
      group: "PAYMENT_METHOD",
      name: "스토리54 현금",
      displayOrder: 10,
    },
  );
  assert.deepEqual(ledgerInputCodeStatusSchema.parse({ isActive: false }), {
    isActive: false,
  });

  const blank = ledgerInputCodeFormSchema.safeParse({
    group: "",
    name: " ",
    displayOrder: "-1",
  });
  assert.equal(blank.success, false);
  assert.deepEqual(blank.error.flatten().fieldErrors.group, [
    "코드 그룹을 선택해 주세요.",
  ]);
  assert.deepEqual(blank.error.flatten().fieldErrors.name, [
    "코드명을 입력해 주세요.",
  ]);
  assert.deepEqual(blank.error.flatten().fieldErrors.displayOrder, [
    "표시 순서는 0 이상의 정수여야 합니다.",
  ]);

  const decimal = ledgerInputCodeFormSchema.safeParse({
    group: "EXPENSE_ITEM",
    name: "식대",
    displayOrder: "1.5",
  });
  assert.equal(decimal.success, false);
  assert.deepEqual(decimal.error.flatten().fieldErrors.displayOrder, [
    "표시 순서는 0 이상의 정수여야 합니다.",
  ]);

  const tooLarge = ledgerInputCodeFormSchema.safeParse({
    group: "LOSS_TYPE",
    name: "폐기",
    displayOrder: "2147483648",
  });
  assert.equal(tooLarge.success, false);
  assert.deepEqual(tooLarge.error.flatten().fieldErrors.displayOrder, [
    "표시 순서는 0 이상의 정수여야 합니다.",
  ]);
});

test("ledger input code actions enforce auth, audit, transactions, and revalidation", () => {
  const codeActions = readProjectFile(
    "src",
    "features",
    "master-data",
    "code-actions.ts",
  );

  assert.match(codeActions, /"use server"/);
  assert.match(
    codeActions,
    /export\s+async\s+function\s+createLedgerInputCode/,
  );
  assert.match(
    codeActions,
    /export\s+async\s+function\s+updateLedgerInputCode/,
  );
  assert.match(
    codeActions,
    /export\s+async\s+function\s+updateLedgerInputCodeStatus/,
  );
  assert.match(codeActions, /requireSettingsAccess\(\)/);
  assert.match(codeActions, /db\.\$transaction/);
  assert.match(codeActions, /writeAuditLog/);
  assert.match(codeActions, /ledger_input_code\.created/);
  assert.match(codeActions, /ledger_input_code\.updated/);
  assert.match(codeActions, /ledger_input_code\.reordered/);
  assert.match(codeActions, /ledger_input_code\.activated/);
  assert.match(codeActions, /ledger_input_code\.deactivated/);
  assert.match(codeActions, /MAX_LEDGER_INPUT_CODE_DISPLAY_ORDER/);
  assert.match(codeActions, /AUTO_DISPLAY_ORDER_LIMIT_EXCEEDED/);
  assert.match(codeActions, /ActionResult/);
  assert.match(codeActions, /DUPLICATE_LEDGER_INPUT_CODE/);
  assert.match(codeActions, /revalidatePath\("\/app\/master-data\/codes"\)/);
  assert.match(codeActions, /revalidatePath\("\/app\/dashboard"\)/);
  assert.match(codeActions, /revalidatePath\("\/app\/store-entry"\)/);
  assert.match(
    codeActions,
    /revalidatePath\("\/app\/store-entry\/inventory"\)/,
  );
  assert.match(codeActions, /revalidatePath\("\/app\/store-entry\/losses"\)/);
  assert.doesNotMatch(
    codeActions,
    /export\s+async\s+function\s+deleteLedgerInputCode/,
  );
  assert.doesNotMatch(codeActions, /\.delete\(/);
});

test("ledger input code queries expose headquarters lists and authenticated active options", () => {
  const codeQueries = readProjectFile(
    "src",
    "features",
    "master-data",
    "code-queries.ts",
  );

  assert.match(codeQueries, /getLedgerInputCodesForHeadquarters/);
  assert.match(codeQueries, /getActiveLedgerInputCodeOptions/);
  assert.match(codeQueries, /normalizeLedgerInputCodeGroupFilter/);
  assert.match(codeQueries, /normalizeLedgerInputCodeStatusFilter/);
  assert.match(codeQueries, /normalizeLedgerInputCodeSearch/);
  assert.match(codeQueries, /requireSettingsAccess\(\)/);
  assert.match(codeQueries, /requireAppUser\(\)/);
  assert.match(codeQueries, /isActive:\s*true/);
  assert.match(codeQueries, /displayOrder:\s*"asc"/);
  assert.match(codeQueries, /name:\s*"asc"/);
});

test("ledger input code screen follows headquarters shell and form accessibility contracts", () => {
  const codesPage = readProjectFile(
    "src",
    "app",
    "app",
    "master-data",
    "codes",
    "page.tsx",
  );
  const codeClient = readProjectFile(
    "src",
    "features",
    "master-data",
    "components",
    "code-management-client.tsx",
  );
  const sidebar = readProjectFile("src", "components", "app-sidebar.tsx");

  assert.match(codesPage, /requireSettingsAccess/);
  assert.match(codesPage, /HeadquartersShell/);
  assert.match(codesPage, /CodeManagementClient/);
  assert.match(codeClient, /inputMode="numeric"/);
  assert.match(codeClient, /aria-invalid/);
  assert.match(codeClient, /aria-describedby/);
  assert.match(codeClient, /focusFirstError/);
  assert.match(sidebar, /\/app\/master-data\/codes/);
});
