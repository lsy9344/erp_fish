# 최근 문서 구현 감사 개선 방향

## 문서 정보

| 항목 | 내용 |
| --- | --- |
| 작성일 | 2026-06-15 |
| 상태 | 개선 방향 작성 완료 |
| 기준 문서 | `_bmad-output/implementation-artifacts/investigations/recent-doc-implementation-audit-investigation.md` |
| 범위 | 감사 문서의 Confirmed Findings 1~5에 대한 개선 방향 |
| 제외 | 실제 코드 수정, 테스트 실행, story-automator 재실행 |

## 핵심 판단

현재 감사 문서는 최근 리팩토링 및 기능 추가/수정 문서와 구현 사이의 불일치 5건을 확인했다. 개선은 보안 경계, 정정 계산 반영, 리포트 freshness, 자동화 범위, 계획/status 동기화 순서로 진행하는 것이 안전하다.

가장 먼저 막아야 할 것은 두 가지다.

- 지점장에게 민감 지표가 계속 노출되는 문제
- story-automator가 승인되지 않은 discovery/policy 트랙을 구현 작업처럼 재개하는 문제

그 다음에는 정정 반영과 리포트 캐시 무효화를 고친다. 마지막으로 기존 done 스토리와 새 `sprint-status.yaml` 구조를 맞춰야 중복 구현과 잘못된 자동화 재개를 줄일 수 있다.

## 권장 작업 순서

| 순서 | 우선순위 | 대상 | 이유 |
| --- | --- | --- | --- |
| 1 | P0 | Finding 4, story-automator scope 정지 | 잘못 재개하면 승인되지 않은 Epic 7/8 작업이 구현으로 흘러간다. |
| 2 | P0 | Finding 1, 지점장 민감 필드 차단 | PRD 권한 경계와 직접 충돌한다. UI 숨김이 아니라 서버 응답 계약부터 줄여야 한다. |
| 3 | P1 | Finding 3, comparison revalidation | 수정 범위가 작고 stale report 위험을 바로 줄인다. |
| 4 | P1 | Finding 2, `PURCHASE_ROW` 정정 반영 | UI에서 선택 가능한 정정 대상이 실제 반영되지 않는다. 다만 매입 금액이 어떤 지표를 바꿀지 정책 확인이 필요하다. |
| 5 | P1 | Finding 5, planning/status 동기화 | 자동화와 다음 story 생성의 기준을 안정화한다. |

## 공통 원칙

- PRD와 epics의 현재 기준을 우선한다. OQ-10A나 CAP-13의 새 승인 문서가 있으면 코드보다 문서를 먼저 갱신한다.
- 구현 범위를 넓히지 않는다. 각 finding의 수용 기준만 만족시킨다.
- UI만 숨기지 않는다. 권한 문제는 서버 응답 타입과 mapper에서 먼저 차단한다.
- 자동화 산출물은 재개 전에 gate를 통과해야 한다. 이미 생성된 broad orchestration은 그대로 재개하지 않는다.
- 문서/status 변경은 기존 done story 파일을 지우지 않고 mapping으로 연결한다.

## Finding 1 개선: 지점장 검토 응답 민감 필드 차단

### 현재 문제

PRD는 지점장 화면/API에서 `이익률`, `재고금액`을 기본 차단한다고 한다. 근거는 `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md:231`, `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md:242`이다. epics도 지점장 응답에서 `이익률`, `재고금액` 같은 민감 필드를 제거해야 한다고 한다. 근거는 `_bmad-output/planning-artifacts/epics.md:485`, `_bmad-output/planning-artifacts/epics.md:487`이다.

현재 코드는 지점장 review summary에 `grossMarginRate`, `inventoryAmount`를 남긴다. 근거는 `src/features/ledger/review-types.ts:40`, `src/features/ledger/review-types.ts:42`, `src/features/ledger/response-shaping.ts:27`, `src/features/ledger/response-shaping.ts:28`, `src/features/ledger/response-shaping.ts:29`이다. 지점장 검토 화면도 `이익률`, `재고금액` 카드를 렌더링한다. 근거는 `src/features/ledger/components/review-summary-client.tsx:276`, `src/features/ledger/components/review-summary-client.tsx:278`, `src/features/ledger/components/review-summary-client.tsx:282`이다. E2E도 현재 노출을 기대한다. 근거는 `tests/e2e/store-ledger-review.spec.ts:372`, `tests/e2e/store-ledger-review.spec.ts:374`이다.

