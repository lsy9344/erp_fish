export const HEADQUARTERS_LABOR_STATUSES = [
  "IN_PROGRESS",
  "IN_REVIEW",
  "HEADQUARTERS_CLOSED",
] as const;

export type HeadquartersLaborLedgerStatus =
  (typeof HEADQUARTERS_LABOR_STATUSES)[number];

export type HeadquartersLaborStatusFilter =
  | "ALL"
  | HeadquartersLaborLedgerStatus;

export type HeadquartersLaborStoreOption = {
  id: string;
  name: string;
};

export type HeadquartersLaborDetail = {
  id: string;
  ledgerId: string;
  businessDate: string;
  storeId: string;
  storeName: string;
  status: HeadquartersLaborLedgerStatus;
  workerName: string;
  amount: number;
  lateMemo: string | null;
  earlyLeaveMemo: string | null;
  specialMemo: string | null;
};

export type HeadquartersLaborStoreSummary = {
  storeId: string;
  storeName: string;
  workdayCount: number;
  workerCount: number;
  laborAmount: number;
};

export type HeadquartersLaborReport = {
  monthInput: string;
  selectedStoreId: string | null;
  selectedStatus: HeadquartersLaborStatusFilter;
  stores: HeadquartersLaborStoreOption[];
  totalLaborAmount: number;
  storeCount: number;
  laborRecordCount: number;
  storeSummaries: HeadquartersLaborStoreSummary[];
  details: HeadquartersLaborDetail[];
  errorMessages: string[];
};
