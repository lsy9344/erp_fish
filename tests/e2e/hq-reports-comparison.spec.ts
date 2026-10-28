import { expect, test, type Locator } from "@playwright/test";
import {
  setupReportFixtures,
  STORE_IDS,
  login,
  getTodayKstMidnight,
  getTodayKstInput,
  getCurrentMonthInput,
  getStoreSelect,
} from "./_helpers/hq-reports";

setupReportFixtures();

test("본사는 일별 리포트에서 기간 비교로 이동해 선택 기간의 지점별 실적을 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/daily?date=today");

  await page.getByRole("link", { name: "기간 분석" }).click();
  await expect(page).toHaveURL(/\/app\/reports\/comparison/);
  await expect(page.getByRole("heading", { name: "기간 분석" })).toBeVisible();
  await expect(getStoreSelect(page)).toHaveValue("");

  await page.getByLabel("시작일").fill("2026-05-31");
  await page
    .getByLabel("종료일")
    .fill(getTodayKstMidnight().toISOString().slice(0, 10));
  await page.getByRole("button", { name: "조회" }).click();

  await expect(page).toHaveURL(/startDate=2026-05-31/);
  await expect(page).toHaveURL(/endDate=/);

  // 매출분석 3종은 월간이 아니라 여기서 조회 기간으로 본다(비교 기준은 직전 기간).
  const salesAnalysis = page
    .getByRole("heading", { name: "매출 분석", exact: true })
    .locator("..");
  await expect(salesAnalysis).toContainText("직전 기간 대비 매출액 증감률");
  await expect(salesAnalysis).toContainText("매장 매출 포지션");
  await expect(salesAnalysis).toContainText("재고비율");

  const closedRow = page.locator(
    `[data-testid="hq-report-comparison-row-${STORE_IDS.closed}"]`,
  );
  await expect(closedRow).toContainText("스토리6-1 정정마감점");
  await expect(closedRow).toContainText("본사 마감 2일");
  await expect(closedRow).toContainText("₩822,000");
  await expect(closedRow).toContainText("정정 반영");
  await closedRow.getByText("근거 보기").first().click();
  await expect(closedRow).toContainText("원본");
  await expect(closedRow).toContainText("₩1,077,000");
  await expect(closedRow).toContainText("정정 반영");
  await expect(closedRow).toContainText("₩822,000");
  await expect(
    closedRow.getByRole("link", { name: "장부 상세" }).first(),
  ).toHaveAttribute("href", /\/app\/ledgers\//);
  await expect(
    closedRow.getByRole("link", { name: "정정 타임라인" }).first(),
  ).toHaveAttribute("href", /\/app\/ledgers\/.+#correction-timeline/);

  const inProgressRow = page.locator(
    `[data-testid="hq-report-comparison-row-${STORE_IDS.inProgress}"]`,
  );
  await expect(inProgressRow).toContainText("스토리6-2 입력중점");
  await expect(inProgressRow).toContainText("미마감 포함");
  await expect(inProgressRow).toContainText("입력 중 1일");
  await expect(inProgressRow).toContainText("₩150,000");

  const emptyRow = page.locator(
    `[data-testid="hq-report-comparison-row-${STORE_IDS.empty}"]`,
  );
  await expect(emptyRow).toContainText("스토리6-1 미입력점");
  await expect(emptyRow).toContainText("미입력");

  const holidayRow = page.locator(
    `[data-testid="hq-report-comparison-row-${STORE_IDS.holiday}"]`,
  );
  await expect(holidayRow).toContainText("스토리6-1 휴무점");
  await expect(holidayRow).toContainText("휴무 2일");
  await expect(holidayRow).toContainText("정정 확인 필요");

  await getStoreSelect(page).selectOption(STORE_IDS.closed);
  await page.getByRole("button", { name: "조회" }).click();
  await expect(page).toHaveURL(new RegExp(`storeId=${STORE_IDS.closed}`));
  await expect(getStoreSelect(page)).toHaveValue(STORE_IDS.closed);
  await expect(closedRow).toContainText("스토리6-1 정정마감점");
  await expect(emptyRow).toHaveCount(0);
});

test("본사는 기간 대조의 세 블록과 안전한 대조 기간 입력을 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto(
    "/app/reports/comparison?mode=contrast&startDate=2026-06-01&endDate=2026-06-30&baseStartDate=2026-05-01&baseEndDate=2026-05-31",
  );

  await expect(page.getByLabel("대조 기간", { exact: true })).toBeVisible();
  await expect(page.getByLabel("현재", { exact: true })).toBeVisible();
  await expect(page.getByLabel("과거 대비 현재 증감")).toBeVisible();
  await expect(page.getByRole("link", { name: "Excel" })).toBeVisible();
  await expect(page.getByRole("link", { name: "CSV" })).toHaveCount(0);

  // 한쪽 날짜만 입력하면 임의의 혼합 기간이 아니라 직전 동일 길이로 폴백한다.
  await page.goto(
    "/app/reports/comparison?mode=contrast&startDate=2026-06-01&endDate=2026-06-30&baseStartDate=2026-05-01",
  );
  await expect(
    page.getByText(/대조 기간은 시작일과 종료일을 모두 입력/),
  ).toBeVisible();
  await expect(page.getByLabel("대조 시작일")).toHaveValue("2026-05-02");
  await expect(page.getByLabel("대조 종료일")).toHaveValue("2026-05-31");
});

