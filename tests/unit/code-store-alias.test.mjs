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

test("store alias action keeps expense scope and protects loss aliases", () => {
  const actionSource = readProjectFile(
    "src",
    "features",
    "master-data",
    "code-alias-actions.ts",
  );

  // 지출 항목은 지점장 본인 지점만 수정 가능하도록 store 범위 가드를 탄다.
  assert.match(
    actionSource,
    /requireStoreManagerLedgerEditAccess\(parsed\.data\.storeId\)/,
  );
  // 손실 유형은 같은 action을 직접 호출해도 본사 설정 권한을 탄다.
  assert.match(actionSource, /requireSettingsAccess/);
  assert.match(actionSource, /authorizedCode\.group === "LOSS_TYPE"/);
  // 권한 검사 뒤 코드 종류가 바뀌는 틈을 막도록, 저장 트랜잭션에서 행을
  // 잠그고 처음 권한을 판정한 종류와 다시 비교한다.
  assert.match(actionSource, /FROM "LedgerInputCode"[\s\S]*FOR UPDATE/);
  assert.match(actionSource, /code\.group !== authorizedCode\.group/);
  assert.match(actionSource, /LEDGER_INPUT_CODE_CHANGED/);
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

test("loss query keeps canonical names even when an old alias row exists", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "losses",
    "queries.ts",
  );

  // 기존 alias 행은 지우지 않지만 손실 유형 조회에는 적용하지 않는다.
  assert.doesNotMatch(querySource, /ledgerInputCodeStoreAlias\.findMany/);
  assert.doesNotMatch(querySource, /lossTypeAliasByCodeId/);
  assert.match(querySource, /\blossTypeOptions\s*,/);
  // 기존 행은 저장 당시 이름을 보존하고, 새 선택지만 canonical 목록을 쓴다.
  assert.match(querySource, /lossTypeName:\s*true/);
  assert.match(querySource, /이미 저장된 손실 행의/);
});

test("store manager loss page does not render an alias editor", () => {
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "store-entry",
    "losses",
    "page.tsx",
  );
  // 손실 유형 alias 편집기는 지점장 화면에서 제거됐다.
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

  assert.doesNotMatch(pageSource, /LossTypeAliasEditor/);
  assert.ok(wrapperSource.length > 0);
  assert.match(editorSource, /setLedgerInputCodeStoreAlias/);
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

  // 내부 expenseItem 키는 유지하고 사용자에게는 지출 항목으로 표시한다.
  assert.match(editorSource, /groupKey:\s*CodeAliasGroupKey/);
  assert.match(termsSource, /lossType:/);
  assert.match(termsSource, /expenseItem:/);
  assert.match(termsSource, /손실 유형 표시명/);
  assert.match(termsSource, /heading:\s*"지출 항목 표시명"/);
  assert.match(
    termsSource,
    /본사가 등록한 지출 항목의 표시명을 이 지점 화면에서만 바꿀 수 있습니다\./,
  );
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
