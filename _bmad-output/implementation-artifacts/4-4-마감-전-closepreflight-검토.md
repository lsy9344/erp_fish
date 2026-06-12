---
baseline_commit: cb0477e
---

# Story 4.4: 마감 전 ClosePreflight 검토

Status: done

## Story

As a 본사 마감 담당자,
I want 장부를 마감하기 전에 마감 가능 여부와 위험 항목을 확인하고 싶다,
so that 누락이나 정책 미정 항목을 알고도 잘못 마감하지 않을 수 있다.

## Acceptance Criteria

1. **ClosePreflight 표 요약**
   - **Given** 본사 사용자가 장부 마감을 시도할 때
   - **When** ClosePreflight가 실행된다
   - **Then** 권한, 이미 마감 여부, 필수 누락, 숫자 오류, 이월 공백, 기준 확인 필요, 계산 불가 상태를 표로 요약해야 한다
   - **And** 마감 담당자는 어떤 항목이 차단이고 어떤 항목이 경고인지 구분할 수 있어야 한다.

2. **차단 항목과 보완 위치 안내**
   - **Given** 필수 입력 누락이나 저장 오류가 있을 때
   - **When** ClosePreflight 결과가 반환된다
   - **Then** 마감은 차단되어야 한다
   - **And** 사용자는 어느 단계/필드를 보완해야 하는지 알 수 있어야 한다.

3. **OQ-gated 항목의 정책 미정 표시**
   - **Given** OQ-gated 항목이 `기준 확인 필요` 상태일 때
   - **When** ClosePreflight가 표시된다
   - **Then** 확정 이상이나 확정 계산처럼 보이면 안 된다
   - **And** 마감 가능 여부에 미치는 기준은 PRD 정책 또는 승인된 설정에 따라야 한다.

4. **권한 없는 요청 차단**
   - **Given** 권한 없는 본사 계정이 ClosePreflight 또는 마감을 실행하려 할 때
   - **When** 서버가 요청을 처리한다
   - **Then** 요청은 거부되어야 한다
   - **And** 장부의 민감 데이터나 마감 가능성 상세를 반환하지 않아야 한다.

5. **마감 재검증용 version/edit token**
   - **Given** ClosePreflight가 성공적으로 실행될 때
   - **When** 사용자가 결과를 본다
   - **Then** 마감 대상 장부, 실행자, 실행 시각, 주요 검증 요약이 확인 가능해야 한다
   - **And** 이후 마감 action에서 같은 장부 version/edit token을 기준으로 재검증할 수 있어야 한다.

6. **접근 가능한 결과 UI**
   - **Given** ClosePreflight 결과가 화면에 표시될 때
   - **When** 사용자가 키보드나 보조기기로 확인한다
   - **Then** 차단/경고 상태는 색상만이 아니라 텍스트로도 구분되어야 한다
   - **And** 표의 상태와 설명은 읽기 순서가 자연스러워야 한다.

## Tasks / Subtasks

- [x] ClosePreflight 서버 계약을 추가한다 (AC: 1, 2, 3, 4, 5)
  - [x] `src/features/ledger/hq-close-actions.ts`의 기존 `closeHqLedger()` 경로를 유지하고, 같은 파일 또는 `src/features/ledger/hq-close-preflight.ts`에 `runHqLedgerClosePreflight()`와 순수 builder를 추가한다.
  - [x] `requireLedgerHqCloseAccess()`와 `requireHeadquartersLedgerScope(ledgerId)`를 통과하기 전에는 장부 상세, 민감 계산값, 마감 가능성 상세를 반환하지 않는다.
  - [x] 결과 타입은 최소 `ledgerId`, `storeName`, `closingDate`, `ledgerUpdatedAt`, `executedBy`, `executedAt`, `canClose`, `summary`, `items[]`를 포함한다. `items[]`는 `id`, `label`, `severity: "blocking" | "warning" | "exception-allowed" | "info"`, `statusLabel`, `detail`, `actionLabel`, `href?`, `source`를 갖게 한다.
  - [x] 이미 `HEADQUARTERS_CLOSED`인 장부, `HOLIDAY` 장부, `IN_PROGRESS`/`IN_REVIEW` 밖 상태, ledger id 불일치, 숫자 형식 오류/서버 계산 실패, 미확정 정정 반영 상태는 차단 항목으로 반환한다.
  - [x] 필수 입력 누락, 이월 공백, 가격 기준 없음은 PRD 마감 가능성 표에 맞춰 개별 마감에서만 `exception-allowed`로 분류하되, 이 story에서는 실제 예외 마감 실행까지 확장하지 않는다. 예외 마감 실행은 Story 4.5에서 마감 action 사유 입력과 함께 완성한다.

