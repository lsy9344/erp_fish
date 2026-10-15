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
  "LongStockThresholdSetting",
  "ReportExport",
  "EcountImportBatch",
  "InventoryOpeningSnapshot",
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
  { value: "LongStockThresholdSetting", label: "장기재고 기준일" },
  { value: "ReportExport", label: "리포트 Export" },
  { value: "EcountImportBatch", label: "이카운트 출고/입고" },
  { value: "InventoryOpeningSnapshot", label: "월초 재고 스냅샷" },
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
  "ledger.created": "장부 생성",
  "ledger.sales_payment.updated": "매출/결제 저장",
  "ledger.expenses.saved": "지출 저장",
  "ledger.purchases.saved": "매입 저장",
  "ledger.inventory.saved": "재고 저장",
  "ledger.inventory_adjustment.saved": "재고 조정",
  "ledger.losses.saved": "손실 저장",
  "ledger.labor.saved": "근무자 저장",
  "ledger.work_info.saved": "근무 정보 저장",
  "ledger.labor_amount.restored_from_audit": "근무 금액 복구",
  "ledger.repair.gangseo_0803_fifo.applied": "재고 원가 보정",
  "ledger.hq.labor.saved": "본사 근무자 수정",
  "ledger.hq.bulk_closed": "본사 일괄 마감",
  "store.deleted": "삭제",
  "user.deleted": "삭제",
  "user.credentials_updated": "로그인 정보 변경",
  "user.permission_profiles_changed": "권한 프로필 변경",
  "ledger.review.submitted": "지점 제출",
  "ledger.hq.sales_payment.updated": "본사 매출/결제 수정",
  "ledger.hq.expenses.saved": "본사 비용 수정",
  "ledger.hq.purchases.saved": "본사 매입 수정",
  "ledger.hq.closed": "본사 마감",
  "correction.created": "정정 기록 추가",
  "ledger.hq.inventory.saved": "본사 재고 수정",
  "ledger.hq.inventory_adjustment.saved": "본사 재고 조정",
  "ledger.hq.losses.saved": "본사 손실 수정",
  "ledger.hq.work_info.saved": "본사 근무 정보 수정",
  "ledger.employee_link.backfilled": "직원 정보 근무기록 연결",
  "ledger.employee_wage.updated": "과거 직원 일급 변경",
  "inventory_opening_snapshot.imported": "재고 파일 업로드",
  "inventory_opening_snapshot.carryover_repaired": "과거재고 이월 누락 복구",
  "threshold.updated": "기준값 변경",
  "long_stock_threshold.created": "장기재고 기준일 등록",
  "long_stock_threshold.updated": "장기재고 기준일 변경",
  "report.export.created": "리포트 Export 생성",
  "report.export.denied": "리포트 Export 거부",
  "ledger.hq.ecount_unit_price.overridden":
    "본사 이카운트 출고/입고 적용 단가 보정",
  "ledger.hq.purchases.unit_price.overridden":
    "본사 이카운트 출고/입고 적용 단가 보정",
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
  reportMarginGapThresholdBps: "리포트 마진 차이 기준(bp)",
  role: "권한",
  scope: "범위",
  storeName: "지점명",
  targetName: "대상 이름",
  threshold: "기준값",
  thresholdDays: "기준일(일)",
  unitPrice: "장부 적용 단가",
  // WO-05(2026-06-28): 장부 관련 대표 필드를 한글로 매핑해 raw key 의존을 줄인다.
  totalSalesAmount: "총매출",
  carryoverSalesAmount: "이월 매출",
  cashAmount: "현금",
  cardAmount: "카드",
  otherPaymentAmount: "기타 결제수단",
  workerCount: "근무인원",
  sourceUnitPrice: "원본 이카운트 단가",
  currentQuantity: "당일재고",
  reason: "사유",
  status: "상태",
  closedAt: "마감 시각",
  submittedAt: "제출 시각",
  authorDisplayName: "작성자",
  workMemo: "근무 메모",
  expenseItems: "지출 항목",
  expenseTotal: "지출 합계",
  purchaseItems: "매입 항목",
  purchaseTotal: "매입 합계",
  laborItems: "근무자",
  payrollTotal: "인건비 합계",
  lossItems: "손실 항목",
  items: "재고 품목",
  grossProfit: "영업이익",
  productivity: "인당생산성",
  paymentDifferenceAmount: "마감 정산 차액",
  spec: "규격",
  defaultUnitPrice: "참고 단가",
  appliedUnitPrice: "적용 단가",
  inventoryAmount: "재고금액",
  adjustment: "재고 조정",
  beforeQuantity: "조정 전 수량",
  afterQuantity: "조정 후 수량",
  differenceQuantity: "차이 수량",
  beforeAmount: "조정 전 금액",
  afterAmount: "조정 후 금액",
  differenceAmount: "차이 금액",
  displayName: "표시 이름",
  rawName: "원본 이름",
  rawSpec: "원본 규격",
  marginRateBps: "마진율 기준(bp)",
  loginId: "로그인 ID",
  passwordChanged: "비밀번호 변경",
  profileNames: "권한 프로필",
  storeNames: "배정 지점",
  fileName: "파일명",
  startDate: "적용 시작일",
  endDate: "적용 종료일",
};

