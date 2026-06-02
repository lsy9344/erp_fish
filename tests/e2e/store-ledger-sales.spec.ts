import { expect, test, type Page } from "@playwright/test";

async function loginAsStoreManager(page: Page) {
  await page.goto("/login");

  await page.getByLabel("이메일").fill("manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page).toHaveURL(/\/app\/store-entry/);
}

test("지점장은 오늘 장부에서 매출/결제 단계를 본다", async ({ page }) => {
  await loginAsStoreManager(page);

  await expect(page.getByText("오늘 장부", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "강남점" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "1단계: 매출/결제" }),
  ).toHaveAttribute("aria-current", "step");
  await expect(page.getByText("상태: 입력중")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "총매출", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "현금", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "카드", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "기타 결제수단", exact: true }),
  ).toBeVisible();
});

test("지점장은 매출/결제 금액을 저장하고 재방문 시 유지된다", async ({
  page,
}) => {
  await loginAsStoreManager(page);

  const total = page.getByRole("textbox", { name: "총매출", exact: true });
  const cash = page.getByRole("textbox", { name: "현금", exact: true });
  const card = page.getByRole("textbox", { name: "카드", exact: true });
  const other = page.getByRole("textbox", {
    name: "기타 결제수단",
    exact: true,
  });
  const save = page.getByRole("button", { name: "저장" });

  await total.fill("10000");
  await cash.fill("3000");
  await card.fill("2000");
  await other.fill("1000");

  await expect(page.getByText(/결제 합계 차액.*4,000원/)).toBeVisible();
  await save.click();

  await expect(page.getByText("저장됐습니다.")).toBeVisible();

  await page.reload();
  await expect(total).toHaveValue("10,000");
  await expect(cash).toHaveValue("3,000");
  await expect(card).toHaveValue("2,000");
  await expect(other).toHaveValue("1,000");
  await expect(page.getByText(/결제 합계 차액.*4,000원/)).toBeVisible();
  await expect(save).toBeVisible();
});

test("지점장은 0 뒤에 금액을 입력해도 원 단위 천 단위 형식으로 본다", async ({
  page,
}) => {
  await loginAsStoreManager(page);

  const total = page.getByRole("textbox", { name: "총매출", exact: true });

  await total.fill("05000");

  await expect(total).toHaveValue("5,000");
  await expect(page.getByText("표시: 5,000원")).toBeVisible();
});

test("지점장은 권한 없는 지점 URL로 이동하면 권한 없음 화면만 본다", async ({
  page,
}) => {
  await loginAsStoreManager(page);

  await page.goto("/app/store-entry?storeId=store-hongdae");
  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
  await expect(page.getByText("강남점")).toHaveCount(0);
  await expect(page.getByText("홍대점")).toHaveCount(0);
});

test("390px에서 매출/결제 키패드 입력성과 터치 타깃이 충족된다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsStoreManager(page);

  const numericInputs = [
    page.getByRole("textbox", { name: "총매출", exact: true }),
    page.getByRole("textbox", { name: "현금", exact: true }),
    page.getByRole("textbox", { name: "카드", exact: true }),
    page.getByRole("textbox", { name: "기타 결제수단", exact: true }),
  ];

  for (const input of numericInputs) {
    await expect(input).toHaveAttribute("inputmode", "numeric");
    const box = await input.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }

  const submit = page.getByRole("button", { name: "저장" });
  const submitBox = await submit.boundingBox();
  expect(submitBox?.height).toBeGreaterThanOrEqual(44);
  expect(submitBox?.width).toBeGreaterThanOrEqual(44);

  for (const name of ["장부", "재고", "손실"]) {
    const link = page.getByRole("link", { name });
    const linkBox = await link.boundingBox();
    expect(linkBox?.height).toBeGreaterThanOrEqual(44);
    expect(linkBox?.width).toBeGreaterThanOrEqual(44);
  }
});

test("저장 실패 시 한국어 오류와 재시도 동작이 표시된다", async ({ page }) => {
  await loginAsStoreManager(page);

  await page.route("**/*", async (route) => {
    const request = route.request();
    const nextAction = request.headers()["next-action"];

    if (
      request.method() === "POST" &&
      (request.url().includes("/app/store-entry") ||
        request.url().includes("/_next/action") ||
        Boolean(nextAction))
    ) {
      await route.abort();
      return;
    }

    await route.continue();
  });

  await page.getByRole("textbox", { name: "총매출", exact: true }).fill("3000");
  await page.getByRole("textbox", { name: "현금", exact: true }).fill("1000");
  await page.getByRole("textbox", { name: "카드", exact: true }).fill("1000");
  await page
    .getByRole("textbox", { name: "기타 결제수단", exact: true })
    .fill("500");

  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page.getByText("저장에 실패했습니다. 다시 시도해 주세요."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();

  await page.unroute("**/*");
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByText("저장됐습니다.")).toBeVisible();
});