- [x] 기존 검증/계산 helper를 재사용해 preflight 항목을 만든다 (AC: 1, 2, 3)
  - [x] 필수 누락과 보완 링크는 `getLedgerReviewMissingItems()`와 `getLedgerReviewStepHref()`의 단계/href 계약을 재사용한다. 별도 라우트나 새 7단계 폼을 만들지 않는다.
  - [x] 숫자 오류와 계산 불가는 `calculateLedgerReviewSummary()`의 `data-insufficient`, `calculation-unavailable`, `policy-unconfirmed` 상태를 그대로 사용한다. `policy-unconfirmed`를 확정 이상, 확정 warning, 0원 대체 계산으로 승격하지 않는다.
  - [x] 관제판과 리포트가 쓰는 `applyCorrectionValuesToLedgerReviewInput()` 및 correction state 계약을 참고해 `hasUnappliedCorrections`는 차단 또는 재확인 필요 항목으로 표시한다.
  - [x] 재고 이월은 `LedgerInventoryItem.carryoverStatus`, `carryoverSource`, `carryoverLedgerId`를 읽어 `DATA_INSUFFICIENT`, 전일 장부 없음, 본사 마감 전 후보 등 보완이 필요한 상태를 표 행으로 만든다.
  - [x] 이상 신호는 Story 4.2의 dashboard signal 계약을 재사용한다. OQ-1, FIFO, `30%단가`, 희망 판매가 손실액 같은 정책 미정 항목은 `기준 확인 필요`로 남긴다.

- [x] 장부 상세의 마감 UI를 ClosePreflight 중심으로 바꾼다 (AC: 1, 5, 6)
  - [x] `src/features/ledger/components/hq-ledger-close-dialog.tsx`는 즉시 "마감 확정"만 보여주는 현재 구조에서, dialog open 시 preflight를 먼저 실행하고 결과 표를 표시한 뒤 차단 항목이 없을 때만 confirm 버튼을 활성화한다.
  - [x] 결과 표는 조건명, 상태, 설명, 필요한 조치, 보완 링크를 표시한다. 차단/경고는 색상뿐 아니라 `차단`, `경고`, `사유 필요`, `정보` 텍스트로 구분한다.
  - [x] `ledgerUpdatedAt`은 preflight 결과의 token을 confirm payload로 넘긴다. `useLedgerUpdatedAtSync()`로 최신 token이 바뀌면 기존 preflight 결과를 stale로 취급하고 재점검을 요구한다.
  - [x] `src/app/app/ledgers/[ledgerId]/page.tsx`의 기존 `/app/ledgers/[ledgerId]` 상세 경로, dashboard query state 복귀 링크, `HqLedgerCloseDialog` 위치를 유지한다. Sheet나 새 close page를 만들지 않는다.
  - [x] 조회 전용 본사, 업로드 담당자 기본 권한, 지점장 direct URL은 close button 또는 preflight mutation을 사용할 수 없어야 하며, 서버 action 차단이 기준이다.

- [x] `closeHqLedger()`가 preflight 통과만 믿지 않고 마감 직전에 재검증하도록 보강한다 (AC: 4, 5)
  - [x] `closeHqLedger()`는 기존 `requireLedgerHqCloseAccess()`, `requireHeadquartersLedgerScope()`, `updatedAt` 조건 updateMany, 중복 마감 idempotency, `ledger.hq.closed` audit action을 유지한다.
  - [x] close transaction 안에서 preflight builder 또는 동일 순수 검증 함수를 다시 호출한다. 차단 항목이 생기면 `LEDGER_CLOSE_PREFLIGHT_BLOCKED` 또는 동등한 구조화 오류를 반환하고 장부 상태와 감사 로그를 변경하지 않는다.
  - [x] stale token은 기존 `LEDGER_CONFLICT`와 `section: "hq-close"`, `hqEditing: true`, `reloadRequired: true` 계약을 유지한다.
  - [x] 마감 감사 로그의 `after` 또는 audit payload에는 preflight summary, 실행자, 실행 시각, 마감 전 상태, 차단/경고 건수, 사용한 token을 남긴다. 단, 민감 상세를 권한 없는 응답에 노출하지 않는다.
  - [x] 성공 후 `/app/ledgers/${ledgerId}`, `/app/dashboard`, `/app/reports/daily`, `/app/reports/monthly` revalidation을 유지한다.

