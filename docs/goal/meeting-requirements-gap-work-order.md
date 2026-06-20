# done\_미팅 요구사항 반영 갭 작업지시서

작성일: 2026-06-20
기준 문서: `docs/meeting/change.md`
검토 대상: 현재 작업 트리의 `src/`, `prisma/`, `tests/`, `_bmad-output`, `docs/goal`

적용일: 2026-06-20
적용 상태: 적용함

## 적용 기록

- P1 Task 4 본사 관제판 그리드 리사이징을 적용했다. 데스크톱 테이블 컬럼은 드래그와 키보드로 폭을 조절할 수 있고, 폭은 `localStorage`에 사용자별 브라우저 값으로 저장된다. `컬럼 폭 초기화` 버튼으로 기본 폭으로 되돌릴 수 있다.
- P1 Task 5 본사 대시보드 자동 갱신 정책을 적용했다. 관제판은 30초마다 `router.refresh()`를 실행하고, 갱신 중 상태, 마지막 갱신 시각, 실패 상태 표시를 제공한다.
- P1 Task 6 초기 계정과 10개 이상 지점 운영 증거를 보강했다. 최초 계정/비밀번호/지점장 배정/비활성 지점 처리 매뉴얼을 `docs/first-run-accounts-and-store-management.md`에 작성했고, 10개 이상 지점 검색/상태 변경 E2E를 추가했다.
- P0/P2 정책 승인 대기 항목은 제품 기능으로 열지 않았다. 지점장 민감 지표, ECOUNT 제품 승격, FIFO/통합 재고, HR/급여, 월 손익, 외부 알림, AI, 운영 계약 자동화는 승인 전 구현 금지 상태를 유지한다.

## 목적

`docs/meeting/change.md`의 최종 ERP 요구사항이 현재 코드와 문서에 실제로 반영되었는지 점검했다. 이미 구현된 기능은 중복 지시하지 않고, 누락되었거나 정책 문서만 있고 제품 코드가 없는 기능을 작업 항목으로 분리한다.

현재 결론은 "핵심 MVP 흐름은 상당 부분 구현됨, 추가 미팅 요구는 정책 대기 또는 부분 구현이 많음"이다. 특히 ECOUNT 업로드, FIFO/통합 재고, HR/급여, 월 손익, 외부 알림은 제품 기능 완료로 표시하면 안 된다.

## 근거 요약

