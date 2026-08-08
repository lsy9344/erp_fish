import "./_loadenv.mjs";

import { PrismaClient } from "../generated/prisma/index.js";
import { writeAuditLog } from "../src/server/audit.ts";
import { refreshLedgerInventoryFifoLots } from "../src/features/inventory/fifo-lots.ts";
import {
  decimalToNumber,
  nullableDecimalToNumber,
} from "../src/lib/decimal.ts";

const STORE_ID = "cmqs3j6gr0029jrdwbtwrhwuv";
const STORE_NAME = "강서수산";
const ACTOR_EMAIL = "admin@example.com";
const LIVE_OCTOPUS_PRODUCT_ID = "cmr1ku1tz0047l204e0n2o2mj";
const CLAM_PRODUCT_ID = "cmqvm00go0011l104izqwnziu";
const PURCHASE_ID = "cms8rhuu0000nl404xarbbxi8";
const ECOUNT_LINE_ID = "cms85g96a003jla04qyrxyqnt";
const LEDGER_IDS = {
  "2026-07-31": "cms85gd2y002nl704s1oldmf7",
  "2026-08-01": "cms9or5hq0024l504v7caqtsj",
  "2026-08-03": "cmsciv10x001yl104n7u4l1ds",
};
const EXPECTED_VERSIONS = {
  "2026-07-31": 9,
  "2026-08-01": 10,
  "2026-08-03": 10,
};
const REPAIR_AUDIT_ACTION = "ledger.repair.gangseo_0803_fifo.applied";
const APPROVED_DATABASE_HOST =
  "ep-falling-truth-atgi63gf.c-9.us-east-1.aws.neon.tech";
const REPAIR_REASON =
  "강서수산 2026-08-03 엑셀 대조 FIFO 보정: 활문어 적용 단가·생합 재고 수량";
const EXPECTED = {
  purchaseUnitPrice: 14_000,
  purchaseAmount: 28_000,
  purchaseQuantity: 2,
  sourceUnitPrice: 14_000,
  ecountUnitPrice: 14_000,
  clamQuantity: 0.9,
  currentFallbackCogs: 1_612_170,
  currentFifoCogs: 1_622_480,
  currentFallbackInventory: 2_563_140,
  currentFifoInventory: 2_537_530,
  expectedSales: 2_267_000,
  expectedCogs: 1_627_730,
  expectedGrossProfit: 639_270,
  expectedFifoInventory: 2_537_080,
  repairedClamQuantity: 0.89,
};

function fail(message) {
  throw new Error(`PRECONDITION_FAILED: ${message}`);
}

function assertCondition(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function asNullableNumber(value) {
  return value === null || value === undefined
    ? null
    : nullableDecimalToNumber(value);
}

function assertNumber(actual, expected, label) {
  assertCondition(
    actual === expected,
    `${label} expected ${expected}, received ${actual}`,
  );
}

function assertDate(actual, expected, label) {
  assertCondition(
    actual instanceof Date &&
      actual.toISOString() === `${expected}T00:00:00.000Z`,
    `${label} expected ${expected}, received ${actual?.toISOString?.() ?? actual}`,
  );
}

function parseOptions(argv) {
  const allowed = new Set(["--apply", "--confirm-remote-db", "--help"]);
  const unknown = argv.filter((arg) => !allowed.has(arg));

  if (unknown.length > 0) {
    throw new Error(`알 수 없는 옵션: ${unknown.join(", ")}`);
  }

  return {
    apply: argv.includes("--apply"),
    confirmRemoteDb: argv.includes("--confirm-remote-db"),
    help: argv.includes("--help"),
  };
}

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL_UNPOOLED;

  if (!url) {
    throw new Error("DATABASE_URL_UNPOOLED가 필요합니다.");
  }

  return url;
}

function getDatabaseHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    throw new Error(
      "DATABASE_URL_UNPOOLED가 올바른 PostgreSQL URL이 아닙니다.",
    );
  }
}

function isApprovedDatabaseHost(hostname) {
  return hostname === APPROVED_DATABASE_HOST;
}