- [x] 회귀 테스트를 보강한다 (AC: 1, 2, 3, 4, 5, 6)
  - [x] `tests/unit/hq-ledger-edit.test.mjs` 또는 새 `tests/unit/hq-ledger-close-preflight.test.mjs`에 preflight export, 권한 helper, scope helper, result item severity, `getLedgerReviewMissingItems`, `calculateLedgerReviewSummary`, `policy-unconfirmed`, `LEDGER_CLOSE_PREFLIGHT_BLOCKED` 재검증을 고정한다.
  - [x] `tests/unit/ledger-conflicts.test.mjs`는 `hq-close` conflict payload가 계속 `clientValues`, `serverValues`, `reloadRequired: true`, `hqEditing: true`를 포함하는지 유지한다.
  - [x] `tests/e2e/hq-ledger-edit.spec.ts`의 마감 버튼 시나리오를 확장해 preflight 표가 열리고, 차단 항목이 있으면 `마감 확정`이 disabled 되며, 보완 링크가 기존 장부 입력 단계로 이동하는지 검증한다.
  - [x] E2E에 OQ-gated `기준 확인 필요`가 확정 이상처럼 보이지 않고, 차단/경고 텍스트가 색상 없이도 읽히는지 추가한다.
  - [x] 권한 없는 본사 또는 지점장 세션이 preflight/close server action을 직접 호출해도 상세 결과 없이 거부되는 테스트를 추가한다.
  - [x] 실행 후보: `corepack pnpm test:unit`, `corepack pnpm typecheck`, `corepack pnpm lint`, 가능하면 `corepack pnpm test:e2e -- tests/e2e/hq-ledger-edit.spec.ts tests/e2e/store-ledger-conflicts.spec.ts`.

## Dev Notes

### 핵심 구현 방향

- 이 story는 마감 실행 자체보다 "마감 전 판단 결과를 서버 기준으로 만들고 UI에 표시하는 계약"이 핵심이다. Story 4.5가 실제 본사 마감과 원본 잠금을 완성하므로, 4.4에서 새 마감 플로우를 별도로 만들지 않는다.
- 현재 `closeHqLedger()`는 이미 존재한다. 새 `closeDailyLedger`, 새 route handler, 새 상세 페이지를 만들지 말고 기존 `src/features/ledger/hq-close-actions.ts`와 `HqLedgerCloseDialog`를 보강한다.
- Preflight는 권한 있는 본사 마감 담당자가 보는 운영 판단표다. 권한 없는 사용자에게는 "권한 없음"만 반환하고, 어떤 조건 때문에 마감 가능한지/불가능한지 상세를 주면 안 된다.
- Preflight 결과는 snapshot이다. 사용자가 결과를 본 뒤 장부가 바뀔 수 있으므로 close action은 같은 `ledgerUpdatedAt`으로 재검증해야 한다.

### 현재 코드 상태와 보존할 동작

- `src/features/ledger/hq-close-actions.ts`
  - 현재 `closeHqLedger()`가 `ledgerId`, `ledgerUpdatedAt`을 받고 `requireLedgerHqCloseAccess()`, `requireHeadquartersLedgerScope()`, `updatedAt` 조건 updateMany, `ledger.hq.closed` audit, revalidation을 수행한다.
  - 보존: `HEADQUARTERS_CLOSED`는 `LEDGER_ALREADY_CLOSED`, `HOLIDAY`는 `LEDGER_NOT_EDITABLE`, stale token은 `LEDGER_CONFLICT`로 남긴다.
  - 보강: close transaction에서 preflight builder를 다시 실행해 차단 항목을 확인한다.

- `src/features/ledger/components/hq-ledger-close-dialog.tsx`
  - 현재 dialog는 설명문과 `마감 확정` 버튼만 보여주고 즉시 `closeHqLedger()`를 호출한다.
  - 보강: open 시 preflight loading/error/result state를 갖고, 결과 표와 요약을 표시한다. 차단 항목이 있으면 confirm을 막고 보완 action만 제공한다.
  - 보존: `SaveConflictDialog`, `useLedgerUpdatedAtSync()`, `router.refresh()` 흐름은 유지한다.

