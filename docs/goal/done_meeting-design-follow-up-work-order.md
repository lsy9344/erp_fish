# done_미팅 설계 적용 검토 후속 작업지시서

적용 상태: 2026-06-20 적용 완료

적용 내용:

- ECOUNT 매입 parser는 `validateLedgerScope`를 생략해도 지점/마감일 검증이 켜지도록 바꿨고, 매입 기준 마스터 가져오기 경로만 명시적으로 검증을 끄게 했다.
- 작성자 표시명은 1단계 매출/결제 저장 시 필수 입력으로 막고, 이후 단계는 저장된 작성자 표시명을 그대로 표시/유지하는 기존 흐름을 유지했다.
- `test:e2e:core`에 10개 이상 지점 검색/활성 상태 운영 E2E를 포함했다.
- 릴리스 체크리스트에 10개 이상 지점 운영 검증 증거와 정책 승인 대기 항목의 배포 금지 조건을 추가했다.
- 지점장 민감 지표, ECOUNT 장부 업로드 제품 승격, FIFO lot/통합 재고 금액, 일괄 마감, HR/급여, 월 손익, 외부 알림, AI 분석은 승인 전 제품 기능으로 열지 않았다.

지점장 지표 정책:

| 구분 | 지표 |
| --- | --- |
| 승인 전 허용 | 작성자 표시명, 장부 상태, 직접 입력한 매출/결제/비용/매입 수량, 재고 수량, 손실/폐기/떨이 입력값 |
| 승인 전 차단 | 매출 마진율, 재고금액, 매출차액, 매출원가, 매출총이익, 영업이익, 생산성, FIFO 매출원가, FIFO 재고금액, lot 근거, 본사 고정비, 타 지점 비교값 |
| 승인 후 예외 가능 | 본사 운영자 승인 문서에 field allowlist, surface, rollback, 테스트 기준이 남은 지표만 허용 |

적용 후 검증:

- `pnpm test:unit:file tests/unit/ecount-purchase-import.test.mjs tests/unit/master-data-purchase-standards.test.mjs tests/unit/ledger-sales.test.mjs tests/unit/ledger-submit.test.mjs tests/unit/ledger-validation.test.mjs tests/unit/ledger-review.test.mjs tests/unit/ci-release-gates.test.mjs` (51개 통과)
- `pnpm test:e2e -- tests/e2e/master-data-stores.spec.ts`

작성일: 2026-06-20
기준 문서: `docs/meeting/change.md`
검토 대상: 현재 작업 트리의 `src/`, `prisma/`, `tests/`, `docs/goal`

## 검토 결론

`docs/meeting/change.md`의 핵심 MVP 흐름인 본사 관제, 지점 장부 입력, 본사 수정/마감, 감사 로그, 지점장 민감 지표 차단은 현재 코드에 대체로 반영되어 있다. 최근 보완 항목인 본사 관제판 컬럼 리사이징, 30초 자동 갱신, 초기 계정/10개 이상 지점 운영 매뉴얼도 코드와 테스트 증거가 있다.

다만 다음 항목은 "구현 완료"로 닫으면 안 된다. 일부는 정책 승인 전이라 제품 기능을 열면 위험하고, 일부는 테스트/릴리스 검증 범위가 부족하다.

- 지점장 화면의 매출 마진율/재고금액 노출은 미팅 문서와 현재 보안 정책이 충돌한다.
- ECOUNT는 parser 기본 안전값을 이번 적용으로 보강했지만, 본사 업로드 preview/commit 제품 기능은 아직 열려 있지 않다.
- 현재 살아있는 ECOUNT 흐름은 장부 자동 생성보다 매입 기준 마스터 가져오기에 가깝다.
- 작성자명은 이번 적용으로 1단계 매출/결제 저장 시 필수 입력으로 막고, 단계 간 유지 흐름을 유지했다.
- FIFO lot 계산/테이블은 존재하지만, 정책 승인 전 확정값 노출 금지 상태다. 본사 lot 이력 팝업과 통합 재고 뷰는 후속 기능이다.
- 본사 일괄 마감 또는 검토 생략 토글은 단일 장부 마감과 별도 기능으로 남아 있다.
- 10개 이상 지점 운영 E2E는 이번 적용으로 `test:e2e:core`에 포함했다.
- HR/급여, 월 고정비 손익, LINE/텔레그램 알림, AI 분석은 정책/계약 범위로 분리해야 한다.

