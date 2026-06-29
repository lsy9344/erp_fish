# 2026-06-27 회의 반영 구현 작업지시서

작성일: 2026-06-27
기준 문서: `docs/meeting_0627/final-summary-and-worklist-2026-06-27.md`
대상 프로젝트: `ERP Fish`
목표: 2026년 7월 파일럿 전에 회의 요청을 코드 구조에 맞게 나누고, 개발자가 바로 착수할 수 있는 작업 단위로 정리한다.

보완 반영: `docs/reference_from_customer/장부-202605현대 (1).xlsx`의 `26` 시트에서 `AE4/AE5`와 `C5/C17`의 위치, 값, 수식이 확인됐다. 이제 `AE4` 의미 확인은 막힌 항목이 아니다. 앱에서 보이는 `79.5% -> 20.5%`는 계산 기준을 새로 찾는 것이 아니라 표시 방향을 반대로 하라는 의미로 확정됐다.

교차 검토 반영: 6/22~6/27 미팅 폴더 문서와 대조한 상세 부족분, 정책 충돌, 의뢰자 결정 항목은 `docs/meeting_0627/cross-document-gap-review-2026-06-28.md`에 별도로 기록했다. 2026-06-28 의뢰자 답변으로 급여/인건비 노출, Ecount 단가 수정 권한, 전일재고 상세 범위, 알림 채널, `20.5%` 표시 방향은 확정됐다.

결정 반영(2026-06-28):

| 항목 | 확정 내용 | 구현 지시 |
|---|---|---|
| 급여/인건비 노출 | 본사만 볼 수 있다. | 지점장 화면과 응답에서 급여액, 인건비 합계, 개인별 급여를 제거한다. |
| 급여/인건비 입력 | 본사만 등록/수정하고, 매장관리자는 근무자를 선택만 한다. | 지점장 Server Action은 급여액 입력을 받지 않는다. |
| 재고/단가 수정 | 본사만 수정 가능하다. | 지점장 적용 단가 수정 가능성은 제거하거나 서버에서 거부한다. |
| 마진율 `79.5% -> 20.5%` | 본사 아이디의 `홈` 화면에서 보이는 마진율을 반대로 표시한다. | 숫자가 79.5가 아니어도 `100% - 현재 홈 마진율`로 표시한다. 예: 80%로 보이면 20%로 표시한다. |
| 홈 매출/마진 라벨 | 쉬운 단어로 추천 적용한다. | `장부 매출`, `장부 이익률`, `분석 매출`, `분석 이익률`을 기본 라벨로 쓴다. |
| 장기재고 기준일 | 본사 왼쪽 네비게이션에 관리 항목을 추가한다. | 본사가 품목군/품목별 기준일을 직접 관리하는 화면을 만든다. |
| 냉동/활어 기준 | 나중에 자료를 제공한다. | 기준표 전에는 자동 분류 확정 구현을 시작하지 않는다. |
| 전일재고 상세 | 매장관리자에게 FIFO 세부, 수량, 항목만 보여준다. | 금액, 단가, 원가, 마진은 지점장 응답에서 제외한다. |
| 알림 채널 | LINE만 사용한다. | Telegram, 카카오톡, 이메일 대안은 이번 범위에서 제외한다. |
| 품목묭도/모두 적용 | 이카운트 업로드 시 지점이름과 품목이 자동 등록되므로 해당 모호 항목은 삭제한다. | WO-08은 자동 등록/자동 매핑 검증으로 바꾼다. |
| 월별 손익/차트 | 범위에 포함한다. 품목 검토 페이지와 매출 검토 페이지를 따로 만들고, 차트만 쉽게 보는 화면을 제공한다. | WO-15에 월별 손익을 포함하고, WO-16으로 차트/검토 페이지를 추가한다. |
| xlsx export | xlsx까지 제공한다. | CSV만이 아니라 xlsx 다운로드도 구현 범위에 넣는다. |
| xlsx 컬럼 | 추천안으로 확정한다. | `요약`, `기간조회_RAW`, `월별손익`, `재고현황`, `품목매출` 시트로 나누고, 아래 WO-15 컬럼 기준을 따른다. |
| 월별 손익 조정 항목 | 추천안으로 확정한다. | 월세, 관리비, 공과금, 세금/수수료, 포장/소모품, 배송/운반, 수선/유지보수, 기타비용, 본사조정, 조정사유, 메모를 둔다. |
| 기존 장부 급여액 | 추천안대로 진행한다. | 과거 급여액은 그대로 보존하고 본사 화면에서만 보여준다. 과거분 자동 재계산은 하지 않는다. |
| 사업자명 | `도원에스디`로 확정한다. | 법적 사업자명은 도원에스디로 표시한다. 화면 표시명도 별도 요청이 없으면 도원에스디를 쓴다. |
| 진수산 재고이상 | 의뢰자가 직접 분석한다. | 구현 작업과 자료 요청 목록에서 제외한다. |

## 0. 실행 가능성 검토 결과

이 작업지시서는 큰 방향은 실행 가능하다. 다만 그대로 착수하면 일부 작업에서 기존 구현과 새 요구가 겹치거나, 계산 공식과 권한 정책이 모호해져 재작업이 생길 수 있다. 아래 보완 지시는 이 문서의 기존 WO 지시보다 우선한다.

### 0.1 종합 판정

| 구분 | 판정 | 이유 | 조치 |
|---|---|---|---|
| 바로 착수 가능한 UI/라벨 작업 | 가능 | DB 변경 없이 UI 라벨, 탭 이동, 표시 문구를 정리하는 작업이 많다. | WO-01~WO-06, WO-11 일부는 작은 PR로 먼저 처리한다. |
| 마진율 표시 변경 | 가능 | 본사 아이디의 `홈` 화면에 보이는 마진율은 `100% - 현재 표시값`으로 반전 표시한다. | WO-14는 본사 홈 마진율 표시 컴포넌트를 찾아 반전 표시 테스트를 만든다. |
| 민감정보 차단 | 위험 높음 | 지점장 응답 shaping, UI 숨김, API/Server Action 권한이 함께 맞아야 한다. | WO-10, WO-11, WO-14는 서버 응답 테스트를 필수로 둔다. |
| DB migration 포함 작업 | 주의 | 품목 분류, 급여 기준, 장기 재고 기준은 schema 변경 가능성이 높다. | WO-10, WO-13은 별도 migration PR로 분리한다. |
| 기존 기능과 겹치는 작업 | 주의 | 이카운트 상태 라벨, 본사 탭 query, 감사 이력, 전일재고 이력, 장기 체화 알림은 일부 구현이 이미 있다. | “신규 구현”이 아니라 “현 구현 보완”으로 범위를 좁힌다. |

### 0.2 현재 코드와 대조한 주요 보완 사항

1. WO-01의 `statusLabel`은 배치 단위에 이미 존재하고, 상세 화면도 배치 상태는 한글 라벨을 쓴다. 남은 핵심은 라인 단위 `EcountImportLineDetail.statusLabel` 추가와 `READY`, `COMMITTED` 라벨 문구 정리다.
2. WO-02의 본사 장부 상세는 이미 `tab` query를 읽어 기본 탭을 정한다. 남은 핵심은 탭 클릭 시 URL을 갱신하고, 대시보드/신호 링크가 `?tab=losses` 등으로 들어오게 만드는 것이다.
3. WO-05의 변경 이력은 이미 대상/액션 라벨, 사유, 변경 전/후 JSON, 변경 요약을 보여준다. 남은 핵심은 raw JSON 의존을 더 줄이고, 장부 상세 링크와 중첩 필드 라벨을 보강하는 것이다.
4. WO-10은 기존 코드와 정책이 가장 크게 충돌한다. 현재 지점장 근무/인건비 화면은 급여 금액과 급여 합계를 다루고, 일부 테스트도 이를 허용하는 전제로 작성되어 있다. 이 작업은 UI 수정만으로 끝나지 않고 schema, 응답 shaping, 기존 테스트 정책 변경이 필요하다.
5. WO-11은 재고 행별 `전일재고 이력 보기` 모달이 이미 있다. 새 요구는 상단의 전체 `전날 재고 보기` 요약 창이며, 기존 행별 이력과 중복되지 않게 범위를 정해야 한다.
6. WO-12는 본사 재고 조정과 이카운트 적용 단가 보정 기반이 이미 있다. 새 요구는 정책 문구, 원본/적용 단가 UI 가시성, FIFO/리포트 영향 검증을 더 명확히 하는 쪽이다.
7. WO-13은 `LedgerInventoryFifoLot.sourceBusinessDate`와 30일 장기 체화 알림 기반이 이미 있다. 새 요구는 생물/냉동/품목군별 기준일을 master/config로 분리하고, 지점장/본사 노출 차이를 적용하는 것이다.
8. WO-14는 `79.5% -> 20.5%`가 표시 방향 반전으로 확정됐다. 숫자가 79.5가 아니어도 본사 `홈` 화면에 보이는 마진율을 `100% - 현재 표시값`으로 반전 표시한다.

### 0.3 우선 막아야 할 취약점

| 위험 | 설명 | 막는 방법 |
|---|---|---|
| 민감값이 JSON 응답에 남는 문제 | UI에서 숨겨도 Server Component props, Server Action 반환값, Route Handler JSON에 원가/급여/마진 차이가 남을 수 있다. | 지점장 계정 E2E와 `tests/unit/sensitive-response-shaping.test.mjs`에 필드 부재 검증을 추가한다. |
| 계산식 임의 변경 | `마진율`, `이익률`, `품목 기준 추정 매출`, `실제 매출`이 섞이면 숫자가 맞아 보여도 의미가 틀릴 수 있다. | 계산 필드명에 기준을 붙이고, 기존 앱 값과 장부 셀 값을 같은 fixture에서 나란히 테스트한다. |
| DB migration 과다 통합 | 급여 기준, 품목 분류, 장기 재고 기준을 한 번에 바꾸면 rollback과 원인 추적이 어렵다. | migration이 필요한 WO는 독립 PR로 나누고, 각 PR에 `db:validate`, `db:generate`, seed 영향 확인을 붙인다. |
| 이카운트 원본 훼손 | 자동 등록이나 신규 품목 생성 중 원본 거래처명/품목명/단가를 덮어쓰면 감사와 재처리가 불가능하다. | raw 필드는 불변으로 두고, mapping/override 필드만 변경한다. 감사 로그에 before/after를 남긴다. |
| 탭/링크 회귀 | 본사 장부 상세 탭을 URL과 연결하면서 기존 dashboard query(`date`, `sort`, `filter`)가 사라질 수 있다. | 기존 query 보존 테스트를 추가하고, 탭 변경은 `tab`만 교체한다. |
| 미저장 경고 약화 | 오작동을 줄이려다 실제 변경값 유실 방지가 사라질 수 있다. | dirty 계산과 저장 전 validation을 분리하고, false positive/true positive를 모두 E2E로 검증한다. |
| 알림 기준 하드코딩 | 장기 재고 기준이 30일로만 남으면 생물 3~4일 같은 현장 기준과 맞지 않는다. | 품목군 기준일을 config/master로 관리하고, 기준이 없으면 알림을 “기준 확인 필요”로 낮춘다. |
| 기존 테스트 기대값과 충돌 | 인건비 노출 정책을 바꾸면 현재 테스트의 “급여 합계 노출” 기대가 깨진다. | 정책 변경 테스트를 먼저 고치고, 깨진 테스트가 의도된 변화인지 문서화한다. |
| 확정 항목을 다시 자료 요청하는 문제 | xlsx 컬럼과 월별 손익 조정 항목은 확정됐는데 자료 요청 목록에 다시 남으면 의뢰자와 개발자 모두 혼란스럽다. | 의뢰자 결정이 필요한 자료와 구현 검증용 샘플을 분리한다. |
| 고객 검수 문서 불일치 | 기존 `client-review-checklist-2026-06-27.md`에는 급여 입력, 품목별 이익률, Ecount 상태 문구가 최신 정책과 맞지 않게 남아 있다. | 구현 전 검수 체크리스트를 최신 정책 기준으로 새로 만든다. |

### 0.4 착수 게이트

아래 게이트를 통과하지 못한 작업은 “바로 착수 가능”으로 보지 않는다.

| 게이트 | 적용 WO | 통과 기준 |
|---|---|---|
| G-01 본사 홈 마진율 반전 확인 | WO-14 | 본사 아이디로 `홈` 화면에 접속해 현재 보이는 마진율 컴포넌트를 찾고, 화면에는 `100% - 현재 표시값`으로 반전 표시되는지 테스트한다. |
| G-02 민감정보 서버 차단 | WO-10, WO-11, WO-14 | 지점장 권한으로 받은 응답 객체에 급여액, 원가, 마진, 차이 금액 필드가 없어야 한다. |
| G-03 원본 보존 | WO-08, WO-09, WO-12 | raw 이카운트 값과 `sourceUnitPrice`가 덮어써지지 않는 테스트가 있어야 한다. |
| G-04 migration 분리 | WO-10, WO-13 | schema 변경 범위, migration 이름, seed 영향, rollback 기준이 PR 본문에 있어야 한다. |
| G-05 URL 상태 보존 | WO-02, WO-15 | 필터/탭/정렬 query가 새로고침, 복사 링크, 뒤로가기에서 유지되어야 한다. |
| G-06 감사 로그 | WO-05, WO-08, WO-09, WO-12, WO-15 | 누가/언제/무엇을/왜 바꿨는지 `AuditLog` 또는 `CorrectionRecord`로 확인 가능해야 한다. |
| G-07 전체 셀 반영 검증 | WO-17, WO-14 | `AE4/AE5`, `C5/C17` 외 고객이 보는 주요 셀의 원천, 화면 위치, 반영 여부, 차이, 조치가 표로 정리되어야 한다. |
| G-08 xlsx/API 계약 변경 | WO-15 | 기존 CSV-only API 테스트의 `xlsx 거부` 기대값을 `xlsx 허용` 기준으로 바꾸고, 포맷별 Content-Type과 감사 로그를 검증해야 한다. |
| G-09 월별 손익 기준 확정 | WO-15 | 달력월/영업월, 매출 기준, 원가 기준, 월 마감 후 수정 가능 여부가 작업 전에 명시되어야 한다. |

