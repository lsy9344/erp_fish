import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();
const queryPath = path.join(
  root,
  "src",
  "features",
  "labor",
  "headquarters-labor-queries.ts",
);

const {
  buildHeadquartersLaborReport,
  getHeadquartersLaborMonthRange,
  normalizeHeadquartersLaborStatus,
  resolveHeadquartersLaborStoreFilter,
} = await import(pathToFileURL(queryPath).href);

test("headquarters labor report keeps free-entry workers and calculates summaries", () => {
  const report = buildHeadquartersLaborReport({
    monthInput: "2026-07",
    selectedStoreId: null,
    selectedStatus: "ALL",
    stores: [
      { id: "store-a", name: "강남" },
      { id: "store-b", name: "잠실" },
    ],
    targetStoreIds: ["store-a", "store-b"],
    ledgers: [
      {
        id: "ledger-a1",
        closingDate: new Date("2026-07-02T00:00:00.000Z"),
        status: "IN_PROGRESS",
        workerCount: 3,
        store: { id: "store-a", name: "강남" },
        ledgerLaborItems: [
          {
            id: "labor-free-entry",
            employeeId: null,
            workerName: "자유 입력 근무자",
            amount: 120_000,
            lateMemo: "10분",
            earlyLeaveMemo: null,
            specialMemo: "대체 근무",
          },
          {
            id: "labor-employee",
            employeeId: "employee-1",
            workerName: "등록 직원",
            amount: 130_000,
            lateMemo: null,
            earlyLeaveMemo: null,
            specialMemo: null,
          },
        ],
      },
      {
        id: "ledger-a2",
        closingDate: new Date("2026-07-03T00:00:00.000Z"),
        status: "HEADQUARTERS_CLOSED",
        workerCount: null,
        store: { id: "store-a", name: "강남" },
        ledgerLaborItems: [
          {
            id: "labor-second-day",
            employeeId: null,
            workerName: "둘째 날 근무자",
            amount: 100_000,
            lateMemo: null,
            earlyLeaveMemo: "30분",
            specialMemo: null,
          },
        ],
      },
    ],
  });

  assert.equal(report.totalLaborAmount, 350_000);
  assert.equal(report.storeCount, 2);
  assert.equal(report.laborRecordCount, 3);
  assert.deepEqual(report.storeSummaries, [
    {
      storeId: "store-a",
      storeName: "강남",
      workdayCount: 2,
      workerCount: 4,
      laborAmount: 350_000,
    },
    {
      storeId: "store-b",
      storeName: "잠실",
      workdayCount: 0,
      workerCount: 0,
      laborAmount: 0,
    },
  ]);
  assert.equal(report.details[0].workerName, "자유 입력 근무자");
  assert.equal(report.details[0].status, "IN_PROGRESS");
});

test("headquarters labor report includes worker-count-only ledger days", () => {
  const report = buildHeadquartersLaborReport({
    monthInput: "2026-07",
    selectedStoreId: "store-a",
    selectedStatus: "ALL",
    stores: [
      { id: "store-a", name: "강남" },
      { id: "store-b", name: "잠실" },
    ],
    targetStoreIds: ["store-a"],
    ledgers: [
      {
        id: "ledger-worker-count-only",
        closingDate: new Date("2026-07-04T00:00:00.000Z"),
        status: "IN_REVIEW",
        workerCount: 5,
        store: { id: "store-a", name: "강남" },
        ledgerLaborItems: [],
      },
    ],
  });

  assert.equal(report.storeCount, 1);
  assert.equal(report.laborRecordCount, 0);
  assert.deepEqual(report.details, []);
  assert.deepEqual(report.storeSummaries, [
    {
      storeId: "store-a",
      storeName: "강남",
      workdayCount: 1,
      workerCount: 5,
      laborAmount: 0,
    },
  ]);
});

test("headquarters labor month and status filters reject malformed input", () => {
  const now = new Date("2026-07-22T00:00:00.000Z");

  assert.equal(
    getHeadquartersLaborMonthRange("2026-06", now).monthInput,
    "2026-06",
  );
  assert.equal(
    getHeadquartersLaborMonthRange("2026-13", now).monthInput,
    "2026-07",
  );
  assert.equal(normalizeHeadquartersLaborStatus("IN_PROGRESS"), "IN_PROGRESS");
  assert.equal(normalizeHeadquartersLaborStatus("HOLIDAY"), "ALL");
});