## 확인된 적용 항목

| 항목 | 판단 | 근거 |
| --- | --- | --- |
| 본사 관제판 4단계 상태 | 적용됨 | `src/features/dashboard/types.ts`, `src/features/dashboard/queries.ts`, `tests/e2e/hq-dashboard.spec.ts` |
| 관제판 컬럼 리사이징 | 적용됨 | `src/features/dashboard/components/hq-dashboard-table.tsx`의 `dashboardColumnWidthConfig`, `localStorage`, resizer handle |
| 관제판 자동 갱신 | 적용됨 | `src/features/dashboard/components/hq-dashboard-table.tsx`의 `dashboardRefreshIntervalMs = 30_000`, `router.refresh()` |
| 초기 계정/지점 운영 문서 | 적용됨 | `docs/first-run-accounts-and-store-management.md`, `prisma/seed.ts` |
| 10개 이상 지점 검색/상태 운영 테스트 | 적용됨 | `tests/e2e/master-data-stores.spec.ts` |
| ECOUNT 지점/마감일 검증 | 적용됨 | `src/features/ledger/ecount-purchase-import.ts`의 `validateLedgerScope` 기본 활성 경로 |
| ECOUNT 장부 자동 생성 | 미완료/정책 대기 | 장부 업로드 action은 열려 있지 않고, 살아있는 import는 `src/features/master-data/purchase-standard-import-actions.ts` 중심 |
| FIFO 정책 gate | 부분 적용 | `src/server/calculations/ledger.ts`, `src/server/calculations/policy-gates.ts`, `tests/unit/calculation-policy-gates.test.mjs` |
| 매입 행 정정 위험 차단 | 적용됨 | `src/features/corrections/actions.ts`에서 `PURCHASE_ROW` unsupported 처리, `src/features/reports/queries.ts`의 미반영 correction matcher |
| 지점장 민감 지표 차단 | 적용됨, 정책 충돌 있음 | `src/server/sensitive-fields.ts`, `src/features/ledger/response-shaping.ts`, `tests/unit/sensitive-response-shaping.test.mjs` |

## P0. 정책 충돌을 먼저 닫는다

### Task 1. 지점장 마진율/재고금액 노출 허용 목록 확정

**문제**
미팅 문서는 지점장 화면에 "매출 마진율, 재고 금액"은 노출한다고 적었다. 현재 코드는 `grossMarginRate`, `inventoryAmount`, `salesDifference`, FIFO/lot 근거를 모두 민감 지표로 차단한다. 보안상 보수적인 선택이지만, 의뢰자 요구와 다르므로 제품 결정을 받아야 한다.

**작업 지시**

- 본사 운영자에게 지점장 노출 허용 지표를 문서로 재승인받는다.
- 승인 전에는 현재 차단 정책을 유지한다.
- 승인 시에도 `costOfGoodsSold`, `grossProfit`, `operatingProfit`, `productivity`, `fifoCostOfGoodsSold`, `fifoInventoryAmount`, `lot`, 본사 고정비, 타 지점 비교 값은 계속 차단한다.
- 허용 지표가 생기면 `src/server/sensitive-fields.ts`, `src/features/ledger/response-shaping.ts`, `src/features/inventory/queries.ts`를 같은 기준으로 수정한다.
- 지점장 HTML, JSON 응답, report/export forbidden 응답에 허용 외 민감 필드가 없는지 테스트를 고정한다.

**완료 기준**