| 미팅 요구                        | 현재 상태           | 근거                                                                                                                                                                                                          |
| -------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 기본 HQ/지점장 계정              | 부분 구현           | `prisma/seed.ts:229`, `prisma/seed.ts:266`, `prisma/seed.ts:312`                                                                                                                                              |
| 지점 생성/활성 토글              | 부분 구현           | `src/features/master-data/actions.ts:110`, `src/features/master-data/actions.ts:268`, `tests/e2e/master-data-stores.spec.ts:72`                                                                               |
| 본사 관제판 그리드 리사이징      | 미구현              | `src/features/dashboard/components/hq-dashboard-table.tsx:66`, `src/features/dashboard/components/hq-dashboard-table.tsx:67`                                                                                  |
| 4단계 장부 상태 표시             | 부분 구현           | `src/features/ledger/status.ts:20`, `src/features/ledger/status.ts:22`, `src/features/ledger/status.ts:24`, `src/features/ledger/status.ts:29`                                                                |
| 본사 수정/마감                   | 부분 구현           | `src/app/app/ledgers/[ledgerId]/page.tsx:257`, `src/features/ledger/hq-close-actions.ts:225`, `src/features/ledger/hq-close-actions.ts:294`                                                                   |
| 변경 이력                        | 구현됨              | `src/server/audit.ts:18`, `src/server/audit.ts:27`, `src/features/audit/audit-format.ts:216`                                                                                                                  |
| ECOUNT 매입 자동 생성            | 부분 구현/정책 대기 | `src/features/ledger/ecount-purchase-import.ts:503`, `_bmad-output/planning-artifacts/policy-decisions/8-2-품목-정규화와-이카운트-업로드-계약.md:17`                                                          |
| 출고 단가 수동 가변              | 부분 구현           | `src/features/ledger/components/purchase-step-client.tsx:787`, `src/features/ledger/purchase-edit-policy.ts:65`                                                                                               |
| FIFO 재고 금액                   | 정책 대기           | `src/server/calculations/policy-gates.ts:55`, `_bmad-output/planning-artifacts/policy-decisions/8-3-fifo-원가-통합-재고-상품-분석-선행-정책.md:17`                                                            |
| 재고 매입 lot 이력 팝업          | 부분 구현           | `src/features/inventory/components/inventory-step-client.tsx:968`, `src/features/inventory/components/inventory-step-client.tsx:996`                                                                          |
| 재고 조정 사유/당일 판매량 명칭  | 구현됨              | `src/features/inventory/schemas.ts:114`, `src/features/inventory/components/inventory-step-client.tsx:1340`                                                                                                   |
| 본사 통합 전체 재고              | 정책 대기           | `_bmad-output/planning-artifacts/policy-decisions/8-3-fifo-원가-통합-재고-상품-분석-선행-정책.md:19`                                                                                                          |
| 7단계 지점장 위자드              | 구현됨              | `src/features/ledger/components/store-entry-step-navigation.tsx:18`, `src/features/ledger/components/store-entry-step-navigation.tsx:19`, `src/features/ledger/components/store-entry-step-navigation.tsx:25` |
| 작성자명 유지                    | 구현됨              | `src/features/ledger/components/sales-payment-step-client.tsx:90`, `src/features/ledger/actions.ts:672`                                                                                                       |
| 지점장 ECOUNT 매입 수정 제한     | 구현됨              | `src/features/ledger/purchase-edit-policy.ts:51`, `src/features/ledger/purchase-edit-policy.ts:72`                                                                                                            |
| 지점장 마진율/재고금액 노출 정책 | 요구와 충돌         | `src/server/sensitive-fields.ts:6`, `src/server/sensitive-fields.ts:10`                                                                                                                                       |
| 희망 판매가 손실액               | 정책 대기           | `src/server/calculations/policy-gates.ts:63`, `src/server/calculations/policy-gates.ts:65`                                                                                                                    |
| HR/급여                          | 정책 대기           | `_bmad-output/planning-artifacts/policy-decisions/8-1-직원-근무-급여-참고-범위와-개인정보-기준.md:19`, `prisma/schema.prisma:358`                                                                             |
| 냉동/생물 분석 차트              | 부분 구현           | `src/features/master-data/product-schemas.ts:3`, `src/features/reports/components/monthly-closing-anomaly-report.tsx:68`                                                                                      |
| 고정비 월 손익                   | 정책 대기           | `_bmad-output/planning-artifacts/policy-decisions/8-6-특수기간-엑셀-매핑-월-손익-리포트-계약.md:17`                                                                                                           |
| LINE/텔레그램 알림               | 정책 대기           | `_bmad-output/planning-artifacts/policy-decisions/8-7-외부-알림-채널과-템플릿-정책.md:69`                                                                                                                     |
| AI 분석 확장                     | 정책 대기           | `_bmad-output/planning-artifacts/policy-decisions/8-8-ai-기능-제외와-구조화-데이터-경계.md:27`                                                                                                                |
| 유지보수/인프라 대행             | 계약/운영 범위      | `_bmad-output/planning-artifacts/policy-decisions/8-9-cap-19-운영-계약-범위-분리.md:17`                                                                                                                       |

## P0. 정책 충돌부터 닫는다

### Task 1. 지점장 마진율/재고금액 노출 정책 재확정

**문제**
미팅 문서는 지점장 화면에 현장 값, 매출 마진율, 재고 금액은 노출한다고 적었다. 그러나 현재 코드는 `grossMarginRate`와 `inventoryAmount`까지 민감 필드로 차단한다.

**작업 지시**

- 본사 운영자에게 지점장 노출 허용 목록을 다시 승인받는다.
- 승인 전에는 현재 차단 정책을 유지한다.
- 노출 승인 시 `src/server/sensitive-fields.ts`, `src/features/ledger/response-shaping.ts`, `src/features/inventory/queries.ts`를 수정한다.
- 단, 매출원가, 매출이익, 영업이익, 인당생산성, FIFO 원가, lot 근거는 계속 차단한다.
- 지점장 응답, HTML, CSV, forbidden payload에 허용 외 민감 값이 새지 않는 테스트를 추가한다.

**완료 기준**

- 지점장 화면에 노출 가능한 지표와 금지 지표가 한 문서와 테스트에 고정된다.
- 정책 미승인 상태에서는 기존 차단 테스트가 유지된다.

**검증**

```powershell
pnpm test:unit -- tests/unit/sensitive-response-shaping.test.mjs tests/unit/calculation-policy-gates.test.mjs
pnpm test:e2e -- tests/e2e/store-ledger-review.spec.ts tests/e2e/calculation-policy-gates.spec.ts
```

