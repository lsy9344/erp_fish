# Epic 4 문서 감사: 구현 학습 반영

생성일: 2026-06-12
프로젝트: erp_fish
범위: Architecture decisions, API/server boundary documentation, README/configuration documentation

## 감사 방법

- Epic 4 story records와 dev notes를 읽고 문서 업데이트 후보를 만들었다.
- 후보 문서를 현재 구현 코드와 대조했다.
- 코드와 문서가 이미 맞는 항목은 폐기했다.
- 검증된 불일치만 수정했다.

## 후보와 판정

### 1. `_bmad-output/planning-artifacts/architecture.md`

판정: 업데이트 필요.

근거:

- 문서는 append-only correction 원칙을 설명하지만, Epic 4에서 확정된 ClosePreflight 서버 계약, 개별 마감 예외 사유, close transaction 재검증, correction overlay 적용/미적용 기준을 충분히 설명하지 않았다.
- 문서의 Server Action 예시는 `closeDailyLedger`, `addCorrectionRecord` 같은 일반 이름을 사용했지만 실제 구현은 `runHqLedgerClosePreflight`, `closeHqLedger`, `createCorrectionRecord`, `saveHqLedger*` action을 사용한다.
- 문서는 `tests/integration` 계층을 설명했지만 현재 repo의 자동화 테스트는 `tests/unit`과 `tests/e2e`에 있다.

검증한 코드:

- `src/features/ledger/hq-close-actions.ts`
- `src/features/ledger/hq-close-preflight.ts`
- `src/features/ledger/components/hq-ledger-close-dialog.tsx`
- `src/features/corrections/actions.ts`
- `src/server/calculations/ledger.ts`
- `src/features/dashboard/queries.ts`
- `src/features/reports/queries.ts`
- `tests/unit/*.test.mjs`
- `tests/e2e/*.spec.ts`

수정:

- Audit and Correction Strategy에 Epic 4 구현 계약을 추가했다.
- Mutation Pattern에 실제 HQ ledger/correction action names와 공통 처리 순서를 추가했다.
- API and Action Naming Conventions의 예시를 현재 구현 이름과 맞췄다.
- Test Organization을 현재 `tests/unit` + `tests/e2e` 구조와 맞췄다.

### 2. `README.md`

판정: 업데이트 폐기.

근거:

- README의 local env variable, Docker database URL, validation command, Playwright default `DATABASE_URL`/`PORT`, override 예시는 `package.json`, `.env.example`, `playwright.config.ts`와 맞다.
- 현재 sandbox의 Playwright port bind 실패는 로컬 README의 일반 실행 지침 문제가 아니라 실행 환경 권한 제약이다.

검증한 코드/파일:

- `README.md`
- `package.json`
- `.env.example`
- `playwright.config.ts`

### 3. `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md`

판정: 업데이트 폐기.

근거:

- PRD는 본사 마감 후 원본 보존, append-only 정정, 개별 마감 예외 사유, 정정 반영값, OQ-gated `기준 확인 필요` 원칙을 이미 설명한다.
- 코드가 PRD와 다른 방향으로 구현된 근거는 없었다.

검증한 코드:

- `src/features/ledger/hq-close-actions.ts`
- `src/features/corrections/actions.ts`
- `src/server/calculations/ledger.ts`
- `src/features/dashboard/queries.ts`
- `src/features/reports/queries.ts`

### 4. `_bmad-output/planning-artifacts/epics.md`

판정: 업데이트 폐기.

근거:

- Epic 4 stories는 실제 구현 범위와 일치한다.
- Epic 5에 대한 sprint-status 불일치는 planning document 불일치가 아니라 workflow tracking data 문제다. 회고 action item으로 남겼고, Epic 5 planning text 자체는 수정하지 않았다.

검증한 파일:

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### 5. 별도 API/configuration docs

판정: 업데이트 대상 없음.

근거:

- 별도 `api.md`, `configuration.md`, `env.md`류 문서는 발견되지 않았다.
- API 문서 역할은 현재 architecture의 API/server boundary 섹션과 README의 local configuration 섹션이 담당한다.

## 최종 업데이트 목록

- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/implementation-artifacts/epic-4-doc-audit-2026-06-12.md`

## 폐기한 제안

- README에 E2E sandbox port bind 제약을 추가하는 제안은 폐기했다. 일반 로컬 실행 문서와 현재 제한된 실행 환경을 혼동할 수 있기 때문이다.
- PRD에 Epic 4 구현 세부 action names를 추가하는 제안은 폐기했다. PRD는 제품/정책 계약 문서이며 현재 내용이 코드와 충돌하지 않는다.
- Epics 문서에 Epic 5 sprint-status 불일치를 반영하는 제안은 폐기했다. 불일치는 planning text가 아니라 status artifact 문제다.
