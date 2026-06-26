import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const storyPrefix = "story17-";

test.beforeEach(async () => {
  await cleanupStory17Data();
});

test.afterAll(async () => {
  await cleanupStory17Data();
  await prisma.$disconnect();
});

type SeededHistory = {
  actorId: string;
  storeName: string;
  userName: string;
  productName: string;
  codeName: string;
  longMemo: string;
  reason: string;
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

async function cleanupStory17Data() {
  const hasAuditLog = await tableExists("AuditLog");

  if (hasAuditLog) {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { id: { startsWith: storyPrefix } },
          { targetId: { startsWith: storyPrefix } },
        ],
      },
    });
  }

  if (await tableExists("LedgerInputCode")) {
    await prisma.ledgerInputCode.deleteMany({
      where: { id: { startsWith: storyPrefix } },
    });
  }

  if (await tableExists("PurchaseStandard")) {
    await prisma.purchaseStandard.deleteMany({
      where: { id: { startsWith: storyPrefix } },
    });
  }

  if (await tableExists("Product")) {
    await prisma.product.deleteMany({
      where: { id: { startsWith: storyPrefix } },
    });
  }

  await prisma.user.deleteMany({
    where: { id: { startsWith: storyPrefix } },
  });
  await prisma.store.deleteMany({
    where: { id: { startsWith: storyPrefix } },
  });
}

function prefixedId(label: string) {
  return `${storyPrefix}${label}-${randomUUID()}`;
}

async function seedHistoryRows(): Promise<SeededHistory> {
  const actorId = await getHeadquartersUserId();
  const storeId = prefixedId("store");
  const userId = prefixedId("user");
  const productId = prefixedId("product");
  const standardId = prefixedId("standard");
  const codeId = prefixedId("code");
  const suffix = Date.now().toString(36);
  const storeName = `스토리17 지점 최신 ${suffix}`;
  const userName = `스토리17 권한 사용자 ${suffix}`;
  const productName = `스토리17 광어 ${suffix}`;
  const codeName = `스토리17 카드 ${suffix}`;
  const longMemo = `스토리17 긴 변경 메모 ${"가나다라마".repeat(40)}`;
  const reason = `스토리17 변경 사유 ${suffix}`;

  await prisma.store.create({
    data: {
      id: storeId,
      name: storeName,
      isActive: true,
      updatedById: actorId,
    },
  });
  await prisma.user.create({
    data: {
      id: userId,
      name: userName,
      email: `${userId}@example.com`,
      role: "STORE_MANAGER",
      isActive: true,
    },
  });
  await prisma.product.create({
    data: {
      id: productId,
      name: productName,
      category: "스토리17",
      spec: "1kg",
      defaultUnitPrice: 10000,
      isActive: true,
      updatedById: actorId,
    },
  });
  await prisma.purchaseStandard.create({
    data: {
      id: standardId,
      productId,
      standardUnitPrice: 9000,
      referenceInfo: "스토리17 기준",
      isActive: true,
      updatedById: actorId,
    },
  });
  await prisma.ledgerInputCode.create({
    data: {
      id: codeId,
      group: "PAYMENT_METHOD",
      name: codeName,
      displayOrder: 10,
      isActive: true,
      updatedById: actorId,
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        id: prefixedId("audit-store"),
        action: "store.updated",
        targetType: "Store",
        targetId: storeId,
        actorId,
        before: { name: "스토리17 이전 지점", memo: longMemo },
        after: { name: storeName, memo: longMemo },
        reason,
        createdAt: new Date("2030-01-03T00:00:00.000Z"),
      },
      {
        id: prefixedId("audit-user"),
        action: "user.role_changed",
        targetType: "User",
        targetId: userId,
        actorId,
        before: { role: "STORE_MANAGER" },
        after: { role: "HEADQUARTERS", name: userName },
        createdAt: new Date("2030-01-02T00:00:00.000Z"),
      },
      {
        id: prefixedId("audit-product"),
        action: "product.updated",
        targetType: "Product",
        targetId: productId,
        actorId,
        before: { name: productName, defaultUnitPrice: 9000 },
        after: { name: productName, defaultUnitPrice: 10000 },
        createdAt: new Date("2030-01-01T12:00:00.000Z"),
      },
      {
        id: prefixedId("audit-standard"),
        action: "purchase_standard.updated",
        targetType: "PurchaseStandard",
        targetId: standardId,
        actorId,
        before: { productName, standardUnitPrice: 8000 },
        after: { productName, standardUnitPrice: 9000 },
        createdAt: new Date("2030-01-01T00:00:00.000Z"),
      },
      {
        id: prefixedId("audit-code"),
        action: "ledger_input_code.reordered",
        targetType: "LedgerInputCode",
        targetId: codeId,
        actorId,
        before: { name: codeName, displayOrder: 20 },
        after: { name: codeName, displayOrder: 10 },
        createdAt: new Date("2029-12-31T00:00:00.000Z"),
      },
    ],
  });

  return {
    actorId,
    storeName,
    userName,
    productName,
    codeName,
    longMemo,
    reason,
  };
}