### Task 2. HQ 강제 수정 범위와 ECOUNT 매입 잠금 정책 분리

**문제**
미팅 문서는 본사가 매출, 비용, 매입, 재고 등 모든 항목을 강제 수정할 수 있어야 한다고 한다. 현재 일반 HQ 장부 수정은 있으나 ECOUNT 업로드 매입 행은 HQ 저장 경로에서도 잠금 정책을 탄다.

**작업 지시**

- ECOUNT 업로드 행의 수정 주체를 본사만 허용할지, commit 전 preview에서만 허용할지 결정한다.
- 본사 수정 허용이면 원본 단가, 수정 단가, 수정자, 수정 사유, 수정 시각을 audit log에 남긴다.
- 지점장 수정 차단은 유지한다.
- 마감 후 원본 직접 수정 금지는 유지하고 정정 기록 경로로만 처리한다.

**완료 기준**

- 지점장 ECOUNT 행은 계속 읽기 전용이다.
- 본사 ECOUNT 수정 가능 여부가 코드, UI 문구, 테스트에 동일하게 반영된다.

**검증**

```powershell
pnpm test:unit -- tests/unit/ledger-purchase.test.mjs tests/unit/hq-ledger-edit.test.mjs
pnpm test:e2e -- tests/e2e/hq-ledger-edit.spec.ts tests/e2e/store-ledger-purchase.spec.ts
```

### Task 3. 본사 일괄 마감 토글 범위 확정

**문제**
현재 `closeHqLedger`는 단일 장부 마감이다. 미팅 문서의 "수동 검토 생략 후 즉시 일괄 마감" 토글은 별도 제품 기능으로 확인되지 않았다.

**작업 지시**

- 일괄 마감 대상 범위를 정한다: 전체 지점, 선택 지점, 특정 날짜, 검토 대기만, 입력 중 포함 여부.
- 마감 전 점검을 일괄로 실행하고, 차단/경고/예외 허용 결과를 지점별로 보여준다.
- 예외 사유는 지점별 또는 일괄 공통 사유 중 하나로 정책을 정한다.
- 일부 실패 시 전체 rollback인지 부분 성공인지 명확히 한다.

**완료 기준**

- 본사 대시보드에서 일괄 마감 가능 여부가 명확하다.
- 일괄 마감은 audit log에 대상 장부 수, 성공/실패, 사유를 남긴다.

**검증**

```powershell
pnpm test:unit -- tests/unit/hq-dashboard.test.mjs tests/unit/hq-ledger-edit.test.mjs
pnpm test:e2e -- tests/e2e/hq-dashboard.spec.ts tests/e2e/hq-ledger-edit.spec.ts
```

## P1. 사용자가 바로 체감하는 누락 기능

### Task 4. 본사 관제판 그리드 리사이징

**문제**
현재 관제판 테이블은 `overflow-x-auto`와 `min-w-[1280px]` 고정 폭이다. 사용자별 컬럼 크기 조절 기능은 없다.

**작업 지시**

- 관제판 컬럼 너비를 드래그로 조절한다.
- 최소/최대 폭을 둬서 텍스트가 겹치지 않게 한다.
- 사용자별 저장 방식은 localStorage 또는 서버 저장 중 하나를 선택한다. 내부 ERP 초기 범위라면 localStorage부터 시작한다.
- 키보드 접근성 또는 리셋 버튼을 제공한다.

**완료 기준**

- 컬럼 너비를 조절해도 모바일 카드 레이아웃은 깨지지 않는다.
- 새로고침 후 선택한 폭이 유지된다.

### Task 5. 본사 대시보드 자동 갱신 정책

**문제**
4단계 상태 표시는 구현되어 있지만, "실시간"을 증명하는 polling, refresh interval, server push 근거는 약하다.

**작업 지시**

- 운영 기준으로 자동 갱신 주기를 정한다. 예: 30초 또는 60초.
- 갱신 중 로딩 표시와 실패 시 마지막 갱신 시각을 표시한다.
- 상태 변경 후 대시보드에 반영되는 E2E를 추가한다.

**완료 기준**

- 사용자가 새로고침하지 않아도 지점 상태 변경이 정해진 시간 안에 반영된다.

### Task 6. 초기 계정과 지점 10개 이상 운영 매뉴얼/테스트

