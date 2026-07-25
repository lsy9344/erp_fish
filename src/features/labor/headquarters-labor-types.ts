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
  // WO-25(2026-07-25) #8: 등록된 직원의 월 희망 수령액 분해(4대보험/현금). 직원과
  // 연결되지 않은 자유 입력 근무자는 null로 남는다.
  desiredInsuranceAmount: number | null;
  desiredCashAmount: number | null;
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
  selectedWorkerName: string | null;
  stores: HeadquartersLaborStoreOption[];
  totalLaborAmount: number;
  storeCount: number;
  laborRecordCount: number;
  storeSummaries: HeadquartersLaborStoreSummary[];
  details: HeadquartersLaborDetail[];
  errorMessages: string[];
};
