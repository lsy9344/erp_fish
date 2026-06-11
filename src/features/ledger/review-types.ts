import type { DailyLedgerStatus } from "../../../generated/prisma";
import type { LedgerReviewSummary } from "~/server/calculations/ledger";

export type LedgerReviewMissingItem = {
  id: string;
  label: string;
  href: string;
  status: "missing" | "review";
  detail: string;
};

export type LedgerReviewWarning = {
  id: string;
  label: string;
  detail: string;
  amount?: number;
};

export type LedgerReviewSignal = {
  id: string;
  label: string;
  detail: string;
  amount?: number;
  quantity?: number;
};

export type LedgerReviewStepData = {
  id: string;
  storeId: string;
  closingDate: string;
  status: DailyLedgerStatus;
  submittedById: string | null;
  submittedAt: string | null;
  summary: LedgerReviewSummary;
  missingItems: LedgerReviewMissingItem[];
  warnings: LedgerReviewWarning[];
  signals: LedgerReviewSignal[];
};

export type StoreManagerLedgerReviewSummary = Pick<
  LedgerReviewSummary,
  "totalSales" | "paymentDifference"
>;

export type StoreManagerLedgerReviewSignal = Omit<
  LedgerReviewSignal,
  "amount"
>;

export type StoreManagerLedgerReviewStepData = Omit<
  LedgerReviewStepData,
  "summary" | "signals"
> & {
  summary: StoreManagerLedgerReviewSummary;
  signals: StoreManagerLedgerReviewSignal[];
};

export type LedgerSubmitForReviewResult = {
  status: "submitted" | "already-in-review";
  ledger: Pick<
    LedgerReviewStepData,
    | "id"
    | "storeId"
    | "closingDate"
    | "status"
    | "submittedById"
    | "submittedAt"
  >;
};
