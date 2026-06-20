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
