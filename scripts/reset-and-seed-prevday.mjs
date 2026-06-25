// 전일재고(이월) 검토용 리셋+시드.
// 보존: 사용자(id/pw)·권한·지점(Store)·품목(Product)·별칭(Alias).
// 초기화: 모든 거래성 데이터(장부/재고/손실/매입/비용/인건비/조정/이월상세/FIFO/이카운트 batch·line/월초 스냅샷).
// 재구성:
//  - 엑셀(이카운트 6/17)을 실제 파서/커밋 경로로 각 공급처-지점 6/17 장부에 매입 반영.
//  - 최근 연속일(6/23 마감, 6/24 마감, 6/25 진행중=검토 대상)에 재고 이월 체인 + 손실 생성.
//    → 6/24 전일재고 = 6/23 마감, 6/25 전일재고 = 6/24 마감.
//
// 실행: node --experimental-strip-types scripts/reset-and-seed-prevday.mjs
import "./_loadenv.mjs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "../generated/prisma/index.js";
import { refreshLedgerInventoryFifoLots } from "../src/features/inventory/fifo-lots.ts";
import { parseEcountSupplyWorkbook } from "../src/features/ledger/ecount-supply-import.ts";
import {
  ECOUNT_PROVIDER,
  productAliasKey,
  resolveBatchStatus,
  resolveEcountLine,
  storeAliasKey,
} from "../src/features/ledger/ecount-supply-mapping.ts";

if (process.env.DATABASE_URL_UNPOOLED) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}
const db = new PrismaClient();

const EXCEL_PATH = "docs/erp_input/이카운트 엑셀파일.xlsx";
const EXCEL_FILE_NAME = "이카운트 엑셀파일.xlsx";
const ECOUNT_DAY = "2026-06-17"; // 엑셀 원본 일자 — 그대로 보존
const RECENT_DAYS = ["2026-06-23", "2026-06-24", "2026-06-25"]; // 전일재고 이월 체인(마지막=오늘=진행중)
const YEAR_MONTH = "2026-06";

function utcDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

