import { requireAppUser, requireSettingsAccess } from "~/server/authz";
import { db } from "~/server/db";
import type { ProductCategory } from "./product-queries";

export type PurchaseStandardStatusFilter = "all" | "active" | "inactive";

export type PurchaseStandardListItem = {
  id: string;
  productId: string;
  productName: string;
  productCategory: ProductCategory;
  productSpec: string;
  productIsActive: boolean;
  standardUnitPrice: number | null;
  referenceInfo: string | null;
  isActive: boolean;
  updatedAt: string;
  updatedByName: string;
};

export type PurchaseStandardListFilters = {
  status?: PurchaseStandardStatusFilter;
};

export function normalizePurchaseStandardStatusFilter(
  value: string | string[] | undefined,
): PurchaseStandardStatusFilter {
  if (value === "active" || value === "inactive") {
    return value;
  }

  return "all";
}

export async function getPurchaseStandardsForHeadquarters(
  filters: PurchaseStandardListFilters = {},
) {
  await requireSettingsAccess();

  const status = filters.status ?? "all";

  const standards = await db.purchaseStandard.findMany({
    where: {
      ...(status === "active"
        ? { isActive: true, product: { isActive: true } }
        : {}),
      ...(status === "inactive"
        ? {
            OR: [{ isActive: false }, { product: { isActive: false } }],
          }
        : {}),
    },
    orderBy: [{ product: { name: "asc" } }, { id: "asc" }],
    select: {
      id: true,
      standardUnitPrice: true,
      referenceInfo: true,
      isActive: true,
      updatedAt: true,
      product: {
        select: {
          id: true,
          name: true,
          category: true,
          spec: true,
          isActive: true,
        },
      },
      updatedBy: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  return standards.map<PurchaseStandardListItem>((standard) => ({
    id: standard.id,
    productId: standard.product.id,
    productName: standard.product.name,
    productCategory: standard.product.category as ProductCategory,
    productSpec: standard.product.spec,
    productIsActive: standard.product.isActive,
    standardUnitPrice: standard.standardUnitPrice,
    referenceInfo: standard.referenceInfo,
    isActive: standard.isActive,
    updatedAt: standard.updatedAt.toISOString(),
    updatedByName:
      standard.updatedBy?.name ?? standard.updatedBy?.email ?? "시스템",
  }));
}

export async function getActivePurchaseStandardOptions() {
  await requireAppUser();

  return db.purchaseStandard.findMany({
    where: {
      isActive: true,
      product: { isActive: true },
    },
    orderBy: [{ product: { name: "asc" } }, { id: "asc" }],
    select: {
      id: true,
      standardUnitPrice: true,
      referenceInfo: true,
      product: {
        select: {
          id: true,
          name: true,
          category: true,
          spec: true,
        },
      },
    },
  });
}
