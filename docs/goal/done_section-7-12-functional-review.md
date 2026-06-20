# 섹션 7-12 기능 검토 기록

검토일: 2026-06-20

후속 적용 상태: 2026-06-20 적용 완료

적용 기록:

- 본 문서의 F-01부터 F-10까지를 기준으로 서버 동작, UI, 테스트, CI, 운영 문서를 수정했다.
- 매입 기준 중복 방지, 정정 반영값 누락 검사, 미지원 재고 금액 정정 차단, 감사 이력 target 권한 필터, export 오류 응답 no-store, UI 접근성/모바일 보완, e2e DB 격리, release checklist 정비를 반영했다.
- 검토 당시에는 읽기 전용으로 진행했으나, 후속 작업으로 코드와 테스트를 적용 완료했다.

검토 범위:

- 섹션 7. 본사 관제판/마감/정정
- 섹션 8. 기준정보 관리
- 섹션 9. 리포트/Export
- 섹션 10. 공통 UI/UX
- 섹션 11. 테스트 품질
- 섹션 12. 문서/릴리스/운영 절차

검토 방식:

- 읽기 전용 코드 검토로 진행했다.
- 범위가 넓어서 영역별 병렬 서브에이전트 검토를 사용했다.
- 저장소에 `.codegraph` 인덱스가 없어 코드그래프는 사용할 수 없었다.
- 이 검토 중 애플리케이션 코드는 수정하지 않았다.

## 핵심 요약

주요 서버 경계는 대체로 들어가 있다. 본사 장부 수정과 마감 action은 action 권한을 확인한 뒤 지점 또는 장부 scope를 확인한다. 정정 생성은 원본을 직접 바꾸지 않고 append-only 기록을 만들며 audit log를 남긴다. Report export는 허용 컬럼, CSV escaping, 안전한 forbidden 응답, 성공 audit log를 갖고 있다.

중요한 위험은 세 가지다.

- 저장은 되지만 실제 계산에 반영되지 않는 값이 있다.
- 기준정보, 특히 매입 기준에서 중복 데이터가 생길 수 있다.
- CI와 release gate가 서로 달라, 릴리스 전에만 잡히는 문제가 PR로 들어올 수 있다.

## 발견사항

### F-01. 한 품목에 매입 기준을 여러 개 만들 수 있다

심각도: High

섹션: 8. 기준정보 관리

근거:

- `src/features/master-data/purchase-standard-actions.ts:169`는 품목이 활성인지 확인한 뒤 바로 매입 기준을 만든다.
- `prisma/schema.prisma:153`의 `PurchaseStandard` 모델은 `prisma/schema.prisma:167`에서 `productId`를 index로만 둔다. unique 제약이 없다.
- `src/features/master-data/purchase-standard-import-actions.ts:229`는 나중에 `findFirst`로 한 건만 골라 업데이트한다.

문제:

화면과 import 흐름은 한 품목에 현재 매입 기준이 하나라고 가정한다. 하지만 DB는 여러 건을 허용한다. 같은 품목에 기준이 두 개 생기면 장부 입력, import, 리포트가 어떤 기준을 읽는지 순서에 따라 달라질 수 있다.

누락 테스트:

- 같은 품목에 두 번째 매입 기준을 만들 때 실패해야 한다.
- 또는 여러 기준을 허용한다면 버전 규칙이 테스트로 고정되어야 한다.
- import가 기존 기준을 만났을 때 항상 같은 기준을 업데이트하는지 검증해야 한다.

### F-02. 정정 후에도 필수 누락 신호와 마감 preflight가 원본 값을 본다

심각도: Medium

섹션: 7. 본사 관제판/마감/정정

근거:

- `src/features/dashboard/queries.ts:477`에서 정정 overlay를 만든다.
- `src/features/dashboard/queries.ts:505`에서 `getLedgerReviewMissingItems`를 호출한다.
- `src/features/dashboard/queries.ts:508`부터 `src/features/dashboard/queries.ts:521`까지 원본 매출, 결제, 근무인원을 넘긴다.
- `src/features/dashboard/queries.ts:704`부터 `src/features/dashboard/queries.ts:720`까지 상세 데이터에서도 같은 흐름이 반복된다.
- `src/features/ledger/hq-close-preflight.ts:232`에서 정정 overlay를 만든 뒤, `src/features/ledger/hq-close-preflight.ts:254`부터 `src/features/ledger/hq-close-preflight.ts:270`까지 원본 필수값을 누락 검사에 넘긴다.

