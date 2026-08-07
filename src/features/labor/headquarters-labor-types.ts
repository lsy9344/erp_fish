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

// WO-0806 #2: 월급 지급 실무용 근무자 단위 집계.
// 희망 4대보험/현금은 월 단위 금액이라 일별 상세 행에는 넣을 수 없다.
export type HeadquartersLaborWorkerSettlement = {
  key: string;
  workerName: string;
  // 직원 미연결 동명이인을 지점별로 구분하고, 지급 전 근무 지점을 확인한다.
  storeNames: string[];
  position: string | null;
  bankAccount: string | null;
  workdayCount: number;
  laborAmount: number;
  desiredInsuranceAmount: number | null;
  // 자동계산: 인건비 합계 − 희망 4대보험. 계산 불가 시 null + 사유.
  desiredCashAmount: number | null;
  cashUnavailableReason: string | null;
};

export type HeadquartersLaborDateRange = {
  // 기존 `?month=` 계약 호환을 위해 남긴다. 기간 모드에서는 시작일의 월이다.
  monthInput: string;
  startDateInput: string;
  endDateInput: string;
  rangeLabel: string;
  // 한 달을 온전히 덮는 조회에서만 희망 현금을 자동계산한다.
  isSingleMonth: boolean;
};

export type HeadquartersLaborReport = HeadquartersLaborDateRange & {
  selectedStoreId: string | null;
  selectedStatus: HeadquartersLaborStatusFilter;
  selectedWorkerName: string | null;
  stores: HeadquartersLaborStoreOption[];
  totalLaborAmount: number;
  storeCount: number;
  laborRecordCount: number;
  storeSummaries: HeadquartersLaborStoreSummary[];
  workerSettlements: HeadquartersLaborWorkerSettlement[];
  details: HeadquartersLaborDetail[];
  errorMessages: string[];
};
