# 6단계 근무/인건비 화면 정리 작업지시서

작성일: 2026-06-25
작업 성격: UX 정리, 용어 정리, 회귀 테스트 보강

## 목적

지점장 장부 입력의 `6단계: 근무인원` 화면에서 `근무인원`과 `급여/인건비`가 따로 보이는 이유를 사용자에게 더 분명하게 만든다.

현재 데이터 구조는 유지한다. `DailyLedger.workerCount`는 근무한 사람 수를 나타내는 운영 요약값이고, `LedgerLaborItem`은 직원별 급여/인건비 상세 행이다. 급여 행만으로 근무인원을 자동 확정하지 않는다.

## 핵심 판단

- `근무인원`은 유지한다.
- `급여/인건비`는 유지한다.
- 두 값을 하나로 합치지 않는다.
- 급여 행에서 계산한 인원은 `참고 인원`으로만 보여준다.
- 참고 인원과 근무인원이 달라도 저장과 제출을 막지 않는다.
- 제출 필수 기준은 계속 `workerCount > 0`이다.

## 이유

급여 행 수는 항상 실제 근무인원과 같지 않다.

예를 들어 같은 직원이 여러 급여 행으로 입력될 수 있고, 직원 연결 없이 이름만 자유 입력될 수 있다. 무급 지원자, 점주, 본사 지원 인력처럼 근무했지만 급여 행에 없는 사람도 있을 수 있다.

따라서 급여/인건비 상세를 기준으로 근무인원을 자동 확정하면 생산성 분석과 제출 검증이 틀어질 수 있다.

## 범위

### 포함

- 6단계 네비게이션 명칭을 `근무인원` 중심에서 `근무/인건비` 중심으로 정리
- `WorkStepClient`의 첫 번째 카드에 `근무 요약` 제목 추가
- 근무인원 입력 옆에 급여 미등록 근무자도 포함한다는 짧은 설명 추가
- 급여/인건비 카드에 급여 행 기준 참고 인원 표시
- 참고 인원과 근무인원이 다를 때 비차단 안내 표시
- 검토 화면의 근무 단계 표현을 새 용어와 맞춤
- 관련 단위 테스트와 E2E 테스트 보강

### 제외

- `DailyLedger.workerCount` 제거
- `LedgerLaborItem`으로 근무인원 자동 확정
- 급여 행 저장 시 근무인원 자동 변경
- 급여 행 중복 직원 입력 차단
- 직원별 근태, 출퇴근, 월 근무일수 기능
- DB migration
- 민감 회계 지표 노출 정책 변경

## 주요 파일

- Modify: `src/features/ledger/components/store-entry-step-navigation.tsx`
- Modify: `src/features/ledger/components/workstep-client.tsx`
- Modify: `src/features/ledger/review-queries.ts`
- Modify: `tests/unit/ledger-cost-labor.test.mjs`
- Modify: `tests/unit/ledger-review.test.mjs`
- Modify: `tests/e2e/store-ledger-cost-labor.spec.ts`
- Modify: `tests/e2e/store-ledger-review.spec.ts`

## 구현 지시

### Task 1. 단계 명칭 정리

**문제**

현재 하단 단계 네비게이션은 `6단계: 근무인원`으로 표시된다. 같은 화면에 급여/인건비 입력도 있으므로 화면 내용과 명칭이 어긋난다.

**작업**

- `src/features/ledger/components/store-entry-step-navigation.tsx`에서 work 단계 라벨을 바꾼다.

```ts
{ id: "work", label: "6단계: 근무/인건비" }
```

- 테스트나 E2E가 기존 `6단계: 근무인원` 텍스트를 찾고 있으면 새 문구로 갱신한다.
- URL step id는 계속 `work`를 사용한다.

**완료 기준**

- 지점장 하단 네비게이션에 `6단계: 근무/인건비`가 보인다.
- 기존 step 이동 URL은 바뀌지 않는다.

### Task 2. 근무인원 카드를 `근무 요약`으로 표현

**문제**

현재 첫 번째 카드는 제목 없이 `근무인원` 필드부터 시작한다. 그래서 아래 `급여/인건비` 카드와 어떤 관계인지 바로 이해하기 어렵다.

**작업**

- `src/features/ledger/components/workstep-client.tsx`의 첫 번째 section 상단에 제목과 짧은 설명을 추가한다.

권장 문구:

```tsx
<div className="flex flex-col gap-1">
  <p className="text-sm font-medium">근무 요약</p>
  <p className="text-muted-foreground text-sm">
    급여 행에 없는 근무자도 포함해 실제 근무한 인원을 입력합니다.
  </p>
</div>
```

