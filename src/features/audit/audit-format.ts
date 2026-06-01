import type { Prisma } from "../../../generated/prisma";

export const AUDIT_HISTORY_TARGET_TYPES = [
  "Store",
  "User",
  "Product",
  "PurchaseStandard",
  "LedgerInputCode",
  "DailyLedger",
  "AnomalyThresholdSetting",
] as const;

export type AuditHistoryTargetType =
  (typeof AUDIT_HISTORY_TARGET_TYPES)[number];

export type AuditHistoryTargetTypeFilter = "all" | AuditHistoryTargetType;

export const AUDIT_TARGET_TYPE_OPTIONS = [
  { value: "Store", label: "지점" },
  { value: "User", label: "사용자/권한" },
  { value: "Product", label: "품목" },
  { value: "PurchaseStandard", label: "매입 기준" },
  { value: "LedgerInputCode", label: "코드" },
  { value: "DailyLedger", label: "장부" },
  { value: "AnomalyThresholdSetting", label: "이상 신호 기준값" },
] as const satisfies ReadonlyArray<{
  value: AuditHistoryTargetType;
  label: string;
}>;

const targetTypeLabels = Object.fromEntries(
  AUDIT_TARGET_TYPE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<AuditHistoryTargetType, string>;

const actionLabels: Record<string, string> = {
  "store.created": "생성",
  "store.updated": "수정",
  "store.activated": "활성화",
  "store.deactivated": "비활성화",
  "user.created": "생성",
  "user.updated": "수정",
  "user.activated": "활성화",
  "user.deactivated": "비활성화",
  "user.role_changed": "역할 변경",
  "user.store_assignments_changed": "지점 배정 변경",
  "product.created": "생성",
  "product.updated": "수정",
  "product.activated": "활성화",
  "product.deactivated": "비활성화",
  "purchase_standard.created": "생성",
  "purchase_standard.updated": "수정",
  "purchase_standard.activated": "활성화",
  "purchase_standard.deactivated": "비활성화",
  "ledger_input_code.created": "생성",
  "ledger_input_code.updated": "수정",
  "ledger_input_code.activated": "활성화",
  "ledger_input_code.deactivated": "비활성화",
  "ledger_input_code.reordered": "표시 순서 변경",
  "ledger.review.submitted": "검토 대기 제출",
  "ledger.hq.sales_payment.updated": "본사 매출/결제 수정",
  "ledger.hq.expenses.saved": "본사 비용 수정",
  "ledger.hq.purchases.saved": "본사 매입 수정",
  "ledger.hq.inventory.saved": "본사 재고 수정",
  "ledger.hq.inventory_adjustment.saved": "본사 재고 조정",
  "ledger.hq.losses.saved": "본사 손실 수정",
  "ledger.hq.work_info.saved": "본사 근무 정보 수정",
  "threshold.updated": "기준값 변경",
};

const snapshotNameKeys = [
  "name",
  "email",
  "productName",
  "storeName",
  "codeName",
  "targetName",
] as const;

export function isAuditHistoryTargetType(
  value: string,
): value is AuditHistoryTargetType {
  return AUDIT_HISTORY_TARGET_TYPES.includes(value as AuditHistoryTargetType);
}

export function isValidAuditHistoryDateString(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function getAuditTargetTypeLabel(targetType: string) {
  return isAuditHistoryTargetType(targetType)
    ? targetTypeLabels[targetType]
    : targetType;
}

export function getAuditActionLabel(action: string) {
  return actionLabels[action] ?? action;
}

export function formatAuditJsonValue(
  value: Prisma.JsonValue | null | undefined,
) {
  if (value === null || value === undefined) {
    return "-";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2) ?? "-";
}

export function getSnapshotDisplayName(
  value: Prisma.JsonValue | null | undefined,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  for (const key of snapshotNameKeys) {
    const candidate = value[key];

    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return null;
}
