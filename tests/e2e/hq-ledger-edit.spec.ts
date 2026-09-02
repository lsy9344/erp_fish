import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();
const STORY_MARKER = "story-4-3-test";
const STORE_ID = "store-story-4-3-edit";
const RELATED_STORE_ID = "store-story-4-3-edit-related";
const CLOSED_STORE_ID = "store-story-4-3-closed";
const PREFLIGHT_BLOCKED_STORE_ID = "store-story-4-4-preflight-blocked";
const PRODUCT_NAME = "스토리4-3 광어";
const EXPENSE_CODE_NAME = "스토리4-3 비용";
const LOSS_CODE_NAME = "스토리4-3 손실";
const ECOUNT_FILE_HASH = "story-4-3-hq-purchase-edit";
const EMPLOYEE_ID = "employee-story-4-3";
const EMPLOYEE_NAME = "스토리4-3 본사 직원";
const EMPLOYEE_DAILY_WAGE = 150_000;

test.beforeEach(async () => {
  await cleanupStoryFourOneData();
});

test.afterAll(async () => {
  await cleanupStoryFourOneData();
  await prisma.$disconnect();
});

async function loginAsHq(page: Page) {
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill("hq@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

async function loginAsHqViewer(page: Page) {
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill("hq-viewer@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

async function loginAsStoreManager(page: Page) {
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill("manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\/store-entry/);
}

async function replaceControlValue(control: Locator, value: string) {
  await control.click();
  await control.press("Control+A");
  await control.pressSequentially(value);
  await expect(control).toHaveValue(value);
}

async function replaceKrwControlValue(control: Locator, value: string) {
  await control.click();
  await control.press("Control+A");
  await control.pressSequentially(value);
  await expect(control).toHaveValue(formatKrwInputForTest(value));
}

async function clearControlValue(control: Locator) {
  await control.click();
  await control.press("Control+A");
  await control.press("Backspace");
  await expect(control).toHaveValue("");
}

async function fillHqEditReason(panel: Locator, value: string) {
  await replaceControlValue(panel.getByLabel("본사 수정 사유"), value);
}

function formatKrwInputForTest(value: string) {
  const rawValue = value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");

  if (rawValue === "") {
    return "";
  }

  return new Intl.NumberFormat("ko-KR").format(Number(rawValue));
}

async function getHeadquartersUserId() {
  const user = await prisma.user.findUnique({
    where: { email: "hq@example.com" },
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

function formatKstDateTimeForTest(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

async function seedEditableStoryData() {
  const actorId = await getHeadquartersUserId();
  const store = await prisma.store.create({
    data: {
      id: STORE_ID,
      name: "스토리4-3 검토대기점",
      isActive: true,
      updatedById: actorId,
    },
  });
  const product = await prisma.product.create({
    data: {
      name: PRODUCT_NAME,
      category: "냉동",
      spec: "1kg",
      defaultUnitPrice: 1000,
      updatedById: actorId,
    },
  });
  const purchaseStandard = await prisma.purchaseStandard.create({
    data: {
      productId: product.id,
      standardUnitPrice: 1000,
      referenceInfo: STORY_MARKER,
      updatedById: actorId,
    },
  });
  const expenseCode = await prisma.ledgerInputCode.create({
    data: {
      group: "EXPENSE_ITEM",
      name: EXPENSE_CODE_NAME,
      displayOrder: 941,
      updatedById: actorId,
    },
  });
  const lossCode = await prisma.ledgerInputCode.create({
    data: {
      group: "LOSS_TYPE",
      name: LOSS_CODE_NAME,
      displayOrder: 942,
      updatedById: actorId,
    },
  });
  const ledger = await prisma.dailyLedger.create({
    data: {
      storeId: store.id,
      closingDate: getTodayKstMidnight(),
      status: "IN_REVIEW",
      totalSalesAmount: 10000,
      cashAmount: 3000,
      cardAmount: 6000,
      otherPaymentAmount: 0,
      workerCount: 2,
      authorDisplayName: "스토리4-3 작성자",
      workMemo: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await prisma.ledgerExpense.create({
    data: {
      dailyLedgerId: ledger.id,
      ledgerInputCodeId: expenseCode.id,
      amount: 1000,
      memo: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerPurchaseItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      purchaseStandardId: purchaseStandard.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: 1000,
      quantity: 1,
      amount: 1000,
      // WO-12(2026-06-28): 원본 이카운트 단가(900) ≠ 적용 단가(1000) → 본사 화면에 보정 표시.
      sourceUnitPrice: 900,
      unitPriceOverrideReason: STORY_MARKER,
      referenceInfo: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: 1000,
      previousQuantity: 10,
      purchasedQuantity: 1,
      currentQuantity: 8,
      quantity: 8,
      inventoryAmount: 8000,
      isModified: true,
      carryoverSource: "PREVIOUS_CLOSED_LEDGER",
      carryoverStatus: "PREVIOUS_CARRYOVER",
      createdById: actorId,
      updatedById: actorId,
    },
  });
  await prisma.ledgerLossItem.create({
    data: {
      dailyLedgerId: ledger.id,
      productId: product.id,
      ledgerInputCodeId: lossCode.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: 1000,
      lossTypeName: lossCode.name,
      quantity: 1,
      amount: 1000,
      reason: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await prisma.employee.upsert({
    where: { id: EMPLOYEE_ID },
    update: {
      isActive: true,
      position: "매니저",
      dailyWage: EMPLOYEE_DAILY_WAGE,
    },
    create: {
      id: EMPLOYEE_ID,
      name: EMPLOYEE_NAME,
      hireDate: new Date("2026-01-02T00:00:00.000Z"),
      isActive: true,
      position: "매니저",
      dailyWage: EMPLOYEE_DAILY_WAGE,
    },
  });

  return { actorId, ledger, product };
}

async function seedEditableEcountPurchaseData() {
  const seeded = await seedEditableStoryData();
  const purchase = await prisma.ledgerPurchaseItem.findFirstOrThrow({
    where: { dailyLedgerId: seeded.ledger.id, productId: seeded.product.id },
  });
  const batch = await prisma.ecountImportBatch.create({
    data: {
      fileName: "스토리4-3 이카운트.xlsx",
      fileHash: ECOUNT_FILE_HASH,
      sheetName: "Sheet1",
      businessDate: seeded.ledger.closingDate,
      status: "COMMITTED",
      uploadedById: seeded.actorId,
      committedById: seeded.actorId,
      committedAt: new Date(),
    },
  });
  const relatedStore = await prisma.store.create({
    data: {
      id: RELATED_STORE_ID,
      name: "스토리4-3 같은업로드 타지점",
      isActive: true,
      updatedById: seeded.actorId,
    },
  });
  const relatedLedger = await prisma.dailyLedger.create({
    data: {
      storeId: relatedStore.id,
      closingDate: seeded.ledger.closingDate,
      status: "IN_REVIEW",
      createdById: seeded.actorId,
      updatedById: seeded.actorId,
    },
  });
  const importLine = await prisma.ecountImportLine.create({
    data: {
      batchId: batch.id,
      rowNumber: 1,
      dateNo: "story-4-3-1",
      rawStoreName: "스토리4-3 검토대기점",
      storeId: STORE_ID,
      rawProductName: PRODUCT_NAME,
      productId: seeded.product.id,
      productName: seeded.product.name,
      productCategory: seeded.product.category,
      productSpec: seeded.product.spec,
      quantity: 1,
      unitPrice: 900,
      supplyAmount: 900,
      totalAmount: 900,
      status: "COMMITTED",
    },
  });
  const relatedImportLine = await prisma.ecountImportLine.create({
    data: {
      batchId: batch.id,
      rowNumber: 2,
      dateNo: "story-4-3-2",
      rawStoreName: relatedStore.name,
      storeId: relatedStore.id,
      rawProductName: PRODUCT_NAME,
      productId: seeded.product.id,
      productName: seeded.product.name,
      productCategory: seeded.product.category,
      productSpec: seeded.product.spec,
      quantity: 2,
      unitPrice: 900,
      supplyAmount: 1_800,
      totalAmount: 1_800,
      status: "COMMITTED",
    },
  });
  const relatedPurchase = await prisma.ledgerPurchaseItem.create({
    data: {
      dailyLedgerId: relatedLedger.id,
      productId: seeded.product.id,
      sourceType: "ECOUNT_UPLOAD",
      productName: seeded.product.name,
      productCategory: seeded.product.category,
      productSpec: seeded.product.spec,
      unitPrice: 900,
      quantity: 2,
      amount: 1_800,
      sourceUnitPrice: 900,
      ecountImportLineId: relatedImportLine.id,
      createdById: seeded.actorId,
      updatedById: seeded.actorId,
    },
  });

  await prisma.ledgerPurchaseItem.update({
    where: { id: purchase.id },
    data: {
      sourceType: "ECOUNT_UPLOAD",
      ecountImportLineId: importLine.id,
    },
  });
  await prisma.ecountImportLine.update({
    where: { id: importLine.id },
    data: { ledgerPurchaseItemId: purchase.id },
  });
  await prisma.ecountImportLine.update({
    where: { id: relatedImportLine.id },
    data: { ledgerPurchaseItemId: relatedPurchase.id },
  });

  return { ...seeded, importLine, relatedImportLine, relatedPurchase };
}

async function seedClosedStoryData() {
  const actorId = await getHeadquartersUserId();
  const closedAt = new Date("2026-06-11T06:30:00.000Z");
  await prisma.employee.upsert({
    where: { id: EMPLOYEE_ID },
    update: {
      isActive: true,
      position: "매니저",
      dailyWage: EMPLOYEE_DAILY_WAGE,
    },
    create: {
      id: EMPLOYEE_ID,
      name: EMPLOYEE_NAME,
      hireDate: new Date("2026-01-02T00:00:00.000Z"),
      isActive: true,
      position: "매니저",
      dailyWage: EMPLOYEE_DAILY_WAGE,
    },
  });
  const store = await prisma.store.create({
    data: {
      id: CLOSED_STORE_ID,
      name: "스토리4-3 본사마감점",
      isActive: true,
      updatedById: actorId,
    },
  });

  return prisma.dailyLedger.create({
    data: {
      storeId: store.id,
      closingDate: getTodayKstMidnight(),
      status: "HEADQUARTERS_CLOSED",
      totalSalesAmount: 10000,
      cashAmount: 4000,
      cardAmount: 6000,
      otherPaymentAmount: 0,
      workerCount: 2,
      workMemo: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
      closedById: actorId,
      closedAt,
    },
  });
}

async function seedPreflightBlockedStoryData() {
  const actorId = await getHeadquartersUserId();
  const store = await prisma.store.create({
    data: {
      id: PREFLIGHT_BLOCKED_STORE_ID,
      name: "스토리4-4 보완필요점",
      isActive: true,
      updatedById: actorId,
    },
  });

  return prisma.dailyLedger.create({
    data: {
      storeId: store.id,
      closingDate: getTodayKstMidnight(),
      status: "IN_REVIEW",
      totalSalesAmount: 0,
      cashAmount: 0,
      cardAmount: 0,
      otherPaymentAmount: 0,
      workerCount: null,
      workMemo: STORY_MARKER,
      createdById: actorId,
      updatedById: actorId,
    },
  });
}

async function cleanupStoryFourOneData() {
  const stores = [
    STORE_ID,
    RELATED_STORE_ID,
    CLOSED_STORE_ID,
    PREFLIGHT_BLOCKED_STORE_ID,
  ];
  const ledgers = await prisma.dailyLedger.findMany({
    where: { storeId: { in: stores } },
    select: { id: true },
  });
  const ledgerIds = ledgers.map((ledger) => ledger.id);
  const products = await prisma.product.findMany({
    where: { name: PRODUCT_NAME },
    select: { id: true },
  });
  const productIds = products.map((product) => product.id);
  const codes = await prisma.ledgerInputCode.findMany({
    where: { name: { in: [EXPENSE_CODE_NAME, LOSS_CODE_NAME] } },
    select: { id: true },
  });
  const codeIds = codes.map((code) => code.id);

  if (ledgerIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { targetType: "DailyLedger", targetId: { in: ledgerIds } },
    });
    await prisma.correctionRecord.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.ledgerLaborItem.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
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

  await prisma.ecountImportBatch.deleteMany({
    where: { fileHash: ECOUNT_FILE_HASH },
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
    where: { storeId: { in: stores } },
  });
  await prisma.store.deleteMany({
    where: { id: { in: stores } },
  });
  await prisma.employee.deleteMany({ where: { id: EMPLOYEE_ID } });
}

test("본사는 ledgerId 상세에서 검토 대기 장부의 모든 입력 섹션을 보완 저장한다", async ({
  page,
}) => {
  // 7개 섹션을 순차 저장하는 긴 시나리오라 기본 30초 예산이 부족하다.
  test.slow();
  const { actorId, ledger, product } = await seedEditableStoryData();

  await loginAsHq(page);
  await page.goto(
    `/app/ledgers/${ledger.id}?date=today&sort=priority&filter=all`,
  );
  await expect(
    page.getByRole("heading", { name: "스토리4-3 검토대기점 장부 상세" }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "손실" }).click();
  const lossPanel = page.getByRole("tabpanel").filter({ hasText: "손실 항목" });
  await expect(lossPanel).toBeVisible();
  await replaceControlValue(
    lossPanel.getByLabel("사유/특이사항"),
    "본사 손실 확인",
  );
  await fillHqEditReason(lossPanel, "손실 원본 보완");
  await lossPanel.getByRole("button", { name: "저장" }).click();
  await expect
    .poll(async () => {
      const current = await prisma.ledgerLossItem.findFirst({
        where: { dailyLedgerId: ledger.id, productId: product.id },
        select: { reason: true },
      });

      return current?.reason;
    })
    .toBe("본사 손실 확인");
  await expect(
    lossPanel
      .getByRole("status")
      .filter({ hasText: /저장됐습니다|손실\/폐기 항목 1건을 저장했습니다/ }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "매출/결제" }).click();
  const salesPanel = page.getByRole("tabpanel").filter({ hasText: "총매출" });
  await expect(salesPanel).toBeVisible();
  const expenseTotalInput = salesPanel.getByLabel("지출합계");
  await expect(expenseTotalInput).toHaveValue("1,000원");
  await expect(expenseTotalInput).toHaveJSProperty("readOnly", true);
  await replaceKrwControlValue(salesPanel.getByLabel("현금"), "14000");
  await replaceKrwControlValue(salesPanel.getByLabel("카드"), "25000");
  await replaceKrwControlValue(
    salesPanel.getByLabel("기타 결제수단(온누리QR)"),
    "5000",
  );
  await fillHqEditReason(salesPanel, "매출 결제 원본 보완");
  await salesPanel.getByRole("button", { name: "저장" }).click();
  await expect(
    salesPanel.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const current = await prisma.dailyLedger.findUnique({
        where: { id: ledger.id },
        select: {
          totalSalesAmount: true,
          cashAmount: true,
          cardAmount: true,
          otherPaymentAmount: true,
        },
      });

      return current;
    })
    .toEqual({
      totalSalesAmount: 45000,
      cashAmount: 14000,
      cardAmount: 25000,
      otherPaymentAmount: 5000,
    });

  await page.getByRole("tab", { name: "지출" }).click();
  const expensePanel = page
    .getByRole("tabpanel")
    .filter({ hasText: "지출 항목" });
  await expect(expensePanel).toBeVisible();
  await replaceKrwControlValue(expensePanel.getByLabel("지출 금액"), "3000");
  await fillHqEditReason(expensePanel, "지출 원본 보완");
  await expensePanel.getByRole("button", { name: "저장" }).click();
  await expect(
    expensePanel
      .getByRole("status")
      .filter({ hasText: /저장됐습니다|지출 항목 1건을 저장했습니다/ }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const current = await prisma.ledgerExpense.findFirst({
        where: { dailyLedgerId: ledger.id },
        select: { amount: true },
      });

      return current?.amount;
    })
    .toBe(3000);

  await page.getByRole("tab", { name: "매출/결제" }).click();
  await expect(salesPanel).toBeVisible();
  await expect(expenseTotalInput).toHaveValue("3,000원");
  await expect(expenseTotalInput).toHaveJSProperty("readOnly", true);
  await replaceKrwControlValue(salesPanel.getByLabel("현금"), "12000");
  await fillHqEditReason(salesPanel, "지출 연동 후 매출 재저장");
  await salesPanel.getByRole("button", { name: "저장" }).click();
  await expect
    .poll(async () =>
      prisma.auditLog.count({
        where: {
          targetType: "DailyLedger",
          targetId: ledger.id,
          action: "ledger.hq.sales_payment.updated",
          reason: "지출 연동 후 매출 재저장",
        },
      }),
    )
    .toBe(1);
  await expect(
    page.getByRole("dialog", { name: "저장 충돌이 발생했습니다" }),
  ).not.toBeVisible();
  await expect(
    salesPanel.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "매입" }).click();
  const purchasePanel = page
    .getByRole("tabpanel")
    .filter({ hasText: "매입 항목" });
  await expect(purchasePanel).toBeVisible();
  await replaceControlValue(purchasePanel.getByLabel("수량"), "3");
  await fillHqEditReason(purchasePanel, "매입 원본 보완");
  await purchasePanel.getByRole("button", { name: "저장" }).click();
  await expect(
    purchasePanel
      .getByRole("status")
      .filter({ hasText: /저장됐습니다|매입 항목 1건을 저장했습니다/ }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const current = await prisma.ledgerPurchaseItem.findFirst({
        where: { dailyLedgerId: ledger.id, productId: product.id },
        select: { quantity: true },
      });

      return current?.quantity.toString();
    })
    .toBe("3");

  await page.getByRole("tab", { name: "재고" }).click();
  const inventoryPanel = page
    .getByRole("tabpanel")
    .filter({ hasText: "재고 입력" });
  await expect(inventoryPanel).toBeVisible();
  const inventoryInput = page.getByLabel(`${product.name} 당일재고`);
  await expect(inventoryInput).toBeVisible();
  await replaceControlValue(inventoryInput, "14.25");
  await fillHqEditReason(inventoryPanel, "재고 원본 보완");
  await inventoryPanel
    .getByLabel(`${product.name} 재고 조정 이유`)
    .fill("재고 원본 보완");
  await inventoryPanel
    .getByRole("button", { name: `${product.name} 고친 이유 저장` })
    .click();
  await expect(
    inventoryPanel
      .getByRole("status")
      .filter({ hasText: "고친 내용이 저장됐습니다." }),
  ).toBeVisible();
  await fillHqEditReason(inventoryPanel, "재고 원본 보완");
  await inventoryPanel
    .getByRole("button", { name: "저장", exact: true })
    .click();
  await expect(
    inventoryPanel.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const current = await prisma.ledgerInventoryItem.findFirst({
        where: { dailyLedgerId: ledger.id, productId: product.id },
        select: { currentQuantity: true },
      });

      return current?.currentQuantity?.toString();
    })
    .toBe("14.25");

  await page.getByRole("tab", { name: "근무" }).click();
  const workPanel = page.getByRole("tabpanel").filter({ hasText: "근무 요약" });
  await expect(workPanel).toBeVisible();
  await replaceControlValue(workPanel.getByLabel("특이사항 메모"), "본사 보완");
  await replaceControlValue(
    workPanel.locator("#work-hq-edit-reason"),
    "근무 원본 보완",
  );
  await workPanel.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    workPanel.getByRole("status").filter({ hasText: "저장됐습니다." }),
  ).toBeVisible();

  // 2026-09-02 요청: 근무인원은 직접 쓰지 않고 급여 행(직원 연결) 수로 정해진다.
  await workPanel.getByRole("button", { name: "직원 추가" }).click();
  await workPanel.getByLabel("직원 (매니저 / 팀원)").click();
  await page.getByRole("option", { name: new RegExp(EMPLOYEE_NAME) }).click();
  await replaceControlValue(workPanel.getByLabel("특이사항 (선택)"), "야근");
  await replaceControlValue(
    workPanel.locator("#labor-hq-edit-reason"),
    "급여 원본 보완",
  );
  await workPanel.getByRole("button", { name: "급여 저장" }).click();
  await expect(
    workPanel
      .getByRole("status")
      .filter({ hasText: "급여 항목 1건을 저장했습니다." }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const current = await prisma.ledgerLaborItem.count({
        where: { dailyLedgerId: ledger.id },
      });

      return current;
    })
    .toBe(1);

  const savedLedger = await prisma.dailyLedger.findUniqueOrThrow({
    where: { id: ledger.id },
    include: {
      ledgerExpenses: true,
      ledgerPurchaseItems: true,
      ledgerInventoryItems: true,
      ledgerLossItems: true,
      ledgerLaborItems: true,
    },
  });
  const auditActions = await prisma.auditLog.findMany({
    where: { targetType: "DailyLedger", targetId: ledger.id },
    select: {
      action: true,
      actorId: true,
      before: true,
      after: true,
      reason: true,
    },
  });

  expect(savedLedger.totalSalesAmount).toBe(45000);
  expect(savedLedger.cashAmount).toBe(12000);
  expect(savedLedger.cardAmount).toBe(25000);
  expect(savedLedger.otherPaymentAmount).toBe(5000);
  expect(savedLedger.workerCount).toBe(1);
  expect(savedLedger.workMemo).toBe("본사 보완");
  expect(savedLedger.updatedById).toBe(actorId);
  expect(savedLedger.submittedById).toBeNull();
  expect(savedLedger.submittedAt).toBeNull();
  expect(savedLedger.ledgerExpenses[0]?.amount).toBe(3000);
  expect(savedLedger.ledgerPurchaseItems[0]?.quantity.toString()).toBe("3");
  expect(savedLedger.ledgerInventoryItems[0]?.currentQuantity?.toString()).toBe(
    "14.25",
  );
  expect(savedLedger.ledgerLossItems[0]?.reason).toBe("본사 손실 확인");
  expect(savedLedger.ledgerLaborItems[0]?.workerName).toBe(EMPLOYEE_NAME);
  expect(savedLedger.ledgerLaborItems[0]?.amount).toBe(EMPLOYEE_DAILY_WAGE);
  expect(savedLedger.ledgerLaborItems[0]?.specialMemo).toBe("야근");
  expect(auditActions.map((entry) => entry.action)).toEqual(
    expect.arrayContaining([
      "ledger.hq.sales_payment.updated",
      "ledger.hq.expenses.saved",
      "ledger.hq.purchases.saved",
      "ledger.hq.inventory.saved",
      "ledger.hq.losses.saved",
      "ledger.hq.work_info.saved",
      "ledger.hq.labor.saved",
    ]),
  );
  expect(auditActions.every((entry) => entry.actorId === actorId)).toBe(true);
  expect(auditActions.every((entry) => entry.before && entry.after)).toBe(true);
  expect(auditActions.map((entry) => entry.reason)).toEqual(
    expect.arrayContaining([
      "매출 결제 원본 보완",
      "지출 원본 보완",
      "매입 원본 보완",
      "재고 원본 보완",
      "손실 원본 보완",
      "근무 원본 보완",
      "급여 원본 보완",
    ]),
  );
});

test("본사는 이카운트 매입 수량을 고치고 등록 품목을 삭제할 수 있다", async ({
  page,
}) => {
  const { ledger, product, importLine, relatedImportLine, relatedPurchase } =
    await seedEditableEcountPurchaseData();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);
  await page.getByRole("tab", { name: "매입" }).click();

  const purchasePanel = page
    .getByRole("tabpanel")
    .filter({ hasText: "매입 항목" });
  const quantityInput = purchasePanel.getByLabel("수량");
  await expect(quantityInput).toBeEnabled();
  await replaceControlValue(quantityInput, "4");
  await fillHqEditReason(purchasePanel, "이카운트 수량 보완");
  await purchasePanel.getByRole("button", { name: "저장" }).click();

  await expect
    .poll(async () => {
      const current = await prisma.ledgerPurchaseItem.findFirst({
        where: { dailyLedgerId: ledger.id, productId: product.id },
        select: { quantity: true },
      });

      return current?.quantity.toString();
    })
    .toBe("4");

  const deleteButton = purchasePanel.getByRole("button", {
    name: "항목 1 삭제",
  });
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();
  await fillHqEditReason(purchasePanel, "잘못 등록된 매입 삭제");
  await purchasePanel.getByRole("button", { name: "저장" }).click();

  await expect
    .poll(() =>
      prisma.ledgerPurchaseItem.count({
        where: { dailyLedgerId: ledger.id },
      }),
    )
    .toBe(0);
  await expect
    .poll(async () => {
      const source = await prisma.ecountImportLine.findUnique({
        where: { id: importLine.id },
        select: { ledgerPurchaseItemId: true },
      });

      return source?.ledgerPurchaseItemId;
    })
    .toBeNull();
  await expect
    .poll(async () => {
      const relatedSource = await prisma.ecountImportLine.findUnique({
        where: { id: relatedImportLine.id },
        select: { ledgerPurchaseItemId: true },
      });

      return relatedSource?.ledgerPurchaseItemId;
    })
    .toBe(relatedPurchase.id);
});

// WO-02(2026-06-28): 본사 장부 상세 탭이 URL ?tab= 과 연결되고, 기존 쿼리를 보존하며,
// 딥링크/뒤로가기에서 탭 상태가 유지·복원된다.
test("본사 장부 상세 탭은 URL ?tab=와 연결되고 딥링크/뒤로가기에서 유지된다", async ({
  page,
}) => {
  const { ledger } = await seedEditableStoryData();

  await loginAsHq(page);
  // 딥링크로 손실 탭을 직접 연다.
  await page.goto(
    `/app/ledgers/${ledger.id}?date=today&sort=priority&filter=all&tab=losses`,
  );
  await expect(
    page.getByRole("tabpanel").filter({ hasText: "손실 항목" }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");

  // 매입 탭을 누르면 URL이 tab=purchases로 바뀌고 기존 쿼리(date/sort/filter)는 보존된다.
  await page.getByRole("tab", { name: "매입" }).click();
  await expect(page).toHaveURL(/[?&]tab=purchases\b/);
  await expect(page).toHaveURL(/[?&]date=today\b/);
  await expect(page).toHaveURL(/[?&]sort=priority\b/);
  await expect(page).toHaveURL(/[?&]filter=all\b/);

  // WO-12(2026-06-28): 본사 매입 화면은 원본 이카운트 단가와 적용 단가 보정 표시를 보여준다.
  const purchasePanel = page
    .getByRole("tabpanel")
    .filter({ hasText: "매입 단가" });
  await expect(purchasePanel).toContainText("원본 이카운트 단가");
  await expect(purchasePanel).toContainText("적용 단가 보정됨");

  // 뒤로가기는 손실 탭으로 되돌아간다.
  await page.goBack();
  await expect(page).toHaveURL(/[?&]tab=losses\b/);
  await expect(
    page.getByRole("tabpanel").filter({ hasText: "손실 항목" }),
  ).toBeVisible();
});

test("본사 장부 상세 탭을 클릭하면 6개 입력 섹션 카드로 각각 이동한다", async ({
  page,
}) => {
  const ledger = await seedClosedStoryData();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);

  const tabList = page.getByRole("tablist", { name: "장부 입력 섹션" });
  await expect(tabList).toBeVisible();

  for (const [value, label] of [
    ["purchases", "매입"],
    ["losses", "손실"],
    ["inventory", "재고"],
    ["expenses", "지출"],
    ["work", "근무"],
    ["sales", "매출/결제"],
  ] as const) {
    await tabList.evaluate((element) => {
      element.scrollIntoView({ block: "center" });
    });

    await page.getByRole("tab", { name: label, exact: true }).click();

    const panel = page.locator(`[data-ledger-detail-panel="${value}"]`);
    await expect(panel).toBeVisible();
    await expect
      .poll(() =>
        panel.evaluate((element) => {
          const bounds = element.getBoundingClientRect();

          return bounds.top < window.innerHeight && bounds.bottom > 0;
        }),
      )
      .toBe(true);
  }
});

test("HQ_ADMIN은 마감 장부 상세에서 마감 상태 유지 안내와 함께 원본 입력을 수정할 수 있다", async ({
  page,
}) => {
  const ledger = await seedClosedStoryData();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);

  // DESIGN.md D7: 마스터는 차단 안내 대신 마감 상태 유지 안내를 본다.
  await expect(page.getByText("마감 상태 유지 · 마스터 수정")).toBeVisible();
  await expect(
    page.getByText("이 장부의 업무 내용을 수정할 수 있습니다."),
  ).toBeVisible();
  await expect(page.getByText("본사 마감된 장부", { exact: true })).toHaveCount(
    0,
  );
  const reviewSummary = page.getByRole("region", { name: "검토 상태 요약" });
  await expect(reviewSummary.getByText("본사 마감 정보")).toBeVisible();
  await expect(reviewSummary.getByText("본사 관리자")).toBeVisible();
  await expect(
    reviewSummary.getByText(
      formatKstDateTimeForTest(new Date("2026-06-11T06:30:00.000Z")),
    ),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "정정 기록" })).toBeVisible();
  await expect(
    page.getByText("원본 장부 값은 보존하고 정정 이력만 추가합니다."),
  ).toBeVisible();
  await expect(page.getByLabel("총매출", { exact: true })).toBeEnabled();

  await page.getByRole("tab", { name: "근무" }).click();
  await expect(page.getByLabel("특이사항 메모", { exact: true })).toBeEnabled();

  // Non-goal: 재마감 절차는 없으므로 마감 다이얼로그 버튼이 다시 노출되지 않는다.
  await expect(page.getByRole("button", { name: "본사 마감" })).toHaveCount(0);
});

test("HQ_ADMIN이 마감 장부의 매출/결제를 수정해도 마감 상태와 최초 마감 정보가 유지된다", async ({
  page,
}) => {
  const ledger = await seedClosedStoryData();
  const beforeClosed = await prisma.dailyLedger.findUniqueOrThrow({
    where: { id: ledger.id },
    select: { status: true, closedAt: true, closedById: true },
  });

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);
  await page.getByRole("tab", { name: "매출/결제" }).click();
  const salesPanel = page.getByRole("tabpanel").filter({ hasText: "총매출" });
  await replaceKrwControlValue(salesPanel.getByLabel("현금"), "5000");

  // 수정 사유 없이는 저장할 수 없다.
  await salesPanel.getByRole("button", { name: "저장" }).click();
  await expect(
    salesPanel.getByText("본사 수정 사유를 입력해 주세요."),
  ).toBeVisible();

  await fillHqEditReason(salesPanel, "마감 후 현금 오기입 정정");
  await salesPanel.getByRole("button", { name: "저장" }).click();
  await expect(
    salesPanel.getByText(
      "마감 장부 내용을 저장했습니다. 마감 상태는 유지됩니다.",
    ),
  ).toBeVisible();

  await expect
    .poll(async () =>
      prisma.dailyLedger.findUniqueOrThrow({
        where: { id: ledger.id },
        select: {
          status: true,
          closedAt: true,
          closedById: true,
          cashAmount: true,
        },
      }),
    )
    .toMatchObject({
      status: "HEADQUARTERS_CLOSED",
      closedAt: beforeClosed.closedAt,
      closedById: beforeClosed.closedById,
      cashAmount: 5000,
    });

  const audit = await prisma.auditLog.findFirst({
    where: {
      targetType: "DailyLedger",
      targetId: ledger.id,
      action: "ledger.hq.sales_payment.updated",
      reason: "마감 후 현금 오기입 정정",
    },
    select: { after: true, before: true, actorId: true },
  });
  expect(audit?.actorId).toBe(await getHeadquartersUserId());
  // DESIGN.md D8: before/after는 사용자에게 실제 적용된 유효값 기준이다.
  expect(audit?.before).toMatchObject({
    cashAmount: 4000,
    cardAmount: 6000,
    status: "HEADQUARTERS_CLOSED",
  });
  expect(audit?.after).toMatchObject({
    ledgerStatusAtEdit: "HEADQUARTERS_CLOSED",
    closedEdit: true,
    cashAmount: 5000,
  });
});

// DESIGN.md D9/D8: 활성 정정이 있는 마감 장부를 직접 수정하면 편집 폼은 정정
// 반영값으로 초기화되고, 감사 before/after에도 유효값이 기록되며 해당 정정은
// supersede된다.
test("마감 장부 직접 수정 시 편집 폼과 감사는 활성 정정 유효값을 기준으로 동작한다", async ({
  page,
}) => {
  const actorId = await getHeadquartersUserId();
  const ledger = await seedClosedStoryData();

  // 현금 4,000 → 4,500 활성 정정을 먼저 만든다.
  await prisma.correctionRecord.create({
    data: {
      dailyLedgerId: ledger.id,
      targetType: "PAYMENT_FIELD",
      targetId: ledger.id,
      fieldKey: "cashAmount",
      originalValue: { kind: "money", value: 4000, label: "현금" },
      previousAppliedValue: { kind: "money", value: 4000, label: "현금" },
      correctedValue: { kind: "money", value: 4500, label: "현금" },
      reason: STORY_MARKER,
      createdById: actorId,
    },
  });

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);
  await page.getByRole("tab", { name: "매출/결제" }).click();
  const salesPanel = page.getByRole("tabpanel").filter({ hasText: "총매출" });

  // 편집 폼은 원본 4,000원이 아니라 정정 반영값 4,500원으로 초기화된다.
  await expect(salesPanel.getByLabel("현금", { exact: true })).toHaveValue(
    "4,500",
  );

  // 카드만 바꿔 저장한다. 현금은 유효값 그대로 재저장돼야 한다.
  await replaceKrwControlValue(salesPanel.getByLabel("카드"), "7000");
  await fillHqEditReason(salesPanel, "정정 유효값 기준 직접 수정");
  await salesPanel.getByRole("button", { name: "저장" }).click();

  await expect
    .poll(async () =>
      prisma.dailyLedger.findUniqueOrThrow({
        where: { id: ledger.id },
        select: { cashAmount: true, cardAmount: true, status: true },
      }),
    )
    .toMatchObject({
      cashAmount: 4500,
      cardAmount: 7000,
      status: "HEADQUARTERS_CLOSED",
    });

  // 현금 정정은 supersede되고 이력은 보존된다.
  await expect
    .poll(async () => {
      const correction = await prisma.correctionRecord.findFirst({
        where: {
          dailyLedgerId: ledger.id,
          targetType: "PAYMENT_FIELD",
          fieldKey: "cashAmount",
        },
        select: { supersededAt: true },
      });

      return correction?.supersededAt ?? null;
    })
    .not.toBeNull();

  // 감사 before/after는 원본값이 아닌 유효값 기준이다.
  const audit = await prisma.auditLog.findFirst({
    where: {
      targetType: "DailyLedger",
      targetId: ledger.id,
      action: "ledger.hq.sales_payment.updated",
      reason: "정정 유효값 기준 직접 수정",
    },
    select: { before: true, after: true },
  });
  expect(audit?.before).toMatchObject({
    cashAmount: 4500,
    cardAmount: 6000,
  });
  expect(audit?.after).toMatchObject({
    cashAmount: 4500,
    cardAmount: 7000,
    ledgerStatusAtEdit: "HEADQUARTERS_CLOSED",
    closedEdit: true,
  });
});

// DESIGN.md D5/E2E1: 마감 장부에서도 기존 본사 편집 화면으로 근무·급여를 포함한
// 업무 항목을 수정할 수 있고, 마감 상태와 최초 마감 정보는 유지된다.
test("HQ_ADMIN이 마감 장부의 근무·급여를 기존 편집 화면에서 수정해도 마감 상태가 유지된다", async ({
  page,
}) => {
  const ledger = await seedClosedStoryData();
  const beforeClosed = await prisma.dailyLedger.findUniqueOrThrow({
    where: { id: ledger.id },
    select: { closedAt: true, closedById: true },
  });

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);
  await page.getByRole("tab", { name: "근무" }).click();
  const workPanel = page.getByRole("tabpanel").filter({ hasText: "근무 요약" });

  // 특이사항 수정(기존 근무 저장 경로 재사용).
  await replaceControlValue(
    workPanel.getByLabel("특이사항 메모"),
    "마감 후 근무 보완",
  );
  await replaceControlValue(
    workPanel.locator("#work-hq-edit-reason"),
    "마감 장부 근무 수정",
  );
  await workPanel.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    workPanel.getByText(
      "마감 장부 내용을 저장했습니다. 마감 상태는 유지됩니다.",
    ),
  ).toBeVisible();

  await expect
    .poll(async () =>
      prisma.dailyLedger.findUniqueOrThrow({
        where: { id: ledger.id },
        select: {
          workerCount: true,
          workMemo: true,
          status: true,
          closedAt: true,
          closedById: true,
        },
      }),
    )
    .toMatchObject({
      workMemo: "마감 후 근무 보완",
      status: "HEADQUARTERS_CLOSED",
      closedAt: beforeClosed.closedAt,
      closedById: beforeClosed.closedById,
    });

  // 급여 행 추가(기존 급여 저장 경로 재사용) 후에도 마감 상태가 유지된다.
  await workPanel.getByRole("button", { name: "직원 추가" }).click();
  await workPanel.getByLabel("직원 (매니저 / 팀원)").click();
  await page.getByRole("option", { name: new RegExp(EMPLOYEE_NAME) }).click();
  await replaceControlValue(
    workPanel.locator("#labor-hq-edit-reason"),
    "마감 장부 급여 수정",
  );
  await workPanel.getByRole("button", { name: "급여 저장" }).click();
  await expect(
    workPanel
      .getByRole("status")
      .filter({ hasText: "급여 항목 1건을 저장했습니다." }),
  ).toBeVisible();
  // DESIGN.md D7: 급여 저장에도 마감 유지 문구가 함께 표시된다.
  await expect(
    workPanel.getByRole("status").filter({
      hasText: "마감 장부 내용을 저장했습니다. 마감 상태는 유지됩니다.",
    }),
  ).toBeVisible();

  await expect
    .poll(async () => {
      const [count, current] = await Promise.all([
        prisma.ledgerLaborItem.count({ where: { dailyLedgerId: ledger.id } }),
        prisma.dailyLedger.findUniqueOrThrow({
          where: { id: ledger.id },
          select: { status: true, workerCount: true },
        }),
      ]);

      return {
        count,
        status: current.status,
        workerCount: current.workerCount,
      };
    })
    // 급여 행을 저장하면 근무인원도 그 수만큼 자동으로 맞춰진다.
    .toMatchObject({ count: 1, status: "HEADQUARTERS_CLOSED", workerCount: 1 });
});

test("마감 장부의 오래된 화면 저장은 충돌로 거부되고 서버 최신값이 유지된다", async ({
  page,
}) => {
  const actorId = await getHeadquartersUserId();
  const ledger = await seedClosedStoryData();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);
  await page.getByRole("tab", { name: "매출/결제" }).click();
  const salesPanel = page.getByRole("tabpanel").filter({ hasText: "총매출" });

  // 화면 로드 후 다른 곳에서 장부가 바뀌면(UpdatedAt 변동) stale token이 된다.
  await prisma.dailyLedger.update({
    where: { id: ledger.id },
    data: {
      cashAmount: 4444,
      updatedById: actorId,
      version: { increment: 1 },
    },
  });

  await replaceKrwControlValue(salesPanel.getByLabel("현금"), "5000");
  await fillHqEditReason(salesPanel, "stale 마감 장부 저장 확인");
  await salesPanel.getByRole("button", { name: "저장" }).click();

  const conflictDialog = page.getByRole("dialog", {
    name: "저장 충돌이 발생했습니다",
  });
  await expect(conflictDialog).toBeVisible();
  await expect(conflictDialog.getByText("매출/결제")).toBeVisible();

  const current = await prisma.dailyLedger.findUniqueOrThrow({
    where: { id: ledger.id },
    select: { status: true, cashAmount: true },
  });
  expect(current).toMatchObject({
    status: "HEADQUARTERS_CLOSED",
    cashAmount: 4444,
  });
  await expect
    .poll(async () =>
      prisma.auditLog.count({
        where: {
          targetType: "DailyLedger",
          targetId: ledger.id,
          action: "ledger.hq.sales_payment.updated",
          reason: "stale 마감 장부 저장 확인",
        },
      }),
    )
    .toBe(0);
});

test("본사 상세 매출 폼은 한국어 검증 오류와 첫 오류 포커스를 제공한다", async ({
  page,
}) => {
  const { ledger } = await seedEditableStoryData();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);

  const salesPanel = page.getByRole("tabpanel").filter({ hasText: "총매출" });
  const cashInput = salesPanel.getByLabel("현금", { exact: true });

  await expect(salesPanel).toBeVisible();
  await clearControlValue(cashInput);
  await salesPanel.getByRole("button", { name: "저장" }).click();

  await expect(
    salesPanel.getByText("현금은 0원 이상의 정수여야 합니다."),
  ).toBeVisible();
  await expect(cashInput).toBeFocused();
});

test("조회 전용 본사는 장부 상세를 볼 수 있지만 원본 입력 탭을 저장할 수 없다", async ({
  page,
}) => {
  const { ledger } = await seedEditableStoryData();

  await loginAsHqViewer(page);
  await page.goto(`/app/ledgers/${ledger.id}`);

  await expect(
    page.getByRole("heading", { name: "스토리4-3 검토대기점 장부 상세" }),
  ).toBeVisible();
  await expect(page.getByText("수정 action")).toBeVisible();
  await expect(page.getByText("조회 전용").first()).toBeVisible();
  await expect(page.getByRole("tab", { name: "매출/결제" })).toHaveCount(0);
  await expect(page.getByLabel("총매출")).toHaveCount(0);
  await expect(page.getByLabel("본사 수정 사유")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "본사 마감" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "저장" })).toHaveCount(0);
});

