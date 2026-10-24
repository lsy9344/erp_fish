import { expect, test } from "@playwright/test";
import {
  setupReportFixtures,
  prisma,
  STORE_IDS,
  THIRTY_PERCENT_EXPORT_PATTERN,
  login,
  fetchCsvFromVisibleLink,
  getTodayKstInput,
  getCurrentMonthInput,
  getStoreSelect,
} from "./_helpers/hq-reports";

setupReportFixtures();

test("본사는 월간 리포트에서 선택 지점의 마감 상태와 정정 이상을 본다", async ({
  page,
}) => {
  test.slow();
  await login(page, "hq@example.com");
  await page.goto("/app/reports/daily?date=today");

  await page.getByRole("link", { name: "월간" }).click();
  await expect(page).toHaveURL(/\/app\/reports\/monthly/);
  await expect(
    page.getByRole("heading", { name: "월간 요약 리포트" }),
  ).toBeVisible();

  const currentMonth = getCurrentMonthInput();
  const todayInput = getTodayKstInput();
  const missingDayCount = Math.max(0, Number(todayInput.slice(8, 10)) - 1);

  await expect(page.getByLabel("조회 월")).toHaveValue(currentMonth);
  await getStoreSelect(page).selectOption(STORE_IDS.closed);
  await page.getByRole("button", { name: "조회" }).click();

  await expect(page).toHaveURL(/\/app\/reports\/monthly/);
  await expect(page).toHaveURL(new RegExp(`month=${currentMonth}`));
  await expect(page).toHaveURL(new RegExp(`storeId=${STORE_IDS.closed}`));
  await expect(getStoreSelect(page)).toHaveValue(STORE_IDS.closed);
  await expect(
    page.getByRole("heading", { name: "냉동/생물 매출 (추정)" }),
  ).toHaveCount(0);
  const kpiSummary = page.getByLabel("월간 핵심 성과", { exact: true });
  // WO-0806 #3: 카드 10개 → 2행 테이블. 장부 마감 매출·이월 매출은 화면에서 내렸다.
  await expect(kpiSummary).not.toContainText("장부 마감 매출");
  await expect(kpiSummary).toContainText("순이익");
  await expect(kpiSummary).toContainText("영업이익 − 인건비");
  await expect(kpiSummary).toContainText("마감 장부 숫자만 포함");
  await expect(kpiSummary).toContainText("정정 반영 건수");
  const kpiSales = page.getByTestId("hq-report-monthly-kpi-sales");
  await expect(kpiSales).toContainText("₩45,000");
  await expect(kpiSales).toContainText("정정 반영");

  const lossSummary = page.getByTestId("hq-report-monthly-loss-summary");
  await expect(lossSummary).toContainText("손실 유형별 요약");
  await expect(lossSummary).toContainText("스토리5-5 폐기");
  await expect(lossSummary).toContainText("₩30,000");

  const inventoryFlow = page.getByTestId("hq-report-monthly-inventory-flow");
  await expect(inventoryFlow).toContainText("전일재고");
  await expect(inventoryFlow).toContainText("매입");
  await expect(inventoryFlow).toContainText("당일재고");
  await expect(inventoryFlow).toContainText("조정 차이");

  await expect(page.getByLabel("최고매출품목")).toContainText(
    "계산 기준 확인 필요",
  );
  await expect(page.getByLabel("계산 포함/제외 일자")).toContainText("포함");

  const statusSummary = page.getByLabel("월간 마감 상태 요약");
  await expect(statusSummary).toContainText("본사 마감");
  await expect(statusSummary).toContainText("1일");
  await expect(statusSummary).toContainText("미입력");
  await expect(statusSummary).toContainText(`${missingDayCount}일`);

  const todayRow = page.locator(
    `[data-testid="hq-report-monthly-day-${todayInput}"]`,
  );
  await expect(todayRow).toContainText("본사 마감");
  await expect(todayRow).toContainText("정정 반영");
  await expect(
    todayRow.getByRole("link", { name: "장부 상세" }).first(),
  ).toHaveAttribute("href", /\/app\/ledgers\//);

  if (missingDayCount > 0) {
    const missingRow = page.locator(
      `[data-testid="hq-report-monthly-day-${currentMonth}-01"]`,
    );
    await expect(missingRow).toContainText("미입력");
    // 미작성 일자는 본사가 바로 장부를 만들 수 있어야 한다.
    await expect(
      missingRow.getByRole("button", { name: "장부 작성" }),
    ).toBeVisible();
  }

  const anomalyItem = page
    .locator(`[data-testid^="hq-report-monthly-anomaly-${todayInput}-"]`)
    .first();
  await expect(anomalyItem).toContainText("정정 반영");
  await expect(
    anomalyItem.getByRole("link", { name: "정정 타임라인" }).first(),
  ).toHaveAttribute("href", /\/app\/ledgers\/.+#correction-timeline/);
});

test("본사는 월간 리포트에서 미마감과 휴무 상태를 텍스트로 구분해 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");

  const currentMonth = getCurrentMonthInput();
  const todayInput = getTodayKstInput();

  await page.goto(
    `/app/reports/monthly?month=${currentMonth}&storeId=${STORE_IDS.inProgress}`,
  );

  await expect(
    page.getByRole("heading", { name: "월간 요약 리포트" }),
  ).toBeVisible();
  await expect(getStoreSelect(page)).toHaveValue(STORE_IDS.inProgress);

  const inProgressKpis = page.getByLabel("월간 핵심 성과", { exact: true });
  await expect(inProgressKpis).toContainText("미마감 장부 포함");
  await expect(inProgressKpis).not.toContainText("장부 마감 매출");
  await expect(page.getByTestId("hq-report-monthly-kpi-sales")).toContainText(
    "₩150,000",
  );

  const inProgressStatusSummary = page.getByLabel("월간 마감 상태 요약");
  await expect(inProgressStatusSummary).toContainText("입력 중");
  await expect(inProgressStatusSummary).toContainText("미마감 장부 포함");

  const inProgressDay = page.locator(
    `[data-testid="hq-report-monthly-day-${todayInput}"]`,
  );
  await expect(inProgressDay).toContainText("입력 중");
  await expect(page.getByLabel("계산 포함/제외 일자")).toContainText(
    "장부 집계 포함",
  );

  await getStoreSelect(page).selectOption(STORE_IDS.holiday);
  await page.getByRole("button", { name: "조회" }).click();

  await expect(page).toHaveURL(new RegExp(`storeId=${STORE_IDS.holiday}`));
  await expect(getStoreSelect(page)).toHaveValue(STORE_IDS.holiday);

  const holidayStatusSummary = page.getByLabel("월간 마감 상태 요약");
  await expect(holidayStatusSummary).toContainText("휴무");
  await expect(holidayStatusSummary).toContainText("미입력");

  const holidayDay = page.locator(
    `[data-testid="hq-report-monthly-day-${todayInput}"]`,
  );
  await expect(holidayDay).toContainText("휴무");
  await expect(holidayDay).not.toContainText("입력 중");
  await expect(page.getByLabel("계산 포함/제외 일자")).toContainText("휴무일");
});