test("본사는 시계열에서 지점 선택, 연도 범위, 표와 차트를 함께 사용한다", async ({
  page,
}) => {
  test.slow();
  const year = getCurrentMonthInput().slice(0, 4);
  await login(page, "hq@example.com");

  // 지표 축은 전체 지점으로 위장하지 않고 첫 권한 지점을 명시적으로 선택한다.
  await page.goto(
    `/app/reports/comparison?mode=trend&axis=metric&unit=month&year=${year}`,
  );
  await expect(getStoreSelect(page)).not.toHaveValue("");
  await expect(
    page.locator('[data-testid="hq-report-trend-row-salesAmount"]'),
  ).toBeVisible();
  const metricTrendHeader = page
    .getByRole("heading", { name: "기간 분석" })
    .locator("..");
  const selectedMetricStoreName = (
    await getStoreSelect(page).locator("option:checked").textContent()
  )?.trim();
  expect(selectedMetricStoreName).toBeTruthy();
  await expect(metricTrendHeader).toContainText(
    `${year}-01-01부터 ${year}-12-31까지`,
  );
  await expect(metricTrendHeader).toContainText(selectedMetricStoreName!);

  // 연도 축은 중간 달까지 이어지는 기간이 아니라 같은 월일의 계절 구간이다.
  const seasonFromYear = Number(year) - 2;
  await page.goto(
    `/app/reports/comparison?mode=trend&axis=metric&unit=year&year=${year}&fromYear=${seasonFromYear}&toYear=${year}&fromMonth=6&toMonth=8&storeId=${STORE_IDS.closed}`,
  );
  const seasonTrendHeader = page
    .getByRole("heading", { name: "기간 분석" })
    .locator("..");
  await expect(seasonTrendHeader).toContainText(
    `${seasonFromYear}~${year}년, 매년 6월 1일~8월 31일`,
  );
  await expect(seasonTrendHeader).toContainText("스토리6-1 정정마감점");

  // 지점 축에서 선택 지점을 실제 데이터 범위에 적용하고 꺾은선 차트를 제공한다.
  await page.goto(
    `/app/reports/comparison?mode=trend&axis=store&unit=month&year=${year}&storeId=${STORE_IDS.closed}&metricKey=salesAmount`,
  );
  await expect(getStoreSelect(page)).toHaveValue(STORE_IDS.closed);
  await expect(
    page.locator(`[data-testid="hq-report-trend-row-${STORE_IDS.closed}"]`),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "기간 통합값" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("매출 지점별 기간 추이 꺾은선 차트"),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid^="hq-report-trend-row-"]'),
  ).toHaveCount(1);

  // 한 기간만 조회해도 실제 값의 점을 차트에서 확인할 수 있다.
  const currentMonth = Number(getCurrentMonthInput().slice(5));
  await page.goto(
    `/app/reports/comparison?mode=trend&axis=store&unit=year&year=${year}&fromYear=${year}&toYear=${year}&fromMonth=${currentMonth}&toMonth=${currentMonth}&storeId=${STORE_IDS.closed}&metricKey=salesAmount`,
  );
  const singlePointChart = page.getByLabel("매출 지점별 기간 추이 꺾은선 차트");
  await expect(singlePointChart).toBeVisible();
  await expect(singlePointChart.locator("svg.recharts-surface")).toBeVisible();
  expect(await singlePointChart.locator("circle").count()).toBeGreaterThan(0);

  // 모바일에서는 지점 범례가 항목 단위로 다음 줄에 배치되고 화면을 넘지 않는다.
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(
    `/app/reports/comparison?mode=trend&axis=store&unit=month&year=${year}&metricKey=salesAmount`,
  );
  const trendLegend = page.locator('[aria-label="지점 범례"]');
  await expect(trendLegend).toBeVisible();
  const trendLegendBox = await trendLegend.boundingBox();
  expect(trendLegendBox).not.toBeNull();
  expect(trendLegendBox!.x + trendLegendBox!.width).toBeLessThanOrEqual(376);
  const mobileViewportWidths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(mobileViewportWidths.scrollWidth).toBeLessThanOrEqual(
    mobileViewportWidths.clientWidth + 1,
  );

  // UI 숫자 제한을 우회한 URL도 500이 아니라 안전한 기본 연도로 폴백한다.
  await page.goto(
    "/app/reports/comparison?mode=trend&axis=store&unit=month&year=999999",
  );
  await expect(page.getByRole("heading", { name: "기간 분석" })).toBeVisible();
  await expect(page.getByText(/연도는 2000년부터 2100년 사이/)).toBeVisible();
});