- `src/app/app/ledgers/[ledgerId]/page.tsx`
  - 현재 `requireReportAccess()`, `hasActionPermission(... LEDGER_HQ_CLOSE)`, `hasActionPermission(... CORRECTION_CREATE)`로 상세 조회/마감/정정 action 권한을 분리한다.
  - 보존: 본사 상세은 `/app/ledgers/[ledgerId]` 페이지이고, close dialog는 상세 페이지 안의 섹션으로 남는다. 관제판 복귀 query state도 유지한다.

- `src/features/ledger/review-validation.ts`
  - `getLedgerReviewMissingItems()`가 총매출/결제, 비용, 매입, 재고, 손실, 근무 보완 링크를 만든다.
  - 보강: preflight의 필수 누락 항목은 이 helper를 재사용해 "어느 단계/필드 보완" 요구를 만족한다.

- `src/server/calculations/ledger.ts`
  - `calculateLedgerReviewSummary()`와 status labels가 `ok`, `data-insufficient`, `policy-unconfirmed`, `calculation-unavailable`을 구분한다.
  - 보존: `policy-unconfirmed`는 `기준 확인 필요`로 유지한다. Preflight가 이를 확정 이상이나 계산 완료 값처럼 표시하면 Story 4.2 회귀다.

- `src/features/dashboard/queries.ts`
  - dashboard/detail 계산은 correction-applied input, anomaly signal, missing item helper를 이미 조합한다.
  - 보강: preflight에서 같은 계산 의미를 재사용하되, 본사 마감 권한 없는 응답에 dashboard row 수준 민감 정보를 우회 노출하지 않는다.

- `tests/e2e/hq-ledger-edit.spec.ts`
  - 현재 본사마감 성공, 중복 요청, stale token conflict를 이미 검증한다.
  - 보강: 이 테스트를 preflight 표 확인, 차단 항목, OQ-gated 표시, 권한 차단까지 확장한다.

### Preflight 항목 분류 기준

| 조건                                               | severity                        | 마감 버튼           | 보완/표시 기준                                    |
| -------------------------------------------------- | ------------------------------- | ------------------- | ------------------------------------------------- |
| 로그인 없음, `LEDGER_HQ_CLOSE` 없음, scope 밖 장부 | blocking                        | 실행 불가           | 상세 결과 없이 권한 오류                          |
| 이미 본사마감                                      | blocking                        | 실행 불가           | 기존 마감 상태와 중복 요청 안내                   |
| 휴무 장부                                          | blocking                        | 실행 불가           | `HOLIDAY`는 원본 close 대상이 아님                |
| stale `ledgerUpdatedAt`                            | blocking/conflict               | 실행 불가           | 기존 `LEDGER_CONFLICT` dialog                     |
| 필수 입력 누락                                     | exception-allowed 또는 blocking | 4.4에서는 실행 보류 | 누락 단계/필드와 기존 입력 링크 표시              |
| 숫자 오류, 서버 계산 실패                          | blocking                        | 실행 불가           | `calculation-unavailable`와 오류 항목 표시        |
| 이월 공백, 가격 기준 없음                          | exception-allowed               | 4.4에서는 실행 보류 | 개별 마감 사유 필요로 표시, 일괄 마감은 차단 기준 |
| OQ-gated `policy-unconfirmed`                      | warning/info                    | 정책 기준 따름      | `기준 확인 필요`, 확정 이상 아님                  |
| 이상 신호 존재                                     | warning                         | 차단 아님           | 이상 신호 요약과 확인 필요 표시                   |
| 정정 영향 미확정 또는 unapplied correction         | blocking                        | 실행 불가           | 정정 영향 재확인 필요 표시                        |

### 권한 및 보안 가드레일

- ClosePreflight와 close action은 둘 다 `PermissionAction.LEDGER_HQ_CLOSE`가 필요하다. `REPORT_VIEW`만 있는 조회 전용 본사는 결과 표를 볼 수 없다.
- `requireHeadquartersLedgerScope(ledgerId)` 이전에 ledger detail, store name, 계산 결과, missing item detail을 반환하지 않는다.
- 지점장 화면/API에는 본사 preflight 결과를 재사용하지 않는다. 지점장에게 타 지점, 민감 지표, 본사 마감 가능성 상세가 내려가면 보안 회귀다.
- UI에서 버튼을 숨기는 것은 보조 수단이다. server action 직접 호출 차단이 acceptance 기준이다.

