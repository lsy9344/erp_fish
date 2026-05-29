import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORY_STORE_ID = "store-gangnam";

test.afterAll(async () => {
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

async function seedPurchaseOption(name: string, unitPrice: number) {
  const actorId = await getHeadquartersUserId();
  const suffix = randomUUID().slice(0, 8);
  const product = await prisma.product.create({
    data: {
      name: `${name} ${suffix}`,
      category: "생물",
      spec: "1kg",
      defaultUnitPrice: unitPrice,
      updatedById: actorId,
    },
  });
  const standard = await prisma.purchaseStandard.create({
    data: {
      productId: product.id,
      standardUnitPrice: unitPrice,
      referenceInfo: "위판장 기준",
      updatedById: actorId,
    },
  });

  return { product, standard };
}

async function cleanupStoryTwoThreeData() {
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { name: { startsWith: "스토리2-3" } },
        { name: { startsWith: "변경된 스토리2-3" } },
      ],
    },
    select: { id: true },
  });
  const productIds = products.map((product) => product.id);

  const ledgers = await prisma.dailyLedger.findMany({
    where: { storeId: STORY_STORE_ID },
    select: { id: true },
  });
  const ledgerIds = ledgers.map((ledger) => ledger.id);

  if (ledgerIds.length > 0) {
    await prisma.ledgerInventoryItem.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });

    await prisma.ledgerPurchaseItem.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.ledgerExpense.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.dailyLedger.deleteMany({
      where: { id: { in: ledgerIds } },
    });
  }

  if (productIds.length > 0) {
    await prisma.purchaseStandard.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: productIds } },
    });
  }
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill("manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

test.beforeEach(async () => {
  await cleanupStoryTwoThreeData();
});

test("지점장은 매입 항목을 여러 건 저장하고 재방문 시 목록과 합계를 본다", async ({
  page,
}) => {
  await login(page);
  const first = await seedPurchaseOption("스토리2-3 광어", 12000);
  const second = await seedPurchaseOption("스토리2-3 우럭", 8000);

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=purchase`);

  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("품목").nth(0).selectOption(first.product.id);
  await page.getByLabel("수량").nth(0).fill("3");

  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("품목").nth(1).selectOption(second.product.id);
  await page.getByLabel("단가").nth(1).fill("9000");
  await page.getByLabel("수량").nth(1).fill("2");

  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("저장됐습니다.")).toBeVisible();

  await page.reload();

  await expect(page.getByLabel("품목")).toHaveCount(2);
  await expect(
    page.locator("section").filter({ hasText: "매입 합계" }),
  ).toContainText("54,000원");
});

test("품목 마스터가 바뀌어도 저장된 매입 항목의 원본 품목명과 규격을 유지한다", async ({
  page,
}) => {
  await login(page);
  const { product } = await seedPurchaseOption("스토리2-3 스냅샷", 15000);

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=purchase`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("품목").selectOption(product.id);
  await page.getByLabel("수량").fill("1");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("저장됐습니다.")).toBeVisible();

  await prisma.product.update({
    where: { id: product.id },
    data: {
      name: "변경된 스토리2-3 스냅샷",
      spec: "2kg",
    },
  });

  await page.reload();

  await expect(page.getByText(/품목명: 스토리2-3 스냅샷/)).toBeVisible();
  await expect(page.getByText(/규격: 1kg/)).toBeVisible();
});

test("매입 단계는 검증 오류 포커스와 390px 모바일 입력 상태를 제공한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const { product } = await seedPurchaseOption("스토리2-3 모바일", 7000);

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=purchase`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByRole("button", { name: "저장" }).click();

  await expect(page.locator("p[role='alert']")).toHaveText(
    "입력값을 확인해 주세요.",
  );
  await expect(page.getByText("품목을 선택해 주세요.")).toBeVisible();
  await expect(page.getByLabel("품목")).toBeFocused();

  await page.getByLabel("품목").selectOption(product.id);
  const unitPriceInput = page.getByLabel("단가");
  const quantityInput = page.getByLabel("수량");
  const addLineButton = page.getByRole("button", { name: "항목 추가" });
  const saveButton = page.getByRole("button", { name: "저장" }).first();

  await expect(unitPriceInput).toHaveAttribute("inputmode", "numeric");
  await expect(quantityInput).toHaveAttribute("inputmode", "numeric");

  const unitPriceBox = await unitPriceInput.boundingBox();
  const quantityBox = await quantityInput.boundingBox();
  const addLineBox = await addLineButton.boundingBox();
  const saveBox = await saveButton.boundingBox();

  expect(unitPriceBox?.height).toBeGreaterThanOrEqual(44);
  expect(quantityBox?.height).toBeGreaterThanOrEqual(44);
  expect(addLineBox?.height).toBeGreaterThanOrEqual(44);
  expect(saveBox?.height).toBeGreaterThanOrEqual(44);

  await quantityInput.fill("2");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("저장됐습니다.")).toBeVisible();
});

test("매입 단계는 음수와 소수 숫자 입력을 다른 값으로 바꾸지 않고 검증한다", async ({
  page,
}) => {
  await login(page);
  const { product } = await seedPurchaseOption("스토리2-3 숫자검증", 7000);

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=purchase`);
  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("품목").selectOption(product.id);

  const unitPriceInput = page.getByLabel("단가");
  const quantityInput = page.getByLabel("수량");

  await unitPriceInput.fill("-1");
  await quantityInput.fill("1.5");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(unitPriceInput).toHaveValue("-1");
  await expect(quantityInput).toHaveValue("1.5");
  await expect(
    page.getByText("단가는 0원 이상의 정수여야 합니다."),
  ).toBeVisible();
  await expect(
    page.getByText("수량은 0 이상의 정수여야 합니다."),
  ).toBeVisible();
  await expect(unitPriceInput).toBeFocused();
});