### 개선 방향

1. OQ-10A의 최신 승인 문서가 있는지 먼저 확인한다.
2. 예외 승인 문서가 없다면 현재 PRD/epics 기준을 authoritative baseline으로 둔다.
3. `StoreManagerLedgerReviewSummary`를 `totalSales`, `paymentDifference` 중심으로 줄인다.
4. `toStoreManagerLedgerReviewStepData()`는 `grossMarginRate`, `inventoryAmount`를 반환하지 않는다.
5. `ReviewSummaryClient`의 지점장 화면에서 `이익률`, `재고금액` 카드를 제거한다.
6. 본사 화면, 본사 리포트, 본사 dashboard의 동일 지표는 이번 수정 범위에서 건드리지 않는다.

`ReviewSummaryClient`는 현재 `StoreManagerLedgerReviewStepData`를 받는 지점장 검토 컴포넌트이고 `src/app/app/store-entry/page.tsx:22`, `src/app/app/store-entry/page.tsx:92`에서 사용된다. 따라서 이 finding에서는 role toggle을 새로 만들기보다 지점장 review 계약 자체를 줄이는 것이 더 단순하다.

### 변경 대상

| 파일 | 변경 방향 |
| --- | --- |
| `src/features/ledger/review-types.ts` | `StoreManagerLedgerReviewSummary`에서 `grossMarginRate`, `inventoryAmount` 제거 |
| `src/features/ledger/response-shaping.ts` | store-manager mapper가 `totalSales`, `paymentDifference`만 내려주도록 변경 |
| `src/features/ledger/components/review-summary-client.tsx` | `이익률`, `재고금액` MetricCard 제거 |
| `tests/unit/ledger-review.test.mjs` | 민감 필드 absence 검증으로 변경 |
| `tests/e2e/store-ledger-review.spec.ts` | 지점장 화면에서 `이익률`, `재고금액` 미표시 검증 |

### 수용 기준

- 지점장 review 응답의 `summary` key에 `grossMarginRate`가 없다.
- 지점장 review 응답의 `summary` key에 `inventoryAmount`가 없다.
- 지점장 검토 화면에 `이익률` 텍스트와 값이 표시되지 않는다.
- 지점장 검토 화면에 `재고금액` 텍스트와 값이 표시되지 않는다.
- `총매출`, `결제 차액`, 제출 가능 여부, 검증 메시지는 유지된다.
- 본사 전용 리포트와 dashboard의 `이익률`, `재고금액` 계산은 회귀하지 않는다.

### 검증 방법

```powershell
pnpm test:unit -- tests/unit/ledger-review.test.mjs tests/unit/ledger-submit.test.mjs
pnpm test:e2e -- tests/e2e/store-ledger-review.spec.ts
```

추가 정적 확인:

```powershell
rg -n "grossMarginRate|inventoryAmount|이익률|재고금액" src\features\ledger\response-shaping.ts src\features\ledger\review-types.ts src\features\ledger\components\review-summary-client.tsx tests\e2e\store-ledger-review.spec.ts
```

### 위험과 결정 필요 사항

- OQ-10A에서 `이익률` 또는 `재고금액` 예외 노출을 승인한 별도 문서가 있으면 코드 수정 전에 PRD/epics와 감사 결론을 갱신해야 한다.
- UI 카드만 제거하면 API/cache 응답에는 남을 수 있다. 반드시 type과 mapper를 먼저 줄인다.

## Finding 2 개선: `PURCHASE_ROW` 정정 반영

### 현재 문제

Story 4.3은 정정 대상에 매입 행을 포함한다. 근거는 `_bmad-output/implementation-artifacts/4-3-본사가-마감된-장부에-정정-기록을-추가한다.md:34`, `_bmad-output/implementation-artifacts/4-3-본사가-마감된-장부에-정정-기록을-추가한다.md:37`, `_bmad-output/implementation-artifacts/4-3-본사가-마감된-장부에-정정-기록을-추가한다.md:70`이다.

