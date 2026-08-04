import type { DailyLedgerStatus } from "../../../generated/prisma";

export const editableLedgerStatuses = ["IN_PROGRESS", "IN_REVIEW"] as const;

export type EditableLedgerStatus = (typeof editableLedgerStatuses)[number];
export type ReadOnlyLedgerStatus = "HEADQUARTERS_CLOSED" | "HOLIDAY";
export type LedgerEditBlockCode = "LEDGER_CLOSED" | "LEDGER_NOT_EDITABLE";
export type LedgerEditBlockContext =
  | "original-entry"
  | "inventory-adjustment"
  | "loss-entry"
  | "submit-review"
  | "hq-close";

export type LedgerEditBlockReason = {
  code: LedgerEditBlockCode;
  message: string;
};

export function isLedgerEditable(
  status: string | null | undefined,
): status is EditableLedgerStatus {
  return editableLedgerStatuses.some(
    (editableStatus) => editableStatus === status,
  );
}

export function isLedgerReadOnly(
  status: string | null | undefined,
): status is ReadOnlyLedgerStatus {
  return status === "HEADQUARTERS_CLOSED" || status === "HOLIDAY";
}

// DESIGN.md D4/D5: 서버가 판정한 마감 편집 권한을 담은 액터 문맥. 클라이언트
// prop은 표시만 제어하며 최종 판정은 항상 서버 게이트가 한다(기본 false).
export type LedgerEditActorContext = {
  closedEditAllowed?: boolean;
};

/**
 * DESIGN.md D5: IN_PROGRESS/IN_REVIEW는 기존 정책대로 편집 가능하고,
 * HEADQUARTERS_CLOSED는 LEDGER_CLOSED_EDIT를 가진 액터 문맥에서만 편집 가능하다.
 * HOLIDAY는 어떤 문맥에서도 편집할 수 없다.
 */
export function isLedgerEditableForActor(
  status: string | null | undefined,
  actor: LedgerEditActorContext = {},
): boolean {
  if (isLedgerEditable(status)) {
    return true;
  }

  return Boolean(actor.closedEditAllowed) && status === "HEADQUARTERS_CLOSED";
}

/**
 * 저장 CAS where 절에 넣을 편집 가능 상태 목록. 마감 편집이 허용된 액터일 때만
 * HEADQUARTERS_CLOSED를 포함한다.
 */
export function getEditableLedgerStatusesForActor(
  actor: LedgerEditActorContext = {},
): readonly DailyLedgerStatus[] {
  return actor.closedEditAllowed
    ? [...editableLedgerStatuses, "HEADQUARTERS_CLOSED"]
    : editableLedgerStatuses;
}

// DESIGN.md D7: 마감 상태 유지 안내와 저장 성공 문구.
export const closedEditRetainedStatusNotice = "마감 상태 유지 · 마스터 수정";
export const closedEditSaveSuccessMessage =
  "마감 장부 내용을 저장했습니다. 마감 상태는 유지됩니다.";

export function getLedgerEditBlockReason(
  status: string,
  context: LedgerEditBlockContext = "original-entry",
): LedgerEditBlockReason {
  if (context === "submit-review") {
    return submitReviewBlockReason(status);
  }

  if (context === "hq-close") {
    return hqCloseBlockReason(status);
  }

  if (status === "HEADQUARTERS_CLOSED") {
    return {
      code: "LEDGER_CLOSED",
      message: `본사 마감된 장부는 ${getOriginalEditTarget(context)}으로 수정할 수 없습니다. 정정 기록을 사용해 주세요.`,
    };
  }

  if (status === "HOLIDAY") {
    return {
      code: "LEDGER_NOT_EDITABLE",
      message: `휴무 장부는 ${getOriginalEditTarget(context)}으로 수정할 수 없습니다. 정정 기록을 사용해 주세요.`,
    };
  }

  return {
    code: "LEDGER_NOT_EDITABLE",
    message: "수정할 수 없는 장부 상태입니다.",
  };
}

function getOriginalEditTarget(context: LedgerEditBlockContext) {
  switch (context) {
    case "inventory-adjustment":
      return "원본 재고 조정";
    case "loss-entry":
      return "원본 손실 입력";
    default:
      return "원본 항목";
  }
}

function submitReviewBlockReason(status: string) {
  if (status === "HEADQUARTERS_CLOSED") {
    return {
      code: "LEDGER_CLOSED",
      message: "본사 마감된 장부는 검토 대기로 제출할 수 없습니다.",
    } as const;
  }

  if (status === "HOLIDAY") {
    return {
      code: "LEDGER_NOT_EDITABLE",
      message: "휴무 장부는 검토 대기로 제출할 수 없습니다.",
    } as const;
  }

  return {
    code: "LEDGER_NOT_EDITABLE",
    message: "제출할 수 없는 장부 상태입니다.",
  } as const;
}

function hqCloseBlockReason(status: string) {
  if (status === "HOLIDAY") {
    return {
      code: "LEDGER_NOT_EDITABLE",
      message: "휴무 장부는 본사 마감할 수 없습니다.",
    } as const;
  }

  return {
    code: "LEDGER_NOT_EDITABLE",
    message: "본사 마감할 수 없는 장부 상태입니다.",
  } as const;
}
