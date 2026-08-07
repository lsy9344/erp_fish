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
  getHeadquartersLaborDateRange,
  getHeadquartersLaborMonthRange,
  normalizeHeadquartersLaborStatus,
  resolveDesiredCash,
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

test("headquarters labor report filters by worker name (case-insensitive, partial match)", () => {
  const ledgers = [
    {
      id: "ledger-b1",
      closingDate: new Date("2026-07-05T00:00:00.000Z"),
      status: "HEADQUARTERS_CLOSED",
      workerCount: 2,
      store: { id: "store-a", name: "강남" },
      ledgerLaborItems: [
        {
          id: "labor-hong",
          employeeId: "employee-1",
          workerName: "홍길동",
          amount: 100_000,
          lateMemo: null,
          earlyLeaveMemo: null,
          specialMemo: null,
        },
        {
          id: "labor-kim",
          employeeId: "employee-2",
          workerName: "김철수",
          amount: 90_000,
          lateMemo: null,
          earlyLeaveMemo: null,
          specialMemo: null,
        },
      ],
    },
    {
      id: "ledger-b2",
      closingDate: new Date("2026-07-06T00:00:00.000Z"),
      status: "HEADQUARTERS_CLOSED",
      workerCount: 1,
      store: { id: "store-a", name: "강남" },
      ledgerLaborItems: [
        {
          id: "labor-kim-2",
          employeeId: "employee-2",
          workerName: "김철수",
          amount: 95_000,
          lateMemo: null,
          earlyLeaveMemo: null,
          specialMemo: null,
        },
      ],
    },
  ];

  const report = buildHeadquartersLaborReport({
    monthInput: "2026-07",
    selectedStoreId: "store-a",
    selectedStatus: "ALL",
    selectedWorkerName: "홍",
    stores: [{ id: "store-a", name: "강남" }],
    targetStoreIds: ["store-a"],
    ledgers,
  });

  assert.equal(report.selectedWorkerName, "홍");
  assert.equal(report.laborRecordCount, 1);
  assert.equal(report.totalLaborAmount, 100_000);
  assert.deepEqual(
    report.details.map((detail) => detail.workerName),
    ["홍길동"],
  );
  // 필터에 맞는 근무자가 없는 날(ledger-b2)은 근무일 수에서 제외된다.
  assert.deepEqual(report.storeSummaries, [
    {
      storeId: "store-a",
      storeName: "강남",
      workdayCount: 1,
      workerCount: 1,
      laborAmount: 100_000,
    },
  ]);
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

// WO-0806 #2-2: `월 선택`과 `기간 지정` 두 모드. 잘못된 입력은 현재 월로 폴백하고
// 값을 교환하지 않는다(사용자가 의도하지 않은 기간을 조용히 보여주면 안 된다).
test("headquarters labor date range supports month and explicit range modes", () => {
  const now = new Date("2026-07-22T00:00:00.000Z");

  // month만: 기존 계약 그대로 해당 월 전체.
  const monthOnly = getHeadquartersLaborDateRange({ month: "2026-06" }, now);
  assert.equal(monthOnly.monthInput, "2026-06");
  assert.equal(monthOnly.startDateInput, "2026-06-01");
  assert.equal(monthOnly.endDateInput, "2026-06-30");
  assert.equal(monthOnly.isSingleMonth, true);
  assert.deepEqual(monthOnly.errorMessages, []);

  // from/to만: 기간이 우선하며 종료일 23:59까지 포함한다.
  const rangeOnly = getHeadquartersLaborDateRange(
    { from: "2026-05-10", to: "2026-06-09" },
    now,
  );
  assert.equal(rangeOnly.rangeLabel, "2026-05-10 ~ 2026-06-09");
  assert.equal(rangeOnly.isSingleMonth, false);
  assert.equal(rangeOnly.endDate.toISOString(), "2026-06-09T23:59:59.999Z");

  // 둘 다 있으면 from/to가 이긴다.
  const both = getHeadquartersLaborDateRange(
    { month: "2026-01", from: "2026-05-01", to: "2026-05-31" },
    now,
  );
  assert.equal(both.startDateInput, "2026-05-01");
  // 월 1일~말일 기간은 사실상 월 조회이므로 자동계산을 허용한다.
  assert.equal(both.isSingleMonth, true);

  // 한쪽만 입력 / 역순 / 상한 초과 / 잘못된 형식 → 현재 월 폴백 + 사유.
  for (const input of [
    { from: "2026-05-01" },
    { from: "2026-06-09", to: "2026-05-10" },
    { from: "2025-01-01", to: "2026-07-01" },
    { from: "2026-5-1", to: "2026-05-31" },
  ]) {
    const fallback = getHeadquartersLaborDateRange(input, now);
    assert.equal(fallback.monthInput, "2026-07", JSON.stringify(input));
    assert.equal(fallback.isSingleMonth, true);
    assert.equal(fallback.errorMessages.length, 1, JSON.stringify(input));
  }

  // 정확히 366일은 통과한다(경계값).
  const maxRange = getHeadquartersLaborDateRange(
    { from: "2025-07-01", to: "2026-07-01" },
    now,
  );
  assert.deepEqual(maxRange.errorMessages, []);
});

// WO-0806 #2: 희망 현금 = 월 인건비 합계 − 희망 4대보험.
test("desired cash is derived from monthly labor total minus insurance", () => {
  const linkedSingleMonth = {
    isLinkedEmployee: true,
    isSingleMonth: true,
  };

  assert.deepEqual(
    resolveDesiredCash({
      laborAmount: 2_400_000,
      desiredInsuranceAmount: 300_000,
      ...linkedSingleMonth,
    }),
    { desiredCashAmount: 2_100_000, cashUnavailableReason: null },
  );

  // 음수를 0으로 자르면 지급 오류를 숨긴다. 그대로 내보낸다.
  assert.deepEqual(
    resolveDesiredCash({
      laborAmount: 100_000,
      desiredInsuranceAmount: 300_000,
      ...linkedSingleMonth,
    }),
    { desiredCashAmount: -200_000, cashUnavailableReason: null },
  );

  assert.deepEqual(
    resolveDesiredCash({
      laborAmount: 2_400_000,
      desiredInsuranceAmount: null,
      ...linkedSingleMonth,
    }),
    {
      desiredCashAmount: null,
      cashUnavailableReason: "계산 불가 (희망 4대보험 미입력)",
    },
  );

  assert.deepEqual(
    resolveDesiredCash({
      laborAmount: 2_400_000,
      desiredInsuranceAmount: 300_000,
      isLinkedEmployee: false,
      isSingleMonth: true,
    }),
    {
      desiredCashAmount: null,
      cashUnavailableReason: "계산 불가 (직원 미연결)",
    },
  );

  // 희망 4대보험은 월 고정값이라 다월 조회에서는 차감하지 않는다.
  assert.deepEqual(
    resolveDesiredCash({
      laborAmount: 5_000_000,
      desiredInsuranceAmount: 300_000,
      isLinkedEmployee: true,
      isSingleMonth: false,
    }),
    {
      desiredCashAmount: null,
      cashUnavailableReason: "기간 조회에서는 자동계산 미적용",
    },
  );
});

// WO-0806 #2: 근무자 단위 집계는 직원 미연결 근무자도 이름으로 묶어 누락을 막는다.
test("worker settlements group by employee and keep free-entry workers", () => {
  const report = buildHeadquartersLaborReport({
    monthInput: "2026-07",
    isSingleMonth: true,
    selectedStoreId: null,
    selectedStatus: "ALL",
    stores: [{ id: "store-a", name: "강남" }],
    targetStoreIds: ["store-a"],
    ledgers: [
      {
        id: "ledger-1",
        closingDate: new Date("2026-07-01T00:00:00.000Z"),
        status: "HEADQUARTERS_CLOSED",
        workerCount: 2,
        store: { id: "store-a", name: "강남" },
        ledgerLaborItems: [
          {
            id: "item-1",
            employeeId: "emp-1",
            workerName: "김직원",
            amount: 100_000,
            lateMemo: null,
            earlyLeaveMemo: null,
            specialMemo: null,
            employee: {
              position: "팀장",
              bankAccount: "국민 123456-01-234567",
              desiredInsuranceAmount: 30_000,
            },
          },
          {
            id: "item-2",
            employeeId: null,
            workerName: "자유근무자",
            amount: 70_000,
            lateMemo: null,
            earlyLeaveMemo: null,
            specialMemo: null,
            employee: null,
          },
        ],
      },
      {
        id: "ledger-2",
        closingDate: new Date("2026-07-02T00:00:00.000Z"),
        status: "HEADQUARTERS_CLOSED",
        workerCount: 1,
        store: { id: "store-a", name: "강남" },
        ledgerLaborItems: [
          {
            id: "item-3",
            employeeId: "emp-1",
            workerName: "김직원",
            amount: 120_000,
            lateMemo: null,
            earlyLeaveMemo: null,
            specialMemo: null,
            employee: {
              position: "팀장",
              bankAccount: "국민 123456-01-234567",
              desiredInsuranceAmount: 30_000,
            },
          },
        ],
      },
    ],
  });

  assert.deepEqual(report.workerSettlements, [
    {
      key: "emp-1",
      workerName: "김직원",
      position: "팀장",
      bankAccount: "국민 123456-01-234567",
      workdayCount: 2,
      laborAmount: 220_000,
      desiredInsuranceAmount: 30_000,
      desiredCashAmount: 190_000,
      cashUnavailableReason: null,
    },
    {
      key: "name:자유근무자",
      workerName: "자유근무자",
      position: null,
      bankAccount: null,
      workdayCount: 1,
      laborAmount: 70_000,
      desiredInsuranceAmount: null,
      desiredCashAmount: null,
      cashUnavailableReason: "계산 불가 (직원 미연결)",
    },
  ]);

  // 일별 상세 합계 = 근무자별 월 정산 합계 = 지점 요약 합계.
  const settlementTotal = report.workerSettlements.reduce(
    (sum, row) => sum + row.laborAmount,
    0,
  );
  assert.equal(settlementTotal, report.totalLaborAmount);
  assert.equal(settlementTotal, report.storeSummaries[0].laborAmount);
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

  // WO-0806 #5: 인건비 현황은 대표(LABOR_VIEW) 전용으로 좁혔다.
  assert.match(source, /await requireLaborViewAccess\(\)/);
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

  assert.match(page, /requireLaborViewAccess\(\)/);
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
  // WO-0806 #2-1: 근무인원 일평균은 합계 ÷ 근무일 수이며 0 나눈셈 가드가 있어야 한다.
  assert.match(reportView, /근무인원 일평균/);
  assert.match(reportView, /workdayCount > 0\s*\?/);
  assert.match(reportView, /workerCount \/ workdayCount/);
  // WO-0806 #2: 월 단위 금액은 일별 행이 아니라 근무자별 월 정산에서만 보여준다.
  assert.match(reportView, /근무자별 월 정산/);
  assert.match(reportView, /인건비 합계 − 희망 4대보험/);
  assert.ok(
    reportView.indexOf('aria-labelledby="labor-worker-settlement"') <
      reportView.indexOf('aria-labelledby="labor-detail"'),
    "worker settlement must render before the daily detail table",
  );
  assert.match(
    sidebar,
    /label:\s*"인건비 현황"[\s\S]*href:\s*"\/app\/reports\/labor"[\s\S]*PermissionAction\.LABOR_VIEW/,
  );
  assert.match(
    reportsNav,
    /key:\s*"labor",\s*label:\s*"인건비",\s*href:\s*"\/app\/reports\/labor"/,
  );
});
