# done_Meeting Design Remediation Implementation Plan

반영완료: 작업지시서에 따른 보수적 정책 gate 정리, 이카운트 scope 차단, FIFO 제품 경로 차단, 매입 행 정정 차단/리포트 근거 연결을 끝냈습니다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** `docs/meeting/change.md`의 미팅 설계와 현재 구현 사이의 위험한 차이를 없앤다. 특히 이카운트 업로드, FIFO 정책 gate, 매입 행 정정 반영을 먼저 바로잡는다.

**Architecture:** Next.js App Router + Server Actions + Prisma + shared server calculation modules. 계산은 UI가 아니라 `src/server/calculations/**`에서 한 번만 결정한다. 권한과 감사 로그는 서버 action에서 강제한다.

**Tech Stack:** TypeScript, Prisma, Node test runner, pnpm, Next.js, Zod.

---

## Task 1. 이카운트 업로드를 안전한 상태로 되돌린다

**Problem:** 업로드 UI/action은 비활성 상태인데, parser는 선택 장부의 지점/일자와 다른 행도 import하는 테스트를 통과시킨다.

**Files:**

- `src/features/ledger/ecount-purchase-import.ts`
- `src/features/ledger/ecount-purchase-actions.ts`
- `src/features/ledger/components/purchase-step-client.tsx`
- `tests/unit/ecount-purchase-import.test.mjs`
- `tests/unit/ledger-purchase.test.mjs`

**Steps:**

- [ ] `tests/unit/ecount-purchase-import.test.mjs`의 mismatch 허용 테스트를 삭제하거나 반대로 바꾼다. 새 기대값은 선택한 `storeName` 또는 `closingDate`와 맞지 않는 행이 있으면 preview error가 나는 것이다.
- [ ] `parseEcountPurchaseWorkbook(bytes, options)`에서 `_options` 이름을 `options`로 바꾸고 실제로 사용한다.
- [ ] workbook의 `일자-No.`에서 날짜를 정규화하고, 선택 `closingDate`와 비교한다.
- [ ] workbook의 `거래처명` 또는 승인된 지점 mapping key를 선택 `storeName`과 비교한다. 단순 문자열 완전 일치가 부족하면 policy 문서의 CAP-5 mapping 계약을 먼저 참조한다.
- [ ] mismatch는 조용히 skip하지 말고 preview error로 반환한다. 사용자가 어느 행이 왜 막혔는지 볼 수 있어야 한다.
- [ ] CAP-6 구현 승격이 아직 불가라면 `src/features/ledger/ecount-purchase-actions.ts`와 UI를 되살리지 말고, parser test를 안전하게 막는 데서 멈춘다.
- [ ] CAP-6 구현 승격이 승인되었다면 `previewEcountPurchaseUpload()`를 복구하고, commit/void/reprocess, 권한, 감사 로그, 원본 보존을 별도 subtask로 구현한다.
- [ ] `tests/unit/ledger-purchase.test.mjs`의 `ecountUploadEnabled` 부정 테스트는 정책 상태에 맞게 수정한다. 승인 전이면 "차단 안내"를 확인하고, 승인 후이면 `.xlsx` upload control과 본사 권한만 확인한다.

**Acceptance Criteria:**

- [ ] 다른 지점 또는 다른 마감일의 이카운트 행은 장부 preview/import에 들어가지 않는다.
- [ ] parser는 `options.storeName`, `options.closingDate`를 실제 검증에 사용한다.
- [ ] CAP-6 승인 전이면 제품 UI에서 업로드 완료처럼 보이지 않는다.
- [ ] CAP-6 승인 후이면 본사 권한, 파일 크기, `.xlsx`, store scope, audit log가 모두 서버에서 강제된다.

**Verify:**

```powershell
pnpm test:unit -- tests/unit/ecount-purchase-import.test.mjs tests/unit/ledger-purchase.test.mjs
```

## Task 2. FIFO 계산을 정책 gate와 다시 맞춘다

**Problem:** OQ-7/OQ-17 승인 전인데 FIFO 값이 있으면 판매원가와 재고금액이 `ok`로 계산된다.