test("지점장 direct URL은 본사 ClosePreflight 상세 없이 차단된다", async ({
  page,
}) => {
  const { ledger } = await seedEditableStoryData();

  await loginAsStoreManager(page);
  await page.goto(`/app/ledgers/${ledger.id}`);

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "본사 마감" })).toHaveCount(0);
  await expect(page.getByText("ClosePreflight")).toHaveCount(0);
  await expect(page.getByText("영업 매출/결제")).toHaveCount(0);
  await expect(page.getByText("마감 확정")).toHaveCount(0);
});

test("stale token 본사 원본 저장은 충돌 정보를 보여주고 서버 최신값을 유지한다", async ({
  page,
}) => {
  const { actorId, ledger } = await seedEditableStoryData();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);

  const salesPanel = page.getByRole("tabpanel").filter({ hasText: "총매출" });
  await expect(salesPanel).toBeVisible();

  await prisma.dailyLedger.update({
    where: { id: ledger.id },
    data: {
      totalSalesAmount: 77777,
      cashAmount: 16000,
      cardAmount: 60000,
      otherPaymentAmount: 777,
      updatedById: actorId,
      version: { increment: 1 },
    },
  });

  await replaceKrwControlValue(salesPanel.getByLabel("현금"), "15000");
  await replaceKrwControlValue(salesPanel.getByLabel("카드"), "25000");
  await replaceKrwControlValue(
    salesPanel.getByLabel("기타 결제수단(온누리QR)"),
    "5000",
  );
  await fillHqEditReason(salesPanel, "stale 매출 저장 확인");
  await salesPanel.getByRole("button", { name: "저장" }).click();

  const conflictDialog = page.getByRole("dialog", {
    name: "저장 충돌이 발생했습니다",
  });
  await expect(conflictDialog).toBeVisible();
  await expect(conflictDialog.getByText("매출/결제")).toBeVisible();
  await expect(conflictDialog.getByText("본사 수정 중")).toBeVisible();
  await expect(conflictDialog.getByText("최신 상태 재확인 필요")).toBeVisible();
  await expect(conflictDialog.getByText("내 입력값").first()).toBeVisible();
  await expect(conflictDialog.getByText("서버 최신값").first()).toBeVisible();
  await expect(conflictDialog.getByText("총매출")).toBeVisible();
  await expect(conflictDialog.getByText("46000")).toBeVisible();
  await expect(conflictDialog.getByText("77777")).toBeVisible();
  await expect(
    conflictDialog.getByRole("button", { name: "최신값 다시 불러오기" }),
  ).toBeVisible();

  const current = await prisma.dailyLedger.findUniqueOrThrow({
    where: { id: ledger.id },
    select: {
      totalSalesAmount: true,
      cashAmount: true,
      cardAmount: true,
      otherPaymentAmount: true,
    },
  });
  expect(current).toEqual({
    totalSalesAmount: 77777,
    cashAmount: 16000,
    cardAmount: 60000,
    otherPaymentAmount: 777,
  });
  await expect
    .poll(async () =>
      prisma.auditLog.count({
        where: {
          targetType: "DailyLedger",
          targetId: ledger.id,
          action: "ledger.hq.sales_payment.updated",
          reason: "stale 매출 저장 확인",
        },
      }),
    )
    .toBe(0);
});

