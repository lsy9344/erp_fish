import { Buffer } from "node:buffer";
import { deflateRawSync } from "node:zlib";

import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();

const STORE_ID = "store-meeting-0627-acceptance";
const PRODUCT_ID = "product-meeting-0627-acceptance";
const LONG_STOCK_CATEGORY = "미팅0627생물";
const ECOUNT_COLD_UPLOAD_FILE = "meeting-0627-cold-category.xlsx";
const ECOUNT_COLD_RAW_PRODUCT = "냉)미팅0627동태";
const ECOUNT_COLD_PRODUCT_SPEC = "1kg";
const ECOUNT_COLD_PRODUCT_LABEL = `${ECOUNT_COLD_RAW_PRODUCT} [${ECOUNT_COLD_PRODUCT_SPEC}]`;
const ECOUNT_HEADER_ROW = [
  "일자-No.",
  "거래처명",
  "품목명(규격)",
  "수량",
  "단가",
  "공급가액",
  "부가세",
  "합계",
];

test.beforeEach(async () => {
  await cleanupMeetingAcceptanceData();
  await seedMeetingAcceptanceData();
});

test.afterAll(async () => {
  await cleanupMeetingAcceptanceData();
  await prisma.$disconnect();
});

test("회의 0627 본사 화면은 이중 매출, 검토 페이지, Excel export 진입점을 제공한다", async ({
  page,
}) => {
  await login(page, "hq@example.com");

  await page.goto("/app/dashboard?date=today");
  const dashboardRow = page.getByTestId(`hq-dashboard-row-${STORE_ID}`);
  await expect(dashboardRow).toContainText("미팅0627 검증점");
  // 장부 셀 매핑(ledger-cell-mapping-review): 장부 매출=C5(C22+C23+C24+C36),
  // 분석 매출=AE4(AI36+AI63+AI76). 둘을 한 셀에 위/아래로 노출한다.
  await expect(dashboardRow).toContainText("₩80,000");
  await expect(dashboardRow).toContainText("분석");
  await expect(dashboardRow).toContainText("₩96,000");

  await page.goto("/app/reports/daily?date=today");
  await expect(
    page.getByRole("heading", { name: "아침 회의 리포트" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "품목 검토" })).toBeVisible();
  await expect(page.getByRole("link", { name: "매출 검토" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Excel" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "품목별 판매 현황" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "판매수량" }),
  ).toBeVisible();

  await page.goto("/app/reports/product-review?date=today");
  await expect(
    page.getByRole("heading", { name: "품목 검토 (추정)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "품목별 판매 현황 (추정)" }),
  ).toBeVisible();

  await page.goto("/app/reports/sales-review?date=today");
  await expect(
    page.getByRole("heading", { name: "매출 검토 (추정)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "지점별 영업 매출 합계·마진율" }),
  ).toBeVisible();
});

test("회의 0627 이카운트 상세는 원본 enum 대신 한글 상태를 보여준다", async ({
  page,
}) => {
  const batch = await prisma.ecountImportBatch.findFirstOrThrow({
    where: { fileHash: "e2e-ecount-supply-fixture" },
    select: { id: true },
  });

  await login(page, "hq@example.com");
  await page.goto(`/app/ecount-imports/${batch.id}`);

  await expect(page.getByText("반영됨").first()).toBeVisible();
  const visibleText = await page.locator("main").innerText();
  for (const rawStatus of [
    "COMMITTED",
    "READY",
    "MAPPING_REQUIRED",
    "VOIDED",
    "FAILED",
  ]) {
    expect(visibleText).not.toContain(rawStatus);
  }
});

test("회의 0627 이카운트 신규 냉동 품목은 기준자료 규칙대로 분류된다", async ({
  page,
}) => {
  const workbook = createEcountColdCategoryWorkbook();

  await login(page, "hq@example.com");
  await page.goto("/app/ecount-imports");
  await setEcountUploadFile(page, {
    name: ECOUNT_COLD_UPLOAD_FILE,
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: workbook,
  });
  await page.getByRole("button", { name: "업로드", exact: true }).click();

  await expect(page).toHaveURL(/\/app\/ecount-imports\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "매핑 필요" })).toBeVisible();

  const categorySelect = page.getByLabel(
    `${ECOUNT_COLD_PRODUCT_LABEL} 새 품목 분류`,
  );
  const productRow = categorySelect.locator("xpath=ancestor::tr[1]");
  await expect(productRow).toContainText(ECOUNT_COLD_PRODUCT_SPEC);
  await expect(categorySelect).toHaveValue("냉동");
});

test("회의 0627 지점장 화면은 급여액과 전날재고 민감 금액을 숨긴다", async ({
  page,
}) => {
  await login(page, "manager@example.com");

  await page.goto(`/app/store-entry?storeId=${STORE_ID}&step=work`);
  await page.getByRole("button", { name: "직원 추가" }).click();
  await expect(page.getByLabel("급여 금액")).toHaveCount(0);
  const laborSection = page.locator("section").filter({ hasText: "근무자" });
  await expect(laborSection).not.toContainText("급여 / 인건비");
  await expect(laborSection).not.toContainText("급여 합계");
  await expect(laborSection).not.toContainText("급여 행 기준 참고 인원");

  await page.goto(`/app/store-entry/inventory?storeId=${STORE_ID}`);
  await page.getByRole("button", { name: "전날 재고 보기" }).click();

  const dialog = page.getByRole("dialog", { name: "전날 재고 보기" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("미팅0627 갈치");
  await expect(dialog).toContainText("1kg");
  await expect(dialog).toContainText("13");
  await expect(dialog).not.toContainText("777,777");
  await expect(dialog).not.toContainText("9,888,888");
  await expect(dialog).not.toContainText("원");
  await expect(dialog.getByRole("link")).toHaveCount(0);
});

test("회의 0627 본사 전용 관리와 월간 xlsx 5시트 export를 검증한다", async ({
  page,
}) => {
  await login(page, "hq@example.com");

  await page.goto("/app/labor/employees");
  await expect(page.locator("body")).toContainText(/404|찾을 수|not found/i);
  await expect(page.getByText("직원별 월간 급여 롤업")).toHaveCount(0);

  await page.goto("/app/master-data/long-stock-thresholds");
  await expect(
    page.getByRole("heading", { name: "장기재고 기준일" }),
  ).toBeVisible();
  await page.getByLabel("품목군").fill(LONG_STOCK_CATEGORY);
  await page.getByLabel("기준일 (일 이상)").fill("4");
  await page.getByLabel("변경 사유").fill("회의 0627 장기재고 기준 검증");
  await page.getByRole("button", { name: "기준일 저장" }).click();
  await expect(page.getByText("장기재고 기준일을 저장했습니다.")).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: LONG_STOCK_CATEGORY }),
  ).toContainText("4일");
  await expect(
    prisma.auditLog.count({
      where: { targetType: "LongStockThresholdSetting" },
    }),
  ).resolves.toBeGreaterThan(0);

  const response = await page.request.get(
    `/api/reports/export?${new URLSearchParams({
      report: "monthly",
      month: getCurrentMonthInput(),
      format: "xlsx",
    }).toString()}`,
  );
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const bytes = new Uint8Array(await response.body());
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  await workbook.xlsx.load(arrayBuffer);

  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
    "요약",
    "기간조회_RAW",
    "월별손익",
    "재고현황",
    "품목매출",
  ]);
});

test("회의 0627 본사 전용 페이지는 지점장에게 막힌다", async ({ page }) => {
  await login(page, "manager@example.com");

  for (const path of [
    "/app/reports/product-review?date=today",
    "/app/reports/sales-review?date=today",
    "/app/master-data/long-stock-thresholds",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/app\/unauthorized/);
    await expect(
      page.getByRole("heading", { name: "접근 권한이 없습니다." }),
    ).toBeVisible();
  }

  await page.goto("/app/labor/employees");
  await expect(page.locator("body")).toContainText(/404|찾을 수|not found/i);
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("로그인 식별자").fill(email);
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

async function setEcountUploadFile(
  page: Page,
  uploadFile: {
    name: string;
    mimeType: string;
    buffer: Buffer;
  },
) {
  const fileInput = page.getByLabel("이카운트 엑셀 파일");
  await expect(fileInput).toBeAttached();
  await page.waitForLoadState("networkidle");

  let selectedFile: { name: string; size: number; type: string } | null = null;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await fileInput.setInputFiles(uploadFile);
    selectedFile = await fileInput.evaluate((input) => {
      const file = (input as HTMLInputElement).files?.[0];

      return file
        ? { name: file.name, size: file.size, type: file.type }
        : null;
    });

    if (selectedFile?.name === uploadFile.name && selectedFile.size > 0) {
      break;
    }

    await page.waitForTimeout(250);
  }

  expect(selectedFile).toMatchObject({
    name: uploadFile.name,
    type: uploadFile.mimeType,
  });
  expect(selectedFile?.size).toBeGreaterThan(0);
}

async function seedMeetingAcceptanceData() {
  const hqUserId = await getUserId("hq@example.com");
  const managerId = await getUserId("manager@example.com");
  const today = getTodayKstMidnight();
  const yesterday = addDays(today, -1);

  const store = await prisma.store.create({
    data: {
      id: STORE_ID,
      name: "미팅0627 검증점",
      isActive: true,
      updatedById: hqUserId,
    },
  });
  await prisma.userStoreAssignment.create({
    data: {
      userId: managerId,
      storeId: store.id,
    },
  });

  const product = await prisma.product.create({
    data: {
      id: PRODUCT_ID,
      name: "미팅0627 갈치",
      category: "생물",
      spec: "1kg",
      defaultUnitPrice: 777_777,
      isActive: true,
      updatedById: hqUserId,
    },
  });

  const previousLedger = await prisma.dailyLedger.create({
    data: {
      storeId: store.id,
      closingDate: yesterday,
      status: "HEADQUARTERS_CLOSED",
      totalSalesAmount: 50_000,
      cashAmount: 50_000,
      cardAmount: 0,
      otherPaymentAmount: 0,
      workerCount: 1,
      createdById: hqUserId,
      updatedById: hqUserId,
      closedById: hqUserId,
      closedAt: new Date(),
    },
  });
  const previousInventoryItem = await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: previousLedger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: 777_777,
      previousQuantity: 4,
      purchasedQuantity: 9,
      currentQuantity: 13,
      quantity: 13,
      inventoryAmount: 9_888_888,
      isModified: true,
      carryoverSource: "MANUAL",
      carryoverStatus: "DATA_INSUFFICIENT",
      createdById: hqUserId,
      updatedById: hqUserId,
    },
  });
  await prisma.ledgerInventoryFifoLot.create({
    data: {
      dailyLedgerId: previousLedger.id,
      ledgerInventoryItemId: previousInventoryItem.id,
      productId: product.id,
      sourceType: "PURCHASE",
      unitPrice: 777_777,
      originalQuantity: 13,
      consumedQuantity: 0,
      remainingQuantity: 13,
      originalAmount: 9_888_888,
      consumedAmount: 0,
      remainingAmount: 9_888_888,
      sortOrder: 1,
      sourceBusinessDate: yesterday,
    },
  });

  const todayLedger = await prisma.dailyLedger.create({
    data: {
      storeId: store.id,
      closingDate: today,
      status: "IN_REVIEW",
      totalSalesAmount: 80_000,
      cashAmount: 40_000,
      cardAmount: 40_000,
      otherPaymentAmount: 0,
      workerCount: 2,
      createdById: hqUserId,
      updatedById: hqUserId,
      submittedById: managerId,
      submittedAt: new Date(),
    },
  });
  const purchase = await prisma.ledgerPurchaseItem.create({
    data: {
      dailyLedgerId: todayLedger.id,
      productId: product.id,
      sourceType: "MANUAL",
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: 6_000,
      quantity: 10,
      amount: 60_000,
      createdById: hqUserId,
      updatedById: hqUserId,
    },
  });
  const inventory = await prisma.ledgerInventoryItem.create({
    data: {
      dailyLedgerId: todayLedger.id,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productSpec: product.spec,
      unitPrice: 6_000,
      previousQuantity: 13,
      purchasedQuantity: 10,
      currentQuantity: 15,
      quantity: 15,
      inventoryAmount: 90_000,
      isModified: true,
      carryoverSource: "PREVIOUS_CLOSED_LEDGER",
      carryoverStatus: "PREVIOUS_CARRYOVER",
      carryoverLedgerId: previousLedger.id,
      createdById: hqUserId,
      updatedById: hqUserId,
    },
  });
  await prisma.ledgerInventoryFifoLot.create({
    data: {
      dailyLedgerId: todayLedger.id,
      ledgerInventoryItemId: inventory.id,
      productId: product.id,
      sourceType: "PURCHASE",
      sourcePurchaseItemId: purchase.id,
      unitPrice: 6_000,
      originalQuantity: 10,
      consumedQuantity: 2,
      remainingQuantity: 8,
      originalAmount: 60_000,
      consumedAmount: 12_000,
      remainingAmount: 48_000,
      sortOrder: 1,
      sourceBusinessDate: today,
    },
  });
  await prisma.storeSalesPricePlan.create({
    data: {
      storeId: store.id,
      businessDate: today,
      productId: product.id,
      plannedUnitPrice: 12_000,
      memo: "회의 0627 분석 매출 검증",
      createdById: hqUserId,
      updatedById: hqUserId,
    },
  });
}

