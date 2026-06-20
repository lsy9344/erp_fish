# 섹션 7-12 수정 작업지시서

작성일: 2026-06-20

적용 상태: 2026-06-20 적용 완료

적용 내용:

- 작업 A-G를 코드, 테스트, CI, 운영 문서에 반영했다.
- 추가로 core e2e 실행 중 드러난 현재 정책 불일치도 함께 정리했다. 지점장 입력 화면은 지점장 전용으로 유지하고, 본사 지정 지점 계정은 대시보드/리포트 scope로 검증하도록 e2e를 조정했다.
- 재고 조정 저장은 최신 입력값을 ref에서 읽도록 고쳐 빠른 입력 직후 stale 값이 서버로 가는 문제를 막았다.

적용 후 검증:

- `pnpm db:generate`
- `pnpm db:validate`
- `pnpm test:unit`
- `pnpm test:api`
- `pnpm typecheck`
- `node scripts/run-playwright-clean.mjs tests/e2e/hq-ledger-edit.spec.ts`
- `node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-sales.spec.ts tests/e2e/store-ledger-purchase.spec.ts tests/e2e/store-ledger-inventory.spec.ts tests/e2e/store-ledger-inventory-adjustment.spec.ts tests/e2e/store-ledger-losses.spec.ts tests/e2e/store-ledger-review.spec.ts`
- `node scripts/run-playwright-clean.mjs tests/e2e/hq-dashboard.spec.ts tests/e2e/hq-ledger-corrections.spec.ts tests/e2e/hq-reports.spec.ts tests/e2e/permission-profiles.spec.ts tests/e2e/master-data-purchase-standards.spec.ts tests/e2e/anomaly-thresholds.spec.ts`
- 참고: `pnpm test:e2e:core` 전체 단일 실행은 로컬 도구 제한 10분을 넘어 타임아웃됐으나, 같은 spec 목록을 위 세 묶음으로 분할 실행해 모두 통과했다.

출처:

- `docs/goal/done_section-7-12-functional-review.md`

목표:

섹션 7-12에서 확인된 동작 위험을 수정하고, 같은 문제가 다시 들어오지 않도록 release check와 문서를 맞춘다.

비목표:

- 전체 권한 모델을 다시 설계하지 않는다.
- 관련 없는 ledger, report, UI 코드를 리팩터링하지 않는다.
- 현재 동작을 올바르게 만들기 위한 범위를 넘어 새 기능을 추가하지 않는다.

## 작업 A. 매입 기준 중복 방지

우선순위: P0

관련 발견사항: F-01, F-04

문제:

현재는 한 품목에 매입 기준이 여러 개 생길 수 있다. 그런데 import와 장부 선택은 한 품목에 기준이 하나라고 가정한다. 업로드 파일 안의 중복 행도 조용히 덮어쓴다.

수정 방향:

1. 규칙을 먼저 정한다.
   - 권장 규칙: 한 품목에는 매입 기준 row가 하나만 존재한다.
   - 나중에 이력이 필요하면 별도 version model을 만든다. 지금 table 안에서 조용한 중복을 허용하지 않는다.
2. `createPurchaseStandard`에 중복 검사를 추가한다.
3. `PurchaseStandard.productId`에 DB unique 제약을 추가한다.
   - migration 전에 기존 중복 row 정리 query 또는 migration step을 준비한다.
4. `importPurchaseStandardsFromEcount`가 import 파일 안의 중복 품목 key를 감지하게 한다.
   - 완전히 같은 중복은 중복 count로 처리할 수 있다.
   - 단가나 참조 정보가 다른 중복은 명확한 validation error로 실패해야 한다.
5. 실패한 import는 부분 DB write를 만들지 않는다.

완료 기준:

- 같은 품목에 두 번째 매입 기준을 만들면 field error가 나온다.
- ECOUNT import에서 같은 품목의 충돌 행이 있으면 DB write 전에 실패한다.
- 정상 import는 기존처럼 create/update 된다.
- 활성/비활성 품목 처리 정책은 유지된다.

