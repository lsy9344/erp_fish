import { randomUUID } from "node:crypto";

import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORY52_STORE_ID = "store-gangnam";
const STORY52_LEDGER_DATE = "2026-06-05";

test.beforeEach(async () => {
  await cleanupStory52Data();
});

test.afterAll(async () => {
  await cleanupStory52Data();
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

async function getHeadquartersUserId() {
  const user = await prisma.user.findUnique({
    where: { email: "hq@example.com" },
    select: { id: true },
  });

  expect(user?.id).toBeTruthy();

  return user!.id;
}

async function getManagerUserId() {
  const user = await prisma.user.findUnique({
    where: { email: "manager@example.com" },
    select: { id: true },
  });

  expect(user?.id).toBeTruthy();

  return user!.id;
}

async function cleanupStory52Data() {
  const hasProducts = await tableExists("Product");
  const hasStandards = await tableExists("PurchaseStandard");
  const hasLedgers = await tableExists("DailyLedger");

  if (!hasProducts) {
    return;
  }

  const products = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "Product" WHERE name LIKE $1 OR name LIKE $2`,
    "스토리52%",
    "story52%",
  );
  const productIds = products.map((product) => product.id);

  if (hasLedgers) {
    const ledgers = await prisma.dailyLedger.findMany({
      where: {
        storeId: STORY52_STORE_ID,
        closingDate: new Date(`${STORY52_LEDGER_DATE}T00:00:00.000Z`),
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
        "story52%",
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
  const actorId = await getHeadquartersUserId();

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

async function seedLedger() {
  const actorId = await getManagerUserId();

  return prisma.dailyLedger.create({
    data: {
      storeId: STORY52_STORE_ID,
      closingDate: new Date(`${STORY52_LEDGER_DATE}T00:00:00.000Z`),
      status: "IN_PROGRESS",
      createdById: actorId,
      updatedById: actorId,
    },
  });
}

async function seedPurchaseStandard(params: {
  productId: string;
  standardUnitPrice?: number | null;
  referenceInfo?: string | null;
  isActive?: boolean;
}) {
  const id = randomUUID();
  const actorId = await getHeadquartersUserId();

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

function productRow(page: Page, name: string): Locator {
  return page.locator("tbody tr").filter({ hasText: name });
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

test("본사는 품목 마스터 목록과 검색, 구분, 상태 필터를 볼 수 있다", async ({
  page,
}) => {
  await seedProduct({
    name: "스토리52 냉동고등어",
    category: "냉동",
    spec: "10kg",
    defaultUnitPrice: 12000,
  });
  await seedProduct({
    name: "스토리52 생물갈치",
    category: "생물",
    spec: "5kg",
    defaultUnitPrice: 15000,
    isActive: false,
  });

  await login(page, "hq@example.com");
  await page
    .getByRole("list")
    .getByRole("link", { name: "품목 마스터", exact: true })
    .click();

  await expect(page).toHaveURL(/\/app\/master-data\/products/);
  await expect(
    page.getByRole("heading", { name: "품목 마스터" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "품목명" }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "구분" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "규격" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "기본 단가" }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "상태" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "마지막 수정 시각" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "스토리52 냉동고등어" }),
  ).toBeVisible();
  await expect(productRow(page, "스토리52 생물갈치")).toContainText("비활성");

  await page.getByLabel("품목 검색").fill("고등어");
  await page.getByRole("button", { name: "검색" }).click();

  await expect(page).toHaveURL(/q=%EA%B3%A0%EB%93%B1%EC%96%B4/);
  await expect(
    page.getByRole("cell", { name: "스토리52 냉동고등어" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "스토리52 생물갈치" }),
  ).toHaveCount(0);

  await page.getByLabel("구분 필터").selectOption("생물");
  await expect(page).toHaveURL(/category=%EC%83%9D%EB%AC%BC/);
  await expect(page.getByText("조건에 맞는 품목이 없습니다.")).toBeVisible();

  await page.getByLabel("품목 검색").fill("");
  await page.getByRole("button", { name: "검색" }).click();
  await expect(page).toHaveURL(/category=%EC%83%9D%EB%AC%BC/);
  await expect(page).not.toHaveURL(/q=/);
  await page.getByLabel("상태 필터").selectOption("inactive");
  await expect(page).toHaveURL(/status=inactive/);
  await expect(
    page.getByRole("cell", { name: "스토리52 생물갈치" }),
  ).toBeVisible();
});

test("본사는 품목을 생성, 수정, 비활성 처리하고 감사 로그를 남긴다", async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const productName = `스토리52 오징어 ${suffix}`;
  const editedName = `스토리52 손질오징어 ${suffix}`;

  await login(page, "hq@example.com");
  await page.goto("/app/master-data/products");

  await page.getByRole("button", { name: "품목 추가" }).click();
  await page.getByLabel("품목명").fill(productName);
  await page.getByLabel("구분", { exact: true }).selectOption("냉동");
  await page.getByLabel("규격").fill("20kg");
  await page.getByLabel("기본 단가").fill("18000");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(page.getByRole("cell", { name: productName })).toBeVisible();
  await expect(productRow(page, productName)).toContainText("활성");
  await expect(productRow(page, productName)).toContainText("18,000원");

  const createdProducts = await prisma.$queryRawUnsafe<
    Array<{ id: string; isActive: boolean }>
  >(`SELECT id, "isActive" FROM "Product" WHERE name = $1`, productName);
  expect(createdProducts).toHaveLength(1);
  expect(createdProducts[0]!.isActive).toBe(true);

  await productRow(page, productName)
    .getByRole("button", { name: "수정" })
    .click();
  await page.getByLabel("품목명").fill(editedName);
  await page.getByLabel("기본 단가").fill("21000");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(page.getByRole("cell", { name: editedName })).toBeVisible();
  await expect(page.getByRole("cell", { name: productName })).toHaveCount(0);
  await expect(productRow(page, editedName)).toContainText("21,000원");

  const editedRow = productRow(page, editedName);
  await editedRow.getByLabel("활성 상태").selectOption("inactive");
  await expect(
    editedRow.getByRole("button", { name: "상태 적용" }),
  ).toBeEnabled();
  await editedRow.getByRole("button", { name: "상태 적용" }).click();

  await expect(productRow(page, editedName)).toContainText("비활성");
  await expect
    .poll(async () => {
      const rows = await prisma.$queryRawUnsafe<Array<{ isActive: boolean }>>(
        `SELECT "isActive" FROM "Product" WHERE id = $1`,
        createdProducts[0]!.id,
      );

      return rows[0]?.isActive;
    })
    .toBe(false);

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      targetType: "Product",
      targetId: createdProducts[0]!.id,
    },
    orderBy: { createdAt: "asc" },
  });
  expect(auditLogs.map((log) => log.action)).toEqual([
    "product.created",
    "product.updated",
    "product.deactivated",
  ]);
  for (const log of auditLogs) {
    expect(log.actorId).toBeTruthy();
    expect(log.targetType).toBe("Product");
    expect(log.targetId).toBe(createdProducts[0]!.id);
    expect(log.createdAt).toBeInstanceOf(Date);
    expect(log.after).toBeTruthy();
  }
  expect(auditLogs[0]?.before).toBeNull();
  expect(auditLogs[1]?.before).toBeTruthy();
  expect(auditLogs[2]?.before).toBeTruthy();

  await page.getByLabel("상태 필터").selectOption("active");
  await expect(page.getByRole("cell", { name: editedName })).toHaveCount(0);
});

test("품목 수정은 보이지 않는 이전 활성 상태를 되살리지 않는다", async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const productName = `스토리52 상태경합 ${suffix}`;
  const productId = await seedProduct({ name: productName });

  await login(page, "hq@example.com");
  await page.goto("/app/master-data/products");

  await productRow(page, productName)
    .getByRole("button", { name: "수정" })
    .click();
  await page.getByLabel("기본 단가").fill("13000");

  await prisma.$executeRawUnsafe(
    `UPDATE "Product" SET "isActive" = false, "updatedAt" = NOW() WHERE id = $1`,
    productId,
  );

  await page.getByRole("button", { name: "저장" }).click();

  await expect
    .poll(async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ isActive: boolean; defaultUnitPrice: number }>
      >(
        `SELECT "isActive", "defaultUnitPrice" FROM "Product" WHERE id = $1`,
        productId,
      );

      return rows[0]?.defaultUnitPrice;
    })
    .toBe(13000);
  await expect
    .poll(async () => {
      const rows = await prisma.$queryRawUnsafe<Array<{ isActive: boolean }>>(
        `SELECT "isActive" FROM "Product" WHERE id = $1`,
        productId,
      );

      return rows[0]?.isActive;
    })
    .toBe(false);
});

test("본사는 매입 기준을 생성, 수정, 비활성 처리하고 연결 품목 상태를 반영한다", async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const activeProduct = `스토리52 기준고등어 ${suffix}`;
  const inactiveProduct = `스토리52 비활성품목 ${suffix}`;
  const activeProductId = await seedProduct({ name: activeProduct });
  const inactiveProductId = await seedProduct({
    name: inactiveProduct,
    isActive: false,
  });
  await seedPurchaseStandard({
    productId: inactiveProductId,
    standardUnitPrice: 5000,
    referenceInfo: "story52 inactive product standard",
    isActive: false,
  });
  const activeStandardInactiveProduct = `스토리52 비활성품목활성기준 ${suffix}`;
  const activeStandardInactiveProductId = await seedProduct({
    name: activeStandardInactiveProduct,
    isActive: false,
  });
  await seedPurchaseStandard({
    productId: activeStandardInactiveProductId,
    standardUnitPrice: 7000,
    referenceInfo: "story52 inactive product active standard",
    isActive: true,
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
  await expect(page.getByRole("cell", { name: inactiveProduct })).toBeVisible();
  await expect(standardRow(page, inactiveProduct)).toContainText("비활성");

  await standardRow(page, inactiveProduct)
    .getByLabel("활성 상태")
    .selectOption("active");
  await expect(
    standardRow(page, inactiveProduct).getByRole("button", {
      name: "상태 적용",
    }),
  ).toBeEnabled();
  await standardRow(page, inactiveProduct)
    .getByRole("button", { name: "상태 적용" })
    .click();
  await expect(
    page.getByText("비활성 품목의 매입 기준은 활성화할 수 없습니다."),
  ).toBeVisible();
  await expect(standardRow(page, inactiveProduct)).toContainText("비활성");

  await page.getByRole("button", { name: "매입 기준 추가" }).click();
  await expect(
    page.getByLabel("품목").locator("option", { hasText: inactiveProduct }),
  ).toHaveCount(0);
  await expect(
    page
      .getByLabel("품목")
      .locator("option", { hasText: activeStandardInactiveProduct }),
  ).toHaveCount(0);
  await page.getByLabel("품목").selectOption({ label: activeProduct });
  await page.getByLabel("기준 단가").fill("9500");
  await page.getByLabel("참조 정보").fill(`story52 reference ${suffix}`);
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
  await page.getByLabel("참조 정보").fill(`story52 edited ${suffix}`);
  await page.getByRole("button", { name: "저장" }).click();

  await expect(standardRow(page, activeProduct)).toContainText("9,900원");
  await expect(standardRow(page, activeProduct)).toContainText(
    `story52 edited ${suffix}`,
  );

  const activeStandardRow = standardRow(page, activeProduct);
  await activeStandardRow.getByLabel("활성 상태").selectOption("inactive");
  await expect(
    activeStandardRow.getByRole("button", { name: "상태 적용" }),
  ).toBeEnabled();
  await activeStandardRow.getByRole("button", { name: "상태 적용" }).click();

  await expect(standardRow(page, activeProduct)).toContainText("비활성");
  await expect
    .poll(async () => {
      const rows = await prisma.$queryRawUnsafe<Array<{ isActive: boolean }>>(
        `SELECT "isActive" FROM "PurchaseStandard" WHERE id = $1`,
        createdStandards[0]!.id,
      );

      return rows[0]?.isActive;
    })
    .toBe(false);

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
  expect(auditLogs.at(-1)?.before).toBeTruthy();
  expect(auditLogs.at(-1)?.after).toBeTruthy();

  await page.getByLabel("상태 필터").selectOption("active");
  await expect(page.getByRole("cell", { name: activeProduct })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: inactiveProduct })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("cell", { name: activeStandardInactiveProduct }),
  ).toHaveCount(0);

  await page.getByLabel("상태 필터").selectOption("inactive");
  await expect(page.getByRole("cell", { name: inactiveProduct })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: activeStandardInactiveProduct }),
  ).toBeVisible();
});

test("매입 기준 수정은 보이지 않는 이전 활성 상태를 되살리지 않는다", async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const productName = `스토리52 기준상태경합 ${suffix}`;
  const productId = await seedProduct({ name: productName });
  const standardId = await seedPurchaseStandard({
    productId,
    standardUnitPrice: 8000,
    referenceInfo: `story52 stale ${suffix}`,
    isActive: true,
  });

  await login(page, "hq@example.com");
  await page.goto("/app/master-data/purchase-standards");

  await standardRow(page, productName)
    .getByRole("button", { name: "수정" })
    .click();
  await page.getByLabel("참조 정보").fill(`story52 stale edited ${suffix}`);

  await prisma.$executeRawUnsafe(
    `UPDATE "PurchaseStandard" SET "isActive" = false, "updatedAt" = NOW() WHERE id = $1`,
    standardId,
  );

  await page.getByRole("button", { name: "저장" }).click();

  await expect
    .poll(async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ isActive: boolean; referenceInfo: string | null }>
      >(
        `SELECT "isActive", "referenceInfo" FROM "PurchaseStandard" WHERE id = $1`,
        standardId,
      );

      return rows[0]?.referenceInfo;
    })
    .toBe(`story52 stale edited ${suffix}`);
  await expect
    .poll(async () => {
      const rows = await prisma.$queryRawUnsafe<Array<{ isActive: boolean }>>(
        `SELECT "isActive" FROM "PurchaseStandard" WHERE id = $1`,
        standardId,
      );

      return rows[0]?.isActive;
    })
    .toBe(false);
});

test("품목과 매입 기준 폼은 한국어 검증 오류와 첫 오류 포커스를 제공한다", async ({
  page,
}) => {
  const productName = `스토리52 검증 ${Date.now().toString(36)}`;
  await seedProduct({ name: productName });

  await login(page, "hq@example.com");
  await page.goto("/app/master-data/products");

  await page.getByRole("button", { name: "품목 추가" }).click();
  await page.getByLabel("품목명").fill(" ");
  await page.getByLabel("규격").fill(" ");
  await page.getByLabel("기본 단가").fill("-1");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(page.getByText("품목명을 입력해 주세요.")).toBeVisible();
  await expect(page.getByText("규격을 입력해 주세요.")).toBeVisible();
  await expect(
    page.getByText("기본 단가는 0원 이상의 정수여야 합니다."),
  ).toBeVisible();
  await expect(page.getByLabel("품목명")).toBeFocused();
  await expect(page.getByLabel("품목명")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("품목명")).toHaveAttribute(
    "aria-describedby",
    /product-name-error/,
  );

  await page.keyboard.press("Escape");
  await page.goto("/app/master-data/purchase-standards");
  await page.getByRole("button", { name: "매입 기준 추가" }).click();
  await page.getByLabel("품목").selectOption({ label: productName });
  await page.getByLabel("기준 단가").fill("");
  await page.getByLabel("참조 정보").fill(" ");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page.getByText("기준 단가 또는 참조 정보를 입력해 주세요."),
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

test("중복 품목 생성은 한국어 field error로 막고 첫 오류에 포커스한다", async ({
  page,
}) => {
  const productName = `스토리52 중복 ${Date.now().toString(36)}`;
  await seedProduct({
    name: productName,
    category: "생물",
    spec: "3kg",
    defaultUnitPrice: 11000,
  });

  await login(page, "hq@example.com");
  await page.goto("/app/master-data/products");

  await page.getByRole("button", { name: "품목 추가" }).click();
  await page.getByLabel("품목명").fill(` ${productName} `);
  await page.getByLabel("구분", { exact: true }).selectOption("생물");
  await page.getByLabel("규격").fill(" 3kg ");
  await page.getByLabel("기본 단가").fill("12000");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page.getByText("이미 같은 품목명, 구분, 규격의 품목이 있습니다."),
  ).toBeVisible();
  await expect(page.getByLabel("품목명")).toBeFocused();
  await expect(page.getByLabel("품목명")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByRole("cell", { name: productName })).toHaveCount(1);
});

test("품목 변경과 비활성화는 신규 장부 선택지에서만 제외하고 저장된 매입 snapshot은 유지한다", async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const productName = `스토리52 장부스냅샷 ${suffix}`;
  const productId = await seedProduct({
    name: productName,
    category: "생물",
    spec: "1kg",
    defaultUnitPrice: 16000,
  });
  await seedLedger();

  await login(page, "manager@example.com");
  await page.goto(
    `/app/store-entry?storeId=${STORY52_STORE_ID}&date=${STORY52_LEDGER_DATE}&step=purchase`,
  );

  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.getByLabel("품목", { exact: true }).selectOption(productId);
  await page.getByLabel("수량").fill("2");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "매입 항목 1건을 저장했습니다." }),
  ).toBeVisible();

  await prisma.product.update({
    where: { id: productId },
    data: {
      name: `스토리52 변경품목 ${suffix}`,
      spec: "2kg",
      defaultUnitPrice: 20000,
      isActive: false,
    },
  });

  await page.reload();

  await expect(
    page.getByText(new RegExp(`품목명: ${productName}`)),
  ).toBeVisible();
  await expect(page.getByText(/규격: 1kg/)).toBeVisible();
  await expect(page.getByLabel("단가").first()).toHaveValue("16000");

  await page.getByRole("button", { name: "항목 추가" }).click();
  await expect(
    page.getByLabel("품목", { exact: true }).nth(1).locator("option", {
      hasText: productName,
    }),
  ).toHaveCount(0);
  await expect(
    page
      .getByLabel("품목", { exact: true })
      .nth(1)
      .locator("option", {
        hasText: `스토리52 변경품목 ${suffix}`,
      }),
  ).toHaveCount(0);
});

test("지점장은 품목과 매입 기준 관리 URL에서 데이터를 볼 수 없다", async ({
  page,
}) => {
  await seedProduct({ name: "스토리52 지점장차단" });

  await login(page, "manager@example.com");

  await page.goto("/app/master-data/products");
  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(page.getByRole("heading", { name: "품목 마스터" })).toHaveCount(
    0,
  );
  await expect(page.getByText("스토리52 지점장차단")).toHaveCount(0);

  await page.goto("/app/master-data/purchase-standards");
  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "매입 기준 관리" }),
  ).toHaveCount(0);
  await expect(page.getByText("스토리52 지점장차단")).toHaveCount(0);
});