**Files:**

- `src/server/calculations/ledger.ts`
- `src/server/calculations/policy-gates.ts`
- `src/features/inventory/fifo-lots.ts`
- `prisma/schema.prisma`
- `tests/unit/calculation-policy-gates.test.mjs`
- `tests/unit/ledger-inventory.test.mjs`

**Steps:**

- [ ] 먼저 정책 결정을 확인한다. 현재 정책 문서 기준으로는 OQ-7/OQ-17 승인 전이다.
- [ ] `tests/unit/calculation-policy-gates.test.mjs`에서 FIFO 값이 있어도 승인 근거가 없으면 `costOfGoodsSold`와 `inventoryAmount`가 `policy-unconfirmed`가 되도록 기대값을 바꾼다.
- [ ] `src/server/calculations/ledger.ts`에서 FIFO consumed/remaining amount를 바로 `ok` 값으로 쓰지 않는다.
- [ ] 승인 근거가 없는 FIFO-derived 값은 `policyUnconfirmedMetric()` 또는 같은 상태 계약을 통해 "기준 확인 필요"로 내려보낸다.
- [ ] 승인 전이라면 `src/features/inventory/fifo-lots.ts`, FIFO migration, Prisma model이 product path에서 호출되지 않게 한다. 이미 migration을 유지해야 한다면 어떤 화면/계산도 확정값으로 쓰지 않게 막는다.
- [ ] 승인 후라면 `approvedBasis`, mapping version, lot source completeness, OQ-17 replay order를 검증하는 구조를 추가한 뒤에만 `ok`를 허용한다.
- [ ] 지점장 응답에는 FIFO 원가, 재고금액, lot 근거가 새지 않는지 sensitive response test를 유지한다.

**Acceptance Criteria:**

- [ ] OQ-7/OQ-17 승인 전에는 FIFO 판매원가와 FIFO 재고금액이 확정 숫자처럼 표시되지 않는다.
- [ ] fallback 기본 계산값을 FIFO 확정값으로 이름만 바꿔 보여주지 않는다.
- [ ] 대시보드, 장부 상세, 리포트, export가 같은 calculation status를 사용한다.
- [ ] 지점장 경로에는 원가/재고금액/lot 근거가 노출되지 않는다.

**Verify:**

```powershell
pnpm test:unit -- tests/unit/calculation-policy-gates.test.mjs tests/unit/ledger-inventory.test.mjs
```

## Task 3. 매입 행 정정의 반영 방식을 하나로 정한다

**Problem:** `PURCHASE_ROW` 정정은 생성 가능하지만 shared calculation overlay와 리포트 matcher에는 반영되지 않는다.

**Files:**

- `src/features/corrections/actions.ts`
- `src/server/calculations/ledger.ts`
- `src/features/reports/queries.ts`
- `tests/unit/ledger-corrections.test.mjs`
- `tests/unit/ledger-correction-calculations.test.mjs`
- `tests/unit/hq-reports.test.mjs`

**Steps:**

- [ ] 먼저 제품 결정을 고른다. 보수적인 기본값은 "반영 경로가 생기기 전에는 `PURCHASE_ROW` 정정 생성을 막는다"이다.
- [ ] 막는 방향이면 `src/features/corrections/actions.ts`의 `PURCHASE_ROW` 분기를 제거하거나 validation에서 차단하고, schema/test도 그에 맞춘다.
- [ ] 반영하는 방향이면 `LedgerReviewSummaryInput`에 purchase row correction을 적용할 수 있는 입력 구조를 추가한다.
- [ ] `applySingleCorrection()`에 `PURCHASE_ROW` 분기를 추가한다. `unitPrice`, `quantity`, `amount`, `productName`, `referenceInfo` 중 계산에 영향을 주는 필드를 명확히 처리한다.
- [ ] 매입 정정이 판매원가나 마진율 계산에 직접 영향을 주지 않는 정책이라면, 리포트 근거에서 해당 정정을 "정정 반영 확인 필요"로 보여준다.
- [ ] `src/features/reports/queries.ts`의 matcher에 필요한 `PURCHASE_ROW` key를 추가한다. 최소한 gross margin, sales difference, purchase evidence가 정정 미반영 상태를 숨기지 않아야 한다.
- [ ] 정정 기록은 원본 row를 덮어쓰지 않고 append-only audit/correction record로 남긴다.

