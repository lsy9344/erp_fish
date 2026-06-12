# Epic 7 문서 업데이트 감사

생성일: 2026-06-13  
프로젝트: erp_fish  
근거 회고: `_bmad-output/implementation-artifacts/epic-7-retro-2026-06-13.md`

## 감사 목적

Epic 7 회고에서 나온 구현 학습을 기준으로 업데이트가 필요할 수 있는 문서를 후보로 만들고, 각 후보를 실제 구현 코드와 비교해 검증했다. 검증된 불일치가 있는 문서만 수정하고, 코드와 문서가 일치하는 후보는 폐기한다.

## 후보 문서 목록과 검증 결과

| 후보 문서 | 업데이트가 필요할 수 있었던 이유 | 확인한 구현 코드/근거 | 판정 |
| --- | --- | --- | --- |
| `_bmad-output/planning-artifacts/architecture.md` | Epic 7이 OQ-1, OQ-2, OQ-3, OQ-7, OQ-9, OQ-10A, OQ-14 정책 산출물을 만들었으므로 architecture의 gate 설명이 오래됐을 수 있음 | `src/server/calculations/policy-gates.ts`, `src/server/sensitive-fields.ts`, `src/features/inventory/components/inventory-step-client.tsx`, `src/app/api/reports/export/route.ts`, `src/features/reports/export.ts` | 수정 불필요 |
| `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md` | PRD의 Open Questions가 정책 산출물 생성 후 닫힌 것으로 바뀌어야 할 가능성 | Story 7.x policy docs의 승인 상태, `policy-gates.ts`의 `policy-unconfirmed` 상태, sprint-status | 수정 불필요 |
| `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/mvp-story-extraction-checklist.md` | MVP-S04~MVP-S10의 discovery-only gate가 Epic 7 완료 후 바뀌어야 할 가능성 | Story 7.x policy docs가 모두 승인 대기 또는 조건부 승격 상태이며 제품 code 변경 없음 | 수정 불필요 |
| `_bmad-output/planning-artifacts/epics.md` | Epic 7 story가 완료됐으므로 epic 정의 또는 Epic 8 dependency가 바뀌어야 할 가능성 | `sprint-status.yaml`가 상태 source이고 `epics.md`는 story 정의 source임. Epic 8는 이미 Story 7.6/7.7 참조를 포함함 | 수정 불필요 |
| `README.md` | Epic 7 workflow 중 실행/검증 지침 또는 설정 값이 바뀌었을 가능성 | `package.json`, `docker-compose.yml`, `.env.example`, `prisma/seed.ts` | 수정 불필요 |
| `.env.example` / `src/env.js` / `prisma/seed.ts` | 정책 구현이 환경 변수나 config를 요구하게 됐을 가능성 | Epic 7은 app source나 schema를 최종 변경하지 않았고 새 env var가 없음. Seed-only vars는 `prisma/seed.ts`에서 직접 소비됨 | 수정 불필요 |
| API documentation / OpenAPI | 정책 산출물이 new API contract를 만들었을 가능성 | Architecture가 MVP OpenAPI 불필요를 명시하고, 실제 public API는 없음. Existing route는 `/api/reports/export`이며 architecture와 code가 일치함 | 수정 불필요 |

## 세부 검증

### Architecture

검증한 문서 내용:

- `architecture.md`는 Route Handler를 실제 HTTP endpoint에만 쓰라고 정의한다.
- export route는 `/api/reports/export`로 문서화되어 있다.
- MVP-S04~MVP-S10은 linked OQ와 closure artifact가 승인될 때까지 discovery/policy work로 남아야 한다고 되어 있다.
- sensitive-field exposure approval, FIFO final valuation, `30%단가`, `차이` to `당일 판매량` meaning change는 아직 implementation-ready가 아니라고 되어 있다.

비교한 코드:

- `src/app/api/reports/export/route.ts`는 실제 export route다.
- `src/features/reports/export.ts`는 export helper다.
- `src/server/calculations/policy-gates.ts`는 Epic 7 관련 gate를 모두 `policy-unconfirmed`로 유지한다.
- `src/server/sensitive-fields.ts`는 원가/이익/FIFO/희망 판매가/30%단가/차이 금액 계열 key를 서버 shaping 대상으로 유지한다.
- `src/features/inventory/components/inventory-step-client.tsx`는 아직 기존 `차이` label을 사용한다.

