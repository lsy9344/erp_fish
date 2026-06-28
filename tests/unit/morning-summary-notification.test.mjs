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

// WO-10(2026-06-22): 메시지는 회의 요구 4개 섹션을 항상 포함해야 한다.
// morning-summary.ts는 ~/server/db를 import하므로 node 테스트에서 직접 import할 수 없어
// 포맷 함수의 섹션 라벨/빈 값 처리 로직은 소스 스캔으로 검증한다.
test("morning summary message keeps all four required sections", () => {
  const source = readProjectFile(
    "src",
    "features",
    "notifications",
    "morning-summary.ts",
  );

  assert.match(source, /export function formatMorningSummaryMessage/);
  assert.match(source, /당일 적자 발생 지점/);
  assert.match(source, /전날 결산 미입력 지점/);
  // WO-13(2026-06-28): 기준일이 품목군별이라 "한 달" 고정 문구 대신 일반 문구를 쓴다.
  assert.match(source, /장기 체화 재고 \(품목군 기준일 초과/);
  assert.match(source, /목표 마진율 미달 지점/);

  // staleDays(체화 일수)와 상점/품목명을 메시지에 출력한다.
  assert.match(source, /item\.storeName/);
  assert.match(source, /item\.productName/);
  assert.match(source, /item\.staleDays/);
});

test("morning summary message renders empty sections as 없음", () => {
  const source = readProjectFile(
    "src",
    "features",
    "notifications",
    "morning-summary.ts",
  );

  // 각 섹션은 길이가 0이면 "없음"을 출력한다.
  assert.match(source, /\.length === 0/);
  assert.match(source, /lines\.push\("없음"\)/);
});

test("morning summary payload builder computes stagnant stock and uses active threshold margin", () => {
  const source = readProjectFile(
    "src",
    "features",
    "notifications",
    "morning-summary.ts",
  );

  // WO-G(2026-06-22): 장기 체화 재고는 lot의 영업 기준일(sourceBusinessDate)이
  // 30일 이상 지난 품목을 본다. 매입 행이 없는 이월/기초 lot도 포함되도록
  // createdAt 대신 sourceBusinessDate로 필터한다.
  assert.match(source, /buildLongTermStagnantProducts/);
  assert.match(source, /ledgerInventoryFifoLot\.findMany/);
  assert.match(source, /remainingQuantity:\s*{\s*gt:\s*0\s*}/);
  assert.match(source, /sourceBusinessDate:\s*{\s*lte:\s*staleBeforeDate\s*}/);
  // WO-13(2026-06-28): 하드코딩 30일 대신 품목군별 기준일(thresholdDaysByCategory)을 쓴다.
  assert.match(source, /getActiveLongStockThresholdDaysByCategory/);
  assert.match(source, /thresholdDaysByCategory/);
  assert.match(source, /product:\s*{\s*select:\s*{\s*name:\s*true,\s*category:\s*true\s*}/);
  // 기준일이 없는 품목군은 알림에서 제외하고(continue), staleDays가 기준 미만이면 제외한다.
  assert.match(source, /if \(thresholdDays === undefined\)/);
  assert.match(source, /if \(staleDays < thresholdDays\)/);
  // 더 이상 데이터 입력 시각(createdAt) 기준으로 체화 재고를 판정하지 않는다.
  assert.doesNotMatch(
    source,
    /createdAt:\s*{\s*lte:\s*staleBeforeDate\s*}/,
    "stagnant stock must use sourceBusinessDate, not createdAt",
  );
  // 메인 반환 경로는 실제 계산 결과를 사용한다(하드코딩 빈 배열 아님).
  // 줄바꿈은 OS에 따라 \n 또는 \r\n일 수 있으므로 \r?\n을 허용한다.
  assert.match(
    source,
    /longTermStagnantProducts,\r?\n\s*belowTargetMarginStores,/,
  );

  // change.md(2026-06-22): 당일 적자는 reportDate 하루 기준으로 본다.
  assert.match(source, /const dailyProfitSummaries/);
  assert.match(source, /startDate:\s*targetDate/);
  assert.match(source, /endDate:\s*targetDate/);
  assert.match(source, /dailyDeficitStores/);

  // WO-G(2026-06-22): 마진/적자는 본사 리포트 기준(correction-aware)을 재사용한다.
  // 단순 (총매출 - 지출)이 아니라 grossMarginRate / operatingProfit을 사용한다.
  assert.match(source, /getStoreProfitSummariesForRange/);
  assert.match(source, /summary\.operatingProfit/);
  assert.match(source, /summary\.grossMarginRate/);
  // 더 이상 ledgerExpenses 합산만으로 마진을 계산하지 않는다.
  assert.doesNotMatch(source, /ledger\.ledgerExpenses\.reduce/);

  // 목표 마진율은 활성 이상 신호 기준값을 사용한다.
  assert.match(source, /anomalyThresholdSetting\.findUnique/);
  assert.match(source, /marginRateBps\s*\/\s*10000/);
  assert.doesNotMatch(source, /const TARGET_MARGIN = 0\.3/);
});

// WO-G(2026-06-22): LINE 적자/마진 판정이 재사용하는 본사 리포트 계산이
// 매출원가(COGS)를 반영함을 실제 계산 데이터로 검증한다.
// (단순 총매출-지출이면 grossProfit이 총매출과 같아져야 하지만, COGS를 빼야 한다.)
test("ledger review summary uses COGS for gross profit (not sales minus expense)", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { calculateLedgerReviewSummary } = await import(
    pathToFileURL(calcPath).href
  );

  // 총매출 100,000 / 지출 10,000 / 재고: 이전 10개 - 마감 4개 = 6개 소진, 단가 5,000
  // 매출원가(COGS) = 6 * 5,000 = 30,000 → grossProfit = 100,000 - 30,000 = 70,000
  const summary = calculateLedgerReviewSummary({
    totalSalesAmount: 100_000,
    cashAmount: 100_000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 2,
    expenseTotal: 10_000,
    inventoryItems: [
      {
        productId: "p1",
        productName: "고등어",
        previousQuantity: 10,
        purchasedQuantity: 0,
        currentQuantity: 4,
        quantity: 4,
        unitPrice: 5_000,
        inventoryAmount: 20_000,
      },
    ],
    inventoryAdjustments: [],
    lossItems: [],
  });

  assert.equal(summary.costOfGoodsSold.value, 30_000);
  assert.equal(summary.grossProfit.value, 70_000);
  // grossProfit이 총매출(100,000)과 다르다 = COGS가 반영됐다.
  assert.notEqual(summary.grossProfit.value, 100_000);
  // 영업이익 = grossProfit - 지출 = 70,000 - 10,000 = 60,000
  assert.equal(summary.operatingProfit.value, 60_000);
  // 마진율 = 70,000 / 100,000 = 0.7
  assert.equal(summary.grossMarginRate.value, 0.7);
});

// WO-G(2026-06-22): 매출원가 기준으로 누적 영업이익이 음수면 장기 적자다.
test("ledger review summary yields negative operating profit when COGS+expense exceed sales", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { calculateLedgerReviewSummary } = await import(
    pathToFileURL(calcPath).href
  );

  // 총매출 50,000 / 지출 20,000 / COGS = 6 * 8,000 = 48,000
  // grossProfit = 2,000, operatingProfit = 2,000 - 20,000 = -18,000 (적자)
  const summary = calculateLedgerReviewSummary({
    totalSalesAmount: 50_000,
    cashAmount: 50_000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 1,
    expenseTotal: 20_000,
    inventoryItems: [
      {
        productId: "p1",
        productName: "고등어",
        previousQuantity: 10,
        purchasedQuantity: 0,
        currentQuantity: 4,
        quantity: 4,
        unitPrice: 8_000,
        inventoryAmount: 32_000,
      },
    ],
    inventoryAdjustments: [],
    lossItems: [],
  });

  assert.equal(summary.grossProfit.value, 2_000);
  assert.ok(
    summary.operatingProfit.value !== null && summary.operatingProfit.value < 0,
    "operating profit should be negative (long-term deficit candidate)",
  );
});

