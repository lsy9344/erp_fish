import type { Prisma } from "../../../generated/prisma";

import { editableLedgerStatuses } from "~/features/ledger/status-policy";
import { toPlannedPriceLossSnapshot } from "./amount";

export async function syncLedgerLossItemsWithSalesPricePlansInTx(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    businessDate: Date;
    productIds: string[];
    actorId: string;
  },
) {
  const productIds = [...new Set(input.productIds)].filter(Boolean);

  if (productIds.length === 0) {
    return;
  }

  const [lossItems, salesPricePlans] = await Promise.all([
    tx.ledgerLossItem.findMany({
      where: {
        productId: { in: productIds },
        dailyLedger: {
          storeId: input.storeId,
          closingDate: input.businessDate,
          status: { in: [...editableLedgerStatuses] },
        },
      },
      select: {
        id: true,
        dailyLedgerId: true,
        productId: true,
        quantity: true,
        recoveredAmount: true,
        unitPrice: true,
        amount: true,
        usedPlannedPrice: true,
      },
    }),
    tx.storeSalesPricePlan.findMany({
      where: {
        storeId: input.storeId,
        businessDate: input.businessDate,
        productId: { in: productIds },
      },
      select: {
        productId: true,
        plannedUnitPrice: true,
      },
    }),
  ]);

  if (lossItems.length === 0) {
    return;
  }

  const plannedUnitPriceByProductId = new Map(
    salesPricePlans.map((plan) => [plan.productId, plan.plannedUnitPrice]),
  );

  // 실제로 값이 바뀐 손실 항목만 업데이트하고, 영향받은 장부 id를 모은다.
  const affectedLedgerIds = new Set<string>();

  await Promise.all(
    lossItems.flatMap((loss) => {
      const snapshot = toPlannedPriceLossSnapshot({
        plannedUnitPrice:
          plannedUnitPriceByProductId.get(loss.productId) ?? null,
        quantity: loss.quantity,
        recoveredAmount: loss.recoveredAmount,
      });

      // 값이 그대로면 손실 검토 무효화/버전 증가를 일으키지 않는다(무음 변경 방지).
      const unchanged =
        snapshot.unitPrice === loss.unitPrice &&
        snapshot.amount === loss.amount &&
        snapshot.usedPlannedPrice === loss.usedPlannedPrice;

      if (unchanged) {
        return [];
      }

      affectedLedgerIds.add(loss.dailyLedgerId);

      return [
        tx.ledgerLossItem.update({
          where: { id: loss.id },
          data: {
            ...snapshot,
            updatedById: input.actorId,
          },
        }),
      ];
    }),
  );

  // 손실 금액이 바뀌면 해당 장부의 손실 검토를 무효화하고 버전을 올린다. 그래야 본사가
  // 이미 검토한 손실이 판매가 계획 저장으로 조용히 바뀌어 검토/낙관적 동시성이 어긋나지 않는다.
  // (LedgerPurchase 저장 경로와 동일한 처리: lossReviewed* 초기화 + version 증가.)
  if (affectedLedgerIds.size > 0) {
    await tx.dailyLedger.updateMany({
      where: { id: { in: [...affectedLedgerIds] } },
      data: {
        lossReviewedById: null,
        lossReviewedAt: null,
        updatedById: input.actorId,
        version: { increment: 1 },
      },
    });
  }

  return { affectedLedgerIds: [...affectedLedgerIds] };
}