판정:

Architecture는 현재 구현과 일치한다. Epic 7 산출물은 승인 대기 정책 문서이므로 architecture를 승인 완료 상태로 바꾸면 오히려 코드와 문서가 어긋난다.

### PRD와 MVP Story Extraction Checklist

검증한 문서 내용:

- PRD는 OQ-1, OQ-2, OQ-3, OQ-7, OQ-9, OQ-10A, OQ-14를 구현 전 필수 질문으로 유지한다.
- `mvp-story-extraction-checklist.md`는 MVP-S04~MVP-S10을 discovery story로 두고 implementation story 생성을 막는다.

비교한 코드와 산출물:

- Story 7.x policy docs는 승인자와 승인 상태를 기록하지만 대부분 승인 대기다.
- `policy-gates.ts`는 관련 metric을 `policy-unconfirmed`로 반환한다.
- 제품 code에는 FIFO lot schema, 희망 판매가 version/lock, 30%단가 계산, OQ-10B 허용 기능, `당일 판매량` 계산 의미 변경이 구현되지 않았다.

판정:

PRD와 checklist는 현재 구현과 일치한다. Open Questions를 닫힌 것으로 바꾸거나 MVP-S04~MVP-S10을 implementation-ready로 바꾸면 안 된다.

### Epics

검증한 문서 내용:

- `epics.md`의 Epic 7은 정책 산출물 생성과 승격 조건을 정의한다.
- Epic 8은 Story 7.6의 민감 필드 매트릭스와 Story 7.7의 용어 승인 산출물을 참조한다.

비교한 상태:

- `sprint-status.yaml`가 완료 상태를 보유하며, Epic 정의 문서는 상태 추적 문서가 아니다.
- Epic 8은 아직 backlog이고, Epic 7 policy docs의 approval pending 상태를 후속 story에서 확인해야 한다.

판정:

Epic 정의는 수정하지 않는다. 완료 상태는 `sprint-status.yaml`와 retro 문서에 남기는 것이 맞다.

### README와 Configuration

검증한 문서 내용:

- README의 Docker/PostgreSQL 값, setup command, validation command.
- `.env.example`의 Auth, database, seed 변수.

비교한 코드:

- `docker-compose.yml`의 service, database, user, password, port가 README와 일치한다.
- `package.json`에 README의 `pnpm db:migrate`, `pnpm db:seed`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build`, `pnpm test:e2e` script가 존재한다.
- `prisma/seed.ts`는 `.env.example`의 store-manager seed variables를 직접 소비한다.
- Epic 7은 새 runtime config, migration, seed flow, API setup을 추가하지 않았다.

판정:

README와 config 문서는 Epic 7 구현 학습으로 수정할 항목이 없다.

## 폐기한 제안 업데이트

1. PRD Open Questions를 Epic 7 완료 기준으로 닫는 업데이트
   - 폐기 사유: 정책 산출물은 생성됐지만 승인 대기다. 코드도 `policy-unconfirmed` 상태를 유지한다.

2. Architecture에서 MVP-S04~MVP-S10을 implementation-ready로 바꾸는 업데이트
   - 폐기 사유: 승인 조건이 충족되지 않았고 제품 code가 변경되지 않았다.

3. Inventory UI 문서를 `당일 판매량` 구현 완료 상태로 바꾸는 업데이트
   - 폐기 사유: 실제 UI는 아직 `차이` label을 사용한다. Story 7.7은 단순 라벨 변경 후보만 정의했다.

4. README에 Epic 7 관련 설정 또는 실행 절차를 추가하는 업데이트
   - 폐기 사유: Epic 7은 새 env var, migration, command, service를 추가하지 않았다.

5. OpenAPI/API documentation을 추가하는 업데이트
   - 폐기 사유: 현재 외부 public API contract가 없고, architecture의 "MVP OpenAPI 불필요" 판단과 구현이 일치한다.

## 최종 결론

검증된 문서 불일치는 없다. Epic 7 이후 필요한 문서 산출물은 이 doc audit와 retrospective artifact이며, architecture, PRD, checklist, epics, README, config 파일은 수정하지 않는다.