UI는 본사 장부 상세에서 `PURCHASE_ROW`의 `amount` 정정 대상을 만든다. 근거는 `src/app/app/ledgers/[ledgerId]/page.tsx:454`, `src/app/app/ledgers/[ledgerId]/page.tsx:455`, `src/app/app/ledgers/[ledgerId]/page.tsx:457`, `src/app/app/ledgers/[ledgerId]/page.tsx:458`이다.

정정 생성 쪽은 `PURCHASE_ROW` 원본값을 읽을 수 있다. `purchaseFieldKinds`는 `unitPrice`, `quantity`, `amount`, `referenceInfo`를 허용한다. 근거는 `src/features/corrections/actions.ts:40`, `src/features/corrections/actions.ts:41`, `src/features/corrections/actions.ts:42`, `src/features/corrections/actions.ts:43`, `src/features/corrections/actions.ts:44`이다. 원본값 조회도 `PURCHASE_ROW`를 처리한다. 근거는 `src/features/corrections/actions.ts:365`, `src/features/corrections/actions.ts:372`, `src/features/corrections/actions.ts:387`, `src/features/corrections/actions.ts:394`이다.

하지만 shared correction overlay는 `PURCHASE_ROW`를 받지 않는다. `applyCorrectionValuesToLedgerReviewInput()` 입력은 `expenseItems`, `lossItems`, `reviewInput.inventoryItems`만 복사한다. 근거는 `src/server/calculations/ledger.ts:315`, `src/server/calculations/ledger.ts:318`, `src/server/calculations/ledger.ts:319`, `src/server/calculations/ledger.ts:328`, `src/server/calculations/ledger.ts:332`, `src/server/calculations/ledger.ts:333`이다. `applySingleCorrection()`은 `PAYMENT_FIELD`, `EXPENSE_ROW`, `LEDGER_FIELD`, `INVENTORY_ROW`, `LOSS_ROW`만 처리하고 마지막에 `unapplied`를 반환한다. 근거는 `src/server/calculations/ledger.ts:429`, `src/server/calculations/ledger.ts:437`, `src/server/calculations/ledger.ts:454`, `src/server/calculations/ledger.ts:475`, `src/server/calculations/ledger.ts:485`, `src/server/calculations/ledger.ts:495`이다.

### 개선 방향

권장 방향은 `PURCHASE_ROW:amount`를 우선 지원하는 좁은 구현이다.

1. `LedgerReviewPurchaseInput` 타입을 추가한다.
2. `applyCorrectionValuesToLedgerReviewInput()`에 선택적 `purchaseItems` 입력을 추가한다.
3. 입력 `purchaseItems`는 원본을 mutate하지 않도록 복사한다.
4. `purchaseById` map을 만든다.
5. `applySingleCorrection()`에 `PURCHASE_ROW` 분기를 추가한다.
6. 첫 구현은 UI가 실제 생성하는 `fieldKey: "amount"`만 적용한다.
7. `latestAppliedValue.kind === "money"`이고 숫자 범위가 유효하면 해당 row의 `amount`를 바꾼다.
8. row 없음, field 불일치, kind 불일치, 범위 초과는 기존처럼 `unapplied`로 둔다.
9. overlay 결과에 `purchaseItems` 또는 `correctedPurchaseItems`를 포함해 downstream이 정정된 매입 행을 사용할 수 있게 한다.

다만 현재 review summary 계산은 매입 행 금액을 직접 쓰지 않는다. `calculateLedgerReviewSummary()`는 `inventoryItems`로 매출원가와 재고금액을 계산한다. 근거는 `src/server/calculations/ledger.ts:237`, `src/server/calculations/ledger.ts:244`, `src/server/calculations/ledger.ts:248`, `src/server/calculations/ledger.ts:249`이다. 따라서 `PURCHASE_ROW:amount` 정정이 어떤 지표를 바꿔야 하는지 바로 확정하면 안 된다.