test("본사는 마감 버튼으로 장부를 본사 마감하고 이후 마스터는 마감 상태를 유지하며 수정할 수 있다", async ({
  page,
}) => {
  const { actorId, ledger, product } = await seedEditableStoryData();

  await loginAsHq(page);
  await page.goto(
    `/app/ledgers/${ledger.id}?date=today&sort=priority&filter=all`,
  );

  const closeButton = page.getByRole("button", { name: "본사 마감" });
  await expect(closeButton).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "장부를 마감합니다" }),
  ).not.toBeVisible();

  await closeButton.click();
  await expect(
    page.getByRole("heading", { name: "장부를 마감합니다" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "조건명" }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "상태" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "필요한 조치" }),
  ).toBeVisible();
  await expect(page.getByText("기준값 설정 전").first()).toBeVisible();
  await expect(page.getByText("확정 이상 감지")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "마감 확정", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "마감 확정" }).click();
  await expect(
    page.getByText("마감 요청이 실패했습니다.", { exact: false }),
  ).not.toBeVisible();

  await expect
    .poll(async () => {
      const current = await prisma.dailyLedger.findUnique({
        where: { id: ledger.id },
        select: {
          status: true,
          closedById: true,
          closedAt: true,
          updatedById: true,
        },
      });

      return current;
    })
    .toMatchObject({
      status: "HEADQUARTERS_CLOSED",
      closedById: actorId,
      updatedById: actorId,
    });

  await expect(page.getByText("마감 상태 유지 · 마스터 수정")).toBeVisible();
  const closedLedger = await prisma.dailyLedger.findUniqueOrThrow({
    where: { id: ledger.id },
    select: { closedAt: true },
  });
  expect(closedLedger.closedAt).not.toBeNull();
  const reviewSummary = page.getByRole("region", { name: "검토 상태 요약" });
  await expect(reviewSummary.getByText("본사 마감 정보")).toBeVisible();
  await expect(reviewSummary.getByText("본사 관리자")).toBeVisible();
  await expect(
    reviewSummary.getByText(formatKstDateTimeForTest(closedLedger.closedAt!)),
  ).toBeVisible();
  // DESIGN.md D5: LEDGER_CLOSED_EDIT를 가진 HQ_ADMIN은 마감 후에도 원본 입력이 가능하다.
  await expect(page.getByLabel("총매출", { exact: true })).toBeEnabled();

  await page.getByRole("tab", { name: "근무" }).click();
  await expect(page.getByLabel("특이사항 메모", { exact: true })).toBeEnabled();
  const correctionPanel = page.getByRole("region", { name: "정정 기록" });
  await expect(correctionPanel).toBeVisible();
  await expect(
    correctionPanel.getByText(
      "원본 장부 값은 보존하고 정정 이력만 추가합니다.",
    ),
  ).toBeVisible();
  await expect(correctionPanel.getByLabel("정정 대상")).toBeVisible();
  await expect(correctionPanel.getByLabel("정정값")).toBeVisible();
  await expect(correctionPanel.getByLabel("정정 사유")).toBeVisible();

  await expect
    .poll(async () => {
      const ledgerStatus = await prisma.auditLog.findFirst({
        where: {
          targetType: "DailyLedger",
          targetId: ledger.id,
          action: "ledger.hq.closed",
        },
        select: { before: true, after: true, actorId: true },
      });

      return ledgerStatus;
    })
    .toMatchObject({
      actorId,
    });

  const closedAudit = await prisma.auditLog.findFirst({
    where: {
      targetType: "DailyLedger",
      targetId: ledger.id,
      action: "ledger.hq.closed",
    },
    select: { before: true, after: true },
  });

  expect(closedAudit?.before).not.toBeNull();
  expect(closedAudit?.after).not.toBeNull();

  const reloadedLedger = await prisma.ledgerInventoryItem.findFirst({
    where: { dailyLedgerId: ledger.id, productId: product.id },
    select: { updatedAt: true },
  });

  expect(reloadedLedger?.updatedAt).toBeTruthy();
  expect(reloadedLedger?.updatedAt).not.toBe(null);
});