### UX / 접근성 가드레일

- Preflight 결과는 shadcn/ui `Dialog`, `Table` 또는 기존 table 스타일, `Alert`, `Badge`, `Button`을 사용한다. Dialog 위에 Dialog를 또 띄우지 않는다.
- 표 행에는 상태 텍스트가 반드시 있어야 한다. 빨간/노란 border만으로 차단/경고를 전달하지 않는다.
- 보완 링크는 기존 단계 route로 이동해야 하며, 새 임시 폼이나 새 dashboard-v2를 만들지 않는다.
- 모바일 폭에서도 조건명, 상태, 조치가 겹치지 않도록 행을 카드형으로 접거나 `overflow-x-auto`를 사용한다.
- Confirm 버튼 문구는 preflight가 통과했을 때만 `마감 확정`으로 보이고, 차단 항목이 있으면 `차단 항목 보완 필요` 같은 명확한 disabled 상태를 제공한다.

### Project Structure Notes

- UPDATE 가능성이 높은 파일:
  - `src/features/ledger/hq-close-actions.ts`
  - `src/features/ledger/components/hq-ledger-close-dialog.tsx`
  - `src/app/app/ledgers/[ledgerId]/page.tsx`
  - `src/features/ledger/review-validation.ts`
  - `src/features/ledger/review-types.ts`
  - `src/features/ledger/conflicts.ts`
  - `src/features/audit/audit-format.ts`
  - `tests/unit/hq-ledger-edit.test.mjs`
  - `tests/unit/ledger-conflicts.test.mjs`
  - `tests/e2e/hq-ledger-edit.spec.ts`
- NEW 가능성이 있는 파일:
  - `src/features/ledger/hq-close-preflight.ts`는 preflight builder가 커질 때만 만든다.
  - `src/features/ledger/components/hq-ledger-close-preflight-table.tsx`는 dialog 내부 JSX가 비대해질 때만 만든다.
  - `tests/unit/hq-ledger-close-preflight.test.mjs`는 기존 `hq-ledger-edit.test.mjs`가 지나치게 커질 때만 만든다.
- DB migration은 기본적으로 필요 없다. `DailyLedger.status`, `updatedAt`, `closedById`, `closedAt`, `AuditLog.before/after/reason`으로 4.4 범위를 처리한다.

### Previous Story / Git Intelligence

- Story 4.1은 `/app/dashboard`에서 `/app/ledgers/[ledgerId]`로 들어오는 본사 상세 경로와 조회/수정/마감/정정 권한 분리 패턴을 만들었다.
- Story 4.2는 `기준 확인 필요`, `데이터 부족`, `계산 불가`, 필수 누락 상태가 서로 덮이지 않도록 dashboard signal과 계산 status를 고정했다. Preflight도 이 구분을 유지해야 한다.
- Story 4.3은 본사 원본 수정, 사유 audit, stale token conflict, closed-ledger 원본 수정 차단, 정정 안내를 완성했다. 4.4는 그 결과를 마감 전 판단표로 읽어야 하며 같은 conflict dialog와 권한 helper를 재사용한다.
- 최근 커밋 `cb0477e feat(story-4.3): 본사 마감 전 장부 보완 수정`은 HQ edit/close 상세 흐름을 최신 기준으로 만든 baseline이다.
- 최근 커밋 `5dd8540 feat(story-4.2): 관제판 이상 상태와 기준 확인 필요 표시`는 OQ-gated 상태를 확정 warning으로 승격하지 않는 규칙을 세웠다.

### 기술 스택과 버전 기준

- `package.json` 기준 Next `^15.2.3`, React `^19.0.0`, Prisma `^6.6.0`, next-auth `5.0.0-beta.25`, Zod `^3.24.2`, Playwright `^1.60.0`, Tailwind `^4.0.15`, shadcn `^4.8.2`, pnpm `10.31.0`를 사용한다.
- 신규 라이브러리 도입이나 major upgrade는 하지 않는다. Next App Router, Server Actions, Prisma transaction, shadcn/ui, 기존 node:test/Playwright 패턴을 유지한다.

### Discovery Results