필수 테스트:

```bash
pnpm test:unit:file tests/unit/master-data-purchase-standards.test.mjs
pnpm test:e2e -- tests/e2e/master-data-purchase-standards.spec.ts
```

추가할 테스트:

- 중복 create 거부.
- migration을 추가한다면 기존 중복 데이터 정리 기대값.
- import 중복 충돌.

## 작업 B. 정정 반영값 일관성

우선순위: P0

관련 발견사항: F-02, F-03

문제:

일부 정정값은 저장되지만 필수 누락 신호, close preflight, 재고 금액 계산에 일관되게 반영되지 않는다.

수정 방향:

1. 필수 입력 검사는 정정 반영값 기준으로 수행한다.
   - 관제판 row와 상세 데이터에서 corrected `totalSalesAmount`, corrected payment total, corrected `workerCount`를 `getLedgerReviewMissingItems`에 넘긴다.
   - close preflight도 correction overlay 이후 같은 값을 넘긴다.
2. `INVENTORY_ROW.inventoryAmount` 정책을 정한다.
   - 권장 단기 수정: `inventoryAmount`는 수량과 원가 정책에서 파생되는 값이므로 정정 target에서 제거하거나 서버에서 차단한다.
   - 대안: 금액 override 의미를 명확히 정의하고 dashboard, detail, report 계산이 모두 사용하게 구현한다.
3. audit trail은 append-only를 유지한다.
4. 지원하지 않는 정정은 저장 전에 실패시킨다. 저장 후 "반영된 것처럼 보이지만 계산은 무시"하는 상태를 만들지 않는다.

완료 기준:

- 정정값이 매출/결제/근무인원 누락을 보완하면 관제판과 preflight의 누락 신호가 사라진다.
- 재고 금액 정정은 모든 곳에서 막히거나 모든 곳에 일관되게 반영된다.
- correction history는 실제 반영 상태와 다르게 보이지 않는다.

필수 테스트:

```bash
pnpm test:unit:file tests/unit/ledger-corrections.test.mjs tests/unit/ledger-correction-calculations.test.mjs tests/unit/hq-dashboard.test.mjs tests/unit/hq-ledger-edit.test.mjs
pnpm test:e2e -- tests/e2e/hq-ledger-corrections.spec.ts tests/e2e/hq-dashboard.spec.ts
```

추가할 테스트:

- 관제판, 상세, preflight에서 corrected required value 사용.
- `inventoryAmount` target 차단 또는 완전 반영.
- 허용된 정정의 audit log 유지.

## 작업 C. 변경 이력 권한 분리

우선순위: P1

관련 발견사항: F-05

문제:

변경 이력 페이지는 settings 권한으로 열리지만 사용자/권한 audit row도 포함한다.

수정 방향:

1. audit target별 조회 권한을 나눈다.
   - `SETTINGS_MANAGE`: Store, Product, PurchaseStandard, LedgerInputCode, AnomalyThresholdSetting.
   - `USER_PERMISSION_MANAGE`: User와 사용자 권한 관련 audit row.
   - ReportExport는 운영 정책에 따라 `REPORT_VIEW` 또는 `EXPORT_CREATE` 중 하나를 선택한다.
2. `getAuditHistoryForHeadquarters`가 현재 사용자의 권한에 따라 target type을 필터링하게 한다.
3. filter option도 사용자가 볼 수 있는 target만 보여준다.
4. 모든 audit type을 한 페이지에 계속 보여줄 계획이면 가장 강한 권한을 요구한다.

완료 기준:

- settings-only 본사 사용자는 `User` audit row를 볼 수 없다.
- 사용자/권한 관리자는 user audit row를 볼 수 있다.
- filter option이 숨겨진 target category를 노출하지 않는다.

필수 테스트:

```bash
pnpm test:unit:file tests/unit/master-data-history.test.mjs tests/unit/auth-guard.test.mjs
pnpm test:e2e -- tests/e2e/master-data-history.spec.ts tests/e2e/permission-profiles.spec.ts
```

