import { requireSettingsAccess } from "~/server/authz";
import { db } from "~/server/db";

export type StoreStatusFilter = "all" | "active" | "inactive";

export type StoreListItem = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  updatedByName: string;
};

export type StoreListFilters = {
  q?: string;
  status?: StoreStatusFilter;
};

export function normalizeStoreStatusFilter(
  value: string | string[] | undefined,
): StoreStatusFilter {
  if (value === "active" || value === "inactive") {
    return value;
  }

  return "all";
}

export function normalizeStoreSearch(value: string | string[] | undefined) {
  if (Array.isArray(value) || !value) {
    return "";
  }

  return value.trim();
}

export async function getStoresForHeadquarters(filters: StoreListFilters = {}) {
  await requireSettingsAccess();

  const q = filters.q?.trim();
  const status = filters.status ?? "all";

  const stores = await db.store.findMany({
    where: {
      ...(q
        ? {
            name: {
              contains: q,
              mode: "insensitive",
            },
          }
        : {}),
      ...(status === "active" ? { isActive: true } : {}),
      ...(status === "inactive" ? { isActive: false } : {}),
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      updatedBy: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  return stores.map<StoreListItem>((store) => ({
    id: store.id,
    name: store.name,
    isActive: store.isActive,
    createdAt: store.createdAt.toISOString(),
    updatedAt: store.updatedAt.toISOString(),
    updatedByName: store.updatedBy?.name ?? store.updatedBy?.email ?? "시스템",
  }));
}

export async function getActiveStoreOptions() {
  await requireSettingsAccess();

  return db.store.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
    },
  });
}