- Loaded `epics_content` from `_bmad-output/planning-artifacts/epics.md`.
- Loaded `architecture_content` from `_bmad-output/planning-artifacts/architecture.md`.
- Loaded `prd_content` from `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md`.
- Loaded `ux_content` from `_bmad-output/planning-artifacts/ux-designs/ux-erp_fish-2026-05-28/DESIGN.md` and `EXPERIENCE.md`.
- Loaded previous story intelligence from `_bmad-output/implementation-artifacts/4-3-본사-마감-전-장부-보완-수정.md`.
- No `project-context.md` file was found under the project root.
- Read current implementation candidates: `src/app/app/ledgers/[ledgerId]/page.tsx`, `src/features/ledger/hq-close-actions.ts`, `src/features/ledger/components/hq-ledger-close-dialog.tsx`, `src/features/ledger/review-validation.ts`, `src/features/ledger/review-types.ts`, `src/features/ledger/conflicts.ts`, `src/lib/action-result.ts`, `src/features/dashboard/queries.ts`, `src/server/calculations/ledger.ts`, `tests/unit/hq-ledger-edit.test.mjs`, `tests/unit/ledger-conflicts.test.mjs`, `tests/e2e/hq-ledger-edit.spec.ts`, `package.json`.

### Checklist Validation Notes

- Critical miss covered: close action must re-run preflight in the same transaction and cannot trust an earlier UI preflight result.
- Reinvention prevention: story directs developers to extend `closeHqLedger`, `HqLedgerCloseDialog`, existing review validation, calculation status, conflict dialog, authz helpers, and audit helper.
- Regression prevention: OQ-gated `policy-unconfirmed` remains `기준 확인 필요`; closed-ledger edit blocking and correction flow from Story 4.3 remain unchanged.
- Security prevention: unauthorized preflight returns no detailed closeability data; server action checks are required even if UI hides buttons.
- LLM optimization: implementation guidance is scoped to concrete files and contracts; bulk close, exception close execution, and post-close correction behavior are kept out of 4.4 unless needed as displayed preflight context.

### References

- `_bmad-output/planning-artifacts/epics.md` - Epic 4, Story 4.4 and adjacent Story 4.3/4.5 context.
- `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md` - §3.2 edit token and conflict rules; §4.1 permission/audit matrix; §4.5 FR-19 closeability table; CAP-15 dry run context.
- `_bmad-output/planning-artifacts/architecture.md` - authorization, audit, close/correction, revalidation, project structure, implementation consistency.
- `_bmad-output/planning-artifacts/ux-designs/ux-erp_fish-2026-05-28/EXPERIENCE.md` - ClosePreflight, detail route, dialog stack, role permissions, state patterns, Flow 3/5.
- `_bmad-output/planning-artifacts/ux-designs/ux-erp_fish-2026-05-28/DESIGN.md` - Preflight row state and ERP visual system.
- `_bmad-output/implementation-artifacts/4-3-본사-마감-전-장부-보완-수정.md`
- `package.json`
- `src/app/app/ledgers/[ledgerId]/page.tsx`
- `src/features/ledger/hq-close-actions.ts`
- `src/features/ledger/components/hq-ledger-close-dialog.tsx`
- `src/features/ledger/review-validation.ts`
- `src/features/ledger/review-types.ts`
- `src/features/ledger/conflicts.ts`
- `src/lib/action-result.ts`
- `src/features/dashboard/queries.ts`
- `src/server/calculations/ledger.ts`
- `tests/unit/hq-ledger-edit.test.mjs`
- `tests/unit/ledger-conflicts.test.mjs`
- `tests/e2e/hq-ledger-edit.spec.ts`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 2026-06-12T14:32:59+09:00 - Red: `node --experimental-strip-types tests/unit/hq-ledger-edit.test.mjs` failed on missing preflight contract and dialog wiring.
- 2026-06-12T14:32:59+09:00 - Green/refactor: `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test:unit`, and `corepack pnpm build` passed.
- 2026-06-12T14:32:59+09:00 - E2E attempted with `corepack pnpm test:e2e -- tests/e2e/hq-ledger-edit.spec.ts tests/e2e/store-ledger-conflicts.spec.ts`; Playwright webServer could not bind `127.0.0.1:3000` in this sandbox (`listen EPERM`), so browser tests did not execute.
- 2026-06-12T14:49:01+09:00 - Senior review auto-fix: `node --experimental-strip-types --test tests/unit/hq-ledger-edit.test.mjs`, `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test:unit`, and `corepack pnpm build` passed.
- 2026-06-12T14:49:01+09:00 - Senior review E2E retry: `corepack pnpm test:e2e -- tests/e2e/hq-ledger-edit.spec.ts tests/e2e/store-ledger-conflicts.spec.ts` failed before tests because Playwright webServer exited early; direct `next dev --hostname 127.0.0.1 --port 3000` showed `listen EPERM`.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- ClosePreflight 서버 action과 transaction-safe builder를 추가해 권한/scope 통과 전 상세 데이터를 반환하지 않도록 유지했다.
- Preflight 결과는 상태, 필수 누락, 계산 상태, 정정 반영 상태, 재고 이월, 가격 기준, dashboard anomaly signal을 표 항목으로 요약한다.
- 마감 dialog는 open 시 preflight를 실행하고 결과 표와 상태 텍스트를 표시하며, stale token이면 재점검을 요구한다.
- `closeHqLedger()`는 마감 직전 같은 builder로 재검증하고, 차단 항목이 있으면 `LEDGER_CLOSE_PREFLIGHT_BLOCKED`로 상태 변경과 audit write를 막는다.
- E2E 시나리오는 preflight 표/차단 링크/disabled confirm 흐름으로 보강했으나, 현재 sandbox 포트 바인딩 제한 때문에 실행은 차단됐다.
- Senior review에서 권한/이미 마감 여부 통과 상태가 결과 표에 항상 표시되도록 보강했다.
- Senior review에서 stale close token은 새 preflight blocker보다 먼저 `LEDGER_CONFLICT`로 반환되도록 보강했다.
- Senior review에서 `LedgerInventoryAdjustment.amountStatus = POLICY_UNCONFIRMED`를 `기준 확인 필요` warning으로 표시하고 확정 계산처럼 보이지 않게 보강했다.
- Senior review에서 ClosePreflight 표를 모바일/좁은 폭에서 가로 스크롤되도록 감쌌다.

