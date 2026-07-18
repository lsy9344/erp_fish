# Investigation: rev2·rev3 총매출·지출 정산 요구 확인

## Hand-off Brief

1. **What happened.** rev3 원문은 지점장이 입력한 총매출과 `총매출 = 결제합계 + 지출` 관계를 요구한다.
2. **Where the case stands.** 핵심 공식은 확인됐지만 “나중에 7단계에서 마감검산”한다는 시점·위치는 이미지 원문에 없다.
3. **What's needed next.** 제품 의도에 따라 6단계 표시 요구와 후속 서버 검산 해석을 구분해 유지한다.

## Case Info

| Field            | Value                                                  |
| ---------------- | ------------------------------------------------------ |
| Ticket           | N/A                                                    |
| Date opened      | 2026-07-18                                             |
| Status           | Concluded                                              |
| System           | erp_fish 저장소, Linux                                 |
| Evidence sources | `docs/rev/2/*.jpg`, `docs/rev/3/*.jpg`, 파생 해석 문서 |

## Problem Statement

사용자 가설: “지점장은 총매출을 그대로 직접 입력하고, 마감 검산은 이후 해당 총매출과 지출 후 현금·카드·기타·지출 합계의 일치 여부를 검증한다”는 해석이 rev2·rev3 원문 요청과 일치한다.

## Evidence Inventory

| Source                                                         | Status    | Notes                                                   |
| -------------------------------------------------------------- | --------- | ------------------------------------------------------- |
| `docs/rev/2/*.jpg`                                             | Available | 4개 모두 판독; 질문의 정산 공식과 직접 관련된 문구 없음 |
| `docs/rev/3/*.jpg`                                             | Available | 8개 모두 판독; `_01`, `_05`에서 핵심 근거 확인          |
| `docs/rev/2026-07-17_rev2_rev3_수정요청_코드조사.md`           | Available | 원문에서 파생된 해석 문서; 원문보다 낮은 증거 우선순위  |
| `docs/rev/2026-07-17_rev2_rev3_수정요청_상세_작업지시서.md`    | Available | 파생 작업지시서; 원문과 교차 확인 필요                  |
| `docs/rev/2026-07-17_당일현금매출_지출정산_수정_작업지시서.md` | Available | 후속 해석 문서; 원문과 교차 확인 필요                   |

## Investigation Backlog

| #   | Path to Explore            | Priority | Status | Notes                               |
| --- | -------------------------- | -------- | ------ | ----------------------------------- |
| 1   | rev2 이미지 문구 판독      | High     | Done   | 정산 공식 직접 근거 없음            |
| 2   | rev3 이미지 문구 판독      | High     | Done   | `_01`, `_05` 핵심 근거 확인         |
| 3   | 파생 해석 문서와 원문 대조 | Medium   | Done   | 7단계·마감검산은 후속 해석임을 확인 |
| 4   | 현재 구현과 확정 요구 비교 | Medium   | Done   | 직접 입력·정산 공식은 일치          |

## Timeline of Events

| Time       | Event               | Source        | Confidence |
| ---------- | ------------------- | ------------- | ---------- |
| 2026-07-17 | rev2·rev3 자료 생성 | 이미지 파일명 | Deduced    |
| 2026-07-18 | 요구 해석 검증 요청 | 사용자 메시지 | Confirmed  |

## Confirmed Findings

### Finding 1: 원문 자료가 이미지 12개로 존재한다

**Evidence:** `docs/rev/2/*.jpg`, `docs/rev/3/*.jpg`

**Detail:** rev2 4개와 rev3 8개의 이미지가 판독 가능한 해상도로 존재한다.

### Finding 2: rev3는 지점장이 입력한 매출을 기준으로 요구한다

**Evidence:** `docs/rev/3/KakaoTalk_20260717_143045859_05.jpg` — “추정이 아닌 지점장이 입력한 확정매출”

**Detail:** 총매출을 시스템이 지출로 재산출한다는 요청보다 지점장이 입력한 매출을 권위값으로 보는 근거다.

### Finding 3: rev3는 결제합계에 4단계 지출을 포함한 관계를 요구한다

**Evidence:** `docs/rev/3/KakaoTalk_20260717_143045859_01.jpg` — “총매출 = 결제합계 + 지출로 변경”, “4단계 지출내용에서 저장한 금액 그대로 수정 안되게 표시만”

**Detail:** 4단계 지출은 6단계에서 읽기 전용이고, 기존 `총매출 - 결제합계` 차액 관계에 지출을 포함하라는 요청이다.

### Finding 4: 7단계 마감검산은 이미지 원문의 명시 요구가 아니다

**Evidence:** `docs/rev/3/KakaoTalk_20260717_143045859_01.jpg`는 “6단계: 매출/결제” 화면의 기존 차액 표시를 대상으로 한다. `docs/rev/2/*.jpg`, `docs/rev/3/*.jpg` 어디에도 7단계 또는 “마감검산” 문구가 없다.

**Detail:** 후속 작업지시서는 서버 검산과 검토·마감 용어를 정의하지만, 이는 이미지 문구를 제품 흐름에 맞게 구체화한 해석이다.

## Deduced Conclusions

### Deduction 1: 총매출은 지출을 더해 자동 저장하는 값이 아니다

**Based on:** Finding 2, Finding 3

