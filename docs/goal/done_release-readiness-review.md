# ERP Fish 출시 가능성 검토

작성일: 2026-06-19

완료 상태: 이 검토 결과에 따른 출시 안정화 작업을 끝냈습니다.

## 결론

현재 상태는 "출시 가능"으로 판단하기에는 아직 이르다. 타입, 린트, 빌드, 단위 테스트, API 테스트는 좋은 신호를 보였지만, 프론트엔드-서버-DB를 실제 브라우저로 관통하는 E2E 검증이 시간 안에 끝나지 않았다.

따라서 출시 전 최소 조건은 다음 두 가지다.

1. 전체 또는 핵심 E2E 묶음이 정상 종료되어야 한다.
2. Prisma/DB 검증 명령이 배포와 같은 환경에서 안정적으로 통과해야 한다.

## 검토 범위

- DB: `prisma/schema.prisma`, `prisma/migrations/20260618143000_add_inventory_fifo_lots/migration.sql`
- 서버: 장부 입력 action, 재고 FIFO 계산, 권한, 정정, 대시보드/리포트 query
- 프론트엔드: 지점장 입력 화면, 본사 장부 상세 화면, 매입/ECOUNT 입력 계약
- 검증: 타입체크, 린트, 빌드, 단위 테스트, API 테스트, E2E 실행 시도

## 검증 결과

| 항목 | 결과 | 근거 |
| --- | --- | --- |
| TypeScript | 통과 | `pnpm typecheck` exit 0 |
| ESLint | 통과 | `pnpm lint` exit 0 |
| Next build | 통과 | `DATABASE_URL=postgresql://... pnpm build` exit 0 |
| Prisma schema | 조건부 통과 | `DATABASE_URL=postgresql://... .\node_modules\.bin\prisma.CMD validate` 통과 |
| Unit tests | 통과 | `pnpm test:unit`: 281 pass, 0 fail |
| API tests | 통과 | `pnpm test:api`: 8 pass, 0 fail |
| Full E2E | 미완료 | `pnpm test:e2e`가 20분 제한에서 timeout |
| 핵심 E2E 묶음 | 미완료 | store ledger 핵심 spec 묶음이 15분 제한에서 timeout |
| 재고 단일 E2E | 미완료 | `store-ledger-inventory.spec.ts` 단일 실행도 10분 제한에서 timeout |

## 확인된 연결 상태

### DB와 서버

- FIFO lot 저장 모델은 Prisma schema에 추가되어 있다.
  - `prisma/schema.prisma:81`
  - `prisma/schema.prisma:526`
- 신규 migration은 enum, table, index, FK를 생성한다.
  - `prisma/migrations/20260618143000_add_inventory_fifo_lots/migration.sql`
- 매입, 손실, 재고 저장 뒤 FIFO lot을 다시 계산하는 경로가 있다.
  - `src/features/ledger/actions.ts:1100`
  - `src/features/inventory/actions.ts:347`
  - `src/features/inventory/actions.ts:618`
  - `src/features/losses/actions.ts:434`
- 본사 수정 action도 FIFO 재계산을 호출한다.
  - `src/features/ledger/hq-edit-actions.ts:788`
  - `src/features/inventory/hq-edit-actions.ts:351`
  - `src/features/inventory/hq-edit-actions.ts:596`
  - `src/features/losses/hq-edit-actions.ts:580`

판단: 서버-DB 연결은 코드와 단위 테스트 기준으로 대체로 맞다. 다만 실제 브라우저 저장 흐름이 E2E로 끝까지 증명되지 않았다.

### 서버와 계산/리포트

- FIFO consumed/remaining amount를 리뷰 계산에 전달하는 타입이 있다.
  - `src/server/calculations/ledger.ts:96`
  - `src/server/calculations/ledger.ts:356`
  - `src/server/calculations/ledger.ts:368`
- legacy opening lot이 포함되면 주요 금액 지표를 `policy-unconfirmed`로 내린다.
  - `src/server/calculations/ledger.ts:382`
  - `src/server/calculations/ledger.ts:550`
- 대시보드, 리포트, 장부 상세 query가 FIFO lot을 읽도록 연결되어 있다.
  - `src/features/ledger/review-queries.ts:48`
  - `src/features/dashboard/queries.ts:251`
  - `src/features/reports/queries.ts:376`

판단: FIFO 금액은 확정값처럼 무조건 노출하지 않고 정책 확인 상태를 표시하려는 흐름이 있다. 이는 출시 전 정책 리스크를 줄이는 방향이다.

### 권한과 화면

- 지점장 입력 화면과 저장 action이 `LEDGER_EDIT` 권한을 요구하도록 바뀌었다.
  - `src/server/authz.ts:193`
  - `src/server/authz.ts:362`
  - `src/app/app/store-entry/page.tsx:170`
  - `src/app/app/store-entry/inventory/page.tsx:56`
  - `src/app/app/store-entry/losses/page.tsx:54`
- 단위 테스트가 이 권한 경계를 확인한다.
  - `pnpm test:unit` 중 auth guard 관련 테스트 통과

판단: 권한 경계는 코드상 더 강해졌다. 운영 DB의 기존 지점장 계정에 권한 프로필이 실제로 붙어 있는지는 별도 배포 전 점검이 필요하다.

