## Deferred from: code review of 1-1-스타터-템플릿으로-초기-프로젝트를-설정하고-본사-업무-공간에-로그인한다.md (2026-05-29)

- Credentials 로그인 rate limiting 정책 결정 필요 — `src/server/auth/config.ts`의 Credentials provider에는 IP/계정 기준 실패 제한이나 lockout이 없다. 무차별 대입 방어는 필요하지만, 이 프로젝트에서 in-memory, DB-backed, edge middleware, 외부 gateway 중 어느 계층이 책임질지 결정이 필요하다. Deferred reason: MVP 범위 밖이며 별도 보안 hardening 스토리에서 처리

## Deferred from: code review of 5-4-본사가-월간-지점별-마감과-이상-현황을-본다.md (2026-06-02)

- Store comparison revalidation 누락 가능성은 이번 5.4 변경 범위 밖이다 — Blind Hunter는 ledger/store write path가 `/app/reports/comparison`을 revalidate하지 않아 comparison report가 stale할 수 있다고 지적했다. 그러나 Story 5.4의 명시 범위는 `/app/reports/monthly` 추가이고, story 가드레일도 comparison revalidation 범위를 불필요하게 넓히지 말라고 한다.

## Deferred from: code review of spec-rev2-rev3-audit-remediation.md (2026-07-18)

- 당일 매입 손실 성공·무근거 차단 Playwright 검증은 테스트 코드와 수집까지 완료했지만, 로컬 PostgreSQL `localhost:5432`가 미기동이고 WSL Docker 연동도 없어 global setup에서 `P1001`로 중단됐다. PostgreSQL 사용 가능한 환경에서 `node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-losses.spec.ts --grep "당일 매입|재고 근거"`를 실행해 최종 인수 증거를 남긴다.

## Deferred from: code review of spec-gangseo-0803-fifo-margin-fix.md (2026-08-08)

- **보안 우선:** Git 제외된 `tmp/q-*.ts` 조사 스크립트 여러 개에 운영 DB 접속문자열이 평문으로 남아 있다. 스크립트를 `.env.local` 로딩 방식으로 정리하고, 노출된 운영 DB 자격증명을 Neon에서 교체한 뒤 저장소·세션 로그·로컬 임시 파일의 잔존 여부를 점검해야 한다. 이번 FIFO 수정 범위 밖이며 자격증명 교체는 운영 권한이 필요한 별도 보안 작업이다.
- `pnpm typecheck`와 전체 `pnpm lint`가 pre-existing `tmp/q-*.ts`의 오래된 Prisma 필드와 unsafe 타입 오류로 실패한다. 조사 스크립트를 현재 schema에 맞게 수정하거나 `tsconfig`/ESLint의 임시 스크립트 포함 정책을 정리해야 한다. 이번 변경 파일의 ESLint와 관련 단위 테스트는 통과했다.
