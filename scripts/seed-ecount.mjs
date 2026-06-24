// 이카운트 출고/입고 엑셀(6/17)을 실제 파서로 읽어 batch/line을 만들고,
// 별칭 매핑을 적용해 READY로 만든 뒤 6/24 영업일 장부에 커밋한다.
// 커밋 로직은 src/features/ledger/ecount-supply-commit.ts와 동일한 절차를 재현한다.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  db,
  EXCEL_PATH,
  ECOUNT_TARGET_DAY,
  utcDate,
  getActors,
} from "./seed-test-data.mjs";
import { parseEcountSupplyWorkbook } from "../src/features/ledger/ecount-supply-import.ts";
import {
  ECOUNT_PROVIDER,
  productAliasKey,
  resolveBatchStatus,
  resolveEcountLine,
  storeAliasKey,
} from "../src/features/ledger/ecount-supply-mapping.ts";
import { refreshLedgerInventoryFifoLots } from "../src/features/inventory/fifo-lots.ts";

// queries.ts / adjustment-reconciliation.ts는 `~` 별칭 import를 써서 node에서 직접 못 불러온다.
// 시드에 필요한 최소 로직만 인라인한다(대상 6/24 장부는 이미 존재).
function utcMidnight(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}
async function getOrCreateStoreLedgerInTx(tx, storeId, ymd, actorId) {
  const closingDate = utcMidnight(ymd);
  const existing = await tx.dailyLedger.findUnique({
    where: { storeId_closingDate: { storeId, closingDate } },
    select: { id: true },
  });
  if (existing) return existing;
  await tx.dailyLedger.createMany({
    data: {
      storeId, closingDate, status: "IN_PROGRESS", version: 1,
      totalSalesAmount: 0, cashAmount: 0, cardAmount: 0, otherPaymentAmount: 0,
      createdById: actorId, updatedById: actorId,
    },
    skipDuplicates: true,
  });
  return tx.dailyLedger.findUnique({
    where: { storeId_closingDate: { storeId, closingDate } },
    select: { id: true },
  });
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

async function main() {
  const { hqId } = await getActors();
  const bytes = readFileSync(EXCEL_PATH);
  const parsed = parseEcountSupplyWorkbook(bytes);

  // 6/17 → 목표 영업일로 일자-No. 재작성(커밋이 dateNo에서 영업일을 읽는다).
  const [ty, tm, td] = ECOUNT_TARGET_DAY.split("-");
  const targetDateNo = `${ty}/${tm}/${td}`;

  const fileName = "이카운트 엑셀파일.xlsx";
  const fileHash = createHash("sha256").update(Buffer.from(bytes)).digest("hex");

  // 기존 동일 파일 batch 정리(재시드 대비). 커밋된 매입행/장부행도 되돌린다.
  const existingBatch = await db.ecountImportBatch.findUnique({ where: { fileHash }, select: { id: true } });
  if (existingBatch) {
    const lines = await db.ecountImportLine.findMany({ where: { batchId: existingBatch.id }, select: { ledgerPurchaseItemId: true } });
    const purchaseIds = lines.map((l) => l.ledgerPurchaseItemId).filter(Boolean);
    if (purchaseIds.length) {
      // 커밋으로 생성된 ECOUNT 매입행 + 관련 FIFO lot 정리
      const affected = await db.ledgerPurchaseItem.findMany({ where: { id: { in: purchaseIds } }, select: { dailyLedgerId: true } });
      const ledgerIds = [...new Set(affected.map((a) => a.dailyLedgerId))];
      await db.ledgerInventoryFifoLot.deleteMany({ where: { sourcePurchaseItemId: { in: purchaseIds } } });
      await db.ledgerPurchaseItem.deleteMany({ where: { id: { in: purchaseIds } } });
      for (const lid of ledgerIds) {
        await db.$transaction(async (tx) => { await refreshLedgerInventoryFifoLots(tx, lid); }, { timeout: 30000, maxWait: 30000 });
      }
    }
    await db.ecountImportBatch.delete({ where: { id: existingBatch.id } });
    console.log("   기존 이카운트 batch 정리 완료");
  }

  const aliases = await loadAliasMaps();

  // PREVIEW batch + line 생성(앱 preview 경로와 동일하게 매핑/상태 산출)
  const lineStatuses = [];
  const batch = await db.ecountImportBatch.create({
    data: {
      fileName, fileHash, sheetName: parsed.sheetName,
      businessDate: utcDate(ECOUNT_TARGET_DAY),
      status: "PREVIEW", uploadedById: hqId,
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
        batchId: batch.id, rowNumber: line.rowNumber,
        dateNo: targetDateNo, // 6/17 → 6/24 재작성
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
  console.log(`→ 이카운트 batch 생성. 라인 ${parsed.lines.length}건, 상태=${batchStatus}`);

  if (batchStatus !== "READY") {
    const breakdown = {};
    for (const s of lineStatuses) breakdown[s] = (breakdown[s] ?? 0) + 1;
    console.log("   상태 분포:", breakdown);
    throw new Error(`batch가 READY가 아님(${batchStatus}). 매핑 누락 확인 필요.`);
  }

  // 커밋(commit) — ecount-supply-commit.ts 절차 재현
  const committed = await db.$transaction(
    async (tx) => {
      const full = await tx.ecountImportBatch.findUnique({
        where: { id: batch.id },
        include: { lines: { orderBy: { rowNumber: "asc" } } },
      });
      const affectedLedgerIds = new Set();
      let lineCount = 0;
      for (const line of full.lines) {
        const businessDate = ECOUNT_TARGET_DAY; // 이미 재작성됨
        const ledger = await getOrCreateStoreLedgerInTx(tx, line.storeId, businessDate, hqId);
        affectedLedgerIds.add(ledger.id);
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
        lineCount += 1;
      }
      for (const ledgerId of affectedLedgerIds) {
        // refreshLedgerInventoryFifoLots가 purchasedQuantity와 inventoryAmount를 재계산한다.
        // (조정행이 없으므로 reconcile 불필요)
        await refreshLedgerInventoryFifoLots(tx, ledgerId);
      }
      await tx.ecountImportBatch.update({
        where: { id: batch.id },
        data: { status: "COMMITTED", committedById: hqId, committedAt: new Date() },
      });
      return { lineCount, ledgerCount: affectedLedgerIds.size };
    },
    { timeout: 120000, maxWait: 30000 },
  );

  console.log(`✔ 이카운트 커밋 완료: ${committed.lineCount}행, 영향 장부 ${committed.ledgerCount}개 (영업일 ${ECOUNT_TARGET_DAY})`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