## 1. 코드 파악 요약

현재 프로젝트는 Next.js App Router 기반 내부 ERP다. 별도 백엔드 서버 없이 서버 컴포넌트, Server Actions, Route Handlers가 백엔드 역할을 한다.

확인한 주요 구조는 아래와 같다.

| 영역 | 현재 코드 위치 | 핵심 내용 |
|---|---|---|
| 라우팅 | `src/app/*` | `/app` 아래 본사와 지점장 화면을 분리한다. |
| 본사 셸/메뉴 | `src/components/headquarters-shell.tsx`, `src/components/app-sidebar.tsx` | 권한에 따라 본사 메뉴를 노출한다. |
| 지점장 셸/메뉴 | `src/components/store-manager-shell.tsx`, `src/components/store-manager-navigation.tsx` | 지점장은 단순 입력 흐름으로 이동한다. |
| 권한 | `src/server/authz.ts` | 본사, 지점장, 권한 액션을 서버에서 확인한다. |
| DB 모델 | `prisma/schema.prisma` | 장부, 매입, 재고, 손실, 인건비, 이카운트, 감사 로그 모델이 있다. |
| 장부 입력 | `src/features/ledger/*` | 매출, 비용, 매입, 근무, 제출, 본사 수정 흐름이 있다. |
| 손실 | `src/features/losses/*` | 손실 수량, 회수액, 계획 판매가 기준 손실 계산 흐름이 있다. |
| 재고 | `src/features/inventory/*` | 전일 재고, 당일 재고, FIFO lot, 재고 조정 흐름이 있다. |
| 이카운트 | `src/features/ledger/ecount-supply-*` | 업로드 preview, alias 매핑, batch commit 흐름이 있다. |
| 리포트 | `src/features/reports/*`, `src/app/app/reports/*` | 일별, 기간 비교, 월간, 재고 리포트와 CSV export가 있다. |
| 변경 이력 | `src/features/audit/*`, `src/server/audit.ts` | 주요 수정 작업에 감사 로그를 남긴다. |
| 테스트 | `tests/unit`, `tests/api`, `tests/e2e` | 계산, API, 본사, 지점장, 이카운트 E2E 테스트가 있다. |

중요한 기존 패턴은 유지해야 한다.

- 새 저장 기능은 Zod 검증, `ActionResult`, `writeAuditLog`, `revalidatePath` 흐름을 따른다.
- 장부 저장은 `version`, `updatedAt` 기반 충돌 처리를 유지한다.
- 권한은 화면 표시만이 아니라 Server Action과 Route Handler에서 다시 확인한다.
- 지점장 응답에는 급여액, 원가, 마진, 민감한 차이 금액을 보내지 않는다.
- 이카운트 원본 값은 보존하고, 본사 수정값은 별도 필드와 감사 로그로 남긴다.
- 필터, 탭, 정렬은 가능한 URL query로 표현한다.

## 2. 착수 전 확정 사항

아래 항목은 착수 전 기준이다. 2026-06-28 의뢰자 답변으로 확정된 항목은 그대로 구현 기준으로 쓴다.

| 번호 | 항목 | 상태/기준 | 구현 영향 |
|---:|---|---|---|
| C-01 | 본사 홈 마진율 표시 | 확정. 본사 아이디의 `홈` 화면에서 보이는 마진율을 `100% - 현재 표시값`으로 반전 표시한다. 숫자가 79.5가 아니어도 같은 규칙을 쓴다. | 본사 홈, 리포트, 이상 신호 표시 |
| C-02 | 홈 매출/마진 라벨 | 확정. 가장 쉬운 말로 `장부 매출`, `장부 이익률`, `분석 매출`, `분석 이익률`을 기본값으로 쓴다. | 본사 홈 카드와 리포트 라벨 |
| C-03 | 품목 냉동/활어 기준표 | 대기. 의뢰자가 나중에 제공한다. 문서 안의 `냉동/생물` 표현은 같은 미확정 분류를 가리키며, 최종 화면 용어는 기준표 수령 시 확정한다. | 품목 master, 이카운트 매핑, 리포트 |
| C-04 | 장기 재고 기준일 | 확정. 본사 왼쪽 네비게이션에 `장기재고 기준일` 관리 항목을 추가한다. | 재고 이상 알림, LINE summary, 본사 기준 관리 |
| C-05 | 파일럿 범위 | 일부 확정. 월별 손익, 품목 검토, 매출 검토, 차트 화면을 포함한다. | 테스트 우선순위와 배포 범위 |
| C-06 | 회사명/사업자명 | 확정. 법적 사업자명은 `도원에스디`다. 별도 화면 브랜드명이 없으면 화면 표시명도 `도원에스디`를 쓴다. | 로그인, 사이드바, 메타데이터, 출력물 |
| C-07 | 급여/인건비 정책 | 확정. 본사만 보고 등록/수정한다. 매장관리자는 근무자를 선택만 한다. | 응답 shaping, UI 숨김, 테스트 |
| C-08 | 재고/단가 수정 권한 | 확정. 본사만 수정한다. Ecount 원본 단가는 보존한다. | 본사 재고 조정, 적용 단가 보정 |
| C-09 | 전일재고 노출 | 확정. 매장관리자는 항목, 수량, FIFO 세부만 본다. 금액/단가/원가/마진은 제외한다. | 전일재고 modal/drawer, 지점장 DTO |
| C-10 | 알림 채널 | 확정. LINE만 사용한다. | 장기 재고 알림, morning summary |
| C-11 | 이카운트 자동 등록 | 확정. `품목묭도`와 `모두 적용` 모호 항목은 삭제하고, 업로드 시 지점/품목 자동 등록으로 정리한다. | WO-08, WO-09 |
| C-12 | 차트/검토 페이지 | 확정. 품목 검토와 매출 검토 페이지를 분리하고, 차트만 쉽게 보는 화면을 제공한다. | WO-16 |
| C-13 | 엑셀 다운로드 | 확정. xlsx까지 제공한다. `요약`, `기간조회_RAW`, `월별손익`, `재고현황`, `품목매출` 시트로 나눈다. CSV raw export도 필요하면 보조로 둘 수 있다. | CSV/XLSX export 확장 |
| C-14 | 기존 장부 급여액 | 확정. 과거 장부 급여액은 본사용 과거 snapshot으로 보존한다. 새 급여 기준으로 과거분을 자동 재계산하지 않는다. | WO-10, 월별 손익 |
| C-15 | 진수산 재고이상 | 제외. 의뢰자가 직접 분석한다. | 구현 WO와 자료 요청에서 제외 |
| C-16 | 월별 손익 조정 항목 | 확정. 월세, 관리비, 공과금, 세금/수수료, 포장/소모품, 배송/운반, 수선/유지보수, 기타비용, 본사조정, 조정사유, 메모를 둔다. | WO-15 |

## 3. 공통 작업 규칙

1. DB enum 이름은 바꾸지 않는다. 영어 상태값은 그대로 두고 UI 라벨만 한글로 바꾼다.
2. 본사만 보는 값과 지점장이 보는 값을 타입 단계에서 분리한다.
3. 원본 이카운트 단가, 원본 거래처명, 원본 품목명/규격은 수정하지 않는다.
4. 본사 수정은 수정 사유를 필수로 받고 감사 로그에 남긴다.
5. 미저장 경고는 끄지 않는다. 실제 변경 감지만 정확히 고친다.
6. 품목별 매출/마진은 POS 품목별 판매 데이터가 없으므로 화면과 export 모두에서 항상 `추정`으로 표시한다.
7. 냉동/활어 분류는 품목명 문자열 추측으로 확정하지 않는다. 최종 용어와 기준은 master data 기준표로 정한다.
8. 화면 문구는 현장 사용자가 이해하기 쉬운 말로 쓴다.
9. 급여액과 인건비 합계는 본사만 본다. 지점장 응답에는 내려보내지 않는다.
10. 재고 수량과 장부 적용 단가 수정은 본사만 가능하다.
11. 장기 재고와 아침 요약 알림 채널은 LINE만 쓴다.
12. `품목묭도`와 `모두 적용`은 별도 기능으로 만들지 않는다. 이카운트 업로드 자동 등록/자동 매핑 흐름으로 정리한다.

## 4. 작업 우선순위

| 작업 ID | 우선순위 | 작업명 | 착수 조건 |
|---|---|---|---|
| WO-01 | P1 | 이카운트 상태 한글화와 상세 UX 정리 | 바로 착수 가능 |
| WO-02 | P1 | 본사 장부 상세 탭과 손실 위치 이동 | 7단계 탭 요청 위치 확인 후 착수 |
| WO-03 | P1 | 미저장 경고 오작동 수정 | 바로 착수 가능 |
| WO-04 | P1 | 품목별 리포트 제목 변경과 수량 표시 | 바로 착수 가능 |
| WO-05 | P1 | 변경 이력 상세보기 개선 | 바로 착수 가능 |
| WO-06 | P1 | 작성자/수정자 표시 개선 | 바로 착수 가능 |
| WO-07 | P1 | 회사 표시명/사업자명 정리 | C-06 확정 |
| WO-08 | P2 | 이카운트 지점/품목 자동 등록 검증 | C-11 확정. 최신 샘플 필요 |
| WO-09 | P2 | 신규 품목 자동 등록 흐름 정리 | C-03 대기. 임시 분류 정책 필요 |
| WO-10 | P1 | 지점장 인건비 입력/노출 재설계 | C-07 확정. 민감정보 차단 우선 |
| WO-11 | P2 | 전날 재고 보기 버튼 | 바로 착수 가능 |
| WO-12 | P2 | 본사 재고 수량/적용 단가 수정 정책 | C-08 확정 |
| WO-13 | P2 | 본사 장기재고 기준일 관리와 LINE 장기 재고 알림 | C-04, C-10 확정. C-03 자료 대기 |
| WO-14 | P3 | 본사 홈 이중 매출/마진 표시 | C-01, C-02 확정. WO-17 완료 후 착수 |
| WO-15 | P3 | 기간조회/월간/xlsx 다운로드 확장 | C-05, C-13 확정. G-09 기준 확정 후 착수 |
| WO-16 | P3 | 품목 검토/매출 검토 차트 페이지 | C-12 확정 |
| WO-17 | P1 | 전체 셀 반영 검증표 작성 | WO-14 선행. 원본 장부와 현재 앱 화면 확인 |
| WO-18 | P1 | 비용 항목명과 기타 메모 정리 | P1-10 반영. 본사 관리 항목 기준 |
| WO-19 | P1 | 고객 검수 체크리스트 최신화 | 기존 체크리스트를 그대로 쓰지 않음 |

WO-17~WO-19는 기존 WO 번호를 보존하기 위해 뒤 번호로 추가했다. 상세 지시는 읽기 흐름에 맞춰 관련 WO 근처에 배치한다.

## 5. 상세 작업지시

### WO-01. 이카운트 상태 한글화와 상세 UX 정리

**목표**
이카운트 업로드 상세 화면에서 배치와 라인 상태가 모두 한글로 보이게 한다. 이미 매핑된 항목은 사용자가 영어 상태값을 보지 않고 바로 처리 흐름을 이해해야 한다.

**현재 코드**

- 배치 상태 라벨은 `src/features/ledger/ecount-supply-mapping.ts`에 있다.
- 상세 조회는 `src/features/ledger/ecount-supply-queries.ts`가 담당한다.
- 상세 UI는 `src/features/ledger/components/ecount-supply-detail-client.tsx`가 담당한다.
- 현재 라인별 상태는 일부 화면에서 raw enum으로 표시될 수 있다.

**수정 지시**

1. `EcountLineStatus`용 한글 라벨 함수를 추가한다.
2. `EcountImportLineDetail` 타입에 `statusLabel`을 추가한다.
3. 상세 테이블은 `line.status` 대신 `line.statusLabel`을 표시한다.
4. `READY` 라벨은 `commit 가능`보다 `반영 가능`처럼 현장 친화적인 말로 바꾼다.
5. `COMMITTED` 라벨은 `반영됨`으로 통일한다.
6. 배치와 라인의 색상 규칙은 기존 badge variant 흐름을 유지한다.

**대상 파일**

- `src/features/ledger/ecount-supply-mapping.ts`
- `src/features/ledger/ecount-supply-queries.ts`
- `src/features/ledger/components/ecount-supply-detail-client.tsx`
- `tests/unit/ecount-supply-import.test.mjs`
- `tests/unit/ecount-supply-remediation.test.mjs`
- `tests/e2e/ecount-supply-imports.spec.ts`

**완료 조건**

- 이카운트 상세 화면에서 `COMMITTED`, `READY`, `MAPPING_REQUIRED` 같은 영어가 보이지 않는다.
- 배치 목록과 상세 화면의 라벨이 서로 다르지 않다.
- DB enum과 Prisma schema는 변경하지 않는다.

**검증**

```bash
pnpm test:unit:file tests/unit/ecount-supply-import.test.mjs tests/unit/ecount-supply-remediation.test.mjs
pnpm test:playwright tests/e2e/ecount-supply-imports.spec.ts
```

### WO-02. 본사 장부 상세 탭과 손실 위치 이동

**목표**
본사에서 지점 장부를 볼 때 손실, 재고, 매입 등 원하는 위치로 바로 이동하게 한다. 손실 카드나 손실 행을 눌렀을 때 장부 상세의 손실 탭으로 이동해야 한다.

**착수 전 확인**

6/27 요청의 “본사가 매장관리자 화면을 볼 때 상단 7단계 탭 미작동”은 구현 위치가 두 가지로 갈릴 수 있다. 먼저 실제 재현 URL을 확인한다.

- 본사 장부 상세(`/app/ledgers/[ledgerId]`)의 탭 문제라면 이 WO의 `?tab=` 연결을 구현한다.
- 본사가 지점장 입력용 `/app/store-entry/*`로 들어갔을 때의 7단계 내비게이션 문제라면 `store-entry-step-navigation.tsx`와 권한/라우팅 흐름을 먼저 고친다.
- 본사 사용자를 지점장 입력 페이지로 보내는 우회는 만들지 않는다.

