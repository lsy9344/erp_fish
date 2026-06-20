# 최초 계정과 지점 관리 운영 매뉴얼

이 문서는 운영자가 ERP Fish를 처음 설치한 뒤 본사 계정, 지점장 계정, 지점 목록을 어떤 순서로 준비하는지 설명한다.

## 원칙

- 고정 기본 비밀번호를 코드에 넣지 않는다.
- 최초 계정은 `prisma/seed.ts`가 환경변수 값을 읽어서 만든다.
- 운영 DB에서 seed를 실행할 때는 실행자와 실행 시각을 배포 기록에 남긴다.
- 정책 승인 전에는 ECOUNT 업로드, FIFO 금액, HR/급여, 월 손익, 외부 알림, AI를 제품 기능으로 표시하지 않는다.

## Seed 환경변수

필수 값:

```env
SEED_HQ_EMAIL="admin@example.com"
SEED_HQ_PASSWORD="12자 이상 비밀번호"
```

선택 값:

```env
SEED_HQ_NAME="본사 관리자"
SEED_STORE_MANAGER_EMAIL="store-manager@example.com"
SEED_STORE_MANAGER_PASSWORD="12자 이상 비밀번호"
SEED_STORE_MANAGER_NAME="샘플 지점장"
SEED_SAMPLE_STORE_NAME="샘플 지점"
ALLOW_PRODUCTION_SEED=""
ALLOW_SEED_PASSWORD_ROTATION=""
```

`SEED_STORE_MANAGER_PASSWORD`를 비우면 seed는 `SEED_HQ_PASSWORD` 값을 사용한다. 운영에서는 두 값을 다르게 둔다.

## 최초 생성 절차

1. `.env`에 `AUTH_SECRET`, `DATABASE_URL`, `SEED_HQ_EMAIL`, `SEED_HQ_PASSWORD`를 채운다.
2. 샘플 지점장 계정이 필요하면 `SEED_STORE_MANAGER_EMAIL`, `SEED_STORE_MANAGER_PASSWORD`, `SEED_SAMPLE_STORE_NAME`도 채운다.
3. 마이그레이션을 적용한다.

```powershell
pnpm db:migrate
```

4. seed를 실행한다.

```powershell
pnpm db:seed
```

5. 본사 계정으로 로그인한 뒤 `사용자/권한 관리`에서 필요한 권한과 지점 배정을 확인한다.
6. 최초 로그인 뒤 운영 절차에 따라 비밀번호를 교체한다.

운영 환경에서 seed를 실행해야 하면 `ALLOW_PRODUCTION_SEED=true`를 명시한다. 이미 생성된 사용자의 비밀번호를 seed로 갱신해야 할 때만 `ALLOW_SEED_PASSWORD_ROTATION=true`를 사용한다.

## 지점 10개 이상 등록

본사는 `지점 관리` 화면에서 10개 이상 지점을 같은 절차로 운영한다.

1. 본사 계정으로 로그인한다.
2. `기준정보` 또는 `/app/master-data/stores`로 이동한다.
3. `지점 추가`를 눌러 지점명을 입력하고 저장한다.
4. 목록에서 `지점 검색`으로 이름 일부를 검색한다.
5. `상태 필터`를 `전체`, `활성`, `비활성`으로 바꿔 목록을 확인한다.
6. 행의 `활성 상태`를 바꾼 뒤 `상태 적용`을 눌러 비활성 또는 활성으로 전환한다.

10개 이상 지점에서도 검색과 상태 필터를 먼저 사용해서 작업 대상을 좁힌다.

## 지점장 접근 관리

1. `사용자/권한 관리`에서 지점장 사용자를 만든다.
2. 지점장 역할과 `STORE_MANAGER` 권한 프로필을 확인한다.
3. 지점 배정에서 접근 가능한 지점을 연결한다.
4. 배정을 제거하면 해당 지점장 workspace에서 그 지점은 보이지 않는다.
5. 비활성 지점은 신규 입력 대상에서 제외한다. 본사는 기록과 감사 목적의 목록에서 비활성 지점을 확인할 수 있다.

## 비활성 지점 처리

- 비활성 지점은 `지점 관리` 목록에서 `비활성` 상태로 남긴다.
- 삭제 대신 비활성화를 사용한다. 기존 장부, 감사 로그, 권한 이력을 보존하기 위해서다.
- 비활성 지점이 다시 운영되면 같은 행에서 `활성`으로 바꾸고 `상태 적용`을 누른다.
- 지점장에게 노출되는 지점 범위는 서버 권한과 지점 배정으로 제한한다.

## 검증

최초 계정과 지점 운영 변경 뒤에는 최소 다음을 실행한다.

```powershell
pnpm test:unit:file tests/unit/master-data-stores.test.mjs
pnpm test:e2e -- tests/e2e/master-data-stores.spec.ts tests/e2e/master-data-users.spec.ts
```
