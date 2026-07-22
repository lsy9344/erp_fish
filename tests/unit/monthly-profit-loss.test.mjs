import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function projectPath(...segments) {
  const filePath = path.join(root, ...segments);
  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);
  return filePath;
}

function readProjectFile(...segments) {
  return readFileSync(projectPath(...segments), "utf8");
}

// WO-15(2026-06-28) part2: 월별 손익계산서.
test("buildMonthlyProfitLossSheet emits the confirmed P&L columns", async () => {
  const exportPath = projectPath("src", "features", "reports", "export.ts");
  const { buildMonthlyProfitLossSheet } = await import(
    pathToFileURL(exportPath).href
  );

  const sheet = buildMonthlyProfitLossSheet({
    rows: [
      {
        monthInput: "2026-06",
        storeName: "강남",
        salesAmount: 1_000_000,
        cogsAmount: 600_000,
        grossProfit: 400_000,
        grossMarginRate: 0.4,
        laborAmount: 150_000,
        fixedCosts: { 월세: 100_000, 공과금: 20_000 },
        otherExpenseAmount: 30_000,
        hqAdjustmentAmount: 10_000,
        netAmount: 90_000,
        adjustmentReason: "정산 조정",
        memo: "6월 마감",
      },
    ],
  });

  assert.equal(sheet.name, "월별손익");
  const labels = sheet.columns.map((c) => c.label);
  // 확정 조정 항목이 모두 컬럼으로 있다.
  for (const label of [
    "영업 매출 합계",
    "매입원가",
    "매출이익",
    "이익률",
    "인건비",
    "월세",
    "관리비",
    "공과금",
    "세금/수수료",
    "포장/소모품",
    "배송/운반",
    "수선/유지보수",
    "기타비용",
    "본사조정",
    "남은금액",
    "조정사유",
    "메모",
  ]) {
    assert.ok(labels.includes(label), `column ${label} should exist`);
  }

  const row = sheet.rows[0];
  assert.equal(row.salesAmount, 1_000_000);
  assert.equal(row.월세, 100_000);
  assert.equal(row.공과금, 20_000);
  // 설정 안 된 고정비는 0.
  assert.equal(row.관리비, 0);
  assert.equal(row.netAmount, 90_000);
  assert.equal(row.grossMarginRate, "40.0%");
});

// 순이익 계산식과 조정항목=비용 category 매핑을 소스 계약으로 잠근다.
test("monthly P&L computes net = grossProfit - labor - expenses, no new DB", () => {
  const source = readProjectFile(
    "src",
    "features",
    "reports",
    "monthly-profit-loss.ts",
  );
  assert.match(source, /requireReportAccess/);
  // 매출/원가/이익: 기존 profit summary 재사용.
  assert.match(source, /getStoreProfitSummariesForRange/);
  // 인건비: 장부 급여 합계.
  assert.match(source, /ledgerLaborItem\.findMany/);
  // 고정비/조정: 본사 지출 category.
  assert.match(source, /headquartersExpense\.findMany/);
  // 남은금액 = 매출이익 - 인건비 - 비용합계.
  assert.match(source, /grossProfit \?\? 0\) - laborAmount - expenseTotal/);
  // 조정 항목은 본사 지출 category로 매핑(새 모델 없음).
  assert.match(source, /MONTHLY_PNL_FIXED_COST_CATEGORIES/);
  assert.match(source, /본사조정/);
});

