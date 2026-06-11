import { requireAppUser, requireSettingsAccess } from "~/server/authz";
import { db } from "~/server/db";
import {
  LEDGER_INPUT_CODE_GROUP_VALUES,
  getLedgerInputCodeGroupLabel,
  type LedgerInputCodeGroupValue,
} from "./code-schemas";

export type LedgerInputCodeGroupFilter = "all" | LedgerInputCodeGroupValue;
export type LedgerInputCodeStatusFilter = "all" | "active" | "inactive";

export type LedgerInputCodeListItem = {
  id: string;
  group: LedgerInputCodeGroupValue;
  groupLabel: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  updatedAt: string;
  updatedByName: string;
};

export type LedgerInputCodeListFilters = {
  q?: string;
  group?: LedgerInputCodeGroupFilter;
  status?: LedgerInputCodeStatusFilter;
};

export type LedgerInputCodeOption = {
  id: string;
  group: LedgerInputCodeGroupValue;
  groupLabel: string;
  name: string;
  displayOrder: number;
};

export function normalizeLedgerInputCodeSearch(
  value: string | string[] | undefined,
) {
  if (Array.isArray(value) || !value) {
    return "";
  }

  return value.trim();
}

export function normalizeLedgerInputCodeGroupFilter(
  value: string | string[] | undefined,
): LedgerInputCodeGroupFilter {
  if (
    typeof value === "string" &&
    LEDGER_INPUT_CODE_GROUP_VALUES.includes(value as LedgerInputCodeGroupValue)
  ) {
    return value as LedgerInputCodeGroupValue;
  }

  return "all";
}

export function normalizeLedgerInputCodeStatusFilter(
  value: string | string[] | undefined,
): LedgerInputCodeStatusFilter {
  if (value === "active" || value === "inactive") {
    return value;
  }

  return "all";
}

export async function getLedgerInputCodesForHeadquarters(
  filters: LedgerInputCodeListFilters = {},
) {
  await requireSettingsAccess();

  const q = filters.q?.trim();
  const group = filters.group ?? "all";
  const status = filters.status ?? "all";

  const codes = await db.ledgerInputCode.findMany({
    where: {
      ...(q
        ? {
            name: {
              contains: q,
              mode: "insensitive",
            },
          }
        : {}),
      ...(group === "all" ? {} : { group }),
      ...(status === "active" ? { isActive: true } : {}),
      ...(status === "inactive" ? { isActive: false } : {}),
    },
    orderBy: [
      { group: "asc" },
      { displayOrder: "asc" },
      { name: "asc" },
      { id: "asc" },
    ],
    select: {
      id: true,
      group: true,
      name: true,
      displayOrder: true,
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

  return codes.map<LedgerInputCodeListItem>((code) => {
    const groupValue = code.group;

    return {
      id: code.id,
      group: groupValue,
      groupLabel: getLedgerInputCodeGroupLabel(groupValue),
      name: code.name,
      displayOrder: code.displayOrder,
      isActive: code.isActive,
      updatedAt: code.updatedAt.toISOString(),
      updatedByName: code.updatedBy?.name ?? code.updatedBy?.email ?? "시스템",
    };
  });
}

export async function getActiveLedgerInputCodeOptions(
  group?: LedgerInputCodeGroupValue,
) {
  await requireAppUser();

  const codes = await db.ledgerInputCode.findMany({
    where: {
      isActive: true,
      ...(group ? { group } : {}),
    },
    orderBy: [
      { group: "asc" },
      { displayOrder: "asc" },
      { name: "asc" },
      { id: "asc" },
    ],
    select: {
      id: true,
      group: true,
      name: true,
      displayOrder: true,
    },
  });

  return codes.map<LedgerInputCodeOption>((code) => {
    const groupValue = code.group;

    return {
      id: code.id,
      group: groupValue,
      groupLabel: getLedgerInputCodeGroupLabel(groupValue),
      name: code.name,
      displayOrder: code.displayOrder,
    };
  });
}