function usage() {
  console.log(`사용법:
  node --experimental-strip-types scripts/repair-gangseo-0803-fifo.mjs
  node --experimental-strip-types scripts/repair-gangseo-0803-fifo.mjs --apply --confirm-remote-db

기본 동작은 읽기 전용 dry-run입니다. 운영 DB 쓰기에는 두 플래그가 모두 필요합니다.`);
}

function calculateFallbackTotals(items) {
  let cogs = 0;
  let inventory = 0;

  for (const item of items) {
    const currentQuantity =
      nullableDecimalToNumber(item.currentQuantity) ??
      nullableDecimalToNumber(item.quantity);

    assertCondition(
      currentQuantity !== null,
      `${item.productName} 현재 재고 수량이 없습니다.`,
    );

    cogs += Math.round(
      (decimalToNumber(item.previousQuantity) +
        decimalToNumber(item.purchasedQuantity) -
        currentQuantity) *
        item.unitPrice,
    );
    inventory += Math.round(currentQuantity * item.unitPrice);
  }

  return { cogs, inventory };
}

function calculateFifoTotals(items) {
  return items.reduce(
    (totals, item) => {
      for (const lot of item.fifoLots) {
        totals.cogs += lot.consumedAmount;
        totals.inventory += lot.remainingAmount;
      }
      return totals;
    },
    { cogs: 0, inventory: 0 },
  );
}

async function updateLedgerVersion(tx, { ledgerId, expectedVersion, actorId }) {
  const result = await tx.dailyLedger.updateMany({
    where: { id: ledgerId, version: expectedVersion },
    data: { updatedById: actorId, version: { increment: 1 } },
  });

  assertNumber(
    result.count,
    1,
    `${ledgerId} version ${expectedVersion} 동시 수정 감지`,
  );
}