이번 개선의 최소 수용 기준은 `PURCHASE_ROW:amount`가 더 이상 무조건 `unapplied`가 되지 않고, 정정 반영 상태와 매입 행 표시값에 반영되는 것이다. 매입 금액을 매출원가, 재고금액, 이익률 같은 계산 지표에 연결할지는 별도 정책 결정 후 다룬다.

### 대안

정책 결정을 미룰 수밖에 없다면 UI에서 `PURCHASE_ROW` 옵션을 임시 제거하거나 비활성화한다. 하지만 Story 4.3이 매입 행 정정 대상을 포함하므로, 장기 방향은 overlay 지원이 더 맞다.

### 변경 대상

| 파일 | 변경 방향 |
| --- | --- |
| `src/server/calculations/ledger.ts` | purchase input 타입, purchase map, `PURCHASE_ROW:amount` 적용, 결과 반환 추가 |
| `src/features/reports/queries.ts` | 필요한 경우 overlay 호출에 `ledger.ledgerPurchaseItems` 전달 |
| `src/features/dashboard/queries.ts` | 필요한 경우 overlay 호출에 `ledger.ledgerPurchaseItems` 전달 |
| `tests/unit/ledger-correction-calculations.test.mjs` | purchase row correction 적용과 unapplied 경계 테스트 추가 |
| `tests/e2e/hq-ledger-corrections.spec.ts` | 실제 `PURCHASE_ROW` 저장 후 반영 상태 확인 시나리오 추가 |

### 수용 기준

- matching `PURCHASE_ROW:amount` correction은 `appliedCorrectionKeys`에 들어간다.
- matching `PURCHASE_ROW:amount` correction은 `unappliedCorrectionKeys`에 들어가지 않는다.
- matching `PURCHASE_ROW:amount` correction만 있을 때 `hasUnappliedCorrections`는 false다.
- 원본 `purchaseItems` 배열과 원본 row 객체는 mutate되지 않는다.
- 잘못된 `targetId`, 지원하지 않는 field, 잘못된 kind는 기존처럼 `unapplied`다.
- dashboard, daily report, comparison report, monthly report에서 정정 상태가 "미반영"처럼 보이지 않는다.

### 검증 방법

```powershell
pnpm test:unit -- tests/unit/ledger-correction-calculations.test.mjs tests/unit/hq-reports.test.mjs
pnpm test:e2e -- tests/e2e/hq-ledger-corrections.spec.ts tests/e2e/hq-reports.spec.ts
```

수동 시나리오:

1. 본사 계정으로 마감된 장부를 연다.
2. 매입 탭의 매입 행 금액을 정정한다.
3. 장부 상세에서 정정 타임라인과 반영값을 확인한다.
4. dashboard, daily, comparison, monthly report에서 해당 정정이 미반영으로 분류되지 않는지 확인한다.

### 위험과 결정 필요 사항

- `amount` 정정과 `unitPrice * quantity`의 관계를 정해야 한다. 단순히 `amount`만 바꾸면 단가/수량과 금액이 달라질 수 있다.
- 매입 금액이 어떤 계산 지표에 영향을 주는지 현재 계산 모델에는 직접 연결되어 있지 않다.
- `unitPrice`, `quantity`, `referenceInfo`까지 한 번에 지원하면 범위가 커진다. 첫 패치는 `amount`에만 제한하는 것이 좋다.

## Finding 3 개선: `/app/reports/comparison` revalidation 누락

### 현재 문제

Story 5.3은 comparison report freshness를 요구하고, 정정 생성 후 `/app/reports/comparison` revalidation을 추가해야 한다고 한다. 근거는 `_bmad-output/implementation-artifacts/5-3-본사가-선택-기간의-지점별-실적을-비교한다.md:103`, `_bmad-output/implementation-artifacts/5-3-본사가-선택-기간의-지점별-실적을-비교한다.md:105`이다.

정정 생성 경로는 이미 comparison을 revalidate한다. 근거는 `src/features/corrections/actions.ts:237`, `src/features/corrections/actions.ts:238`, `src/features/corrections/actions.ts:240`, `src/features/corrections/actions.ts:241`, `src/features/corrections/actions.ts:242`이다.