- `docs/goal` 또는 정책 문서에 "지점장 허용 지표/금지 지표"가 한 표로 남아 있다.
- 테스트가 미팅 문서와 같은 허용 목록을 검증한다.
- 승인 전에는 현재 차단 테스트가 그대로 통과한다.

**검증**

```powershell
pnpm test:unit:file tests/unit/sensitive-response-shaping.test.mjs tests/unit/ledger-review.test.mjs tests/unit/hq-dashboard.test.mjs
pnpm test:e2e -- tests/e2e/store-ledger-review.spec.ts tests/e2e/hq-dashboard.spec.ts
```

### Task 2. ECOUNT 제품 승격 조건과 parser 안전 기본값 확정

**문제**
ECOUNT 파서는 `validateLedgerScope: true`일 때 선택 지점/마감일 불일치를 막는다. 하지만 옵션을 빠뜨리면 파서가 여전히 범위 검증 없이 읽을 수 있다. 현재 제품 UI/action은 비활성 상태이므로 즉시 운영 사고는 아니지만, 본사 업로드 기능을 되살릴 때 실수 여지가 있다.

**적용 결과**
이번 적용으로 `validateLedgerScope` 기본값을 활성으로 바꿨다. 장부 제품 경로에서 옵션을 빠뜨려도 다른 지점 또는 다른 마감일 행은 거부되고, 매입 기준 마스터 가져오기처럼 장부 범위 검증 대상이 아닌 경로만 `validateLedgerScope: false`를 명시한다.

**작업 지시**

- CAP-6 승격 전에는 `src/features/ledger/ecount-purchase-actions.ts`와 장부 화면 업로드 UI를 복구하지 않는다.
- 파서를 제품 action에서 사용할 때는 선택 지점/마감일 검증이 기본으로 켜지게 한다. 선택지는 둘 중 하나다.
  - `validateLedgerScope` 기본값을 `true`로 바꾸고, 테스트 fixture 전용으로만 명시적으로 끈다.
  - 또는 `parseEcountPurchaseWorkbookForLedger()` 같은 안전 wrapper를 만들고 제품 코드는 wrapper만 호출한다.
- preview/commit/void/reprocess 설계 전에는 "ERP 업로드로 매입 장부 자동 생성 완료"라고 문서나 UI에 쓰지 않는다.
- 제품 승격 시 파일 원본, row hash, mapping version, 선택 지점/마감일, 단가 override, 권한, audit log를 함께 구현한다.

**완료 기준**

- 제품 경로에서 지점/마감일 검증 옵션을 누락할 수 없다.
- 다른 지점 또는 다른 마감일 행은 preview error로 보인다.
- ECOUNT 업로드 UI는 본사 전용이고 지점장 장부 화면에서는 생성/수정/삭제가 막힌다.

**검증**

```powershell
pnpm test:unit:file tests/unit/ecount-purchase-import.test.mjs tests/unit/ledger-purchase.test.mjs tests/unit/master-data-purchase-standards.test.mjs
pnpm test:e2e -- tests/e2e/store-ledger-purchase.spec.ts tests/e2e/master-data-purchase-standards.spec.ts
```

### Task 3. 본사 ECOUNT 매입 행 수정 정책을 지점장 차단과 분리

**문제**
미팅 문서는 본사가 매입 데이터를 강제 수정하고 출고 단가도 수동 입력할 수 있어야 한다고 말한다. 현재 `purchase-edit-policy`는 ECOUNT 업로드 행의 수정/삭제/신규 생성을 막고, 본사 저장 경로도 이 정책을 탄다. 지점장 차단은 맞지만, 본사까지 같은 차단을 유지할지는 제품 결정이 필요하다.

**작업 지시**

