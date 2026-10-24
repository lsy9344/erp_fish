import { expect, test } from "@playwright/test";
import {
  setupReportFixtures,
  STORE_IDS,
  login,
  getCurrentMonthInput,
  getStoreSelect,
} from "./_helpers/hq-reports";

setupReportFixtures();

test("본사는 리포트에 들어와 통합 리포트를 열고 차트와 같은 표를 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  const reportsLink = page.getByRole("link", { name: "리포트" });
  await expect(reportsLink).toHaveAttribute("href", "/app/reports/daily");

  // 리포트 진입점은 매일 쓰는 아침 회의 리포트로 연다.
  await page.goto("/app/reports/daily");
  await expect(page).toHaveURL(/\/app\/reports\/daily/);
  await expect(
    page.getByRole("heading", { name: "아침 회의 리포트" }),
  ).toBeVisible();

  // 통합 리포트는 상단 리포트 메뉴에서 한 번에 이동한다.
  await page.getByRole("link", { name: "통합 리포트" }).click();
  await expect(page).toHaveURL(/\/app\/reports\/overview/);
  await expect(
    page.getByRole("heading", { name: "통합 리포트" }),
  ).toBeVisible();
  await expect(page.getByLabel("조회 월")).toHaveValue(getCurrentMonthInput());
  await expect(page.getByText("영업 매출 합계").first()).toBeVisible();
  await expect(page.getByText("손실 유형").first()).toBeVisible();
  await expect(page.getByText("월 손익 흐름").first()).toBeVisible();
  await expect(page.getByText(/오늘 기준/)).toBeVisible();

  await page.getByRole("button", { name: "표 보기" }).click();
  await expect(page.getByRole("table").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /상세/ }).first()).toBeVisible();
});

// WO-0806 #5: 인건비 현황은 대표(LABOR_VIEW) 전용이다.
test("대표는 인건비 현황에서 미연결 근무자와 지점 합계를 읽기 전용으로 본다", async ({
  page,
}) => {
  await login(page, "owner@example.com");
  await page.goto("/app/reports/daily");

  const laborLink = page.getByRole("link", { name: "인건비", exact: true });
  await expect(laborLink).toHaveAttribute("href", "/app/reports/labor");

  await page.goto(
    `/app/reports/labor?month=${getCurrentMonthInput()}&storeId=${STORE_IDS.closed}`,
  );

  await expect(
    page.getByRole("heading", { name: "인건비 현황" }),
  ).toBeVisible();
  await expect(page.getByLabel("조회 월")).toHaveValue(getCurrentMonthInput());
  await expect(getStoreSelect(page)).toHaveValue(STORE_IDS.closed);
  await expect(page.getByRole("link", { name: "Excel" })).toHaveAttribute(
    "href",
    new RegExp(
      `/api/reports/export\\?report=labor&format=xlsx&month=${getCurrentMonthInput()}&storeId=${STORE_IDS.closed}`,
    ),
  );
  // WO-0806 #2: 근무자별 월 정산(월 단위)과 일별 상세(영업일 단위)를 나눠 보여준다.
  const settlement = page.getByLabel("근무자별 월 정산");
  const dailyDetail = page.getByLabel("일별 상세");

  await expect(
    settlement.getByRole("cell", { name: "정상 연결 직원", exact: true }),
  ).toBeVisible();
  await expect(
    settlement.getByRole("cell", { name: "복합 미연결 직원", exact: true }),
  ).toBeVisible();
  // 직원과 연결되지 않은 자유 입력 근무자는 희망 현금을 계산할 수 없다.
  await expect(
    settlement.getByRole("row", { name: /복합 미연결 직원/ }),
  ).toContainText("계산 불가 (직원 미연결)");
  // 월 단위 금액은 일별 상세에 없어야 한다(단위 불일치가 오류의 원인이었다).
  await expect(dailyDetail).not.toContainText("희망 4대보험");
  await expect(dailyDetail).not.toContainText("희망 현금");

  await expect(
    dailyDetail.getByRole("cell", { name: "10분 지각", exact: true }),
  ).toBeVisible();
  await expect(
    dailyDetail.getByRole("cell", { name: "병원 방문", exact: true }),
  ).toBeVisible();
  await expect(
    dailyDetail.getByRole("cell", { name: "인수인계 필요", exact: true }),
  ).toBeVisible();
  await expect(
    dailyDetail
      .getByRole("row", { name: /정상 연결 직원/ })
      .getByText("본사 마감", { exact: true }),
  ).toBeVisible();
  // WO-0806 #2-1: 지점 요약에 근무인원 일평균이 붙는다.
  await expect(page.getByRole("heading", { name: "지점 요약" })).toBeVisible();
  await expect(page.getByLabel("인건비 요약").locator("..")).toContainText(
    "근무인원 일평균",
  );
  await expect(
    page.getByText("조회기간 인건비 합계").locator(".."),
  ).toContainText("1,864,197,540");
  await expect(page.getByText("근무 기록 수").locator("..")).toContainText(
    "2건",
  );
  await expect(page.getByRole("button", { name: /수정|삭제/ })).toHaveCount(0);
});

