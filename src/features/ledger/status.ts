import type { DailyLedgerStatus } from "../../../generated/prisma";

export type LedgerDisplayStatusKey = DailyLedgerStatus | "EMPTY";
export type LedgerDisplayStatusLabel =
  | "미입력"
  | "입력 중"
  | "검토 대기"
  | "본사 마감"
  | "휴무";

export type LedgerDisplayStatus = {
  key: LedgerDisplayStatusKey;
  label: LedgerDisplayStatusLabel;
};

export function mapLedgerStatus(
  status: DailyLedgerStatus | null,
): LedgerDisplayStatus {
  switch (status) {
    case "IN_PROGRESS":
      return { key: "IN_PROGRESS", label: "입력 중" };
    case "IN_REVIEW":
      return { key: "IN_REVIEW", label: "검토 대기" };
    case "HEADQUARTERS_CLOSED":
      return { key: "HEADQUARTERS_CLOSED", label: "본사 마감" };
    case "HOLIDAY":
      return { key: "HOLIDAY", label: "휴무" };
    default:
      return { key: "EMPTY", label: "미입력" };
  }
}
