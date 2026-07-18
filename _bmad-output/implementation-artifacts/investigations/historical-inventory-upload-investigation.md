# Investigation: 과거재고 업로드 후 지점 재고 미표시

## Hand-off Brief

1. **What happened.** 사용자는 10일 기준 과거재고 업로드 완료를 확인했지만, 각 지점 로그인 후 재고 현황과 장부에서 업로드 수량이 보이지 않는다고 제보했다(사용자 진술, 미확인).
2. **Where the case stands.** 조사 중이며 서버 액션 `uploadInventoryOpeningSnapshots`와 고객 업로드 추정 파일, 관련 최신 커밋을 기준점으로 확보했다.
3. **What's needed next.** 업로드 저장 경로와 지점 재고 조회 경로의 날짜·지점 조건을 대조하고 재현 테스트로 결함 및 기존 수정 여부를 확인한다.

## Case Info

| Field | Value |
| --- | --- |
| Ticket | N/A |
| Date opened | 2026-07-12 |
| Status | Active |
| System | Windows, Next.js/TypeScript, Prisma |
| Evidence sources | 사용자 제보, 소스 코드, Git 이력, 테스트, 고객 업로드 추정 xlsx |

## Problem Statement

> 그리고 과거재고 업로드 진행해봤는데 업로드 완료된거 확인은 했는데 장부에 반영이 안되는것 같아서 확인 부탁드립니다.
> 10일 날짜로 기입하고 재고 업로드를 했는데 각 지점에서 로그인후 재고 현황을 봤을때 업로드한 과거 재고가 나오지 않더라구요

초기 가설: 업로드 성공 표시와 달리, 날짜 또는 지점 범위 처리 문제로 저장된 과거재고가 장부/재고 현황 조회에 포함되지 않는다.

## Evidence Inventory

| Source | Status | Notes |
| --- | --- | --- |
| 사용자 제보 | Available | 10일 기준 업로드 완료 후 지점별 재고 현황 미표시 |
| `src/features/inventory/opening-import-actions.ts` | Available | `uploadInventoryOpeningSnapshots` 서버 액션 확인 (`:168`) |
| `docs/reference_from_customer/temp_1783022688907.-511901230.xlsx` | Available | 고객 업로드 추정 원본; 아직 내용 미확인 |
| Git commit `73db1ef` | Available | `Allow decimal inventory quantities and opening stock uploads` |
| 업로드/조회 소스 코드 | Available | 월별 스냅샷 저장과 장부 조회 우선순위 확인 |
| 단위 테스트 | Available | 관련 6개 테스트 통과; 업로드→장부 표시 통합 검증은 없음 |
| Git 후속 수정 | Partial | `main`과 `codex/fix-opening-inventory-carryover`에 현재 HEAD에 없는 관련 커밋 존재 |
| 운영 DB/로그 | Missing | 실제 업로드 행과 조회 결과 확인 필요 |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| 1 | 업로드 파싱·검증·저장 흐름 | High | Done | 날짜는 월 키로 축약되고 `InventoryOpeningSnapshot`만 저장 |
| 2 | 지점 재고 현황 및 장부 조회 흐름 | High | Done | 기존/이전 장부가 스냅샷보다 우선, 본사 현황은 스냅샷 미조회 |
| 3 | 최신 커밋과 기존 테스트 | High | In Progress | 현재 브랜치에 없는 후속 수정 커밋 상세 대조 중 |
| 4 | 고객 xlsx 구조 | Medium | Done | 66행, 2개 지점, 전체 2026-06-30 입력 |
| 5 | 재현 테스트 | High | Open | 결함 확인 후 RED 테스트 작성 |

## Timeline of Events

| Time | Event | Source | Confidence |
| --- | --- | --- | --- |
| 미상, 10일 기준 | 과거재고 업로드 완료 후 지점별 조회 미표시 제보 | 사용자 진술 | Deduced |
| 2026-07-12 이전 | 소수 재고 수량 및 초기재고 업로드 관련 변경 | Git `73db1ef` | Confirmed |

## Confirmed Findings

### Finding 1: 과거재고 업로드 서버 액션이 존재한다

**Evidence:** `src/features/inventory/opening-import-actions.ts:168`

**Detail:** UI 문구만 있는 것이 아니라 업로드 처리 서버 액션이 구현돼 있다.

## Deduced Conclusions

조사 중.

## Hypothesized Paths

### Hypothesis 1: 저장 또는 조회의 날짜·지점 조건 불일치

**Status:** Open

**Theory:** 업로드 완료 응답은 성공하지만 저장된 기준일 또는 지점 범위가 지점 사용자 재고 조회 조건과 맞지 않는다.

**Supporting indicators:** 증상은 업로드 완료와 조회 미표시 사이의 경계에서 발생한다.

**Would confirm:** 같은 입력을 업로드한 뒤 DB 저장 행은 존재하지만 동일 날짜·지점 조회 결과에서 제외되는 자동 재현.

**Would refute:** 저장 자체가 실패했거나 다른 원인이 조회 누락을 설명함.

