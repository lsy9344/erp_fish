# 0725 회의 — 요구사항 검토 브리핑

- 날짜: 2026-07-25
- 대상: 재고/리포트/인건비/월간 리포트 관련 9개 검토 항목
- 상태: 코드 진단 완료 + 확정 방향 정리 (구현 전)

## 요약

| # | 항목 | 화면 | 구분 | 확정 방향 |
|---|------|------|------|-----------|
| 1 | 재고 매입단가가 다음 날 사라짐 | 재고 단계 | 버그 | FIFO 롯트 단가(=이월 unitPrice) fallback |
| 2 | 남아있는 재고 클릭 → 매입 이력 팝업 | 재고 단계 | 신규 | FIFO 매입 이력 팝업 연결 (권한 현행 유지) |
| 3 | 그래프 색·글씨 대조 불량 | 리포트 전반 | 개선 | 범례 색 + 전역 축 라벨 색 보정 |
| 4 | '(총매출 + 영업매출)' 텍스트·'영업매출' 삭제 | 매출액 그래프 | 수정 | 워터폴 축 라벨 + 지점별 차트 공식 텍스트 둘 다 삭제 |
| 5 | 판매수량 상위 10개 차트 제거 | 일일 리포트 | 수정 | **차트 삭제** (너비 조정이 아님) |
| 6 | 직원 등록 + 상세 설정 | 본사 인건비 | 신규 | 직원 등록 노출 + 상세(하루 인건비/4대보험/현금) |
| 7 | 월간 지표에 인건비 카드 추가 | /reports/monthly | 신규 | **인건비 KPI 카드 추가** (손익표 임베드 아님) |
| 8 | 직원 희망 수령액(4대보험/현금) | 직원 상세 + 월간 | 신규 | 6번 등록에서 입력, 월간 손익에 분해 표시 |
| 9 | '직원명' 필터 추가 | **/reports/labor** | 신규 | **인건비 현황 페이지에 직원명 필터** (구현 기준으로 확정) |

> 이번 회의에서 원안 대비 변경된 항목: **5번(너비 조정 → 차트 삭제)**, **7번(손익표 임베드 → 인건비 카드)**, **6번(상세 설정 필드 구체화)**. 9번은 회의에서 /monthly로 논의되었으나 최종 구현은 원 요청대로 인건비 현황(/reports/labor)에 반영됨.

---

## 1. 재고 단계 매입단가가 다음 날 사라짐 (버그)

### 증상
- 엑셀로 재고를 입력하면 **당일에는 매입단가가 표시**되다가, 다음 날 장부에서는 같은 재고의 단가가 **"단가 근거 없음"** 으로 비어 보임.
- 재고가 남아 있다면 단가가 계속 보여야 함.

### 근본 원인 (코드 확인)
엑셀 수입은 `InventoryOpeningSnapshot`(단가+수량)만 생성하고 매입행·FIFO 롯트는 만들지 않음 (`src/features/inventory/opening-import-actions.ts:384-394`).

1. **당일(N)**: 이월 소스가 `OPENING_SNAPSHOT` → `attachPurchasePrices`의 OPENING fallback이 발동해 엑셀 단가 표시 (`src/features/inventory/queries.ts:1126-1133`).
2. **다음 날(N+1)**: 이전 장부가 생기면 이월 소스가 `PREVIOUS_*_LEDGER`로 바뀜 (`queries.ts:831-834`). fallback 조건(`source === "OPENING_SNAPSHOT"`)이 꺼지고, 매입행(`ledgerPurchaseItem`)도 없어 `purchasePrice = null` → UI가 "단가 근거 없음" 표시 (`src/features/inventory/components/inventory-step-client.tsx:1897-1901`).

### 핵심 — 데이터는 사라지지 않음
N+1에도 단가 데이터는 두 곳에 살아 있음:
- 행에 이월된 `unitPrice` (엑셀 단가, `queries.ts:874 → 424`)
- N일 저장 시 생성된 `LEGACY_OPENING` FIFO 롯트 (`src/features/inventory/fifo-lots.ts`)