async function cleanupMeetingAcceptanceData() {
  const ledgers = await prisma.dailyLedger.findMany({
    where: { storeId: STORE_ID },
    select: { id: true },
  });
  const ledgerIds = ledgers.map((ledger) => ledger.id);

  if (ledgerIds.length > 0) {
    const correctionRecords = await prisma.correctionRecord.findMany({
      where: { dailyLedgerId: { in: ledgerIds } },
      select: { id: true },
    });
    const correctionRecordIds = correctionRecords.map((record) => record.id);

    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { targetType: "DailyLedger", targetId: { in: ledgerIds } },
          {
            targetType: "CorrectionRecord",
            targetId: { in: correctionRecordIds },
          },
        ],
      },
    });
    await prisma.correctionRecord.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.ledgerInventoryFifoLot.deleteMany({
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
    await prisma.ledgerLossItem.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.ledgerExpense.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.ledgerLaborItem.deleteMany({
      where: { dailyLedgerId: { in: ledgerIds } },
    });
    await prisma.dailyLedger.deleteMany({
      where: { id: { in: ledgerIds } },
    });
  }

  await prisma.auditLog.deleteMany({
    where: { targetType: "LongStockThresholdSetting" },
  });
  await prisma.longStockThresholdSetting.deleteMany({
    where: { category: LONG_STOCK_CATEGORY },
  });
  await prisma.ecountImportBatch.deleteMany({
    where: { fileName: ECOUNT_COLD_UPLOAD_FILE },
  });
  await prisma.storeSalesPricePlan.deleteMany({
    where: { storeId: STORE_ID },
  });
  await prisma.userStoreAssignment.deleteMany({
    where: { storeId: STORE_ID },
  });
  await prisma.store.deleteMany({
    where: { id: STORE_ID },
  });
  await prisma.product.deleteMany({
    where: { id: PRODUCT_ID },
  });
}