**문제**
seed는 HQ와 지점장 계정을 만들 수 있지만 HQ 자격증명은 환경변수 필수다. 또한 지점 생성/비활성화 기능은 있지만, "10개 이상 지점"과 "상세 매뉴얼 제공" 요구는 직접 증거가 없다.

**작업 지시**

- 최초 계정 제공 방식을 정한다. 환경변수 기반 seed를 유지할지, 고정 기본 ID 2개를 자동 생성할지 결정한다.
- 자동 생성이 요구사항이면 first-run seed, 운영 보안 문구, 초기 비밀번호 변경 절차, 테스트를 추가한다.
- 본사용 지점 관리 운영 매뉴얼을 `docs/`에 작성한다.
- 10개 이상 지점 seed 또는 E2E fixture로 목록/필터/활성 토글/권한 배정을 검증한다.
- 비활성 지점이 지점장 workspace와 본사 scope에서 어떻게 보이는지 문서화한다.

**완료 기준**

- 운영자가 HQ 계정과 지점장 계정을 어떤 절차로 최초 생성하는지 문서만 보고 알 수 있다.
- 본사는 신규 지점을 추가하고, 비활성화하고, 지점장 접근을 관리하는 절차를 문서만 보고 수행할 수 있다.

## P2. 정책 승인 후 구현해야 할 기능

### Task 7. ECOUNT 업로드를 제품 기능으로 승격

**현재 상태**
파서는 있으나 업로드 UI/API와 장부 commit 흐름은 제품 기능으로 열려 있지 않다. 정책 문서는 OQ-6/OQ-15 승인 전 구현 승격 불가라고 둔다.

**선행 조건**

- 실제 ECOUNT 샘플 파일과 헤더 매핑 승인
- 품목 정규화와 mapping 승인
- 지점장 비상 입력 허용 여부 승인
- 업로드 권한과 audit 계약 승인

**작업 지시**

- 본사 전용 preview/commit/void/reprocess 서버 action을 만든다.
- 업로드 원본, row hash, header mapping version, 선택 지점/일자, commit 결과를 보존한다.
- preview 단계에서 단가 override 허용 여부를 정책에 맞게 처리한다.
- 지점/일자 mismatch는 현재처럼 차단한다.

**검증**

```powershell
pnpm test:unit -- tests/unit/ecount-purchase-import.test.mjs tests/unit/ledger-purchase.test.mjs
pnpm test:e2e -- tests/e2e/master-data-purchase-standards.spec.ts tests/e2e/store-ledger-purchase.spec.ts
```

### Task 8. FIFO lot 이력 팝업과 본사 통합 재고

**현재 상태**
FIFO 계산 코드와 lot 테이블은 일부 존재하지만, 정책 gate가 있다. 현재 팝업은 "전일재고 이력" 중심이고, 매입일/단가/잔량 lot 이력과 기본 1개월 필터는 없다.

**선행 조건**

- OQ-7 FIFO 적용 범위 승인
- OQ-17 반품/조정/손실 처리 순서 승인
- 지점장 lot/원가 노출 차단 정책 유지

**작업 지시**

- 본사 전용 품목별 lot 이력 API를 만든다.
- 기본 기간은 최근 1개월로 두고, 기간 필터를 제공한다.
- 통합 전체 재고는 먼저 수량-only로 열지, FIFO 승인 후 금액 포함으로 열지 결정한다.
- 통합 재고는 본사 store scope를 서버에서 강제한다.

**검증**

```powershell
pnpm test:unit -- tests/unit/ledger-inventory.test.mjs tests/unit/calculation-policy-gates.test.mjs
pnpm test:e2e -- tests/e2e/store-ledger-inventory.spec.ts tests/e2e/hq-dashboard.spec.ts
```

### Task 9. HR/급여 참고 기능

**현재 상태**
현재 장부에는 `workerCount`, `workMemo`만 있다. 직원 마스터, 입사일, 직원별 근무일수, 급여 차액 모델은 없다.

**선행 조건**

- OQ-12 승인
- 개인정보 보존표 승인
- 실제 지급 확정 제외 문구 승인

**작업 지시**

- `Employee`, `EmployeeStoreAssignment`, `LedgerWorker`, `PayrollAdjustment` 또는 동등한 모델을 설계한다.
- 직원 마스터에는 직원명, 입사일, 활성 상태, 기본 소속/근무 가능 지점을 포함한다.
- 근무 기록에는 근무일, 근무 지점, 직원 id, 지각/조퇴/특수 상황 메모를 포함한다.
- 기존 `workerCount`와 `workMemo`는 직원별 기록으로 자동 분해하지 않는다.
- 본사 전용 직원 마스터와 월별 근무/급여 참고 화면을 만든다.
- 여러 지점 근무는 직원별 월간 지점별/전체 근무일수로 합산한다.
- 급여 차액은 자동 계산이 아니라 수동 입력과 메모로만 처리한다.