**현재 코드**

- 지점장 7단계 흐름은 `src/features/ledger/components/store-entry-step-navigation.tsx`에 있다.
- 본사 장부 상세는 `src/app/app/ledgers/[ledgerId]/page.tsx`에 있다.
- 본사 상세는 현재 탭이 있으나 URL과 탭 클릭 흐름이 강하게 연결되어 있지 않다.
- 본사 대시보드 테이블 링크는 `src/features/dashboard/components/hq-dashboard-table.tsx`에 있다.

**수정 지시**

1. 본사 장부 상세 탭을 URL query `?tab=sales|expenses|purchases|inventory|losses|work|review`와 연결한다.
2. 탭 클릭 시 URL이 바뀌고 새로고침해도 같은 탭이 열린다.
3. 대시보드의 손실 카드 또는 손실 관련 링크는 `/app/ledgers/[ledgerId]?tab=losses`로 이동한다.
4. 본사에서 지점장 입력용 `/app/store-entry/*`로 보내지 않는다. 본사는 본사 상세 화면 안에서 봐야 한다.
5. `review` 탭을 추가할지, 기존 상단 요약으로 유지할지는 구현 전 화면 구조를 작게 결정한다.
6. 착수 전 확인에서 재현된 경로와 구현 경로를 PR 설명에 남긴다.

**대상 파일**

- `src/app/app/ledgers/[ledgerId]/page.tsx`
- `src/features/dashboard/components/hq-dashboard-table.tsx`
- `src/features/ledger/components/store-entry-step-navigation.tsx`
- `tests/e2e/hq-dashboard.spec.ts`
- `tests/e2e/hq-ledger-edit.spec.ts`

**완료 조건**

- 본사 대시보드에서 손실이 있는 장부를 클릭하면 손실 탭이 열린다.
- 탭 URL을 복사해 다시 열어도 같은 탭이 열린다.
- 7단계 탭 미작동 요청의 실제 재현 경로가 문서화되어 있고, 해당 경로에서 회귀 테스트가 있다.
- 지점장 권한 정책은 변하지 않는다.

**검증**

```bash
pnpm test:e2e:core:hq
```

### WO-03. 미저장 경고 오작동 수정

**목표**
값을 바꾸지 않았는데도 이동 경고가 뜨는 문제를 줄인다. 단, 실제로 입력한 값이 사라지는 위험은 막아야 한다.

**현재 코드**

- 공통 hook은 `src/features/ledger/components/use-unsaved-step-guard.ts`다.
- 단계별 dirty 계산은 각 client component에 흩어져 있다.
- 재고 단계는 필수 수량 빈칸을 dirty처럼 다룬다.

**수정 지시**

1. 각 단계의 초기값과 현재값 비교 함수를 확인한다.
2. 서버에서 받은 기본값과 화면에서 자동 보정한 빈 줄 때문에 dirty가 되지 않게 한다.
3. 재고 단계의 `hasUnenteredRequiredQuantity`는 미저장 경고와 저장 전 validation을 분리한다.
4. 경고 dialog와 browser beforeunload는 실제 변경이 있을 때만 작동하게 한다.
5. 저장 성공 후 dirty 기준값이 새 값으로 갱신되는지 확인한다.

**대상 파일**

- `src/features/ledger/components/use-unsaved-step-guard.ts`
- `src/features/ledger/components/sales-payment-step-client.tsx`
- `src/features/ledger/components/expense-step-client.tsx`
- `src/features/ledger/components/purchase-step-client.tsx`
- `src/features/losses/components/loss-step-client.tsx`
- `src/features/inventory/components/inventory-step-client.tsx`
- `src/features/ledger/components/workstep-client.tsx`
- `tests/e2e/store-ledger-sales.spec.ts`
- `tests/e2e/store-ledger-purchase.spec.ts`
- `tests/e2e/store-ledger-inventory.spec.ts`
- `tests/e2e/store-ledger-losses.spec.ts`

**완료 조건**

- 화면 진입 후 아무 값도 바꾸지 않고 이동하면 경고가 뜨지 않는다.
- 값을 바꾸고 저장하지 않은 상태로 이동하면 경고가 뜬다.
- 필수 재고 수량 미입력은 저장 시 validation으로 안내된다.

**검증**

```bash
pnpm test:e2e:core:ledger
```

### WO-04. 품목별 리포트 제목 변경과 수량 표시

**목표**
`품목별 이익률 (추정)` 표현을 의뢰자 표현에 맞게 `품목별 판매 현황 (추정)` 또는 `품목별 매출 (추정)`으로 바꾸고, 품목별 판매 수량을 같이 보여준다.

**현재 코드**

- 일별 리포트 페이지는 `src/app/app/reports/daily/page.tsx`다.
- 품목별 리포트 UI는 `src/features/reports/components/product-profitability-report.tsx`다.
- 조회 데이터는 `src/features/reports/queries.ts`의 `buildProductProfitability`가 만든다.
- 현재 데이터에는 `soldQuantity`, `estimatedSalesAmount`, `estimatedCogsAmount`, `grossProfitAmount`, `grossMarginRate`가 있다.

**수정 지시**

1. 제목은 `품목별 판매 현황 (추정)`으로 우선 통일한다.
2. 차트만으로 끝내지 말고 표를 추가한다.
3. 표 컬럼은 품목, 규격, 분류, 판매 수량, 추정 매출, 추정 원가, 추정 마진, 상태로 둔다.
4. 판매 수량도 추정임을 문구나 컬럼 설명에 반영한다.
5. 지점장 화면에는 원가와 마진을 노출하지 않는다. 해당 리포트가 본사 전용인지 다시 확인한다.

**대상 파일**

- `src/app/app/reports/daily/page.tsx`
- `src/features/reports/components/product-profitability-report.tsx`
- `src/features/reports/types.ts`
- `src/features/reports/queries.ts`
- `tests/unit/hq-reports.test.mjs`
- `tests/e2e/hq-reports.spec.ts`

**완료 조건**

- 화면 제목에 `이익률`만 강조되지 않는다.
- 품목별 판매 수량이 보인다.
- `추정` 표시는 빠지지 않는다.

**검증**

```bash
pnpm test:unit:file tests/unit/hq-reports.test.mjs
pnpm test:playwright tests/e2e/hq-reports.spec.ts
```

### WO-05. 변경 이력 상세보기 개선

**목표**
본사가 장부나 master data를 수정했을 때 누가, 언제, 무엇을, 왜 바꿨는지 한눈에 보이게 한다. 이력 삭제 기능은 만들지 않는다.

**현재 코드**

- 감사 로그 기록은 `src/server/audit.ts`가 담당한다.
- 변경 이력 조회와 표시 형식은 `src/features/audit/*`에 있다.
- 이력 화면은 `src/app/app/master-data/history/page.tsx`에 있다.
- 본사 장부 수정, 이카운트 매핑, 리포트 export 등 여러 작업에서 감사 로그를 남긴다.

**수정 지시**

1. 변경 필드명을 한글로 보여준다.
2. 변경 전 값과 변경 후 값을 나란히 보여준다.
3. 수정 사유가 있는 작업은 사유를 강조해서 보여준다.
4. 장부 관련 이력은 장부 상세 링크를 제공한다.
5. 작성자는 아이디만이 아니라 표시명 또는 이메일을 함께 보여준다.
6. 삭제 버튼이나 삭제 API는 만들지 않는다.

**대상 파일**

- `src/features/audit/audit-queries.ts`
- `src/features/audit/audit-format.ts`
- `src/features/audit/components/change-history-client.tsx`
- `src/app/app/master-data/history/page.tsx`
- `src/server/audit.ts`
- `tests/unit`의 감사 로그 관련 테스트
- `tests/e2e`의 master-data 또는 hq-ledger 관련 테스트

**완료 조건**

- 이력 상세에서 raw JSON만 보고 해석해야 하는 구간이 줄어든다.
- 변경 전/후/사유/작성자가 함께 보인다.
- 삭제 기능은 없다.

**검증**

```bash
pnpm test:unit
pnpm test:e2e:core:admin
pnpm test:e2e:core:hq
```

### WO-06. 작성자/수정자 표시 개선

**목표**
장부와 이력에서 아이디만 보이는 곳을 줄이고, 사람이 알아볼 수 있는 이름을 보여준다.

**현재 코드**

- 사용자 모델에는 `name`, `email`, `role`이 있다.
- 본사 장부 목록과 상세에서 `lastModifiedBy`, `createdBy` 성격의 값이 쓰인다.
- 일부 화면은 아이디나 내부 문자열만 보일 수 있다.

**수정 지시**

1. 장부 목록, 장부 상세, 변경 이력에서 작성자/수정자 표시 위치를 찾는다.
2. 표시 우선순위는 `name -> email -> id`로 둔다.
3. 최초 작성자와 본사 수정자를 구분한다.
4. 쿼리에서 필요한 사용자 정보를 include하되 지점장에게 불필요한 민감 정보는 보내지 않는다.

**대상 파일**

- `src/features/dashboard/queries.ts`
- `src/features/dashboard/components/hq-dashboard-table.tsx`
- `src/features/ledger/queries.ts`
- `src/features/audit/*`
- 관련 E2E 테스트

**완료 조건**

- 본사 사용자가 이력과 장부에서 누가 작업했는지 사람 이름으로 파악할 수 있다.
- 표시명이 없을 때도 화면이 깨지지 않는다.

**검증**

```bash
pnpm test:e2e:core:hq
```

### WO-07. 회사 표시명/사업자명 정리

**목표**
법적 사업자명은 `도원에스디`로 표시한다. 별도 화면 브랜드명이 없으면 화면 표시명도 `도원에스디`를 쓴다. 내부 프로젝트명 `ERP Fish`는 필요한 곳만 유지한다.

**현재 코드**

- `README.md`, `src/app/layout.tsx`, `src/app/login/page.tsx`, `src/components/app-sidebar.tsx`, `src/components/store-manager-shell.tsx`, `src/server/auth/config.ts`에 `ERP Fish` 문구가 있다.

**수정 지시**

1. 법적 사업자명은 `도원에스디`로 둔다.
2. 화면 표시명도 별도 요청이 없으면 `도원에스디`로 둔다.
3. 하드코딩이 여러 곳에 남지 않도록 작은 상수 파일을 검토한다.
4. 사업자명은 로그인, 문서, 출력물, 메타데이터에서 필요한 곳만 반영한다.
5. README, 테스트명, 내부 프로젝트명까지 무리하게 일괄 치환하지 않는다.

**대상 파일**

- `src/app/layout.tsx`
- `src/app/login/page.tsx`
- `src/components/app-sidebar.tsx`
- `src/components/store-manager-shell.tsx`
- `src/server/auth/config.ts`

**완료 조건**

- 화면에 보이는 이름이 의뢰자 확정명과 일치한다.
- 인증 provider 이름과 메타데이터도 어색하지 않다.

**검증**

```bash
pnpm typecheck
pnpm lint
```

### WO-18. 비용 항목명과 기타 메모 정리

**목표**
비용 입력은 본사가 관리하는 표준 항목 선택을 기본으로 하고, 예외 비용은 `기타 + 메모`로 남긴다. 화면, export, 월별 손익계산서에서 같은 항목명을 쓰게 한다.

**현재 코드**

- 장부 비용 입력은 `src/features/ledger/components/expense-step-client.tsx`와 `src/features/ledger/actions.ts`를 쓴다.
- 비용 항목 master는 `LedgerInputCode` 계열 코드와 연결된다.
- 월별 손익계산서 조정 항목은 WO-15에서 확정된 컬럼을 사용한다.

**수정 지시**

1. 비용 항목 표준명 목록을 본사 관리 항목 기준으로 정리한다.
2. 지점 자유 입력을 늘리지 않고, 예외는 `기타` 항목과 메모로 처리한다.
3. 화면 표시명, export 표시명, 감사 로그 표시명이 같은 기준을 쓰게 한다.
4. 월별 손익 조정 항목의 `기타비용`, `조정사유`, `메모`와 장부 비용 메모의 관계를 명확히 한다.
5. 지점장에게 필요한 비용 입력 항목만 노출하고, 본사 조정값은 지점장 응답에 포함하지 않는다.

**대상 파일**

- `src/features/ledger/components/expense-step-client.tsx`
- `src/features/ledger/schemas.ts`
- `src/features/master-data/*code*`
- `src/features/reports/export.ts`
- `src/features/audit/*`
- `tests/unit/master-data-codes.test.mjs`
- `tests/unit/ledger-cost-labor.test.mjs`

**완료 조건**

- 비용 항목 표시명이 화면, export, 감사 로그에서 일치한다.
- 예외 비용은 `기타 + 메모`로 입력된다.
- 월별 손익 조정 항목과 장부 비용 항목의 연결 기준이 문서화되어 있다.

**검증**

```bash
pnpm test:unit:file tests/unit/master-data-codes.test.mjs tests/unit/ledger-cost-labor.test.mjs
pnpm test:e2e:core:ledger
```

### WO-08. 이카운트 지점/품목 자동 등록 검증

**목표**
이카운트 업로드 시 지점이름과 품목이 자동 등록되고, 다음 업로드에서 자동으로 재사용되게 한다. `품목묭도`와 `모두 적용`은 별도 기능으로 만들지 않는다.

**현재 코드**

- `StoreExternalAlias`, `ProductExternalAlias` 모델이 이미 있다.
- `loadAliasMaps`, `saveEcountStoreAlias`, `saveEcountProductAlias` 흐름이 이미 있다.
- 업로드 preview 후 매핑 상태를 다시 계산하는 흐름도 있다.

**수정 지시**