// 상태·권한 코드값을 화면 말로 바꾼다.
const auditSummaryValueLabels: Record<string, string> = {
  IN_PROGRESS: "작성 중",
  IN_REVIEW: "검토 중",
  HEADQUARTERS_CLOSED: "본사 마감",
  HOLIDAY: "휴무",
  HEADQUARTERS: "본사",
  STORE_MANAGER: "지점장",
  GLOBAL: "전체",
  READY: "반영 가능",
  COMMITTED: "반영됨",
  FAILED: "오류",
  VOIDED: "취소됨",
};

// 목록 항목(지출·매입·재고 등)을 한 줄로 설명할 때 쓰는 이름/세부 필드.
const auditItemNameKeys = [
  "productName",
  "ledgerInputCodeName",
  "workerName",
  "name",
  "displayName",
] as const;

const auditItemDetailLabels = {
  currentQuantity: "당일재고",
  quantity: "수량",
  unitPrice: "단가",
  amount: "금액",
  inventoryAmount: "재고금액",
  reason: "사유",
  memo: "메모",
} as const;

const auditMoneyFieldPattern =
  /(?:^amount|Amount|Price|Total|Profit|^productivity)$/;
const auditDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const auditDateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

function isJsonObject(
  value: Prisma.JsonValue | null | undefined,
): value is Prisma.JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatAuditSummaryValue(
  key: string,
  value: Prisma.JsonValue | null | undefined,
): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "boolean") {
    if (key === "isActive") {
      return value ? "활성" : "비활성";
    }

    return value ? "예" : "아니오";
  }

  if (typeof value === "number") {
    // 예전 기록에는 소수 인당생산성이 남아 있어 금액은 원 단위로 보여준다.
    return auditMoneyFieldPattern.test(key)
      ? `${Math.round(value).toLocaleString("ko-KR")}원`
      : value.toLocaleString("ko-KR");
  }

  if (typeof value === "string") {
    if (auditDateTimePattern.test(value)) {
      return auditDateTimeFormatter.format(new Date(value));
    }

    return auditSummaryValueLabels[value] ?? value;
  }

  if (Array.isArray(value)) {
    return value.length === 0
      ? "없음"
      : value
          .map((item) =>
            isJsonObject(item)
              ? describeAuditItem(item)
              : formatAuditSummaryValue(key, item),
          )
          .join(", ");
  }

  return describeAuditItem(value);
}

function getAuditItemName(item: Prisma.JsonObject) {
  const name = auditItemNameKeys
    .map((key) => item[key])
    .find(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    );
  const spec =
    typeof item.productSpec === "string" && item.productSpec.trim()
      ? ` ${item.productSpec}`
      : "";

  return name ? `${name}${spec}` : "항목";
}