하지만 일반 장부 저장, 제출, 본사 편집, 재고, 손실, 본사 마감 경로는 daily/monthly만 revalidate한다. 근거는 `src/features/ledger/actions.ts:47`, `src/features/ledger/actions.ts:50`, `src/features/ledger/actions.ts:51`, `src/features/ledger/actions.ts:54`, `src/features/ledger/actions.ts:59`, `src/features/ledger/actions.ts:60`, `src/features/ledger/hq-edit-actions.ts:66`, `src/features/ledger/hq-edit-actions.ts:72`, `src/features/ledger/hq-edit-actions.ts:73`, `src/features/inventory/actions.ts:64`, `src/features/inventory/actions.ts:67`, `src/features/inventory/actions.ts:68`, `src/features/losses/actions.ts:44`, `src/features/losses/actions.ts:49`, `src/features/losses/actions.ts:50`, `src/features/ledger/hq-close-actions.ts:47`, `src/features/ledger/hq-close-actions.ts:50`, `src/features/ledger/hq-close-actions.ts:51`이다.

추가로 본사 재고/손실 편집 경로도 같은 패턴을 가진다. 근거는 `src/features/inventory/hq-edit-actions.ts:59`, `src/features/inventory/hq-edit-actions.ts:64`, `src/features/inventory/hq-edit-actions.ts:65`, `src/features/losses/hq-edit-actions.ts:75`, `src/features/losses/hq-edit-actions.ts:81`, `src/features/losses/hq-edit-actions.ts:82`이다.

### 개선 방향

가장 작은 수정은 각 revalidate helper에 `revalidatePath("/app/reports/comparison")` 한 줄을 추가하는 것이다.

공용 revalidation helper를 새로 만들 수 있지만, 이번 목적은 누락 경로를 맞추는 것이다. 따라서 먼저 외과적으로 누락된 helper만 고친다. 공용 helper 리팩터는 반복이 더 커질 때 별도 작업으로 분리한다.

### 변경 대상

| 파일 | 변경 방향 |
| --- | --- |
| `src/features/ledger/actions.ts` | sales 저장, submit revalidation에 comparison 추가 |
| `src/features/ledger/hq-edit-actions.ts` | 본사 장부 편집 revalidation에 comparison 추가 |
| `src/features/inventory/actions.ts` | 지점 재고 저장 revalidation에 comparison 추가 |
| `src/features/inventory/hq-edit-actions.ts` | 본사 재고 편집 revalidation에 comparison 추가 |
| `src/features/losses/actions.ts` | 지점 손실 저장 revalidation에 comparison 추가 |
| `src/features/losses/hq-edit-actions.ts` | 본사 손실 편집 revalidation에 comparison 추가 |
| `src/features/ledger/hq-close-actions.ts` | 본사 마감 revalidation에 comparison 추가 |
| `tests/unit/hq-reports.test.mjs` 또는 각 action 단위 테스트 | source-level revalidation 경로 검증 추가 |

### 수용 기준

- 장부 매출/결제 저장 성공 후 `/app/reports/comparison`이 revalidate된다.
- 장부 제출 성공 후 `/app/reports/comparison`이 revalidate된다.
- 본사 장부 편집 성공 후 `/app/reports/comparison`이 revalidate된다.
- 지점 재고 저장과 본사 재고 편집 성공 후 `/app/reports/comparison`이 revalidate된다.
- 지점 손실 저장과 본사 손실 편집 성공 후 `/app/reports/comparison`이 revalidate된다.
- 본사 마감 성공 후 `/app/reports/comparison`이 revalidate된다.
- 기존 `/app/reports/daily`, `/app/reports/monthly` revalidation은 유지된다.

### 검증 방법

```powershell
pnpm test:unit -- tests/unit/hq-reports.test.mjs tests/unit/ledger-inventory.test.mjs tests/unit/ledger-losses.test.mjs
pnpm test:e2e -- tests/e2e/hq-reports.spec.ts
```

정적 확인:

```powershell
rg -n "revalidatePath\(\"/app/reports/comparison\"\)" src\features\ledger src\features\inventory src\features\losses src\features\corrections
```

### 위험과 결정 필요 사항