test("본사는 기간 비교에서 권한 밖 지점 필터를 데이터 없이 안내받는다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto(
    "/app/reports/comparison?startDate=2026-05-31&endDate=2026-06-02&storeId=missing-store",
  );

  await expect(page.getByRole("heading", { name: "기간 분석" })).toBeVisible();
  await expect(page.getByText(/조회 지점을 확인/)).toBeVisible();
  await expect(
    page.getByText(/선택한 조건에 표시할 지점 데이터가 없습니다/),
  ).toBeVisible();
  await expect(
    page.locator(`[data-testid^="hq-report-comparison-row-"]`),
  ).toHaveCount(0);
});

test("본사는 좁은 화면에서도 기간 비교 핵심 지표와 상태를 본다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page, "hq@example.com");
  await page.goto(
    `/app/reports/comparison?startDate=2026-05-31&endDate=${getTodayKstInput()}&storeId=${STORE_IDS.closed}`,
  );

  await expect(page.getByRole("heading", { name: "기간 분석" })).toBeVisible();

  const closedCard = page.locator(
    `[data-testid="hq-report-comparison-mobile-row-${STORE_IDS.closed}"]`,
  );
  await expect(closedCard).toBeVisible();
  await expect(closedCard).toContainText("스토리6-1 정정마감점");
  await expect(closedCard).toContainText("본사 마감");
  await expect(closedCard).toContainText("매출");
  await expect(closedCard).toContainText("정정 반영");
  await expect(closedCard).toContainText("나머지 지표");

  const viewportWidths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewportWidths.scrollWidth).toBeLessThanOrEqual(
    viewportWidths.clientWidth + 1,
  );
});

const missingWorkerAverageReason = "평균 근무인원 계산 대상 장부가 없습니다.";

async function expectAverageWorkerCount(
  row: Locator,
  expected: { text: string } | { unavailableReason: string },
) {
  const headcount = row.getByTestId("average-worker-count");
  await expect(headcount).toBeVisible();

  if ("text" in expected) {
    await expect(headcount).toHaveText(expected.text);
    await expect(headcount.getByText("근거 보기")).toHaveCount(0);
    return;
  }

  await expect(headcount).toContainText("계산 불가");
  await expect(headcount.getByText("근거 보기")).toHaveCount(1);
  await expect(headcount.getByText(expected.unavailableReason)).toBeHidden();
  await headcount.getByText("근거 보기").click();
  await expect(headcount.getByText(expected.unavailableReason)).toBeVisible();
  await expect(headcount.getByText("공란")).toHaveCount(0);
}

test("PC 기간 비교는 평균 근무인원 숫자만 보여주고 null일 때만 근거를 연다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, "hq@example.com");
  await page.goto(
    `/app/reports/comparison?startDate=2026-05-31&endDate=${getTodayKstInput()}`,
  );
  await expect(page.getByRole("heading", { name: "기간 분석" })).toBeVisible();

  const closed = page.locator(
    `[data-testid="hq-report-comparison-row-${STORE_IDS.closed}"]`,
  );
  const zeroSales = page.locator(
    `[data-testid="hq-report-comparison-row-${STORE_IDS.zeroSales}"]`,
  );
  const holiday = page.locator(
    `[data-testid="hq-report-comparison-row-${STORE_IDS.holiday}"]`,
  );
  await expect(closed).toBeVisible();
  await expect(
    page.locator(
      `[data-testid="hq-report-comparison-mobile-row-${STORE_IDS.closed}"]`,
    ),
  ).toBeHidden();

  await expectAverageWorkerCount(closed, { text: "2.50명" });
  await expectAverageWorkerCount(zeroSales, { text: "0.00명" });
  await expectAverageWorkerCount(holiday, {
    unavailableReason: missingWorkerAverageReason,
  });
});

test("모바일 기간 비교는 평균 근무인원 숫자만 보여주고 null일 때만 근거를 연다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page, "hq@example.com");
  await page.goto(
    `/app/reports/comparison?startDate=2026-05-31&endDate=${getTodayKstInput()}`,
  );
  await expect(page.getByRole("heading", { name: "기간 분석" })).toBeVisible();

  const closed = page.locator(
    `[data-testid="hq-report-comparison-mobile-row-${STORE_IDS.closed}"]`,
  );
  const zeroSales = page.locator(
    `[data-testid="hq-report-comparison-mobile-row-${STORE_IDS.zeroSales}"]`,
  );
  const holiday = page.locator(
    `[data-testid="hq-report-comparison-mobile-row-${STORE_IDS.holiday}"]`,
  );
  await expect(closed).toBeVisible();
  await expect(
    page.locator(
      `[data-testid="hq-report-comparison-row-${STORE_IDS.closed}"]`,
    ),
  ).toBeHidden();

  await expectAverageWorkerCount(closed, { text: "2.50명" });
  await expectAverageWorkerCount(zeroSales, { text: "0.00명" });
  await expectAverageWorkerCount(holiday, {
    unavailableReason: missingWorkerAverageReason,
  });
});