- ECOUNT 행의 본사 수정 범위를 정한다: commit 전 preview 수정만 허용, commit 후 정정만 허용, commit 후 원본 행 수정 허용 중 하나를 고른다.
- 본사 수정 허용 시 원본 단가, 수정 단가, 수량, 수정자, 수정 사유, 수정 시각을 audit log에 남긴다.
- commit 후 원본 보존 원칙을 유지한다면 `PURCHASE_ROW` 정정 또는 별도 ECOUNT correction 경로로만 처리한다.
- 지점장 매입 화면에서는 ECOUNT 행 수정/삭제/생성을 계속 막는다.
- UI 문구를 "본사 매입 기준 화면에서 불러오기"와 "장부 매입 자동 생성"으로 구분한다.

**완료 기준**

- 본사와 지점장의 ECOUNT 행 권한이 서로 다른 테스트로 고정된다.
- 본사가 수정 가능하다면 audit log와 리포트 근거가 수정 사실을 숨기지 않는다.
- 본사가 수정 불가라면 문서에 "정정 기록으로만 변경"이라고 명확히 남는다.

**검증**

```powershell
pnpm test:unit:file tests/unit/ledger-purchase.test.mjs tests/unit/hq-ledger-edit.test.mjs tests/unit/ledger-corrections.test.mjs tests/unit/ledger-correction-calculations.test.mjs
pnpm test:e2e -- tests/e2e/hq-ledger-edit.spec.ts tests/e2e/store-ledger-purchase.spec.ts
```

## P1. 기능 공백을 별도 story로 분리한다

### Task 4. 작성자명 최초 입력 필수 여부 확정

**문제**
미팅 문서는 1단계 시작 시 작성자 이름을 1회 입력하면 나머지 7단계에 자동 연동된다고 한다. 현재 작성자명 유지 흐름은 있으나, 빈 작성자명을 저장 단계에서 반드시 막는지는 별도 확인이 필요하다.

**작업 지시**

- 작성자명을 1단계 최초 저장 시 필수로 막을지, 검토 제출 시 필수로 막을지 결정한다.
- 필수라면 `ledgerMutationContextSchema` 또는 단계별 schema에서 빈 값을 차단한다.
- 이후 단계는 저장된 작성자명을 자동 사용하고, 사용자가 바꿀 수 있는 지점을 명확히 한다.
- 모바일 390px 화면에서 작성자명 오류와 포커스 이동이 깨지지 않게 한다.

**완료 기준**

- 작성자명 없이 최초 장부 저장 또는 제출이 가능한지 제품 정책이 명확하다.
- 필수 정책이면 unit/e2e가 빈 작성자명 차단과 단계 간 유지 모두를 검증한다.

**검증**

```powershell
pnpm test:unit:file tests/unit/ledger-sales.test.mjs tests/unit/ledger-submit.test.mjs tests/unit/ledger-validation.test.mjs
pnpm test:e2e -- tests/e2e/store-ledger-sales.spec.ts tests/e2e/store-ledger-review.spec.ts
```

### Task 5. 본사 일괄 마감/검토 생략 토글 설계

**문제**
현재 구현은 `closeHqLedger` 중심의 단일 장부 마감이다. 미팅 문서의 "수동 검토 생략 후 즉시 일괄 마감"은 대상 범위, 실패 처리, 예외 사유, 감사 로그 형식이 확정되지 않았다.

**작업 지시**

- 일괄 마감 대상을 결정한다: 전체 활성 지점, 선택 지점, 특정 날짜, 검토 대기만, 입력 중 포함 여부.
- 각 장부의 preflight를 일괄 실행하고 차단/경고/예외 허용을 지점별로 보여준다.
- 일부 실패 시 전체 rollback인지 부분 성공인지 정한다.
- audit log에는 요청자, 대상 장부 수, 성공/실패 목록, 예외 사유, 실행 시각을 남긴다.
- 권한은 단일 마감보다 약해지면 안 된다. 지점장과 조회 전용 본사는 실행할 수 없다.

**완료 기준**

- 본사 대시보드에서 일괄 마감 가능 여부와 실패 이유가 지점별로 보인다.
- 중복 요청, stale token, 권한 부족, 일부 실패가 테스트에 포함된다.

**검증**