- 기존 `근무인원` label은 유지한다.
- 기존 `특이사항 메모` 입력과 저장 동작은 바꾸지 않는다.
- 기존 `LedgerSaveStatus`의 `stepLabel`은 `6단계 근무/인건비`로 바꾼다.

**완료 기준**

- 사용자는 첫 번째 영역이 단순 급여 계산이 아니라 근무 요약 입력임을 볼 수 있다.
- 저장 payload는 여전히 `workerCount`, `workMemo`만 보낸다.

### Task 3. 급여 행 기준 참고 인원 표시

**문제**

급여 행을 여러 건 입력해도 화면은 근무인원과의 관계를 알려주지 않는다. 사용자는 두 값을 중복 입력으로 느낄 수 있다.

**작업**

- `WorkStepClient` 안에 급여 행 기준 참고 인원을 계산하는 helper를 추가한다.
- 직원이 연결된 행은 `employeeId` 기준으로 중복 제거한다.
- 직원이 연결되지 않은 행은 trim한 `workerName` 기준으로 중복 제거한다.
- 이름이 비어 있는 임시 행은 계산에서 제외한다.

권장 helper:

```ts
function getDraftLaborHeadcount(lines: LaborLine[]) {
  const keys = new Set<string>();

  for (const line of lines) {
    const employeeId = line.employeeId.trim();
    const workerName = line.workerName.trim();

    if (employeeId.length > 0) {
      keys.add(`employee:${employeeId}`);
      continue;
    }

    if (workerName.length > 0) {
      keys.add(`name:${workerName}`);
    }
  }

  return keys.size;
}
```

- `draftLaborHeadcount`를 급여/인건비 합계 박스에 표시한다.

권장 문구:

```tsx
<div className="mt-2 flex justify-between gap-2 text-sm">
  <span className="text-muted-foreground">급여 행 기준 참고 인원</span>
  <span className="font-semibold tabular-nums">
    {draftLaborHeadcount}명
  </span>
</div>
```

**완료 기준**

- 급여 행이 없으면 참고 인원은 `0명`이다.
- 같은 `employeeId`가 2번 있어도 참고 인원은 1명이다.
- 같은 자유 입력 이름이 2번 있어도 참고 인원은 1명이다.
- 직원 연결 행과 자유 입력 이름 행은 서로 다른 사람으로 본다.

### Task 4. 참고 인원 불일치 안내 추가

**문제**

근무인원과 급여 행 기준 참고 인원이 다를 수 있다. 이것은 오류가 아닐 수 있지만, 사용자가 확인할 수 있어야 한다.

**작업**

- `workerCount`가 1 이상이고 `draftLaborHeadcount`가 1 이상이며 두 값이 다를 때만 비차단 안내를 표시한다.
- 안내는 저장을 막지 않는다.
- 서버 validation은 추가하지 않는다.

권장 조건:

```ts
const parsedWorkerCount = /^\d+$/.test(workerCount.trim())
  ? Number(workerCount.trim())
  : null;
const showLaborHeadcountHint =
  parsedWorkerCount !== null &&
  parsedWorkerCount > 0 &&
  draftLaborHeadcount > 0 &&
  parsedWorkerCount !== draftLaborHeadcount;
```

권장 문구:

```tsx
{showLaborHeadcountHint ? (
  <p className="text-muted-foreground text-sm">
    근무인원과 급여 행 기준 참고 인원이 다릅니다. 급여 미등록 근무자가 있으면 그대로 저장할 수 있습니다.
  </p>
) : null}
```

**완료 기준**

- 불일치 안내는 오류 색상으로 보이지 않는다.
- 불일치 상태에서도 `저장`과 `급여 저장`은 가능하다.
- `workerCount`가 비어 있거나 잘못된 형식이면 이 안내는 숨긴다. 이 경우 기존 서버 검증 오류만 사용한다.

### Task 5. 검토 화면 용어 정리

**문제**

검토 화면의 work 단계가 `근무`로만 표시되고, metric은 `근무인원`, `급여 항목`, `급여 합계`로 나뉜다. 입력 화면 명칭과 맞춰 더 명확히 할 필요가 있다.

**작업**

- `src/features/ledger/review-queries.ts`에서 work 단계 label을 `근무/인건비`로 바꾼다.
- metric id와 계산값은 바꾸지 않는다.
- `workerCount`, `laborCount`, `payrollTotal`은 계속 별도 metric으로 유지한다.

권장 변경:

