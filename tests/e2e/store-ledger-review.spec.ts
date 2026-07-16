import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORY_STORE_ID = "store-story-2-8-review";
const STORY_STORE_NAME = "스토리2-8 검토 지점";
const STORY_MARKER = "story-2-8-test";

test.afterAll(async () => {
  await cleanupStoryTwoEightData();
  await prisma.$disconnect();
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill("manager@example.com");
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

async function seedExpenseCode(name: string) {
  const actorId = await getHeadquartersUserId();

  return prisma.ledgerInputCode.create({
    data: {
      group: "EXPENSE_ITEM",
      name,
      displayOrder: 770,
      updatedById: actorId,
    },
  });
}

async function seedLossType(name: string) {
  const actorId = await getHeadquartersUserId();

  return prisma.ledgerInputCode.create({
    data: {
      group: "LOSS_TYPE",
      name,
      displayOrder: 771,
      updatedById: actorId,
    },
  });
}

async function seedProduct(name: string, unitPrice: number) {
  const actorId = await getHeadquartersUserId();

  const product = await prisma.product.create({
    data: {
      name,
      category: "검토",
      spec: "1kg",
      defaultUnitPrice: unitPrice,
      updatedById: actorId,
    },
  });

  return { ...product, defaultUnitPrice: unitPrice };
}

async function seedLedger(data: {
  totalSalesAmount?: number;
  cashAmount?: number;
  cardAmount?: number;
  otherPaymentAmount?: number;
  workerCount?: number | null;
}) {
  const actorId = await getHeadquartersUserId();
  await ensureStoryStore();

  return prisma.dailyLedger.create({
    data: {
      storeId: STORY_STORE_ID,
      closingDate: getTodayKstMidnight(),
      status: "IN_PROGRESS",
      totalSalesAmount: data.totalSalesAmount ?? 0,
      cashAmount: data.cashAmount ?? 0,
      cardAmount: data.cardAmount ?? 0,
      otherPaymentAmount: data.otherPaymentAmount ?? 0,
      workerCount: data.workerCount ?? null,
      workMemo: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
  });
}

async function seedRequiredReviewInputs(ledgerId: string) {
  const suffix = randomUUID().slice(0, 8);
  const actorId = await getHeadquartersUserId();
  const expenseCode = await seedExpenseCode(`스토리2-8 제출 비용 ${suffix}`);
  const product = await seedProduct(`스토리2-8 제출 광어 ${suffix}`, 1_000);

  await prisma.dailyLedger.update({
    where: { id: ledgerId },
    data: {
      workerCount: 3,
      updatedById: actorId,
    },
  });
  await prisma.ledgerExpense.create({
    data: {
      dailyLedgerId: ledgerId,
      ledgerInputCodeId: expenseCode.id,
      amount: 10_000,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerPurchaseItem.create({
    data: {
      dailyLedgerId: ledgerId,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      quantity: 5,
      amount: 5_000,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: ledgerId,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      previousQuantity: 10,
      purchasedQuantity: 5,
      currentQuantity: 8,
      quantity: 8,
      inventoryAmount: 8_000,
      createdById: actorId,
      updatedById: actorId,
    },
  });
}

async function getLedgerSubmitAuditCount(ledgerId: string) {
  return prisma.auditLog.count({
    where: {
      targetType: "DailyLedger",
      targetId: ledgerId,
      action: "ledger.review.submitted",
    },
  });
}

async function getLedgerSubmitAuditLogs(ledgerId: string) {
  return prisma.auditLog.findMany({
    where: {
      targetType: "DailyLedger",
      targetId: ledgerId,
      action: "ledger.review.submitted",
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      actorId: true,
      before: true,
      after: true,
      createdAt: true,
    },
  });
}

async function getLedgerWorkInfoAuditCount(ledgerId: string) {
  return prisma.auditLog.count({
    where: {
      targetType: "DailyLedger",
      targetId: ledgerId,
      action: "ledger.work_info.saved",
    },
  });
}

async function cleanupStoryTwoEightData() {
  const products = await prisma.product.findMany({
    where: { name: { startsWith: "스토리2-8" } },
    select: { id: true },
  });
  const productIds = products.map((product) => product.id);
  const codes = await prisma.ledgerInputCode.findMany({
    where: { name: { startsWith: "스토리2-8" } },
    select: { id: true },
  });
  const codeIds = codes.map((code) => code.id);
  const ledgers = await prisma.dailyLedger.findMany({
    where: {
      storeId: STORY_STORE_ID,
    },
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

  await prisma.storeSalesPricePlan.deleteMany({
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

test.beforeEach(async () => {
  await cleanupStoryTwoEightData();
});

test("검토 화면은 지점장에게 민감 계산값 없이 합계 불일치와 비민감 이상 후보를 보여준다", async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const actorId = await getHeadquartersUserId();
  const expenseCode = await seedExpenseCode(`스토리2-8 비용 ${suffix}`);
  const lossType = await seedLossType(`스토리2-8 폐기 ${suffix}`);
  const product = await seedProduct(`스토리2-8 광어 ${suffix}`, 1_000);
  const ledger = await seedLedger({
    totalSalesAmount: 100_000,
    cashAmount: 40_000,
    cardAmount: 50_000,
    otherPaymentAmount: 8_000,
    workerCount: 4,
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
      unitPrice: product.defaultUnitPrice,
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
      unitPrice: product.defaultUnitPrice,
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
      unitPrice: product.defaultUnitPrice,
      beforeQuantity: 10,
      beforeAmount: 10_000,
      afterQuantity: 8,
      afterAmount: 8_000,
      differenceQuantity: -2,
      differenceAmount: -2_000,
      reason: "검토 화면 재고 차이",
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
      unitPrice: product.defaultUnitPrice,
      lossTypeName: lossType.name,
      quantity: 1,
      amount: 1_000,
      reason: "검토 화면 손실",
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await login(page);
  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=review`);

  const metrics = page.locator("section").filter({ hasText: "검토 요약" });
  await expect(metrics).toContainText("매출/결제");
  await expect(metrics).toContainText("지출");
  await expect(metrics).toContainText("매입");
  await expect(metrics).toContainText("재고");
  await expect(metrics).toContainText("손실");
  await expect(metrics).toContainText("근무인원/이름");
  // 근무인원/급여 항목(건수)은 운영 보조 카운트로 노출된다.
  await expect(metrics).toContainText("급여 항목");
  // WO-10(2026-06-28): 급여 합계 금액은 본사 전용. 지점장 검토 요약에서 제거한다.
  await expect(metrics).not.toContainText("급여 합계");
  await expect(metrics).toContainText("총매출");
  await expect(metrics).toContainText("100,000원");
  // 보완(2026-06-22 WO-01): 결제차액(결제수단 합계와 총매출 차이)은 본사 역할이므로
  // 지점장 검토 요약 지표에서 제거한다. 합계 불일치는 아래 경고 섹션에서만 안내한다.
  await expect(metrics).not.toContainText("결제수단 합계와 총매출 차이");
  await expect(metrics).toContainText("근무인원");
  await expect(metrics).toContainText("4명");
  // 정책 반전(2026-06-28): 마진율·재고금액은 본사 전용. 지점장 검토 요약에서 제거한다.
  await expect(metrics).not.toContainText("마진율");
  await expect(metrics).not.toContainText("재고금액");
  // 매출원가/매출이익/영업이익/인당생산성 절대금액과 매출차액은 계속 차단한다.
  await expect(metrics).not.toContainText("매출원가");
  await expect(metrics).not.toContainText("매출이익");
  await expect(metrics).not.toContainText("영업이익");
  await expect(metrics).not.toContainText("인당생산성");
  await expect(metrics).not.toContainText("매출차액");

  // WO-04(2026-06-22): 오늘 많이 팔린 품목 카드(재고 흐름 기반 추정값).
  // 판매수량 = 전일 10 + 매입 5 - 당일 8 = 7개, 추정 매출 = 7 * 1,000 = 7,000원.
  // WO(2026-06-26): 관리자 리포트식 막대 차트(금액/수량 전환)로 교체. 막대 라벨은
  // compact 표기(예: 7천)라 정확한 원화 문자열 대신 차트 구성요소로 검증한다.
  const topSoldSection = page
    .locator("section")
    .filter({ hasText: "오늘 많이 팔린 품목" });
  await expect(topSoldSection).toBeVisible();
  // WO(2026-06-25): 안내 문구는 새 입력 위치(1단계 매입의 오늘 팔 가격(예상))와 맞춘다.
  await expect(topSoldSection).toContainText(
    "추정 매출은 1단계 매입의 오늘 팔 가격(예상)을 우선 사용합니다.",
  );
  // 품목명은 Y축 눈금으로, 금액/수량 전환 버튼은 차트 토글로 노출된다.
  await expect(topSoldSection).toContainText(
    product.name.split(/\s+/).pop() ?? product.name,
  );
  const metricToggle = topSoldSection.getByRole("group", { name: "지표 전환" });
  await expect(
    metricToggle.getByRole("button", { name: "금액" }),
  ).toBeVisible();
  await expect(
    metricToggle.getByRole("button", { name: "수량" }),
  ).toBeVisible();
  // 판매가 계획이 없어 매입 단가로 폴백했으므로 "판매가 미반영"과 1단계 매입 안내 링크가 보인다.
  await expect(topSoldSection).toContainText("판매가 미반영");
  await expect(
    topSoldSection.getByRole("link", {
      name: "1단계 매입에서 오늘 팔 가격 입력",
    }),
  ).toHaveAttribute(
    "href",
    new RegExp(`storeId=${STORY_STORE_ID}.*step=purchase`),
  );

  const warningSection = page
    .locator("section")
    .filter({ hasText: "경고와 이상 후보" });
  await expect(warningSection).toContainText("결제 합계 불일치");
  // 손실이 섞인 부족은 재고 이상이 아니라 판매 추정 확인 카드로 표시된다(2026-06-26 WO).
  await expect(warningSection).toContainText("판매 추정 확인");
  await expect(warningSection).toContainText(
    "손실 1개를 제외한 뒤, 남은 재고를 기준으로 2개 판매로 계산됩니다.",
  );
  await expect(warningSection).toContainText("판매 추정 2개");
  await expect(warningSection).not.toContainText("기준보다 2개 부족합니다.");
  await expect(warningSection).not.toContainText("수량 -2개");
  await expect(warningSection).not.toContainText("-2,000원");
  await expect(warningSection).toContainText("손실 기록 있음");
  await expect(warningSection).not.toContainText("금액 +1,000원");
  await expect(
    page.getByRole("link", { name: "7단계: 검토/제출" }),
  ).toHaveAttribute("aria-current", "step");

  // 내부 필드 키와 차단 지표는 계속 노출 금지.
  await expect(page.locator("main")).not.toContainText(
    /costOfGoodsSold|grossProfit|grossMarginRate|operatingProfit|productivity|inventoryAmount|differenceAmount/,
  );
});

test("7단계 추정 매출은 1단계 매입에서 입력한 오늘 팔 가격을 우선 반영한다", async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const actorId = await getHeadquartersUserId();
  const product = await seedProduct(`스토리2-8 계획반영 ${suffix}`, 1_000);
  const ledger = await seedLedger({
    totalSalesAmount: 100_000,
    cashAmount: 100_000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 3,
  });

  await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      previousQuantity: 10,
      purchasedQuantity: 5,
      currentQuantity: 8,
      quantity: 8,
      inventoryAmount: 8_000,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  // 1단계 매입에서 "오늘 팔 가격(예상)"으로 저장된 판매가 계획(StoreSalesPricePlan).
  await prisma.storeSalesPricePlan.create({
    data: {
      storeId: STORY_STORE_ID,
      businessDate: getTodayKstMidnight(),
      productId: product.id,
      plannedUnitPrice: 3_000,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await login(page);
  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=review`);

  const topSoldSection = page
    .locator("section")
    .filter({ hasText: "오늘 많이 팔린 품목" });
  await expect(topSoldSection).toBeVisible();
  // 판매수량 = 전일 10 + 매입 5 - 당일 8 = 7개. 추정 매출 = 7 * 3,000(계획) = 21,000원.
  // WO(2026-06-26): 막대 차트로 교체되어 품목명은 Y축 눈금으로 노출된다.
  await expect(topSoldSection).toContainText(
    product.name.split(/\s+/).pop() ?? product.name,
  );
  // 판매가 계획이 반영됐으므로 cost 폴백 표시(판매가 미반영)와 1단계 매입 안내 링크가 없다.
  // (섹션 상단 안내 문구의 "판매가 미반영"은 설명용이므로, li 대신 차트의 cost 폴백 산출물로 검증한다.)
  await expect(
    topSoldSection.getByText("판매가 미반영", { exact: true }),
  ).toHaveCount(0);
  await expect(
    topSoldSection.getByRole("link", {
      name: "1단계 매입에서 오늘 팔 가격 입력",
    }),
  ).toHaveCount(0);
});

test("검토 화면은 누락 항목 링크와 모바일 읽기 상태를 제공한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const suffix = randomUUID().slice(0, 8);
  const actorId = await getHeadquartersUserId();
  const product = await seedProduct(`스토리2-8 누락 ${suffix}`, 2_000);
  const ledger = await seedLedger({
    totalSalesAmount: 0,
    cashAmount: 0,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 0,
  });

  await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: product.defaultUnitPrice,
      previousQuantity: 1,
      purchasedQuantity: 0,
      currentQuantity: null,
      quantity: null,
      inventoryAmount: null,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await login(page);
  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=review`);

  const missingSection = page
    .locator("section")
    .filter({ hasText: "입력 확인 항목" });

  await expect(missingSection).toContainText("총매출/결제");
  await expect(missingSection).toContainText("지출");
  await expect(missingSection).toContainText("매입");
  await expect(missingSection).toContainText("재고");
  await expect(missingSection).toContainText("계산할 수 없는");
  await expect(missingSection).toContainText("근무인원");
  await expect(missingSection).toContainText("손실 항목 없음");
  await expect(
    page.getByRole("link", { name: "6단계: 매출/결제" }),
  ).toHaveAttribute(
    "href",
    new RegExp(`storeId=${STORY_STORE_ID}.*step=sales`),
  );
  await expect(page.getByRole("link", { name: "3단계: 재고" })).toHaveAttribute(
    "href",
    new RegExp(`/app/store-entry/inventory\\?storeId=${STORY_STORE_ID}.*date=`),
  );
  await expect(
    missingSection.getByRole("link", { name: "총매출/결제 단계로 이동" }),
  ).toHaveAttribute(
    "href",
    new RegExp(`storeId=${STORY_STORE_ID}.*step=sales`),
  );
  await expect(
    missingSection.getByRole("link", { name: "지출 단계로 이동" }),
  ).toHaveAttribute("href", new RegExp(`storeId=${STORY_STORE_ID}.*step=cost`));
  await expect(
    missingSection.getByRole("link", { name: "매입 단계로 이동" }),
  ).toHaveAttribute(
    "href",
    new RegExp(`storeId=${STORY_STORE_ID}.*step=purchase`),
  );
  await expect(
    missingSection.getByRole("link", { name: "재고 단계로 이동" }),
  ).toHaveAttribute(
    "href",
    new RegExp(`/app/store-entry/inventory\\?storeId=${STORY_STORE_ID}.*date=`),
  );
  await expect(
    missingSection.getByRole("link", { name: "손실/폐기 단계로 이동" }),
  ).toHaveAttribute(
    "href",
    new RegExp(`/app/store-entry/losses\\?storeId=${STORY_STORE_ID}.*date=`),
  );
  await expect(
    missingSection.getByRole("link", { name: "근무인원 단계로 이동" }),
  ).toHaveAttribute("href", new RegExp(`storeId=${STORY_STORE_ID}.*step=work`));

  const metricsBox = await page
    .locator("section")
    .filter({ hasText: "검토 요약" })
    .boundingBox();
  const missingBox = await page
    .locator("section")
    .filter({ hasText: "입력 확인 항목" })
    .boundingBox();

  expect(metricsBox?.width).toBeLessThanOrEqual(390);
  expect(missingBox?.width).toBeLessThanOrEqual(390);
  expect(metricsBox?.height).toBeGreaterThan(0);
  expect(missingBox?.height).toBeGreaterThan(0);
  await expect(
    page.locator("section").filter({ hasText: "검토 요약" }),
  ).toContainText("데이터 부족");
});

test("검토 제출은 필수 누락을 서버에서 거부하고 해결 후 중복 제출을 막는다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const managerId = await getStoreManagerUserId();
  const ledger = await seedLedger({
    totalSalesAmount: 100_000,
    cashAmount: 40_000,
    cardAmount: 50_000,
    otherPaymentAmount: 8_000,
    workerCount: null,
  });

  await login(page);
  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=review`);

  const missingSection = page
    .locator("section")
    .filter({ hasText: "입력 확인 항목" });
  const warningSection = page
    .locator("section")
    .filter({ hasText: "경고와 이상 후보" });

  await expect(missingSection).toContainText("지출");
  await expect(missingSection).toContainText("매입");
  await expect(missingSection).toContainText("근무인원");
  await expect(warningSection).toContainText("결제 합계 불일치");

  await page.getByRole("button", { name: "검토 대기로 제출" }).click();

  const submitSection = page.getByRole("region", { name: "제출" });
  const submitAlert = submitSection.getByRole("alert");
  await expect(submitAlert).toContainText(
    "필수 입력을 완료한 뒤 제출해 주세요.",
  );
  await expect(submitAlert).toContainText("지출");
  await expect(submitAlert).toContainText("매입");
  await expect(submitAlert).toContainText("재고");
  await expect(submitAlert).toContainText("근무인원");
  expect(await getLedgerSubmitAuditCount(ledger.id)).toBe(0);
  await expect
    .poll(async () => {
      const current = await prisma.dailyLedger.findUnique({
        where: { id: ledger.id },
        select: { status: true, submittedById: true, submittedAt: true },
      });

      return current;
    })
    .toEqual({
      status: "IN_PROGRESS",
      submittedById: null,
      submittedAt: null,
    });

  await seedRequiredReviewInputs(ledger.id);
  await page.reload();
  await expect(warningSection).toContainText("결제 합계 불일치");

  await page.getByRole("button", { name: "검토 대기로 제출" }).click();

  await expect(submitSection.getByRole("status")).toContainText(
    "장부를 제출했습니다.",
  );
  await expect(page.getByText("검토 대기").first()).toBeVisible();
  const submitSectionBox = await submitSection.boundingBox();
  const statusBox = await submitSection.getByRole("status").boundingBox();

  const submitted = await prisma.dailyLedger.findUniqueOrThrow({
    where: { id: ledger.id },
    select: {
      status: true,
      submittedById: true,
      submittedAt: true,
    },
  });

  expect(submitted.status).toBe("IN_REVIEW");
  expect(submitted.submittedById).toBe(managerId);
  expect(submitted.submittedAt).toBeTruthy();
  const firstSubmittedAt = submitted.submittedAt;
  const auditLogs = await getLedgerSubmitAuditLogs(ledger.id);

  expect(auditLogs).toHaveLength(1);
  expect(auditLogs[0]?.action).toBe("ledger.review.submitted");
  expect(auditLogs[0]?.targetType).toBe("DailyLedger");
  expect(auditLogs[0]?.targetId).toBe(ledger.id);
  expect(auditLogs[0]?.actorId).toBe(managerId);
  expect(auditLogs[0]?.createdAt).toBeInstanceOf(Date);
  expect(auditLogs[0]?.before).toMatchObject({
    status: "IN_PROGRESS",
    submittedById: null,
    submittedAt: null,
  });
  expect(auditLogs[0]?.after).toMatchObject({
    status: "IN_REVIEW",
    submittedById: managerId,
  });
  expect(
    (auditLogs[0]?.after as { submittedAt?: unknown }).submittedAt,
  ).toBeTruthy();

  expect(submitSectionBox?.width).toBeLessThanOrEqual(390);
  expect(statusBox?.width).toBeLessThanOrEqual(390);
  expect(submitSectionBox?.height).toBeGreaterThan(0);
  expect(statusBox?.height).toBeGreaterThan(0);

  const successDialog = page.getByRole("dialog", {
    name: "장부를 제출했습니다.",
  });
  await successDialog.getByRole("button", { name: "확인" }).click();
  await expect(successDialog).toHaveCount(0);

  await page.getByRole("button", { name: "검토 대기로 제출" }).click();

  await expect(submitSection.getByRole("status")).toContainText(
    "이미 검토 대기 상태입니다.",
  );
  expect(await getLedgerSubmitAuditCount(ledger.id)).toBe(1);
  const duplicate = await prisma.dailyLedger.findUniqueOrThrow({
    where: { id: ledger.id },
    select: {
      submittedById: true,
      submittedAt: true,
    },
  });

  expect(duplicate.submittedById).toBe(managerId);
  expect(duplicate.submittedAt?.getTime()).toBe(firstSubmittedAt!.getTime());

  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=work`);
  await expect(page.getByText("검토 대기").first()).toBeVisible();
  const workerCountInput = page.getByRole("textbox", { name: "근무인원" });
  const workMemoInput = page.getByRole("textbox", { name: "특이사항 메모" });
  const workSaveButton = page.getByRole("button", {
    name: "저장",
    exact: true,
  });
  await expect(workerCountInput).toBeEnabled();
  await expect(workMemoInput).toBeEnabled();
  await workerCountInput.fill("5");
  await workMemoInput.fill("제출 후 보완 수정");
  await expect(workSaveButton).toBeEnabled();
  await workSaveButton.click();

  await expect(
    page.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();
  const editedAfterReview = await prisma.dailyLedger.findUniqueOrThrow({
    where: { id: ledger.id },
    select: {
      status: true,
      submittedById: true,
      submittedAt: true,
      workerCount: true,
      workMemo: true,
    },
  });

  expect(editedAfterReview.status).toBe("IN_REVIEW");
  expect(editedAfterReview.submittedById).toBe(managerId);
  expect(editedAfterReview.submittedAt?.getTime()).toBe(
    firstSubmittedAt!.getTime(),
  );
  expect(editedAfterReview.workerCount).toBe(5);
  expect(editedAfterReview.workMemo).toBe("제출 후 보완 수정");
  expect(await getLedgerWorkInfoAuditCount(ledger.id)).toBe(1);
});

test("검토 제출 실패 시 기존 상태를 유지하고 재시도할 수 있다", async ({
  page,
}) => {
  const ledger = await seedLedger({
    totalSalesAmount: 50_000,
    cashAmount: 50_000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 2,
  });
  await seedRequiredReviewInputs(ledger.id);

  await login(page);
  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=review`);

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

  await page.getByRole("button", { name: "검토 대기로 제출" }).click();

  const submitSection = page.getByRole("region", { name: "제출" });
  await expect(
    submitSection.getByText("제출에 실패했습니다. 다시 시도해 주세요."),
  ).toBeVisible();
  await expect(
    submitSection.getByRole("button", { name: "다시 시도" }),
  ).toBeVisible();

  const failed = await prisma.dailyLedger.findUniqueOrThrow({
    where: { id: ledger.id },
    select: {
      status: true,
      submittedById: true,
      submittedAt: true,
    },
  });

  expect(failed.status).toBe("IN_PROGRESS");
  expect(failed.submittedById).toBeNull();
  expect(failed.submittedAt).toBeNull();
  expect(await getLedgerSubmitAuditCount(ledger.id)).toBe(0);

  await page.unroute("**/*");
  await submitSection.getByRole("button", { name: "다시 시도" }).click();

  await expect(submitSection.getByRole("status")).toContainText(
    "장부를 제출했습니다.",
  );
  expect(await getLedgerSubmitAuditCount(ledger.id)).toBe(1);
});

test("stale version 검토 제출은 conflict dialog와 reload guidance를 보여준다", async ({
  page,
}) => {
  const actorId = await getHeadquartersUserId();
  const ledger = await seedLedger({
    totalSalesAmount: 50_000,
    cashAmount: 50_000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 2,
  });
  await seedRequiredReviewInputs(ledger.id);

  await login(page);
  await page.goto(`/app/store-entry?storeId=${STORY_STORE_ID}&step=review`);
  await expect(
    page.getByRole("button", { name: "검토 대기로 제출" }),
  ).toBeVisible();

  await prisma.dailyLedger.update({
    where: { id: ledger.id },
    data: {
      workMemo: "제출 전 다른 저장",
      updatedById: actorId,
      version: { increment: 1 },
    },
  });

  await page.getByRole("button", { name: "검토 대기로 제출" }).click();

  const conflictDialog = page.getByRole("dialog", {
    name: "저장 충돌이 발생했습니다",
  });
  await expect(conflictDialog).toBeVisible();
  await expect(conflictDialog.getByText("검토 제출").first()).toBeVisible();
  await expect(conflictDialog.getByText("제출상태")).toBeVisible();
  await expect(
    conflictDialog.getByRole("button", { name: "최신값 다시 불러오기" }),
  ).toBeVisible();

  const current = await prisma.dailyLedger.findUniqueOrThrow({
    where: { id: ledger.id },
    select: { status: true, submittedById: true, submittedAt: true },
  });
  expect(current).toEqual({
    status: "IN_PROGRESS",
    submittedById: null,
    submittedAt: null,
  });
  expect(await getLedgerSubmitAuditCount(ledger.id)).toBe(0);
});