```powershell
pnpm test:unit:file tests/unit/hq-dashboard.test.mjs tests/unit/hq-ledger-edit.test.mjs tests/unit/ledger-status-policy.test.mjs
pnpm test:e2e -- tests/e2e/hq-dashboard.spec.ts tests/e2e/hq-ledger-edit.spec.ts
```

### Task 6. FIFO lot 이력 팝업과 본사 통합 재고를 정책 승인 후 구현

**문제**
FIFO lot 모델과 계산 보조 코드는 존재하지만, OQ-7/OQ-17 승인 전에는 확정 원가/재고금액을 제품 기능처럼 보여주면 안 된다. 현재 본사 사용자 흐름에는 "재고 금액 클릭 -> 최근 1개월 lot 이력 -> 기간 필터 -> 매입일/단가/잔량" 검증이 없다.

**작업 지시**

- OQ-7/OQ-17 승인 전에는 FIFO-derived 금액을 `policy-unconfirmed`로 유지한다.
- 본사 전용 lot 이력 API를 만들 때는 기본 기간을 최근 1개월로 둔다.
- 팝업에는 매입일, 단가, 원수량, 잔량, source, mapping 상태를 보여준다.
- 통합 전체 재고는 먼저 수량-only로 열지, FIFO 승인 후 금액 포함으로 열지 결정한다.
- 지점장 경로에는 lot, 원가, 재고금액, 타 지점 비교가 서버 응답부터 내려가지 않게 한다.

**완료 기준**

- 본사만 lot 이력 팝업과 통합 재고를 볼 수 있다.
- 지점장 응답, HTML, export, 알림 템플릿에는 lot/원가/재고금액이 없다.
- 승인 전에는 완료 기능처럼 보이지 않는다.

**검증**

```powershell
pnpm test:unit:file tests/unit/ledger-inventory.test.mjs tests/unit/calculation-policy-gates.test.mjs tests/unit/sensitive-response-shaping.test.mjs
pnpm test:e2e -- tests/e2e/store-ledger-inventory.spec.ts tests/e2e/hq-dashboard.spec.ts
```

### Task 7. 냉동/생물 분석 차트와 월 고정비 손익을 별도 구현 범위로 분리

**문제**
품목의 냉동/생물 구분과 월간 리포트 기반은 있지만, 미팅 문서가 요구한 그룹별 총판매액/이익률 chart와 본사 월 고정비 입력 기반 손익계산서는 아직 완료 기능으로 보기 어렵다.

**작업 지시**

- 냉동/생물 chart는 품목 category별 매출, 매입, 손실, 재고 흐름 집계와 민감 지표 상태를 함께 반환한다.
- chart는 본사 전용으로 두고, 지점장/export 무권한 응답에는 이익률과 원가 근거를 차단한다.
- 월 고정비 손익은 고정비 항목, 월 적용 기준, 수정/삭제 audit, 지점장 비노출 기준이 승인된 뒤 구현한다.
- 두 기능은 하나의 큰 작업으로 묶지 말고 리포트 chart와 고정비 모델/story를 분리한다.

**완료 기준**

- 냉동/생물은 단순 category 필드가 아니라 기간별 chart/표로 검증된다.
- 월 고정비는 본사 전용 입력, audit, 월 손익 반영, export 권한 정책을 갖는다.

**검증**

```powershell
pnpm test:unit:file tests/unit/hq-reports.test.mjs tests/unit/sensitive-response-shaping.test.mjs tests/unit/master-data-history.test.mjs
pnpm test:e2e -- tests/e2e/hq-reports.spec.ts
```

## P2. 검증과 확장 범위를 정리한다

### Task 8. `test:e2e:core`에 회의 핵심 지점 운영 검증 포함 여부 결정

**문제**
`tests/e2e/master-data-stores.spec.ts`에는 10개 이상 지점 검색/활성 상태 운영 테스트가 있다. 하지만 `package.json`의 `test:e2e:core`에는 포함되어 있지 않다. 릴리스 전 핵심 검증에서 빠질 수 있다.

