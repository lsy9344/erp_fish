# 테스트 자동화 요약

## 생성/보강한 테스트

### API 테스트

- [x] 기존 `tests/api/report-export.spec.ts` 확인 및 실행 - 리포트 CSV export API의 권한, 검증 오류, CSV 헤더, 민감 필드 비노출, 감사 로그를 이미 커버하고 있어 신규 API 테스트는 추가하지 않음

### E2E 테스트

- [x] `tests/e2e/auth.spec.ts` - 비로그인 사용자의 `/` 루트 접근이 로그인으로 안내되는 흐름 추가
- [x] `tests/e2e/auth.spec.ts` - 로그인 사용자의 `/` 루트 접근이 역할별 업무 홈으로 이동하는 흐름 추가
- [x] 기존 E2E 실패 보정 - 중복 accessible text, redirect `ERR_ABORTED`, 로그인 세션 재사용, loading 영역과 실제 영역 name 충돌, 비동기 감사 로그 대기 문제를 테스트 목적에 맞게 정리

## 커버리지

- API endpoints: 1/1 주요 custom endpoint 커버 (`/api/reports/export`)
- UI routes: 구현된 주요 업무 route는 기존 E2E가 커버하며, 이번 작업에서 누락된 루트 `/` 리다이렉트 경로를 보강
- 전체 E2E: 171개 통과
- API 테스트: 8개 통과

## 검증

- [x] `corepack pnpm playwright test tests/e2e/auth.spec.ts -g "루트 경로"` 통과, 2/2
- [x] `corepack pnpm playwright test tests/e2e/auth.spec.ts` 통과, 20/20
- [x] `corepack pnpm test:api` 통과, 8/8
- [x] `corepack pnpm test:e2e` 통과, 171/171
- [x] `corepack pnpm check` 통과

## 참고

- `corepack pnpm check`는 통과했지만 기존 warning 2개가 남아 있음: `src/app/api/reports/export/route.ts`의 미사용 `DATE_PATTERN`, `MONTH_PATTERN`
