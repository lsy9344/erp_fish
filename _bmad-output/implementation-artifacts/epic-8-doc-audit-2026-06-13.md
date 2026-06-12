# Epic 8 문서 업데이트 감사

생성일: 2026-06-13

프로젝트: erp_fish

근거 회고: `_bmad-output/implementation-artifacts/epic-8-retro-2026-06-13.md`

## 감사 목적

Epic 8 회고에서 나온 구현 학습을 기준으로 업데이트가 필요할 수 있는 문서를 후보로 만들고, 각 후보를 실제 구현 코드와 비교해 검증했다. 검증된 불일치가 있는 문서만 수정하고, 코드와 문서가 일치하는 후보는 폐기한다.

## 후보 문서 목록과 검증 결과

| 후보 문서 | 업데이트가 필요할 수 있었던 이유 | 확인한 구현 코드/근거 | 판정 |
| --- | --- | --- | --- |
| `_bmad-output/planning-artifacts/architecture.md` | Epic 8이 CAP-1~19의 후속 구현 guardrail을 만들었으므로 architecture의 feature mapping, CAP-12, CAP-19, notification, report/export 경계가 오래됐을 수 있음 | `package.json`, `prisma/schema.prisma`, `src/server/authz.ts`, `src/server/audit.ts`, `src/server/calculations/policy-gates.ts`, `src/server/sensitive-fields.ts`, `src/features/reports/export.ts`, `src/app/api/reports/export/route.ts`, `rg --files src prisma tests` | 수정 불필요 |
| `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md` | Story 8.x policy artifacts가 생성돼 OQ 또는 CAP commitment label을 닫힌 상태로 바꿔야 할 가능성 | Story 8.x policy docs의 승인 상태, `policy-gates.ts`의 `policy-unconfirmed` 상태, `sprint-status.yaml`, 실제 source/schema/dependency 변경 없음 | 수정 불필요 |
| `_bmad-output/planning-artifacts/epics.md` | Epic 8이 완료됐고 Epic 9가 정의되어 있지 않아 다음 epic 흐름을 바꿔야 할 가능성 | `sprint-status.yaml`가 상태 source이고, `epics.md`는 story 정의 source임. Epic 8 회고와 sprint-status가 완료 상태를 보유함 | 수정 불필요 |
| `README.md` | Epic 8 story records에서 Playwright local bind 제약과 기존 lint warning이 반복됐으므로 test instructions가 오래됐을 가능성 | `playwright.config.ts`, `package.json`, `README.md`, `_bmad-output/implementation-artifacts/tests/test-summary.md` | 수정 불필요 |
| `.env.example`, `_bmad/bmm/config.yaml`, `docker-compose.yml` | 외부 알림, AI, 운영 계약, 백업 관련 새 env/config가 필요할 가능성 | `package.json`, `rg --files src prisma tests`, `.env.example`, `docker-compose.yml`, `_bmad/bmm/config.yaml` | 수정 불필요 |
| API/OpenAPI 문서 | Story 8.x가 upload, notification, AI, operation surface 계약을 만들었으므로 public API docs가 필요할 가능성 | `src/app/api/reports/export/route.ts` 외 신규 API route 없음. Notification/import/AI/ops route 없음 | 수정 불필요 |
| `_bmad-output/implementation-artifacts/tests/test-summary.md` | Story 8.x review에서 test-summary drift가 반복돼 최신 테스트 요약이 실제 상태와 어긋날 가능성 | 현재 파일은 Story 8.9 document-only scope, 신규 API/E2E 없음, unit/check/git diff 결과와 E2E environment blocker를 기록함 | 수정 불필요 |

## 세부 검증

### Architecture

검증한 문서 내용:

