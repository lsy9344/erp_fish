import { expect, test } from "@playwright/test";
import { setupReportFixtures, login } from "./_helpers/hq-reports";

setupReportFixtures();

test("본사는 품목 검토 페이지에서 차트와 표를 전환해 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/product-review?date=today");

  await expect(
    page.getByRole("heading", { name: "품목 검토 (추정)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "냉동/생물 매출 (추정)" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "품목별 판매 현황 (추정)" }),
  ).toBeVisible();

  // 기본은 차트 보기. 표 보기로 전환하면 표 헤더가 보인다.
  const profitabilitySection = page
    .locator("section")
    .filter({ hasText: "품목별 판매 현황 (추정)" });
  await profitabilitySection.getByRole("button", { name: "표 보기" }).click();
  await expect(
    profitabilitySection.getByText("추정 판매액 합계", { exact: true }),
  ).toHaveCount(0);
  await expect(
    profitabilitySection
      .getByRole("columnheader", { name: "추정 판매 수량" })
      .or(page.getByText("품목별 판매 데이터 없음"))
      .first(),
  ).toBeVisible();
});

test("본사는 매출 검토 페이지에서 지점별 매출 차트와 표를 전환해 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/sales-review?date=today");

  await expect(
    page.getByRole("heading", { name: "매출 검토 (추정)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "지점별 영업 매출 합계·마진율" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "차트 보기" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "표 보기" }).first(),
  ).toBeVisible();

  const storeSection = page
    .locator("section")
    .filter({ hasText: "지점별 영업 매출 합계·마진율" });
  await expect(
    storeSection.getByTestId("store-performance-chart-scroll"),
  ).toBeVisible();
  await expect(
    storeSection.getByRole("button", { name: "매출액순", exact: true }),
  ).toBeVisible();
  await expect(
    storeSection.getByRole("button", { name: "마진율순", exact: true }),
  ).toBeVisible();
  await storeSection.getByRole("button", { name: "표 보기" }).click();
  await expect(
    storeSection.locator('[data-testid^="hq-report-row-"]').first(),
  ).toBeVisible();
  await storeSection.getByRole("button", { name: "차트 보기" }).click();
  await expect(
    storeSection.getByTestId("store-performance-chart-scroll"),
  ).toBeVisible();

  const profitabilitySection = page
    .locator("section")
    .filter({ hasText: "품목별 추정 매출" });
  await profitabilitySection.getByRole("button", { name: "표 보기" }).click();
  await expect(
    profitabilitySection
      .getByRole("columnheader", { name: "추정 판매 수량" })
      .or(page.getByText("품목별 판매 데이터 없음"))
      .first(),
  ).toBeVisible();
});

test("지점장은 품목 검토와 매출 검토 페이지에 접근할 수 없다", async ({
  page,
}) => {
  await login(page, "manager@example.com");

  await page.goto("/app/reports/product-review?date=today");
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();

  await page.goto("/app/reports/sales-review?date=today");
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
});