문제:

마감 장부에서 매출, 결제, 근무인원 누락을 정정으로 보완해도 관제판이나 preflight는 계속 누락으로 볼 수 있다. 사용자는 정정이 저장됐다고 보지만 운영 상태는 여전히 미완성으로 보인다.

누락 테스트:

- 원본 필수값이 비어 있고 정정값이 유효할 때 관제판과 상세의 필수 누락 신호가 사라져야 한다.
- 최신 정정값이 필수값을 채운 경우 close preflight가 예외 사유를 요구하지 않아야 한다.

### F-03. 재고 금액 정정은 저장되지만 계산에 반영되지 않는다

심각도: Medium

섹션: 7. 본사 관제판/마감/정정

근거:

- `src/app/app/ledgers/[ledgerId]/page.tsx:583`부터 `src/app/app/ledgers/[ledgerId]/page.tsx:592`까지 `INVENTORY_ROW`의 `inventoryAmount`를 정정 대상으로 보여준다.
- `src/features/corrections/actions.ts:354`부터 `src/features/corrections/actions.ts:355`까지 서버도 `INVENTORY_ROW` field를 허용한다.
- `src/server/calculations/ledger.ts:895`부터 `src/server/calculations/ledger.ts:921`까지 실제 반영 로직은 `currentQuantity`와 `quantity`만 처리한다. `inventoryAmount`는 반영되지 않는다.

문제:

audit trail에는 정정 기록이 남지만 대시보드, 상세, 리포트 계산은 바뀌지 않는다. 사용자가 보는 "정정 반영값"이 실제 반영값이 아닐 수 있다.

누락 테스트:

- `inventoryAmount` 정정을 막거나, 실제 재고 금액 계산에 반영되는지 테스트해야 한다.
- 지원하지 않는 대상이면 "반영 불가"가 저장 전에 명확히 나와야 한다.

### F-04. 매입 기준 import가 업로드 파일 안의 중복 행을 조용히 덮어쓴다

심각도: Medium

섹션: 8. 기준정보 관리

근거:

- `src/features/master-data/purchase-standard-import-actions.ts:76`부터 `src/features/master-data/purchase-standard-import-actions.ts:90`까지 imported purchase를 `Map`에 넣는다.
- key가 품목명, 구분, 규격이라 같은 key의 뒤쪽 행이 앞쪽 행을 조용히 덮어쓴다.

문제:

엑셀 안에 같은 품목이 두 번 있고 단가나 참조 정보가 다르면 마지막 행이 이긴다. 사용자는 충돌을 알 수 없다.

누락 테스트:

- 같은 품목의 중복 import 행이 서로 다른 단가나 참조 정보를 가지면 검증 오류가 나야 한다.
- 완전히 같은 중복 행은 중복으로 집계하거나 명시적으로 무시해야 한다.

### F-05. 변경 이력이 사용자/권한 로그를 settings 권한 사용자에게 노출한다

심각도: Medium

섹션: 8. 기준정보 관리

근거:

- `src/app/app/master-data/history/page.tsx:23`은 변경 이력 페이지를 `requireSettingsAccess`로 연다.
- `src/features/audit/audit-queries.ts:344`부터 `src/features/audit/audit-queries.ts:347`까지 audit history 전체도 `requireSettingsAccess`로 열린다.
- `src/features/audit/audit-format.ts:3`부터 `src/features/audit/audit-format.ts:13`까지 `AUDIT_HISTORY_TARGET_TYPES`에 `User`가 들어 있다.

문제:

`SETTINGS_MANAGE`는 있지만 `USER_PERMISSION_MANAGE`는 없는 본사 사용자가 사용자, 역할, 지점 배정 변경 이력을 볼 수 있다. 사용자/권한 경계가 약해진다.

누락 테스트:

