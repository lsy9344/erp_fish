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

test("HQ inventory position report source files follow WO-08 boundaries", () => {
  assertProjectFile(
    "src",
    "features",
    "reports",
    "inventory-position-types.ts",
  );
  assertProjectFile(
    "src",
    "features",
    "reports",
    "inventory-position-queries.ts",
  );
  assertProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "inventory-position-report-table.tsx",
  );
  assertProjectFile("src", "app", "app", "reports", "inventory", "page.tsx");
  assertProjectFile("src", "app", "app", "reports", "inventory", "loading.tsx");

  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "reports",
    "inventory",
    "page.tsx",
  );
  const loadingSource = readProjectFile(
    "src",
    "app",
    "app",
    "reports",
    "inventory",
    "loading.tsx",
  );
  const querySource = readProjectFile(
    "src",
    "features",
    "reports",
    "inventory-position-queries.ts",
  );
  const typeSource = readProjectFile(
    "src",
    "features",
    "reports",
    "inventory-position-types.ts",
  );
  const tableSource = readProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "inventory-position-report-table.tsx",
  );
  const fifoDialogSource = readProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "inventory-position-history-dialog.tsx",
  );
  const reportsNavSource = readProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "reports-nav.tsx",
  );

  assert.match(pageSource, /requireReportAccess\(/);
  assert.match(pageSource, /getHqInventoryPositionReport\(/);
  assert.match(pageSource, /InventoryPositionReportTable/);
  assert.match(pageSource, /전 지점 재고 현황/);
  assert.match(loadingSource, /Skeleton/);
  assert.match(loadingSource, /md:block/);
  assert.match(loadingSource, /md:hidden/);
  // 본사 권한 범위 안의 활성 지점만 대상으로 한다.
  assert.match(querySource, /getHeadquartersStoreScope\(\)/);
  assert.match(querySource, /storeScope\.stores/);
  assert.match(querySource, /dailyLedger\.findMany\(/);
  assert.match(querySource, /storeId:\s*\{\s*in:/s);
  // 누락 장부를 생성하지 않는다(create/upsert 금지).
  assert.doesNotMatch(querySource, /dailyLedger\.create\(/);
  assert.doesNotMatch(querySource, /dailyLedger\.upsert\(/);
  // 전일재고/재고금액 클릭 팝업은 FIFO 잔여 lot의 영업일 기준 이력을 보여준다.
  assert.match(typeSource, /type\s+InventoryPositionFifoLotRow/);
  assert.match(typeSource, /fifoLots:\s*InventoryPositionFifoLotRow\[\]/);
  assert.match(querySource, /fifoLots:\s*\{/);
  assert.match(querySource, /remainingQuantity:\s*\{\s*gt:\s*0\s*\}/s);
  assert.match(querySource, /sourceBusinessDate:\s*true/);
  assert.match(
    querySource,
    /sourceBusinessDate:\s*toIsoDateString\(lot\.sourceBusinessDate\)/,
  );
  assert.match(tableSource, /InventoryPositionHistoryDialog/);
  assert.match(tableSource, /전일재고/);
  assert.match(tableSource, /재고 금액/);
  assert.match(tableSource, />당일 판매량</);
  assert.match(tableSource, /label="당일 판매량"/);
  assert.match(fifoDialogSource, /최근 1개월/);
  assert.match(fifoDialogSource, /전체/);
  assert.match(fifoDialogSource, /sourceBusinessDate/);
  assert.match(fifoDialogSource, /remainingQuantity/);
  // 리포트 간 이동 링크가 존재한다.
  assert.match(reportsNavSource, /\/app\/reports\/inventory/);
});

test("inventory position date range falls back to today for invalid input", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "inventory-position-queries.ts",
  );
  const { getInventoryPositionDateRange, getInventoryPositionReportPath } =
    await import(pathToFileURL(queryPath).href);

  const valid = getInventoryPositionDateRange(
    "2026-06-10",
    new Date("2026-06-22T16:00:00.000Z"),
  );
  assert.equal(valid.dateInput, "2026-06-10");
  assert.equal(valid.errorMessage, null);

  const fallback = getInventoryPositionDateRange(
    "2026-13-40",
    new Date("2026-06-22T16:00:00.000Z"),
  );
  // KST 기준 다음날(자정 UTC 변환)로 오늘을 잡는다.
  assert.equal(fallback.dateInput, "2026-06-23");
  assert.match(fallback.errorMessage ?? "", /조회 날짜를 확인/);

  const empty = getInventoryPositionDateRange(
    undefined,
    new Date("2026-06-22T16:00:00.000Z"),
  );
  assert.equal(empty.dateInput, "2026-06-23");
  assert.equal(empty.errorMessage, null);

  assert.equal(
    getInventoryPositionReportPath({
      dateInput: "2026-06-10",
      storeId: "store-1",
      category: "냉동",
      productQuery: "광어",
    }),
    "/app/reports/inventory?date=2026-06-10&storeId=store-1&category=%EB%83%89%EB%8F%99&product=%EA%B4%91%EC%96%B4",
  );
  assert.equal(
    getInventoryPositionReportPath({ dateInput: "2026-06-10" }),
    "/app/reports/inventory?date=2026-06-10",
  );
});

test("inventory position export keeps allowlisted labels without leaking raw sensitive keys", async () => {
  const exportPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "export.ts",
  );
  const {
    buildInventoryPositionReportExport,
    buildReportCsv,
    getReportExportFilename,
    REPORT_EXPORT_COLUMN_ALLOWLISTS,
  } = await import(pathToFileURL(exportPath).href);

  const exportData = buildInventoryPositionReportExport({
    filters: {
      dateInput: "2026-06-12",
      storeId: "store-1",
      storeName: '=강남 "본점"',
      category: "냉동",
      productQuery: "광어",
    },
    rows: [
      {
        storeId: "store-1",
        storeName: '=강남 "본점"',
        productId: "product-1",
        productName: "광어",
        productCategory: "냉동",
        productSpec: "1kg",
        previousQuantity: 10,
        purchasedQuantity: 5,
        lossQuantity: 1,
        currentQuantity: 12,
        systemQuantity: 14,
        differenceQuantity: -2,
        inventoryAmount: 120000,
        statusLabel: "입력됨",
      },
      {
        storeId: "store-2",
        storeName: "미입력점",
        productId: "",
        productName: "—",
        productCategory: "",
        productSpec: "",
        previousQuantity: 0,
        purchasedQuantity: 0,
        lossQuantity: 0,
        currentQuantity: null,
        systemQuantity: null,
        differenceQuantity: null,
        inventoryAmount: null,
        statusLabel: "미입력",
      },
    ],
  });
  const csv = buildReportCsv(exportData);

  assert.equal(exportData.report, "inventory");
  assert.equal(exportData.period, "2026-06-12");
  assert.deepEqual(
    exportData.columns,
    REPORT_EXPORT_COLUMN_ALLOWLISTS.inventory,
  );
  assert.ok(
    exportData.columns.some(
      (column) =>
        column.key === "differenceQuantity" && column.label === "당일 판매량",
    ),
  );
  assert.deepEqual(exportData.scopedStoreIds, ["store-1", "store-2"]);

  // 미입력 행은 0이 아니라 "미입력"으로 노출한다.
  assert.match(csv, /미입력/);
  assert.match(csv, /계산 불가/);
  // CSV 인젝션 방지 이스케이프.
  assert.match(csv, /"'=강남 ""본점"""/);
  // 원시 민감 키가 본문에 노출되지 않는다.
  assert.doesNotMatch(csv, /inventoryAmount/);
  assert.doesNotMatch(csv, /unitPrice/);
  assert.ok(exportData.columns.every((column) => column.key !== "unitPrice"));
  assert.ok(
    exportData.columns.every((column) => column.key !== "inventoryAmount"),
  );

  assert.equal(
    getReportExportFilename({ report: "inventory", period: "2026-06-12" }),
    "erp-fish-report-inventory-2026-06-12.csv",
  );
});