1. 기존 alias 자동 재사용이 실제 UI에서 충분히 드러나는지 확인한다.
2. 업로드 중 새 지점명 또는 새 품목명이 나오면 자동 등록 후보를 만든다.
3. 자동 등록 후보는 중복 여부, 원본 이름, 표준 이름, 규격을 본사가 확인할 수 있게 한다.
4. alias 저장 후 같은 batch 안의 관련 라인이 즉시 갱신되게 한다.
5. 잘못 자동 등록된 경우 본사가 수정할 수 있어야 한다.
6. 원본 이카운트 값은 절대 덮어쓰지 않는다.

**대상 파일**

- `src/features/ledger/ecount-supply-actions.ts`
- `src/features/ledger/ecount-supply-queries.ts`
- `src/features/ledger/components/ecount-supply-detail-client.tsx`
- `prisma/schema.prisma`
- `tests/unit/ecount-supply-remediation.test.mjs`
- `tests/e2e/ecount-supply-imports.spec.ts`

**완료 조건**

- 이카운트 업로드 후 지점명과 품목명이 자동 등록 또는 자동 매핑된다.
- 미확인 항목은 본사 확인 대상으로 남고, 다음 업로드에서 같은 원본 키가 자동 매핑된다.
- `품목묭도`, `모두 적용`이라는 별도 UI/요구는 남기지 않는다.

**검증**

```bash
pnpm test:unit:file tests/unit/ecount-supply-remediation.test.mjs
pnpm test:playwright tests/e2e/ecount-supply-imports.spec.ts
```

### WO-09. 신규 품목 자동 등록 흐름 정리

**목표**
이카운트 업로드 중 ERP에 없는 품목이 나오면 자동 등록 후보로 만들고, 본사가 확인한 뒤 품목 master에 추가하고 그 라인을 매핑한다.

**현재 코드**

- `createEcountProductFromLine` 흐름이 있다.
- `Product` 모델은 `name`, `category`, `spec`, `defaultUnitPrice`, `isActive`를 가진다.
- 현재 냉동/생물 분류는 일부 parser에서 품목명 추측을 사용한다.

**수정 지시**

1. 신규 품목 자동 등록 시 기본 분류를 문자열 추측으로 확정하지 않는다.
2. C-03 기준표가 없으면 본사가 분류를 직접 선택하게 한다.
3. 생성 후 `ProductExternalAlias`를 함께 저장한다.
4. 대표 품목과 세부 규격을 모두 볼 수 있게 표시한다.
5. 중복 품목 생성 방지를 위해 `name/category/spec` unique 정책을 유지한다.

**대상 파일**

- `src/features/ledger/ecount-supply-actions.ts`
- `src/features/ledger/ecount-supply-import.ts`
- `src/features/master-data/*product*`
- `prisma/schema.prisma`
- 관련 unit/E2E 테스트

**완료 조건**

- 신규 품목은 자동 등록 후보로 잡히되, 본사 확인 없이 조용히 잘못 분류되지 않는다.
- 생성된 품목은 다음 업로드에서 자동 매핑된다.

**검증**

```bash
pnpm db:validate
pnpm test:e2e:core:admin
pnpm test:playwright tests/e2e/ecount-supply-imports.spec.ts
```

### WO-10. 지점장 인건비 입력/노출 재설계

**목표**
지점장은 급여액이나 인건비 합계를 보거나 입력하지 않는다. 본사가 직원과 급여 기준을 관리하고, 지점장은 근무자만 선택한다.

**현재 코드**

- 직원 master는 `src/features/labor/*`에 있다.
- 지점장 근무 단계는 `src/features/ledger/components/workstep-client.tsx`다.
- `LedgerLaborItem`에는 현재 금액이 저장된다.
- `Employee` 모델에는 급여 기준 필드가 없다.

**수정 지시**

1. 본사용 급여 기준 master를 설계한다.
2. 지점장 UI에서 급여 금액 입력과 합계를 숨긴다.
3. 지점장은 직원 또는 근무자 선택만 한다.
4. 본사 화면에서 급여 계산과 인건비 집계를 처리한다.
5. 지점장 Server Action schema는 `amount` 입력을 받으면 무시하지 말고 거부한다.
6. 지점장 API 응답과 Server Component props에 급여액, 개인별 급여액, 인건비 합계가 포함되지 않게 한다.
7. 기존 `LedgerLaborItem.amount`는 과거 장부의 본사용 급여 snapshot으로 보존한다.
8. 과거 장부 급여액은 새 급여 기준으로 자동 재계산하지 않는다.
9. 새 장부는 본사 급여 기준에서 산출한 snapshot을 저장하는 방향으로 설계한다.
10. 기존 테스트 중 지점장 급여 노출을 기대하는 항목은 정책 변경으로 수정한다.

**대상 파일**

- `prisma/schema.prisma`
- `src/features/labor/*`
- `src/features/ledger/components/workstep-client.tsx`
- `src/features/ledger/actions.ts`
- `src/features/ledger/schemas.ts`
- `src/features/ledger/response-shaping.ts`
- `src/server/sensitive-fields.ts`
- `tests/unit/ledger-cost-labor.test.mjs`
- `tests/unit/sensitive-response-shaping.test.mjs`
- `tests/e2e/store-ledger-review.spec.ts`
- `tests/e2e/hq-reports.spec.ts`

**완료 조건**

- 지점장 계정으로 급여액과 인건비 총액이 보이지 않는다.
- 본사는 급여 기준과 집계 금액을 볼 수 있다.
- 조작된 요청에 `amount`가 들어와도 지점장 Server Action에서 거부된다.
- 권한 우회로도 지점장 응답과 props에 급여액이 내려가지 않는다.
- 과거 장부 급여액은 본사 화면에서만 기존 값 그대로 확인할 수 있다.

**검증**

```bash
pnpm db:validate
pnpm typecheck
pnpm test:unit:file tests/unit/sensitive-response-shaping.test.mjs
pnpm test:e2e:core:ledger
pnpm test:e2e:core:hq
```

### WO-11. 전날 재고 보기 버튼

**목표**
지점장이 당일 입력 중 전날 재고를 참고할 수 있게 한다. 단, 전날 장부 수정은 허용하지 않는다.

**현재 코드**

- 재고 단계는 `src/features/inventory/components/inventory-step-client.tsx`다.
- 전일 수량과 carryover detail은 이미 계산되어 일부 행에서 볼 수 있다.
- 지점장 입력 페이지는 `/app/store-entry/inventory`다.

**수정 지시**

1. 재고 화면 상단에 `전날 재고 보기` 버튼을 추가한다.
2. modal 또는 drawer에 품목명, 규격, 수량, FIFO 기준일/lot 식별 정보만 보여준다.
3. 금액, 단가, 원가, 마진, FIFO 금액은 보여주지 않는다.
4. 데이터는 현재 선택 지점과 날짜 기준 전날 장부에서 읽는다.
5. 전날 장부 수정 링크는 제공하지 않는다.

**대상 파일**

- `src/app/app/store-entry/inventory/page.tsx`
- `src/features/inventory/queries.ts`
- `src/features/inventory/components/inventory-step-client.tsx`
- `src/server/sensitive-fields.ts`
- `tests/e2e/store-ledger-inventory.spec.ts`

**완료 조건**

- 지점장은 품목명과 수량만 볼 수 있다.
- 전날 장부를 수정할 수 없다.
- 본사 민감값이 지점장 응답에 포함되지 않는다.

**검증**

```bash
pnpm test:e2e:core:ledger
```

### WO-12. 본사 재고 수량/적용 단가 수정 정책

**목표**
본사는 재고 수량과 장부 적용 단가를 수정할 수 있어야 한다. 원본 이카운트 값은 보존한다.

**현재 코드**

- `LedgerPurchaseItem`에는 `sourceUnitPrice`, `unitPrice`, `unitPriceOverrideReason`, `unitPriceUpdatedById`, `unitPriceUpdatedAt`이 있다.
- `LedgerInventoryAdjustment` 모델이 있다.
- 본사 장부 수정 액션은 `src/features/ledger/hq-edit-actions.ts`에 있다.
- 재고/FIFO 갱신은 `src/features/inventory/fifo-lots.ts`를 쓴다.

**수정 지시**

1. 본사 수정 UI에서 원본 단가와 적용 단가를 구분해서 표시한다.
2. 적용 단가 수정 시 사유를 필수로 받는다.
3. 적용 단가는 본사만 수정한다. 지점장이 수정 요청을 보내면 서버에서 거부한다.
4. 재고 수량 수정은 adjustment로 남긴다.
5. 수정 후 리포트와 FIFO 계산이 흔들리지 않게 갱신 순서를 정한다.
6. 원본 ECOUNT 단가는 절대 덮어쓰지 않는다.

**대상 파일**

- `src/features/ledger/hq-edit-actions.ts`
- `src/features/ledger/components/purchase-step-client.tsx`
- `src/features/inventory/actions.ts`
- `src/features/inventory/fifo-lots.ts`
- `src/server/audit.ts`
- `tests/unit/hq-ledger-edit.test.mjs`
- `tests/e2e/hq-ledger-edit.spec.ts`

**완료 조건**

- 본사는 적용 단가를 사유와 함께 수정할 수 있다.
- 지점장은 적용 단가를 수정할 수 없다.
- 원본 이카운트 단가는 화면과 DB에 보존된다.
- 변경 이력에 전/후 값과 사유가 남는다.

**검증**

```bash
pnpm test:unit
pnpm test:e2e:core:hq
```

### WO-13. 본사 장기재고 기준일 관리와 LINE 장기 재고 알림

**목표**
본사 왼쪽 네비게이션에 `장기재고 기준일` 관리 항목을 추가한다. 본사는 품목군 또는 품목별로 며칠 이상 남으면 장기재고인지 관리하고, 오래 남은 재고를 본사와 지점장 모두 알 수 있게 한다. 알림 채널은 LINE만 사용한다.

**현재 코드**

- `Product.category` 문자열이 있다.
- 이카운트 parser에는 품목명 기반 냉동 추측 로직이 있다.
- FIFO lot에는 `sourceBusinessDate`가 있어 장기 재고 판단에 쓸 수 있다.
- 알림 route는 `src/app/api/internal/notifications/morning-summary/route.ts`에 있다.

**수정 지시**

1. 본사 왼쪽 네비게이션에 `장기재고 기준일` 메뉴를 추가한다.
2. 본사 관리 화면에서 기본 기준일을 등록/수정할 수 있게 한다.
3. 가능하면 품목군 기준일과 품목별 예외 기준일을 나눠 관리한다.
4. C-03 냉동/활어 기준표가 오기 전에는 `기준 미정` 품목을 따로 표시한다.
5. 이카운트 parser의 문자열 추측은 fallback 또는 제거 대상으로 둔다.
6. FIFO lot 기준으로 남은 수량과 입고일을 계산한다.
7. 관리 화면의 기준일을 넘은 재고를 장기 재고로 표시한다.
8. 지점장은 품목명, 수량, 경과일만 본다.
9. 본사는 지점, 품목, 수량, 경과일, 원가 영향, 적용 기준일을 볼 수 있다.
10. 외부 알림은 LINE만 구현한다. Telegram, 카카오톡, 이메일은 이번 범위에서 제외한다.

**대상 파일**

- `prisma/schema.prisma`
- `src/components/app-sidebar.tsx`
- `src/features/master-data/*product*`
- `src/features/ledger/ecount-supply-import.ts`
- `src/features/inventory/fifo-lots.ts`
- `src/features/reports/inventory-position-queries.ts`
- `src/features/dashboard/*`
- `src/app/api/internal/notifications/morning-summary/route.ts`
- `tests/unit`
- `tests/e2e/anomaly-thresholds.spec.ts`
- `tests/e2e/hq-reports.spec.ts`

**완료 조건**

- 냉동/생물 분류가 품목명 추측에만 의존하지 않는다.
- 본사 왼쪽 네비게이션에서 `장기재고 기준일` 관리 화면으로 이동할 수 있다.
- 본사가 기준일을 등록/수정하면 장기 재고 판단에 반영된다.
- 장기 재고는 지점장과 본사 모두에게 보이되, 노출 정보 수준은 다르다.
- 기준일은 코드 하드코딩이 아니라 설정 또는 master 기준으로 관리된다.
- 장기 재고와 아침 요약 알림은 LINE으로만 발송된다.

**검증**

```bash
pnpm db:validate
pnpm typecheck
pnpm test:unit
pnpm test:e2e:core:hq
```

### WO-17. 전체 셀 반영 검증표 작성

**목표**
고객이 제공한 장부의 주요 셀이 앱 화면과 계산에 어떻게 반영되는지 표로 확인한다. 이 작업은 새 계산을 구현하는 작업이 아니라, WO-14 전에 누락과 차이를 드러내는 검증 작업이다.

**현재 기준**

- `AE4`: 분석 매출, `AI36+AI63+AI76`
- `AE5`: 분석 이익률, `(AE4-(AG36+AG63+AG76))/AE4`
- `C5`: 장부 매출, `C22+C23+C24+C36`
- `C17`: 장부 이익률, `C15/C5`
- 위 네 셀의 의미는 확인 완료다. `AE4` 의미 확인을 다시 막힌 항목으로 되돌리지 않는다.

**수정 지시**

1. 원본 장부 `26` 시트에서 고객이 보는 주요 셀 목록을 만든다.
2. 각 셀마다 의미, 수식, 원천 데이터, 현재 앱 화면 위치, 현재 값, 기대 값, 차이, 조치를 표로 정리한다.
3. `AE4/AE5`, `C5/C17`은 이미 확인된 기준값으로 표에 포함한다.
4. 앱에 반영하지 않을 셀은 제외 사유를 남긴다.
5. WO-14는 이 표에서 본사 홈 관련 셀의 반영 범위가 정리된 뒤 착수한다.

**산출물**

- `docs/meeting_0627/ledger-cell-mapping-review-2026-06-28.md` 또는 같은 목적의 최신 문서

**완료 조건**

- 주요 셀별 반영 여부와 남은 조치가 표로 정리되어 있다.
- 본사 홈에 필요한 셀과 월별/리포트에 필요한 셀이 구분되어 있다.
- 미반영 셀은 의도적 제외인지, 구현 누락인지 판단되어 있다.

