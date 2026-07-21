import type { Prisma } from "../../../generated/prisma";

import { editableLedgerStatuses } from "~/features/ledger/status-policy";
import { decimalToNumber } from "~/lib/decimal";
import { toPlannedPriceLossSnapshot } from "./amount";

export async function syncLedgerLossItemsWithSalesPricePlansInTx(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    businessDate: Date;
    dailyLedgerId?: string;
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
        dailyLedgerId: input.dailyLedgerId,
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

  // 이 helper는 손실 파생값만 갱신한다. 장부 version과 검토 metadata는 이 helper를
  // 호출한 writer가 소유해야 한 저장에서 CAS/version 증가가 두 번 일어나지 않는다.
  const affectedLedgerIds = new Set<string>();

  await Promise.all(
    lossItems.flatMap((loss) => {
      const snapshot = toPlannedPriceLossSnapshot({
        plannedUnitPrice:
          plannedUnitPriceByProductId.get(loss.productId) ?? null,
        quantity: decimalToNumber(loss.quantity),
        recoveredAmount: loss.recoveredAmount,
      });

      // 값이 그대로면 update조차 실행하지 않는다(무음 변경 방지).
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

  return { affectedLedgerIds: [...affectedLedgerIds] };
}