test("본사 마감 중복 요청은 감사 로그를 한 번만 남긴다", async ({
  page,
  context,
}) => {
  const { actorId, ledger } = await seedEditableStoryData();

  await loginAsHq(page);
  const secondPage = await context.newPage();
  const ledgerPath = `/app/ledgers/${ledger.id}?date=today&sort=priority&filter=all`;

  await Promise.all([page.goto(ledgerPath), secondPage.goto(ledgerPath)]);
  await page.getByRole("button", { name: "본사 마감" }).click();
  await secondPage.getByRole("button", { name: "본사 마감" }).click();
  await expect(
    page.getByRole("heading", { name: "장부를 마감합니다" }),
  ).toBeVisible();
  await expect(
    secondPage.getByRole("heading", { name: "장부를 마감합니다" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "마감 확정", exact: true }),
  ).toBeEnabled();
  await expect(
    secondPage.getByRole("button", { name: "마감 확정", exact: true }),
  ).toBeEnabled();

  await Promise.all([
    page.getByRole("button", { name: "마감 확정" }).click(),
    secondPage.getByRole("button", { name: "마감 확정" }).click(),
  ]);

  await expect
    .poll(async () => {
      const current = await prisma.dailyLedger.findUnique({
        where: { id: ledger.id },
        select: { status: true, closedById: true, closedAt: true },
      });

      return current;
    })
    .toMatchObject({
      status: "HEADQUARTERS_CLOSED",
      closedById: actorId,
    });

  await expect
    .poll(async () =>
      prisma.auditLog.count({
        where: {
          targetType: "DailyLedger",
          targetId: ledger.id,
          action: "ledger.hq.closed",
        },
      }),
    )
    .toBe(1);

  await secondPage.close();
});