- architecture는 CAP-12를 AI 기능 구현이 아니라 분석 가능한 구조화 데이터 보존 guardrail로 둔다.
- CAP-19는 `contract/operations scope`로 유지하고, 구체 product surface가 later PRD/change proposal로 정의되기 전에는 product story로 전환하지 말라고 한다.
- notifications는 후속 `src/features/notifications`, settings surface, scheduled Route Handler 또는 worker boundary 후보로만 매핑되어 있다.
- reports/export는 기존 `src/features/reports`, `src/app/app/reports`, `src/app/api/reports/export` 경계를 사용한다고 되어 있다.
- 권한, 감사, 계산은 `src/server/authz.ts`, `src/server/audit.ts`, `src/server/calculations/*`를 shared boundary로 둔다.

비교한 코드:

- `package.json`에는 OpenAI, Anthropic, Vercel AI SDK, LangChain, embedding/vector DB, LINE, Telegram, notification SDK dependency가 없다.
- `rg --files src prisma tests`에서 notification, provider integration, AI, backup/restore, billing, ticketing, fixed-cost, P&L, special-period, product-analysis, inventory-valuation, product-mapping, HR/payroll feature implementation 파일은 발견되지 않았다.
- `prisma/schema.prisma`에는 `Employee`, `LedgerWorker`, `ProductMapping`, `ImportBatch`, `PurchaseLot`, `InventoryValuation`, `FixedCost`, `NotificationDeliveryLog`, `SensitiveFieldPolicy`, `HopedSalePriceVersion` 모델이 없다. 현재 구현은 `workerCount`, `workMemo`, `authorDisplayName`, permission profile, upload permission enum 후보 수준과 일치한다.
- `src/server/calculations/policy-gates.ts`는 FIFO, 희망 판매가 손실액, 지점장 민감 파생 지표, `차이` 의미 변경을 `policy-unconfirmed`로 유지한다.
- `src/server/sensitive-fields.ts`는 FIFO, 희망 판매가 손실액, 원가/이익/마진/재고금액/lot/고정비/타지점 비교 계열 key를 차단 후보로 유지한다.
- `src/app/api/reports/export/route.ts`는 `Cache-Control: no-store`와 export route를 유지하고, `src/features/reports/export.ts`는 report export allowlist를 사용한다.

판정:

Architecture는 현재 구현과 일치한다. Epic 8 산출물은 구현 승격 조건과 guardrail이며, 실제 source/schema/API/dependency가 추가되지 않았으므로 architecture를 구현 완료 상태로 바꾸면 안 된다.

### PRD

검증한 문서 내용:

- PRD는 CAP-12를 AI 기능 제공 없음, 구조화 데이터 보존 범위로 둔다.
- CAP-19는 계약/운영 별도 범위이며 제품 기능 요구사항이 아니다.
- OQ-9, OQ-10B, OQ-11, OQ-12, OQ-13, OQ-16, OQ-18 등은 승인 또는 계약 전 필수 질문으로 남아 있다.
- LINE 사용 시 LINE Notify가 아니라 Official Account와 Messaging API를 기준으로 검토한다고 되어 있다.

비교한 코드와 산출물:

- Story 8.x policy artifacts는 승인자와 승인 상태를 기록하지만, 여러 항목이 승인 대기 또는 결정 보류 상태다.
- 제품 code에는 CAP-11 notification implementation, CAP-12 AI implementation, CAP-19 operations implementation, CAP-10 monthly P&L implementation, CAP-2 special-period report implementation이 없다.
- `package.json`에도 해당 integration/provider dependency가 없다.
- `sprint-status.yaml`는 Epic 8 story와 retrospective 완료 상태만 보유하며 OQ formal approval source가 아니다.

판정:

PRD는 현재 구현과 일치한다. Story 8.x 산출물 생성을 근거로 OQ를 닫거나 CAP를 implementation-ready로 바꾸면 코드와 승인 상태가 어긋난다.

### Epics

검증한 문서 내용:

- `epics.md`의 Epic 8은 승인 추가 구현 backlog를 바로 제품 기능으로 만들지 않고 릴리스 버킷, OQ gate, 보안 기준, 승인 산출물을 정리하는 track이다.
- Epic 9 이후는 현재 `epics.md`에 정의되어 있지 않다.

비교한 상태:

