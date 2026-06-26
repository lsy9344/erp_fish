import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";
import { calculateLedgerReviewSummary } from "../../src/server/calculations/ledger.ts";
import {
  createPolicyUnconfirmedMetric,
  listCalculationPolicyGates,
} from "../../src/server/calculations/policy-gates.ts";

const prisma = new PrismaClient();
const STORY_STORE_ID = "store-story-3-4-policy-gates";
const STORY_STORE_NAME = "스토리3-4 정책차단 지점";
const STORY_MARKER = "story-3-4-policy-gates";

test.beforeEach(async () => {
  await cleanupStoryThreeFourData();
});

test.afterAll(async () => {
  await cleanupStoryThreeFourData();
  await prisma.$disconnect();
});

async function login(page: Page, email = "manager@example.com") {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

async function getHeadquartersUserId() {
  const user = await prisma.user.findUnique({
    where: { email: "hq@example.com" },
    select: { id: true },
  });

  expect(user?.id).toBeTruthy();

  return user!.id;
}

async function getStoreManagerUserId() {
  const user = await prisma.user.findUnique({
    where: { email: "manager@example.com" },
    select: { id: true },
  });

  expect(user?.id).toBeTruthy();

  return user!.id;
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

  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

async function ensureStoryStore() {
  const actorId = await getHeadquartersUserId();
  const managerId = await getStoreManagerUserId();

  await prisma.store.upsert({
    where: { id: STORY_STORE_ID },
    create: {
      id: STORY_STORE_ID,
      name: STORY_STORE_NAME,
      updatedById: actorId,
    },
    update: {
      name: STORY_STORE_NAME,
      isActive: true,
      updatedById: actorId,
    },
  });
  await prisma.userStoreAssignment.upsert({
    where: {
      userId_storeId: {
        userId: managerId,
        storeId: STORY_STORE_ID,
      },
    },
    create: {
      userId: managerId,
      storeId: STORY_STORE_ID,
    },
    update: {},
  });
}

async function seedPolicyGateLedger() {
  const suffix = randomUUID().slice(0, 8);
  const actorId = await getHeadquartersUserId();
  await ensureStoryStore();

  const [expenseCode, lossType, product] = await Promise.all([
    prisma.ledgerInputCode.create({
      data: {
        group: "EXPENSE_ITEM",
        name: `스토리3-4 비용 ${suffix}`,
        displayOrder: 834,
        updatedById: actorId,
      },
    }),
    prisma.ledgerInputCode.create({
      data: {
        group: "LOSS_TYPE",
        name: `스토리3-4 폐기 ${suffix}`,
        displayOrder: 835,
        updatedById: actorId,
      },
    }),
    prisma.product.create({
      data: {
        name: `스토리3-4 광어 ${suffix}`,
        category: "정책차단",
        spec: "1kg",
        defaultUnitPrice: 1000,
        updatedById: actorId,
      },
    }),
  ]);
  const ledger = await prisma.dailyLedger.create({
    data: {
      storeId: STORY_STORE_ID,
      closingDate: getTodayKstMidnight(),
      status: "IN_PROGRESS",
      totalSalesAmount: 100_000,
      cashAmount: 40_000,
      cardAmount: 50_000,
      otherPaymentAmount: 8_000,
      workerCount: 4,
      workMemo: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await prisma.ledgerExpense.create({
    data: {
      dailyLedgerId: ledger.id,
      ledgerInputCodeId: expenseCode.id,
      amount: 12_000,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerPurchaseItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice ?? 0,
      quantity: 5,
      amount: 5_000,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  const inventoryItem = await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice ?? 0,
      previousQuantity: 10,
      purchasedQuantity: 5,
      currentQuantity: 8,
      quantity: 8,
      inventoryAmount: 8_000,
      isModified: true,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerInventoryAdjustment.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      ledgerInventoryItemId: inventoryItem.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice ?? 0,
      beforeQuantity: 10,
      beforeAmount: 10_000,
      afterQuantity: 8,
      afterAmount: 8_000,
      differenceQuantity: -2,
      differenceAmount: -2_000,
      reason: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerLossItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      ledgerInputCodeId: lossType.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice ?? 0,
      lossTypeName: lossType.name,
      quantity: 1,
      amount: 1_000,
      reason: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  return ledger;
}

async function cleanupStoryThreeFourData() {
  const products = await prisma.product.findMany({
    where: { name: { startsWith: "스토리3-4" } },
    select: { id: true },
  });
  const productIds = products.map((product) => product.id);
  const codes = await prisma.ledgerInputCode.findMany({
    where: { name: { startsWith: "스토리3-4" } },
    select: { id: true },
  });
  const codeIds = codes.map((code) => code.id);
  const ledgers = await prisma.dailyLedger.findMany({
    where: { storeId: STORY_STORE_ID },
    select: { id: true },
  });
  const ledgerIds = ledgers.map((ledger) => ledger.id);

  if (ledgerIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: {
        targetType: "DailyLedger",
        targetId: { in: ledgerIds },
      },
    });
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
    await prisma.dailyLedger.deleteMany({
      where: { id: { in: ledgerIds } },
    });
  }

  await prisma.inventoryOpeningSnapshot.deleteMany({
    where: {
      OR: [
        { storeId: STORY_STORE_ID },
        ...(productIds.length > 0 ? [{ productId: { in: productIds } }] : []),
      ],
    },
  });

  if (productIds.length > 0) {
    await prisma.purchaseStandard.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: productIds } },
    });
  }

  if (codeIds.length > 0) {
    await prisma.ledgerInputCode.deleteMany({
      where: { id: { in: codeIds } },
    });
  }

  await prisma.userStoreAssignment.deleteMany({
    where: { storeId: STORY_STORE_ID },
  });
  await prisma.store.deleteMany({
    where: { id: STORY_STORE_ID },
  });
}

test("OQ-gated calculation helper returns policy states instead of temporary numbers", () => {
  const summary = calculateLedgerReviewSummary({
    totalSalesAmount: 100_000,
    cashAmount: 100_000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 2,
    expenseTotal: 0,
    inventoryItems: [
      {
        previousQuantity: 10,
        purchasedQuantity: 5,
        currentQuantity: 8,
        quantity: 8,
        unitPrice: 1_000,
        inventoryAmount: 8_000,
      },
    ],
  });

  expect(summary.salesDifference).toMatchObject({
    value: null,
    status: "policy-unconfirmed",
    label: "확인 필요",
    unavailableReason: "계산 기준 확인 필요",
  });
  expect(summary.salesDifference.reason).toContain("OQ-14");
  expect(summary.salesDifference.reason).toContain("정책 story로 분리");

  for (const gate of listCalculationPolicyGates()) {
    const metric = createPolicyUnconfirmedMetric(gate.metricId);

    expect(metric.value).toBeNull();
    expect(metric.status).toBe("policy-unconfirmed");
    expect(metric.label).toBe("확인 필요");
    expect(metric.unavailableReason).toBe("계산 기준 확인 필요");
    for (const oqId of gate.oqIds) {
      expect(metric.reason).toContain(oqId);
    }
  }
});

test("지점장 검토 화면은 OQ-gated 파생 계산과 민감 지표를 응답 화면에 노출하지 않는다", async ({
  page,
}) => {
  await seedPolicyGateLedger();
  await login(page);
  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=review`);

  const metrics = page.locator("section").filter({ hasText: "검토 요약" });
  await expect(metrics).toContainText("총매출");
  await expect(metrics).toContainText("100,000원");
  await expect(metrics).toContainText("결제수단 합계");
  await expect(metrics).toContainText("98,000원");
  await expect(metrics).not.toContainText("결제수단 합계와 총매출 차이");
  await expect(metrics).toContainText("근무인원");
  await expect(metrics).toContainText("4명");
  // 미팅 결정(2026-06-21): 마진율(%)과 총 재고금액은 지점장 검토 요약에 노출한다.
  await expect(metrics).toContainText("마진율");
  await expect(metrics).toContainText("재고금액");

  // 매출원가/매출이익/영업이익/인당생산성/FIFO 원가는 검토 요약에서 계속 차단한다.
  await expect(metrics).not.toContainText("매출원가");
  await expect(metrics).not.toContainText("매출이익");
  await expect(metrics).not.toContainText("영업이익");
  await expect(metrics).not.toContainText("인당생산성");
  await expect(metrics).not.toContainText("매출차액");
  await expect(metrics).not.toContainText("FIFO");
  await expect(metrics).not.toContainText("30%단가");
  await expect(metrics).not.toContainText("희망 판매가 기준 손실액");
  await expect(metrics).not.toContainText("OQ-");

  const warningSection = page
    .locator("section")
    .filter({ hasText: "경고와 이상 후보" });
  await expect(warningSection).toContainText("재고 확인 필요");
  await expect(warningSection).toContainText("수량 -2개");
  await expect(warningSection).toContainText("손실 기록 있음");
  await expect(warningSection).not.toContainText("-2,000원");
  await expect(warningSection).not.toContainText("1,000원");
  // 매출원가/이익/영업이익/인당생산성/FIFO 원가·매출차액·희망판매가 파생 키는 계속 차단한다.
  // grossMarginRate/inventoryAmount는 2026-06-21 결정으로 노출되므로 차단 목록에서 제외한다.
  await expect(page.locator("main")).not.toContainText(
    /costOfGoodsSold|grossProfit|operatingProfit|productivity|salesDifference|hopedSalePrice|fifo|thirtyPercent|OQ-/i,
  );
});
