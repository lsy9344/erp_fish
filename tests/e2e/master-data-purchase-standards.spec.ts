import { randomUUID } from "node:crypto";

import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORY53_STORE_ID = "store-gangnam";
const STORY53_LEDGER_DATE = "2026-06-06";

test.beforeEach(async () => {
  await cleanupStory53Data();
});

test.afterAll(async () => {
  await cleanupStory53Data();
  await prisma.$disconnect();
});

type ProductSeed = {
  name: string;
  category?: string;
  spec?: string;
  defaultUnitPrice?: number;
  isActive?: boolean;
};

async function tableExists(tableName: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    tableName,
  );

  return rows.length > 0;
}

async function getUserId(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  expect(user?.id).toBeTruthy();

  return user!.id;
}

async function cleanupStory53Data() {
  const hasProducts = await tableExists("Product");
  const hasStandards = await tableExists("PurchaseStandard");
  const hasLedgers = await tableExists("DailyLedger");

  if (!hasProducts) {
    return;
  }

  const products = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "Product" WHERE name LIKE $1 OR name LIKE $2`,
    "스토리53%",
    "story53%",
  );
  const productIds = products.map((product) => product.id);

  if (hasLedgers) {
    const ledgers = await prisma.dailyLedger.findMany({
      where: {
        storeId: STORY53_STORE_ID,
        closingDate: new Date(`${STORY53_LEDGER_DATE}T00:00:00.000Z`),
      },
      select: { id: true },
    });
    const ledgerIds = ledgers.map((ledger) => ledger.id);

    if (ledgerIds.length > 0) {
      await prisma.ledgerLossItem.deleteMany({
        where: { dailyLedgerId: { in: ledgerIds } },
      });
      await prisma.ledgerInventoryAdjustment.deleteMany({
        where: { dailyLedgerId: { in: ledgerIds } },
      });
      await prisma.ledgerInventoryItem.deleteMany({
        where: { dailyLedgerId: { in: ledgerIds } },
      });
      await prisma.ledgerPurchaseItem.deleteMany({
        where: { dailyLedgerId: { in: ledgerIds } },
      });
      await prisma.ledgerExpense.deleteMany({
        where: { dailyLedgerId: { in: ledgerIds } },
      });
      await prisma.correctionRecord.deleteMany({
        where: { dailyLedgerId: { in: ledgerIds } },
      });
      await prisma.dailyLedger.deleteMany({
        where: { id: { in: ledgerIds } },
      });
    }
  }

  const standards = hasStandards
    ? await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "PurchaseStandard" WHERE "productId" = ANY($1) OR "referenceInfo" LIKE $2`,
        productIds,
        "story53%",
      )
    : [];
  const standardIds = standards.map((standard) => standard.id);

  if (standardIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: {
        targetType: "PurchaseStandard",
        targetId: { in: standardIds },
      },
    });
    await prisma.$executeRawUnsafe(
      `DELETE FROM "PurchaseStandard" WHERE id = ANY($1)`,
      standardIds,
    );
  }

  if (productIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: {
        targetType: "Product",
        targetId: { in: productIds },
      },
    });
    await prisma.$executeRawUnsafe(
      `DELETE FROM "Product" WHERE id = ANY($1)`,
      productIds,
    );
  }
}

async function seedProduct({
  name,
  category = "냉동",
  spec = "10kg",
  defaultUnitPrice = 12000,
  isActive = true,
}: ProductSeed) {
  const id = randomUUID();
  const actorId = await getUserId("hq@example.com");

  await prisma.$executeRawUnsafe(
    `INSERT INTO "Product" ("id", "name", "category", "spec", "defaultUnitPrice", "isActive", "createdAt", "updatedAt", "updatedById")
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7)`,
    id,
    name,
    category,
    spec,
    defaultUnitPrice,
    isActive,
    actorId,
  );

  return id;
}