**검증**

```bash
pnpm test:unit:file tests/unit/ledger-review.test.mjs tests/unit/hq-dashboard.test.mjs
```

### WO-14. 본사 홈 이중 매출/마진 표시

**목표**
본사 홈에서 왼쪽 요약 기준 `C5/C17`과 오른쪽 관리자모드 매출 분석 기준 `AE4/AE5`를 나란히 보여주고, 두 기준의 매출/이익률 차이를 본사가 확인하게 한다. 화면 라벨은 쉬운 말로 `장부 매출`, `장부 이익률`, `분석 매출`, `분석 이익률`을 기본값으로 쓴다.

**착수 조건**
C-01, C-02는 확정됐다. WO-17의 셀 반영 검증표에서 본사 홈 관련 범위가 정리된 뒤 착수한다. `AE4/AE5`, `C5/C17`의 셀 의미는 확인됐으므로 다시 묻지 않는다. 본사 아이디의 `홈` 화면에서 보이는 마진율은 숫자가 79.5가 아니어도 `100% - 현재 표시값`으로 반전 표시한다. 예를 들어 홈에서 80%로 보이면 실제 표시값은 20%여야 한다.

**확인된 장부 기준**

- 원본 파일: `docs/reference_from_customer/장부-202605현대 (1).xlsx`
- 시트: `26`
- `AE4`: 오른쪽 `관리자모드 - 매출 분석` 영역의 매출, 값 `3,514,811`, 수식 `AI36+AI63+AI76`
- `AE5`: 같은 영역의 이익률, 값 약 `28.84%`, 수식 `(AE4-(AG36+AG63+AG76))/AE4`
- `C5`: 왼쪽 요약 기준 매출, 값 `3,491,000`, 수식 `C22+C23+C24+C36`
- `C17`: 왼쪽 요약 기준 이익률, 값 약 `28.35%`, 수식 `C15/C5`

**현재 코드**

- 본사 대시보드 조회는 `src/features/dashboard/queries.ts`다.
- 대시보드 테이블은 `src/features/dashboard/components/hq-dashboard-table.tsx`다.
- 상세 카드 일부는 `src/app/app/ledgers/[ledgerId]/page.tsx`에 있다.
- 계산은 `src/server/calculations/ledger.ts`를 사용한다.
- 리포트 쪽에는 추정 품목 매출 계산이 이미 있다.

**수정 지시**

1. 본사 아이디로 `홈` 화면에 접속했을 때 보이는 마진율 표시 컴포넌트를 찾는다.
2. 해당 컴포넌트가 받는 현재 표시값을 확인한다.
3. 본사 홈 화면에는 `100% - 현재 표시값` 방식으로 반전 표시한다.
4. 예: 현재 표시값이 80%면 홈에는 20%로 보여야 한다.
5. `C5/C17` 기준과 `AE4/AE5` 기준을 별도 필드로 모델링한다. 예: `장부 매출`, `장부 이익률`, `분석 매출`, `분석 이익률`.
6. `AE4`는 더 이상 의미 미확정 셀이 아니므로 작업 중 막힌 항목으로 분류하지 않는다.
7. 두 기준의 차이 금액과 차이율을 본사 전용으로 표시한다.
8. 지점장 화면과 지점장 응답에는 차이 금액, 원가, 마진을 보내지 않는다.
9. 반전 표시는 저장값, 리포트 계산값, 이상 신호 계산값을 덮어쓰지 않는 display 필드로만 처리한다.
10. 기존 이상 신호와 마감 preflight에 영향이 있으면 테스트를 추가한다.

**대상 파일**

- `src/server/calculations/ledger.ts`
- `src/features/dashboard/queries.ts`
- `src/features/dashboard/types.ts`
- `src/features/dashboard/components/hq-dashboard-table.tsx`
- `src/app/app/dashboard/page.tsx`
- `src/features/reports/queries.ts`
- `src/server/sensitive-fields.ts`
- `tests/unit/hq-reports.test.mjs`
- `tests/e2e/hq-dashboard.spec.ts`
- `tests/e2e/hq-reports.spec.ts`

**완료 조건**

- 본사 홈에서 `C5/C17` 기준과 `AE4/AE5` 기준의 매출/이익률이 구분되어 보인다.
- `AE4` 값과 의미가 확인 완료 기준으로 문서와 코드 주석/테스트 설명에 반영된다.
- 본사 홈의 마진율이 `100% - 현재 표시값`으로 반전 표시되는 것을 테스트로 설명한다.
- 리포트와 이상 신호의 원 계산값은 반전 표시 때문에 바뀌지 않는다.
- 지점장에게 민감값이 보이지 않는다.

**검증**

```bash
pnpm test:unit:file tests/unit/hq-reports.test.mjs
pnpm test:e2e:core:hq
```

### WO-15. 기간조회/월별 손익계산서/xlsx 다운로드 확장

**목표**
기간별, 월별, 지점별, 품목별 조회를 강화하고 xlsx 다운로드를 제공한다. 월별 손익계산서는 범위에 포함한다.

**착수 전 확정 기준**

아래 기준은 구현 전에 PR 설명 또는 별도 짧은 설계 메모에 먼저 고정한다.

- 월별 기준: 달력 월인지 영업일 기준 월인지
- 매출 기준: 장부 매출, 분석 매출, POS 실제 매출 중 무엇을 월별 손익의 기본값으로 쓸지
- 원가 기준: FIFO 원가인지 평균 단가인지
- 인건비 기준: 본사 급여 기준에서 산출한 snapshot인지, 과거 장부 snapshot인지
- 월 마감 후 수정 가능 여부와 수정 시 감사 로그 기준

**월별 손익계산서를 쉽게 설명하면**

월별 손익계산서는 한 달 동안 지점이 얼마나 벌고, 얼마나 쓰고, 얼마가 남았는지 보는 표다.

- `매출`: 한 달 동안 판 금액
- `매입 원가`: 팔기 위해 사온 물건값
- `인건비`: 직원 급여와 근무 비용
- `고정비`: 월세, 관리비처럼 매달 나가는 돈
- `기타 비용`: 그 밖에 본사가 직접 넣는 비용
- `남은 금액`: 매출에서 위 비용을 뺀 금액

본사는 이 표를 보고 지점별로 돈이 남는지, 어디에서 비용이 많이 나가는지 확인한다.

**현재 코드**

- 기간 비교 페이지는 `src/app/app/reports/comparison/page.tsx`다.
- 월간 페이지는 `src/app/app/reports/monthly/page.tsx`다.
- 재고 리포트는 `src/app/app/reports/inventory/page.tsx`다.
- export route는 `src/app/api/reports/export/route.ts`다.
- CSV 생성은 `src/features/reports/export.ts`가 담당한다.

**수정 지시**

1. xlsx 다운로드를 구현한다.
2. CSV raw export는 필요하면 보조 기능으로 둔다.
3. xlsx는 `요약`, `기간조회_RAW`, `월별손익`, `재고현황`, `품목매출` 시트로 나눈다.
4. 아래 확정 컬럼을 기준으로 구현한다.
5. 월간 손익계산서는 구현 범위에 포함한다.
6. 월간 손익계산서는 `매출 - 매입 원가 - 인건비 - 고정비 - 기타 비용 = 남은 금액` 구조로 쉽게 보여준다.
7. 월간 손익계산서의 매출, 원가, 인건비, 고정비, 기타 비용, 본사 조정값을 구분해서 표시한다.
8. export API의 `format=xlsx`를 허용하고, 기존 `xlsx 거부` 테스트는 새 정책에 맞게 수정한다.
9. 포맷별 파일명, Content-Type, 감사 로그의 `format` 값이 서로 맞는지 검증한다.

**xlsx 시트와 컬럼**

| 시트 | 컬럼 |
|---|---|
| `요약` | 조회 시작일, 조회 종료일, 지점, 총매출, 총매입원가, 매출이익, 이익률, 총인건비, 총고정비, 총기타비용, 본사조정합계, 남은금액, 장기재고건수, 손실금액, 다운로드일시 |
| `기간조회_RAW` | 기준일, 지점, 장부ID, 장부상태, 품목명, 규격, 품목구분, 냉동/활어, 수량, 단위, 매출, 추정매출, 매입원가, 매출이익, 이익률, 손실수량, 손실금액, 재고수량, 장기재고여부, 경과일, 작성자, 수정자 |
| `월별손익` | 기준월, 지점, 매출, 매입원가, 매출이익, 이익률, 인건비, 월세, 관리비, 공과금, 세금/수수료, 포장/소모품, 배송/운반, 수선/유지보수, 기타비용, 본사조정, 남은금액, 조정사유, 메모 |
| `재고현황` | 기준일, 지점, 품목명, 규격, 품목구분, 냉동/활어, 재고수량, 단위, 입고기준일, 경과일, 장기재고기준일, 장기재고여부, 원본이카운트단가, 장부적용단가, 재고금액, 메모 |
| `품목매출` | 조회 시작일, 조회 종료일, 지점, 품목명, 규격, 품목구분, 냉동/활어, 추정판매수량, 추정매출, 추정매입원가, 추정매출이익, 추정이익률, 손실수량, 손실금액, 재고수량 |

**월별 손익 조정 항목**

월별 손익계산서에서 본사가 직접 조정하거나 입력할 항목은 아래로 확정한다.

- 월세
- 관리비
- 공과금
- 세금/수수료
- 포장/소모품
- 배송/운반
- 수선/유지보수
- 기타비용
- 본사조정
- 조정사유
- 메모

**대상 파일**

- `src/app/app/reports/comparison/page.tsx`
- `src/app/app/reports/monthly/page.tsx`
- `src/app/app/reports/inventory/page.tsx`
- `src/app/api/reports/export/route.ts`
- `src/features/reports/queries.ts`
- `src/features/reports/export.ts`
- `tests/api/report-export.spec.ts`
- `tests/e2e/hq-reports.spec.ts`

**완료 조건**

- 본사가 기간과 지점을 바꿔 조회할 수 있다.
- 본사가 월별 손익계산서를 보고 조정 대상 항목을 확인할 수 있다.
- xlsx 다운로드 파일은 위 확정 시트와 컬럼을 담는다.
- 기존 CSV 다운로드는 필요한 경우 보조 기능으로 유지된다.
- 품목별 sheet 값은 POS 실제 판매 데이터가 아니므로 `추정` 표현을 유지한다.
- export 실행은 감사 로그에 남는다.

**검증**

```bash
pnpm test:e2e:core:hq
pnpm test:api
```

### WO-16. 품목 검토/매출 검토 차트 페이지

**목표**
본사가 품목 상태와 매출 상태를 빠르게 볼 수 있게 `품목 검토`와 `매출 검토` 페이지를 분리한다. 차트만 쉽게 보는 화면을 제공하되, 숫자 근거를 확인할 수 있는 표도 함께 둔다.

**현재 코드**

- 품목별 리포트와 기간 리포트는 `src/features/reports/*`에 있다.
- 본사 리포트 route는 `src/app/app/reports/*` 아래에 있다.
- 차트 UI가 있다면 기존 컴포넌트를 우선 재사용한다.

**수정 지시**

1. 본사 전용 `품목 검토` 페이지를 만든다.
2. 본사 전용 `매출 검토` 페이지를 만든다.
3. 각 페이지에는 차트 중심 보기와 표 보기를 둔다.
4. `품목 검토`는 품목명, 규격, 품목 구분, 냉동/생물, 수량, 재고, 장기 재고 여부를 보여준다.
5. `매출 검토`는 기간, 지점, 품목, 추정 수량, 추정 매출, 추정 이익률, 손실을 보여준다.
6. 냉동/생물 기준표가 제공되기 전에는 해당 컬럼을 `기준 미정` 또는 수동 선택값으로 표시한다.
7. 지점장에게는 원가, 마진 차이, 본사 조정값을 보내지 않는다.
8. 차트만 빠르게 보고 싶을 때 쓰는 단순 보기 URL 또는 탭을 제공한다.

**대상 파일**

- `src/app/app/reports/*`
- `src/features/reports/*`
- `src/features/dashboard/*`
- `src/server/sensitive-fields.ts`
- `tests/unit/hq-reports.test.mjs`
- `tests/e2e/hq-reports.spec.ts`

**완료 조건**

- 본사가 품목 검토 페이지에서 품목별 수량, 재고, 장기 재고 상태를 차트로 볼 수 있다.
- 본사가 매출 검토 페이지에서 기간별/지점별/품목별 추정 매출 흐름을 차트로 볼 수 있다.
- 차트 값과 표 값이 같은 data source를 쓴다.
- 품목별 매출과 이익률은 확정값이 아니라 `추정`으로 표시된다.
- 지점장 응답에는 본사 전용 민감값이 포함되지 않는다.

**검증**

```bash
pnpm test:unit:file tests/unit/hq-reports.test.mjs
pnpm test:e2e:core:hq
```

### WO-19. 고객 검수 체크리스트 최신화

**목표**
`docs/meeting/client-review-checklist-2026-06-27.md`를 최신 확정 정책 기준으로 다시 만든다. 기존 체크리스트는 6/27 이후 결정과 맞지 않는 항목이 있으므로 그대로 고객 검수에 쓰지 않는다.

**수정 지시**

1. Ecount 상태 문구는 `반영 가능`, `반영 완료`, `매핑 필요`처럼 최신 한글 문구로 통일한다.
2. 매장관리자 근무 단계에서 급여 금액 입력과 인건비 합계 확인을 검수 항목에서 제거한다.
3. 품목별 리포트 명칭은 `품목별 매출` 또는 `품목별 판매 현황 (추정)`으로 바꾼다.
4. 본사 홈 마진율 반전 표시, `AE4/AE5`, `C5/C17` 확인, 전날 재고 보기, xlsx 다운로드, 장기재고 기준일 관리 항목을 추가한다.
5. 기존 파일을 덮어쓸지, 새 버전 파일로 만들지 결정하고 기존 파일에는 최신 기준으로 superseded 표시를 남긴다.

**대상 파일**

