import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(/이메일|로그인 식별자/).fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

// WO-0806 #5: 직원 관리는 계좌번호·주소·급여를 다루므로 대표(LABOR_VIEW) 전용이다.
// 이전에는 REPORT_VIEW를 가진 모든 본사 계정이 볼 수 있었다. 이 스위트가 그 경계를 고정한다.

test("대표는 인사관리 카드에서 직원 상세를 등록하고 검색할 수 있다", async ({
  page,
}) => {
  await login(page, "owner@example.com");
  await page.goto("/app/labor/employees");

  await expect(page.getByRole("heading", { name: "직원 관리" })).toBeVisible();
  await expect(page.getByText("인사관리 카드 등록")).toBeVisible();
  for (const fieldLabel of [
    "이름",
    "직급",
    "입사일",
    "연락처",
    "주소",
    "계좌번호",
    "하루 인건비",
    "희망 4대보험 금액",
  ]) {
    await expect(page.getByLabel(fieldLabel)).toBeVisible();
  }
  // WO-0806 #1-5: 희망 현금은 인건비 리포트에서 자동계산하므로 입력란이 없다.
  await expect(page.getByLabel("희망 현금 금액")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "저장" })).toBeVisible();
  // WO-0806 #1-7: 이름 검색.
  await expect(page.getByLabel("직원 검색")).toBeVisible();
  // WO-0806 #1-10/#1-13: 급여 롤업과 근무 인원 수별 평균은 제거됐다.
  await expect(page.getByText("직원별 월간 급여 롤업")).toHaveCount(0);
  await expect(page.getByText("근무 인원 수별 평균")).toHaveCount(0);
  await expect(page.getByText("월간 생산성 / 인력 배치 분석")).toBeVisible();
});

test("본사 관리자는 직원 관리에 접근할 수 없다", async ({ page }) => {
  await login(page, "hq@example.com");
  await page.goto("/app/labor/employees");

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(page.getByRole("heading", { name: "직원 관리" })).toHaveCount(0);
});

test("조회 전용 본사 사용자는 직원 관리에 접근할 수 없다", async ({ page }) => {
  await login(page, "hq-viewer@example.com");
  await page.goto("/app/labor/employees");

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(page.getByRole("heading", { name: "직원 관리" })).toHaveCount(0);
});

test("지점장은 직원 관리에 접근할 수 없다", async ({ page }) => {
  await login(page, "manager@example.com");
  await page.goto("/app/labor/employees");

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "직원 관리" })).toHaveCount(0);
});

// WO-0806 #5: 사이드바·리포트 네비게이션에서도 링크 자체가 사라져야 한다.
test("대표에게는 인건비·직원 관리 메뉴가 보인다", async ({ page }) => {
  await login(page, "owner@example.com");

  await expect(page.getByRole("link", { name: "직원 관리" })).toBeVisible();
  await expect(page.getByRole("link", { name: "인건비 현황" })).toBeVisible();

  await page.goto("/app/reports/daily");
  await expect(
    page.getByRole("link", { name: "인건비", exact: true }),
  ).toBeVisible();
});

test("대표가 아닌 본사 계정에는 인건비·직원 관리 메뉴가 보이지 않는다", async ({
  page,
}) => {
  await login(page, "hq@example.com");

  await expect(page.getByRole("link", { name: "직원 관리" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "인건비 현황" })).toHaveCount(0);

  await page.goto("/app/reports/daily");
  await expect(
    page.getByRole("link", { name: "인건비", exact: true }),
  ).toHaveCount(0);
});