test("headquarters labor store filter fails closed for unauthorized store ids", () => {
  assert.deepEqual(
    resolveHeadquartersLaborStoreFilter({
      storeId: "store-outside",
      allowedStoreIds: ["store-a", "store-b"],
    }),
    {
      requestedStoreId: "store-outside",
      selectedStoreId: null,
      targetStoreIds: [],
      errorMessages: [
        "조회 지점이 권한 범위에 없거나 비활성입니다. 권한 있는 지점을 선택해 주세요.",
      ],
    },
  );

  assert.deepEqual(
    resolveHeadquartersLaborStoreFilter({
      storeId: "store-a",
      allowedStoreIds: ["store-a", "store-b"],
    }),
    {
      requestedStoreId: "store-a",
      selectedStoreId: "store-a",
      targetStoreIds: ["store-a"],
      errorMessages: [],
    },
  );

  assert.deepEqual(
    resolveHeadquartersLaborStoreFilter({
      storeId: undefined,
      allowedStoreIds: ["store-a", "store-b"],
    }),
    {
      requestedStoreId: null,
      selectedStoreId: null,
      targetStoreIds: ["store-a", "store-b"],
      errorMessages: [],
    },
  );
});

test("unauthorized store filter produces an empty labor report instead of expanding scope", () => {
  const filter = resolveHeadquartersLaborStoreFilter({
    storeId: "store-outside",
    allowedStoreIds: ["store-a", "store-b"],
  });
  const report = buildHeadquartersLaborReport({
    monthInput: "2026-07",
    selectedStoreId: filter.selectedStoreId,
    selectedStatus: "ALL",
    stores: [
      { id: "store-a", name: "강남" },
      { id: "store-b", name: "잠실" },
    ],
    targetStoreIds: filter.targetStoreIds,
    ledgers: [
      {
        id: "ledger-must-not-leak",
        closingDate: new Date("2026-07-05T00:00:00.000Z"),
        status: "IN_PROGRESS",
        workerCount: 1,
        store: { id: "store-a", name: "강남" },
        ledgerLaborItems: [
          {
            id: "labor-must-not-leak",
            employeeId: null,
            workerName: "노출 금지",
            amount: 90_000,
            lateMemo: null,
            earlyLeaveMemo: null,
            specialMemo: null,
          },
        ],
      },
    ],
    errorMessages: filter.errorMessages,
  });

  assert.equal(report.selectedStoreId, null);
  assert.equal(report.totalLaborAmount, 0);
  assert.equal(report.storeCount, 0);
  assert.equal(report.laborRecordCount, 0);
  assert.deepEqual(report.storeSummaries, []);
  assert.deepEqual(report.details, []);
  assert.deepEqual(report.errorMessages, [
    "조회 지점이 권한 범위에 없거나 비활성입니다. 권한 있는 지점을 선택해 주세요.",
  ]);
});

test("headquarters labor query is permission and store-scope guarded", () => {
  const source = readFileSync(queryPath, "utf8");

  assert.match(source, /await requireReportAccess\(\)/);
  assert.match(source, /await getHeadquartersStoreScope\(\)/);
  assert.match(source, /resolveHeadquartersLaborStoreFilter\(/);
  assert.match(
    source,
    /storeId:\s*\{\s*in:\s*storeFilter\.targetStoreIds\s*\}/,
  );
  assert.match(source, /HEADQUARTERS_LABOR_STATUSES/);
  assert.doesNotMatch(source, /HOLIDAY/);
  assert.doesNotMatch(source, /권한 범위 전체로 조회했습니다/);
  assert.match(source, /employeeId:\s*true/);
});

test("headquarters labor route and both navigation entries are present", () => {
  const page = readFileSync(
    path.join(root, "src", "app", "app", "reports", "labor", "page.tsx"),
    "utf8",
  );
  const sidebar = readFileSync(
    path.join(root, "src", "components", "app-sidebar.tsx"),
    "utf8",
  );
  const reportsNav = readFileSync(
    path.join(
      root,
      "src",
      "features",
      "reports",
      "components",
      "reports-nav.tsx",
    ),
    "utf8",
  );
  const reportView = readFileSync(
    path.join(
      root,
      "src",
      "features",
      "labor",
      "components",
      "headquarters-labor-report.tsx",
    ),
    "utf8",
  );

  assert.match(page, /requireReportAccess\(\)/);
  assert.match(page, /ReportsNav active="labor"/);
  assert.match(
    page,
    /지점장이 입력한 근무인원·근무자·메모와 장부에 저장된 인건비 현황/,
  );
  assert.doesNotMatch(page, /지점장이 입력한 근무자별 인건비/);
  assert.ok(
    reportView.indexOf('aria-labelledby="labor-store-summary"') <
      reportView.indexOf("report.details.length === 0"),
    "store summary must render before the empty-detail branch",
  );
  assert.match(
    sidebar,
    /label:\s*"인건비 현황"[\s\S]*href:\s*"\/app\/reports\/labor"[\s\S]*PermissionAction\.REPORT_VIEW/,
  );
  assert.match(
    reportsNav,
    /key:\s*"labor",\s*label:\s*"인건비",\s*href:\s*"\/app\/reports\/labor"/,
  );
});