- `docs/meeting/client-review-checklist-2026-06-27.md`
- 필요 시 `docs/meeting_0627/client-review-checklist-2026-06-28.md`

**완료 조건**

- 고객에게 전달할 검수 항목이 최신 권한/라벨/노출 정책과 일치한다.
- 급여액, 원가, 마진 차이 등 지점장 비노출 항목을 고객 검수에서 잘못 요구하지 않는다.
- 오래된 체크리스트를 그대로 쓰지 말라는 안내가 남아 있다.

**검증**

```bash
rg -n "commit 가능|품목별 이익률|급여 금액|인건비 합계" docs/meeting docs/meeting_0627
```

## 6. 권장 실행 순서

### 0차. 착수 전 기준 잠금

1. WO-17 전체 셀 반영 검증표 작성
2. WO-18 비용 항목명과 기타 메모 정리
3. WO-19 고객 검수 체크리스트 최신화
4. WO-02의 7단계 탭 요청 재현 경로 확인

이 묶음은 코드 변경보다 기준 정리가 핵심이다. 이후 구현 PR에서 “무엇을 만들지”와 “무엇을 검수할지”가 흔들리지 않게 먼저 닫는다.

### 1차. 파일럿 전 정책/민감정보 차단과 작은 개선

1. WO-01 이카운트 상태 한글화
2. WO-02 본사 장부 탭과 손실 이동
3. WO-03 미저장 경고
4. WO-04 품목별 리포트 제목과 수량
5. WO-05 변경 이력 상세
6. WO-06 작성자/수정자 표시
7. WO-10 지점장 인건비 입력/노출 재설계

WO-10은 DB 변경 가능성이 있지만 민감정보 노출 정책이 확정됐으므로 파일럿 전에 먼저 차단한다. 나머지는 DB 변경 없이 끝날 가능성이 높다.

### 2차. 기준 데이터가 필요한 작업

1. WO-08 이카운트 지점/품목 자동 등록 검증
2. WO-09 신규 품목 자동 등록
3. WO-11 전날 재고 보기
4. WO-12 본사 재고/단가 수정
5. WO-13 본사 장기재고 기준일 관리와 LINE 장기 재고

이 묶음은 master data, 권한, DB migration이 섞인다. 작은 PR로 나눠 진행한다.

### 3차. 계산과 리포트 확장

1. WO-14 본사 홈 이중 매출/마진
2. WO-15 기간조회/월별 손익계산서/xlsx 다운로드
3. WO-16 품목 검토/매출 검토 차트 페이지

이 묶음은 마진율 반전 표시와 홈 표시 라벨이 확정된 전제로 진행한다. `AE4/AE5`, `C5/C17`의 셀 의미는 이미 확인된 전제로 둔다.

## 7. 전체 검증 기준

작업별 검증 외에 배포 전에는 아래 순서로 확인한다.

```bash
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:api
pnpm test:e2e:core
git diff --check
```

주의 사항:

- `pnpm build`, `pnpm test:api`, E2E는 같은 worktree에서 동시에 돌리지 않는다.
- DB migration이 있으면 `pnpm db:generate`와 seed 영향도 확인한다.
- 지점장 권한 테스트는 반드시 실제 지점장 계정으로 확인한다.
- 본사 민감값은 UI에서 숨기는 것만으로 끝내지 말고 서버 응답에서도 빠졌는지 확인한다.

## 8. 남은 자료와 검증 샘플

### 8.1 의뢰자 결정이 필요한 자료

1. 냉동/활어 기준 품목표.
   - 품목명
   - 표준 품목명
   - 냉동/생물 또는 냉동/활어 구분의 최종 용어
   - 품목 구분
   - 장기재고 기준일

### 8.2 구현 검증에 필요한 샘플

아래는 정책 결정용 질문이 아니라 구현 검증과 중복 방지를 위한 자료다.

1. 최신 이카운트 샘플 xlsx.
2. 이카운트 거래처명과 기존 ERP 지점명 목록.
3. 이카운트 품목명/규격과 ERP 표준품목 목록.
4. 2026년 7월 파일럿 지점명과 병행 테스트 방식.

### 8.3 구현자가 작성할 검증 산출물

1. 전체 셀 반영 재검수용 셀 매핑표.
   - `AE4/AE5`, `C5/C17`은 확인됐다.
   - 나머지 주요 셀은 WO-17에서 구현자가 원본 장부와 앱 화면을 대조해 작성한다.

### 8.4 다시 묻지 않는 항목

- xlsx 시트와 컬럼은 C-13과 WO-15 기준으로 확정됐다.
- 월별 손익 조정 항목은 C-16과 WO-15 기준으로 확정됐다.
- 급여/인건비 노출, 단가 수정 권한, 전일재고 노출 범위, 알림 채널, 마진율 반전 표시, 사업자명은 확정됐다.

## 9. 하지 말아야 할 일

- 마진율 반전 표시를 계산 저장값에 직접 덮어쓰지 않는다.
- `AE4`를 의미 미확정 항목으로 되돌리지 않는다. 남은 확인은 전체 셀 반영 검증과 앱 표시값 재현이다.
- POS 품목별 실제 판매 데이터 없이 품목별 값을 `확정 매출`로 표시하지 않는다.
- 냉동/생물 분류를 품목명 문자열만 보고 확정하지 않는다.
- 미저장 경고를 전역으로 꺼서 문제를 숨기지 않는다.
- 지점장에게 급여액, 원가, 마진, 매출 차이 금액을 보내지 않는다.
- 이카운트 원본 단가와 원본 품목명을 덮어쓰지 않는다.
- 변경 이력 삭제 기능을 만들지 않는다.

## 10. WO별 상세 검토와 보완 지시

이 섹션은 실행자가 기존 WO를 구현하기 전에 반드시 확인한다. 각 항목의 “보완 지시”는 기존 WO의 수정 지시보다 구체적인 기준이다.

### WO-01 보완. 이카운트 상태 한글화

**검토 결과**

- 배치 상태 라벨은 이미 `ECOUNT_BATCH_STATUS_LABELS`와 `statusLabel` 흐름이 있다.
- 상세 화면의 헤더 배지는 `detail.statusLabel`을 사용한다.
- 상세 테이블의 라인 상태는 아직 `line.status`를 그대로 보여줄 수 있다.
- 현재 `READY` 라벨 `commit 가능`, `COMMITTED` 라벨 `완료`는 현장 용어와 맞지 않는다.

**보완 지시**

1. `ECOUNT_BATCH_STATUS_LABELS`를 아래처럼 바꾼다.
   - `READY`: `반영 가능`
   - `COMMITTED`: `반영됨`
   - `VOIDED`: `취소됨`
   - `FAILED`: `오류`
2. 배치와 라인에서 같은 라벨 함수를 공유한다. 배치 전용 함수와 라인 전용 함수가 생기더라도 라벨 값은 하나의 source에서 나오게 한다.
3. `EcountImportLineDetail.status` 타입은 라인 상태 타입으로 바꾼다. 배치 상태 타입을 재사용하지 않는다.
4. `EcountImportLineDetail.statusLabel`을 추가하고, 상세 테이블은 반드시 `line.statusLabel`만 표시한다.
5. 버튼/토스트 문구는 `commit` 대신 `반영`으로 통일한다. 단, 내부 함수명은 무리하게 바꾸지 않는다.

**취약점**

- 라벨만 바꾸고 테스트를 고치지 않으면 목록과 상세의 문구가 달라질 수 있다.
- `status` 문자열을 클라이언트 조건 분기에 계속 쓰므로 DB enum 또는 DB 문자열은 바꾸면 안 된다.

**추가 완료 조건**

- 상세 화면 본문에서 `READY`, `COMMITTED`, `MAPPING_REQUIRED`, `VOIDED`, `FAILED` raw 문자열이 보이지 않는다.
- 목록, 상세 헤더, 상세 라인 표의 같은 상태가 같은 한글 라벨로 표시된다.

### WO-02 보완. 본사 장부 상세 탭과 손실 위치 이동

**검토 결과**

- 장부 상세 페이지는 이미 `tab` query를 읽고 `selectedTab`을 만든다.
- 현재 탭 클릭이 URL을 바꾸는 흐름은 없다.
- 대시보드 상세 링크는 `date`, `sort`, `filter`를 보존하지만 `tab`은 넣지 않는다.

**보완 지시**

1. 새 query 설계를 만들지 말고 기존 `tab` query를 완성한다.
2. 탭 클릭은 현재 URL의 기존 query를 보존한 상태에서 `tab`만 바꾼다.
3. 브라우저 뒤로가기/앞으로가기에서 탭 상태가 같이 움직여야 한다.
4. 기본 탭은 `sales`로 유지한다.
5. `review` 탭은 이번 PR에 넣지 않는다. 현재 요약 영역과 정정 패널이 이미 상단에 있으므로, 별도 UX 확정 전 탭 추가는 보류한다.
6. 대시보드에서 손실 관련 신호, 손실 카드, 손실 행이 링크가 될 경우 반드시 `?tab=losses`를 붙인다.
7. `date`, `sort`, `filter`, `density` 같은 기존 관제판 query를 잃지 않는다.

**취약점**

- 탭 컴포넌트를 client component로 감싸는 과정에서 본사 권한 서버 검증을 약하게 만들면 안 된다.
- 탭 변경으로 전체 페이지가 불필요하게 remount되면 미저장 경고와 충돌할 수 있다.

**추가 완료 조건**

- `/app/ledgers/{id}?tab=losses`를 직접 열면 손실 탭이 열린다.
- 손실 탭에서 매입 탭을 누르면 URL이 `tab=purchases`로 바뀐다.
- 관제판으로 돌아가기 링크는 기존 필터 상태를 유지한다.

### WO-03 보완. 미저장 경고 오작동

**검토 결과**

- 공통 guard는 `isDirty`만 받는다.
- 실제 dirty 계산은 각 단계 client에 흩어져 있다.
- 재고 단계는 필수 수량 미입력을 dirty에 섞어 처리한다.

**보완 지시**

1. 공통 guard는 그대로 두고, 각 단계의 `isDirty` 계산을 먼저 고친다.
2. “사용자가 값을 바꾼 상태”와 “저장 전에 막아야 하는 validation 상태”를 분리한다.
3. 재고의 `hasUnenteredRequiredQuantity`는 dirty에서 빼고 저장 시 validation 또는 이동 전 저장 시도 결과로 안내한다.
4. 서버 저장 성공 후 local baseline이 새 응답값으로 바뀌는지 확인한다.
5. 자동 정규화된 값, 빈 행, 콤마 포맷, 서버가 채워 넣은 `plannedUnitPrice` 때문에 dirty가 남지 않게 한다.

**취약점**

- 경고를 줄인다는 이유로 beforeunload 자체를 끄면 실제 입력 유실이 생긴다.
- 비교 함수가 표시 문자열과 원본 숫자를 섞으면 계속 false positive가 난다.

**추가 완료 조건**

- 진입 직후 이동: 경고 없음.
- 값 변경 후 이동: 경고 있음.
- 값 변경 후 저장 성공, 다시 이동: 경고 없음.
- 재고 필수 수량 미입력은 저장 시 field error로 보이며, 단순 이동 경고로 포장하지 않는다.

### WO-04 보완. 품목별 리포트 제목과 수량 표시

**검토 결과**

- `buildProductProfitability`는 이미 `soldQuantity`, `estimatedSalesAmount`, `estimatedCogsAmount`, `estimatedGrossProfit`, `estimatedGrossMarginRate`를 만든다.
- 현재 UI는 차트 중심이고, 표가 없다.
- 설명 문구에 “판매가 계획이 없으면 매입단가 폴백”이 들어가 있어 추정의 약점을 더 명확히 드러내야 한다.

**보완 지시**

1. 제목은 `품목별 판매 현황 (추정)`으로 통일한다.
2. 표를 추가하되 차트를 제거하지 않는다.
3. 표 컬럼은 `품목`, `규격`, `분류`, `추정 판매 수량`, `추정 판매액`, `추정 원가`, `추정 마진`, `추정 이익률`, `상태`로 둔다.
4. 판매 수량 산식은 `전일재고 + 당일매입 - 손실수량 - 당일재고`임을 화면 하단 도움말에 짧게 쓴다.
5. 판매가 계획이 없는 품목은 `판매가 미반영` 상태를 눈에 띄게 표시한다.
6. 지점장 화면에서 이 리포트로 이동할 수 있는 경로가 없는지 확인한다.

**취약점**

- “판매 수량”이라고만 쓰면 POS 실제 판매 수량으로 오해된다.
- 원가와 마진을 표에 추가하면 본사 전용 보장이 더 중요해진다.

**추가 완료 조건**

- 표와 차트 모두 같은 데이터 source를 사용한다.
- 표에서 원가/마진 열이 보이는 화면은 본사 리포트 권한이 필요하다.

### WO-05 보완. 변경 이력 상세보기

**검토 결과**

- 변경 이력 화면은 이미 상세 dialog, 변경 요약, 전/후 값, 사유를 보여준다.
- 필드 라벨 맵이 제한적이라 중첩 JSON이나 장부 라인은 여전히 raw key를 많이 보여줄 수 있다.
- 장부 상세로 바로 가는 링크는 부족하다.

**보완 지시**

1. `formatAuditChangeSummary`를 확장해 대표 장부 필드를 한글로 매핑한다.
   - `totalSalesAmount`: `총매출`
   - `cashAmount`: `현금`
   - `cardAmount`: `카드`
   - `otherPaymentAmount`: `기타 결제수단`
   - `workerCount`: `근무인원`
   - `unitPrice`: `장부 적용 단가`
   - `sourceUnitPrice`: `원본 이카운트 단가`
   - `quantity`: `수량`
   - `currentQuantity`: `당일재고`
   - `reason`: `사유`
2. JSON 전체를 없애지 말고, 기본은 요약/전후 비교를 보여주고 원문 JSON은 접을 수 있는 영역으로 둔다.
3. `targetType === DailyLedger` 또는 장부와 연결된 `CorrectionRecord`는 장부 상세 링크를 제공한다.
4. `actorName`은 `name -> email -> id` fallback으로 맞춘다. 현재 `시스템`으로 떨어지는 경우가 실제 actor id 손실인지 확인한다.
5. 삭제 버튼, 숨김 버튼, soft delete API를 만들지 않는다.