- settings-only 본사 사용자는 `User` audit row를 볼 수 없어야 한다.
- 또는 사용자/권한 audit row를 보여주는 페이지는 `USER_PERMISSION_MANAGE`를 요구해야 한다.

### F-06. CSV export가 퍼센트 값을 원시 비율로 내보낸다

심각도: Medium

섹션: 9. 리포트/Export

근거:

- `src/features/reports/export.ts:306`부터 `src/features/reports/export.ts:317`까지 `formatMetricEvidence`가 `evidence.applied.value`를 그대로 반환한다.
- 같은 helper가 이익률 같은 percent metric에도 쓰인다.

문제:

UI에서는 30%로 보이는 값이 CSV에서는 `0.3`으로 나갈 수 있다. 스프레드시트 사용자가 0.3%로 오해하거나 계산에 잘못 사용할 수 있다.

누락 테스트:

- CSV에서 percent, money, boolean, corrected 값, unavailable 값이 어떻게 표시되는지 테스트해야 한다.

### F-07. 긴 dialog가 모바일 화면을 넘어갈 수 있다

심각도: High

섹션: 10. 공통 UI/UX

근거:

- `src/components/ui/dialog.tsx:64`는 중앙 배치 dialog content를 만들지만 `max-height`와 `overflow-y-auto`가 없다.
- `src/features/master-data/components/user-management-client.tsx:449`에서 `DialogContent`를 사용한다.
- `src/features/master-data/components/user-management-client.tsx:537`부터 `src/features/master-data/components/user-management-client.tsx:568`까지 지점 체크박스가 많이 렌더링될 수 있다.
- 저장/취소 버튼은 `src/features/master-data/components/user-management-client.tsx:597`부터 `src/features/master-data/components/user-management-client.tsx:604`에 있다.

문제:

작은 모바일 화면에서 dialog가 화면보다 커질 수 있다. 저장/취소 버튼이나 validation 메시지가 화면 밖으로 밀려 사용자가 폼을 완료하지 못할 수 있다.

누락 테스트:

- 높이 390px 안팎의 모바일 viewport에서 지점 옵션이 많은 사용자 dialog를 열어야 한다.
- dialog가 스크롤되고 footer action이 닿는지 검증해야 한다.

### F-08. 모바일 sidebar가 닫기 버튼을 숨긴다

심각도: Medium

섹션: 10. 공통 UI/UX

근거:

- `src/components/ui/sidebar.tsx:181`은 모바일에서 `Sheet`를 쓴다.
- `src/components/ui/sidebar.tsx:184`부터 `src/components/ui/sidebar.tsx:190`까지 sheet 안의 button을 `[&>button]:hidden`으로 숨긴다.

문제:

drawer는 열리지만 눈에 보이는 닫기 버튼이 없다. 사용자는 바깥을 누르거나 Escape를 알아야 한다. 터치와 키보드 접근성이 약하다.

누락 테스트:

- 모바일 sidebar 열기/닫기 테스트가 필요하다.
- 눈에 보이는 닫기 control과 키보드 닫기를 함께 확인해야 한다.

### F-09. 활성 navigation이 `aria-current`로 노출되지 않는다

심각도: Medium

섹션: 10. 공통 UI/UX

근거:

- `src/components/app-sidebar-nav.tsx:57`부터 `src/components/app-sidebar-nav.tsx:70`까지 active link를 시각적으로만 표시하고 `aria-current`를 넣지 않는다.
- 지점장 navigation도 `src/components/store-manager-shell.tsx`에서 같은 위험이 있다.

문제:

스크린리더 사용자가 현재 페이지를 알기 어렵다. 단순한 시각 문제보다 접근성 문제가 크다.

누락 테스트:

- route별 navigation 테스트에서 active style과 `aria-current="page"`를 확인해야 한다.

### F-10. PR CI가 release gate와 같은 테스트를 돌리지 않는다

심각도: High

섹션: 11. 테스트 품질

근거:

- `package.json:23`의 `release:preflight`는 `pnpm test:api`와 `pnpm test:e2e:core`를 포함한다.
- `.github/workflows/ci.yml:112`부터 `.github/workflows/ci.yml:116`까지 quality job은 unit과 build를 돈다.
- `.github/workflows/ci.yml:168`부터 `.github/workflows/ci.yml:169`까지 Playwright smoke는 auth 한 건만 돈다.

