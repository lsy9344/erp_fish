import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function projectPath(...segments) {
  return path.join(root, ...segments);
}

function assertProjectFile(...segments) {
  const filePath = projectPath(...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return filePath;
}

function readProjectFile(...segments) {
  return readFileSync(assertProjectFile(...segments), "utf8");
}

function getPrismaModelBlock(schema, modelName) {
  const block = schema.match(
    new RegExp(`model\\s+${modelName}\\s*{[^}]*}`, "s"),
  );

  assert.ok(block, `${modelName} model should exist`);

  return block[0];
}

test("purchase standard schema normalizes KRW integer input and rejects invalid values", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "master-data",
    "purchase-standard-schemas.ts",
  );
  const { purchaseStandardFormSchema, purchaseStandardStatusSchema } =
    await import(pathToFileURL(schemaPath).href);

  assert.deepEqual(
    purchaseStandardFormSchema.parse({
      productId: " story53-product ",
      standardUnitPrice: "",
      referenceInfo: "  Story 5.3 reference  ",
    }),
    {
      productId: "story53-product",
      standardUnitPrice: null,
      referenceInfo: "Story 5.3 reference",
      isActive: true,
    },
  );
  assert.deepEqual(
    purchaseStandardFormSchema.parse({
      productId: "story53-product",
      standardUnitPrice: "9900",
      referenceInfo: " ",
      isActive: false,
    }),
    {
      productId: "story53-product",
      standardUnitPrice: 9900,
      referenceInfo: null,
      isActive: false,
    },
  );
  assert.deepEqual(purchaseStandardStatusSchema.parse({ isActive: true }), {
    isActive: true,
  });

  for (const invalidUnitPrice of ["-1", "12.5", "1,000", "2147483648"]) {
    const result = purchaseStandardFormSchema.safeParse({
      productId: "story53-product",
      standardUnitPrice: invalidUnitPrice,
      referenceInfo: "",
    });

    assert.equal(result.success, false);
    assert.deepEqual(result.error.flatten().fieldErrors.standardUnitPrice, [
      "참고 단가는 0원 이상의 정수여야 합니다.",
    ]);
  }

  const missingRequiredReference = purchaseStandardFormSchema.safeParse({
    productId: " ",
    standardUnitPrice: "",
    referenceInfo: " ",
  });
  assert.equal(missingRequiredReference.success, false);
  assert.deepEqual(
    missingRequiredReference.error.flatten().fieldErrors.productId,
    ["품목을 선택해 주세요."],
  );
  assert.deepEqual(
    missingRequiredReference.error.flatten().fieldErrors.standardUnitPrice,
    ["참고 단가 또는 참조 정보를 입력해 주세요."],
  );
});

test("purchase standard model preserves active flags, audit ownership, and ledger snapshot references", () => {
  const schema = readProjectFile("prisma", "schema.prisma");
  const standardModel = getPrismaModelBlock(schema, "PurchaseStandard");
  const purchaseItemModel = getPrismaModelBlock(schema, "LedgerPurchaseItem");

  assert.match(standardModel, /id\s+String\s+@id/);
  assert.match(standardModel, /productId\s+String\s+@unique/);
  assert.match(standardModel, /standardUnitPrice\s+Int\?/);
  assert.match(standardModel, /referenceInfo\s+String\?/);
  assert.match(standardModel, /isActive\s+Boolean\s+@default\(true\)/);
  assert.match(standardModel, /updatedById\s+String\?/);
  assert.match(
    standardModel,
    /product\s+Product\s+@relation\([^)]*onDelete:\s*(?:Restrict|NoAction)[^)]*\)/,
  );
  assert.match(
    standardModel,
    /updatedBy\s+User\?\s+@relation\("PurchaseStandardUpdatedBy"[^)]*onDelete:\s*SetNull\)/,
  );
  assert.match(standardModel, /ledgerPurchaseItems\s+LedgerPurchaseItem\[\]/);
  assert.doesNotMatch(standardModel, /@@index\(\[productId\]\)/);
  assert.match(purchaseItemModel, /purchaseStandardId\s+String\?/);
  assert.match(
    purchaseItemModel,
    /purchaseStandard\s+PurchaseStandard\?\s+@relation\([^)]*onDelete:\s*SetNull\)/,
  );
  assert.match(purchaseItemModel, /productName\s+String/);
  assert.match(purchaseItemModel, /productCategory\s+String/);
  assert.match(purchaseItemModel, /productSpec\s+String/);
  assert.match(purchaseItemModel, /unitPrice\s+Int/);
  assert.match(
    purchaseItemModel,
    /quantity\s+Decimal\s+@db\.Decimal\(12,\s*2\)/,
  );
  assert.match(purchaseItemModel, /amount\s+Int/);
  assert.match(purchaseItemModel, /referenceInfo\s+String\?/);
});