## Senior Developer Review (AI)

### Review Outcome

Approved after auto-fix. Remaining critical issues: 0.

### Findings Fixed

- HIGH: ClosePreflight 표가 권한 통과와 이미 마감 여부의 정상 상태를 생략해 AC 1의 표 요약 범위가 부분 구현이었다. `src/features/ledger/hq-close-preflight.ts`에 권한 확인 및 미마감 상태 info row를 추가했다.
- HIGH: stale `ledgerUpdatedAt` close 요청에서 최신 장부가 preflight blocker를 만들면 기존 `LEDGER_CONFLICT` 계약보다 `LEDGER_CLOSE_PREFLIGHT_BLOCKED`가 먼저 반환될 수 있었다. `src/features/ledger/hq-close-actions.ts`에서 transaction 내 preflight 재검증 전에 token conflict를 먼저 판정하도록 수정했다.
- MEDIUM: `LedgerInventoryAdjustment.amountStatus = POLICY_UNCONFIRMED`가 선택만 되고 preflight row로 표시되지 않아 OQ-gated 재고 조정 금액이 확정 계산처럼 보일 여지가 있었다. `src/features/ledger/hq-close-preflight.ts`에 `재고 조정 금액 기준` warning row를 추가했다.
- MEDIUM: ClosePreflight table이 좁은 폭에서 overflow 대응 없이 렌더링되어 UX 가드레일의 모바일 표 표시 조건이 약했다. `src/features/ledger/components/hq-ledger-close-dialog.tsx`에 `overflow-x-auto` 래퍼를 추가했다.

### Validation

- Passed: `node --experimental-strip-types --test tests/unit/hq-ledger-edit.test.mjs`
- Passed: `corepack pnpm typecheck`
- Passed: `corepack pnpm lint`
- Passed: `corepack pnpm test:unit`
- Passed: `corepack pnpm build`
- Blocked by environment: `corepack pnpm test:e2e -- tests/e2e/hq-ledger-edit.spec.ts tests/e2e/store-ledger-conflicts.spec.ts` because Playwright webServer cannot bind `127.0.0.1:3000` in this sandbox (`listen EPERM`).

### File List

- src/features/ledger/hq-close-preflight.ts
- src/features/ledger/hq-close-actions.ts
- src/features/ledger/components/hq-ledger-close-dialog.tsx
- tests/unit/hq-ledger-edit.test.mjs
- tests/e2e/hq-ledger-edit.spec.ts
- \_bmad-output/implementation-artifacts/4-4-마감-전-closepreflight-검토.md
- \_bmad-output/implementation-artifacts/sprint-status.yaml