문제:

API export나 핵심 ledger E2E 회귀가 PR CI를 통과해 merge될 수 있다. 로컬 release preflight에서만 잡힐 수 있다.

누락 테스트:

- API 테스트와 핵심 E2E bundle을 필수 CI에 넣어야 한다.
- 시간이 길면 같은 위험을 막는 더 작은 필수 smoke set을 정의해야 한다.

### F-11. `test:e2e:core`가 섹션 7-12를 거의 커버하지 않는다

심각도: High

섹션: 11. 테스트 품질

근거:

- `package.json:27`의 `test:e2e:core`는 store ledger 입력 spec만 포함한다.
- HQ dashboard, HQ ledger edit/corrections, HQ reports, master data, permission profiles, anomaly thresholds, API export spec은 이 bundle 밖에 있다.

문제:

공식 release smoke가 통과해도 본사, 리포트, export, 권한, 기준정보 workflow가 깨져 있을 수 있다.

누락 테스트:

- release gate에 본사 관제, 리포트/export, 권한, 기준정보, 정정 흐름의 대표 E2E를 포함해야 한다.

### F-12. Playwright DB 안전장치의 unit coverage가 약하다

심각도: High

섹션: 11. 테스트 품질

근거:

- `scripts/playwright-clean-env.mjs:11`부터 `scripts/playwright-clean-env.mjs:20`까지 test DB 이름만 허용하는 guard가 있다.
- `scripts/playwright-clean-env.mjs:23`부터 `scripts/playwright-clean-env.mjs:37`까지 Playwright env를 다시 만든다.
- `tests/unit/playwright-clean-env.test.mjs:4`는 `buildPlaywrightArgs`만 import한다. DB guard는 테스트하지 않는다.
- `tests/e2e/global-setup.ts:149`부터 `tests/e2e/global-setup.ts:152`까지 guard 이후 `prisma db push`를 실행한다.

문제:

wrapper가 회귀하면 Playwright가 실제 local DB를 바라보고 schema 변경을 실행할 수 있다.

누락 테스트:

- `erp_fish` 같은 production-like DB 이름은 거부해야 한다.
- `*_e2e`, `*_test` 같은 이름만 허용해야 한다.
- `PLAYWRIGHT_DATABASE_URL`이 상속된 `DATABASE_URL`보다 우선하는지 확인해야 한다.

### F-13. E2E DB가 전체 reset 없이 재사용된다

심각도: Medium

섹션: 11. 테스트 품질

근거:

- `README.md:135`부터 `README.md:138`까지 `erp_fish_e2e` DB를 한 번 만들라고 안내한다.
- `tests/e2e/global-setup.ts:152`는 `prisma db push --skip-generate`를 실행한다.
- cleanup은 test별 부분 cleanup이고 전체 schema reset은 아니다.

문제:

실패한 테스트나 수동 데이터가 다음 E2E 실행에 남을 수 있다. uniqueness, count, dashboard row, report assertion이 flaky해질 수 있다.

누락 테스트:

- dirty DB isolation 테스트가 필요하다.
- 또는 실행마다 schema truncate/reset이나 per-run DB를 사용해야 한다.

### F-14. README와 `start-database.sh`의 DB 시작 절차가 다르다

심각도: Medium

섹션: 12. 문서/릴리스/운영 절차

근거:

- `README.md:138`은 `erp_fish_postgres` container를 사용한다.
- `start-database.sh:18`부터 `start-database.sh:21`까지 `.env`에서 DB 설정과 container 이름을 만든다.
- `start-database.sh:82`부터 `start-database.sh:88`까지 그 이름으로 별도 Postgres container를 실행한다.

문제:

개발자가 한 절차로 DB를 띄우고 다른 절차의 container 이름으로 명령을 실행할 수 있다. migration, seed, e2e DB 생성이 다른 대상에 적용될 수 있다.

누락 테스트:

- 문서화된 DB 시작 절차에 대한 smoke check가 필요하다.
- 또는 stale script를 제거하거나 deprecated로 표시해야 한다.

### F-15. 릴리스 문서에 운영 체크리스트가 부족하다

