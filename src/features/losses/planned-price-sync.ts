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
        productId: true,
        quantity: true,
        recoveredAmount: true,
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

  await Promise.all(
    lossItems.map((loss) => {
      const snapshot = toPlannedPriceLossSnapshot({
        plannedUnitPrice:
          plannedUnitPriceByProductId.get(loss.productId) ?? null,
        quantity: loss.quantity,
        recoveredAmount: loss.recoveredAmount,
      });

      return tx.ledgerLossItem.update({
        where: { id: loss.id },
        data: {
          ...snapshot,
          updatedById: input.actorId,
        },
      });
    }),
  );
}