test("purchase standard actions enforce settings auth, transaction audit, active-product rules, and revalidation", () => {
  const source = readProjectFile(
    "src",
    "features",
    "master-data",
    "purchase-standard-actions.ts",
  );

  assert.match(source, /"use server"/);
  assert.match(source, /export\s+async\s+function\s+createPurchaseStandard/);
  assert.match(source, /export\s+async\s+function\s+updatePurchaseStandard/);
  assert.match(
    source,
    /export\s+async\s+function\s+updatePurchaseStandardStatus/,
  );
  assert.match(source, /requireSettingsAccess\(\)/);
  assert.match(source, /db\.\$transaction/);
  assert.match(source, /writeAuditLog\(tx,/);
  assert.match(source, /purchase_standard\.created/);
  assert.match(source, /purchase_standard\.updated/);
  assert.match(source, /purchase_standard\.activated/);
  assert.match(source, /purchase_standard\.deactivated/);
  assert.match(source, /before:\s*toPurchaseStandardAuditValue\(existing\)/);
  assert.match(source, /after:\s*toPurchaseStandardAuditValue\(updated\)/);
  assert.match(source, /productId:\s*standard\.productId/);
  assert.match(source, /productName:\s*standard\.product\.name/);
  assert.match(source, /standardUnitPrice:\s*standard\.standardUnitPrice/);
  assert.match(source, /referenceInfo:\s*standard\.referenceInfo/);
  assert.match(source, /isActive:\s*standard\.isActive/);
  assert.match(source, /INACTIVE_PRODUCT_STANDARD_ACTIVATION/);
  assert.match(source, /DUPLICATE_PURCHASE_STANDARD/);
  assert.match(
    source,
    /purchaseStandard\.findUnique\(\{\s*where:\s*\{\s*productId/s,
  );
  assert.match(
    source,
    /getProductActiveState\(tx,\s*parsed\.data\.productId\)/,
  );
  assert.match(source, /parsed\.data\.isActive/);
  assert.match(source, /revalidateMasterDataPaths\("purchase-standards"\)/);
  assert.doesNotMatch(source, /export\s+async\s+function\s+delete/);
  assert.doesNotMatch(source, /\.delete\(/);
  assert.doesNotMatch(source, /ledgerPurchaseItem\.update/i);
});

test("purchase standard queries expose settings-only lists and active app options", () => {
  const source = readProjectFile(
    "src",
    "features",
    "master-data",
    "purchase-standard-queries.ts",
  );

  assert.match(source, /getPurchaseStandardsForHeadquarters/);
  assert.match(source, /getActivePurchaseStandardOptions/);
  assert.match(source, /normalizePurchaseStandardStatusFilter/);
  assert.match(source, /requireSettingsAccess\(\)/);
  assert.match(source, /requireAppUser\(\)/);
  assert.match(source, /productCategory/);
  assert.match(source, /productSpec/);
  assert.match(source, /standardUnitPrice/);
  assert.match(source, /referenceInfo/);
  assert.match(source, /updatedByName/);
  assert.match(source, /status === "active"[\s\S]*isActive:\s*true/);
  assert.match(source, /product:\s*{\s*isActive:\s*true\s*}/s);
  assert.match(source, /status === "inactive"[\s\S]*OR:/);
});

test("purchase standard screen keeps headquarters shell, URL filter, and form accessibility contracts", () => {
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "master-data",
    "purchase-standards",
    "page.tsx",
  );
  const clientSource = readProjectFile(
    "src",
    "features",
    "master-data",
    "components",
    "purchase-standard-management-client.tsx",
  );

  assert.match(pageSource, /requireSettingsAccess/);
  assert.match(pageSource, /getHeadquartersNavigationItems/);
  assert.match(pageSource, /HeadquartersShell/);
  assert.match(pageSource, /PageHeader/);
  assert.match(pageSource, /PurchaseStandardManagementClient/);
  assert.match(pageSource, /normalizePurchaseStandardStatusFilter/);
  assert.doesNotMatch(pageSource, /getHeadquartersStoreScope/);
  assert.doesNotMatch(pageSource, /getKstBusinessDateParam/);

  assert.match(clientSource, /statusLabels/);
  assert.match(clientSource, /pushFilters/);
  assert.match(clientSource, /\/app\/master-data\/purchase-standards/);
  assert.match(clientSource, /품목/);
  assert.match(clientSource, /참고 단가/);
  assert.match(clientSource, /참조 정보/);
  assert.match(clientSource, /마지막 수정 시각/);
  assert.match(clientSource, /상태 적용/);
  assert.doesNotMatch(clientSource, /매입 기준 추가/);
  assert.doesNotMatch(clientSource, /매입 기준 수정/);
  assert.doesNotMatch(clientSource, />기준 단가</);
  assert.doesNotMatch(clientSource, /조건에 맞는 매입 기준이 없습니다/);
  assert.doesNotMatch(clientSource, /\/app\/dashboard/);
  // WO(2026-06-24): 이카운트 가져오기는 전용 이카운트 출고/입고 업로드 화면으로 이동했으므로
  // 매입 기준 관리 화면은 "엑셀 불러오기" 버튼/가져오기 다이얼로그 배선을 더 이상 갖지 않는다.
  assert.doesNotMatch(clientSource, /엑셀 불러오기/);
  assert.doesNotMatch(clientSource, /importPurchaseStandardsFromEcount/);
  assert.doesNotMatch(clientSource, /accept="\.xlsx"/);
  assert.doesNotMatch(clientSource, /\/app\/ledgers/);
  assert.doesNotMatch(clientSource, /import-store-id/);
  assert.doesNotMatch(clientSource, /import-closing-date/);
  assert.match(clientSource, /router\.refresh\(\)/);
  // WO(2026-06-24): 가져오기 상태 영역(role="status")은 이카운트 가져오기 제거로 사라졌고,
  // 폼 오류 접근성은 role="alert"로 남는다.
  assert.match(clientSource, /role="alert"/);
  assert.match(clientSource, /inputMode="numeric"/);
  assert.match(clientSource, /aria-invalid/);
  assert.match(clientSource, /aria-describedby/);
  assert.match(clientSource, /focusFirstError/);
  assert.doesNotMatch(clientSource, /deletePurchaseStandard|\.delete\(/);
});

test("purchase standard ECount import action accepts duplicate product rows with different prices", () => {
  const source = readProjectFile(
    "src",
    "features",
    "master-data",
    "purchase-standard-import-actions.ts",
  );

  assert.match(source, /"use server"/);
  assert.match(
    source,
    /export\s+async\s+function\s+importPurchaseStandardsFromEcount/,
  );
  assert.match(source, /requireSettingsAccess\(\)/);
  assert.match(source, /parseEcountPurchaseWorkbook/);
  assert.doesNotMatch(source, /validateLedgerScope:\s*true/);
  assert.doesNotMatch(source, /findDuplicateImportedPurchaseConflict/);
  assert.doesNotMatch(source, /DUPLICATE_IMPORT_PURCHASE_STANDARD/);
  assert.doesNotMatch(
    source,
    /업로드 파일에 같은 품목의 서로 다른 매입 기준이 있습니다/,
  );
  assert.match(source, /toUniqueImportedPurchases\(imported\.purchases\)/);
  assert.match(source, /tx\.product\.upsert/);
  assert.match(
    source,
    /tx\.purchaseStandard\.findUnique\(\{\s*where:\s*\{\s*productId:/s,
  );
  assert.doesNotMatch(source, /tx\.purchaseStandard\.findFirst/);
  assert.match(source, /tx\.purchaseStandard\.create/);
  assert.match(source, /tx\.purchaseStandard\.update/);
  assert.match(source, /writeAuditLog\(tx,/);
  assert.match(source, /purchase_standard\.ecount_import\.created/);
  assert.match(source, /purchase_standard\.ecount_import\.updated/);
  assert.doesNotMatch(source, /ledgerPurchaseItem/);
  assert.doesNotMatch(source, /DailyLedger/);
  assert.doesNotMatch(source, /getOrCreateStoreLedgerInTx/);
  assert.match(source, /revalidateMasterDataPaths\("purchase-standards"\)/);
  assert.doesNotMatch(source, /revalidatePath\(`\/app\/ledgers/);
});

test("purchase standards remain in master-data scope and exclude eCount upload policy", () => {
  const forbiddenDomainPath = projectPath(
    "src",
    "features",
    "purchase-standards",
  );
  const forbiddenApiPath = projectPath(
    "src",
    "app",
    "api",
    "purchase-standards",
  );
  const actionSource = readProjectFile(
    "src",
    "features",
    "master-data",
    "purchase-standard-actions.ts",
  );
  const querySource = readProjectFile(
    "src",
    "features",
    "master-data",
    "purchase-standard-queries.ts",
  );

  assert.equal(existsSync(forbiddenDomainPath), false);
  assert.equal(existsSync(forbiddenApiPath), false);

  for (const source of [actionSource, querySource]) {
    assert.doesNotMatch(source, /preview|commit|reprocess/i);
    assert.doesNotMatch(source, /eCount|이카운트/i);
    assert.doesNotMatch(source, /FIFO|fifo/);
    assert.doesNotMatch(source, /mapping|매핑/i);
    assert.doesNotMatch(source, /effectiveStart|적용 시작일/i);
    assert.doesNotMatch(source, /ImportBatch|ImportRow|rowTrace/);
  }
});

test("ledger purchase saves keep selected purchase standards as references without overwriting user snapshots", () => {
  const storeActionSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "actions.ts",
  );
  const hqActionSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "hq-edit-actions.ts",
  );
  const clientSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "purchase-step-client.tsx",
  );

  for (const source of [storeActionSource, hqActionSource]) {
    assert.match(source, /purchaseStandardId:\s*standard\.id/);
    assert.match(
      source,
      /productName:\s*purchase\.productName\s*\|\|\s*standard\.product\.name/,
    );
    assert.match(
      source,
      /productCategory:\s*purchase\.productCategory\s*\|\|\s*standard\.product\.category/,
    );
    assert.match(
      source,
      /productSpec:\s*purchase\.productSpec\s*\|\|\s*standard\.product\.spec/,
    );
    assert.match(
      source,
      /referenceInfo:\s*purchase\.referenceInfo\s*\?\?\s*standard\.referenceInfo/,
    );
    assert.match(source, /isExistingSnapshotPurchase/);
    assert.match(
      source,
      /purchase\.purchaseStandardId\s*&&\s*!standard\s*&&\s*!isExistingSnapshot/s,
    );
    assert.match(
      source,
      /purchase\.productId\s*&&\s*!product\s*&&\s*!standard\s*&&\s*!isExistingSnapshot/s,
    );
    assert.match(source, /productId:\s*existing\.productId/);
    assert.match(source, /purchaseStandardId:\s*existing\.purchaseStandardId/);
    assert.match(
      source,
      /productName:\s*purchase\.productName\s*\|\|\s*existing\.productName/,
    );
    assert.match(
      source,
      /isActive:\s*true,\s*product:\s*{\s*isActive:\s*true\s*}/s,
    );
    assert.doesNotMatch(source, /purchaseStandard.*delete/i);
  }

  // WO(2026-06-24): 매입 기준 select 제거 → purchase step client는 applyStandard/매입 기준을
  // 더 이상 참조하지 않고, 품목 선택은 Product.defaultUnitPrice만 채운다.
  // 단, saveLedgerPurchases(actions.ts/hq-edit-actions.ts)의 매입 기준 snapshot 보존 검증은 위에서 유지된다.
  assert.doesNotMatch(clientSource, /applyStandard/);
  assert.doesNotMatch(clientSource, /매입 기준/);
  assert.match(clientSource, /productName:\s*product\?\.name/);
  assert.match(clientSource, /defaultUnitPrice/);
  assert.match(clientSource, /onChange=.*productName/s);
  assert.match(clientSource, /unitPriceRefs\.current/);
  assert.match(
    clientSource,
    /선택 가능한 active 품목이 없어도 수동 입력할 수\s+있습니다\./,
  );
});
