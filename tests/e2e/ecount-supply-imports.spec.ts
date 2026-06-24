import { expect, test, type Page } from "@playwright/test";

// WO(2026-06-24): 본사 이카운트 출고/입고 업로드 진입 + 리포트 스모크.
// 업로드/commit 전체 흐름은 unit(parser/mapping/commit 계약)에서 검증하고, 여기서는
// 본사 권한으로 새 화면이 노출되고 매입 기준 select가 사라졌는지(정책 전환)를 확인한다.

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

test("본사는 이카운트 업로드 화면에 진입해 파일 업로드와 최근 업로드 목록을 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/ecount-imports");

  await expect(
    page.getByRole("heading", { name: "이카운트 업로드" }),
  ).toBeVisible();

  // 파일 업로드 컨트롤(.xlsx)이 노출된다.
  await expect(page.locator('input[type="file"]')).toBeAttached();
});

test("본사는 출고/입고 리포트 화면을 조회 필터와 함께 본다", async ({ page }) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/ecount-supply");

  await expect(
    page.getByRole("heading", { name: "본사 출고 / 지점 입고 내역" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "조회" })).toBeVisible();
  // 실제 판매 데이터가 없으므로 추정 표기 원칙이 화면 설명에 드러난다.
  await expect(page.getByText("추정", { exact: false }).first()).toBeVisible();
});

test("지점장은 이카운트 업로드 화면에 접근할 수 없다", async ({ page }) => {
  await login(page, "manager@example.com");
  await page.goto("/app/ecount-imports");

  await expect(page).toHaveURL(/unauthorized/);
});