- 이 수정은 캐시 freshness를 맞추는 작업이다. comparison 집계 계산 자체의 정확성은 별도 테스트가 필요하다.
- 너무 넓은 revalidation을 걱정할 수 있지만, comparison report는 해당 데이터 변경에 실제로 의존한다. daily/monthly와 같은 수준으로 두는 것이 일관적이다.

## Finding 4 개선: story-automator scope gate

### 현재 문제

G6 checklist는 `MVP-S01~MVP-S03`만 구현 스토리로 허용하고 `MVP-S04~MVP-S10`은 discovery/policy로 유지한다고 한다. 근거는 `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/mvp-story-extraction-checklist.md:10`, `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/mvp-story-extraction-checklist.md:20`, `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/mvp-story-extraction-checklist.md:21`, `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/mvp-story-extraction-checklist.md:52`이다.

현재 story-automator context는 49개 story를 선택했고, 7.1~8.9까지 포함한다. 근거는 `_bmad-output/story-automator/_tmp_context.json:2`, `_bmad-output/story-automator/_tmp_context.json:37`, `_bmad-output/story-automator/_tmp_context.json:43`, `_bmad-output/story-automator/_tmp_context.json:44`, `_bmad-output/story-automator/_tmp_context.json:52`이다. orchestration도 같은 전체 range를 가진다. 근거는 `_bmad-output/story-automator/orchestration-1-20260611-080819.md:5`, `_bmad-output/story-automator/orchestration-1-20260611-080819.md:90`, `_bmad-output/story-automator/orchestration-1-20260611-080819.md:105`이다. 다만 현재 상태는 `PAUSED`다. 근거는 `_bmad-output/story-automator/orchestration-1-20260611-080819.md:6`이다.

### 개선 방향

1. 기존 paused orchestration을 그대로 재개하지 않는다.
2. 기존 orchestration은 `superseded by G6 scoped run` 상태 또는 주석으로 남긴다.
3. 새 preflight를 만들 때 `mvp-story-extraction-checklist.md`를 필수 gate 입력으로 둔다.
4. preflight 결과에 gate 파일, 승인일, 허용 slice, 차단 slice를 기록한다.
5. implementation queue와 discovery/policy queue를 분리한다.
6. implementation queue에 7.x, 8.x가 들어오면 hard stop 한다.
7. Epic 7/8은 구현 agent가 아니라 discovery/policy 산출물 workflow로만 보낸다.

### 변경 대상

| 대상 | 변경 방향 |
| --- | --- |
| `_bmad-output/story-automator/preflight-*.md` | G6 gate 적용 결과를 새로 생성 |
| `_bmad-output/story-automator/orchestration-*.md` | 새 scoped orchestration 생성, 기존 broad orchestration은 superseded 표시 |
| `_bmad-output/story-automator/policy-snapshots/*.json` | gate snapshot에 허용/차단 범위 기록 |
| story-automator 생성 로직 | `MVP-S04~MVP-S10`, 7.x, 8.x implementation queue 진입 hard stop |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | 자동화 대상 status와 mapping 반영 |

### 수용 기준

- 새 preflight의 selected implementation stories에 7.1~8.9가 없다.
- 새 orchestration `storyRange`가 G6 허용 범위와 일치한다.
- preflight 산출물에 `mvp-story-extraction-checklist.md`, 승인일 `2026-06-11`, allowed slice, blocked slice가 기록된다.
- discovery/policy story는 `create/dev/qa/review` 구현 pipeline에 배정되지 않는다.
- 기존 broad orchestration은 재개되지 않도록 superseded 또는 invalid 상태가 명확하다.

### 검증 방법

```powershell
rg -n "approval_scope|MVP-S01|MVP-S04|Next action" _bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\mvp-story-extraction-checklist.md
rg -n "storyRange|7\.1|8\.9|PAUSED|superseded" _bmad-output\story-automator\orchestration-*.md
rg -n "mvp-story-extraction|MVP-S01|MVP-S04|G6" _bmad-output\story-automator -g "*.md" -g "*.json"
```

재생성된 preflight에서는 selected count와 selected IDs를 gate 문서와 대조한다.

### 위험과 결정 필요 사항