**Resolution:** 조사 중.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | --- | --- |
| 실제 운영 업로드/DB 행 | 실제 사례가 저장됐는지 확인 불가 | 운영 로그 또는 해당 업로드 배치/스냅샷 조회 |
| 정확한 업로드 일시·사용자·지점 | 운영 데이터 대조 범위 확정 불가 | 사용자/운영 담당자 확인 |

## Source Code Trace

| Element | Detail |
| --- | --- |
| Error origin | 조사 중 |
| Trigger | 과거재고 xlsx 제출 |
| Condition | 10일 기준 데이터, 지점 계정 조회 |
| Related files | `src/features/inventory/opening-import-actions.ts`, `src/features/ledger/components/ecount-supply-upload-client.tsx` |

## Conclusion

**Confidence:** Low

현재는 사용자 증상과 코드 진입점만 확인됐다. 원인과 최신 커밋의 수정 여부는 데이터 흐름 및 테스트 대조가 필요하다.

## Recommended Next Steps

### Fix direction

원인 확인 후 최소 수정안을 확정한다.

### Diagnostic

업로드 저장 조건과 조회 필터를 대조하고 고객 파일로 재현한다.

## Reproduction Plan

10일 기준 지점별 초기재고 파일을 업로드하고, 저장된 스냅샷 및 해당 지점 재고 현황/장부 조회 결과를 비교한다.

## Side Findings

- `python3`가 WindowsApps 실행 별칭을 가리켜 조사 초기화를 막는다. 실제 `python` 3.11.9는 정상이다.

## Follow-up: 2026-07-12

### New Evidence

- 고객 xlsx `재고입력`에는 완전한 데이터 66행, 지점 2개(`삼국유통`, `제일수산`)가 있고 날짜는 모두 Excel serial `46203`(2026-06-30)이다.
- 업로드 파서는 이 날짜에 하루를 더한 뒤 `2026-07`만 저장하며 원래 일자는 DB에 남기지 않는다 (`src/features/inventory/opening-import.ts:413`, `:557`; `prisma/schema.prisma:747`).
- 업로드 액션은 `InventoryOpeningSnapshot`만 upsert하고 `DailyLedger`/`LedgerInventoryItem`은 만들지 않는다 (`src/features/inventory/opening-import-actions.ts:240`, `:268`).
- 지점 재고 조회는 이미 저장된 장부 재고, 같은 달 이전 장부, 월초 스냅샷 순서로 선택한다 (`src/features/inventory/queries.ts:1083`, `:764`, `:822`).
- 본사 재고 현황은 정확한 날짜의 `DailyLedger`와 `LedgerInventoryItem`만 읽고 opening snapshot은 읽지 않는다 (`src/features/reports/inventory-position-queries.ts:327`, `:334`).
- 현재 HEAD `73db1ef`에서 관련 단위 테스트 6개는 통과하지만 업로드 후 장부/재고 현황 표시 통합 테스트는 없다.
- 후속 커밋 `e64d1fc`, `e07712b`는 `main` 및 `codex/fix-opening-inventory-carryover`에 있으나 현재 `feat/rev_02` HEAD에는 포함되지 않는다.
- `e64d1fc`는 기존 장부 충돌을 사용자에게 알릴 뿐 장부 재고를 자동 복구하지 않는다.
- `e07712b`는 선행 커밋에서 만든 2026-07-11 사고 전용 복구 도구를 강화한다. 세 지점과 71개 품목에 한정되며 코드 통합만으로 운영 데이터가 복구되지는 않는다.
- 현재 HEAD는 `main`보다 19개 커밋 뒤이고 0개 앞이어서 fast-forward 가능하지만, 고객 xlsx는 추적되지 않은 상태로 보존해야 한다.

### Additional Findings

- 업로드 성공 메시지는 월별 시작 스냅샷 저장 성공을 뜻하며 특정 과거 일자의 장부 반영 성공을 뜻하지 않는다.
- 고객 파일 안내 문구는 “날짜별 과거 재고 DB 입력”이라고 설명하지만 실제 저장 모델은 월별 시작 스냅샷이어서 계약이 일치하지 않는다.
- 관련 테스트가 통과하는 것은 현재 구현 계약이 유지된다는 뜻일 뿐 사용자 제보가 해결됐다는 증거가 아니다.

### Updated Hypotheses

- Hypothesis 1은 코드 흐름상 강하게 지지됨. 운영 DB 확인 전까지 실제 사건에 대한 상태는 Open(High confidence)로 유지한다.
- “지점 필터 누락” 가설은 코드상 반박됨. 업로드 매칭과 스냅샷 조회 모두 `storeId` 범위를 사용한다.
- “단순 캐시 문제” 가설은 주원인으로 반박됨. 본사 현황 쿼리 자체가 스냅샷을 읽지 않는다.

### Backlog Changes

- 업로드·조회 흐름과 고객 xlsx 구조 조사를 Done으로 변경했다.
- 현재 브랜치에 없는 후속 수정 커밋의 실제 해결 범위 확인을 최우선으로 둔다.