async function seedPurchaseStandard(params: {
  productId: string;
  standardUnitPrice?: number | null;
  referenceInfo?: string | null;
  isActive?: boolean;
}) {
  const id = randomUUID();
  const actorId = await getUserId("hq@example.com");

  await prisma.$executeRawUnsafe(
    `INSERT INTO "PurchaseStandard" ("id", "productId", "standardUnitPrice", "referenceInfo", "isActive", "createdAt", "updatedAt", "updatedById")
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6)`,
    id,
    params.productId,
    params.standardUnitPrice ?? null,
    params.referenceInfo ?? null,
    params.isActive ?? true,
    actorId,
  );

  return id;
}

async function seedLedger() {
  const actorId = await getUserId("manager@example.com");

  return prisma.dailyLedger.create({
    data: {
      storeId: STORY53_STORE_ID,
      closingDate: new Date(`${STORY53_LEDGER_DATE}T00:00:00.000Z`),
      status: "IN_PROGRESS",
      createdById: actorId,
      updatedById: actorId,
    },
  });
}

function standardRow(page: Page, productName: string): Locator {
  return page.locator("tbody tr").filter({ hasText: productName });
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

test("본사는 매입 기준 목록, 필터, 생성, 수정, 비활성화와 감사 로그를 관리한다", async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const activeProduct = `스토리53 기준고등어 ${suffix}`;
  const inactiveProduct = `스토리53 비활성품목 ${suffix}`;
  const activeProductId = await seedProduct({
    name: activeProduct,
    category: "생물",
    spec: "3kg",
    defaultUnitPrice: 8500,
  });
  const inactiveProductId = await seedProduct({
    name: inactiveProduct,
    isActive: false,
  });
  await seedPurchaseStandard({
    productId: inactiveProductId,
    standardUnitPrice: 5000,
    referenceInfo: "story53 inactive product standard",
    isActive: false,
  });

  await login(page, "hq@example.com");
  await page.goto("/app/master-data/purchase-standards");

  await expect(
    page.getByRole("heading", { name: "매입 기준 관리" }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "품목" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "기준 단가" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "참조 정보" }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "상태" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "마지막 수정 시각" }),
  ).toBeVisible();
  await expect(standardRow(page, inactiveProduct)).toContainText("비활성");

  await standardRow(page, inactiveProduct)
    .getByLabel("활성 상태")
    .selectOption("active");
  await standardRow(page, inactiveProduct)
    .getByRole("button", { name: "상태 적용" })
    .click();
  await expect(
    page.getByText("비활성 품목의 매입 기준은 활성화할 수 없습니다."),
  ).toBeVisible();

  await page.getByRole("button", { name: "매입 기준 추가" }).click();
  await expect(
    page.getByLabel("품목").locator("option", { hasText: inactiveProduct }),
  ).toHaveCount(0);
  await page.getByLabel("품목").selectOption({ label: activeProduct });
  await page.getByLabel("기준 단가").fill("9500");
  await page.getByLabel("참조 정보").fill(`story53 reference ${suffix}`);
  await page.getByRole("button", { name: "저장" }).click();

  await expect(standardRow(page, activeProduct)).toContainText("9,500원");
  await expect(standardRow(page, activeProduct)).toContainText("활성");

  const createdStandards = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "PurchaseStandard" WHERE "productId" = $1`,
    activeProductId,
  );
  expect(createdStandards).toHaveLength(1);

  await standardRow(page, activeProduct)
    .getByRole("button", { name: "수정" })
    .click();
  await page.getByLabel("기준 단가").fill("9900");
  await page.getByLabel("참조 정보").fill(`story53 edited ${suffix}`);
  await page.getByRole("button", { name: "저장" }).click();

  await expect(standardRow(page, activeProduct)).toContainText("9,900원");
  await expect(standardRow(page, activeProduct)).toContainText(
    `story53 edited ${suffix}`,
  );

  await standardRow(page, activeProduct)
    .getByLabel("활성 상태")
    .selectOption("inactive");
  await standardRow(page, activeProduct)
    .getByRole("button", { name: "상태 적용" })
    .click();
  await expect(standardRow(page, activeProduct)).toContainText("비활성");
  await expect
    .poll(async () => {
      const standard = await prisma.purchaseStandard.findUnique({
        where: { id: createdStandards[0]!.id },
        select: { isActive: true },
      });

      return standard?.isActive;
    })
    .toBe(false);
  await expect
    .poll(async () =>
      prisma.auditLog.findMany({
        where: {
          targetType: "PurchaseStandard",
          targetId: createdStandards[0]!.id,
        },
        orderBy: { createdAt: "asc" },
      }),
    )
    .toHaveLength(3);

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      targetType: "PurchaseStandard",
      targetId: createdStandards[0]!.id,
    },
    orderBy: { createdAt: "asc" },
  });
  expect(auditLogs.map((log) => log.action)).toEqual([
    "purchase_standard.created",
    "purchase_standard.updated",
    "purchase_standard.deactivated",
  ]);
  expect(auditLogs[0]?.before).toBeNull();
  expect(auditLogs[0]?.after).toMatchObject({
    productId: activeProductId,
    productName: activeProduct,
    standardUnitPrice: 9500,
    referenceInfo: `story53 reference ${suffix}`,
    isActive: true,
  });
  expect(auditLogs.at(-1)?.before).toBeTruthy();
  expect(auditLogs.at(-1)?.after).toBeTruthy();

  await page.getByLabel("상태 필터").selectOption("active");
  await expect(page).toHaveURL(/status=active/);
  await expect(page.getByRole("cell", { name: activeProduct })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: inactiveProduct })).toHaveCount(
    0,
  );

  await page.getByLabel("상태 필터").selectOption("inactive");
  await expect(page).toHaveURL(/status=inactive/);
  await expect(page.getByRole("cell", { name: activeProduct })).toBeVisible();
  await expect(page.getByRole("cell", { name: inactiveProduct })).toBeVisible();
});

test("매입 기준 폼은 서버 검증 오류와 첫 오류 포커스를 제공한다", async ({
  page,
}) => {
  const productName = `스토리53 검증 ${Date.now().toString(36)}`;
  await seedProduct({ name: productName });

  await login(page, "hq@example.com");
  await page.goto("/app/master-data/purchase-standards");
  await page.getByRole("button", { name: "매입 기준 추가" }).click();
  await page.getByLabel("품목").selectOption({ label: productName });
  await page.getByLabel("기준 단가").fill("1,000");
  await page.getByLabel("참조 정보").fill(" ");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page.getByText("기준 단가는 0원 이상의 정수여야 합니다."),
  ).toBeVisible();
  await expect(page.getByLabel("기준 단가")).toBeFocused();
  await expect(page.getByLabel("기준 단가")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("기준 단가")).toHaveAttribute(
    "aria-describedby",
    /purchase-standard-price-error/,
  );
});

test("지점장은 매입 기준 관리 URL에서 데이터를 볼 수 없다", async ({
  page,
}) => {
  await seedProduct({ name: "스토리53 지점장차단" });

  await login(page, "manager@example.com");
  await page.goto("/app/master-data/purchase-standards");

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "매입 기준 관리" }),
  ).toHaveCount(0);
  await expect(page.getByText("스토리53 지점장차단")).toHaveCount(0);
});

test("장부 매입 입력은 비활성 기준을 제외하고 사용자가 수정한 snapshot을 저장한다", async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const activeProduct = `스토리53 장부기준 ${suffix}`;
  const inactiveProduct = `스토리53 비활성기준 ${suffix}`;
  const activeProductId = await seedProduct({
    name: activeProduct,
    category: "냉동",
    spec: "5kg",
    defaultUnitPrice: 7000,
  });
  const inactiveProductId = await seedProduct({
    name: inactiveProduct,
    category: "생물",
    spec: "1kg",
    defaultUnitPrice: 8000,
  });
  const activeStandardId = await seedPurchaseStandard({
    productId: activeProductId,
    standardUnitPrice: 9000,
    referenceInfo: `story53 active reference ${suffix}`,
    isActive: true,
  });
  await seedPurchaseStandard({
    productId: inactiveProductId,
    standardUnitPrice: 12000,
    referenceInfo: `story53 inactive reference ${suffix}`,
    isActive: false,
  });
  const ledger = await seedLedger();

  await login(page, "manager@example.com");
  await page.goto(
    `/app/store-entry?storeId=${STORY53_STORE_ID}&date=${STORY53_LEDGER_DATE}&step=purchase`,
  );

  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("매입 기준").selectOption(activeStandardId);
  await expect(page.getByLabel("단가")).toHaveValue("9000");
  await page.getByLabel("원문명").fill(`스토리53 수기원문 ${suffix}`);
  await page.getByLabel("구분").fill("수기구분");
  await page.getByLabel("규격").fill("수기규격");
  await page.getByLabel("단가").fill("9100");
  await page.getByLabel("수량").fill("2");

  await page.getByRole("button", { name: "항목 추가" }).click();
  await expect(
    page.getByLabel("매입 기준").nth(1).locator("option", {
      hasText: inactiveProduct,
    }),
  ).toHaveCount(0);
  await page.getByLabel("원문명").nth(1).fill(`스토리53 수기매입 ${suffix}`);
  await page.getByLabel("구분").nth(1).fill("수기");
  await page.getByLabel("규격").nth(1).fill("1box");
  await page.getByLabel("단가").nth(1).fill("1234");
  await page.getByLabel("수량").nth(1).fill("3");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "매입 항목 2건을 저장했습니다." }),
  ).toBeVisible();

  const savedItems = await prisma.ledgerPurchaseItem.findMany({
    where: { dailyLedgerId: ledger.id },
    orderBy: { createdAt: "asc" },
  });
  expect(savedItems).toHaveLength(2);
  expect(savedItems[0]).toMatchObject({
    productId: activeProductId,
    purchaseStandardId: activeStandardId,
    productName: `스토리53 수기원문 ${suffix}`,
    productCategory: "수기구분",
    productSpec: "수기규격",
    unitPrice: 9100,
    quantity: 2,
    amount: 18200,
  });
  expect(savedItems[1]).toMatchObject({
    productId: null,
    purchaseStandardId: null,
    productName: `스토리53 수기매입 ${suffix}`,
    productCategory: "수기",
    productSpec: "1box",
    unitPrice: 1234,
    quantity: 3,
    amount: 3702,
  });

  const changedProductName = `스토리53 변경기준 ${suffix}`;
  await prisma.purchaseStandard.update({
    where: { id: activeStandardId },
    data: {
      isActive: false,
      standardUnitPrice: 50000,
      referenceInfo: `story53 changed reference ${suffix}`,
    },
  });
  await prisma.product.update({
    where: { id: activeProductId },
    data: {
      name: changedProductName,
      category: "변경구분",
      spec: "변경규격",
      defaultUnitPrice: 50000,
    },
  });

  await page.reload();

  await expect(page.getByLabel("매입 기준").first()).toHaveValue(
    activeStandardId,
  );
  await expect(
    page.getByLabel("매입 기준").first().locator("option:checked"),
  ).toHaveText("저장된 매입 기준");
  await expect(page.getByLabel("원문명").first()).toHaveValue(
    `스토리53 수기원문 ${suffix}`,
  );
  await expect(page.getByLabel("구분").first()).toHaveValue("수기구분");
  await expect(page.getByLabel("규격").first()).toHaveValue("수기규격");
  await expect(page.getByLabel("단가").first()).toHaveValue("9100");
  await expect(page.getByLabel("수량").first()).toHaveValue("2");

  await page.getByRole("button", { name: "항목 추가" }).click();
  await expect(
    page.getByLabel("매입 기준").last().locator("option", {
      hasText: changedProductName,
    }),
  ).toHaveCount(0);
});
