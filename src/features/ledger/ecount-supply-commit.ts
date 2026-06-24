"use server";

import {
  reconcileLedgerInventoryAdjustments,
  syncLedgerInventoryPurchasedQuantitiesInTx,
} from "~/features/inventory/adjustment-reconciliation";
import { refreshLedgerInventoryFifoLots } from "~/features/inventory/fifo-lots";
import { getOrCreateStoreLedgerInTx } from "~/features/ledger/queries";
import { ecountDateNoToDate } from "~/features/ledger/ecount-supply-mapping";
import {
  getEcountSupplyImportDetail,
  type EcountImportBatchDetail,
} from "~/features/ledger/ecount-supply-queries";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import { requireEcountUploadCommitAccess } from "~/server/authz";
import { db } from "~/server/db";
import { revalidateEcountImportPaths } from "~/server/revalidation";

class EcountCommitError extends Error {}

// "일자-No." 원문에서 영업일(YYYY-MM-DD)을 읽는다. 전표 번호(-1 등)는 무시한다.
const normalizeDateNoToBusinessDate = ecountDateNoToDate;

export async function commitEcountSupplyImport(
  batchId: string,
): Promise<
  ActionResult<{ detail: EcountImportBatchDetail; committedLineCount: number }>
> {
  const actor = await requireEcountUploadCommitAccess();

  try {
    const committedLineCount = await db.$transaction(async (tx) => {
      const batch = await tx.ecountImportBatch.findUnique({
        where: { id: batchId },
        include: { lines: { orderBy: { rowNumber: "asc" } } },
      });

      if (!batch) {
        throw new EcountCommitError("업로드 batch를 찾을 수 없습니다.");
      }

      if (batch.status !== "READY") {
        throw new EcountCommitError(
          "매핑이 끝난 commit 가능 상태(READY)에서만 반영할 수 있습니다.",
        );
      }

      // 영향받은 장부를 모아 commit 후 재고/FIFO를 한 번씩만 갱신한다.
      const affectedLedgerIds = new Set<string>();
      let lineCount = 0;

      for (const line of batch.lines) {
        if (!line.storeId || !line.productId) {
          throw new EcountCommitError(
            `${line.rowNumber}행: 지점/품목 매핑이 끝나지 않았습니다.`,
          );
        }

        const businessDate = normalizeDateNoToBusinessDate(line.dateNo);

        if (!businessDate) {
          throw new EcountCommitError(
            `${line.rowNumber}행: 일자-No.(${line.dateNo})에서 영업일을 읽을 수 없습니다.`,
          );
        }

        const ledger = await getOrCreateStoreLedgerInTx(
          tx,
          line.storeId,
          businessDate,
          actor.id,
        );

        affectedLedgerIds.add(ledger.id);

        // unitPrice = 장부 적용 단가(초기값은 원본 이카운트 단가).
        // sourceUnitPrice = 원본 이카운트 단가(보존).
        const purchaseItem = await tx.ledgerPurchaseItem.create({
          data: {
            dailyLedgerId: ledger.id,
            productId: line.productId,
            purchaseStandardId: null,
            sourceType: "ECOUNT_UPLOAD",
            productName: line.productName,
            productCategory: line.productCategory,
            productSpec: line.productSpec,
            unitPrice: line.unitPrice,
            quantity: line.quantity,
            amount: line.unitPrice * line.quantity,
            sourceUnitPrice: line.unitPrice,
            ecountImportLineId: line.id,
            referenceInfo: `이카운트 ${batch.sheetName} ${line.rowNumber}행 · 일자-No. ${line.dateNo} · 거래처 ${line.rawStoreName}`,
            createdById: actor.id,
            updatedById: actor.id,
          },
        });

        await tx.ecountImportLine.update({
          where: { id: line.id },
          data: {
            status: "COMMITTED",
            ledgerPurchaseItemId: purchaseItem.id,
          },
        });

        lineCount += 1;
      }

      // 영향받은 장부별로 재고 purchased quantity, 조정 정합, FIFO lot을 갱신한다.
      for (const ledgerId of affectedLedgerIds) {
        await syncLedgerInventoryPurchasedQuantitiesInTx(
          tx,
          ledgerId,
          actor.id,
        );
        await reconcileLedgerInventoryAdjustments(tx, ledgerId, actor.id);
        await refreshLedgerInventoryFifoLots(tx, ledgerId);
      }

      await tx.ecountImportBatch.update({
        where: { id: batch.id },
        data: {
          status: "COMMITTED",
          committedById: actor.id,
          committedAt: new Date(),
        },
      });

      await writeAuditLog(tx, {
        action: "ecount_supply_import.committed",
        targetType: "EcountImportBatch",
        targetId: batch.id,
        actorId: actor.id,
        before: { status: "READY" },
        after: {
          status: "COMMITTED",
          committedLineCount: lineCount,
          affectedLedgerCount: affectedLedgerIds.size,
        },
      });

      return lineCount;
    });

    revalidateEcountImportPaths(batchId);

    const detail = await getEcountSupplyImportDetail(batchId);

    if (!detail) {
      return actionError("NOT_FOUND", "업로드 batch를 찾을 수 없습니다.");
    }

    return actionOk({ detail, committedLineCount });
  } catch (error) {
    if (error instanceof EcountCommitError) {
      // 일부 지점 실패 시 transaction 전체가 rollback된다. batch를 FAILED로 내려
      // 실패 사유를 남기고, READY 상태가 아니므로 다시 commit되지 않게 한다.
      // (이미 COMMITTED/VOIDED인 batch는 상태를 덮어쓰지 않는다.)
      await db.ecountImportBatch.updateMany({
        where: {
          id: batchId,
          status: { notIn: ["COMMITTED", "VOIDED"] },
        },
        data: { status: "FAILED", errorMessage: error.message },
      });

      revalidateEcountImportPaths(batchId);

      return actionError("VALIDATION_ERROR", error.message, {
        file: [error.message],
      });
    }

    throw error;
  }
}