- Epic 1~6 안에도 OQ-gated 동작이 있을 수 있다. story ID만으로 통과시키지 말고 checklist row의 approval state를 함께 봐야 한다.
- discovery 자동화가 필요하면 구현 자동화와 다른 workflow가 필요하다.
- 기존 orchestration을 수정해 재사용할지, 새 orchestration을 생성할지 결정해야 한다. 감사 관점에서는 새 run을 만들고 기존 run을 superseded로 남기는 방식이 더 추적하기 쉽다.

## Finding 5 개선: readiness dependency와 status 동기화

### 현재 문제

승인된 sprint change proposal은 Story 2.4a 추가와 sprint-status 갱신을 요구한다. 근거는 `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-10-readiness-dependency-fixes.md:151`, `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-10-readiness-dependency-fixes.md:160`, `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-10-readiness-dependency-fixes.md:328`, `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-10-readiness-dependency-fixes.md:361`, `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-10-readiness-dependency-fixes.md:366`이다.

현재 `epics.md`에는 Story 2.4a가 보이지 않고 Story 2.5가 바로 나온다. 근거는 `_bmad-output/planning-artifacts/epics.md:689`이다. `sprint-status.yaml`은 새 구조를 backlog로 둔다. 근거는 `_bmad-output/implementation-artifacts/sprint-status.yaml:46`, `_bmad-output/implementation-artifacts/sprint-status.yaml:56`, `_bmad-output/implementation-artifacts/sprint-status.yaml:57`이다.

반면 기존 implementation story 파일에는 이미 `done` 상태가 많다. 예시는 `_bmad-output/implementation-artifacts/1-1-스타터-템플릿으로-초기-프로젝트를-설정하고-본사-업무-공간에-로그인한다.md:7`, `_bmad-output/implementation-artifacts/2-4-지점장이-전일-이월-재고를-불러와-품목별-재고를-수정한다.md:12`, `_bmad-output/implementation-artifacts/4-3-본사가-마감된-장부에-정정-기록을-추가한다.md:14`, `_bmad-output/implementation-artifacts/5-3-본사가-선택-기간의-지점별-실적을-비교한다.md:13`이다.

### 개선 방향

먼저 old-to-new story migration table을 만든다. 바로 `sprint-status.yaml`을 손으로 고치면 중복 구현이나 잘못된 done 표시가 생길 수 있다.

권장 migration table 컬럼:

| 컬럼 | 의미 |
| --- | --- |
| `old_story_file` | 기존 implementation story 파일 |
| `old_status` | 기존 story 파일 상태 |
| `new_story_key` | 새 `sprint-status.yaml` 또는 새 epics 기준 story key |
| `coverage` | `full`, `partial`, `none`, `superseded` 중 하나 |
| `action` | `keep done`, `needs follow-up`, `split required`, `archive only` 중 하나 |
| `evidence` | 코드, 테스트, 문서 근거 |
| `notes` | 중복 구현 위험 또는 남은 AC |

그 다음에 `epics.md`에 Story 2.4a 또는 동등한 월초 재고 스냅샷 선행 story를 Story 2.5보다 앞에 둔다. 기존 Story 2.4가 이미 일부 스냅샷 범위를 구현했다면, 2.4a를 새로 구현시키지 말고 `partial/full coverage`로 매핑한 뒤 부족한 acceptance criteria만 follow-up story로 만든다.

마지막으로 `sprint-status.yaml`을 migration table에 맞춰 갱신한다.

### 변경 대상

| 대상 | 변경 방향 |
| --- | --- |
| `_bmad-output/planning-artifacts/epics.md` | Story 2.4a 또는 동등한 월초 재고 스냅샷 story를 Story 2.5 앞에 명시 |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | migration 결과에 따라 backlog/done/review 상태 갱신 |
| 새 migration 문서 | 기존 done story와 새 story key mapping 기록 |
| readiness report | 동기화 후 재검사하여 blocker 닫힘 여부 기록 |
| story-automator input | mapping과 status를 기준으로 중복 구현 방지 |

### 수용 기준