다만 새 장부 조회 분기에서 ① fallback 게이트가 막혀 있고 ② `attachFifoLots`는 저장-완료 분기에서만 실행(`queries.ts:1229`)되어 롯트가 조회되지 않을 뿐임.

### 확정 방향
- 매입행이 없을 때 **FIFO 롯트 단가(=이월된 unitPrice, 엑셀 단가와 동일 값)** 를 fallback으로 표시.
- "엑셀 단가가 다음 날에도 보여야 한다"는 요구를 동시에 충족함.
- 표시 라벨은 기존 `당일/최근 매입단가`, `월초 재고단가` 체계와 일관되게 정리 (구현 시 문구 확정).

---

## 2. 남아있는 재고 클릭 → FIFO 매입 이력 팝업 (신규)

### 요구
- 남아있는 재고를 클릭하면 팝업으로 **언제 들어온 재고인지(입고일), 당시 단가**를 조회.

### 진단 — 필요한 데이터·참조 UI가 이미 존재
- FIFO 롯트가 장부마다 저장됨: 입고 영업일(`sourceBusinessDate`)·단가·원수량·소진·잔량·잔액 (`src/features/inventory/fifo-lots.ts:202-279`). 재고 단계 행에도 첨부되나 현재 클라이언트가 렌더링하지 않음.
- 동일 팝업이 본사 리포트에 이미 존재: `src/features/reports/components/inventory-position-history-dialog.tsx` ("FIFO 매입 이력").
- 재고 단계용 UI 용어도 정의만 되어 있고 미사용 (`src/features/inventory/terms.ts:29-43`: `입고일자`, `매입단가` 등).

### 확정 방향
- 재고 단계의 남아있는 재고 행에 FIFO 매입 이력 팝업 연결.
- **권한은 현행 정책 유지**: 본사는 입고일+단가+금액, 지점장은 입고일+잔량만 (지점장 응답에서 롯트 단가/금액 제거 정책 — `src/features/inventory/types.ts:153-156`, 2026-06-28 결정).

---

## 3. 리포트 그래프 색·글씨 대조 불량 (개선)

### 진단 (recharts + 전역 CSS 변수 `src/styles/globals.css:81-96`)
- **최악**: 마진율 범례의 색깔 있는 글씨 — sky-500(≈2.2:1), amber-500(≈1.6:1)이 흰 배경 위 → WCAG 실패 (`src/features/reports/components/product-profitability-report.tsx:355-364`).
- **전역**: 모든 차트 축 라벨이 slate-500(`#64748b`)으로 통일 (`src/components/ui/chart.tsx:68`) — 한 곳 수정으로 전 차트 개선 가능.
- 기타: "전월 같은 날" 회색 라인 (`src/features/reports/components/hq-report-overview.tsx:67`), 차트 내부 10px muted 텍스트.

### 확정 방향
- 범례 텍스트 색을 대조비 확보되는 색으로 보정.
- `chart.tsx:68`의 축 라벨 색을 진하게 조정 (전역 적용).

---

## 4. 매출액 그래프 텍스트·'영업매출' 삭제 (수정) — 둘 다

> 참고: `"(총매출 + 영업매출)"` 문자열은 코드에 존재하지 않으며, 아래 두 곳의 표기를 정리하는 것으로 확정.

### 삭제 대상
1. **워터폴 축 라벨** `"영업매출"` — `src/features/reports/components/hq-report-overview.tsx:87` (통합 리포트 "월 손익 흐름" 첫 막대 축 라벨).
2. **지점별 차트 공식 텍스트** `(장부 마감 매출 + 이월 매출)` 및 관련 부제 — `src/features/reports/components/store-daily-performance-chart.tsx:44, 327-328`, `src/app/app/reports/daily/page.tsx:174-175`, `src/app/app/reports/sales-review/page.tsx:75-76`.

