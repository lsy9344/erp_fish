// 3일치 테스트 데이터 메인 시드. scripts/seed-test-data.mjs의 helper를 사용한다.
// 실행: node --experimental-strip-types scripts/seed-main.mjs
import { readFileSync } from "node:fs";
import {
  db,
  EXCEL_PATH,
  DAYS,
  utcDate,
  seeded,
  getActors,
  ensureStores,
  ensureInputCodes,
  ensureProductsAndAliases,
  ensureStoreAliases,
  STORE_NAMES,
} from "./seed-test-data.mjs";
import { refreshLedgerInventoryFifoLots } from "../src/features/inventory/fifo-lots.ts";
import { parseEcountSupplyWorkbook } from "../src/features/ledger/ecount-supply-import.ts";

// 각 지점이 취급하는 품목 인덱스(전체 품목 리스트에서 슬라이스). 지점마다 다른 구성.
function storeProductSlice(products, storeIdx) {
  // 강남: 0~13, 서초: 6~19, 송파: 11~24 (겹치되 다르게)
  const ranges = [
    [0, 14],
    [6, 20],
    [11, 25],
  ];
  const [a, b] = ranges[storeIdx];
  return products.slice(a, Math.min(b, products.length));
}

async function main() {
  const actors = await getActors();
  const { hqId, smId } = actors;

  const bytes = readFileSync(EXCEL_PATH);
  const parsed = parseEcountSupplyWorkbook(bytes);

  console.log("→ 지점/배정 생성");
  const stores = await ensureStores(actors);
  console.log("→ 입력 코드 생성");
  const codes = await ensureInputCodes(actors);
  console.log("→ 품목 + 이카운트 품목 별칭 생성");
  const products = await ensureProductsAndAliases(actors, parsed);
  console.log(`   품목 ${products.length}개`);
  console.log("→ 거래처(공급처)→지점 별칭 생성");
  await ensureStoreAliases(actors, stores);

  const paymentCodes = Object.values(codes.PAYMENT_METHOD);
  const expenseCodes = Object.values(codes.EXPENSE_ITEM);
  const lossCodes = Object.values(codes.LOSS_TYPE);

  // 지점별 기초재고(6월 opening snapshot) + 직전 마감 수량 추적용 상태.
  const yearMonth = "2026-06";

  for (let si = 0; si < STORE_NAMES.length; si++) {
    const storeName = STORE_NAMES[si];
    const store = stores[storeName];
    const lineup = storeProductSlice(products, si);

    // 기초재고 snapshot (6월). 직전 마감 수량의 시작점.
    const prevQtyByProduct = new Map();
    for (let pi = 0; pi < lineup.length; pi++) {
      const p = lineup[pi];
      const base = 5 + Math.floor(seeded(si * 100 + pi) * 30); // 5~34
      await db.inventoryOpeningSnapshot.upsert({
        where: { storeId_yearMonth_productId: { storeId: store.id, yearMonth, productId: p.id } },
        create: {
          storeId: store.id, yearMonth, productId: p.id,
          productName: p.name, productCategory: p.category, productSpec: p.spec,
          unitPrice: p.unitPrice, quantity: base,
        },
        update: { quantity: base, unitPrice: p.unitPrice },
      });
      prevQtyByProduct.set(p.id, base);
    }

    for (let di = 0; di < DAYS.length; di++) {
      const day = DAYS[di];
      const closingDate = utcDate(day);
      const isLastDay = di === DAYS.length - 1;
      const status = isLastDay ? "IN_PROGRESS" : "HEADQUARTERS_CLOSED";

      // 매입(입고): 약 절반 품목 보충. 이카운트가 아닌 수동 매입.
      const purchasesForDay = [];
      for (let pi = 0; pi < lineup.length; pi++) {
        const p = lineup[pi];
        const r = seeded(si * 1000 + di * 100 + pi);
        if (r < 0.55) {
          const qty = 1 + Math.floor(seeded(si * 1000 + di * 100 + pi + 7) * 12); // 1~12
          purchasesForDay.push({ product: p, qty });
        }
      }

      // 손실(폐기 등): 가끔.
      const lossesForDay = [];
      for (let pi = 0; pi < lineup.length; pi++) {
        const p = lineup[pi];
        const r = seeded(si * 2000 + di * 100 + pi + 3);
        if (r < 0.12) {
          const qty = 1 + Math.floor(seeded(si * 2000 + di * 100 + pi + 9) * 2); // 1~2
          lossesForDay.push({ product: p, qty });
        }
      }

      // 장부 생성/획득
      const existing = await db.dailyLedger.findUnique({
        where: { storeId_closingDate: { storeId: store.id, closingDate } },
        select: { id: true },
      });
      let ledgerId;
      if (existing) {
        ledgerId = existing.id;
        // 재시드 시 깨끗하게: 종속행 정리
        await db.ledgerInventoryFifoLot.deleteMany({ where: { dailyLedgerId: ledgerId } });
        await db.ledgerInventoryCarryoverDetail.deleteMany({ where: { ledgerInventoryItem: { dailyLedgerId: ledgerId } } });
        await db.ledgerInventoryAdjustment.deleteMany({ where: { dailyLedgerId: ledgerId } });
        await db.ledgerLossItem.deleteMany({ where: { dailyLedgerId: ledgerId } });
        await db.ledgerInventoryItem.deleteMany({ where: { dailyLedgerId: ledgerId } });
        await db.ledgerPurchaseItem.deleteMany({ where: { dailyLedgerId: ledgerId, sourceType: "MANUAL" } });
        await db.ledgerExpense.deleteMany({ where: { dailyLedgerId: ledgerId } });
        await db.ledgerLaborItem.deleteMany({ where: { dailyLedgerId: ledgerId } });
      } else {
        const created = await db.dailyLedger.create({
          data: {
            storeId: store.id, closingDate, status: "IN_PROGRESS", version: 1,
            totalSalesAmount: 0, cashAmount: 0, cardAmount: 0, otherPaymentAmount: 0,
            createdById: smId, updatedById: smId,
          },
          select: { id: true },
        });
        ledgerId = created.id;
      }

      // 매입 행 생성
      const purchasedQtyByProduct = new Map();
      for (const { product: p, qty } of purchasesForDay) {
        await db.ledgerPurchaseItem.create({
          data: {
            dailyLedgerId: ledgerId, productId: p.id, sourceType: "MANUAL",
            productName: p.name, productCategory: p.category, productSpec: p.spec,
            unitPrice: p.unitPrice, quantity: qty, amount: p.unitPrice * qty,
            referenceInfo: "수동 매입(테스트)",
            createdById: smId, updatedById: smId,
          },
        });
        purchasedQtyByProduct.set(p.id, (purchasedQtyByProduct.get(p.id) ?? 0) + qty);
      }

      // 손실 행 생성
      const lossQtyByProduct = new Map();
      for (const { product: p, qty } of lossesForDay) {
        const lossCode = lossCodes[Math.floor(seeded(si + di + p.unitPrice) * lossCodes.length) % lossCodes.length];
        await db.ledgerLossItem.create({
          data: {
            dailyLedgerId: ledgerId, productId: p.id, ledgerInputCodeId: lossCode.id,
            productName: p.name, productCategory: p.category, productSpec: p.spec,
            unitPrice: p.unitPrice, lossTypeName: lossCode.name, quantity: qty,
            recoveredAmount: 0, amount: p.unitPrice * qty, reason: "테스트 손실",
            createdById: smId, updatedById: smId,
          },
        });
        lossQtyByProduct.set(p.id, qty);
      }

      // 재고 행: previous → 판매 추정 → current(마감수량)
      let estimatedSalesValue = 0;
      for (let pi = 0; pi < lineup.length; pi++) {
        const p = lineup[pi];
        const previousQuantity = prevQtyByProduct.get(p.id) ?? 0;
        const purchasedQuantity = purchasedQtyByProduct.get(p.id) ?? 0;
        const lossQuantity = lossQtyByProduct.get(p.id) ?? 0;
        const available = previousQuantity + purchasedQuantity - lossQuantity;
        // 판매량: 가용재고의 0~70% 정도 무작위.
        const sellRatio = 0.1 + seeded(si * 3000 + di * 100 + pi + 5) * 0.6;
        const sold = Math.max(0, Math.min(available, Math.round(available * sellRatio)));
        const currentQuantity = available - sold;
        estimatedSalesValue += sold * p.unitPrice;

        const carryoverSource = di === 0 ? "OPENING_SNAPSHOT" : "PREVIOUS_CLOSED_LEDGER";
        const carryoverStatus = di === 0 ? "OPENING_CARRYOVER" : "PREVIOUS_CARRYOVER";

        await db.ledgerInventoryItem.create({
          data: {
            dailyLedgerId: ledgerId, productId: p.id,
            productName: p.name, productCategory: p.category, productSpec: p.spec,
            unitPrice: p.unitPrice,
            previousQuantity, purchasedQuantity, currentQuantity, quantity: currentQuantity,
            inventoryAmount: currentQuantity * p.unitPrice,
            isModified: false,
            carryoverSource, carryoverStatus,
            carryoverLedgerId: null,
            createdById: smId, updatedById: smId,
          },
        });

        // 다음 날 previous = 오늘 current
        prevQtyByProduct.set(p.id, currentQuantity);
      }

      // 매출/결제: 추정 판매가치에 마진(약 +28%)을 얹어 매출 총액 구성.
      const margin = 1.28 + seeded(si * 7 + di) * 0.12; // 1.28~1.40
      const totalSales = Math.round((estimatedSalesValue * margin) / 1000) * 1000;
      const cash = Math.round(totalSales * 0.35 / 1000) * 1000;
      const card = Math.round(totalSales * 0.55 / 1000) * 1000;
      const other = totalSales - cash - card;
      const workerCount = 2 + (si % 2);

      await db.dailyLedger.update({
        where: { id: ledgerId },
        data: {
          status,
          totalSalesAmount: totalSales,
          cashAmount: cash, cardAmount: card, otherPaymentAmount: other < 0 ? 0 : other,
          workerCount,
          workMemo: di === 1 ? "오후 손님 많음" : null,
          authorDisplayName: "지점장",
          submittedById: !isLastDay ? smId : null,
          submittedAt: !isLastDay ? closingDate : null,
          closedById: !isLastDay ? hqId : null,
          closedAt: !isLastDay ? closingDate : null,
          updatedById: smId,
        },
      });

      // 비용 2~3건
      const expenseCount = 2 + (di % 2);
      for (let ei = 0; ei < expenseCount; ei++) {
        const code = expenseCodes[ei % expenseCodes.length];
        const amt = 10000 + Math.floor(seeded(si * 50 + di * 10 + ei) * 90000);
        await db.ledgerExpense.create({
          data: {
            dailyLedgerId: ledgerId, ledgerInputCodeId: code.id,
            amount: amt, memo: `${code.name} 지출`,
            createdById: smId, updatedById: smId,
          },
        });
      }

      // 인건비(직원) 2~3명
      const workerNames = ["김직원", "이직원", "박직원"];
      for (let wi = 0; wi < workerCount; wi++) {
        await db.ledgerLaborItem.create({
          data: {
            dailyLedgerId: ledgerId, workerName: workerNames[wi % workerNames.length],
            amount: 90000 + wi * 10000,
            lateMemo: wi === 0 && di === 1 ? "10분 지각" : null,
            createdById: smId, updatedById: smId,
          },
        });
      }

      // FIFO lot + inventoryAmount 재계산(앱 로직 그대로). Neon 네트워크 지연 대비 타임아웃 확대.
      await db.$transaction(
        async (tx) => {
          await refreshLedgerInventoryFifoLots(tx, ledgerId);
        },
        { timeout: 30000, maxWait: 30000 },
      );

      console.log(`   [${storeName}] ${day} status=${status} 매출=${totalSales.toLocaleString()} 매입행=${purchasesForDay.length} 손실=${lossesForDay.length}`);
    }
  }

  console.log("\n✔ 비-이카운트 3일치 데이터 완료.");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