- `epics.md`에 Story 2.4a 또는 동등한 선행 스냅샷 story가 Story 2.5 앞에 있다.
- `sprint-status.yaml`에 해당 story key가 있고 상태가 migration 판단과 일치한다.
- 기존 done story 파일과 새 story key 사이의 mapping table이 있다.
- readiness 재검사에서 "월초 재고 스냅샷 선행 스토리 없음" blocker가 닫힌다.
- story-automator가 새 status/mapping을 기준으로 중복 구현을 만들지 않는다.

### 검증 방법

```powershell
rg -n "^### Story 2\.4a|^### Story 2\.5" _bmad-output\planning-artifacts\epics.md
rg -n "2-4a|월초 재고 스냅샷" _bmad-output\implementation-artifacts\sprint-status.yaml _bmad-output\planning-artifacts\epics.md
rg -n "^Status: done|^status: done" _bmad-output\implementation-artifacts -g "*.md"
```

추가 검증:

- migration table의 `old_story_file`이 실제 존재하는지 확인한다.
- migration table의 `new_story_key`가 `sprint-status.yaml`에 존재하는지 확인한다.
- `coverage: full`로 표시한 항목은 관련 테스트나 코드 근거가 있어야 한다.
- `coverage: partial`인 항목은 follow-up story가 있어야 한다.

### 위험과 결정 필요 사항

- 기존 Story 2.4가 월초 스냅샷 모델과 이월 규칙을 이미 일부 구현했다면, Story 2.4a를 새 backlog로 추가할 때 같은 일을 다시 시킬 수 있다.
- story numbering이 바뀌면 기존 파일명, source story, sprint status key, automator storyRange가 서로 어긋날 수 있다.
- "문서만 누락"인지 "구현도 누락"인지 판단하려면 Story 2.4 구현 결과와 승인된 2.4a acceptance criteria를 따로 대조해야 한다.

## 종합 검증 계획

### 정적 검증

```powershell
rg -n "Finding 1|Finding 2|Finding 3|Finding 4|Finding 5" _bmad-output\implementation-artifacts\investigations\recent-doc-implementation-improvement-directions.md
rg -n "grossMarginRate|inventoryAmount|PURCHASE_ROW|/app/reports/comparison|MVP-S01~MVP-S03|Story 2.4a" _bmad-output\implementation-artifacts\investigations\recent-doc-implementation-improvement-directions.md
```

### 코드 수정 후 권장 테스트

```powershell
pnpm test:unit -- tests/unit/ledger-review.test.mjs tests/unit/ledger-submit.test.mjs tests/unit/ledger-correction-calculations.test.mjs tests/unit/hq-reports.test.mjs tests/unit/ledger-inventory.test.mjs tests/unit/ledger-losses.test.mjs
pnpm test:e2e -- tests/e2e/store-ledger-review.spec.ts tests/e2e/hq-ledger-corrections.spec.ts tests/e2e/hq-reports.spec.ts
```

### 문서/status 수정 후 권장 확인

```powershell
rg -n "MVP-S01~MVP-S03|MVP-S04~MVP-S10|Story 2\.4a|Story 2\.5" _bmad-output\planning-artifacts _bmad-output\story-automator _bmad-output\implementation-artifacts\sprint-status.yaml
rg -n "^Status: done|^status: done|backlog|review" _bmad-output\implementation-artifacts -g "*.md"
```

## 완료 기준

이 개선 방향 문서를 실제 작업으로 전환할 때 완료 기준은 다음과 같다.

- Finding 1: 지점장 API/UI에서 `grossMarginRate`, `inventoryAmount`, `이익률`, `재고금액`이 사라지고 테스트가 이를 검증한다.
- Finding 2: `PURCHASE_ROW:amount` 정정이 shared overlay에서 적용되거나, 정책 미확정으로 UI target이 명확히 비활성화된다.
- Finding 3: comparison report에 의존하는 모든 장부/재고/손실/마감 변경 경로가 `/app/reports/comparison`을 revalidate한다.
- Finding 4: story-automator가 G6 gate를 통과한 구현 범위만 처리하며 Epic 7/8은 구현 queue에서 빠진다.
- Finding 5: Story 2.4a 또는 동등 story가 planning/status에 반영되고, 기존 done story와 새 status 구조의 mapping이 문서화된다.