### ECOUNT 매입

- ECOUNT parser는 선택 장부의 지점/마감일과 엑셀 행을 비교한다.
  - `src/features/ledger/ecount-purchase-import.ts:356`
  - `src/features/ledger/ecount-purchase-import.ts:415`
- mismatch는 조용히 import하지 않고 field error로 반환한다.
  - `src/features/ledger/ecount-purchase-import.ts:496`
- 매입 schema는 `ECOUNT_UPLOAD` 행에 품목 또는 매입 기준을 요구한다.
  - `src/features/ledger/schemas.ts:250`

판단: 잘못된 지점/일자의 행이 들어가는 위험은 현재 코드에서 줄었다. 다만 실제 운영 ECOUNT 거래처명과 ERP Fish 지점명이 완전 일치하는지 확인해야 한다.

## 출시 차단 또는 확인 필요 항목

### P0. E2E가 정상 종료되지 않는다

증상:

- `pnpm test:e2e` 전체 실행이 20분 제한에서 timeout.
- store ledger 핵심 spec 묶음도 15분 제한에서 timeout.
- `tests/e2e/store-ledger-inventory.spec.ts` 단일 실행도 10분 제한에서 timeout.
- timeout 뒤 `3102` 포트에 Next/Playwright 관련 연결이 남는 경우가 있었다.

왜 중요한가:

브라우저에서 사용자가 입력하고 저장하는 실제 흐름이 아직 증명되지 않았다. 특히 이번 변경은 DB, 서버 action, 화면 입력 검증을 동시에 건드리므로 E2E 미완료는 출시 차단으로 봐야 한다.

### P1. Prisma/DB 검증 명령이 환경에 민감하다

증상:

- `DATABASE_URL=postgresql://... .\node_modules\.bin\prisma.CMD validate`는 통과했다.
- 하지만 환경 전환 뒤 `pnpm exec prisma validate`가 `'prisma' is not recognized`로 실패한 경우가 있었다.
- 이전 실행에서는 inherited `DATABASE_URL` 형식이 Prisma CLI에서 거부된 적도 있었다.

왜 중요한가:

앱 런타임의 `src/env.js`는 Python-style PostgreSQL URL을 일부 보정하지만, Prisma CLI와 배포 migration은 그 보정 경로를 항상 타지 않는다. 배포 쉘에서 `prisma migrate deploy`가 실패하면 출시가 멈춘다.

### P1. ECOUNT 지점명 매칭 정책을 확정해야 한다

현재 `normalizeStoreName()`은 공백만 정리한다.

- `src/features/ledger/ecount-purchase-import.ts:356`

운영 ECOUNT 거래처명이 `진수산(수산물)`이고 ERP Fish 지점명이 `진수산`이라면 정상 파일도 막힐 수 있다. 반대로 너무 느슨하게 맞추면 다른 지점 파일을 잘못 가져올 수 있다.

출시 전 결정할 것:

- 완전 일치만 허용할지
- `(수산물)` 같은 접미어를 허용할지
- 별도 지점 mapping table을 둘지

### P1. FIFO historical backfill 정책이 필요하다

새 FIFO lot 테이블은 앞으로 저장되는 장부에는 채워진다. 기존 장부는 저장 action이 다시 실행되지 않으면 FIFO lot이 비어 있을 수 있다.

현재 계산 로직은 FIFO lot이 없으면 기존 방식으로 fallback한다. 기능상 큰 오류는 피하지만, 출시 후 "과거 장부도 FIFO 기준으로 보여야 한다"는 요구가 있으면 backfill이 필요하다.

### P2. 매입 행 정정은 명시적으로 비활성화되어 있다

- 본사 장부 상세의 정정 대상에서 `PURCHASE_ROW` 옵션이 제거되었다.
- 서버 action도 `PURCHASE_ROW` 정정을 unsupported로 반환한다.
  - `src/features/corrections/actions.ts:354`

이는 안전한 축소로 볼 수 있다. 다만 schema/type에는 `PURCHASE_ROW`가 남아 있으므로, 출시 문서와 UI 문구에서 "매입 행 정정은 이번 출시 범위 아님"을 분명히 해야 한다.

## 출시 판단

현재 기준 출시 판정: 보류.

보류 이유:

1. 전체 또는 핵심 E2E가 끝까지 통과하지 않았다.
2. Prisma CLI/DB preflight가 배포 환경에서 안정적으로 통과한다는 증거가 부족하다.
3. ECOUNT 지점명 매칭과 FIFO 과거 데이터 정책이 운영 데이터 기준으로 확인되지 않았다.

출시 가능 조건:

1. `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test:unit`, `pnpm test:api` 통과.
2. `pnpm test:e2e` 또는 합의된 핵심 E2E 묶음 통과.
3. 실제 배포 shell에서 `pnpm db:migrate` 또는 `prisma migrate deploy` dry run 성격의 preflight 통과.
4. 운영 지점장 계정에 `LEDGER_EDIT` 권한 프로필 부여 상태 확인.
5. ECOUNT 지점명 매칭 정책 승인.
6. FIFO historical backfill 여부 승인.