### 연쇄 수정 필요 테스트
- `tests/unit/hq-report-overview.test.mjs:1257` (`["sales","영업매출"]`)
- `tests/unit/hq-reports.test.mjs:222-237`
- `tests/e2e/hq-reports.spec.ts`, `tests/e2e/meeting-0627-acceptance.spec.ts`

---

## 5. 판매수량 상위 10개 차트 제거 (수정) — **차트 삭제**

> 원안은 "가로 스크롤 개선"이었으나,本次会议에서 **차트 자체 삭제**로 확정.

### 진단
- 대상: `SalesRankingChart` (`src/features/reports/components/product-profitability-report.tsx:392-478`), `min-w-[720px]`(406행) + 회전 라벨로 가로 스크롤 발생.
- "판매수량 상위 10개" 제목(242행) 아래 3열 테이블(품목/규격/판매수량, 254-288행)은 남고, 그 위의 차트만 제거하는 방향.

### 확정 방향
- `SalesRankingChart` 제거 (일일 리포트 `src/app/app/reports/daily/page.tsx:203-207`의 `mode` 조정).
- 테이블(품목/규격/판매수량) 유지 여부도 함께 확인 — 기본은 테이블 유지.

### 연쇄 수정 필요 테스트
- `tests/e2e/hq-reports.spec.ts:1345-1423` (차트 aria-label·10개 바 검증)
- `tests/unit/hq-reports.test.mjs:276-338` (`SalesRankingChart`, `layout="vertical"` 검증)
- `tests/e2e/meeting-0627-acceptance.spec.ts:62`

---

## 6. 본사 직원 등록 + 상세 설정 (신규)

### 요구
- 본사가 직원을 등록하고, **등록 시 상세 설정**이 있어야 함.
- 상세 설정 항목: **① 하루 인건비 ② 4대보험으로 받을 금액 ③ 현금으로 받을 금액** (8번 항목을 여기서 입력).
- 인건비 현황은 **본사 전용** 유지 (본사가 본사 아이디로 로그인).
- 지점장은 인건비 입력 단계에서 **직원 검색·선택만** 수행.

### 현재 상태
- 직원 등록 기능은 존재하나 **숨겨짐**: `ENABLE_HR_PREVIEW=true` 플래그 뒤 + 사이드바 링크 없음 (`src/app/app/labor/employees/page.tsx:18-25`). 본사 전용(`SETTINGS_MANAGE`).
- 직원 폼 필드는 **이름·입사일만** 존재 (`src/features/labor/employees-schemas.ts:3-17`).
- Employee 모델: `id, name, hireDate, isActive` 등만 존재 (`prisma/schema.prisma:947-958`) — 하루 인건비/4대보험/현금 필드 없음.
- 인건비 현황 페이지는 본사 전용 (`requireReportAccess`), 지점장 차단 e2e 존재 (`tests/e2e/hq-reports.spec.ts:2166-2174`).
- 지점장 직원 선택 드롭다운은 이미 존재 (`getActiveEmployeeOptions`, `src/features/labor/employees-queries.ts:70-78`).

### 확정 방향
- 직원 관리 페이지를 인건비 메뉴 영역으로 노출/통합 (플래그 제거 + 사이드바/네비 링크).
- Employee 모델에 **하루 인건비 · 4대보험 희망액 · 현금 희망액** 필드 추가 (Prisma 마이그레이션 필요).
- 직원 등록/수정 폼에 해당 상세 입력 추가.
- 지점장 근무/인건비 단계의 직원 검색·선택 UX 점검 (검색성 개선 필요 시 반영).

---

## 7. 월간 지표에 인건비 카드 추가 (신규) — **인건비 KPI 카드**

> 원안은 "손익계산서 표 임베드"였으나,本次会议에서 **/reports/monthly에 인건비 카드 추가**로 확정.

