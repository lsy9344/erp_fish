import type { CorrectionTargetType, Prisma } from "../../../generated/prisma";

export type CorrectionValueKind = "money" | "quantity" | "text" | "metric";

export type CorrectionValue = {
  kind: CorrectionValueKind;
  value: number | string | null;
  label?: string;
};

export type CorrectionTargetOption = {
  targetType: CorrectionTargetType;
  targetId: string;
  fieldKey: string;
  label: string;
  originalValue: CorrectionValue;
};

export type CorrectionRecordListItem = {
  id: string;
  dailyLedgerId: string;
  targetType: CorrectionTargetType;
  targetId: string;
  fieldKey: string;
  targetLabel: string;
  originalValue: Prisma.JsonValue;
  previousAppliedValue: Prisma.JsonValue;
  correctedValue: Prisma.JsonValue;
  reason: string;
  createdAt: string;
  createdBy: {
    name: string | null;
    email: string | null;
  };
};

export type CorrectionAppliedValue = {
  key: string;
  correctionId: string;
  dailyLedgerId: string;
  targetType: CorrectionTargetType;
  targetId: string;
  fieldKey: string;
  targetLabel: string;
  originalValue: Prisma.JsonValue;
  previousAppliedValue: Prisma.JsonValue;
  correctedValue: Prisma.JsonValue;
  latestAppliedValue: Prisma.JsonValue;
  reason: string;
  createdAt: string;
  createdBy: {
    name: string | null;
    email: string | null;
  };
};

export type CreateCorrectionRecordResult = {
  id: string;
  dailyLedgerId: string;
  targetType: CorrectionTargetType;
  targetId: string;
  fieldKey: string;
  correctedValue: Prisma.JsonValue;
  reason: string;
  createdAt: string;
};

export const correctionTargetTypeLabels: Record<CorrectionTargetType, string> =
  {
    LEDGER_FIELD: "장부 필드",
    PAYMENT_FIELD: "결제 필드",
    EXPENSE_ROW: "비용 행",
    PURCHASE_ROW: "매입 행",
    INVENTORY_ROW: "재고 행",
    LOSS_ROW: "손실 행",
    CALCULATED_METRIC: "계산 표시값",
  };