async function verifyCommittedRepairState(tx) {
  const [ledger, purchase, clam] = await Promise.all([
    tx.dailyLedger.findUnique({
      where: { id: LEDGER_IDS["2026-08-03"] },
      select: {
        id: true,
        totalSalesAmount: true,
        carryoverSalesAmount: true,
        ledgerInventoryItems: {
          select: {
            id: true,
            productName: true,
            previousQuantity: true,
            purchasedQuantity: true,
            currentQuantity: true,
            quantity: true,
            inventoryAmount: true,
            fifoLots: {
              select: { consumedAmount: true, remainingAmount: true },
            },
          },
        },
      },
    }),
    tx.ledgerPurchaseItem.findUnique({
      where: { id: PURCHASE_ID },
      select: {
        quantity: true,
        unitPrice: true,
        amount: true,
        sourceUnitPrice: true,
        ecountImportLineId: true,
        ecountImportLine: { select: { unitPrice: true } },
      },
    }),
    tx.ledgerInventoryItem.findUnique({
      where: { id: "cmsdkclq4000ll704z6kr4j2i" },
      select: {
        currentQuantity: true,
        quantity: true,
        inventoryAmount: true,
      },
    }),
  ]);

  assertCondition(ledger !== null, "8/3 장부 최종 검증 대상이 없습니다.");
  assertCondition(purchase !== null, "활문어 매입 최종 검증 대상이 없습니다.");
  assertCondition(clam !== null, "생합 최종 검증 대상이 없습니다.");

  assertNumber(ledger.ledgerInventoryItems.length, 33, "8/3 최종 재고행 수");

  for (const item of ledger.ledgerInventoryItems) {
    const quantities = [
      asNullableNumber(item.currentQuantity),
      asNullableNumber(item.quantity),
    ].filter((value) => value !== null);
    const isZeroInventoryFlow =
      decimalToNumber(item.previousQuantity) === 0 &&
      decimalToNumber(item.purchasedQuantity) === 0 &&
      quantities.length > 0 &&
      quantities.every((value) => value === 0);

    assertCondition(
      item.fifoLots.length > 0 || isZeroInventoryFlow,
      `${item.productName}(${item.id}) 비제로 수량 흐름에 FIFO lot가 없습니다.`,
    );
  }

  const fifoTotals = calculateFifoTotals(ledger.ledgerInventoryItems);
  const sales = ledger.totalSalesAmount + ledger.carryoverSalesAmount;
  const grossProfit = sales - fifoTotals.cogs;
  const displayedMargin = `${((grossProfit / sales) * 100).toFixed(2)}%`;

  assertNumber(sales, EXPECTED.expectedSales, "8/3 매출");
  assertNumber(fifoTotals.cogs, EXPECTED.expectedCogs, "8/3 최종 FIFO 원가");
  assertNumber(
    fifoTotals.inventory,
    EXPECTED.expectedFifoInventory,
    "8/3 최종 FIFO 재고금액",
  );
  assertNumber(grossProfit, EXPECTED.expectedGrossProfit, "8/3 최종 매출이익");
  assertCondition(
    displayedMargin === "28.20%",
    `8/3 표시 이익률 expected 28.20%, received ${displayedMargin}`,
  );

  assertNumber(
    decimalToNumber(purchase.quantity),
    EXPECTED.purchaseQuantity,
    "활문어 최종 매입 수량",
  );
  assertNumber(purchase.unitPrice, 18_000, "활문어 최종 적용 단가");
  assertNumber(purchase.amount, 36_000, "활문어 최종 적용 금액");
  assertNumber(
    purchase.sourceUnitPrice,
    EXPECTED.sourceUnitPrice,
    "활문어 sourceUnitPrice 보존",
  );
  assertCondition(
    purchase.ecountImportLineId === ECOUNT_LINE_ID,
    "활문어 ECOUNT 원본 연결 보존",
  );
  assertCondition(
    purchase.ecountImportLine !== null,
    "활문어 ECOUNT 원본 line 최종 검증 대상이 없습니다.",
  );
  assertNumber(
    purchase.ecountImportLine.unitPrice,
    EXPECTED.ecountUnitPrice,
    "활문어 ECOUNT 원본 단가 보존",
  );

  assertNumber(
    nullableDecimalToNumber(clam.currentQuantity),
    EXPECTED.repairedClamQuantity,
    "생합 최종 당일재고",
  );
  assertNumber(
    nullableDecimalToNumber(clam.quantity),
    EXPECTED.repairedClamQuantity,
    "생합 최종 수량",
  );
  assertNumber(clam.inventoryAmount, 40_050, "생합 최종 재고금액");

  return {
    sales,
    cogs: fifoTotals.cogs,
    inventory: fifoTotals.inventory,
    grossProfit,
    displayedMargin,
  };
}

