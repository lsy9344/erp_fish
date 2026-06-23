# Production Deployment Record

이 문서는 ERP Fish 프로덕션 환경에 **실제로 적용된** 기술 스택과 인프라 구성을
기록한다. 설계 의도는 `_bmad-output/planning-artifacts/architecture.md`에,
출시 전 점검 항목은 `release-checklist.md`에 있다. 이 문서는 "지금 운영 중인
시스템이 무엇으로, 어떻게 구성되어 있는가"의 단일 기준점이다.

- 최초 배포일: 2026-06-21
- 배포 브랜치: `new_function`
- 프로덕션 URL: https://erp-fish.vercel.app

## 적용된 기술 스택

### 런타임 / 빌드

| 항목 | 값 | 비고 |
| --- | --- | --- |
| 로컬 Node.js | 22.16.0 | 빌드/마이그레이션 실행 환경 |
| Vercel Node.js 런타임 | 24.x | Vercel 프로젝트 기본값 |
| 패키지 매니저 | pnpm 10.31.0 | `pnpm-lock.yaml` 기준 |
| 프레임워크 | Next.js `^15.2.3` (App Router) | Server Components + Server Actions |
| React | `^19.0.0` | |
| 빌드 명령 | `next build` | Vercel Framework Preset: Next.js |

### 애플리케이션 레이어

| 영역 | 라이브러리 | 버전 |
| --- | --- | --- |
| 인증 | NextAuth.js (Auth.js) | `5.0.0-beta.25` |
| 인증 어댑터 | `@auth/prisma-adapter` | `2.7.2` |
| ORM | Prisma | `^6.6.0` (`@prisma/client` 동일) |
| 환경변수 검증 | `@t3-oss/env-nextjs` | `^0.12.0` (+ Zod `^3.24.2`) |
| 스타일 | Tailwind CSS | `^4.0.15` |
| UI 컴포넌트 | shadcn/ui | `shadcn ^4.8.2` |
| 차트 | Recharts | `3.8.0` |

스택 출처: Create T3 App (TypeScript + Next.js + Prisma + PostgreSQL +
NextAuth.js + Tailwind + shadcn/ui). 설계문서가 지정한 구성과 일치하며 변경 없음.

## 인프라 구성

### 호스팅 — Vercel

