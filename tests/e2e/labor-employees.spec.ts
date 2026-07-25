import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(/이메일|로그인 식별자/).fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

// 정책 8.1 승인(2026-07-25, WO-25 CAP-1)으로 직원 관리가 공개됐다. 승인 전에는 세 역할
// 모두 404를 봤고, 이제는 requireReportAccess(페이지 접근)와 SETTINGS_MANAGE(쓰기)
// 두 단계로 갈린다. 이 스위트는 그 접근 매트릭스를 고정한다.

test("본사 관리자는 직원 관리에서 등록 상세와 급여 롤업을 편집할 수 있다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/labor/employees");

  await expect(page.getByRole("heading", { name: "직원 관리" })).toBeVisible();
  await expect(page.getByText("직원 추가")).toBeVisible();
  for (const fieldLabel of [
    "이름",
    "입사일",
    "하루 인건비",
    "희망 4대보험 금액",
    "희망 현금 금액",
  ]) {
    await expect(page.getByLabel(fieldLabel)).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "저장" })).toBeVisible();
  await expect(
    page.getByText("직원 정보는 조회만 가능합니다.", { exact: false }),
  ).toHaveCount(0);
  await expect(page.getByText("직원별 월간 급여 롤업")).toBeVisible();
});

test("조회 전용 본사 사용자는 직원 관리를 읽기만 하고 편집 폼을 받지 않는다", async ({
  page,
}) => {
  await login(page, "hq-viewer@example.com");
  await page.goto("/app/labor/employees");

  await expect(page.getByRole("heading", { name: "직원 관리" })).toBeVisible();
  await expect(
    page.getByText(
      "직원 정보는 조회만 가능합니다. 추가/수정/비활성화는 설정 관리 권한(SETTINGS_MANAGE)이 필요합니다.",
    ),
  ).toBeVisible();
  await expect(page.getByText("직원 추가")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "저장" })).toHaveCount(0);
  await expect(page.getByLabel("희망 4대보험 금액")).toHaveCount(0);
  await expect(page.getByText("직원별 월간 급여 롤업")).toBeVisible();
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
