import type { Prisma } from "../../../generated/prisma";

import { getKstBusinessDate } from "~/features/ledger/date";
import { db } from "~/server/db";
import { type SalesPlanLossContextItem } from "./types";

// 손실 입력에서 실제 판매/회수액과 비교할 품목별 계획 판매가.
// 품목별 실판매가가 없으므로 표시 라벨은 추정(estimated)을 유지한다.
export async function getSalesPlanLossContextInTx(
  tx: Prisma.TransactionClient,
  storeId: string,
  businessDate: string | Date,
): Promise<SalesPlanLossContextItem[]> {
  const businessDateValue = getKstBusinessDate(businessDate);

  const plans = await tx.storeSalesPricePlan.findMany({
    where: { storeId, businessDate: businessDateValue },
    select: {
      productId: true,
      plannedUnitPrice: true,
      product: { select: { name: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return plans.map((plan) => ({
    productId: plan.productId,
    productName: plan.product.name,
    plannedUnitPrice: plan.plannedUnitPrice,
    estimated: true,
  }));
}

export async function getSalesPlanLossContext(
  storeId: string,
  businessDate: string | Date,
): Promise<SalesPlanLossContextItem[]> {
  return db.$transaction((tx) =>
    getSalesPlanLossContextInTx(tx, storeId, businessDate),
  );
}

// point_summary 검토 후속(2026-06-24): 리포트의 추정 매출/계획 비교는 회의 결정대로
// "지점장 판매가 계획"(plannedUnitPrice) 기준으로 산출한다. 여러 (store, date) 마감을
// 한 번에 처리해야 하므로 (storeId, businessDate) 쌍 집합으로 계획 판매가를 일괄 조회해
// 조회 함수를 돌려준다. businessDate는 closingDate와 동일한 KST 마감일 기준 Date를 쓴다.
export type PlannedUnitPriceLookup = (
  storeId: string,
  businessDate: Date,
  productId: string,
) => number | null;

function plannedUnitPriceKey(
  storeId: string,
  businessDate: Date,
  productId: string,
) {
  return `${storeId}|${businessDate.toISOString()}|${productId}`;
}

export async function getPlannedUnitPriceLookup(
  pairs: Array<{ storeId: string; businessDate: Date }>,
): Promise<PlannedUnitPriceLookup> {
  const uniquePairs = new Map<
    string,
    { storeId: string; businessDate: Date }
  >();
  for (const pair of pairs) {
    uniquePairs.set(`${pair.storeId}|${pair.businessDate.toISOString()}`, pair);
  }

  if (uniquePairs.size === 0) {
    return () => null;
  }

  const plans = await db.storeSalesPricePlan.findMany({
    where: {
      OR: [...uniquePairs.values()].map((pair) => ({
        storeId: pair.storeId,
        businessDate: pair.businessDate,
      })),
    },
    select: {
      storeId: true,
      businessDate: true,
      productId: true,
      plannedUnitPrice: true,
    },
  });

  const byKey = new Map<string, number>();
  for (const plan of plans) {
    byKey.set(
      plannedUnitPriceKey(plan.storeId, plan.businessDate, plan.productId),
      plan.plannedUnitPrice,
    );
  }

  return (storeId, businessDate, productId) =>
    byKey.get(plannedUnitPriceKey(storeId, businessDate, productId)) ?? null;
}