async function getUserId(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  expect(user?.id).toBeTruthy();

  return user!.id;
}

function getTodayKstMidnight(inputDate = new Date()) {
  const [yearText, monthText, dayText] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(inputDate)
    .split("-");

  return new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)),
  );
}

function getCurrentMonthInput() {
  return getTodayKstMidnight().toISOString().slice(0, 7);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

type WorkbookCell = string | number | null | undefined;

function createEcountColdCategoryWorkbook() {
  const quantity = 3;
  const unitPrice = 5_000;
  const supplyAmount = quantity * unitPrice;
  const dateNo = `2026/06/29-${Date.now()}`;

  return createWorkbook([
    ["판매현황"],
    ECOUNT_HEADER_ROW,
    [
      dateNo,
      "E2E강남점",
      ECOUNT_COLD_PRODUCT_LABEL,
      quantity,
      unitPrice,
      supplyAmount,
      null,
      supplyAmount,
    ],
  ]);
}

function createWorkbook(rows: WorkbookCell[][]) {
  return createZip([
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="판매현황" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    ["xl/worksheets/sheet1.xml", sheetXml(rows)],
  ]);
}

function sheetXml(rows: WorkbookCell[][]) {
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;

          if (value === null || value === undefined) {
            return `<c r="${ref}"></c>`;
          }

          if (typeof value === "number") {
            return `<c r="${ref}"><v>${value}</v></c>`;
          }

          return `<c r="${ref}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
        })
        .join("");

      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function createZip(entries: [string, string][]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, text] of entries) {
    const nameBuffer = Buffer.from(name, "utf8");
    const raw = Buffer.from(text, "utf8");
    const compressed = deflateRawSync(raw);
    const local = Buffer.alloc(30);

    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, nameBuffer, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);

    offset += local.length + nameBuffer.length + compressed.length;
  }

  const centralStart = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function columnName(index: number) {
  let value = "";
  let current = index;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - 1) / 26);
  }

  return value;
}

function xml(value: WorkbookCell) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