function historyRow(page: Page, text: string): Locator {
  return page.locator("tbody tr").filter({ hasText: text });
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

test("본사는 변경 이력 목록을 시간 역순으로 보고 상세 전후 값을 확인한다", async ({
  page,
}) => {
  const seeded = await seedHistoryRows();

  await login(page, "hq@example.com");
  await page.goto("/app/master-data/history");

  await expect(page).toHaveURL(/\/app\/master-data\/history/);
  await expect(page.getByRole("heading", { name: "변경 이력" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "변경 시각" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "변경자" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "대상 유형" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "대상 이름" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "변경 유형" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr").first()).toContainText(
    seeded.storeName,
  );
  await expect(historyRow(page, seeded.userName)).toContainText("사용자/권한");
  await expect(historyRow(page, seeded.userName)).toContainText("역할 변경");
  const productRows = historyRow(page, seeded.productName).filter({
    hasText: "품목",
  });
  await expect(productRows).toHaveCount(2);
  await expect(productRows.first()).toBeVisible();
  await expect(historyRow(page, seeded.codeName)).toContainText(
    "표시 순서 변경",
  );

  await historyRow(page, seeded.storeName)
    .getByRole("button", { name: "상세 보기" })
    .click();
  await expect(page.getByRole("dialog", { name: "변경 상세" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "변경 전" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "변경 후" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "사유" })).toBeVisible();
  await expect(page.getByText(seeded.reason)).toBeVisible();
  await expect(page.getByText(seeded.longMemo).first()).toBeVisible();
});

test("본사는 대상 유형, 변경자, 기간 필터를 URL query로 유지한다", async ({
  page,
}) => {
  const seeded = await seedHistoryRows();

  await login(page, "hq@example.com");
  await page.goto("/app/master-data/history");

  await page.getByRole("combobox", { name: "대상 유형 필터" }).click();
  await page.getByRole("option", { name: "지점", exact: true }).click();
  await expect(page).toHaveURL(/targetType=Store/);
  await expect(historyRow(page, seeded.storeName)).toBeVisible();
  await expect(historyRow(page, seeded.userName)).toHaveCount(0);

  await page.getByRole("combobox", { name: "변경자 필터" }).click();
  await page.getByRole("option", { name: "본사 관리자" }).click();
  await expect(page).toHaveURL(/actorId=/);
  await expect(historyRow(page, seeded.storeName)).toBeVisible();

  await page.getByLabel("시작일").fill("2030-01-03");
  await page.getByLabel("종료일").fill("2030-01-03");
  await page.getByRole("button", { name: "필터 적용" }).click();
  await expect(page).toHaveURL(/from=2030-01-03/);
  await expect(page).toHaveURL(/to=2030-01-03/);
  await expect(historyRow(page, seeded.storeName)).toBeVisible();

  await page.getByLabel("시작일").fill("1999-01-01");
  await page.getByLabel("종료일").fill("1999-01-02");
  await page.getByRole("button", { name: "필터 적용" }).click();
  await expect(
    page.getByText("조건에 맞는 변경 이력이 없습니다."),
  ).toBeVisible();
});

test("변경 이력 loading route는 실제 표와 비슷한 skeleton을 정의한다", () => {
  const loading = readFileSync(
    path.join(
      process.cwd(),
      "src",
      "app",
      "app",
      "master-data",
      "history",
      "loading.tsx",
    ),
    "utf8",
  );

  expect(loading).toContain("변경 이력 로딩");
  expect(loading).toContain("Skeleton");
  expect(loading).toContain("변경 시각");
  expect(loading).toContain("대상 이름");
});

test("지점장은 변경 이력 URL에서 데이터를 볼 수 없다", async ({ page }) => {
  const seeded = await seedHistoryRows();

  await login(page, "manager@example.com");
  await page.goto("/app/master-data/history");

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(page.getByRole("heading", { name: "변경 이력" })).toHaveCount(0);
  await expect(page.getByText(seeded.storeName)).toHaveCount(0);
});
