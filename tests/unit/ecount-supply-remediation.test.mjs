import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// WO(2026-06-24) 검토 보완: 이카운트 출고/입고 전환 8개 미반영 사항 수정에 대한
// 소스/계약 수준 회귀 테스트. DB가 필요한 흐름은 e2e/통합에서 별도로 다룬다.

const root = process.cwd();

function readProjectFile(...segments) {
  const filePath = path.join(root, ...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return readFileSync(filePath, "utf8");
}

const purchaseStepClient = () =>
  readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "purchase-step-client.tsx",
  );
const hqEditActions = () =>
  readProjectFile("src", "features", "ledger", "hq-edit-actions.ts");
const storeActions = () =>
  readProjectFile("src", "features", "ledger", "actions.ts");
const queries = () =>
  readProjectFile("src", "features", "ledger", "queries.ts");
const commit = () =>
  readProjectFile("src", "features", "ledger", "ecount-supply-commit.ts");
const supplyActions = () =>
  readProjectFile("src", "features", "ledger", "ecount-supply-actions.ts");
const detailClient = () =>
  readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "ecount-supply-detail-client.tsx",
  );
const reportQueries = () =>
  readProjectFile(
    "src",
    "features",
    "reports",
    "ecount-supply-report-queries.ts",
  );
const reportPage = () =>
  readProjectFile("src", "app", "app", "reports", "ecount-supply", "page.tsx");
const e2eSpec = () =>
  readProjectFile("tests", "e2e", "ecount-supply-imports.spec.ts");
const auditFormat = () =>
  readProjectFile("src", "features", "audit", "audit-format.ts");

// #1 지점장도 이카운트 라인의 적용 단가를 수정할 수 있다(클라이언트 잠금 해제).
test("#1 applied unit-price is HQ-only: store-manager existing lines are locked", () => {
  // 정책 반전(2026-06-28): 적용 단가 수정은 본사 전용이다. 지점장(=hqEditReasonRequired
  // false)은 기존 매입 행의 단가를 못 바꾼다. 신규 수동 행의 최초 단가만 입력한다.
  const source = purchaseStepClient();

  // 기존 행 판별: 지점장 + 초기 매입 행 id 집합에 있는 행이면 단가 잠금.
  assert.match(
    source,
    /existingPurchaseLineIds/,
    "store-manager existing-line detection should exist",
  );
  const blockMatch = source.match(
    /const isUnitPriceEditBlocked =\s*([\s\S]*?);/,
  );
  assert.ok(blockMatch, "isUnitPriceEditBlocked should be defined");
  assert.match(
    blockMatch[1],
    /isStoreManagerExistingLine/,
    "unit-price lock must cover store-manager existing lines",
  );

  const flagMatch = source.match(
    /const isStoreManagerExistingLine =\s*([\s\S]*?);/,
  );
  assert.ok(flagMatch, "isStoreManagerExistingLine should be defined");
  assert.match(
    flagMatch[1],
    /!hqEditReasonRequired/,
    "store-manager lock should apply when not HQ (hqEditReasonRequired false)",
  );
  assert.match(
    flagMatch[1],
    /existingPurchaseLineIds\.current\.has\(line\.id\)/,
    "store-manager lock should only apply to existing (not new) purchase lines",
  );
});

// #2 본사 저장은 이카운트 원본 식별 필드를 입력값으로 바꾸지 않는다.
test("#2 HQ save forces ECOUNT raw fields from existing row", () => {
  const source = hqEditActions();

  assert.match(
    source,
    /const snapshot = isEcountUpload/,
    "HQ snapshot should branch on isEcountUpload to preserve raw fields",
  );
  // 이카운트 행의 수량도 입력이 아닌 기존 행에서 가져온다.
  assert.match(
    source,
    /const quantity = isEcountUpload\s*\?\s*decimalToNumber\(existing\.quantity\)/,
    "HQ save should keep ECOUNT quantity from existing row",
  );
});

// #2b 본사 저장 서버 정책은 이카운트 행 삭제/위조를 막아 원본 행 추적을 보존한다.
test("#2b HQ save rejects missing or forged ECOUNT rows", () => {
  const source = hqEditActions();

  assert.match(
    source,
    /existingEcountPurchaseIds/,
    "HQ save should derive the required ECOUNT row ids from the existing ledger",
  );
  assert.match(
    source,
    /missingEcountPurchaseIds/,
    "HQ save should detect existing ECOUNT rows omitted from the payload",
  );
  assert.match(
    source,
    /이카운트 원본 행은 삭제할 수 없습니다\./,
    "HQ save should reject deleting ECOUNT source rows",
  );
  assert.match(
    source,
    /purchase\.sourceType === "ECOUNT_UPLOAD" && !isEcountUpload/,
    "HQ save should reject forged or newly-created ECOUNT_UPLOAD rows",
  );
});

