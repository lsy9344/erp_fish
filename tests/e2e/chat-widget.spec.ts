import { expect, test, type Page } from "@playwright/test";

// 위젯의 열림·입력까지만 검증한다. 답변 내용은 스텁이 하드코딩한 문자열이라
// 검증해도 스텁을 검증하는 것에 그친다(작업지시서 §F).

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

test("본사 화면에서 원형 아이콘으로 채팅창을 열고 질문할 수 있다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/dashboard");

  const launcher = page.getByRole("button", { name: "데이터 질문하기" });
  await expect(launcher).toBeVisible();

  await launcher.click();

  await expect(
    page.getByRole("heading", { name: "데이터 질문" }),
  ).toBeVisible();
  // 열리면 런처는 닫기 버튼과 겹치지 않도록 사라진다.
  await expect(launcher).toBeHidden();

  const input = page.getByLabel("질문 입력");
  await expect(input).toBeEnabled();
  await input.fill("6월 20일 매출 얼마야");
  await page.getByRole("button", { name: "질문 보내기" }).click();

  // 보낸 질문이 대화에 남고, 스텁 LLM의 답변이 도착한다.
  await expect(page.getByText("6월 20일 매출 얼마야")).toBeVisible();
  await expect(page.getByText("스텁 답변")).toBeVisible();
});

test("ESC로 채팅창을 닫으면 원형 아이콘이 돌아온다", async ({ page }) => {
  await login(page, "hq@example.com");
  await page.goto("/app/dashboard");

  const launcher = page.getByRole("button", { name: "데이터 질문하기" });
  await launcher.click();
  await expect(
    page.getByRole("heading", { name: "데이터 질문" }),
  ).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(launcher).toBeVisible();
});

test("지점장 화면에는 챗봇 아이콘이 없다", async ({ page }) => {
  await login(page, "manager@example.com");

  await expect(page).toHaveURL(/\/app\/store-entry/);
  await expect(
    page.getByRole("button", { name: "데이터 질문하기" }),
  ).toHaveCount(0);
});