async function loadPlan(client) {
  const [
    store,
    actor,
    ledgers,
    purchase,
    clamItem,
    inventoryItems,
    correctionCounts,
    repairAudits,
  ] = await Promise.all([
    client.store.findUnique({
      where: { id: STORE_ID },
      select: { id: true, name: true },
    }),
    client.user.findUnique({
      where: { email: ACTOR_EMAIL },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        permissionProfiles: {
          select: {
            profile: {
              select: {
                code: true,
                actions: { select: { action: true } },
              },
            },
          },
        },
      },
    }),
    client.dailyLedger.findMany({
      where: { id: { in: Object.values(LEDGER_IDS) } },
      select: {
        id: true,
        storeId: true,
        closingDate: true,
        status: true,
        version: true,
        updatedAt: true,
        updatedById: true,
      },
      orderBy: { closingDate: "asc" },
    }),
    client.ledgerPurchaseItem.findUnique({
      where: { id: PURCHASE_ID },
      select: {
        id: true,
        dailyLedgerId: true,
        productId: true,
        productName: true,
        productSpec: true,
        sourceType: true,
        quantity: true,
        unitPrice: true,
        amount: true,
        sourceUnitPrice: true,
        ecountImportLineId: true,
        unitPriceOverrideReason: true,
        unitPriceUpdatedById: true,
        unitPriceUpdatedAt: true,
        ecountImportLine: {
          select: {
            id: true,
            rawProductName: true,
            productId: true,
            productName: true,
            productSpec: true,
            unitPrice: true,
            supplyAmount: true,
            totalAmount: true,
            status: true,
            rowNumber: true,
            dateNo: true,
            batchId: true,
          },
        },
      },
    }),
    client.ledgerInventoryItem.findUnique({
      where: { id: "cmsdkclq4000ll704z6kr4j2i" },
      select: {
        id: true,
        dailyLedgerId: true,
        productId: true,
        productName: true,
        productSpec: true,
        previousQuantity: true,
        purchasedQuantity: true,
        currentQuantity: true,
        quantity: true,
        unitPrice: true,
        inventoryAmount: true,
      },
    }),
    client.ledgerInventoryItem.findMany({
      where: { dailyLedgerId: LEDGER_IDS["2026-08-03"] },
      select: {
        id: true,
        productId: true,
        productName: true,
        previousQuantity: true,
        purchasedQuantity: true,
        currentQuantity: true,
        quantity: true,
        unitPrice: true,
        inventoryAmount: true,
        fifoLots: {
          select: { consumedAmount: true, remainingAmount: true },
        },
      },
    }),
    Promise.all(
      Object.values(LEDGER_IDS).map((dailyLedgerId) =>
        client.correctionRecord.count({ where: { dailyLedgerId } }),
      ),
    ),
    client.auditLog.count({
      where: {
        action: REPAIR_AUDIT_ACTION,
        targetId: { in: Object.values(LEDGER_IDS) },
      },
    }),
  ]);

  assertCondition(store !== null, `store ${STORE_ID}가 없습니다.`);
  assertCondition(actor !== null, `보정 actor ${ACTOR_EMAIL}가 없습니다.`);
  assertCondition(ledgers.length === 3, "대상 장부 3건이 모두 필요합니다.");
  assertCondition(purchase !== null, `purchase ${PURCHASE_ID}가 없습니다.`);
  assertCondition(clamItem !== null, "생합 대상 재고행이 없습니다.");

  const ledgerByDate = new Map(
    ledgers.map((ledger) => [
      ledger.closingDate.toISOString().slice(0, 10),
      ledger,
    ]),
  );
  return {
    store,
    actor,
    ledgers,
    ledgerByDate,
    purchase,
    clamItem,
    inventoryItems,
    correctionCounts,
    repairAudits,
    currentFallback: calculateFallbackTotals(inventoryItems),
    currentFifo: calculateFifoTotals(inventoryItems),
  };
}

