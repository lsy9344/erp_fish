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