test("monthly P&L labor matches the report ledger population", () => {
  const source = readProjectFile(
    "src",
    "features",
    "reports",
    "monthly-profit-loss.ts",
  );
  const reportTypesSource = readProjectFile(
    "src",
    "features",
    "reports",
    "types.ts",
  );
  const overviewSource = readProjectFile(
    "src",
    "features",
    "reports",
    "overview.ts",
  );
  const laborQueryStart = source.indexOf("db.ledgerLaborItem.findMany");
  const laborQueryEnd = source.indexOf(
    "db.headquartersExpense.findMany",
    laborQueryStart,
  );
  assert.ok(laborQueryStart >= 0 && laborQueryEnd > laborQueryStart);
  const laborQuery = source.slice(laborQueryStart, laborQueryEnd);

  assert.match(
    laborQuery,
    /dailyLedger:\s*\{[\s\S]*?status:\s*\{\s*in:\s*\["IN_REVIEW",\s*"HEADQUARTERS_CLOSED"\]\s*\}/,
  );
  assert.match(
    reportTypesSource,
    /export const MONTHLY_PNL_COMPANY_WIDE_STORE_ID\s*=\s*"__company_wide__";/,
  );
  assert.match(
    source,
    /import\s*\{\s*MONTHLY_PNL_COMPANY_WIDE_STORE_ID\s*\}\s*from\s*"\.\/types\.ts";/,
  );
  assert.match(
    source,
    /export\s*\{\s*MONTHLY_PNL_COMPANY_WIDE_STORE_ID\s*\}\s*from\s*"\.\/types\.ts";/,
  );
  assert.match(
    overviewSource,
    /import\s*\{[\s\S]*MONTHLY_PNL_COMPANY_WIDE_STORE_ID[\s\S]*\}\s*from\s*"\.\/types\.ts";/,
  );
  assert.equal(
    [source, reportTypesSource, overviewSource]
      .join("\n")
      .match(/"__company_wide__"/g)?.length,
    1,
  );
});

test("monthly report xlsx attaches the 월별손익 sheet for all months", () => {
  const route = readProjectFile(
    "src",
    "app",
    "api",
    "reports",
    "export",
    "route.ts",
  );
  // WO-15(수정): 월별손익 시트는 모든 달을 출력한다(buildAllMonthsProfitAndLoss).
  assert.match(route, /buildAllMonthsProfitAndLoss/);
  assert.match(route, /buildMonthlyProfitLossSheet/);
  assert.match(route, /report === "monthly"/);
});

test("monthly xlsx bundles the 5 confirmed sheets (요약/기간조회_RAW/월별손익/재고현황/품목매출)", () => {
  // WO-15(2026-06-29): 월별 xlsx는 5개 고정 시트로 번들한다.
  const route = readProjectFile(
    "src",
    "app",
    "api",
    "reports",
    "export",
    "route.ts",
  );
  assert.match(route, /buildBundledReportXlsx/);
  // route가 직접 이름 붙이는 시트(요약/기간조회_RAW/재고현황).
  for (const name of ["요약", "기간조회_RAW", "재고현황"]) {
    assert.match(route, new RegExp(`"${name}"`), `bundle should add ${name}`);
  }
  // 월별손익/품목매출 시트는 전용 빌더가 이름을 붙인다.
  assert.match(route, /buildMonthlyProfitLossSheet\(pnl\)/);
  // 각 시트는 같은 월/지점 기준으로 로드된다. 모든 sub-report가 request.storeId를 따른다.
  assert.match(route, /getHqStoreComparisonReport/);
  assert.match(route, /getHqInventoryPositionReport/);
  assert.match(route, /getHqProductSalesReportForRange/);
  assert.match(route, /buildProductSalesSheet/);
  // 품목매출 시트도 storeId 필터를 따라야 한다(전 지점 누출 방지).
  assert.match(
    route,
    /getHqProductSalesReportForRange\(\{[\s\S]*?storeId:\s*request\.storeId/,
  );

  const exportSource = readProjectFile(
    "src",
    "features",
    "reports",
    "export.ts",
  );
  assert.match(exportSource, /export async function buildBundledReportXlsx/);
  assert.match(exportSource, /export function buildProductSalesSheet/);
  assert.match(exportSource, /name:\s*"품목매출"/);
});

test("export audit is written after output is built, and records bundle sheets", () => {
  // P2(2026-06-29): workbook 생성 실패 시 유령 export 로그가 남지 않도록, 출력물을 먼저 만들고
  // 그 다음에 감사 로그를 남긴다. 번들 xlsx는 실제 포함 시트를 snapshot에 기록한다.
  const route = readProjectFile(
    "src",
    "app",
    "api",
    "reports",
    "export",
    "route.ts",
  );
  // 출력물 생성(buildBundledReportXlsx/buildReportXlsx/buildReportCsv)이 writeAuditLog보다 앞선다.
  const buildIndex = Math.min(
    ...["buildBundledReportXlsx(", "buildReportXlsx(", "buildReportCsv("]
      .map((token) => route.indexOf(token))
      .filter((index) => index >= 0),
  );
  const auditIndex = route.indexOf("report.export.created");
  assert.ok(buildIndex >= 0 && auditIndex >= 0);
  assert.ok(
    buildIndex < auditIndex,
    "output must be built before the export audit is written",
  );
  // audit snapshot에 실제 시트 목록을 넘긴다.
  assert.match(route, /buildMonthlyBundleSheets/);
  assert.match(route, /sheets:\s*auditSheets/);

  const exportSource = readProjectFile(
    "src",
    "features",
    "reports",
    "export.ts",
  );
  // snapshot은 sheets가 주어지면 시트별 name/rowCount를 기록한다.
  assert.match(exportSource, /sheets\?:\s*ReportExportSheet\[\]/);
  assert.match(exportSource, /name:\s*sheet\.name,\s*\n?\s*rowCount:/);
});

test("buildAllMonthsProfitAndLoss collects every month with ledger or expense data", () => {
  const source = readProjectFile(
    "src",
    "features",
    "reports",
    "monthly-profit-loss.ts",
  );
  assert.match(source, /export async function buildAllMonthsProfitAndLoss/);
  // 장부 마감일 + 본사 지출일에서 모든 달을 모은다.
  assert.match(source, /dailyLedger\.findMany/);
  assert.match(source, /headquartersExpense\.findMany/);
  assert.match(source, /monthInputs\.add/);
  // 월별로 공유 계산 헬퍼를 호출한다.
  assert.match(source, /computeMonthProfitAndLossRows/);
});

test("monthly xlsx product sales uses a period query, not the last daily meeting report", () => {
  const route = readProjectFile(
    "src",
    "app",
    "api",
    "reports",
    "export",
    "route.ts",
  );

  assert.match(route, /getHqProductSalesReportForRange/);
  assert.doesNotMatch(
    route,
    /getHqDailyMeetingReport\(\{\s*dateQuery:\s*endDate/,
  );
  assert.doesNotMatch(route, /마지막 날의 일별 회의 리포트/);
});

test("period product-sales query matches monthly P&L status filter and keeps undetermined items", () => {
  const source = readProjectFile("src", "features", "reports", "queries.ts");
  const fnStart = source.indexOf(
    "export async function getHqProductSalesReportForRange",
  );
  assert.ok(fnStart >= 0, "period product-sales query should exist");
  const fnEnd = source.indexOf(
    "export async function getHqStoreComparisonReport",
    fnStart,
  );
  const fn = source.slice(fnStart, fnEnd);

  // F3: 월별손익과 같은 status 필터(검토중/본사마감)만 집계한다. (기간조회_RAW는 status 무필터라 다름.)
  assert.match(
    fn,
    /status:\s*\{\s*in:\s*\["IN_REVIEW",\s*"HEADQUARTERS_CLOSED"\]\s*\}/,
  );
  // F2: 냉동/생물만 거르고 "기준 미정" 등을 버리던 category 필터를 두지 않는다.
  assert.doesNotMatch(
    fn,
    /productCategory !== "냉동" && item\.productCategory !== "생물"/,
  );
});

test("monthly P&L reads adjustmentReason separately from memo", () => {
  const source = readProjectFile(
    "src",
    "features",
    "reports",
    "monthly-profit-loss.ts",
  );

  assert.match(source, /adjustmentReason:\s*true/);
  assert.match(source, /expense\.adjustmentReason/);
  assert.doesNotMatch(
    source,
    /bucket\.adjustmentReasons\.push\(expense\.memo\)/,
  );
});

test("store-scoped P&L excludes company-wide (storeId=null) expenses", () => {
  // 정책(2026-06-29 검토): 특정 지점 범위 export에 전사 공통 비용이 섞이면 안 된다.
  const source = readProjectFile(
    "src",
    "features",
    "reports",
    "monthly-profit-loss.ts",
  );
  // includeCompanyWide 플래그로 전사 공통 비용 포함 여부를 제어한다.
  assert.match(source, /includeCompanyWide/);
  // 지점이 지정되면(!storeId === false) 전사 공통을 끈다.
  assert.match(source, /includeCompanyWide:\s*!storeId/);
  // 비용 쿼리는 플래그가 false면 storeId=null OR 절을 붙이지 않는다.
  assert.match(
    source,
    /includeCompanyWide\s*\n?\s*\?\s*{\s*OR:\s*\[\{\s*storeId:\s*{\s*in:\s*targetStoreIds\s*}\s*}\s*,\s*\{\s*storeId:\s*null\s*}\s*\]\s*}\s*\n?\s*:\s*{\s*storeId:\s*{\s*in:\s*targetStoreIds\s*}\s*}/s,
  );
  // "(전사 공통)" 행도 플래그로 가드한다.
  assert.match(
    source,
    /companyWide\s*=\s*includeCompanyWide\s*\n?\s*\?\s*costByStore\.get\(MONTHLY_PNL_COMPANY_WIDE_STORE_ID\)\s*\n?\s*:\s*undefined/s,
  );
});

test("monthly P&L keeps company-wide costs by default and allows an explicit query opt-out", () => {
  const source = readProjectFile(
    "src",
    "features",
    "reports",
    "monthly-profit-loss.ts",
  );
  const publicQueryStart = source.indexOf(
    "export async function buildMonthlyProfitAndLoss",
  );
  const publicQueryEnd = source.indexOf(
    "function monthRangeFromInput",
    publicQueryStart,
  );
  assert.ok(publicQueryStart >= 0 && publicQueryEnd > publicQueryStart);
  const publicQuery = source.slice(publicQueryStart, publicQueryEnd);

  assert.match(publicQuery, /includeCompanyWide\?:\s*boolean/);
  assert.match(
    publicQuery,
    /includeCompanyWide:\s*!storeId\s*&&\s*\(includeCompanyWide\s*\?\?\s*true\)/,
  );
  assert.match(
    source,
    /includeCompanyWide\s*\n?\s*\?\s*\{\s*OR:[\s\S]*?\{\s*storeId:\s*null\s*\}[\s\S]*?:\s*\{\s*storeId:\s*\{\s*in:\s*targetStoreIds\s*\}\s*\}/,
  );
});