- `sprint-status.yaml`가 Epic 8 완료 상태와 retrospective 완료 상태를 보유한다.
- Epic 정의 문서는 상태 추적 문서가 아니며, 완료 상태는 retrospective와 sprint-status에 남기는 것이 맞다.
- PRD와 일부 older planning reports에는 Epic 9/10/11 표현이 남아 있지만, 이는 code discrepancy가 아니라 이전 planning proposal의 흐름 표현이다.

판정:

`epics.md`는 수정하지 않는다. 다음 구현 planning은 새 epic/story planning에서 다뤄야 하며, 기존 Epic 8 정의를 상태 문서로 바꾸지 않는다.

### README와 Local Validation

검증한 문서 내용:

- README는 Docker PostgreSQL, local `.env`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build`, `pnpm test:e2e` 사용법을 안내한다.
- Playwright 기본값은 `DATABASE_URL=postgresql://postgres:password@localhost:55432/erp_fish_e2e`, `PORT=3000`이며 override 예시를 제공한다.

비교한 코드:

- `package.json`에 README의 script가 존재한다.
- `playwright.config.ts`는 `PORT`와 `DATABASE_URL` override를 읽고, `corepack pnpm dev --hostname 127.0.0.1 --port ${port}`로 webServer를 시작한다.
- Story 8.x에서 기록된 `listen EPERM`은 현재 sandbox의 local bind 제한이며 README의 일반 local PC 절차와 충돌하지 않는다.
- `test-summary.md`는 이 환경 제약을 별도 blocker로 기록한다.

판정:

README는 수정하지 않는다. local bind 제약은 현재 실행 환경 특성이며, README의 PC/Docker local workflow와 실제 config는 일치한다.

### Configuration

검증한 문서 내용:

- `.env.example`은 auth, database, seed 관련 변수만 둔다.
- `_bmad/bmm/config.yaml`은 planning/implementation artifact 경로와 한국어 출력 설정을 둔다.
- `docker-compose.yml`은 local PostgreSQL만 제공한다.

비교한 코드:

- Epic 8은 notification token, AI provider key, backup/monitoring/billing/ticketing env var를 추가하지 않았다.
- `package.json`에도 provider SDK나 infra dependency가 없다.
- 제품 source에는 CAP-11, CAP-12, CAP-19 implementation surface가 없다.

판정:

Config 문서는 수정하지 않는다. 새 env/config가 필요하다는 검증된 구현 변화가 없다.

## 폐기한 제안 업데이트

1. PRD Open Questions를 Story 8.x 완료 기준으로 닫는 업데이트
   - 폐기 사유: Story 8.x는 산출물 생성과 승격 조건 정리이며 formal approval source가 아니다. 코드도 관련 gate를 유지한다.

2. Architecture에 notification, AI, operations 구현 완료 구조를 추가하는 업데이트
   - 폐기 사유: 실제 `src/`, `prisma`, dependency 구현이 없다. 현재 architecture의 후보 boundary와 guardrail이 정확하다.

3. README에 Story 8.x용 새 실행 절차나 env var를 추가하는 업데이트
   - 폐기 사유: Epic 8은 새 runtime config, migration, service, provider token을 추가하지 않았다.

4. OpenAPI/API 문서를 추가하는 업데이트
   - 폐기 사유: 새 public API contract가 없다. 현재 API surface는 기존 report export route와 auth route 수준이다.

5. `test-summary.md`를 Story 8.8/8.9 신규 E2E 생성 완료로 바꾸는 업데이트
   - 폐기 사유: senior review가 policy-only 범위를 벗어난 E2E/test drift를 제거했다. 현재 신규 UI/API 테스트 없음이 맞다.

6. `epics.md`에 Epic 9 이후를 즉시 생성하는 업데이트
   - 폐기 사유: 회고는 implementation planning을 대체하지 않는다. 후속 epic은 Story 8.x 승인 상태와 product surface를 입력으로 별도 계획해야 한다.

## 최종 결론

검증된 문서 불일치는 없다. Epic 8 이후 필요한 문서 산출물은 이 doc audit와 retrospective artifact이며, architecture, PRD, epics, README, config 파일은 수정하지 않는다.
