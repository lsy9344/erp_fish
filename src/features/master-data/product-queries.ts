import { requireHeadquartersUser } from "~/server/authz";
import { db } from "~/server/db";
import { PRODUCT_CATEGORY_VALUES } from "./product-schemas";

export type ProductCategory = (typeof PRODUCT_CATEGORY_VALUES)[number];
export type ProductCategoryFilter = "all" | ProductCategory;
export type ProductStatusFilter = "all" | "active" | "inactive";

export type ProductListItem = {
  id: string;
  name: string;
  category: ProductCategory;
  spec: string;
  defaultUnitPrice: number;
  isActive: boolean;
  updatedAt: string;
  updatedByName: string;
};

export type ProductListFilters = {
  q?: string;
  category?: ProductCategoryFilter;
  status?: ProductStatusFilter;
};

export function normalizeProductSearch(value: string | string[] | undefined) {
  if (Array.isArray(value) || !value) {
    return "";
  }

  return value.trim();
}

export function normalizeProductCategoryFilter(
  value: string | string[] | undefined,
): ProductCategoryFilter {
  if (
    typeof value === "string" &&
    PRODUCT_CATEGORY_VALUES.includes(value as ProductCategory)
  ) {
    return value as ProductCategory;
  }

  return "all";
}

export function normalizeProductStatusFilter(
  value: string | string[] | undefined,
): ProductStatusFilter {
  if (value === "active" || value === "inactive") {
    return value;
  }

  return "all";
}

export async function getProductsForHeadquarters(
  filters: ProductListFilters = {},
) {
  await requireHeadquartersUser();

  const q = filters.q?.trim();
  const category = filters.category ?? "all";
  const status = filters.status ?? "all";

  const products = await db.product.findMany({
    where: {
      ...(q
        ? {
            name: {
              contains: q,
              mode: "insensitive",
            },
          }
        : {}),
      ...(category === "all" ? {} : { category }),
      ...(status === "active" ? { isActive: true } : {}),
      ...(status === "inactive" ? { isActive: false } : {}),
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      category: true,
      spec: true,
      defaultUnitPrice: true,
      isActive: true,
      updatedAt: true,
      updatedBy: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  return products.map<ProductListItem>((product) => ({
    id: product.id,
    name: product.name,
    category: product.category as ProductCategory,
    spec: product.spec,
    defaultUnitPrice: product.defaultUnitPrice,
    isActive: product.isActive,
    updatedAt: product.updatedAt.toISOString(),
    updatedByName:
      product.updatedBy?.name ?? product.updatedBy?.email ?? "시스템",
  }));
}

export async function getActiveProductOptions() {
  await requireHeadquartersUser();

  return db.product.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      category: true,
      spec: true,
      defaultUnitPrice: true,
    },
  });
}