**작업 지시**

- `master-data-stores.spec.ts`를 `test:e2e:core`에 포함할지 결정한다.
- 포함하지 않는다면 `docs/release-checklist.md` 또는 별도 release gate에 수동 실행 조건을 남긴다.
- 포함할 경우 실행 시간이 과도해지지 않도록 fixture cleanup과 test timeout을 확인한다.

**완료 기준**

- 릴리스 전 검증 명령 중 하나가 10개 이상 지점 운영을 반드시 덮는다.
- CI 문서와 `package.json`이 같은 검증 범위를 말한다.

**검증**

```powershell
pnpm test:e2e -- tests/e2e/master-data-stores.spec.ts
pnpm test:e2e:core
```

### Task 9. HR/급여, LINE/텔레그램 알림, AI 분석, 운영 계약 자동화는 제품 범위와 분리

**작업 지시**

- HR/급여는 OQ-12, 개인정보 보존 기준, "지급 확정 아님" 문구가 승인된 뒤 `Employee`, `LedgerWorker`, `PayrollAdjustment` 같은 모델을 검토한다.
- 승인 전 `notifications`, provider client, scheduled route, worker, delivery log, AI route, AI SDK, vector DB를 추가하지 않는다.
- 알림이 승인되면 오전 발송 시각, 수신자, 템플릿, 적자/목표 마진율/장기 체화 기준, 중복 방지, 재시도, 민감 필드 redaction을 먼저 닫는다.
- AI 분석이 승인되면 별도 PRD에서 provider, redaction, prompt 보존, 감사 로그, 개인정보, 실패 fallback을 먼저 닫는다.
- 유지보수/서버 인프라 대행은 제품 기능이 아니라 계약/운영 문서로 관리한다.

**검증 후보**

```powershell
pnpm test:unit:file tests/unit/ledger-cost-labor.test.mjs tests/unit/auth-guard.test.mjs
rg -n "notifications|telegram|LINE|lineClient|AI|OpenAI|vector|DeliveryLog|Employee|PayrollAdjustment" src prisma tests
```

## 권장 검증 묶음

이번 미팅 변경 검토 후 최소 단위 검증:

```powershell
pnpm test:unit:file tests/unit/master-data-stores.test.mjs tests/unit/hq-dashboard.test.mjs tests/unit/master-data-history.test.mjs tests/unit/ecount-purchase-import.test.mjs tests/unit/ledger-purchase.test.mjs tests/unit/calculation-policy-gates.test.mjs tests/unit/ledger-inventory.test.mjs tests/unit/ledger-correction-calculations.test.mjs tests/unit/sensitive-response-shaping.test.mjs
git diff --check
```

DB와 브라우저 환경이 준비된 릴리스 후보 검증:

```powershell
pnpm test:e2e -- tests/e2e/master-data-stores.spec.ts tests/e2e/hq-dashboard.spec.ts tests/e2e/hq-ledger-edit.spec.ts tests/e2e/store-ledger-sales.spec.ts tests/e2e/store-ledger-review.spec.ts tests/e2e/store-ledger-inventory-adjustment.spec.ts tests/e2e/store-ledger-purchase.spec.ts
pnpm test:api -- tests/api/report-export.spec.ts
pnpm release:preflight
```

## 배포 금지 조건

- 지점장 허용 지표가 승인되지 않았는데 마진율/재고금액/FIFO/lot/원가가 노출된다.
- ECOUNT 업로드가 preview/commit/audit/source 보존 없이 제품 UI에 열린다.
- FIFO/통합 재고가 OQ-7/OQ-17 승인 없이 확정 원가/재고금액처럼 표시된다.
- 일괄 마감이 권한, preflight, rollback/부분 성공 정책, audit log 없이 열린다.
- HR/급여, 월 손익, 알림, AI를 정책 승인 없이 릴리스 완료 범위에 포함한다.