**취약점**

- 민감 필드를 `omitSensitiveFields`로 제거한 뒤 전후 비교하면 “무엇이 바뀌었는지”가 빈 값처럼 보일 수 있다. 본사 이력 화면에서 숨길 필드와 보여줄 필드를 권한별로 분리해야 한다.
- 전후 값이 큰 배열일 때 전체 JSON을 펼치면 현장에서 읽기 어렵다.

**추가 완료 조건**

- 장부 수정 이력 1건에서 변경 필드, 이전 값, 이후 값, 사유, 변경자, 장부 링크를 한 화면에서 확인할 수 있다.

### WO-06 보완. 작성자/수정자 표시

**검토 결과**

- 대시보드와 상세는 이미 `updatedBy.name/email` 일부를 사용한다.
- 최초 작성자, 제출자, 본사 마감자, 마지막 수정자가 섞여 보일 수 있다.

**보완 지시**

1. 표시명을 아래 네 종류로 구분한다.
   - 최초 작성자
   - 마지막 수정자
   - 제출자
   - 본사 마감자 또는 정정 작성자
2. 모든 표시는 `name -> email -> id -> 알 수 없음` 순서로 통일한다.
3. 쿼리 include는 필요한 필드만 가져온다. 지점장 응답에는 본사 내부 사용자 정보가 불필요하게 내려가지 않게 한다.
4. UI 라벨은 `작성자`, `수정자`처럼 뭉뚱그리지 말고 업무 의미를 붙인다.

**취약점**

- `updatedBy`만 보여주면 본사 수정과 지점장 입력을 구분할 수 없다.
- 이메일이 개인정보로 취급될 수 있으므로 본사 화면 외 노출은 최소화한다.

### WO-07 보완. 회사 표시명/사업자명

**검토 결과**

- 단순 문자열 치환 작업처럼 보이지만 인증 provider 이름, metadata, sidebar, 로그인 문구가 함께 얽힌다.
- 법적 사업자명은 `도원에스디`로 확정됐다.

**보완 지시**

1. 법적 사업자명은 `도원에스디`로 반영한다.
2. 화면 표시명도 별도 요청이 없으면 `도원에스디`로 반영한다.
3. 상수 파일을 만들 경우 최소 범위로 둔다. 예: `src/server/auth/config.ts`의 provider name과 화면 표시명은 다를 수 있다.
4. README의 프로젝트명과 실제 화면 표시명은 다를 수 있으므로 무조건 일괄 치환하지 않는다.
5. 사업자명은 화면 브랜드명과 분리할 수 있게 둔다.

**취약점**

- `ERP Fish`를 모두 바꾸면 문서, 테스트 이름, 내부 프로젝트 이름까지 불필요하게 바뀔 수 있다.

### WO-08 보완. 이카운트 지점/품목 자동 등록 검증

**검토 결과**

- `StoreExternalAlias`, `ProductExternalAlias` 모델과 저장 액션은 이미 있다.
- 현재 UX는 미매핑 항목을 하나씩 저장하는 흐름에 가깝다.
- 의뢰자 결정에 따라 `품목묭도`와 `모두 적용`은 별도 기능으로 만들지 않는다. 업로드 자동 등록/자동 매핑으로 정리한다.

**보완 지시**

1. alias 저장 후 같은 batch 안의 같은 원본 키가 모두 재계산되는지 확인한다.
2. 새 지점명과 새 품목명은 자동 등록 후보로 만들고, 중복 여부를 검사한다.
3. 원본 키는 지점의 경우 `provider + rawName`, 품목의 경우 `provider + rawName + rawSpec`로 고정한다.
4. 잘못 매핑한 alias를 수정할 때 기존 batch와 다음 업로드에 미치는 영향을 설명한다.
5. alias 변경과 자동 등록 확정은 감사 로그에 남긴다.

**취약점**

- raw name 공백/대소문자/특수문자 정규화가 저장과 조회에서 다르면 자동 매핑이 흔들린다.
- 자동 등록이 중복 품목을 만들면 다음 업로드부터 매핑이 흔들린다.

**추가 완료 조건**

- 같은 원본 품목명/규격 3줄 중 1줄에서 alias를 저장하면 나머지 2줄도 같은 batch 안에서 상태가 갱신된다.
- 다음 업로드에서 같은 raw key가 자동 매핑된다.
- `품목묭도`, `모두 적용` UI는 남아 있지 않다.

### WO-09 보완. 신규 품목 생성

**검토 결과**

- `createEcountProductFromLine` 기반이 있다.
- `Product.category`는 현재 문자열이다.
- 냉동/생물 분류를 품목명 추측으로 확정하면 위험하다.

**보완 지시**

1. C-03 기준표 전에는 신규 품목 생성 시 분류를 사용자가 직접 선택하게 한다.
2. 기본 분류 자동값이 필요하면 `분류 확인 필요`처럼 안전한 임시값을 쓰고, 리포트에서 별도 상태로 보이게 한다.
3. 생성 전에 `name/category/spec` 중복 후보를 보여준다.
4. 생성 성공 시 `ProductExternalAlias`를 같이 저장한다.
5. 생성 실패 또는 중복 감지 시 batch status가 꼬이지 않게 한다.

**취약점**

- 신규 품목을 조용히 만들면 품목 master가 오염된다.
- 임시 분류가 `냉동`/`생물`로 잘못 들어가면 장기 재고와 리포트가 틀어진다.

### WO-10 보완. 지점장 인건비 입력/노출 재설계

**검토 결과**

- 현재 `LedgerLaborItem.amount`는 필수 금액이다.
- 현재 지점장 근무/인건비 화면은 급여 금액 입력과 급여 합계를 보여준다.
- 기존 테스트 일부는 지점장에게 급여 합계가 노출되는 것을 전제로 한다.
- 따라서 이 작업은 정책 전환 작업이다. 단순 UI 숨김으로 처리하면 안 된다.
- 과거 장부 급여액은 본사 전용 snapshot으로 보존하고, 새 급여 기준으로 자동 재계산하지 않는다.

**보완 지시**

1. 확정 정책을 결정 로그로 남긴다.
   - 급여액과 인건비 합계는 본사만 본다.
   - 본사만 직원/급여 기준을 등록하고 수정한다.
   - 지점장은 등록된 근무자만 선택한다.
   - 지점장이 직접 이름, 급여액, 인건비 합계를 입력하는 흐름은 만들지 않는다.
2. DB 설계는 과거 snapshot 보존을 기준으로 한다.
   - 기존 `LedgerLaborItem.amount`는 본사 전용 과거 snapshot으로 유지한다.
   - 새 급여 기준 테이블이 필요하면 `EmployeePayRate` 또는 `LaborRatePolicy`를 추가하고 장부에는 산출 snapshot을 저장한다.
   - 과거 장부를 새 기준으로 자동 재산출하지 않는다.
3. 지점장 Server Action schema에서 `amount` 입력을 받지 않거나 무시하는 수준이 아니라 거부한다.
4. 본사 Server Action만 급여액을 저장하거나 산출할 수 있게 한다.
5. 지점장 응답에서 `amount`, `payrollTotal`, `laborItems.amount`, 급여 관련 summary metric을 제거한다.
6. 기존 테스트 중 급여 노출을 기대하는 테스트는 정책 변경에 맞게 수정한다.

**취약점**

- UI에서 input만 숨기면 조작된 POST로 급여액이 저장될 수 있다.
- 기존 `omitSensitiveFields`는 key 기반 필터라 `amount`를 전역 차단하면 손실/비용 등 정상 금액까지 망가질 수 있다. 인건비 전용 response shaping이 필요하다.
- 과거 장부 급여액을 새 기준으로 자동 재계산하면 과거 월별 손익과 감사 기준이 흔들린다.

**추가 완료 조건**

- 지점장 계정은 네트워크 응답에서도 급여액을 받을 수 없다.
- 본사 계정은 기존 장부의 급여 snapshot과 새 급여 기준 산출값을 구분해서 볼 수 있다.
- 기존 데이터 migration 또는 backward compatibility 전략이 명시되어 있다.

### WO-11 보완. 전날 재고 보기 버튼

**검토 결과**

- 현재 재고 화면에는 행별 `전일재고 이력 보기`가 있다.
- 새 요구는 상단에서 전날 재고 전체를 빠르게 보는 버튼이다.

**보완 지시**

1. 기존 행별 이력 버튼은 유지한다.
2. 상단 `전날 재고 보기`는 전체 품목 목록용이다.
3. modal 또는 drawer에는 다음만 보여준다.
   - 품목명
   - 규격
   - 수량
   - FIFO 기준일/lot 식별 정보
   - 기준 날짜
   - 전일 장부 상태가 본사 마감인지 여부
4. 금액, 단가, FIFO 금액, 원가, 마진, 차이 금액은 보내지 않는다.
5. 전날 장부 링크와 수정 버튼은 제공하지 않는다.
6. 전날 장부가 없으면 “전날 장부 없음”과 대체 기준을 명확히 표시한다.

**취약점**

- 이미 있는 행별 이력과 새 전체 보기의 데이터 source가 다르면 수량이 달라 보일 수 있다.
- 단가를 서버에서 내려놓고 UI에서만 숨기면 민감정보 차단이 아니다.

### WO-12 보완. 본사 재고 수량/적용 단가 수정 정책

**검토 결과**

- 본사 재고 조정과 이카운트 적용 단가 보정 기반은 이미 있다.
- 원본 이카운트 단가와 적용 단가를 구분하는 필드도 있다.

**보완 지시**

1. 새 기능을 만들기보다 정책과 UI 가시성을 점검한다.
2. 매입 행에서는 원본 이카운트 단가와 장부 적용 단가를 나란히 보여준다.
3. 본사만 적용 단가 보정 사유를 입력할 수 있다.
4. 지점장이 이카운트 라인의 적용 단가를 수정하는 흐름은 제거하거나 서버에서 거부한다.
5. 재고 수량 수정은 `LedgerInventoryAdjustment`를 통해 남긴다.
6. FIFO 재계산 순서는 `inventory item 저장 -> adjustment reconcile -> FIFO refresh -> 재조회 -> audit` 순서를 유지한다.
7. 수정 후 리포트, 대시보드, 마감 preflight가 같은 계산 결과를 쓰는지 확인한다.

**취약점**

- 기존 코드와 테스트가 지점장 적용 단가 수정을 허용하고 있으면 정책 변경에 맞게 고쳐야 한다.
- 단가 변경 후 FIFO lot snapshot이 stale이면 마진율이 틀어진다.

### WO-13 보완. 본사 장기재고 기준일 관리와 LINE 장기 재고 알림

**검토 결과**

- 현재 `Product.category` 문자열로 냉동/생물 구분을 표현한다.
- `sourceBusinessDate` 기반 장기 체화 알림은 이미 30일 기준으로 있다.
- 회의 요구는 생물 3~4일 등 품목군별 기준일에 가깝다.
- 의뢰자 결정으로 본사 왼쪽 네비게이션에 `장기재고 기준일` 관리 항목을 추가한다.

**보완 지시**

1. 본사 왼쪽 네비게이션에 `장기재고 기준일` 메뉴를 추가한다.
2. 기준일은 코드 하드코딩이 아니라 본사 관리 화면에서 수정 가능한 master/config로 둔다.
3. 최소 모델 후보를 비교한다.
   - 안 A: `Product.category` 유지, 별도 `Product.storageType`, `staleThresholdDays` 추가
   - 안 B: `ProductCategoryPolicy` 테이블로 카테고리별 기준일 관리
   - 안 C: 품목별 override + 카테고리 fallback
4. 장기 재고 계산은 lot별 `remainingQuantity > 0`과 `sourceBusinessDate`를 기준으로 한다.
5. 같은 품목의 여러 lot가 오래 남아 있으면 품목별 합산과 lot별 근거를 모두 볼 수 있게 한다.
6. 지점장에게는 품목명, 규격, 수량, 경과일, 조치 필요 여부만 보인다.
7. 본사에는 지점, 품목, lot 근거일, 수량, 원가 영향, 기준일을 보여준다.
8. 외부 알림 채널은 LINE만 사용한다.

**취약점**

- 기존 30일 알림을 지우면 현재 LINE morning summary 회귀가 생길 수 있다.
- 생물/냉동 문자열만 믿으면 `기타`, 오타, 신규 분류가 누락된다.

### WO-14 보완. 본사 홈 이중 매출/마진 표시

**검토 결과**

- 현재 앱 계산은 `calculateLedgerReviewSummary`의 총매출, COGS, FIFO, 재고 조정, 손실 금액을 사용한다.
- 장부 `C5/C17`과 `AE4/AE5`는 확인됐다.
- 전체 셀 반영 여부는 WO-17에서 별도 검증표로 먼저 정리한다.
- 본사 아이디의 `홈` 화면에 보이는 마진율은 표시 방향을 반대로 하는 것이 확정 요구다. 숫자가 79.5가 아니어도 같은 규칙을 쓴다.
- 이 작업은 계산 필드 자체를 덮지 않고 표시값을 바꾸는 작업으로 처리한다.

**보완 지시**

1. 본사 `홈` 화면의 마진율 표시 컴포넌트를 먼저 찾는다.
2. 용어를 아래처럼 분리한다. 화면 라벨은 쉬운 말로 고정한다.
   - `actualSalesAmount`: `장부 매출`
   - `actualGrossMarginRate`: `장부 이익률`
   - `plannedSalesAnalysisAmount`: `분석 매출`
   - `plannedSalesAnalysisMarginRate`: `분석 이익률`
   - `salesBasisDifferenceAmount`: 두 매출 기준 차이
   - `salesBasisDifferenceRate`: 두 매출 기준 차이율
