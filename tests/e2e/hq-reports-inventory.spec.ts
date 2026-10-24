import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import {
  setupReportFixtures,
  STORE_IDS,
  PRODUCT_IDS,
  THIRTY_PERCENT_EXPORT_PATTERN,
  login,
  getTodayKstInput,
  getCurrentMonthInput,
  getStoreSelect,
} from "./_helpers/hq-reports";

setupReportFixtures();

test("본사는 일별 리포트에서 전 지점 재고 현황으로 이동해 남은 재고를 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/daily?date=today");

  await page.getByRole("link", { name: "재고 현황" }).click();
  await expect(page).toHaveURL(/\/app\/reports\/inventory/);
  await expect(
    page.getByRole("heading", { name: "전 지점 재고 현황" }),
  ).toBeVisible();

  const closedRow = page.locator(
    `[data-testid="hq-report-inventory-row-${STORE_IDS.closed}-${PRODUCT_IDS.fish}"]`,
  );
  await expect(closedRow).toContainText("스토리6-1 정정마감점");
  await expect(closedRow).toContainText("스토리5-5 광어");
  // 남은 재고 12개 → 재고 금액 120,000원, 입력됨.
  await expect(closedRow).toContainText("₩120,000");
  await expect(closedRow).toContainText("입력됨");

  await closedRow
    .getByRole("button", { name: /재고 금액 FIFO 매입 이력 보기/ })
    .click();
  await expect(page.getByRole("dialog")).toContainText("FIFO 매입 이력");
  await expect(page.getByRole("dialog")).toContainText("최근 1개월");
  await expect(page.getByRole("dialog")).toContainText("입고 영업일");
  await expect(page.getByRole("dialog")).toContainText("₩120,000");
  await page.keyboard.press("Escape");

  await closedRow
    .getByRole("button", { name: /전일재고 FIFO 매입 이력 보기/ })
    .click();
  await expect(page.getByRole("dialog")).toContainText("FIFO 매입 이력");
  await page.keyboard.press("Escape");

  // 장부 없는 지점은 0이 아니라 미입력으로 노출된다.
  const emptyRow = page.locator(
    `[data-testid="hq-report-inventory-row-${STORE_IDS.empty}-missing"]`,
  );
  await expect(emptyRow).toContainText("스토리6-1 미입력점");
  await expect(emptyRow).toContainText("미입력");
});

test("본사는 전 지점 재고 현황을 지점 필터로 좁혀 본다", async ({ page }) => {
  await login(page, "hq@example.com");
  await page.goto(
    `/app/reports/inventory?date=${getTodayKstInput()}&storeId=${STORE_IDS.closed}`,
  );

  await expect(
    page.getByRole("heading", { name: "전 지점 재고 현황" }),
  ).toBeVisible();
  await expect(getStoreSelect(page)).toHaveValue(STORE_IDS.closed);

  const closedRow = page.locator(
    `[data-testid="hq-report-inventory-row-${STORE_IDS.closed}-${PRODUCT_IDS.fish}"]`,
  );
  await expect(closedRow).toContainText("스토리5-5 광어");

  // 다른 지점의 미입력 행은 필터 결과에서 제외된다.
  await expect(
    page.locator(
      `[data-testid="hq-report-inventory-row-${STORE_IDS.empty}-missing"]`,
    ),
  ).toHaveCount(0);
});

test("본사는 좁은 화면에서도 전 지점 재고 현황 핵심 값을 본다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page, "hq@example.com");
  await page.goto(
    `/app/reports/inventory?date=${getTodayKstInput()}&storeId=${STORE_IDS.closed}`,
  );

  await expect(
    page.getByRole("heading", { name: "전 지점 재고 현황" }),
  ).toBeVisible();

  const closedCard = page.locator(
    `[data-testid="hq-report-inventory-mobile-row-${STORE_IDS.closed}-${PRODUCT_IDS.fish}"]`,
  );
  await expect(closedCard).toBeVisible();
  await expect(closedCard).toContainText("스토리5-5 광어");
  await expect(closedCard).toContainText("남은 재고");
  await expect(closedCard).toContainText("₩120,000");
  await expect(closedCard).toContainText("나머지 지표");

  const viewportWidths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewportWidths.scrollWidth).toBeLessThanOrEqual(
    viewportWidths.clientWidth + 1,
  );
});

test("본사는 전 지점 재고 현황을 CSV로 내려받고 미입력 행을 확인한다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto(`/app/reports/inventory?date=${getTodayKstInput()}`);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^erp-fish-report-inventory-\d{4}-\d{2}-\d{2}\.csv$/,
  );
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const csv = await readFile(downloadPath, "utf8");

  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain("스토리5-5 광어");
  expect(csv).toContain("미입력");
  expect(csv).not.toContain("inventoryAmount");
  expect(csv).not.toContain("unitPrice");
  expect(csv).not.toMatch(THIRTY_PERCENT_EXPORT_PATTERN);
});

test("본사는 월간 리포트에서 손익 준비도와 추정 매출 순위 라벨을 본다", async ({
  page,
}) => {
  test.slow();
  await login(page, "hq@example.com");
  await page.goto(
    `/app/reports/monthly?month=${getCurrentMonthInput()}&storeId=${STORE_IDS.closed}`,
    { waitUntil: "domcontentloaded" },
  );

  await expect(
    page.getByRole("heading", { name: "월간 요약 리포트" }),
  ).toBeVisible();

  const plReadiness = page.getByTestId("hq-report-monthly-pl-readiness");
  await expect(plReadiness).toContainText("손익(P&L) 리포트 준비도");
  await expect(plReadiness).toContainText("실측");
  await expect(plReadiness).toContainText("추정");
  await expect(plReadiness).toContainText("미구현");
  await expect(
    page.getByTestId("hq-report-monthly-pl-input-sales"),
  ).toContainText("실측");
  await expect(
    page.getByTestId("hq-report-monthly-pl-input-labor"),
  ).toContainText("실측");
  await expect(
    page.getByTestId("hq-report-monthly-pl-input-productSales"),
  ).toContainText("추정");

  await expect(page.getByLabel("매출 상위·하위 품목")).toContainText(
    "매출 상위5 / 하위5 품목 (추정)",
  );
});

test("지점장은 전 지점 재고 현황 리포트에 접근할 수 없다", async ({ page }) => {
  await login(page, "manager@example.com");
  await page.goto(`/app/reports/inventory?date=${getTodayKstInput()}`);

  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
});

test("지점장은 일별 아침 회의 리포트에 접근할 수 없다", async ({ page }) => {
  await login(page, "manager@example.com");
  await page.goto("/app/reports/daily?date=today");

  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
});

test("지점장은 본사 인건비 현황에 접근할 수 없다", async ({ page }) => {
  await login(page, "manager@example.com");
  await page.goto("/app/reports/labor?month=2026-05");

  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
  await expect(page.getByText("복합 미연결 직원")).toHaveCount(0);
});

test("지점장은 기간 비교 리포트에 접근할 수 없다", async ({ page }) => {
  await login(page, "manager@example.com");
  await page.goto(
    "/app/reports/comparison?startDate=2026-05-31&endDate=2026-06-02",
  );

  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
});

test("지점장은 월간 리포트에 접근할 수 없다", async ({ page }) => {
  await login(page, "manager@example.com");
  await page.goto(
    `/app/reports/monthly?month=${getCurrentMonthInput()}&storeId=${STORE_IDS.closed}`,
  );

  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
});

// WO-16(2026-06-28): 본사 전용 품목 검토 / 매출 검토 차트 페이지. 차트↔표 전환을 제공한다.
