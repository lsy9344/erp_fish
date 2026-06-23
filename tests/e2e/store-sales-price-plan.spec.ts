import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORY_STORE_ID = "store-gangnam";
const PRODUCT_PREFIX = "WO-06 계획";

test.afterAll(async () => {
  await cleanupSalesPlanData();
  await prisma.$disconnect();
});

async function getHeadquartersUserId() {
  const user = await prisma.user.findUnique({
    where: { email: "hq@example.com" },
    select: { id: true },
  });

  expect(user?.id).toBeTruthy();

  return user!.id;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill("manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

function getTodayKstMidnight(inputDate = new Date()) {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(inputDate)
    .split("-");

  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0),
  );
}

async function seedProduct(name: string, category = "냉동", unitPrice = 12000) {
  const actorId = await getHeadquartersUserId();
  const suffix = randomUUID().slice(0, 8);

  return prisma.product.create({
    data: {
      name: `${PRODUCT_PREFIX} ${name} ${suffix}`,
      category,
      spec: "1kg",
      defaultUnitPrice: unitPrice,
      updatedById: actorId,
    },
  });
}

async function cleanupSalesPlanData() {
  const products = await prisma.product.findMany({
    where: { name: { startsWith: PRODUCT_PREFIX } },
    select: { id: true },
  });
  const productIds = products.map((product) => product.id);

  if (productIds.length > 0) {
    await prisma.storeSalesPricePlan.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: productIds } },
    });
  }
}

test.beforeEach(async () => {
  await cleanupSalesPlanData();
});

test("개점 전 품목별 예상 판매가를 저장하고 재방문 시 다시 불러온다", async ({
  page,
}) => {
  await login(page);
  const first = await seedProduct("광어", "냉동", 12000);
  const second = await seedProduct("우럭", "생물", 8000);

  await page.goto(`/app/store-entry/sales-plan?storeId=${STORY_STORE_ID}`);

  await expect(
    page.getByRole("heading", { name: "판매가 계획" }),
  ).toBeVisible();

  const firstPrice = page.locator(`#sales-plan-price-${first.id}`);
  const firstMemo = page.locator(`#sales-plan-memo-${first.id}`);
  const secondPrice = page.locator(`#sales-plan-price-${second.id}`);

  await firstPrice.fill("15000");
  await firstMemo.fill("개점 전 시세 반영");
  await secondPrice.fill("9000");

  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "예상 판매가 2건을 저장했습니다." }),
  ).toBeVisible();

  await page.reload();

  await expect(firstPrice).toHaveValue("15000");
  await expect(firstMemo).toHaveValue("개점 전 시세 반영");
  await expect(secondPrice).toHaveValue("9000");
  await expect(page.getByText("마지막 저장")).toBeVisible();

  const savedPlans = await prisma.storeSalesPricePlan.findMany({
    where: {
      storeId: STORY_STORE_ID,
      businessDate: getTodayKstMidnight(),
      productId: { in: [first.id, second.id] },
    },
    orderBy: { plannedUnitPrice: "asc" },
  });
  expect(savedPlans).toHaveLength(2);
  expect(savedPlans[0]?.plannedUnitPrice).toBe(9000);
  expect(savedPlans[1]?.plannedUnitPrice).toBe(15000);
  expect(savedPlans[1]?.memo).toBe("개점 전 시세 반영");
});

test("가격을 비우면 해당 품목 계획이 삭제된다", async ({ page }) => {
  await login(page);
  const product = await seedProduct("고등어", "냉동", 7000);

  await page.goto(`/app/store-entry/sales-plan?storeId=${STORY_STORE_ID}`);
  const price = page.locator(`#sales-plan-price-${product.id}`);

  await price.fill("11000");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "예상 판매가 1건을 저장했습니다." }),
  ).toBeVisible();

  await expect
    .poll(() =>
      prisma.storeSalesPricePlan.count({
        where: {
          storeId: STORY_STORE_ID,
          businessDate: getTodayKstMidnight(),
          productId: product.id,
        },
      }),
    )
    .toBe(1);

  await price.fill("");
  await page.getByRole("button", { name: "저장" }).click();

  // 빈 가격으로 저장하면 해당 계획 행이 삭제되어야 한다.
  await expect
    .poll(() =>
      prisma.storeSalesPricePlan.count({
        where: {
          storeId: STORY_STORE_ID,
          businessDate: getTodayKstMidnight(),
          productId: product.id,
        },
      }),
    )
    .toBe(0);
});

test("손실 페이지는 저장된 계획 판매가를 추정 참고로 읽기 전용 표시한다", async ({
  page,
}) => {
  await login(page);
  const actorId = await getHeadquartersUserId();
  const product = await seedProduct("연어", "냉동", 10000);

  await prisma.storeSalesPricePlan.create({
    data: {
      storeId: STORY_STORE_ID,
      businessDate: getTodayKstMidnight(),
      productId: product.id,
      plannedUnitPrice: 13500,
      memo: null,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await page.goto(`/app/store-entry/losses?storeId=${STORY_STORE_ID}`);

  const context = page
    .locator("section")
    .filter({ hasText: "개점 전 판매가 계획 (참고)" });
  await expect(context).toBeVisible();
  await expect(context.getByText(product.name)).toBeVisible();
  await expect(context.getByText("계획 판매가 13,500원")).toBeVisible();
  await expect(context.getByText("추정").first()).toBeVisible();
});