export async function voidEcountSupplyImport(
  batchId: string,
  reason: string,
): Promise<ActionResult<{ detail: EcountImportBatchDetail }>> {
  const actor = await requireEcountUploadCommitAccess();
  const trimmedReason = String(reason ?? "").trim();

  if (!trimmedReason) {
    return actionError("VALIDATION_ERROR", "취소 사유를 입력해 주세요.", {
      reason: ["취소 사유를 입력해 주세요."],
    });
  }

  try {
    await db.$transaction(async (tx) => {
      const batch = await tx.ecountImportBatch.findUnique({
        where: { id: batchId },
        select: { id: true, status: true },
      });

      if (!batch) {
        throw new EcountCommitError("업로드 batch를 찾을 수 없습니다.");
      }

      // commit 후 batch 취소는 장부 정정 정책이 정해지기 전까지 막는다.
      if (batch.status === "COMMITTED") {
        throw new EcountCommitError(
          "이미 장부에 반영된 batch는 취소할 수 없습니다. 본사 장부 정정으로 처리하세요.",
        );
      }

      if (batch.status === "VOIDED") {
        throw new EcountCommitError("이미 취소된 batch입니다.");
      }

      await tx.ecountImportLine.updateMany({
        where: { batchId: batch.id },
        data: { status: "VOIDED" },
      });

      await tx.ecountImportBatch.update({
        where: { id: batch.id },
        data: {
          status: "VOIDED",
          voidReason: trimmedReason,
          voidedById: actor.id,
          voidedAt: new Date(),
        },
      });

      await writeAuditLog(tx, {
        action: "ecount_supply_import.voided",
        targetType: "EcountImportBatch",
        targetId: batch.id,
        actorId: actor.id,
        before: { status: batch.status },
        after: { status: "VOIDED" },
        reason: trimmedReason,
      });
    });
  } catch (error) {
    if (error instanceof EcountCommitError) {
      return actionError("VALIDATION_ERROR", error.message, {
        reason: [error.message],
      });
    }

    throw error;
  }

  revalidateEcountImportPaths(batchId);

  const detail = await getEcountSupplyImportDetail(batchId);

  if (!detail) {
    return actionError("NOT_FOUND", "업로드 batch를 찾을 수 없습니다.");
  }

  return actionOk({ detail });
}
