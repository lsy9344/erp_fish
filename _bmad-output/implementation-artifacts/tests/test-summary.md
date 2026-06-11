# 테스트 자동화 요약

## 생성된 테스트

### API 테스트

- [x] 해당 없음 - Story 1.1은 신규 HTTP API endpoint보다 NextAuth Credentials 로그인과 서버 페이지 보호 흐름이 범위입니다.

### E2E 테스트

- [x] `tests/e2e/auth.spec.ts` - 비로그인 `/app` 보호 경로 로그인 안내
- [x] `tests/e2e/auth.spec.ts` - 비로그인 `/app/dashboard` 직접 접근 시 데이터 노출 없는 로그인 안내
- [x] `tests/e2e/auth.spec.ts` - 잘못된 로그인 오류 메시지와 `aria-describedby`/`aria-invalid` 연결
- [x] `tests/e2e/auth.spec.ts` - 키보드 제출 시 잘못된 로그인 오류 접근성 연결
- [x] `tests/e2e/auth.spec.ts` - 본사 계정 로그인 후 본사 업무 셸과 홈/리포트/기준정보/설정 사이드바 노출
- [x] `tests/e2e/auth.spec.ts` - 로그인 `callbackUrl`로 안전한 본사 업무 경로 복귀
- [x] `tests/e2e/auth.spec.ts` - 지점장 계정의 본사 대시보드 직접 접근 서버 보호
- [x] `tests/e2e/auth.spec.ts` - 로그인 화면 라이트/다크 토큰의 기본 텍스트와 버튼 색상 검증

## 커버리지

- Story 1.1 인수 조건: 기존 unit/static 테스트와 생성된 E2E assertion 기준 6/6 커버
- 비로그인 보호 경로: 2/2 커버 (`/app`, `/app/dashboard`)
- 로그인 폼 핵심 경로: 3/3 커버 (성공, 잘못된 인증 정보, 키보드 제출 오류)
- 역할 보호 본사 셸: 2/2 커버 (본사 접근, 지점장 차단)
- 테마 토큰 smoke 커버리지: 2/2 모드 커버 (light, dark)

## 검증

- [x] `./node_modules/.bin/prettier --check tests/e2e/auth.spec.ts`
- [x] `./node_modules/.bin/eslint tests/e2e/auth.spec.ts`
- [x] `./node_modules/.bin/tsc --noEmit`
- [ ] `./node_modules/.bin/playwright test tests/e2e/auth.spec.ts`

Playwright 실행을 시도했지만 테스트 본문 실행 전에 로컬 환경에서 차단되었습니다. 처음에는 Corepack이 `/home/noah/.cache/node/corepack/v1`에 쓰기를 시도했고, 로컬 바이너리로 우회한 뒤에는 Prisma가 Linux `schema-engine`을 `binaries.prisma.sh`에서 내려받으려다 네트워크 제한으로 실패했습니다. 현재 생성된 Prisma client에는 Windows query engine만 있어, Linux sandbox에서는 해당 Prisma engine이 미리 준비되지 않으면 E2E global setup을 실행할 수 없습니다.

## 다음 단계

- 네트워크 접근이 가능하거나 Linux Prisma engine이 캐시된 환경에서 `pnpm exec prisma generate`를 실행합니다.
- 이후 `pnpm exec playwright test tests/e2e/auth.spec.ts`를 실행합니다.