**검증**

```powershell
pnpm test:unit -- tests/unit/ledger-cost-labor.test.mjs tests/unit/auth-guard.test.mjs
pnpm typecheck
pnpm lint
```

### Task 10. 냉동/생물 그룹 분석 차트

**현재 상태**
`Product.category`는 `냉동`, `생물`을 지원한다. 그러나 기간별 냉동/생물 총판매액과 이익률 차트는 없다.

**작업 지시**

- 리포트 query에서 품목 category별 매출/매입/손실/재고 흐름을 집계한다.
- 총판매액과 이익률의 계산 가능/정책 미확정 상태를 함께 반환한다.
- 본사 리포트 UI에 표와 차트를 추가한다.
- 지점장 또는 export 무권한 응답에 민감 지표가 새지 않게 한다.

**검증**

```powershell
pnpm test:unit -- tests/unit/hq-reports.test.mjs tests/unit/sensitive-response-shaping.test.mjs
pnpm test:e2e -- tests/e2e/hq-reports.spec.ts
```

### Task 11. 본사 고정비와 월 손익계산서

**현재 상태**
월간 리포트와 영업이익 KPI는 있지만, 본사 월세/세금 같은 고정비 입력 모델과 월 손익계산서 반영은 없다.

**선행 조건**

- OQ-10B 또는 고정비 민감 지표 노출 정책 승인
- 고정비 항목, 월 적용 기준, 수정/삭제 감사 기준 승인

**작업 지시**

- 매장별 월 고정비 모델을 만든다.
- 본사 전용 입력 화면과 변경 이력을 추가한다.
- 월 손익계산서 계산은 shared server calculation에서 처리한다.
- export 권한과 민감 필드 차단을 함께 구현한다.

**검증**

```powershell
pnpm test:unit -- tests/unit/hq-reports.test.mjs tests/unit/master-data-history.test.mjs
pnpm test:e2e -- tests/e2e/hq-reports.spec.ts tests/e2e/master-data-history.spec.ts
```

### Task 12. 외부 알림, AI, 운영 계약은 제품 기능으로 오해하지 않게 유지

**현재 상태**

- LINE/텔레그램은 정책 대기다.
- AI는 현재 릴리스에서 기능 제외다.
- 유지보수/서버 인프라 대행은 제품 기능이 아니라 계약/운영 범위다.

**작업 지시**

- 승인 전 `notifications`, provider client, scheduled route, worker, AI route, AI SDK, vector DB, billing/ticketing/backup 자동화 코드를 추가하지 않는다.
- 알림 구현이 승인되면 오전 발송 시각, 당일 적자 지점, 목표 마진율 미달 지점, 장기 체화 재고 기준을 먼저 닫는다.
- 알림 구현 story에는 채널, 템플릿, 수신자, 중복 방지, 실패/재시도 로그, 민감 필드 redaction을 포함한다.
- AI 구현이 승인되면 별도 PRD에서 provider, prompt 보존, redaction, 감사 로그, 개인정보, 실패 fallback을 먼저 닫는다.
- 운영 계약은 견적서/계약서로 닫고, 제품 화면이 필요한 경우 별도 PRD로 승격한다.

## 완료 전 공통 검증

작업을 실제 구현한 뒤에는 범위에 맞는 focused test를 먼저 실행하고, 릴리스 후보에는 다음을 실행한다.

```powershell
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:api
pnpm test:e2e:core
git diff --check
```

## 배포 금지 조건

- 정책 대기 항목을 제품 완료 기능처럼 UI, 릴리스 노트, 문서에 표시하면 안 된다.
- 지점장 응답에 승인되지 않은 원가, 이익, FIFO, lot 근거, 본사 고정비, 타 지점 비교 값이 포함되면 안 된다.
- ECOUNT 업로드는 preview/commit/audit/원본 보존이 없으면 운영 기능으로 열면 안 된다.
- 기존 `workerCount`와 `workMemo`를 직원별 근무 기록으로 자동 분해하면 안 된다.
- FIFO/월 손익/알림/AI는 승인자와 승인 근거 없이 구현 story로 승격하면 안 된다.
