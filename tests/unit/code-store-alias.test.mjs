import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function assertProjectFile(...segments) {
  const filePath = path.join(root, ...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return filePath;
}

function readProjectFile(...segments) {
  return readFileSync(assertProjectFile(...segments), "utf8");
}

test("store alias schema trims display name and allows empty (clear) values", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "master-data",
    "code-schemas.ts",
  );
  const { ledgerInputCodeStoreAliasSchema } = await import(
    pathToFileURL(schemaPath).href
  );

  const trimmed = ledgerInputCodeStoreAliasSchema.parse({
    storeId: "  store-1  ",
    displayName: "  떨이 처리  ",
  });
  assert.deepEqual(trimmed, { storeId: "store-1", displayName: "떨이 처리" });

  // 빈 표시명은 alias 삭제 의도이므로 허용된다.
  const cleared = ledgerInputCodeStoreAliasSchema.parse({
    storeId: "store-1",
    displayName: "   ",
  });
  assert.equal(cleared.displayName, "");

  // 80자 초과는 거부한다.
  const tooLong = ledgerInputCodeStoreAliasSchema.safeParse({
    storeId: "store-1",
    displayName: "가".repeat(81),
  });
  assert.equal(tooLong.success, false);

  // 지점 ID가 비면 거부한다.
  const missingStore = ledgerInputCodeStoreAliasSchema.safeParse({
    storeId: "   ",
    displayName: "떨이",
  });
  assert.equal(missingStore.success, false);
});

test("store alias action is scoped to the store manager's own store and audited", () => {
  const actionSource = readProjectFile(
    "src",
    "features",
    "master-data",
    "code-alias-actions.ts",
  );

  // 지점장 본인 지점만 수정 가능하도록 store 범위 가드를 탄다.
  assert.match(
    actionSource,
    /requireStoreManagerLedgerEditAccess\(parsed\.data\.storeId\)/,
  );
  // 본사 전용 코드 등록/수정 권한(requireSettingsAccess)을 쓰지 않는다.
  assert.doesNotMatch(actionSource, /requireSettingsAccess/);
  // 생성/수정/삭제 모두 audit log를 남긴다.
  assert.match(actionSource, /ledger_input_code_store_alias\.created/);
  assert.match(actionSource, /ledger_input_code_store_alias\.updated/);
  assert.match(actionSource, /ledger_input_code_store_alias\.cleared/);
  assert.match(actionSource, /writeAuditLog/);
});

test("code registration stays headquarters only", () => {
  const codeActionSource = readProjectFile(
    "src",
    "features",
    "master-data",
    "code-actions.ts",
  );

  // 코드 등록/수정/상태변경은 본사 전용(requireSettingsAccess) 유지.
  assert.match(
    codeActionSource,
    /createLedgerInputCode[\s\S]*requireSettingsAccess/,
  );
  assert.match(
    codeActionSource,
    /updateLedgerInputCode[\s\S]*requireSettingsAccess/,
  );
});

test("loss query applies per-store alias to loss type display names", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "losses",
    "queries.ts",
  );

  // 지점별 alias를 조회해 표시명에 우선 적용한다.
  assert.match(querySource, /ledgerInputCodeStoreAlias\.findMany/);
  assert.match(querySource, /storeId:\s*ledger\.storeId/);
  assert.match(querySource, /lossTypeAliasByCodeId\.get\(option\.id\)\s*\?\?/);
  assert.match(querySource, /lossTypeOptions:\s*lossTypeOptionsWithAlias/);
});

test("store manager loss page renders the alias editor", () => {
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "store-entry",
    "losses",
    "page.tsx",
  );
  // WO-09: 손실 유형 편집기는 일반화된 InputCodeAliasEditor의 얇은 래퍼다.
  const wrapperSource = readProjectFile(
    "src",
    "features",
    "master-data",
    "components",
    "loss-type-alias-editor.tsx",
  );
  const editorSource = readProjectFile(
    "src",
    "features",
    "master-data",
    "components",
    "input-code-alias-editor.tsx",
  );

  assert.match(pageSource, /LossTypeAliasEditor/);
  assert.match(pageSource, /storeId=\{initialData\.storeId\}/);
  // 래퍼는 손실 유형 그룹으로 일반화 편집기에 위임한다.
  assert.match(wrapperSource, /InputCodeAliasEditor/);
  assert.match(wrapperSource, /groupKey="lossType"/);
  // 일반화 편집기가 alias 저장 action과 본사 등록명 fallback 안내를 담당한다.
  assert.match(editorSource, /setLedgerInputCodeStoreAlias/);
  assert.match(editorSource, /codeAliasTerms\.fallbackPlaceholder/);
  assert.match(editorSource, /isHydrated/);
  assert.match(editorSource, /setIsHydrated\(true\)/);
  assert.match(
    editorSource,
    /disabled=\{!isHydrated \|\| pendingId === option\.id\}/,
  );
  const aliasTermsSource = readProjectFile(
    "src",
    "features",
    "master-data",
    "code-alias-terms.ts",
  );
  assert.match(aliasTermsSource, /fallbackPlaceholder:\s*"본사 등록명 사용"/);
});

test("WO-09 input code alias editor and terms generalize loss type and expense item display names", () => {
  const editorSource = readProjectFile(
    "src",
    "features",
    "master-data",
    "components",
    "input-code-alias-editor.tsx",
  );
  const termsSource = readProjectFile(
    "src",
    "features",
    "master-data",
    "code-alias-terms.ts",
  );

  // 코드 그룹 키로 손실 유형/비용 항목 모두를 다룬다.
  assert.match(editorSource, /groupKey:\s*CodeAliasGroupKey/);
  assert.match(termsSource, /lossType:/);
  assert.match(termsSource, /expenseItem:/);
  assert.match(termsSource, /손실 유형 표시명/);
  assert.match(termsSource, /비용 항목 표시명/);
});

test("WO-09 expense item alias applies by store while headquarters keeps canonical names", () => {
  const queriesSource = readProjectFile(
    "src",
    "features",
    "master-data",
    "code-queries.ts",
  );
  const storePage = readProjectFile(
    "src",
    "app",
    "app",
    "store-entry",
    "page.tsx",
  );
  const hqPage = readProjectFile(
    "src",
    "app",
    "app",
    "ledgers",
    "[ledgerId]",
    "page.tsx",
  );

  // storeId가 있으면 지점별 alias 맵을 만들어 표시명을 덮어쓴다.
  assert.match(
    queriesSource,
    /getActiveLedgerInputCodeOptions[\s\S]*storeId\?:\s*string/,
  );
  assert.match(queriesSource, /ledgerInputCodeStoreAlias\.findMany/);
  assert.match(
    queriesSource,
    /aliasByCodeId\.get\(code\.id\)\s*\?\?\s*code\.name/,
  );

  // 지점장 화면은 store id를 넘겨 alias를 적용하고, 본사 화면은 인자 없이 canonical 유지.
  assert.match(
    storePage,
    /getActiveLedgerInputCodeOptions\(\s*"EXPENSE_ITEM",\s*[\s\S]*\.id/,
  );
  assert.match(storePage, /InputCodeAliasEditor/);
  assert.match(storePage, /groupKey="expenseItem"/);
  assert.match(hqPage, /getActiveLedgerInputCodeOptions\("EXPENSE_ITEM"\)/);
});