// 결정적 의사난수(재현 가능). Math.random 미사용.
function seeded(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

async function getActors() {
  const hq = await db.user.findFirst({ where: { role: "HEADQUARTERS" } });
  const sm = await db.user.findFirst({ where: { role: "STORE_MANAGER" } });
  if (!hq || !sm) throw new Error("HQ/STORE_MANAGER 사용자가 없습니다. prisma seed를 먼저 실행하세요.");
  return { hqId: hq.id, smId: sm.id };
}

// 거래성 데이터 전체 삭제(보존 대상 제외). FK 의존 순서대로.
async function wipeTransactional() {
  await db.ledgerInventoryFifoLot.deleteMany({});
  await db.ledgerInventoryCarryoverDetail.deleteMany({});
  await db.ledgerInventoryAdjustment.deleteMany({});
  await db.ledgerLossItem.deleteMany({});
  await db.ledgerInventoryItem.deleteMany({});
  await db.ledgerPurchaseItem.deleteMany({}); // ecountImportLine FK는 SetNull
  await db.ledgerExpense.deleteMany({});
  await db.ledgerLaborItem.deleteMany({});
  await db.correctionRecord.deleteMany({});
  await db.ecountImportLine.deleteMany({});
  await db.ecountImportBatch.deleteMany({});
  await db.inventoryOpeningSnapshot.deleteMany({});
  await db.dailyLedger.deleteMany({});
  console.log("→ 거래성 데이터 초기화 완료(사용자/권한/지점/품목/별칭 보존)");
}

async function ensureLossCodes(hqId) {
  const names = ["폐기", "파손", "변질", "시식제공"];
  const codes = [];
  let order = 1;
  for (const name of names) {
    const code = await db.ledgerInputCode.upsert({
      where: { group_name: { group: "LOSS_TYPE", name } },
      create: { group: "LOSS_TYPE", name, displayOrder: order, isActive: true, updatedById: hqId },
      update: { isActive: true, displayOrder: order },
    });
    codes.push(code);
    order += 1;
  }
  return codes;
}

async function loadAliasMaps() {
  const [storeAliases, productAliases] = await Promise.all([
    db.storeExternalAlias.findMany({ where: { provider: ECOUNT_PROVIDER }, select: { rawName: true, storeId: true } }),
    db.productExternalAlias.findMany({ where: { provider: ECOUNT_PROVIDER }, select: { rawName: true, rawSpec: true, productId: true } }),
  ]);
  const storeByRaw = new Map();
  for (const a of storeAliases) storeByRaw.set(storeAliasKey(a.rawName), a.storeId);
  const productByRaw = new Map();
  for (const a of productAliases) productByRaw.set(productAliasKey(a.rawName, a.rawSpec), a.productId);
  return { storeByRaw, productByRaw };
}

async function createLedger(storeId, ymd, status, actorId) {
  return db.dailyLedger.create({
    data: {
      storeId, closingDate: utcDate(ymd), status, version: 1,
      totalSalesAmount: 0, cashAmount: 0, cardAmount: 0, otherPaymentAmount: 0,
      authorDisplayName: "지점장",
      createdById: actorId, updatedById: actorId,
    },
    select: { id: true },
  });
}

// 이카운트 엑셀 → PREVIEW batch/line 생성 후 커밋(앱 commit 절차 재현).
// 라인의 일자(6/17)를 그대로 사용해 6/17 장부에 매입 반영한다.
async function importAndCommitEcount(hqId, parsed, aliases) {
  const bytes = readFileSync(EXCEL_PATH);
  const fileHash = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  const [ey, em, ed] = ECOUNT_DAY.split("-");
  const dateNo = `${ey}/${em}/${ed}`;

  const lineStatuses = [];
  const batch = await db.ecountImportBatch.create({
    data: {
      fileName: EXCEL_FILE_NAME, fileHash, sheetName: parsed.sheetName,
      businessDate: utcDate(ECOUNT_DAY), status: "PREVIEW", uploadedById: hqId,
    },
  });
  for (const line of parsed.lines) {
    const storeId = aliases.storeByRaw.get(storeAliasKey(line.rawStoreName)) ?? null;
    const productId = aliases.productByRaw.get(productAliasKey(line.rawProductName, line.productSpec)) ?? null;
    const resolution = resolveEcountLine({
      rawStoreName: line.rawStoreName, rawProductName: line.rawProductName,
      productSpec: line.productSpec, storeId, productId, error: line.error,
    });
    lineStatuses.push(resolution.status);
    await db.ecountImportLine.create({
      data: {
        batchId: batch.id, rowNumber: line.rowNumber, dateNo,
        rawStoreName: line.rawStoreName, storeId,
        rawProductName: line.rawProductName, productId,
        productName: line.productName, productCategory: line.productCategory, productSpec: line.productSpec,
        quantity: line.quantity, unitPrice: line.unitPrice,
        supplyAmount: line.supplyAmount, totalAmount: line.totalAmount,
        status: resolution.status, errorMessage: resolution.errorMessage,
      },
    });
  }
  const batchStatus = resolveBatchStatus(lineStatuses);
  await db.ecountImportBatch.update({ where: { id: batch.id }, data: { status: batchStatus } });
  if (batchStatus !== "READY") {
    const breakdown = {};
    for (const s of lineStatuses) breakdown[s] = (breakdown[s] ?? 0) + 1;
    throw new Error(`이카운트 batch가 READY가 아님(${batchStatus}). 매핑 누락: ${JSON.stringify(breakdown)}`);
  }

  const committed = await db.$transaction(async (tx) => {
    const full = await tx.ecountImportBatch.findUnique({
      where: { id: batch.id }, include: { lines: { orderBy: { rowNumber: "asc" } } },
    });
    const ledgerByStore = new Map();
    const affected = new Set();
    for (const line of full.lines) {
      let ledger = ledgerByStore.get(line.storeId);
      if (!ledger) {
        const existing = await tx.dailyLedger.findUnique({
          where: { storeId_closingDate: { storeId: line.storeId, closingDate: utcDate(ECOUNT_DAY) } },
          select: { id: true },
        });
        ledger = existing ?? (await tx.dailyLedger.create({
          data: {
            storeId: line.storeId, closingDate: utcDate(ECOUNT_DAY), status: "IN_PROGRESS", version: 1,
            totalSalesAmount: 0, cashAmount: 0, cardAmount: 0, otherPaymentAmount: 0,
            authorDisplayName: "지점장", createdById: hqId, updatedById: hqId,
          },
          select: { id: true },
        }));
        ledgerByStore.set(line.storeId, ledger);
      }
      affected.add(ledger.id);
      const purchaseItem = await tx.ledgerPurchaseItem.create({
        data: {
          dailyLedgerId: ledger.id, productId: line.productId, purchaseStandardId: null,
          sourceType: "ECOUNT_UPLOAD",
          productName: line.productName, productCategory: line.productCategory, productSpec: line.productSpec,
          unitPrice: line.unitPrice, quantity: line.quantity, amount: line.unitPrice * line.quantity,
          sourceUnitPrice: line.unitPrice, ecountImportLineId: line.id,
          referenceInfo: `이카운트 ${full.sheetName} ${line.rowNumber}행 · 일자-No. ${line.dateNo} · 거래처 ${line.rawStoreName}`,
          createdById: hqId, updatedById: hqId,
        },
      });
      await tx.ecountImportLine.update({
        where: { id: line.id },
        data: { status: "COMMITTED", ledgerPurchaseItemId: purchaseItem.id },
      });
    }
    for (const ledgerId of affected) await refreshLedgerInventoryFifoLots(tx, ledgerId);
    await tx.ecountImportBatch.update({
      where: { id: batch.id }, data: { status: "COMMITTED", committedById: hqId, committedAt: new Date() },
    });
    return { lines: full.lines.length, ledgers: affected.size };
  }, { timeout: 120000, maxWait: 30000 });
  console.log(`→ 이카운트 6/17 커밋: ${committed.lines}행, 장부 ${committed.ledgers}개`);
}

// 한 지점의 최근 연속일(6/23~6/25) 재고 이월 체인 + 손실 생성.
// products: 그 지점이 엑셀에서 매입한 품목들 [{id,name,category,spec,unitPrice}]
async function seedRecentDaysForStore(store, products, lossCodes, hqId, smId, salt) {
  if (products.length === 0) return;

  // 월초 스냅샷 = 직전 마감 수량의 시작점.
  const prevQty = new Map();
  for (let pi = 0; pi < products.length; pi++) {
    const p = products[pi];
    const base = 8 + Math.floor(seeded(salt * 100 + pi) * 25); // 8~32
    await db.inventoryOpeningSnapshot.upsert({
      where: { storeId_yearMonth_productId: { storeId: store.id, yearMonth: YEAR_MONTH, productId: p.id } },
      create: {
        storeId: store.id, yearMonth: YEAR_MONTH, productId: p.id,
        productName: p.name, productCategory: p.category, productSpec: p.spec,
        unitPrice: p.unitPrice, quantity: base,
      },
      update: { quantity: base, unitPrice: p.unitPrice },
    });
    prevQty.set(p.id, base);
  }

  for (let di = 0; di < RECENT_DAYS.length; di++) {
    const day = RECENT_DAYS[di];
    const isToday = di === RECENT_DAYS.length - 1;
    const status = isToday ? "IN_PROGRESS" : "HEADQUARTERS_CLOSED";
    const ledger = await createLedger(store.id, day, status, smId);

    // 매입(수동): 약 절반 품목 보충.
    const purchasedQty = new Map();
    for (let pi = 0; pi < products.length; pi++) {
      const p = products[pi];
      if (seeded(salt * 1000 + di * 100 + pi) < 0.5) {
        const qty = 1 + Math.floor(seeded(salt * 1000 + di * 100 + pi + 7) * 10); // 1~10
        await db.ledgerPurchaseItem.create({
          data: {
            dailyLedgerId: ledger.id, productId: p.id, sourceType: "MANUAL",
            productName: p.name, productCategory: p.category, productSpec: p.spec,
            unitPrice: p.unitPrice, quantity: qty, amount: p.unitPrice * qty,
            referenceInfo: "수동 매입(테스트)", createdById: smId, updatedById: smId,
          },
        });
        purchasedQty.set(p.id, (purchasedQty.get(p.id) ?? 0) + qty);
      }
    }

    // 손실(폐기 등): 가끔.
    const lossQty = new Map();
    for (let pi = 0; pi < products.length; pi++) {
      const p = products[pi];
      if (seeded(salt * 2000 + di * 100 + pi + 3) < 0.18) {
        const qty = 1 + Math.floor(seeded(salt * 2000 + di * 100 + pi + 9) * 2); // 1~2
        const code = lossCodes[Math.floor(seeded(salt + di + pi) * lossCodes.length) % lossCodes.length];
        await db.ledgerLossItem.create({
          data: {
            dailyLedgerId: ledger.id, productId: p.id, ledgerInputCodeId: code.id,
            productName: p.name, productCategory: p.category, productSpec: p.spec,
            unitPrice: p.unitPrice, lossTypeName: code.name, quantity: qty,
            recoveredAmount: 0, amount: p.unitPrice * qty, reason: "테스트 손실",
            createdById: smId, updatedById: smId,
          },
        });
        lossQty.set(p.id, qty);
      }
    }

    // 재고 행: previous → 판매 추정 → current(마감수량). 다음 날 previous = 오늘 current.
    let estSales = 0;
    for (let pi = 0; pi < products.length; pi++) {
      const p = products[pi];
      const previousQuantity = prevQty.get(p.id) ?? 0;
      const purchasedQuantity = purchasedQty.get(p.id) ?? 0;
      const lossQuantity = lossQty.get(p.id) ?? 0;
      const available = previousQuantity + purchasedQuantity - lossQuantity;
      const sellRatio = 0.1 + seeded(salt * 3000 + di * 100 + pi + 5) * 0.6;
      const sold = Math.max(0, Math.min(available, Math.round(available * sellRatio)));
      const currentQuantity = available - sold;
      estSales += sold * p.unitPrice;

      const carryoverSource = di === 0 ? "OPENING_SNAPSHOT" : "PREVIOUS_CLOSED_LEDGER";
      const carryoverStatus = di === 0 ? "OPENING_CARRYOVER" : "PREVIOUS_CARRYOVER";
      await db.ledgerInventoryItem.create({
        data: {
          dailyLedgerId: ledger.id, productId: p.id,
          productName: p.name, productCategory: p.category, productSpec: p.spec,
          unitPrice: p.unitPrice,
          previousQuantity, purchasedQuantity, currentQuantity, quantity: currentQuantity,
          inventoryAmount: currentQuantity * p.unitPrice, isModified: false,
          carryoverSource, carryoverStatus, carryoverLedgerId: null,
          createdById: smId, updatedById: smId,
        },
      });
      prevQty.set(p.id, currentQuantity);
    }

    // 매출/결제(요약).
    const margin = 1.28 + seeded(salt * 7 + di) * 0.12;
    const totalSales = Math.round((estSales * margin) / 1000) * 1000;
    const cash = Math.round((totalSales * 0.35) / 1000) * 1000;
    const card = Math.round((totalSales * 0.55) / 1000) * 1000;
    const other = Math.max(0, totalSales - cash - card);
    await db.dailyLedger.update({
      where: { id: ledger.id },
      data: {
        totalSalesAmount: totalSales, cashAmount: cash, cardAmount: card, otherPaymentAmount: other,
        workerCount: 2, authorDisplayName: "지점장",
        submittedById: !isToday ? smId : null, submittedAt: !isToday ? utcDate(day) : null,
        closedById: !isToday ? hqId : null, closedAt: !isToday ? utcDate(day) : null,
        updatedById: smId,
      },
    });

    await db.$transaction(async (tx) => { await refreshLedgerInventoryFifoLots(tx, ledger.id); },
      { timeout: 30000, maxWait: 30000 });
    console.log(`   [${store.name}] ${day} status=${status} 매입=${purchasedQty.size} 손실=${lossQty.size}`);
  }
}

async function main() {
  const { hqId, smId } = await getActors();
  const bytes = readFileSync(EXCEL_PATH);
  const parsed = parseEcountSupplyWorkbook(bytes);

  await wipeTransactional();
  const lossCodes = await ensureLossCodes(hqId);
  const aliases = await loadAliasMaps();

  // 엑셀 거래처(공급처-지점)별 매입 품목 집합 구성.
  const storeProducts = new Map(); // storeId -> Map(productId -> {id,name,category,spec,unitPrice})
  for (const line of parsed.lines) {
    const storeId = aliases.storeByRaw.get(storeAliasKey(line.rawStoreName));
    const productId = aliases.productByRaw.get(productAliasKey(line.rawProductName, line.productSpec));
    if (!storeId || !productId) continue;
    if (!storeProducts.has(storeId)) storeProducts.set(storeId, new Map());
    const m = storeProducts.get(storeId);
    if (!m.has(productId)) {
      m.set(productId, {
        id: productId, name: line.productName, category: line.productCategory,
        spec: line.productSpec, unitPrice: line.unitPrice,
      });
    }
  }

  // 1) 이카운트 6/17 매입 반영(원본 일자 유지).
  await importAndCommitEcount(hqId, parsed, aliases);

  // 2) 각 공급처-지점 최근 3일 이월 체인 + 손실.
  const stores = await db.store.findMany({ where: { id: { in: [...storeProducts.keys()] } }, select: { id: true, name: true } });
  let salt = 1;
  for (const store of stores) {
    const products = [...storeProducts.get(store.id).values()];
    // 6/17 장부의 지점장 배정 확인(검토 가능하도록). 없으면 기본 지점장에 배정.
    await db.userStoreAssignment.upsert({
      where: { userId_storeId: { userId: smId, storeId: store.id } },
      create: { userId: smId, storeId: store.id }, update: {},
    });
    await seedRecentDaysForStore(store, products, lossCodes, hqId, smId, salt);
    salt += 1;
  }

  console.log(`\n✔ 완료: 공급처-지점 ${stores.length}개 · 6/17 이카운트 + 6/23~6/25 이월 체인`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
