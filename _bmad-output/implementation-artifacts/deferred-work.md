## Deferred from: code review of 1-1-스타터-템플릿으로-초기-프로젝트를-설정하고-본사-업무-공간에-로그인한다.md (2026-05-29)

- Credentials 로그인 rate limiting 정책 결정 필요 — `src/server/auth/config.ts`의 Credentials provider에는 IP/계정 기준 실패 제한이나 lockout이 없다. 무차별 대입 방어는 필요하지만, 이 프로젝트에서 in-memory, DB-backed, edge middleware, 외부 gateway 중 어느 계층이 책임질지 결정이 필요하다. Deferred reason: MVP 범위 밖이며 별도 보안 hardening 스토리에서 처리