test("본사는 월간 리포트에서 잘못된 월과 지점 URL을 빈 결과로 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/monthly?month=2026-13&storeId=missing-store");

  await expect(
    page.getByRole("heading", { name: "월간 요약 리포트" }),
  ).toBeVisible();
  await expect(page.getByText(/조회 월을 확인/)).toBeVisible();
  await expect(page.getByText(/권한 범위에 없거나 비활성/)).toBeVisible();
  await expect(page.getByText(/표시할 지점 데이터가 없습니다/)).toBeVisible();
  await expect(page.getByLabel("조회 월")).toHaveValue(getCurrentMonthInput());
  await expect(getStoreSelect(page)).toHaveValue("");
});

test("본사는 일별 기간비교 월간 리포트를 CSV로 다운로드하고 감사 이력을 본다", async ({
  page,
}) => {
  test.setTimeout(90_000);

  await login(page, "hq@example.com");

  await page.goto("/app/reports/daily?date=today");
  const dailyCsv = await fetchCsvFromVisibleLink(
    page,
    /filename="erp-fish-report-daily-\d{4}-\d{2}-\d{2}\.csv"/,
  );
  expect(dailyCsv).toContain("정정 반영");
  expect(dailyCsv).not.toContain("300000");
  expect(dailyCsv).not.toContain("inventoryAmount");
  expect(dailyCsv).not.toContain("lot");
  expect(dailyCsv).not.toMatch(THIRTY_PERCENT_EXPORT_PATTERN);

  await page.goto(
    `/app/reports/comparison?startDate=2026-05-31&endDate=${getTodayKstInput()}`,
  );
  const comparisonCsv = await fetchCsvFromVisibleLink(
    page,
    /filename="erp-fish-report-comparison-2026-05-31-\d{4}-\d{2}-\d{2}\.csv"/,
  );
  expect(comparisonCsv).not.toMatch(THIRTY_PERCENT_EXPORT_PATTERN);

  await page.goto(
    `/app/reports/monthly?month=${getCurrentMonthInput()}&storeId=${STORE_IDS.closed}`,
  );
  const monthlyCsv = await fetchCsvFromVisibleLink(
    page,
    `erp-fish-report-monthly-${getCurrentMonthInput()}.csv`,
  );
  expect(monthlyCsv).not.toMatch(THIRTY_PERCENT_EXPORT_PATTERN);

  const auditLogs = await prisma.auditLog.findMany({
    where: { targetType: "ReportExport" },
    orderBy: { createdAt: "desc" },
  });

  expect(auditLogs).toHaveLength(3);
  expect(auditLogs.every((log) => log.action === "report.export.created")).toBe(
    true,
  );
  expect(auditLogs.every((log) => log.after)).toBe(true);

  await page.goto("/app/master-data/history?targetType=ReportExport");
  await expect(page.getByRole("heading", { name: "변경 이력" })).toBeVisible();
  await expect(page.getByText("리포트 Export").first()).toBeVisible();
  await expect(page.getByText("리포트 Export 생성").first()).toBeVisible();
});

