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
  // WO-09: 지점 컨텍스트가 있으면 해당 지점의 표시명 alias를 우선 적용한다.
  // storeId가 없으면(본사 화면 등) 본사 등록명을 그대로 반환한다.
  storeId?: string,
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

  // 미팅 결정(2026-06-21): 코드 표시명은 지점별 덮어쓰기(alias)가 있으면
  // 해당 지점 화면에서 우선 적용한다. 코드 자체는 본사 등록값을 유지한다.
  const aliasByCodeId = storeId
    ? await getStoreAliasByCodeId(storeId, group)
    : new Map<string, string>();

  return codes.map<LedgerInputCodeOption>((code) => {
    const groupValue = code.group;

    return {
      id: code.id,
      group: groupValue,
      groupLabel: getLedgerInputCodeGroupLabel(groupValue),
      name: aliasByCodeId.get(code.id) ?? code.name,
      displayOrder: code.displayOrder,
    };
  });
}

// 지점별 표시명 alias를 codeId -> displayName 맵으로 조회한다.
// 본사 등록명은 그대로 두고, 화면 표시명만 alias로 덮어쓰기 위한 용도다.
async function getStoreAliasByCodeId(
  storeId: string,
  group?: LedgerInputCodeGroupValue,
) {
  const aliases = await db.ledgerInputCodeStoreAlias.findMany({
    where: {
      storeId,
      ...(group ? { ledgerInputCode: { group } } : {}),
    },
    select: { ledgerInputCodeId: true, displayName: true },
  });

  return new Map(
    aliases.map((alias) => [alias.ledgerInputCodeId, alias.displayName]),
  );
}