function validatePlan(plan) {
  assertCondition(
    plan.store.name === STORE_NAME,
    "강서수산 store 이름이 다릅니다.",
  );
  assertCondition(plan.store.id === STORE_ID, "강서수산 store ID가 다릅니다.");
  assertCondition(
    plan.actor.isActive,
    `${ACTOR_EMAIL} actor가 비활성 상태입니다.`,
  );
  assertCondition(
    plan.actor.role === "HEADQUARTERS",
    `${ACTOR_EMAIL} actor가 본사 계정이 아닙니다.`,
  );
  const actions = new Set(
    plan.actor.permissionProfiles.flatMap((entry) =>
      entry.profile.actions.map((action) => action.action),
    ),
  );
  assertCondition(
    actions.has("LEDGER_CLOSED_EDIT"),
    `${ACTOR_EMAIL} actor에 LEDGER_CLOSED_EDIT 권한이 없습니다.`,
  );

  for (const [date, ledgerId] of Object.entries(LEDGER_IDS)) {
    const ledger = plan.ledgerByDate.get(date);
    assertCondition(ledger !== undefined, `${date} 장부가 없습니다.`);
    assertCondition(ledger.id === ledgerId, `${date} 장부 ID가 다릅니다.`);
    assertCondition(
      ledger.storeId === STORE_ID,
      `${date} 장부 지점이 다릅니다.`,
    );
    assertDate(ledger.closingDate, date, `${date} closingDate`);
    assertNumber(ledger.version, EXPECTED_VERSIONS[date], `${date} version`);
  }
  assertCondition(
    plan.ledgerByDate.get("2026-07-31").status === "HEADQUARTERS_CLOSED",
    "7/31 장부 상태가 HEADQUARTERS_CLOSED가 아닙니다.",
  );
  assertCondition(
    plan.ledgerByDate.get("2026-08-01").status === "IN_REVIEW",
    "8/1 장부 상태가 IN_REVIEW가 아닙니다.",
  );
  assertCondition(
    plan.ledgerByDate.get("2026-08-03").status === "IN_REVIEW",
    "8/3 장부 상태가 IN_REVIEW가 아닙니다.",
  );

  const purchase = plan.purchase;
  assertCondition(purchase.id === PURCHASE_ID, "활문어 매입 ID가 다릅니다.");
  assertCondition(
    purchase.dailyLedgerId === LEDGER_IDS["2026-07-31"],
    "활문어 매입의 장부가 7/31이 아닙니다.",
  );
  assertCondition(
    purchase.productId === LIVE_OCTOPUS_PRODUCT_ID,
    "활문어 productId가 다릅니다.",
  );
  assertCondition(
    purchase.productName === "활문어",
    "활문어 매입 품목명이 다릅니다.",
  );
  assertCondition(
    purchase.productSpec === "규격 없음",
    "활문어 매입 규격이 다릅니다.",
  );
  assertCondition(
    purchase.sourceType === "ECOUNT_UPLOAD",
    "활문어 매입 sourceType이 다릅니다.",
  );
  assertNumber(
    decimalToNumber(purchase.quantity),
    EXPECTED.purchaseQuantity,
    "활문어 매입 수량",
  );
  assertNumber(
    purchase.unitPrice,
    EXPECTED.purchaseUnitPrice,
    "활문어 적용 단가",
  );
  assertNumber(purchase.amount, EXPECTED.purchaseAmount, "활문어 매입 금액");
  assertNumber(
    purchase.sourceUnitPrice,
    EXPECTED.sourceUnitPrice,
    "활문어 sourceUnitPrice",
  );
  assertCondition(
    purchase.ecountImportLineId === ECOUNT_LINE_ID,
    "ECOUNT line ID가 다릅니다.",
  );
  assertCondition(
    purchase.unitPriceOverrideReason === null,
    "활문어 매입에 기존 단가 보정이 있습니다.",
  );
  assertCondition(
    purchase.unitPriceUpdatedById === null,
    "활문어 매입에 기존 단가 수정자가 있습니다.",
  );
  assertCondition(
    purchase.unitPriceUpdatedAt === null,
    "활문어 매입에 기존 단가 수정시각이 있습니다.",
  );

  const line = purchase.ecountImportLine;
  assertCondition(line !== null, "활문어 ECOUNT 원본 line이 없습니다.");
  assertCondition(
    line.id === ECOUNT_LINE_ID,
    "ECOUNT 원본 line ID가 다릅니다.",
  );
  assertCondition(
    line.rawProductName === "활문어",
    "ECOUNT 원본 품목명이 다릅니다.",
  );
  assertCondition(
    line.productId === LIVE_OCTOPUS_PRODUCT_ID,
    "ECOUNT 원본 productId가 다릅니다.",
  );
  assertCondition(
    line.productName === "활문어",
    "ECOUNT 원본 정규화 품목명이 다릅니다.",
  );
  assertCondition(
    line.productSpec === "규격 없음",
    "ECOUNT 원본 규격이 다릅니다.",
  );
  assertNumber(line.unitPrice, EXPECTED.ecountUnitPrice, "ECOUNT 원본 단가");
  assertNumber(line.supplyAmount, EXPECTED.purchaseAmount, "ECOUNT 공급가액");
  assertNumber(line.totalAmount, EXPECTED.purchaseAmount, "ECOUNT 합계금액");
  assertCondition(
    line.status === "COMMITTED",
    "ECOUNT 원본 상태가 COMMITTED가 아닙니다.",
  );

  const clam = plan.clamItem;
  assertCondition(
    clam.id === "cmsdkclq4000ll704z6kr4j2i",
    "생합 재고행 ID가 다릅니다.",
  );
  assertCondition(
    clam.dailyLedgerId === LEDGER_IDS["2026-08-03"],
    "생합 장부가 8/3이 아닙니다.",
  );
  assertCondition(
    clam.productId === CLAM_PRODUCT_ID,
    "생합 productId가 다릅니다.",
  );
  assertCondition(clam.productName === "생합", "생합 품목명이 다릅니다.");
  assertNumber(decimalToNumber(clam.previousQuantity), 1.2, "생합 전일 수량");
  assertNumber(decimalToNumber(clam.purchasedQuantity), 0, "생합 매입 수량");
  assertNumber(
    decimalToNumber(clam.currentQuantity),
    EXPECTED.clamQuantity,
    "생합 당일 수량",
  );
  assertNumber(
    decimalToNumber(clam.quantity),
    EXPECTED.clamQuantity,
    "생합 수량",
  );
  assertNumber(clam.unitPrice, 45_000, "생합 적용 단가");

  for (const [index, date] of Object.keys(LEDGER_IDS).entries()) {
    assertNumber(plan.correctionCounts[index], 0, `${date} correction 수`);
  }
  assertNumber(plan.repairAudits, 0, "기존 repair audit 수");
  assertNumber(plan.inventoryItems.length, 33, "8/3 재고행 수");
  assertNumber(
    plan.currentFallback.cogs,
    EXPECTED.currentFallbackCogs,
    "현재 폴백 원가",
  );
  assertNumber(
    plan.currentFallback.inventory,
    EXPECTED.currentFallbackInventory,
    "현재 폴백 재고금액",
  );
  assertNumber(
    plan.currentFifo.cogs,
    EXPECTED.currentFifoCogs,
    "현재 FIFO 원가",
  );
  assertNumber(
    plan.currentFifo.inventory,
    EXPECTED.currentFifoInventory,
    "현재 FIFO 재고금액",
  );
}