function describeAuditItem(item: Prisma.JsonObject) {
  const details = Object.entries(auditItemDetailLabels).flatMap(
    ([key, label]) => {
      const value = item[key];

      if (value === null || value === undefined || value === "") {
        return [];
      }

      // 재고 행의 quantity는 당일재고의 옛 필드라 당일재고가 있으면 생략한다.
      if (key === "quantity" && item.currentQuantity !== undefined) {
        return [];
      }

      return [`${label} ${formatAuditSummaryValue(key, value)}`];
    },
  );

  return [getAuditItemName(item), ...details].join(" · ");
}

// 목록은 저장할 때마다 행 id가 새로 생겨 id로 짝지을 수 없다. 설명이 같은 행은
// 변경 없음으로 지우고, 남은 행은 이름이 같으면 변경, 아니면 삭제/추가로 보여준다.
function formatAuditItemChanges(
  label: string,
  before: Prisma.JsonValue[],
  after: Prisma.JsonValue[],
) {
  const toEntries = (items: Prisma.JsonValue[]) =>
    items.filter(isJsonObject).map((item) => ({
      name: getAuditItemName(item),
      text: describeAuditItem(item),
    }));
  const removed = toEntries(before);
  const added = toEntries(after);

  for (let index = removed.length - 1; index >= 0; index -= 1) {
    const sameIndex = added.findIndex(
      (entry) => entry.text === removed[index]!.text,
    );

    if (sameIndex >= 0) {
      removed.splice(index, 1);
      added.splice(sameIndex, 1);
    }
  }

  const lines: string[] = [];

  for (const entry of removed) {
    const nextIndex = added.findIndex((next) => next.name === entry.name);

    if (nextIndex < 0) {
      lines.push(`${label} 삭제: ${entry.text}`);
      continue;
    }

    const [next] = added.splice(nextIndex, 1);
    lines.push(`${label} 변경: ${entry.text} → ${next!.text}`);
  }

  for (const entry of added) {
    lines.push(`${label} 추가: ${entry.text}`);
  }

  return lines;
}

function hasAuditItemObjects(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) && value.some(isJsonObject);
}

// 한글 라벨이 있는 필드만 요약한다. id·버전·내부 상태 같은 값은
// "원문 변경 전/후(JSON)"에서만 본다.
function collectAuditChangeLines(
  before: Prisma.JsonObject,
  after: Prisma.JsonObject,
  prefix: string,
): string[] {
  return Array.from(
    new Set([...Object.keys(before), ...Object.keys(after)]),
  ).flatMap((key) => {
    const fieldLabel = auditSummaryFieldLabels[key];
    const beforeValue = before[key];
    const afterValue = after[key];

    if (!fieldLabel || isSameAuditValue(beforeValue, afterValue)) {
      return [];
    }

    const label = `${prefix}${fieldLabel}`;

    if (hasAuditItemObjects(beforeValue) || hasAuditItemObjects(afterValue)) {
      return formatAuditItemChanges(
        label,
        Array.isArray(beforeValue) ? beforeValue : [],
        Array.isArray(afterValue) ? afterValue : [],
      );
    }

    if (isJsonObject(beforeValue) || isJsonObject(afterValue)) {
      return collectAuditChangeLines(
        isJsonObject(beforeValue) ? beforeValue : {},
        isJsonObject(afterValue) ? afterValue : {},
        `${label} · `,
      );
    }

    return [
      `${label}: ${formatAuditSummaryValue(key, beforeValue)} → ${formatAuditSummaryValue(key, afterValue)}`,
    ];
  });
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
  if (!isJsonObject(before) && !isJsonObject(after)) {
    return isSameAuditValue(before, after)
      ? "-"
      : `값: ${formatAuditSummaryValue("", before)} → ${formatAuditSummaryValue("", after)}`;
  }

  const lines = collectAuditChangeLines(
    isJsonObject(before) ? before : {},
    isJsonObject(after) ? after : {},
    "",
  );

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