// #3 delete+recreate 후 원본 라인 back-pointer를 재동기화한다(양쪽 경로).
test("#3 back-pointer resync helper exists and is called on both save paths", () => {
  assert.match(
    queries(),
    /export async function syncEcountImportLineBackPointersInTx/,
    "queries should export back-pointer resync helper",
  );
  assert.match(
    hqEditActions(),
    /syncEcountImportLineBackPointersInTx\(tx, beforeLedger\.id\)/,
    "HQ save should resync ECOUNT back-pointer",
  );
  assert.match(
    storeActions(),
    /syncEcountImportLineBackPointersInTx\(tx, beforeLedger\.id\)/,
    "store save should resync ECOUNT back-pointer",
  );
});

// #4 적용 단가 보정 감사 로그가 원본/변경 전·후/수정자/사유를 구분해 남긴다.
test("#4 applied-price override audit is emitted with source and applied prices", () => {
  const source = hqEditActions();

  assert.match(
    source,
    /ledger\.hq\.ecount_unit_price\.overridden/,
    "should emit dedicated unit-price override audit action",
  );
  assert.match(
    auditFormat(),
    /"ledger\.hq\.ecount_unit_price\.overridden":\s*"본사 이카운트 출고\/입고 적용 단가 보정"/,
    "audit history should label the emitted ECOUNT override action",
  );
  assert.match(
    source,
    /newEcountPurchaseItemsByImportLineId/,
    "override audit should resolve the recreated purchase row before writing targetId",
  );
  assert.doesNotMatch(
    source,
    /targetId:\s*override\.ledgerPurchaseItemId/,
    "override audit must not target the deleted pre-recreate purchase row",
  );
  assert.match(
    source,
    /sourceUnitPrice/,
    "override audit includes source price",
  );
  assert.match(
    source,
    /appliedUnitPrice: override\.previousUnitPrice/,
    "override audit records previous applied price",
  );
  assert.match(
    source,
    /appliedUnitPrice: override\.nextUnitPrice/,
    "override audit records next applied price",
  );

  // 감사 payload의 매입 항목에 원본 단가/override 메타가 포함된다.
  assert.match(
    queries(),
    /function getLedgerAuditPurchaseItems/,
    "audit purchase payload mapper should include override metadata",
  );
  assert.match(queries(), /unitPriceOverridden:/);
});

// #5 commit 실패 시 batch가 FAILED로 내려가 재-commit되지 않는다.
test("#5 commit failure marks batch FAILED (not still committable)", () => {
  const source = commit();

  const handler = source.match(
    /if \(error instanceof EcountCommitError\)\s*\{([\s\S]*?)\n\s{4}\}/,
  );

  assert.ok(handler, "commit error handler should exist");
  assert.match(
    handler[1],
    /status: "FAILED"/,
    "commit failure should set batch status FAILED",
  );
  assert.match(
    handler[1],
    /notIn: \["COMMITTED", "VOIDED"\]/,
    "commit failure must not overwrite COMMITTED/VOIDED batches",
  );
});

// #6 미매핑 품목에 대해 새 앱 품목 생성 경로가 있다.
test("#6 new-product creation path exists in action and UI", () => {
  assert.match(
    supplyActions(),
    /export async function createEcountProductFromLine/,
    "should expose createEcountProductFromLine action",
  );
  assert.match(
    detailClient(),
    /createEcountProductFromLine/,
    "detail UI should call new-product creation action",
  );
  assert.match(
    detailClient(),
    /새 품목 생성/,
    "detail UI should render a 새 품목 생성 control",
  );
});