function serializeLedger(ledger) {
  return {
    id: ledger.id,
    closingDate: ledger.closingDate.toISOString(),
    status: ledger.status,
    version: ledger.version,
    updatedAt: ledger.updatedAt.toISOString(),
    updatedById: ledger.updatedById,
  };
}

function serializePurchase(purchase) {
  if (!purchase) return null;
  return {
    id: purchase.id,
    productId: purchase.productId,
    productName: purchase.productName,
    productSpec: purchase.productSpec,
    quantity: decimalToNumber(purchase.quantity),
    unitPrice: purchase.unitPrice,
    amount: purchase.amount,
    sourceType: purchase.sourceType,
    sourceUnitPrice: purchase.sourceUnitPrice,
    ecountImportLineId: purchase.ecountImportLineId,
    unitPriceOverrideReason: purchase.unitPriceOverrideReason,
    unitPriceUpdatedById: purchase.unitPriceUpdatedById,
    unitPriceUpdatedAt: purchase.unitPriceUpdatedAt?.toISOString() ?? null,
  };
}

function serializeInventory(item) {
  if (!item) return null;
  return {
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    previousQuantity: decimalToNumber(item.previousQuantity),
    purchasedQuantity: decimalToNumber(item.purchasedQuantity),
    currentQuantity: asNullableNumber(item.currentQuantity),
    quantity: asNullableNumber(item.quantity),
    unitPrice: item.unitPrice,
    inventoryAmount: item.inventoryAmount,
    fifoLots: item.fifoLots.map((lot) => ({
      consumedAmount: lot.consumedAmount,
      remainingAmount: lot.remainingAmount,
    })),
  };
}

