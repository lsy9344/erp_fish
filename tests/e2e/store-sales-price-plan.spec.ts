import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORY_STORE_ID = "store-gangnam";

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill("manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

// WO(2026-06-25): 판매 예정가 입력은 1단계 매입 화면으로 통합됐다. 별도 "판매가 계획"
// 메뉴는 기본 지점장 네비게이션에서 제거되고, 기존 route는 매입 단계로 redirect한다.
test("판매가 계획 메뉴가 기본 지점장 네비게이션에서 보이지 않는다", async ({
  page,
}) => {
  await login(page);
  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=purchase`);

  await expect(page.getByRole("link", { name: "판매가 계획" })).toHaveCount(0);
  // 통합 위치인 1단계 매입 화면에는 오늘 팔 가격(예상) 입력 위치가 존재한다.
  await expect(page.getByRole("button", { name: "항목 추가" })).toBeVisible();
});

test("기존 판매가 계획 route는 storeId를 보존한 채 1단계 매입으로 redirect한다", async ({
  page,
}) => {
  await login(page);
  await page.goto(`/app/store-entry/sales-plan?storeId=${STORY_STORE_ID}`);

  // redirect 후 매입 단계 URL이고 storeId/date query가 보존된다(파라미터 순서는 보장하지 않음).
  await expect(page).toHaveURL(/\/app\/store-entry\?/);
  await expect(page).toHaveURL(new RegExp(`storeId=${STORY_STORE_ID}`));
  await expect(page).toHaveURL(/step=purchase/);
  await expect(page.getByRole("button", { name: "항목 추가" })).toBeVisible();
});