```ts
{
  id: "work",
  label: "근무/인건비",
  status: stepStatus("work", missingById, summary.workerCount),
  detail: stepDetail({
    stepId: "work",
    missingItems: missingById,
    savedDetail:
      workerCount === null
        ? "근무인원이 아직 입력되지 않았습니다."
        : `근무인원 ${workerCount}명이 저장되어 있습니다.`,
    calculationMetric: summary.workerCount,
  }),
  href: getLedgerReviewStepHref(storeId, closingDate, "work"),
  metrics,
}
```

**완료 기준**

- 검토 화면에서 `근무/인건비` 단계가 보인다.
- 검토 화면은 근무인원과 급여 합계를 계속 별도로 보여준다.
- 지점장 민감 지표 차단 정책은 바뀌지 않는다.

### Task 6. 단위 테스트 보강

**작업**

- `tests/unit/ledger-cost-labor.test.mjs`에 source contract 테스트를 추가하거나 기존 테스트를 갱신한다.
- 아래를 확인한다.

검증 항목:

- `WorkStepClient`에 `getDraftLaborHeadcount`가 있다.
- `employeeId` 우선 중복 제거 로직이 있다.
- 급여 행 기준 참고 인원 문구가 있다.
- 불일치 안내 문구가 있다.
- `saveCurrentDraft` payload에 `laborItems`나 `payrollTotal`을 넣지 않는다.
- `saveCurrentLaborDraft` payload에 `workerCount`를 넣지 않는다.

- `tests/unit/ledger-review.test.mjs`에서 work 단계 label이 `근무/인건비`인지 확인한다.

**완료 기준**

```powershell
pnpm test:unit:file tests/unit/ledger-cost-labor.test.mjs
pnpm test:unit:file tests/unit/ledger-review.test.mjs
```

두 명령이 모두 통과한다.

### Task 7. E2E 테스트 보강

**작업**

- `tests/e2e/store-ledger-cost-labor.spec.ts`에 아래 흐름을 추가한다.

시나리오:

1. 지점장으로 오늘 장부의 work 단계에 진입한다.
2. 네비게이션 또는 화면에서 `6단계: 근무/인건비`를 확인한다.
3. `근무 요약` 제목을 확인한다.
4. 근무인원에 `3`을 입력한다.
5. 급여 행을 2명 입력한다.
6. `급여 행 기준 참고 인원 2명`을 확인한다.
7. 불일치 안내가 보이는지 확인한다.
8. 근무정보 저장과 급여 저장이 모두 성공하는지 확인한다.
9. 재방문 후 근무인원과 급여 행이 유지되는지 확인한다.

- `tests/e2e/store-ledger-review.spec.ts`에서 검토 화면의 `근무/인건비`, `근무인원`, `급여 항목`, `급여 합계` 표시를 확인한다.

**완료 기준**

```powershell
node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-cost-labor.spec.ts tests/e2e/store-ledger-review.spec.ts
```

명령이 통과한다. 로컬 DB나 브라우저 환경 문제로 실패하면 실패 원인과 재실행 명령을 작업 기록에 남긴다.

## 수용 기준

- 지점장 화면의 6단계 명칭이 `근무/인건비`로 바뀐다.
- 근무인원 입력은 급여 행과 다른 목적임을 화면에서 이해할 수 있다.
- 급여 행 기준 참고 인원이 보인다.
- 참고 인원과 근무인원 불일치는 안내만 하고 저장을 막지 않는다.
- `DailyLedger.workerCount`와 `LedgerLaborItem` 데이터 모델은 유지된다.
- 제출 필수 기준은 `workerCount > 0`으로 유지된다.
- 급여/인건비 행 수나 급여 합계만으로 근무인원을 자동 변경하지 않는다.
- 지점장에게 `productivity`, 매출원가, 매출이익, 영업이익, FIFO 원가 근거는 노출하지 않는다.

## 검증 명령

```powershell
pnpm db:validate
pnpm test:unit:file tests/unit/ledger-cost-labor.test.mjs
pnpm test:unit:file tests/unit/ledger-review.test.mjs
pnpm typecheck
pnpm lint
node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-cost-labor.spec.ts tests/e2e/store-ledger-review.spec.ts
```

## 작업 시 주의사항

- DB migration을 만들지 않는다.
- 급여 행 저장 로직에서 `workerCount`를 건드리지 않는다.
- 근무정보 저장 로직에서 `laborItems`를 건드리지 않는다.
- 참고 인원은 사용자의 확인을 돕는 표시값이지 권위 있는 데이터가 아니다.
- 불일치 안내를 오류처럼 보이게 만들지 않는다.
- 기존 민감 지표 차단 테스트가 약해지면 안 된다.