### 현재 상태
- `/app/reports/monthly` "월간 요약 리포트" (`src/app/app/reports/monthly/page.tsx`).
- "월간 핵심 성과" KPI 카드에 매출·매출이익·영업이익·손실 등은 있으나 **인건비 없음** (`src/features/reports/components/monthly-closing-anomaly-report.tsx:118-206`).
- 월간 쿼리(`getHqMonthlyClosingAnomalyReport`, `src/features/reports/queries.ts:1988-2219`)는 `ledgerLaborItems`를 select하지 않음.
- 인건비 집계 패턴은 이미 존재: `src/features/reports/monthly-profit-loss.ts:213-223` (`IN_REVIEW`/`HEADQUARTERS_CLOSED` 장부의 `LedgerLaborItem.amount` 합산).

### 확정 방향
- 월간 쿼리에 인건비 합산 추가 → KPI 카드 1개("인건비") 추가 (`MonthlyKpiSummary`의 `remainingItems`, `monthly-closing-anomaly-report.tsx:124-132`).
- 타입 확장: `MonthlyClosingKpiSummary` (`src/features/reports/types.ts:268-282`).
- 기준(마감 상태 필터)은 기존 월별손익(`monthly-profit-loss.ts`)과 일치시켜 일관성 유지.

---

## 8. 직원 희망 수령액(4대보험/현금) 기록 + 월간 표시 (신규)

### 요구
- 직원 상세에 **월 희망 수령액** 기록: 4대보험 X만원 / 현금 Y만원.
- 입력 위치: **6번 직원 등록 상세 설정** (하루 인건비/4대보험/현금 항목으로 입력).
- 월간 리포트 표시: **손익의 인건비 행에 현금/4대보험 분해 컬럼**.

### 현재 상태
- 4대보험/현금 관련 필드·코드 전무 (`prisma/schema.prisma:947-958`).

### 확정 방향
- 6번 Employee 신규 필드(하루 인건비·4대보험·현금)로 입력.
- 월간 표시는 7번 인건비 카드 및 9번 직원명 필터와 연계하여 분해(현금/4대보험) 표시.

> **정리 필요(오픈)**: 7번이 "손익표 임베드"에서 "인건비 카드"로 변경됨에 따라, "인건비 행 분해 컬럼"을 카드 형태에서 어떻게 표현할지(카드 내 현금/4대보험 소계, 또는 직원명 필터 결과로 분해 표시)는 구현 설계 단계에서 9번과 함께 확정.

---

## 9. 인건비 현황 페이지에 '직원명' 필터 추가 (신규) — **/reports/labor** (구현 완료)

> 회의에서는 /reports/monthly로 논의되었으나, 최종 구현은 원 요청과 동일하게 **인건비 현황(/reports/labor)** 페이지에 반영됨.

### 구현 결과
- 인건비 현황 페이지 필터 영역(조회 월·지점 근처)에 **직원명 검색 필터** 추가 (`src/app/app/reports/labor/page.tsx:91-97`).
- 서버 쿼리에서 `workerName` 부분 일치로 필터링 (`src/features/labor/headquarters-labor-queries.ts`).
- 월간 페이지(/reports/monthly)에는 7번 인건비 KPI 카드만 추가되고 직원명 필터는 없음.

---

## 구현 순서 제안

영향 범위와 의존성을 고려한 권장 순서:

1. **9번 + 7번** (월간 인건비 카드 + 직원명 필터) — 동일 쿼리 변경, 함께 처리
2. **1번** (재고 매입단가 fallback) — 독립 버그 수정
3. **4번** (텍스트 삭제) — 독립, 테스트 동시 수정
4. **5번** (차트 삭제) — 독립, 테스트 동시 수정
5. **3번** (대조 개선) — 독립 UI 개선
6. **2번** (FIFO 팝업) — 신규, 참조 UI 재활용
7. **6번 + 8번** (직원 등록 상세 + 희망액) — Prisma 마이그레이션 필요, 별도 단위로 처리

## 오픈 이슈

- **8번 월간 표시 형태**: 7번이 카드로 변경됨에 따라 현금/4대보험 분해 표현 방식 확정 필요 (9번 직원명 필터와 연계).
- **1번 표시 라벨**: fallback 단가의 표시 문구(예: "재고 단가", "이월 단가") 구현 시 확정.
