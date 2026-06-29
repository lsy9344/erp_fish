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
    "매출",
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
  assert.match(
    source,
    /grossProfit \?\? 0\) - laborAmount - expenseTotal/,
  );
  // 조정 항목은 본사 지출 category로 매핑(새 모델 없음).
  assert.match(source, /MONTHLY_PNL_FIXED_COST_CATEGORIES/);
  assert.match(source, /본사조정/);
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