test("지정 지점 본사는 인건비에서 권한 밖 지점 URL을 빈 결과로 본다", async ({
  page,
}) => {
  await login(page, "hq-assigned@example.com");
  await page.goto(
    `/app/reports/labor?month=${getCurrentMonthInput()}&storeId=${STORE_IDS.closed}`,
  );

  await expect(
    page.getByRole("heading", { name: "인건비 현황" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "조회 지점이 권한 범위에 없거나 비활성입니다. 권한 있는 지점을 선택해 주세요.",
    ),
  ).toBeVisible();
  await expect(getStoreSelect(page)).toHaveValue("");
  await expect(
    page.getByText("조회기간 인건비 합계").locator(".."),
  ).toContainText("₩0");
  await expect(page.getByText("근무 기록 수").locator("..")).toContainText(
    "0건",
  );
  await expect(page.getByRole("heading", { name: "지점 요약" })).toBeVisible();
  await expect(
    page.getByText("선택한 조건에 근무자별 상세 기록이 없습니다."),
  ).toBeVisible();
  await expect(page.getByText("복합 미연결 직원")).toHaveCount(0);
});

test("통합 리포트 월 지점 필터는 URL과 모든 표에 유지된다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto(
    `/app/reports/overview?month=${getCurrentMonthInput()}&storeId=${STORE_IDS.closed}`,
  );

  await expect(page.getByLabel("조회 월")).toHaveValue(getCurrentMonthInput());
  await expect(getStoreSelect(page)).toHaveValue(STORE_IDS.closed);
  await expect(page).toHaveURL(new RegExp(`storeId=${STORE_IDS.closed}`));

  await page.getByRole("button", { name: "표 보기" }).click();
  expect(await page.getByRole("table").count()).toBeGreaterThanOrEqual(5);
  await expect(
    page.getByRole("table").getByText("스토리6-1 정정마감점").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("table").getByText("스토리6-2 입력중점"),
  ).toHaveCount(0);
});

test("통합 리포트는 정정과 손실 계산 기준 누락을 0으로 숨기지 않는다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto(
    `/app/reports/overview?month=${getCurrentMonthInput()}&storeId=${STORE_IDS.closed}`,
  );

  await page.getByRole("button", { name: "표 보기" }).click();
  await expect(page.getByText(/45,000/).first()).toBeVisible();
  await expect(page.getByText(/계산 가능 1\/2건/).first()).toBeVisible();
  await expect(page.getByText(/판매한 가격 기준/).first()).toBeVisible();
  await expect(page.getByText(/^미입력 \d+건$/)).toBeVisible();
});

test("통합 리포트는 조회와 export 권한을 분리한다", async ({ page }) => {
  await login(page, "hq-viewer@example.com");
  await page.goto("/app/reports/overview");

  await expect(
    page.getByRole("heading", { name: "통합 리포트" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Excel/ })).toHaveCount(0);
});

test("지정 지점 본사는 통합 리포트에서 배정 지점만 본다", async ({ page }) => {
  await login(page, "hq-assigned@example.com");
  await page.goto("/app/reports/overview");

  const options = await page
    .locator('select[name="storeId"] option')
    .allTextContents();
  expect(options).toContain("서초점");
  expect(options).not.toContain("스토리6-1 정정마감점");
  expect(options).not.toContain("스토리6-2 입력중점");
});

test("지점장은 통합 리포트에 접근할 수 없다", async ({ page }) => {
  await login(page, "manager@example.com");
  await page.goto("/app/reports/overview");

  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
});

test("통합 리포트는 좁은 화면에서 가로 넘침 없이 키보드로 표를 전환한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page, "hq@example.com");
  await page.goto("/app/reports/overview");

  await page.getByRole("button", { name: "표 보기" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("table").first()).toBeVisible();

  const viewportWidths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewportWidths.scrollWidth).toBeLessThanOrEqual(
    viewportWidths.clientWidth + 1,
  );
});
