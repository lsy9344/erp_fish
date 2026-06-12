# Epic 5 문서 감사: 구현 학습 반영

생성일: 2026-06-12
프로젝트: erp_fish
범위: Architecture decisions, API/server boundary documentation, README/configuration documentation

## 감사 방법

- Epic 5 story records와 dev notes를 읽고 문서 업데이트 후보를 만들었다.
- 후보 문서를 현재 구현 코드와 대조했다.
- 코드와 문서가 이미 맞는 항목은 폐기했다.
- 검증된 불일치만 수정했다.

## 후보와 판정

### 1. `_bmad-output/planning-artifacts/architecture.md`

판정: 업데이트 필요.

근거:

- 문서는 master-data와 threshold 변경의 일반 원칙을 설명하지만, Epic 5에서 확정된 soft activation, active-only 신규 선택지, 과거 snapshot 보존, threshold `isActive`/필수 reason/no-op audit, 결제수단 보수 경계를 충분히 설명하지 않았다.
- 문서의 Server Action 예시는 ledger/close/correction 중심이었고 실제 Epic 5 구현 action names를 포함하지 않았다.
- 문서의 action naming 예시는 `updateAnomalyThreshold`였지만 실제 구현은 `updateAnomalyThresholdSettings`다.
- 문서의 프로젝트 트리 일부가 현재 repository와 달랐다. 실제 파일은 `next.config.js`, `postcss.config.js`, `.env.example`/`.env`이며 현재 자동화 테스트는 `tests/unit/*.test.mjs`와 `tests/e2e/*.spec.ts` 중심이다.

검증한 코드/파일:

- `prisma/schema.prisma`
- `src/features/master-data/actions.ts`
- `src/features/master-data/product-actions.ts`
- `src/features/master-data/purchase-standard-actions.ts`
- `src/features/master-data/code-actions.ts`
- `src/features/master-data/queries.ts`
- `src/features/master-data/product-queries.ts`
- `src/features/master-data/purchase-standard-queries.ts`
- `src/features/master-data/code-queries.ts`
- `src/features/dashboard/threshold-actions.ts`
- `src/features/dashboard/threshold-queries.ts`
- `src/server/calculations/anomaly.ts`
- `tests/unit/*.test.mjs`
- `tests/e2e/*.spec.ts`
- repository root config files

수정:

- Audit Strategy에 Epic 5 master-data/settings 구현 계약을 추가했다.
- Mutation Pattern에 실제 master-data/settings Server Action names를 추가했다.
- API and Action Naming Conventions의 threshold action 예시를 현재 구현 이름과 맞췄다.
- Complete Project Directory Structure의 config/test 구조를 현재 repo와 맞췄다.
- Environment Strategy와 Development Workflow의 로컬 환경 파일 설명을 현재 README/`.env.example` 기준인 `.env`와 맞췄다.

### 2. `README.md`

판정: 업데이트 폐기.

근거:

- README의 local env variable, Docker database URL, validation command, Playwright default `DATABASE_URL`/`PORT`, override 예시는 `package.json`, `.env.example`, `playwright.config.ts`와 맞다.
- Epic 5에서 반복된 Playwright `listen EPERM`은 현재 sandbox 제한이지 일반 로컬 실행 지침의 오류가 아니다.

검증한 코드/파일:

- `README.md`
- `package.json`
- `.env.example`
- `playwright.config.ts`

### 3. `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md`

판정: 업데이트 폐기.

근거:

- PRD는 설정 관리자 권한, 기준/권한 변경 audit, 지점/품목/매입 기준/코드/이상 신호 기준값 관리, OQ-1/OQ-3 gate, 민감 export/API 차단 원칙을 이미 설명한다.
- Epic 5 구현은 PRD의 제품 계약을 바꾸지 않았고, 구현 세부 action name은 PRD에 추가할 성격이 아니다.

검증한 코드:

- `src/features/master-data/*`
- `src/features/dashboard/threshold-*`
- `src/server/calculations/anomaly.ts`
- `src/features/ledger/actions.ts`
- `src/features/ledger/hq-edit-actions.ts`

### 4. `_bmad-output/planning-artifacts/epics.md`

판정: 업데이트 폐기.

근거:

- Epic 5 stories는 실제 구현 범위와 일치한다.
- Epic 6 계획을 전면 변경할 implementation discovery는 없었다. 다만 Epic 6 story 작성 시 결제수단 고정 필드 계약, 민감 export 차단, OQ-gated 상태 표시를 더 명확히 해야 한다.

검증한 파일:

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/implementation-artifacts/5-1-지점-마스터-관리.md`
- `_bmad-output/implementation-artifacts/5-2-품목-마스터-기본-관리.md`
- `_bmad-output/implementation-artifacts/5-3-매입-기준-관리.md`
- `_bmad-output/implementation-artifacts/5-4-장부-입력-코드-관리.md`
- `_bmad-output/implementation-artifacts/5-5-이상-신호-기준값-설정-구조.md`

### 5. 별도 API/configuration docs

판정: 업데이트 대상 없음.

근거:

- 별도 `api.md`, `configuration.md`, `env.md`류 문서는 발견되지 않았다.
- API 문서 역할은 현재 architecture의 API/server boundary 섹션과 README의 local configuration 섹션이 담당한다.

## 최종 업데이트 목록

- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/implementation-artifacts/epic-5-retro-2026-06-12.md`
- `_bmad-output/implementation-artifacts/epic-5-doc-audit-2026-06-12.md`

## 폐기한 제안

- README에 E2E sandbox port bind 제약을 추가하는 제안은 폐기했다. 일반 로컬 실행 문서와 현재 제한된 실행 환경을 혼동할 수 있기 때문이다.
- PRD에 Epic 5 구현 세부 action names를 추가하는 제안은 폐기했다. PRD는 제품/정책 계약 문서이며 현재 내용이 코드와 충돌하지 않는다.
- Epics 문서에 Epic 6 scope 변경을 반영하는 제안은 폐기했다. Epic 5 구현 학습은 Epic 6 acceptance criteria에서 주의해야 할 경계이지, 현재 Epic 6 계획 자체를 변경할 수준의 discovery는 아니다.