**Acceptance Criteria:**

- [ ] 본사가 매입 정정을 만들 수 있다면 회의 리포트와 계산 근거가 그 사실을 숨기지 않는다.
- [ ] 지원하지 않는 매입 정정은 생성 단계에서 명확히 막힌다.
- [ ] `unappliedCorrectionKeys`가 리포트 근거와 UI 상태에 연결된다.
- [ ] 원본 장부 row는 마감 후 직접 수정되지 않는다.

**Verify:**

```powershell
pnpm test:unit -- tests/unit/ledger-corrections.test.mjs tests/unit/ledger-correction-calculations.test.mjs tests/unit/hq-reports.test.mjs
```

## Task 4. 정책 대기 요구를 완료 기능처럼 보이지 않게 정리한다

**Problem:** 미팅 문서에는 희망 판매가 손실액, 외부 알림, 통합 전체 재고, 리사이징, 월 손익 같은 요구가 있지만 일부는 정책 승인 전이다.

**Files:**

- `_bmad-output/planning-artifacts/policy-decisions/**`
- `_bmad-output/implementation-artifacts/**`
- `docs/goal/done_meeting-design-implementation-audit.md`
- 제품 내 navigation/label이 있다면 해당 `src/app/**` 또는 `src/features/**`

**Steps:**

- [ ] 희망 판매가 기준 손실액은 OQ-9 승인 전 `hopedSalePriceLossAmount`를 계산값처럼 노출하지 않는다.
- [ ] 외부 LINE/텔레그램 알림은 OQ-13/OQ-16 승인 전 provider, scheduled route, worker, notification schema를 만들지 않는다.
- [ ] 본사 통합 전체 재고는 CAP-7 승인 전 원가/lot 포함 화면을 만들지 않는다. 필요하면 수량-only slice로 별도 명명한다.
- [ ] 리사이징 요구는 현재 고정 폭 테이블과 구분해서 "완료 기준 대기" 또는 별도 구현 story로 남긴다.
- [ ] 제품 화면, 릴리스 노트, 문서에서 위 항목을 "완료"라고 쓰지 않는다.

**Acceptance Criteria:**

- [ ] 정책 대기 항목은 사용자에게 완료 기능처럼 보이지 않는다.
- [ ] 정책 승인 전 코드/schema/test drift가 생기지 않는다.
- [ ] 승인 후 구현이 필요한 항목은 별도 story로 승격 조건을 갖는다.

**Verify:**

```powershell
rg -n "hopedSalePriceLossAmount|LINE|텔레그램|AllStoreInventory|fifoCostOfGoodsSold|fifoInventoryAmount" src prisma tests _bmad-output
```

## Full Verification

작업 전체가 끝나면 다음을 실행한다.

```powershell
pnpm test:unit -- tests/unit/ecount-purchase-import.test.mjs tests/unit/ledger-purchase.test.mjs tests/unit/calculation-policy-gates.test.mjs tests/unit/ledger-inventory.test.mjs tests/unit/ledger-corrections.test.mjs tests/unit/ledger-correction-calculations.test.mjs tests/unit/hq-reports.test.mjs
pnpm typecheck
pnpm lint
git diff --check
```

## Stop Conditions

- CAP-6, CAP-7, CAP-8, CAP-11, CAP-14 승인 상태가 불명확하면 구현을 진행하지 말고 정책 gate를 유지한다.
- 지점장 응답에 원가, 마진, 재고금액, lot 근거, 희망 판매가 파생값이 새면 배포하지 않는다.
- 테스트가 "잘못된 동작"을 기대하는 상태라면 코드보다 테스트 기대값을 먼저 고친다.