| 항목 | 값 |
| --- | --- |
| 팀(scope) | `noahs-projects-731be159` (noah's projects) |
| 프로젝트명 | `erp-fish` |
| 프로젝트 ID | `prj_c0CNc7JybmRz28rERFGG6Iw4yidz` |
| 연결된 GitHub 저장소 | `lsy9344/erp_fish` |
| 프로덕션 별칭 | `erp-fish.vercel.app` |
| 엣지 서빙 리전 | 인천(ICN) — 한국 사용자 대상 |

### 데이터베이스 — Neon Postgres

| 항목 | 값 |
| --- | --- |
| 제공자 | Neon (Serverless Postgres) |
| 연결 방식 | **Vercel Marketplace 통합** (`vercel integration add neon`) |
| 요금제 | Free |
| 리소스명 | `neon-cinnabar-horizon` |
| 리전 | `us-east-1` (AWS) |
| 연결 자동 주입 | Vercel이 `DATABASE_URL` 등을 프로젝트 env에 자동 등록 |

**중요 — Neon 연결 방식이 Marketplace 통합인 이유와 영향:**

- Vercel과 Neon이 OAuth로 신뢰 관계가 맺어져 있어 **별도의 Neon API 키 발급이
  필요 없다.** Vercel이 자기 권한으로 DB를 생성·연결하고 연결 문자열을
  자동 주입한다. (Neon에 직접 가입해 연결하는 방식은 API 키가 필요함.)
- DB 리소스 수명주기와 결제가 Vercel에 종속된다. Vercel을 떠날 경우 DB 이전
  절차가 별도로 필요하다.
- 리전이 CLI 자동 생성으로 `us-east-1`로 잡혔다. 엣지(인천)는 빠르지만 DB
  쿼리는 미국을 왕복한다. 지점 ~10개 내부 ERP 기준 체감 영향은 작으나, 필요 시
  아시아 리전(싱가포르/도쿄)으로 재생성 가능.

### 연결 풀링 (운영상 중요)

Vercel serverless 환경의 커넥션 고갈을 막기 위해 용도별로 연결을 분리한다.

| 용도 | 사용 변수 | 종류 |
| --- | --- | --- |
| 앱 런타임 | `DATABASE_URL` | pooled (`-pooler` 호스트, PgBouncer) |
| Prisma 마이그레이션 | `DATABASE_URL_UNPOOLED` | direct (pooler 없음) |

Prisma 스키마는 `url = env("DATABASE_URL")` 하나만 사용하므로, 마이그레이션
실행 시 셸에서 `DATABASE_URL`에 **unpooled(direct)** 값을 주입한 뒤
`prisma migrate deploy`를 돌린다. 앱 런타임 env의 `DATABASE_URL`은 pooled를
유지한다.

## 프로덕션 환경변수 인벤토리

값은 Vercel에 암호화되어 저장되며 저장소에 커밋하지 않는다 (`.env`,
`.env.local`, `.vercel`은 모두 `.gitignore` 처리됨).

- 수동 등록: `AUTH_SECRET`, `AUTH_TRUST_HOST`
- Neon 통합 자동 주입: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
  `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_PRISMA_URL`,
  `POSTGRES_URL_NO_SSL`, `POSTGRES_HOST`, `POSTGRES_USER`,
  `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`, `PGHOST`, `PGHOST_UNPOOLED`,
  `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `NEON_PROJECT_ID`,
  `NEON_AUTH_BASE_URL`, `VITE_NEON_AUTH_URL`

앱이 실제로 사용하는 것은 `DATABASE_URL`(런타임)과 `AUTH_SECRET` /
`AUTH_TRUST_HOST`다. 나머지 Neon 변수는 통합이 기본 제공하는 부가 항목이다.

## 적용된 배포 절차

재현 가능하도록 실제 수행한 순서를 기록한다.

1. **사전 점검**: `prisma validate`, `tsc --noEmit`, `eslint .`,
   `next build` — 전부 통과 (22개 라우트 생성 확인).
2. **DB 프로비저닝**: `vercel integration add neon`로 Neon(Free) 생성 +
   프로젝트 연결 + env 자동 주입.
3. **Vercel 프로젝트**: `vercel link`로 `erp-fish` 생성, GitHub 저장소 연결.
4. **환경변수**: `AUTH_SECRET`(신규 생성), `AUTH_TRUST_HOST=true`를
   production에 등록.
5. **마이그레이션**: `DATABASE_URL`에 unpooled 값을 주입해
   `prisma migrate deploy` 실행 — 마이그레이션 30개 전부 적용.
6. **배포**: `new_function` 푸시 후 `vercel --prod --yes`로 프로덕션 배포.
   별칭 `erp-fish.vercel.app` 연결 확인. git 푸시가 자동 트리거한 중복 배포 1건
   제거.
7. **시드 + 검증**: `ALLOW_PRODUCTION_SEED=true` + `NODE_ENV=production`으로
   본사 관리자 계정 시드. 실제 로그인(CSRF → credentials → 세션 발급 →
   `/app/dashboard` 진입)까지 엔드투엔드 확인.

## 운영 시 후속 과제

설계문서 및 릴리스 체크리스트가 요구하는 항목 중 출시 시점에 유보한 것:

- **백업/PITR**: Free 티어는 시점 복구가 제한적. 장부·매입·정정·감사 로그는
  business-critical 데이터이므로, 운영 데이터가 쌓이기 시작하면 Neon 유료
  티어로 상향해 백업을 확보할 것.
- **시드 샘플 계정 정리**: `store-manager@example.com` 샘플 지점장 계정은
  실제 운영 전 비활성화 또는 실계정으로 교체.
- **관리자 자격증명**: 시드 `admin@example.com` / 임시 비밀번호는 첫 로그인 후
  즉시 변경하고, 실제 본사 이메일로 교체 권장.
- **DB 리전**: 지연이 문제될 경우 아시아 리전으로 재생성 검토.
- **프로덕션 브랜치**: 현재 CLI(`vercel --prod`) 배포 기준. git 푸시 기반
  자동 배포를 프로덕션으로 쓰려면 Vercel 프로젝트의 Production Branch를
  `new_function`으로 설정해야 함.

## LINE 아침 요약 알림 (매일 오전 8시)

전날 핵심 경영 요약을 매일 오전 8시(Asia/Seoul)에 LINE으로 발송한다.
발송 엔드포인트는 `POST /api/internal/notifications/morning-summary`이며,
`Authorization: Bearer <INTERNAL_CRON_SECRET>` 없이는 401을 반환한다.

필수 환경변수(`.env.example` 참고):

| 변수 | 용도 |
| --- | --- |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API 채널 액세스 토큰 |
| `LINE_MORNING_SUMMARY_RECIPIENT_IDS` | 수신자 LINE userId(쉼표 구분, 임원/지출 권한 관리자) |
| `INTERNAL_CRON_SECRET` | 내부 스케줄러 인증 시크릿 |

### 스케줄러 (WO-F, 2026-06-22 확정)

배포 플랫폼은 Vercel(`vercel --prod`)이므로, 레포 루트의 `vercel.json`에 실제
Vercel Cron을 등록했다. 매일 23:00 UTC(= KST 08:00)에 발송 엔드포인트를 호출한다.

```jsonc
// vercel.json (레포 루트에 실제 등록됨)
{
  "crons": [
    {
      "path": "/api/internal/notifications/morning-summary",
      "schedule": "0 23 * * *"
    }
  ]
}
```

Vercel Cron 인증: Vercel은 `CRON_SECRET` 환경변수가 설정되어 있으면 cron 호출에
`Authorization: Bearer <CRON_SECRET>` 헤더를 붙인다. 발송 route는
`Bearer <INTERNAL_CRON_SECRET>`을 검증하므로, **Vercel의 `CRON_SECRET`과
`INTERNAL_CRON_SECRET`을 동일한 값으로 설정**해야 cron이 통과한다.

### 수신자 수 정책 (WO-F, 2026-06-22 확정)

원문(`docs/meeting/point_summary.md`)은 "핵심 관리자 3명"으로 예시를 들었으나,
인사 변동·임시 대리 수신 등 운영 유연성을 위해 **"3명 이상(최소 1명) 허용"**으로
정책을 확정한다. 즉 `LINE_MORNING_SUMMARY_RECIPIENT_IDS`에 1명 이상이 설정되면
발송하며, 정확히 3명을 강제하지 않는다. 운영 권장값은 임원/지출 권한 관리자
3명이지만, 수를 강제하지 않는다(코드도 동일하게 1명 이상이면 발송).

외부 크론(예: cron-job.org)을 대안으로 쓸 경우 다음처럼 Authorization을 직접 붙인다.

```bash
# 외부 크론(cron-job.org 등)에서 매일 23:00 UTC 호출
curl -X POST "https://erp-fish.vercel.app/api/internal/notifications/morning-summary" \
  -H "Authorization: Bearer $INTERNAL_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

응답에는 발송 성공/실패 수가 포함되며, 발송 결과는 `NotificationDeliveryLog`
테이블에 수신자별로 기록된다.

> 유지보수·서버비·긴급 대응 범위는 제품 코드가 아니라 위탁 계약/운영 문서 범위다.
> (월 7~8만 원 위탁 유지보수에 클라우드 호스팅 실비, 텍스트/레이아웃 마이너 수정 포함.)