3. 홈의 기존 마진율 표시값은 `100% - 현재 표시값`으로 반전 표시한다. 예: 80%로 보이면 20%로 표시한다. 이 반전은 본사 홈 display 전용이다.
4. `grossMarginRate` 기존 필드를 덮어쓰지 않는다. 새 표시 기준은 새 display 필드로 추가한다.
5. 현재 대시보드의 이상 신호가 어떤 마진율을 보는지 명시한다.
6. 지점장 response shaping에 새 필드들이 들어가지 않게 한다.
7. `C5/C17`, `AE4/AE5` 값은 테스트 설명에 근거로 남긴다. 코드 주석에는 필요한 최소 설명만 둔다.
8. WO-17 검증표에서 본사 홈 반영 범위가 정리되기 전에는 홈 이중 매출/마진 구현을 시작하지 않는다.

**취약점**

- `마진율`, `이익률`, `매출 차이`라는 기존 이름에 새 의미를 덮으면 리포트, 이상 신호, 마감 preflight가 동시에 흔들린다.
- 반전 표시를 계산 저장값에 적용하면 과거 데이터와 리포트가 달라질 수 있다.

**추가 완료 조건**

- 본사 홈 fixture에서 기존 표시값과 반전 표시값을 나란히 설명한다.
- 본사 홈 기본 라벨은 `장부 매출`, `장부 이익률`, `분석 매출`, `분석 이익률`이다.

### WO-15 보완. 기간조회/월간/다운로드 확장

**검토 결과**

- CSV export route와 감사 로그 기반은 이미 있다.
- `.xlsx` 생성 라이브러리는 현재 의존성에 없다.
- 월별 손익계산서는 이번 범위에 포함하기로 확정됐다.
- 품목 검토/매출 검토 차트 페이지는 WO-16에서 별도 처리한다.
- 의뢰자 결정으로 xlsx 다운로드까지 제공한다.
- 의뢰자 위임에 따라 xlsx 시트/컬럼과 월별 손익 조정 항목은 추천안으로 확정됐다.

**보완 지시**

1. xlsx 다운로드를 구현 범위에 포함한다.
2. CSV raw row export는 필요하면 보조 기능으로 둔다.
3. xlsx는 `요약`, `기간조회_RAW`, `월별손익`, `재고현황`, `품목매출` 시트로 만든다.
4. export는 본사 `EXPORT_CREATE` 권한이 있어야 한다.
5. export 감사 로그에는 필터, 기간, 지점 범위, row 수, 포맷을 남긴다.
6. 피벗용 row는 화면 표시용 요약 row와 분리한다.
7. 대량 데이터 export는 timeout과 row limit 정책을 둔다.
8. 월별 손익계산서는 쉬운 구조로 설명하고 구현한다: `매출 - 매입 원가 - 인건비 - 고정비 - 기타 비용 = 남은 금액`.
9. 월별 손익 조정 항목은 월세, 관리비, 공과금, 세금/수수료, 포장/소모품, 배송/운반, 수선/유지보수, 기타비용, 본사조정, 조정사유, 메모로 둔다.
10. 월별 기준, 매출 기준, 원가 기준, 인건비 기준, 월 마감 후 수정 가능 여부는 구현 전에 명시한다.
11. `format=xlsx`를 허용하도록 API 계약과 `tests/api/report-export.spec.ts` 기대값을 함께 바꾼다.
12. 품목별 sheet와 차트의 품목별 매출/이익률은 `추정` 표시를 유지한다.

**취약점**

- 화면 표를 그대로 내려받게 하면 피벗 분석에 필요한 raw dimension이 빠질 수 있다.
- 필터 없는 전체 export가 커지면 서버리스 timeout이 날 수 있다.
- API 테스트를 바꾸지 않으면 새 xlsx 기능이 기존 `xlsx 거부` 기대값과 충돌한다.

### WO-17 보완. 전체 셀 반영 검증표

**검토 결과**

- 6/27 메모의 `전체 셀 반영이 되었는가`는 홈 마진율 표시 변경과 다른 성격의 검증 작업이다.
- `AE4/AE5`, `C5/C17`은 확인됐지만 다른 주요 셀은 아직 반영 여부 표가 없다.

**보완 지시**

1. 셀별 의미, 수식, 원천 데이터, 화면 위치, 현재 값, 기대 값, 차이, 조치를 표로 만든다.
2. 앱에 반영하지 않는 셀은 제외 사유를 남긴다.
3. WO-14는 이 표에서 본사 홈 반영 범위가 정리된 뒤 착수한다.

### WO-18 보완. 비용 항목명과 기타 메모

**검토 결과**

- `final-summary-and-worklist-2026-06-27.md`의 P1 항목이 작업지시서에서는 월별 손익 조정 항목 안에만 섞여 있었다.
- 비용 입력, export, 월별 손익, 감사 로그가 서로 다른 이름을 쓰면 고객 검수와 운영 입력이 흔들린다.

**보완 지시**

1. 비용 항목 표준명은 본사 관리 항목을 기준으로 한다.
2. 예외 비용은 `기타 + 메모`로 처리한다.
3. 화면, export, 감사 로그, 월별 손익계산서 표시명을 맞춘다.

### WO-19 보완. 고객 검수 체크리스트 최신화

**검토 결과**

- 기존 체크리스트에는 `commit 가능`, 지점장 급여 입력, `품목별 이익률` 같은 최신 정책과 맞지 않는 표현이 남아 있다.

**보완 지시**

1. 고객 검수 전에 최신 체크리스트를 새로 만들거나 기존 파일에 superseded 표시를 남긴다.
2. 검수 항목은 급여/인건비 본사 전용, 단가 본사 전용, 전일재고 민감값 제외, xlsx 다운로드, 장기재고 기준일 관리, 홈 마진율 반전 표시를 기준으로 한다.

## 11. PR 분리와 실행 순서 보완

아래 단위로 PR을 나누면 충돌과 rollback 위험이 줄어든다.

| PR | 포함 WO | DB 변경 | 위험도 | 선행 조건 |
|---|---|---:|---|---|
| PR-0 기준 잠금/검수 문서 | WO-17, WO-18, WO-19 | 없음 또는 없음 가능 | 중간 | 원본 장부와 최신 정책 확인 |
| PR-A 라벨/탭/링크 | WO-01, WO-02 | 없음 | 낮음 | WO-02 재현 경로 확인 |
| PR-B 미저장 경고 | WO-03 | 없음 | 중간 | 단계별 dirty fixture 확인 |
| PR-C 리포트 표/제목 | WO-04 | 없음 | 중간 | 본사 전용 경로 확인 |
| PR-D 감사/작성자 표시 | WO-05, WO-06 | 없음 | 중간 | 필드 라벨 목록 확정 |
| PR-I 인건비 정책 전환 | WO-10 | 가능성 높음 | 높음 | C-07, C-14 확정. 급여 기준 설계 |
| PR-E 전날 재고 전체 보기 | WO-11 | 없음 또는 쿼리만 | 중간 | C-09 확정 |
| PR-F 이카운트 자동 등록 | WO-08 | 없음 가능 | 중간 | 최신 샘플 xlsx |
| PR-G 신규 품목 자동 등록 | WO-09 | 없음 가능 | 중간 | C-03 또는 임시 분류 정책 |
| PR-H 재고/단가 정책 정리 | WO-12 | 없음 가능 | 높음 | C-08 확정 |
| PR-J 장기재고 기준일/LINE 장기 재고 | WO-13 | 가능성 높음 | 높음 | C-04, C-10 확정. C-03 자료 대기 |
| PR-K 홈 이중 매출/마진 | WO-14 | 없음 또는 타입 확장 | 높음 | C-01, C-02 확정. WO-17 완료 |
| PR-L 기간조회/월별 손익/xlsx export | WO-15 | 없음 가능 | 중간~높음 | C-05, C-13 확정. G-09 완료 |
| PR-M 품목/매출 차트 페이지 | WO-16 | 없음 가능 | 중간~높음 | C-12 확정 |

권장 순서는 PR-0, PR-I를 먼저 처리해 기준과 민감정보 차단을 잠근 뒤 PR-A~PR-E를 진행하는 것이다. PR-F 이후는 기준 데이터 확보 상황에 맞춰 진행한다.

## 12. 공통 구현 체크리스트

모든 PR은 아래 항목을 확인한다.

### 12.1 권한과 응답 shaping

- 화면 접근 권한과 Server Action 권한을 둘 다 확인한다.
- 본사 전용 값은 지점장 route, Server Action 반환값, Server Component props에 포함하지 않는다.
- `omitSensitiveFields` 같은 범용 필터에만 기대지 않는다. 기능별 DTO를 따로 만든다.
- 지점장 E2E는 UI 텍스트 부재뿐 아니라 API/응답 필드 부재를 검증한다.

### 12.2 계산

- 기존 `calculateLedgerReviewSummary`를 우선 재사용한다.
- 새 계산 기준을 추가할 때는 기존 필드 의미를 바꾸지 않는다.
- 모든 비율은 0 나누기, `null`, `NaN`, `Infinity` 방어를 테스트한다.
- 금액 계산은 integer KRW 안전 범위를 벗어나지 않는지 확인한다.
- “추정”, “계획”, “실제”, “원본”, “정정 반영” 라벨을 섞어 쓰지 않는다.

### 12.3 DB와 migration

- enum 이름 변경은 금지한다.
- 문자열 상태값을 DB에서 바꾸지 말고 UI 라벨만 바꾼다.
- migration이 있으면 `pnpm db:validate`, `pnpm db:generate`, seed 영향, 기존 테스트 데이터 영향까지 확인한다.
- 새 필드는 null 허용과 backfill 전략을 먼저 정한다.
- 과거 장부의 표시 정책을 명시한다.

### 12.4 감사 로그

- 본사 수정, alias 변경, export, 기준값 변경은 감사 로그를 남긴다.
- `before`, `after`, `reason`, `actorId`가 모두 의미 있게 들어가야 한다.
- 원본 이카운트 값과 적용값은 감사 payload에서 구분한다.
- 감사 로그 조회 화면에서 raw JSON만 보고 해석해야 하는 상태를 줄인다.

### 12.5 URL과 화면 상태

- 필터, 탭, 정렬, 날짜는 가능한 URL query로 유지한다.
- 기존 query를 새 링크가 지우지 않게 한다.
- 복사한 URL, 새로고침, 뒤로가기에서 같은 화면 상태가 유지되어야 한다.
- 모바일 화면에서 버튼/표 텍스트가 겹치지 않아야 한다.

### 12.6 테스트 데이터

- 마진율 관련 테스트는 실제 장부 셀 값과 앱 fixture 값을 분리한다.
- 이카운트 테스트는 미매핑, 부분 매핑, 전체 매핑, 실패 라인, 취소 batch를 포함한다.
- 권한 테스트는 본사 전체 지점 권한, 본사 일부 지점 권한, 지점장 권한을 나눠 확인한다.
- 기존 운영 데이터와 비슷한 “빈 값”, “0”, “음수 불가”, “큰 금액”, “동일 품목 다른 규격” 케이스를 넣는다.

## 13. 의뢰자 확인 질문 보완

2026-06-28 답변으로 급여/인건비 노출, 단가 수정 권한, 마진율 반전 표시, 홈 라벨, 전일재고 노출, LINE 채널, 이카운트 자동 등록, 월별 손익/차트 범위, xlsx 다운로드, xlsx 컬럼, 월별 손익 조정 항목, 기존 급여액 처리, 사업자명은 확정됐다. 아래 질문만 남긴다.

| 번호 | 질문 | 필요한 이유 |
|---:|---|---|
| Q-01 | 냉동/활어 기준 품목표는 어떤 항목으로 구성되는가? 최종 화면 용어는 `냉동/활어`인지 `냉동/생물`인지 함께 확정한다. | WO-13의 자동 분류와 장기재고 기준 연결에 필요하다. |

## 14. 배포 전 회귀 시나리오

아래 시나리오는 작업별 테스트와 별도로 파일럿 전 수동 또는 E2E로 확인한다.

1. 본사 사용자가 이카운트 파일을 업로드하고, 미매핑 지점/품목을 매핑한 뒤 batch를 반영한다.
2. 같은 원본 거래처명/품목명/규격이 들어간 새 파일을 다시 업로드했을 때 자동 매핑된다.
3. 지점장이 장부를 열고 아무 값도 바꾸지 않은 채 다른 단계로 이동해도 미저장 경고가 뜨지 않는다.
4. 지점장이 값을 바꾼 뒤 저장하지 않고 이동하면 미저장 경고가 뜬다.
5. 지점장이 재고 화면에서 전날 재고 전체를 보더라도 단가, 금액, 원가, 마진이 응답에 없다.
6. 본사가 장부 상세에서 손실 탭 링크를 열고, 새로고침해도 손실 탭이 유지된다.
7. 본사가 변경 이력 상세에서 전/후 값, 사유, 작성자, 장부 링크를 확인한다.
8. 본사가 적용 단가를 수정하면 원본 이카운트 단가는 유지되고, 적용 단가와 사유만 바뀐다.
9. 본사 리포트의 품목별 판매 현황 표에서 추정 판매 수량과 추정 매출이 보인다.
10. 지점장 계정으로 본사 리포트, 원가, 마진 차이, 급여액에 접근할 수 없다.
11. 장기 재고 알림은 기준일을 넘긴 품목만 잡고, 기준이 없는 품목은 기준 확인 필요로 표시한다.
12. export를 실행하면 권한, row 수, 필터, 감사 로그가 모두 확인된다.

## 15. 최종 실행 기준

개발자는 각 PR 완료 시 아래를 남긴다.

- 변경한 WO 번호.
- 변경한 파일 목록.
- DB migration 여부.
- 새로 추가하거나 수정한 테스트.
- 실행한 검증 명령.
- 남은 의뢰자 확인 항목.
- 민감정보 노출 검증 결과.
- 감사 로그 영향 여부.

릴리즈 후보는 아래 명령을 통과해야 한다.

```bash
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:api
pnpm test:e2e:core
git diff --check
```

`pnpm build`는 release 후보에서 별도로 실행한다. E2E와 build는 같은 worktree에서 동시에 실행하지 않는다.