test("stale token 본사 마감은 conflict dialog와 본사 수정 중 안내를 보여준다", async ({
  page,
}) => {
  const { actorId, ledger } = await seedEditableStoryData();

  await loginAsHq(page);
  await page.goto(
    `/app/ledgers/${ledger.id}?date=today&sort=priority&filter=all`,
  );

  await page.getByRole("button", { name: "본사 마감" }).click();
  await expect(
    page.getByRole("heading", { name: "장부를 마감합니다" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "마감 확정", exact: true }),
  ).toBeEnabled();

  await prisma.dailyLedger.update({
    where: { id: ledger.id },
    data: {
      workMemo: "본사 마감 전 다른 저장",
      updatedById: actorId,
      version: { increment: 1 },
    },
  });

  await page.getByRole("button", { name: "마감 확정" }).click();

  const conflictDialog = page.getByRole("dialog", {
    name: "저장 충돌이 발생했습니다",
  });
  await expect(conflictDialog).toBeVisible();
  await expect(conflictDialog.getByText("본사 마감").first()).toBeVisible();
  await expect(conflictDialog.getByText("본사 수정 중")).toBeVisible();
  await expect(
    conflictDialog.getByRole("button", { name: "최신값 다시 불러오기" }),
  ).toBeVisible();

  const current = await prisma.dailyLedger.findUniqueOrThrow({
    where: { id: ledger.id },
    select: { status: true, closedById: true, closedAt: true },
  });
  expect(current).toEqual({
    status: "IN_REVIEW",
    closedById: null,
    closedAt: null,
  });
  await expect
    .poll(async () =>
      prisma.auditLog.count({
        where: {
          targetType: "DailyLedger",
          targetId: ledger.id,
          action: "ledger.hq.closed",
        },
      }),
    )
    .toBe(0);
});