심각도: Medium

섹션: 12. 문서/릴리스/운영 절차

근거:

- `README.md:165`부터 `README.md:178`까지 release note와 정책 reminder가 있다.
- `README.md:178`부터 `README.md:194`까지 권한 확인 SQL이 있다.
- `docs/ci-secrets-checklist.md:9`부터 `docs/ci-secrets-checklist.md:24`까지는 미래 CI secret만 다룬다.

문제:

backup, migration dry run, rollback, secret rotation, seed password, evidence 첨부 같은 운영 전 checklist가 없다. 복구 계획 없이 release가 진행될 수 있다.

누락 테스트:

- 이 항목은 자동 테스트보다 release checklist gate가 필요하다.

### F-16. 잘못된 export 요청의 400 응답에 `Cache-Control: no-store`가 없다

심각도: Low

섹션: 9. 리포트/Export

근거:

- `src/app/api/reports/export/route.ts:40`부터 `src/app/api/reports/export/route.ts:44`까지 bad request JSON을 header 없이 반환한다.
- 성공과 forbidden 응답에는 `Cache-Control: no-store`가 있다.

문제:

현재 bad request 응답에 민감 정보가 보이진 않지만 export endpoint는 일관되게 no-store가 안전하다.

누락 테스트:

- invalid query API 테스트에서 `Cache-Control: no-store`를 확인해야 한다.

### F-17. 기본 버튼 hover selector가 실제 `<button>`에 맞지 않는다

심각도: Low

섹션: 10. 공통 UI/UX

근거:

- `src/components/ui/button.tsx:12`부터 `src/components/ui/button.tsx:13`까지 `[a]:hover:bg-primary/90`를 쓴다.

문제:

기본 variant가 실제 `<button>`에서는 hover feedback을 놓칠 수 있다. 버튼 상태가 일관되지 않다.

누락 테스트:

- 공통 button hover, focus, disabled 상태에 대한 component 또는 visual test가 필요하다.

### F-18. Tabs orientation이 Radix root에 전달되지 않는다

심각도: Low

섹션: 10. 공통 UI/UX

근거:

- `src/components/ui/tabs.tsx:9`부터 `src/components/ui/tabs.tsx:22`까지 `data-orientation`은 넣지만 `TabsPrimitive.Root`에 `orientation={orientation}`을 넘기지 않는다.

문제:

세로 tabs가 화면상 세로로 보이더라도 키보드 동작은 가로 tabs처럼 남을 수 있다.

누락 테스트:

- vertical tabs의 Radix orientation과 arrow-key 동작을 검증해야 한다.

### F-19. CI 문서의 push 설명이 workflow와 다르다

심각도: Low

섹션: 12. 문서/릴리스/운영 절차

근거:

- `.github/workflows/ci.yml:3`부터 `.github/workflows/ci.yml:6`까지 `push` trigger는 branch 제한이 없다.
- `docs/ci.md:7`부터 `docs/ci.md:10`까지는 특정 branch 기준으로 설명한다.

문제:

개발자가 어떤 branch에서 CI가 도는지, 어떤 branch가 보호되는지 오해할 수 있다.

누락 테스트:

- 자동 테스트보다 문서 수정이 필요하다.

## 양호한 부분

- 본사 장부 수정 path는 `requireLedgerHqEditAccess`와 지점 scope check를 사용한다.
- 본사 마감 path는 `requireLedgerHqCloseAccess`, 장부 scope, status check, optimistic conflict check, preflight, audit log를 갖고 있다.
- 정정 생성은 closed ledger로 제한하고, target별 advisory lock을 잡고, audit log를 쓴다.
- report export는 query shape 검증, 허용 컬럼, CSV escaping, filename sanitize, 안전한 forbidden payload, 성공 audit log를 갖고 있다.
- 지점, 품목, 코드, 사용자, 대부분의 매입 기준 관리 action은 서버 권한과 audit log를 갖고 있다.

## 권장 우선순위

P0:

- F-01, F-03, F-07, F-10, F-11, F-12

P1:

- F-02, F-04, F-05, F-06, F-08, F-09, F-13, F-14, F-15

P2:

- F-16, F-17, F-18, F-19
