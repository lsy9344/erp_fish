# Epic 1 문서 드리프트 감사

생성일: 2026-06-11
범위: Epic 1 회고 후 문서 업데이트 필요 여부 검증

## 검증 방법

1. Sprint status와 Epic 1 story files를 읽어 실제 완료 범위를 확정했다.
2. PRD, architecture, README, `.env.example`, package scripts, seed script, Playwright config, Prisma schema, server auth/audit helper를 대조했다.
3. 실제 코드와 불일치가 확인된 문서만 수정 대상으로 채택했다.

## 후보별 판정

| 후보 문서                                                               | 검증한 구현 근거                                                                               | 판정                           | 조치       |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------ | ---------- |
| `README.md`                                                             | `.env.example`, `prisma/seed.ts`, `playwright.config.ts`, `package.json`, `docker-compose.yml` | 불일치 있음                    | 수정함     |
| `_bmad-output/planning-artifacts/architecture.md`                       | `src/server/authz.ts`, `src/server/audit.ts`, `src/server/sensitive-fields.ts`, Prisma schema  | 현재 구현과 대체로 일치        | 수정 안 함 |
| `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md` | 권한 profile/action, 민감 필드 차단, audit payload 구현                                        | 현재 구현과 대체로 일치        | 수정 안 함 |
| `.env.example`                                                          | `src/env.js`, `prisma/seed.ts`, README 로컬 실행 흐름                                          | placeholder 정책이 구현과 일치 | 수정 안 함 |
| `package.json` scripts                                                  | Story validation logs, package scripts                                                         | 명령 이름은 구현과 일치        | 수정 안 함 |
| `sprint-status.yaml`                                                    | 회고 완료 산출물                                                                               | retrospective status 불일치    | 수정함     |

## 확인된 불일치

### README seed 비밀번호 안내

`README.md`는 seed login password를 `AdminPassword123!`로 안내했다. 실제 `.env.example`은 `SEED_HQ_PASSWORD`와 `SEED_STORE_MANAGER_PASSWORD`를 placeholder로 두고, `prisma/seed.ts`는 해당 환경 변수가 없으면 seed를 실패시킨다. 따라서 README의 고정 비밀번호 안내는 실제 구현과 맞지 않는다.

조치:

- README에서 고정 seed password를 제거했다.
- `.env` 작성 단계에서 `AUTH_SECRET`, `SEED_HQ_PASSWORD`, `SEED_STORE_MANAGER_PASSWORD`를 채우도록 안내했다.
- Playwright 기본 test DB URL과 `PORT` override를 문서화했다.
- T3 기본 템플릿 안내 중 이 프로젝트에 맞지 않는 일반 안내를 ERP Fish 실행/검증 안내로 대체했다.

### sprint-status retrospective 상태

`epic-1-retrospective`가 `optional`이었다. 회고 문서가 생성됐으므로 `done`으로 변경했다.

## 수정하지 않은 후보

### Architecture

Architecture 문서는 다음 구현 학습과 이미 일치한다.

- Next.js App Router, Prisma, PostgreSQL, NextAuth/Auth.js, shadcn/ui 선택
- `src/server/authz.ts` 중심 shared authorization helper
- action-level authorization
- sensitive response shaping
- `src/server/audit.ts` shared audit helper
- append-only audit/correction 전략

확인된 코드 불일치가 없어 수정하지 않았다.

### PRD

PRD는 권한 프로파일, action matrix, 지점장 민감 필드 차단, 감사 이벤트 공통 계약을 이미 정의한다. Epic 1 구현은 이 방향을 따른다. 확인된 코드 불일치가 없어 수정하지 않았다.

### `.env.example`

`.env.example`은 secret placeholder와 seed password placeholder를 사용한다. 이는 seed script의 secret 미커밋 정책과 일치한다. 수정하지 않았다.

## 남은 주의점

- `implementation-artifacts`에는 과거 계획의 stale story files가 남아 있다. 문서 자체의 코드 불일치는 아니지만, 자동화가 story를 선택할 때 sprint-status key와 제목을 기준으로 검증해야 한다.
- Epic 2 실행 전 현재 backlog story와 기존 구현 파일의 관계를 다시 확인해야 한다.