// WO-09(2026-06-28): 신규 품목 생성 시 분류는 본사가 직접 고른다(파서 추측 미사용).
test("WO-09: new-product creation requires a manually chosen category, not the parsed guess", () => {
  const action = supplyActions();
  const client = detailClient();

  // 액션은 category 입력을 받고 검증한다.
  assert.match(action, /category:\s*string/);
  assert.match(
    action,
    /NEW_PRODUCT_CATEGORIES\s*=\s*\[\s*"냉동",\s*"생물",\s*"기준 미정"/,
  );
  assert.match(action, /isNewProductCategory\(selectedCategory\)/);
  // 생성에 쓰는 분류는 파서가 채운 productCategory가 아니라 선택값이다.
  assert.match(action, /const category = selectedCategory;/);
  assert.doesNotMatch(action, /const category = sampleLine\.productCategory/);

  // UI는 분류 선택 드롭다운(냉동/생물/기준 미정)을 제공하고 생성 시 함께 보낸다.
  assert.match(client, /새 품목 분류/);
  assert.match(client, /기준 미정/);
  assert.match(client, /categorySelections/);
});

// #7 출고/입고 리포트에 품목 필터 UI가 있다.
test("#7 report exposes a product filter", () => {
  assert.match(
    reportQueries(),
    /productOptions/,
    "report query should return productOptions",
  );
  assert.match(
    reportPage(),
    /name="productId"/,
    "report page should render a productId filter control",
  );
  assert.match(reportPage(), /report\.productOptions\.map/);
});

// #8 e2e는 seed된 결과 확인만이 아니라 실제 upload→commit UI 경로를 탄다.
test("#8 e2e uploads an ECOUNT workbook and commits it through the UI", () => {
  const source = e2eSpec();

  assert.match(
    source,
    /setInputFiles/,
    "E2E should upload a workbook through the file input",
  );
  assert.match(
    source,
    /본사 장부에 반영/,
    "E2E should click the commit button",
  );
  assert.match(
    source,
    /e2e-ecount-upload/,
    "E2E should assert the newly uploaded file/report path, not only the global fixture",
  );
  assert.doesNotMatch(
    source,
    /업로드→매핑→commit transaction 계약은 unit/,
    "E2E should no longer document upload→commit as unit-only coverage",
  );
});

// WO-08(2026-06-28): 지점/품목 자동 등록 검증. alias를 한 번 저장하면 같은 batch의
// 같은 raw key 라인이 모두 재계산되고(recomputeBatchMappingInTx), 감사 로그가 남는다.
// 별도 "품목묭도"·"모두 적용" UI는 만들지 않는다(업로드 자동 등록/자동 매핑으로 정리).
test("WO-08: alias save recomputes whole batch with consistent raw keys and audits", () => {
  const source = supplyActions();

  // 두 저장 액션 모두 batch 전체 재계산 + 감사 로그를 호출한다.
  assert.match(source, /export async function saveEcountStoreAlias/);
  assert.match(source, /export async function saveEcountProductAlias/);
  assert.match(source, /async function recomputeBatchMappingInTx/);
  assert.match(source, /store_external_alias\.(created|updated)/);
  assert.match(source, /product_external_alias\.(created|updated)/);

  // recompute는 batch의 "모든" 라인을 돌며 같은 정규화 키(storeAliasKey/productAliasKey)로
  // 매핑을 다시 적용한다 → 같은 raw key 라인이 한 번에 갱신된다.
  const recompute =
    source.match(/async function recomputeBatchMappingInTx[\s\S]*?\n}/)?.[0] ??
    "";
  assert.match(recompute, /for \(const line of batch\.lines\)/);
  assert.match(recompute, /storeAliasKey\(line\.rawStoreName\)/);
  assert.match(
    recompute,
    /productAliasKey\(line\.rawProductName,\s*line\.productSpec\)/,
  );
  assert.match(recompute, /resolveBatchStatus\(lineStatuses\)/);

  // COMMITTED/VOIDED batch는 재계산하지 않는다(원본 보존).
  assert.match(
    recompute,
    /status === "COMMITTED"\s*\|\|\s*batch\.status === "VOIDED"/,
  );

  // loadAliasMaps도 같은 정규화 키를 써서 저장과 조회가 어긋나지 않게 한다.
  assert.match(source, /storeByRaw\.set\(storeAliasKey\(alias\.rawName\)/);
  assert.match(
    source,
    /productByRaw\.set\(\s*productAliasKey\(alias\.rawName,\s*alias\.rawSpec\)/,
  );
});

test("WO-08: no '품목묭도'/'모두 적용' UI remains", () => {
  const detail = detailClient();
  const supply = supplyActions();
  assert.doesNotMatch(detail, /품목묭도|모두 적용/);
  assert.doesNotMatch(supply, /품목묭도|모두 적용/);
});
