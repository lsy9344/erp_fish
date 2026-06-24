import type { Prisma } from "../../../generated/prisma";

import { db } from "~/server/db";
import { getKstBusinessDate } from "~/features/ledger/date";
import {
  type SalesPlanItem,
  type SalesPlanLossContextItem,
  type SalesPricePlanStepData,
} from "./types";

const salesPlanSelect = {
  id: true,
  productId: true,
  plannedUnitPrice: true,
  memo: true,
  updatedAt: true,
  product: {
    select: {
      name: true,
      category: true,
      spec: true,
    },
  },
} as const;

type SalesPlanPayload = Prisma.StoreSalesPricePlanGetPayload<{
  select: typeof salesPlanSelect;
}>;

function toSalesPlanItem(plan: SalesPlanPayload): SalesPlanItem {
  return {
    id: plan.id,
    productId: plan.productId,
    productName: plan.product.name,
    productCategory: plan.product.category,
    productSpec: plan.product.spec,
    plannedUnitPrice: plan.plannedUnitPrice,
    memo: plan.memo,
    updatedAt: plan.updatedAt.toISOString(),
  };
}

export async function getSalesPricePlanStepDataInTx(
  tx: Prisma.TransactionClient,
  storeId: string,
  businessDate: string | Date,
): Promise<SalesPricePlanStepData> {
  const businessDateValue = getKstBusinessDate(businessDate);
  const businessDateParam = businessDateValue.toISOString().slice(0, 10);

  const [productOptions, plans] = await Promise.all([
    tx.product.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        category: true,
        spec: true,
      },
    }),
    tx.storeSalesPricePlan.findMany({
      where: { storeId, businessDate: businessDateValue },
      select: salesPlanSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  const planItems = plans.map(toSalesPlanItem);
  const latestUpdatedAt = planItems.reduce<string | null>(
    (latest, plan) =>
      latest === null || plan.updatedAt > latest ? plan.updatedAt : latest,
    null,
  );

  return {
    storeId,
    businessDate: businessDateParam,
    updatedAt: latestUpdatedAt,
    productOptions,
    plans: planItems,
  };
}

export async function getSalesPricePlanStepData(
  storeId: string,
  businessDate: string | Date,
): Promise<SalesPricePlanStepData> {
  return db.$transaction((tx) =>
    getSalesPricePlanStepDataInTx(tx, storeId, businessDate),
  );
}

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
