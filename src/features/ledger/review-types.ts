import type { DailyLedgerStatus } from "../../../generated/prisma";
import type {
  LedgerReviewMetric,
  LedgerReviewSummary,
} from "~/server/calculations/ledger";

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

export type LedgerReviewStepId =
  | "sales"
  | "expenses"
  | "purchases"
  | "inventory"
  | "losses"
  | "work";

export type LedgerReviewStepStatus =
  | "saved"
  | "missing"
  | "review"
  | "needs-attention";

export type LedgerReviewStepMetric = {
  id: string;
  label: string;
  value: number | string | null;
  kind: "krw" | "signed-krw" | "text" | "status";
  status: LedgerReviewMetric["status"];
  detail?: string;
};

export type LedgerReviewStepSummary = {
  id: LedgerReviewStepId;
  label: string;
  status: LedgerReviewStepStatus;
  detail: string;
  href: string;
  metrics: LedgerReviewStepMetric[];
};

export type LedgerReviewStepData = {
  id: string;
  storeId: string;
  closingDate: string;
  updatedAt: string;
  version: number;
  authorDisplayName: string | null;
  status: DailyLedgerStatus;
  submittedById: string | null;
  submittedAt: string | null;
  summary: LedgerReviewSummary;
  missingItems: LedgerReviewMissingItem[];
  warnings: LedgerReviewWarning[];
  signals: LedgerReviewSignal[];
  stepSummaries: LedgerReviewStepSummary[];
};

export type StoreManagerLedgerReviewSummary = Pick<
  LedgerReviewSummary,
  "totalSales" | "paymentDifference"
>;

export type StoreManagerLedgerReviewSignal = Omit<LedgerReviewSignal, "amount">;

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
    | "updatedAt"
    | "version"
    | "authorDisplayName"
    | "status"
    | "submittedById"
    | "submittedAt"
  >;
};
