import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(/이메일|로그인 식별자/).fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

async function expectEmployeePageHidden(page: Page) {
  await expect(page.locator("body")).toContainText(/404|찾을 수|not found/i);
  await expect(page.getByRole("heading", { name: "직원 관리" })).toHaveCount(0);
  await expect(page.getByText("직원별 월간 급여 롤업")).toHaveCount(0);
  await expect(page.getByLabel("이름")).toHaveCount(0);
  await expect(page.getByLabel("입사일")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "저장" })).toHaveCount(0);
}

for (const { email, role } of [
  { email: "hq@example.com", role: "본사는" },
  { email: "manager@example.com", role: "지점장은" },
  { email: "hq-viewer@example.com", role: "조회 전용 본사 사용자는" },
]) {
  test(`${role} HR preview flag가 꺼진 직원 관리 URL에서 404를 본다`, async ({
    page,
  }) => {
    await login(page, email);

    await page.goto("/app/labor/employees");
    await expectEmployeePageHidden(page);
  });
}
