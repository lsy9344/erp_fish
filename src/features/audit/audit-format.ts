import type { Prisma } from "../../../generated/prisma";

export const AUDIT_HISTORY_TARGET_TYPES = [
  "Store",
  "User",
  "Product",
  "PurchaseStandard",
  "LedgerInputCode",
  "DailyLedger",
  "CorrectionRecord",
  "AnomalyThresholdSetting",
  "ReportExport",
  "EcountImportBatch",
  "StoreExternalAlias",
  "ProductExternalAlias",
] as const;

export type AuditHistoryTargetType =
  (typeof AUDIT_HISTORY_TARGET_TYPES)[number];

export type AuditHistoryTargetTypeFilter = "all" | AuditHistoryTargetType;

export const AUDIT_TARGET_TYPE_OPTIONS = [
  { value: "Store", label: "지점" },
  { value: "User", label: "사용자/권한" },
  { value: "Product", label: "품목" },
  { value: "PurchaseStandard", label: "품목 참고 단가" },
  { value: "LedgerInputCode", label: "코드" },
  { value: "DailyLedger", label: "장부" },
  { value: "CorrectionRecord", label: "정정 기록" },
  { value: "AnomalyThresholdSetting", label: "이상 신호 기준값" },
  { value: "ReportExport", label: "리포트 Export" },
  { value: "EcountImportBatch", label: "이카운트 출고/입고" },
  { value: "StoreExternalAlias", label: "지점 매핑" },
  { value: "ProductExternalAlias", label: "품목 매핑" },
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
  "ledger.hq.closed": "본사 마감",
  "correction.created": "정정 기록 추가",
  "ledger.hq.inventory.saved": "본사 재고 수정",
  "ledger.hq.inventory_adjustment.saved": "본사 재고 조정",
  "ledger.hq.losses.saved": "본사 손실 수정",
  "ledger.hq.work_info.saved": "본사 근무 정보 수정",
  "threshold.updated": "기준값 변경",
  "report.export.created": "리포트 Export 생성",
  "report.export.denied": "리포트 Export 거부",
  "ledger.hq.ecount_unit_price.overridden": "본사 이카운트 출고/입고 적용 단가 보정",
  "ledger.hq.purchases.unit_price.overridden": "본사 이카운트 출고/입고 적용 단가 보정",
  "ecount_supply_import.previewed": "이카운트 출고/입고 미리보기",
  "ecount_supply_import.committed": "이카운트 출고/입고 반영",
  "ecount_supply_import.voided": "이카운트 출고/입고 취소",
  "store_external_alias.created": "지점 매핑 생성",
  "store_external_alias.updated": "지점 매핑 수정",
  "product_external_alias.created": "품목 매핑 생성",
  "product_external_alias.updated": "품목 매핑 수정",
};

const snapshotNameKeys = [
  "name",
  "email",
  "productName",
  "storeName",
  "codeName",
  "targetName",
] as const;

const auditSummaryFieldLabels: Record<string, string> = {
  amount: "금액",
  category: "분류",
  codeName: "코드명",
  displayOrder: "표시 순서",
  email: "이메일",
  isActive: "활성 상태",
  name: "이름",
  productName: "품목명",
  quantity: "수량",
  role: "권한",
  scope: "범위",
  storeName: "지점명",
  targetName: "대상 이름",
  threshold: "기준값",
  unitPrice: "단가",
};

function isJsonObject(
  value: Prisma.JsonValue | null | undefined,
): value is Prisma.JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatAuditSummaryValue(value: Prisma.JsonValue | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value) ?? "-";
}

function isSameAuditValue(
  before: Prisma.JsonValue | null | undefined,
  after: Prisma.JsonValue | null | undefined,
) {
  if (before === null || before === undefined) {
    return after === null || after === undefined;
  }

  if (after === null || after === undefined) {
    return false;
  }

  if (Object.is(before, after)) {
    return true;
  }

  return JSON.stringify(before) === JSON.stringify(after);
}

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

export function formatAuditChangeSummary(
  before: Prisma.JsonValue | null | undefined,
  after: Prisma.JsonValue | null | undefined,
) {
  if (!isJsonObject(before) || !isJsonObject(after)) {
    return isSameAuditValue(before, after)
      ? "-"
      : `값: ${formatAuditSummaryValue(before)} → ${formatAuditSummaryValue(after)}`;
  }

  const lines = Array.from(
    new Set([...Object.keys(before), ...Object.keys(after)]),
  ).flatMap((key) => {
    const beforeValue = before[key];
    const afterValue = after[key];

    if (isSameAuditValue(beforeValue, afterValue)) {
      return [];
    }

    return [
      `${auditSummaryFieldLabels[key] ?? key}: ${formatAuditSummaryValue(beforeValue)} → ${formatAuditSummaryValue(afterValue)}`,
    ];
  });

  return lines.length > 0 ? lines.join("\n") : "-";
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