## 작업 D. 리포트 Export 포맷과 응답 header

우선순위: P1

관련 발견사항: F-06, F-16

문제:

CSV export가 percent 값을 원시 비율로 내보내고, 400 응답에는 `Cache-Control: no-store`가 없다.

수정 방향:

1. `formatMetricEvidence`를 `evidence.kind` 기준으로 포맷한다.
   - money는 spreadsheet 계산 필요성이 있으면 숫자로 유지할 수 있다. 단, 문서화해야 한다.
   - percent는 현재 column label 기준으로 사람이 바로 읽을 수 있게 `30%` 형식으로 내보내는 것을 권장한다.
   - boolean/loss 값은 raw boolean보다 한국어 상태 label을 사용한다.
2. correction status label, unavailable reason, policy-check label은 유지한다.
3. export 400 응답에도 `Cache-Control: no-store`를 넣는다.

완료 기준:

- 이익률 CSV 값을 0.3%로 오해할 수 없다.
- 정정된 percent 값도 같은 포맷 규칙을 따른다.
- 400, 403, 200 export 응답 모두 `Cache-Control: no-store`를 사용한다.

필수 테스트:

```bash
pnpm test:unit:file tests/unit/hq-reports.test.mjs tests/unit/sensitive-response-shaping.test.mjs
pnpm test:api
```

## 작업 E. 공통 UI 접근성과 모바일 안정성

우선순위: dialog overflow는 P0, sidebar/navigation은 P1, button/tabs는 P2

관련 발견사항: F-07, F-08, F-09, F-17, F-18

문제:

긴 dialog가 모바일 화면을 넘을 수 있고, 모바일 sidebar는 닫기 control을 숨긴다. active navigation은 스크린리더에 현재 페이지를 알려주지 않는다. 몇몇 공통 component state도 불완전하다.

수정 방향:

1. Dialog:
   - `DialogContent`에 안전한 max height를 추가한다.
   - 긴 content는 scroll 되게 한다.
   - footer button이 닿는 위치에 남아야 한다. 필요하면 기존 디자인을 해치지 않는 sticky footer를 쓴다.
2. Sidebar:
   - 모바일 sheet에 보이는 닫기 버튼을 유지하거나 같은 기능의 명확한 control을 추가한다.
   - Escape와 outside click 동작은 유지한다.
3. Navigation:
   - active HQ nav link에 `aria-current="page"`를 넣는다.
   - 지점장 navigation도 active state와 `aria-current`를 넣는다.
4. Button:
   - `[a]:hover:bg-primary/90`를 실제 button과 `asChild` link 모두에서 동작하는 hover class로 바꾼다.
5. Tabs:
   - `TabsPrimitive.Root`에 `orientation={orientation}`을 전달한다.

완료 기준:

- 지점이 많은 사용자 관리 dialog가 작은 모바일 화면에서도 저장/취소 가능하다.
- 모바일 sidebar를 눈에 보이는 control로 닫을 수 있다.
- 스크린리더가 현재 navigation item을 알 수 있다.
- button hover state와 vertical tabs 동작이 component API와 맞다.

필수 테스트:

```bash
pnpm test:unit:file tests/unit/shadcn.test.mjs tests/unit/ui-mockup-alignment.test.mjs
pnpm test:e2e -- tests/e2e/master-data-users.spec.ts tests/e2e/hq-dashboard.spec.ts
```

추가할 Playwright coverage:

- 높이 390px 안팎의 dialog에 많은 지점 옵션.
- 모바일 sidebar 열기와 보이는 닫기 버튼.
- active navigation의 `aria-current="page"`.

## 작업 F. CI와 테스트 gate 정렬

우선순위: P0

관련 발견사항: F-10, F-11, F-12, F-13

문제:

PR CI와 `release:preflight`가 같은 검사를 하지 않는다. core E2E bundle은 섹션 7-12를 거의 커버하지 않는다. DB safety와 DB isolation coverage도 약하다.

수정 방향:

