import { randomUUID } from "node:crypto";

import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORY53_STORE_ID = "store-gangnam";
const STORY53_LEDGER_DATE = getTodayKstInput();

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

function getTodayKstInput() {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("-");

  return `${year}-${month}-${day}`;
}

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

function standardRow(page: Page, productName: string): Locator {
  return page.locator("tbody tr").filter({ hasText: productName });
}

async function openCreateStandardDialog(page: Page) {
  const dialog = page.getByRole("dialog", { name: "참고 단가 추가" });

  await expect(async () => {
    await page.getByRole("button", { name: "참고 단가 추가" }).click();
    await expect(dialog).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 15_000 });

  return dialog;
}

async function openEditStandardDialog(page: Page, productName: string) {
  const row = standardRow(page, productName);
  const dialog = page.getByRole("dialog", { name: "참고 단가 수정" });

  await expect(row).toBeVisible();
  await expect(async () => {
    await row.getByRole("button", { name: "수정" }).click();
    await expect(dialog).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 15_000 });

  return dialog;
}

async function applyStandardStatus(
  page: Page,
  productName: string,
  status: "active" | "inactive",
) {
  const row = standardRow(page, productName);
  const statusSelect = row.getByLabel("활성 상태");
  const applyButton = row.getByRole("button", { name: "상태 적용" });

  await expect(row).toBeVisible();
  await expect(async () => {
    await statusSelect.selectOption(status);
    await expect(statusSelect).toHaveValue(status, { timeout: 1_000 });
    await expect(applyButton).toBeEnabled({ timeout: 3_000 });
  }).toPass({ timeout: 15_000 });
  await applyButton.click();
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

test("본사는 품목 참고 단가 목록, 필터, 생성, 수정, 비활성화와 감사 로그를 관리한다", async ({
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
    page.getByRole("heading", { name: "품목 참고 단가" }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "품목" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "참고 단가" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "참조 정보" }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "상태" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "마지막 수정 시각" }),
  ).toBeVisible();
  await expect(standardRow(page, inactiveProduct)).toContainText("비활성");

  await applyStandardStatus(page, inactiveProduct, "active");
  await expect(
    page.getByText("비활성 품목의 참고 단가는 활성화할 수 없습니다."),
  ).toBeVisible();

  const createDialog = await openCreateStandardDialog(page);
  await expect(
    createDialog
      .getByLabel("품목")
      .locator("option", { hasText: inactiveProduct }),
  ).toHaveCount(0);
  await createDialog.getByLabel("품목").selectOption({ label: activeProduct });
  await createDialog.getByRole("textbox", { name: "참고 단가" }).fill("9500");
  await createDialog
    .getByLabel("참조 정보")
    .fill(`story53 reference ${suffix}`);
  await createDialog.getByRole("button", { name: "저장" }).click();

  await expect(standardRow(page, activeProduct)).toContainText("9,500원");
  await expect(standardRow(page, activeProduct)).toContainText("활성");

  const createdStandards = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "PurchaseStandard" WHERE "productId" = $1`,
    activeProductId,
  );
  expect(createdStandards).toHaveLength(1);

  const editDialog = await openEditStandardDialog(page, activeProduct);
  await editDialog.getByRole("textbox", { name: "참고 단가" }).fill("9900");
  await editDialog.getByLabel("참조 정보").fill(`story53 edited ${suffix}`);
  await editDialog.getByRole("button", { name: "저장" }).click();

  await expect(standardRow(page, activeProduct)).toContainText("9,900원");
  await expect(standardRow(page, activeProduct)).toContainText(
    `story53 edited ${suffix}`,
  );

  await applyStandardStatus(page, activeProduct, "inactive");
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

test("품목 참고 단가 폼은 서버 검증 오류와 첫 오류 포커스를 제공한다", async ({
  page,
}) => {
  const productName = `스토리53 검증 ${Date.now().toString(36)}`;
  await seedProduct({ name: productName });

  await login(page, "hq@example.com");
  await page.goto("/app/master-data/purchase-standards");
  const dialog = await openCreateStandardDialog(page);
  await dialog.getByLabel("품목").selectOption({ label: productName });
  await dialog.getByRole("textbox", { name: "참고 단가" }).fill("1,000");
  await dialog.getByLabel("참조 정보").fill(" ");
  await dialog.getByRole("button", { name: "저장" }).click();

  await expect(
    dialog.getByText("참고 단가는 0원 이상의 정수여야 합니다."),
  ).toBeVisible();
  await expect(
    dialog.getByRole("textbox", { name: "참고 단가" }),
  ).toBeFocused();
  await expect(
    dialog.getByRole("textbox", { name: "참고 단가" }),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(
    dialog.getByRole("textbox", { name: "참고 단가" }),
  ).toHaveAttribute("aria-describedby", /purchase-standard-price-error/);
});

test("지점장은 품목 참고 단가 관리 URL에서 데이터를 볼 수 없다", async ({
  page,
}) => {
  await seedProduct({ name: "스토리53 지점장차단" });

  await login(page, "manager@example.com");
  await page.goto("/app/master-data/purchase-standards");

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "품목 참고 단가" }),
  ).toHaveCount(0);
  await expect(page.getByText("스토리53 지점장차단")).toHaveCount(0);
});