async function captureLedgerSnapshot(tx, ledgerId, productIds) {
  const [ledger, items] = await Promise.all([
    tx.dailyLedger.findUnique({
      where: { id: ledgerId },
      select: {
        id: true,
        closingDate: true,
        status: true,
        version: true,
        updatedAt: true,
        updatedById: true,
      },
    }),
    tx.ledgerInventoryItem.findMany({
      where: { dailyLedgerId: ledgerId, productId: { in: productIds } },
      select: {
        id: true,
        productId: true,
        productName: true,
        previousQuantity: true,
        purchasedQuantity: true,
        currentQuantity: true,
        quantity: true,
        unitPrice: true,
        inventoryAmount: true,
        fifoLots: {
          select: { consumedAmount: true, remainingAmount: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { productId: "asc" },
    }),
  ]);

  assertCondition(
    ledger !== null,
    `snapshot 대상 장부 ${ledgerId}가 없습니다.`,
  );

  const purchase =
    ledgerId === LEDGER_IDS["2026-07-31"]
      ? await tx.ledgerPurchaseItem.findUnique({
          where: { id: PURCHASE_ID },
          select: {
            id: true,
            productId: true,
            productName: true,
            productSpec: true,
            quantity: true,
            unitPrice: true,
            amount: true,
            sourceType: true,
            sourceUnitPrice: true,
            ecountImportLineId: true,
            unitPriceOverrideReason: true,
            unitPriceUpdatedById: true,
            unitPriceUpdatedAt: true,
          },
        })
      : null;

  return {
    ledger: serializeLedger(ledger),
    purchase: serializePurchase(purchase),
    inventory: items.map(serializeInventory),
  };
}

async function writeLedgerAudit(tx, { ledgerId, before, after, operation }) {
  await writeAuditLog(tx, {
    action: REPAIR_AUDIT_ACTION,
    targetType: "DailyLedger",
    targetId: ledgerId,
    actorId: after.ledger.updatedById,
    before: { operation, repairReason: REPAIR_REASON, ...before },
    after: { operation, repairReason: REPAIR_REASON, ...after },
    reason: REPAIR_REASON,
  });
}

async function applyRepair(client) {
  return client.$transaction(
    async (tx) => {
      const plan = await loadPlan(tx);
      validatePlan(plan);
      const actorId = plan.actor.id;
      const now = new Date();

      const beforePurchase = await captureLedgerSnapshot(
        tx,
        LEDGER_IDS["2026-07-31"],
        [LIVE_OCTOPUS_PRODUCT_ID],
      );
      await tx.ledgerPurchaseItem.update({
        where: { id: PURCHASE_ID },
        data: {
          unitPrice: 18_000,
          amount: 36_000,
          unitPriceOverrideReason: REPAIR_REASON,
          unitPriceUpdatedById: actorId,
          unitPriceUpdatedAt: now,
          updatedById: actorId,
        },
      });
      await updateLedgerVersion(tx, {
        ledgerId: LEDGER_IDS["2026-07-31"],
        expectedVersion: EXPECTED_VERSIONS["2026-07-31"],
        actorId,
      });
      await refreshLedgerInventoryFifoLots(tx, LEDGER_IDS["2026-07-31"]);
      const afterPurchase = await captureLedgerSnapshot(
        tx,
        LEDGER_IDS["2026-07-31"],
        [LIVE_OCTOPUS_PRODUCT_ID],
      );
      await writeLedgerAudit(tx, {
        ledgerId: LEDGER_IDS["2026-07-31"],
        operation: "purchase_unit_price_and_fifo_refresh",
        before: beforePurchase,
        after: afterPurchase,
      });

      const beforeAug1 = await captureLedgerSnapshot(
        tx,
        LEDGER_IDS["2026-08-01"],
        [LIVE_OCTOPUS_PRODUCT_ID],
      );
      await updateLedgerVersion(tx, {
        ledgerId: LEDGER_IDS["2026-08-01"],
        expectedVersion: EXPECTED_VERSIONS["2026-08-01"],
        actorId,
      });
      await refreshLedgerInventoryFifoLots(tx, LEDGER_IDS["2026-08-01"]);
      const afterAug1 = await captureLedgerSnapshot(
        tx,
        LEDGER_IDS["2026-08-01"],
        [LIVE_OCTOPUS_PRODUCT_ID],
      );
      await writeLedgerAudit(tx, {
        ledgerId: LEDGER_IDS["2026-08-01"],
        operation: "fifo_refresh_after_prior_ledger_repair",
        before: beforeAug1,
        after: afterAug1,
      });

      const beforeAug3 = await captureLedgerSnapshot(
        tx,
        LEDGER_IDS["2026-08-03"],
        [CLAM_PRODUCT_ID, LIVE_OCTOPUS_PRODUCT_ID],
      );
      await tx.ledgerInventoryItem.update({
        where: { id: plan.clamItem.id },
        data: {
          currentQuantity: EXPECTED.repairedClamQuantity,
          quantity: EXPECTED.repairedClamQuantity,
          updatedById: actorId,
        },
      });
      await updateLedgerVersion(tx, {
        ledgerId: LEDGER_IDS["2026-08-03"],
        expectedVersion: EXPECTED_VERSIONS["2026-08-03"],
        actorId,
      });
      await refreshLedgerInventoryFifoLots(tx, LEDGER_IDS["2026-08-03"]);
      const afterAug3 = await captureLedgerSnapshot(
        tx,
        LEDGER_IDS["2026-08-03"],
        [CLAM_PRODUCT_ID, LIVE_OCTOPUS_PRODUCT_ID],
      );
      await writeLedgerAudit(tx, {
        ledgerId: LEDGER_IDS["2026-08-03"],
        operation: "inventory_quantity_and_fifo_refresh",
        before: beforeAug3,
        after: afterAug3,
      });

      // 커밋 직전 전체 8/3 FIFO, 매출, 보정 대상 원본 보존 상태를 다시 읽는다.
      // 하나라도 다르면 예외를 던져 트랜잭션 전체를 롤백한다.
      const verification = await verifyCommittedRepairState(tx);

      return { ledgerIds: Object.values(LEDGER_IDS), actorId, verification };
    },
    {
      isolationLevel: "Serializable",
      maxWait: 10_000,
      timeout: 120_000,
    },
  );
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const databaseUrl = getDatabaseUrl();
  const databaseHost = getDatabaseHost(databaseUrl);
  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  try {
    if (options.apply) {
      assertCondition(
        options.confirmRemoteDb,
        "운영 DB 쓰기에는 --confirm-remote-db가 필요합니다.",
      );
      assertCondition(
        isApprovedDatabaseHost(databaseHost),
        `승인된 Neon DB host가 아닙니다: ${databaseHost}`,
      );
      const result = await applyRepair(client);
      console.log(JSON.stringify({ mode: "apply", result }, null, 2));
      return;
    }

    const plan = await loadPlan(client);
    validatePlan(plan);
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          databaseHost,
          preconditions: "passed",
          writesAttempted: 0,
          target: {
            storeId: STORE_ID,
            storeName: STORE_NAME,
            actorEmail: ACTOR_EMAIL,
            ledgerIds: LEDGER_IDS,
            versions: EXPECTED_VERSIONS,
          },
          changes: [
            {
              ledgerDate: "2026-07-31",
              purchaseId: PURCHASE_ID,
              product: "활문어",
              quantity: 2,
              fromUnitPrice: 14_000,
              toUnitPrice: 18_000,
              fromAmount: 28_000,
              toAmount: 36_000,
              sourceUnitPricePreserved: 14_000,
              ecountLineId: ECOUNT_LINE_ID,
            },
            {
              ledgerDate: "2026-08-03",
              inventoryItemId: plan.clamItem.id,
              product: "생합",
              fromQuantity: 0.9,
              toQuantity: 0.89,
            },
            {
              fifoOrder: ["2026-07-31", "2026-08-01", "2026-08-03"],
            },
          ],
          currentTotals: {
            fallbackCogs: plan.currentFallback.cogs,
            fifoCogs: plan.currentFifo.cogs,
            fallbackInventory: plan.currentFallback.inventory,
            fifoInventory: plan.currentFifo.inventory,
          },
          expectedAfterApply: {
            cogs: EXPECTED.expectedCogs,
            grossProfit: EXPECTED.expectedGrossProfit,
            grossMarginRate: "28.20%",
            fifoInventory: EXPECTED.expectedFifoInventory,
          },
        },
        null,
        2,
      ),
    );
    console.log("DRY_RUN_ONLY: 데이터베이스 쓰기를 수행하지 않았습니다.");
  } finally {
    await client.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