**Reasoning:** 지점장이 입력한 확정매출이 기준이고, 지출은 별도 저장값을 수정 불가로 표시하도록 요청했다. 따라서 두 값을 DB 저장 시 합쳐 총매출을 덮어쓰는 요구로 읽기 어렵다.

**Conclusion:** 총매출은 직접 입력 원본으로 유지하고, 지출은 정합식의 별도 항으로 사용하는 해석이 타당하다.

### Deduction 2: “검증”은 진위 검증이 아니라 입력값 간 정합성 확인이다

**Based on:** Finding 3

**Reasoning:** 원문은 외부 매출 자료와 비교하라고 하지 않고 `총매출 = 결제합계 + 지출`이라는 산술 관계만 제시한다.

**Conclusion:** 이 검사는 총매출이 실제로 옳은지 증명하지 않고 입력된 금액들이 서로 맞는지만 확인한다.

## Hypothesized Paths

### Hypothesis 1: 현재 설명이 rev2·rev3 원문 요구와 일치한다

**Status:** Confirmed

**Theory:** 총매출은 직접 입력 원본이고, 4단계 지출은 현금 흐름 정합성 확인에만 더해진다.

**Supporting indicators:** 후속 파생 문서가 이 공식을 명시하지만 원문 판독 전이므로 확정 근거로 사용하지 않는다.

**Would confirm:** rev2·rev3 원문에서 총매출 직접 입력 유지와 현금·카드·기타·지출 합산 정산 요구가 함께 확인됨.

**Would refute:** 원문이 총매출 자체에 지출을 가산하거나 총매출을 자동 계산하라고 명시함.

**Resolution:** 직접 입력 원본과 지출 포함 정합식은 확인됐다. 단, “나중에 7단계 마감검산”이라는 시점·화면은 원문이 아닌 후속 설계 해석이다.

## Missing Evidence

| Gap                 | Impact                                                                                         | How to Obtain                       |
| ------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------- |
| 추가 확인 대화 원문 | 주황색 차액 박스 삭제 및 검산 위치가 이미지 외 추가 확인에서 나온 것인지 완전히 추적할 수 없음 | 2026-07-17 추가 확인 대화 원문 확보 |

## Source Code Trace

| Element        | Detail                                                            |
| -------------- | ----------------------------------------------------------------- |
| 요구 원문      | `docs/rev/3/KakaoTalk_20260717_143045859_01.jpg`, `_05.jpg`       |
| 파생 해석      | `docs/rev/2026-07-17_rev2_rev3_수정요청_코드조사.md:122`          |
| 후속 확정 정책 | `docs/rev/2026-07-17_당일현금매출_지출정산_수정_작업지시서.md:13` |

## Conclusion

**Confidence:** High

현재 설명은 핵심 의미에서 맞다. 총매출은 지점장이 입력하는 값이고, 4단계 지출은 별도 읽기 전용 값으로 결제합계와 함께 총매출에 맞춰 보는 항목이다. 다만 이를 “나중에 7단계에서 하는 마감검산”이라고 특정하는 것은 이미지 원문에 없는 후속 설계 해석이다.

## Recommended Next Steps

### Fix direction

요구 설명에서는 원문 확정사항과 후속 설계를 구분한다: 원문은 `총매출 = 결제합계 + 지출`, 후속 설계는 서버 검산·7단계 경고·6단계 차액 UI 제거다.

## Reproduction Plan

총매출 1,000,000원, 현금 400,000원, 카드 500,000원, 기타 0원, 지출 100,000원에서 정산 차액 0원을 확인한다.

## Side Findings

- 프로젝트 내 `project-context.md`는 검색되지 않았다.
- rev2 이미지에는 질문의 총매출·결제·지출 정산 요구가 없으며 핵심 요청은 rev3 `_01`에 있다.
- 내부 `paymentDifferenceAmount` 계산은 본사 검토·감사 용도로 유지해야 하지만 지점장 조회·저장 mapper가 이 key를 제거하지 않아 런타임 응답에 노출되는 결함이 확인됐다.

## Follow-up: 2026-07-18

### New Evidence

- rev3 `_01`: “총매출 = 결제합계 + 지출로 변경”, 4단계 지출은 수정 불가 표시.
- rev3 `_05`: “지점장이 입력한 확정매출”.

### Additional Findings

- 직접 입력과 지출 포함 정합식은 원문 근거가 있다.
- 7단계 마감검산이라는 위치·시점은 원문이 아니라 후속 설계다.
- 지점장 응답에서는 차액 UI 삭제와 같은 정책에 맞춰 `paymentDifferenceAmount` key 자체를 제거하고, 본사·감사 내부 계산값은 유지하는 것이 맞다.

### Updated Hypotheses

- Hypothesis 1을 조건부 설명과 함께 Confirmed로 변경했다.

### Backlog Changes

- 이미지 판독과 파생 문서 대조를 완료했다.

### Updated Conclusion

핵심 해석은 맞지만 “나중에 7단계”라는 설명은 원문 요구보다 구체화된 구현 해석이다.

### Implementation Resolution

- `StoreManagerLedgerCostStepData`와 `toStoreManagerLedgerCostStepData()`에서 `paymentDifferenceAmount`를 제거했다.
- 본사·감사 계산 공식 `총매출-(현금+카드+기타+지출)`과 내부 차액 값은 변경하지 않았다.
- 지점장 mapper 결과에 key와 값이 모두 없음을 단위 테스트로 고정했다.
