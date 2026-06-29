// WO(2026-06-24): 이카운트 출고/입고 매핑/상태 계산 순수 헬퍼.
// DB를 모르고, 매핑 결과/상태만 계산한다. preview·commit·테스트가 함께 쓴다.

export const ECOUNT_PROVIDER = "ECOUNT" as const;

// 냉동/생물 분류 기준(2026-06-29 의뢰자 기준자료 docs/meeting_0627/냉동_생물_자료.xlsx):
// 기준표의 냉동 품목은 모두 품목명이 "냉)"(또는 "냉동")으로 시작한다. 그 외는 모두 "생물"로 본다.
// 따라서 "냉)"/"냉동" 접두만 냉동으로 분류하고 나머지는 생물로 둔다(동태/프로즌 등 부분 일치는
// 비냉동 품목을 잘못 냉동으로 잡을 수 있어 쓰지 않는다 — 기준표는 "냉)동태"처럼 접두를 가진다).
export function classifyProductCategory(
  rawProductName: string,
): "냉동" | "생물" {
  return /^\s*냉(\)|동)/.test(rawProductName) ? "냉동" : "생물";
}

export const ECOUNT_BATCH_STATUS = {
  PREVIEW: "PREVIEW",
  MAPPING_REQUIRED: "MAPPING_REQUIRED",
  READY: "READY",
  COMMITTED: "COMMITTED",
  FAILED: "FAILED",
  VOIDED: "VOIDED",
} as const;

export type EcountBatchStatus =
  (typeof ECOUNT_BATCH_STATUS)[keyof typeof ECOUNT_BATCH_STATUS];

export const ECOUNT_LINE_STATUS = {
  PREVIEW: "PREVIEW",
  MAPPING_REQUIRED: "MAPPING_REQUIRED",
  READY: "READY",
  COMMITTED: "COMMITTED",
  FAILED: "FAILED",
  VOIDED: "VOIDED",
} as const;

export type EcountLineStatus =
  (typeof ECOUNT_LINE_STATUS)[keyof typeof ECOUNT_LINE_STATUS];

// WO-01(2026-06-28): 현장 친화 한글 라벨로 통일한다. READY는 "반영 가능",
// COMMITTED는 "반영됨". 배치와 라인이 같은 source에서 라벨을 가져온다.
export const ECOUNT_STATUS_LABELS = {
  PREVIEW: "미리보기",
  MAPPING_REQUIRED: "매핑 필요",
  READY: "반영 가능",
  COMMITTED: "반영됨",
  FAILED: "오류",
  VOIDED: "취소됨",
} as const;

export const ECOUNT_BATCH_STATUS_LABELS: Record<EcountBatchStatus, string> =
  ECOUNT_STATUS_LABELS;

export const ECOUNT_LINE_STATUS_LABELS: Record<EcountLineStatus, string> =
  ECOUNT_STATUS_LABELS;

export function getEcountLineStatusLabel(status: EcountLineStatus): string {
  return ECOUNT_LINE_STATUS_LABELS[status];
}

/**
 * 이카운트 "일자-No." 원문에서 날짜만 뽑아 YYYY-MM-DD로 정규화한다.
 * 예: "2026/06/17 -1" → "2026-06-17", "2026.6.7-12" → "2026-06-07".
 * 날짜를 읽지 못하면 null. 뒤의 전표/묶음 번호(-1, -2 등)는 무시한다.
 */
export function ecountDateNoToDate(dateNo: string): string | null {
  const match = /(\d{4})[./-](\d{1,2})[./-](\d{1,2})/.exec(dateNo);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;

  return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
}

/**
 * 화면 표시용 "일자-No." 라벨. 날짜는 엑셀 파일 날짜로 정규화하고
 * 전표/묶음 번호(-1, -2 등)는 떼어낸다. 날짜를 못 읽으면 원문을 그대로 둔다.
 */