test("morning summary route guards with INTERNAL_CRON_SECRET and logs delivery", () => {
  const source = readProjectFile(
    "src",
    "app",
    "api",
    "internal",
    "notifications",
    "morning-summary",
    "route.ts",
  );

  assert.match(source, /INTERNAL_CRON_SECRET/);
  assert.match(source, /status:\s*401/);
  assert.match(source, /LINE_CHANNEL_ACCESS_TOKEN/);
  assert.match(source, /LINE_MORNING_SUMMARY_RECIPIENT_IDS/);
  assert.match(source, /sendLineMessage/);
  assert.match(source, /notificationDeliveryLog\.create/);
});

test("env example and deployment doc keep LINE morning summary configuration", () => {
  const envExample = readProjectFile(".env.example");
  assert.match(envExample, /LINE_CHANNEL_ACCESS_TOKEN/);
  assert.match(envExample, /LINE_MORNING_SUMMARY_RECIPIENT_IDS/);
  assert.match(envExample, /INTERNAL_CRON_SECRET/);

  const deploymentDoc = readProjectFile("docs", "production-deployment.md");
  assert.match(deploymentDoc, /morning-summary/);
  assert.match(deploymentDoc, /오전 8시|08:00/);
  assert.match(deploymentDoc, /0 23 \* \* \*/);
});

// WO-F(2026-06-22): repo만 보고도 매일 KST 08:00 호출 설정이 확인되도록
// 실제 Vercel Cron(vercel.json)을 등록한다.
test("vercel.json registers the KST 08:00 morning-summary cron", () => {
  const vercelConfig = JSON.parse(readProjectFile("vercel.json"));

  assert.ok(Array.isArray(vercelConfig.crons), "vercel.json must define crons");

  const morningCron = vercelConfig.crons.find(
    (cron) => cron.path === "/api/internal/notifications/morning-summary",
  );

  assert.ok(morningCron, "a cron must target the morning-summary endpoint");
  // 23:00 UTC = KST 08:00
  assert.equal(morningCron.schedule, "0 23 * * *");
});

// WO-F(2026-06-22): 수신자 수 정책은 "3명 이상(최소 1명) 허용"으로 확정한다.
// route는 정확히 3명을 강제하지 않고 1명 이상이면 발송하며, 문서가 이를 명시한다.
test("morning summary recipient policy allows three-or-more (not exactly three)", () => {
  const routeSource = readProjectFile(
    "src",
    "app",
    "api",
    "internal",
    "notifications",
    "morning-summary",
    "route.ts",
  );

  // 1명 이상이면 발송(빈 목록만 거부). 정확히 3명을 강제하는 코드가 없어야 한다.
  assert.match(routeSource, /recipientIds\.length === 0/);
  assert.doesNotMatch(routeSource, /length\s*!==\s*3/);
  assert.doesNotMatch(routeSource, /length\s*===\s*3/);

  const deploymentDoc = readProjectFile("docs", "production-deployment.md");
  const pointSummary = readProjectFile("docs", "meeting", "point_summary.md");
  assert.match(deploymentDoc, /3명 이상/);
  assert.match(pointSummary, /기본 3명/);
  assert.match(pointSummary, /3명 이상\(최소 1명\) 허용/);
});