1. 필수 CI와 release gate를 맞춘다.
   - 필수 PR CI에 `pnpm test:api`를 추가한다.
   - `pnpm test:e2e:core` 또는 같은 위험을 막는 필수 smoke set을 CI에 추가한다.
2. `test:e2e:core`를 확장한다.
   - HQ dashboard, HQ ledger edit/corrections, reports/export, permission profiles, master data, anomaly thresholds의 대표 spec을 포함한다.
   - PR에서 돌 수 있을 만큼 작게 유지한다. 전체 E2E는 manual/schedule로 남겨도 된다.
3. Playwright DB safety unit test를 추가한다.
   - non-test DB 이름은 거부한다.
   - test-like DB 이름은 허용한다.
   - `PLAYWRIGHT_DATABASE_URL`이 상속된 `DATABASE_URL`보다 우선하는지 확인한다.
4. E2E DB isolation을 강화한다.
   - 권장: 실행마다 다른 DB 이름 사용.
   - 대안: global setup 전 schema truncate/reset.

완료 기준:

- PR은 API export coverage 없이 통과할 수 없다.
- release smoke가 store-entry뿐 아니라 본사, 리포트, 권한 workflow도 대표로 본다.
- Playwright는 production-like DB URL을 테스트에서 거부한다.
- E2E 실행은 이전 실행의 leftover data에 의존하지 않는다.

필수 테스트:

```bash
pnpm test:unit:file tests/unit/playwright-clean-env.test.mjs
pnpm test:api
pnpm test:e2e:core
```

CI 검증:

- PR에서 필수 check에 API와 선택한 E2E smoke gate가 포함되는지 확인한다.
- schedule/manual full E2E가 계속 동작하는지 확인한다.

## 작업 G. 릴리스와 운영 문서 정리

우선순위: P1

관련 발견사항: F-14, F-15, F-19

문제:

DB 시작 문서와 `start-database.sh`가 맞지 않고, release 문서에 운영 checklist가 없다.

수정 방향:

1. local DB 시작 절차를 하나로 정한다.
   - 권장: Docker Compose를 기본 문서 절차로 유지한다.
   - `start-database.sh`는 README와 맞추거나 deprecated로 표시한다.
2. README 또는 `docs/release-checklist.md`에 운영 checklist를 추가한다.
3. 최소 포함 항목:
   - migration 전 backup.
   - staging 또는 prod-like DB에서 migration dry run.
   - rollback 명령 또는 restore 경로.
   - secret rotation과 `AUTH_SECRET` 처리.
   - seed password 처리와 production seed guard.
   - 지점장 permission profile SQL 증빙.
   - CI와 E2E 증빙 첨부.
4. `docs/ci.md`의 push trigger 설명을 실제 workflow와 맞춘다.

완료 기준:

- 새 개발자가 한 가지 DB 시작 절차만 따라도 container 이름이 어긋나지 않는다.
- release reviewer가 운영 전 checklist를 보고 승인할 수 있다.
- CI 문서가 `.github/workflows/ci.yml`과 맞다.

필수 확인:

```bash
pnpm exec prettier --check README.md docs/ci.md docs/ci-secrets-checklist.md docs/goal/section-7-12-functional-review.md docs/goal/section-7-12-remediation-work-order.md
```

## 권장 실행 순서

1. 작업 A, B, F를 먼저 처리한다.
2. 작업 D, E를 처리한다.
3. 작업 C, G를 처리한다.
4. `pnpm release:preflight`를 실행한다.
5. CI, API, E2E, release checklist 증빙을 release review에 첨부한다.

## 완료 정의

이 작업은 아래 조건을 만족하면 완료로 본다.

- 검토 문서의 P0, P1 항목이 수정됐거나, 명시적인 risk accept 기록이 있다.
- 코드 동작을 바꾸는 항목은 새 테스트가 수정 전 실패하고 수정 후 통과한다.
- `pnpm release:preflight`가 통과한다.
- 문서가 실제 명령과 운영 절차를 설명한다.