export function formatEcountDateNo(dateNo: string): string {
  return ecountDateNoToDate(dateNo) ?? dateNo;
}

/** 거래처명 매핑 키. 공백 정규화 후 비교한다. */
export function storeAliasKey(rawName: string): string {
  return rawName.trim().replace(/\s+/g, " ");
}

/**
 * 품목 매핑 키. 이름+규격 조합.
 * 공백으로 잇지 않고 JSON 배열로 직렬화한다. 공백으로 이으면 ("A B","C")와 ("A","B C")가
 * 같은 키("A B C")로 충돌해 잘못된 상품 매핑이 생길 수 있다. JSON.stringify는 두 토큰을
 * 분리해 직렬화하므로 충돌이 불가능하고, 소스가 텍스트로 유지돼 diff가 깨지지 않는다.
 * (이 키는 in-memory Map 용도로만 쓰이고 DB에는 rawName/rawSpec을 따로 저장한다.)
 */
export function productAliasKey(rawName: string, rawSpec: string): string {
  const name = rawName.trim().replace(/\s+/g, " ");
  const spec = rawSpec.trim().replace(/\s+/g, " ");
  return JSON.stringify([name, spec]);
}

export type EcountMappingLineInput = {
  rawStoreName: string;
  rawProductName: string;
  productSpec: string;
  storeId: string | null;
  productId: string | null;
  error: string | null;
};

export type EcountLineResolution = {
  status: EcountLineStatus;
  errorMessage: string | null;
  /** 매핑되지 않은 거래처명. mapping_required 사유 */
  unmappedStoreName: string | null;
  /** 매핑되지 않은 품목(이름+규격). mapping_required 사유 */
  unmappedProduct: { rawName: string; rawSpec: string } | null;
};

/**
 * 한 라인의 매핑/오류 상태를 계산한다.
 * - parse 오류가 있으면 FAILED.
 * - 지점 또는 품목이 미매핑이면 MAPPING_REQUIRED.
 * - 둘 다 매핑되고 오류가 없으면 READY.
 */
export function resolveEcountLine(
  line: EcountMappingLineInput,
): EcountLineResolution {
  if (line.error) {
    return {
      status: ECOUNT_LINE_STATUS.FAILED,
      errorMessage: line.error,
      unmappedStoreName: null,
      unmappedProduct: null,
    };
  }

  const unmappedStoreName = line.storeId
    ? null
    : storeAliasKey(line.rawStoreName);
  const unmappedProduct = line.productId
    ? null
    : { rawName: line.rawProductName, rawSpec: line.productSpec };

  if (unmappedStoreName || unmappedProduct) {
    return {
      status: ECOUNT_LINE_STATUS.MAPPING_REQUIRED,
      errorMessage: null,
      unmappedStoreName,
      unmappedProduct,
    };
  }

  return {
    status: ECOUNT_LINE_STATUS.READY,
    errorMessage: null,
    unmappedStoreName: null,
    unmappedProduct: null,
  };
}

/**
 * 라인 상태들로 batch 상태를 계산한다.
 * - 하나라도 FAILED → FAILED.
 * - 하나라도 MAPPING_REQUIRED → MAPPING_REQUIRED.
 * - 전부 READY → READY.
 */
export function resolveBatchStatus(
  lineStatuses: EcountLineStatus[],
): EcountBatchStatus {
  if (lineStatuses.length === 0) {
    return ECOUNT_BATCH_STATUS.FAILED;
  }

  if (lineStatuses.some((status) => status === ECOUNT_LINE_STATUS.FAILED)) {
    return ECOUNT_BATCH_STATUS.FAILED;
  }

  if (
    lineStatuses.some(
      (status) => status === ECOUNT_LINE_STATUS.MAPPING_REQUIRED,
    )
  ) {
    return ECOUNT_BATCH_STATUS.MAPPING_REQUIRED;
  }

  return ECOUNT_BATCH_STATUS.READY;
}