test("export 권한이 없는 본사 조회 사용자와 지점장은 CSV를 받을 수 없다", async ({
  page,
}) => {
  await login(page, "hq-viewer@example.com");
  await page.goto("/app/reports/daily?date=today");
  await expect(page.getByRole("link", { name: "CSV" })).toHaveCount(0);

  const viewerResponse = await page.goto(
    `/api/reports/export?report=daily&date=${getTodayKstInput()}&format=csv`,
  );
  expect(viewerResponse?.status()).toBe(403);
  await expect(page.locator("body")).not.toContainText("grossProfit");
  await expect(page.locator("body")).not.toContainText(STORE_IDS.closed);
  await expect(page.locator("body")).not.toContainText(
    THIRTY_PERCENT_EXPORT_PATTERN,
  );

  await page.context().clearCookies();
  await login(page, "manager@example.com");
  const managerResponse = await page.goto(
    `/api/reports/export?report=monthly&month=${getCurrentMonthInput()}&storeId=${STORE_IDS.closed}&format=csv`,
  );
  expect(managerResponse?.status()).toBe(403);
  await expect(page.locator("body")).not.toContainText("inventoryAmount");
  await expect(page.locator("body")).not.toContainText(STORE_IDS.closed);
  await expect(page.locator("body")).not.toContainText(
    THIRTY_PERCENT_EXPORT_PATTERN,
  );
});

test("본사는 잘못된 export 요청에서 CSV 파일이나 감사 로그를 받지 않는다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await prisma.auditLog.deleteMany({ where: { targetType: "ReportExport" } });

  const response = await page.request.get(
    "/api/reports/export?report=monthly&month=2026-13&format=csv",
  );
  const responseText = await response.text();

  expect(response.status()).toBe(400);
  expect(response.headers()["content-disposition"]).toBeUndefined();
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(responseText).toContain("bad_request");
  expect(responseText).not.toContain(STORE_IDS.closed);
  expect(responseText).not.toContain("inventoryAmount");
  expect(responseText).not.toMatch(THIRTY_PERCENT_EXPORT_PATTERN);

  const auditLogCount = await prisma.auditLog.count({
    where: { targetType: "ReportExport" },
  });
  expect(auditLogCount).toBe(0);
});

test("본사는 좁은 화면에서도 월간 리포트 날짜와 이상 항목을 본다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page, "hq@example.com");

  const currentMonth = getCurrentMonthInput();
  const todayInput = getTodayKstInput();

  await page.goto(
    `/app/reports/monthly?month=${currentMonth}&storeId=${STORE_IDS.closed}`,
  );

  await expect(
    page.getByRole("heading", { name: "월간 요약 리포트" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("월간 핵심 성과", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId("hq-report-monthly-loss-summary"),
  ).toBeVisible();
  await expect(
    page.getByTestId("hq-report-monthly-inventory-flow"),
  ).toBeVisible();
  await expect(page.getByLabel("최고매출품목")).toContainText(
    "계산 기준 확인 필요",
  );

  const mobileDay = page.locator(
    `[data-testid="hq-report-monthly-mobile-day-${todayInput}"]`,
  );
  await expect(mobileDay).toBeVisible();
  await expect(mobileDay).toContainText("본사 마감");
  await expect(mobileDay).toContainText("정정 반영");

  const anomalyItem = page
    .locator(`[data-testid^="hq-report-monthly-anomaly-${todayInput}-"]`)
    .first();
  await expect(anomalyItem).toBeVisible();
  await expect(anomalyItem).toContainText("정정 타임라인");

  const viewportWidths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewportWidths.scrollWidth).toBeLessThanOrEqual(
    viewportWidths.clientWidth + 1,
  );
});