test("ClosePreflight 사유 필요 항목은 사유 입력 후 개별 마감을 허용한다", async ({
  page,
}) => {
  const ledger = await seedPreflightBlockedStoryData();

  await loginAsHq(page);
  await page.goto(`/app/ledgers/${ledger.id}`);
  await page.getByRole("button", { name: "본사 마감" }).click();

  await expect(
    page.getByRole("columnheader", { name: "조건명" }),
  ).toBeVisible();
  const salesRow = page
    .getByRole("row")
    .filter({ hasText: "영업 매출/결제" })
    .filter({ hasText: "기존 입력 단계에서 보완" })
    .first();
  await expect(salesRow).toBeVisible();
  await expect(salesRow.getByText("사유 필요")).toBeVisible();
  await expect(salesRow.getByText("기존 입력 단계에서 보완")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "사유 입력 필요" }),
  ).toBeDisabled();
  await expect(page.getByLabel("마감 예외 사유")).toBeVisible();

  await page
    .getByLabel("마감 예외 사유")
    .fill("필수 누락 항목은 검토 후 개별 마감으로 승인");
  const confirmCloseButton = page
    .getByRole("dialog", { name: "장부를 마감합니다" })
    .getByRole("button", { name: "마감 확정", exact: true });
  await expect(confirmCloseButton).toBeEnabled();
  await confirmCloseButton.focus();
  await page.keyboard.press("Enter");

  await expect(
    page.getByText("마감 요청이 실패했습니다.", { exact: false }),
  ).not.toBeVisible();
  // DESIGN.md D7: HQ_ADMIN은 마감 편집 권한이 있어 차단 안내 대신
  // 마감 상태 유지·마스터 수정 안내를 본다.
  await expect(
    page.getByText("마감 상태 유지 · 마스터 수정", { exact: true }),
  ).toBeVisible();

  await expect
    .poll(async () => {
      const current = await prisma.dailyLedger.findUnique({
        where: { id: ledger.id },
        select: { status: true },
      });

      return current?.status;
    })
    .toBe("HEADQUARTERS_CLOSED");

  const closedAudit = await prisma.auditLog.findFirst({
    where: {
      targetType: "DailyLedger",
      targetId: ledger.id,
      action: "ledger.hq.closed",
    },
    select: { reason: true, before: true, after: true },
  });

  expect(closedAudit?.reason).toBe(
    "필수 누락 항목은 검토 후 개별 마감으로 승인",
  );
  expect(closedAudit?.before).toMatchObject({
    preflight: {
      exceptionReason: "필수 누락 항목은 검토 후 개별 마감으로 승인",
    },
  });
  expect(closedAudit?.after).toMatchObject({
    preflight: {
      exceptionReason: "필수 누락 항목은 검토 후 개별 마감으로 승인",
    },
  });
});

test("본사 손실 수정은 1.25에서 1.26으로 Decimal 저장한다", async ({
  page,
}) => {
  const { actorId, ledger, product } = await seedEditableStoryData();
  const lossItem = await prisma.ledgerLossItem.findFirstOrThrow({
    where: { dailyLedgerId: ledger.id, productId: product.id },
  });

  await prisma.ledgerLossItem.update({
    where: { id: lossItem.id },
    data: { quantity: 1.25 },
  });

  await loginAsHq(page);
  await page.goto(
    `/app/ledgers/${ledger.id}?date=today&sort=priority&filter=all&tab=losses`,
  );

  const lossPanel = page.getByRole("tabpanel").filter({ hasText: "손실 항목" });
  await expect(lossPanel).toBeVisible();
  await replaceControlValue(lossPanel.getByLabel("박스단위 수량"), "1.26");
  await fillHqEditReason(lossPanel, "손실 수량 소수 보정");
  await lossPanel.getByRole("button", { name: "저장" }).click();

  await expect
    .poll(async () => {
      const current = await prisma.ledgerLossItem.findUnique({
        where: { id: lossItem.id },
        select: { quantity: true },
      });

      return current?.quantity.toString();
    })
    .toBe("1.26");

  const saved = await prisma.ledgerLossItem.findUniqueOrThrow({
    where: { id: lossItem.id },
    select: { quantity: true, updatedById: true },
  });
  expect(saved.quantity.toNumber()).toBe(1.26);
  expect(saved.updatedById).toBe(actorId);
});
