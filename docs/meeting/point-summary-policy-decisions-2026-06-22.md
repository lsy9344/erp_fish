# point_summary 대응 정책 결정 (2026-06-22)

> **기준 문서:** `docs/meeting/point_summary.md`
> **작업지시서:** `docs/goal/2026-06-22-point-summary-post-review-remediation-work-order.md`
> **상태:** 이해관계자 승인 대기 → 본 문서로 정책 명문화

이 문서는 후속 정밀 보완 작업지시서(WO-A~WO-I) 중 "원문 요구와 대체 구현 사이의
정책 결정"이 필요한 항목(WO-F, WO-H, WO-I)의 확정 내용을 기록한다.

## WO-F. LINE 아침 요약 수신자 수 정책

- **원문(point_summary.md:74):** "핵심 관리자 3명에게 발송."
- **확정 정책:** **3명 이상(최소 1명) 허용.**
  - 인사 변동·임시 대리 수신 등 운영 유연성을 위해 정확히 3명을 강제하지 않는다.
  - 발송 route(`/api/internal/notifications/morning-summary`)는
    `LINE_MORNING_SUMMARY_RECIPIENT_IDS`에 1명 이상이 설정되면 발송하고,
    비어 있으면 설정 오류로 처리한다.
  - 운영 권장값은 임원/지출 권한 관리자 3명이다.
- **스케줄러:** 배포 플랫폼 Vercel 기준 `vercel.json`에 실제 Cron(`0 23 * * *`,
  = KST 08:00)을 등록했다. 인증은 `INTERNAL_CRON_SECRET`을 사용하며, Vercel의
  `CRON_SECRET`을 같은 값으로 설정해야 한다. (자세한 내용은
  `docs/production-deployment.md`의 "LINE 아침 요약 알림" 섹션 참고.)

## WO-H. 냉동/생물 카테고리 이익률

- **원문(point_summary.md:26):** "냉동/생물 총매출액과 카테고리별 이익률을
  한눈에 보는 차트."
- **확정 정책:** **재고 흐름 기반 추정 매출과 추정 이익률을 제공한다.**
  - 원문 회의록(`original_text.txt:3718-3730`)은 냉동/생물 판매액과 하루 판매분의
    이익률을 그래프로 보기 좋게 보여달라는 요구에 가깝다.
  - 다만 품목별 실제 POS 매출 데이터가 없으므로 확정 매출·확정 이익률로 표기하지 않는다.
  - 차트의 매출액은 재고 흐름(전일 + 매입 − 당일)을 판매 수량으로 본 **추정값**이다.
  - `grossMarginRate`는 추정 매출과 추정 원가로 계산 가능한 경우 값을 제공한다. 추정 원가는
    FIFO 소진금액이 있으면 이를 우선 쓰고, 없으면 `판매 수량 × 단가`를 폴백으로 쓴다.
  - UI에는 "추정 매출"과 "추정 이익률"을 명시하고, 확정 매출·원가가 아니라는 설명 문구를
    차트 하단에 둔다. 계산 입력이 부족한 경우에만 "계산 불가 (추정)"으로 표기한다.
  - 향후 품목별 POS 매출 연동이 확보되면 실제 판매가 기반 카테고리 이익률로 재검토한다.

## WO-I. 대시보드 컴포넌트 크기 조절

- **원문(point_summary.md:10):** "모든 대시보드 컴포넌트 크기를 사용자의 요구에 따라
  자유롭게 키우고 조절."
- **확정 정책:** **자유 드래그 리사이즈 대신 밀도 프리셋으로 대체한다.**
  - 운영 안정성(레이아웃 깨짐/저장 충돌 방지)과 유지보수 범위를 고려해, 임의 드래그
    레이아웃 대신 `기본/넓게/압축` 밀도 프리셋 + 테이블 컬럼 폭 조절을 제공한다.
  - 관련 구현: `src/features/dashboard/components/dashboard-layout-controls.tsx`,
    `src/features/dashboard/components/hq-dashboard-table.tsx`.
  - 향후 진짜 자유 리사이즈가 필요하면 요약 카드/테이블/섹션 단위 resize+persist
    기능으로 별도 확장한다.

## 검토 후속(2026-06-22): 이상 신호 문구 원문 정렬

- **원문(point_summary.md:14):** 이상 신호는 정확히
  **"매출 기준 확인 필요", "이익률 계산 불가", "매출 차액 계산 불가", "재고 입력 필요"**
  로 직관적으로 보여야 한다.
- **확정 정책:** 관제판 계산 상태 신호 문구를 지표명 + 상태로 통일해 원문과 일치시킨다.
  - `metricStatusSignal`(`src/features/dashboard/queries.ts`)이 지표명을 앞에 붙여
    "매출 기준 확인 필요 / 이익률 계산 불가 / 매출 차액 계산 불가" 형태로 출력한다.
    기존 일반 문구("기준 확인 필요", "계산 불가")는 어느 지표 문제인지 모호했다.
  - 마진/이익률 미확정 신호 라벨을 "마진률 계산 불가" → **"이익률 계산 불가"**로 바꿔
    원문 용어(이익률)와 맞췄다(`src/server/calculations/anomaly.ts`).
  - 재고 누락 신호는 이미 "재고 입력 필요"로 일치한다(`anomaly.ts`).

## 검토 후속(2026-06-22): 지점장 노출 범위(WO-01 확장 유지)

- **원문(point_summary.md:41):** 지점장 화면에는 **총매출·마진율(이익률)·재고금액**만 남긴다.
- **확정 정책:** **현행 유지(WO-01 의도된 확장).**
  - 지점장 **상단 요약**(`toStoreManagerLedgerReviewStepData`의 summary)은 원문대로
    `totalSales / grossMarginRate / inventoryAmount`로 좁히되, WO-01에서 확정한
    `workerCount`(근무인원 수)만 추가로 둔다.
  - **단계(step) 요약**의 `paymentTotal`·`laborCount`·`payrollTotal`·각종 count는
    원문 3개 항목을 넘어서지만, 민감 회계지표(매출원가·매출이익·영업이익·인당생산성·
    FIFO 원가·매출차액)가 아닌 운영 보조 카운트/합계이므로 WO-01 합의대로 유지한다.
  - 민감 차단 목록(원가·이익·생산성·FIFO·매출차액)은 그대로 차단한다. 단계 요약에
    새 지표를 추가할 때는 이 차단 목록과의 충돌 여부를 먼저 확인한다.

## 검토 후속(2026-06-23): ECount 매입 기준 추출 범위 — 폐기됨

- 이 절의 **`관리자 > 매입 기준 추출만 유지`** 정책은 **2026-06-24 폐기**되었다.
  대체 정책은 아래 `정책 전환(2026-06-24)`을 따른다.

## 정책 전환(2026-06-24): 이카운트 = 본사 출고 / 지점 입고 원장

- **확정 정책:** 이카운트 엑셀은 품목별 단일 `매입 기준` 단가를 만드는 파일이 아니라,
  **본사가 각 지점에 어떤 품목을 얼마에 공급했는지** 담은 `본사 출고 / 지점 입고 원장`이다.
  - 파일의 각 행은 지점 장부의 입고/매입 라인으로 보존한다. 원본 행, 거래처명, 품목명,
    단가, 수량, 전표 정보(`일자-No.`)를 잃지 않는다.
  - 같은 품목/규격이라도 지점·날짜·전표에 따라 단가가 다를 수 있음을 정상 데이터로 본다.
    전역 `PurchaseStandard` 단일 기준 단가로 합치지 않는다.
  - 업로드는 본사 전용 **이카운트 업로드**(`/app/ecount-imports`) 흐름으로 한다.
    서버가 원본을 `EcountImportBatch`/`EcountImportLine`으로 저장하고, 거래처명→지점
    (`StoreExternalAlias`), 품목명/규격→품목(`ProductExternalAlias`) 매핑을 거쳐 미리보기한다.
  - 매핑 누락이 없으면 commit 시 지점별 `DailyLedger`/`LedgerPurchaseItem`으로 반영하고
    재고/FIFO를 갱신한다. 같은 파일 재업로드는 `fileHash`로 차단한다.
  - `LedgerPurchaseItem.unitPrice`는 `장부 적용 단가`(재고/FIFO/마진 계산 기준)이고,
    원본 이카운트 단가는 `EcountImportLine.unitPrice`에 보존한다. 지점장은 장부 적용 단가만
    수정할 수 있고 원본 정보는 수정할 수 없다.
  - 구현 기준은 `parseEcountSupplyWorkbook` + `previewEcountSupplyUpload` /
    `commitEcountSupplyImport`이다. 기존 `importPurchaseStandardsFromEcount`(매입 기준 생성)는
    사용 중단(deprecated)한다.
  - `PurchaseStandard`는 즉시 물리 삭제하지 않고 단계적 비활성화한다(메뉴/장부 select 제거,
    마감 전 점검에서 `매입 기준 없음`을 차단 사유로 보지 않음).

## 검토 후속(2026-06-24): 추정 매출/마진은 "판매가 계획" 기준

회의의 핵심 의도는 "아침에 정한 **판매가**(예: 1만 원짜리를 1만 3천 원에 팔겠다)로
차익/이익률을 보고, 저녁 실제 결과와 비교해 어디서 새는지 본다"이다. 그런데 일부
추정 매출/손실 계산이 **매입/적용 단가(`unitPrice`)** 기준이라 판매가 계획을 입력해도
반영되지 않았다. 이를 모두 **지점장 판매가 계획**(`StoreSalesPricePlan.plannedUnitPrice`)
기준으로 정렬한다.

- **추정 매출/랭킹/카테고리 매출(P1):** 추정 매출은 `판매수량 × 판매가 계획`으로 계산한다.
  - 지점장 "오늘 많이 팔린 품목"(`buildStoreManagerTopSoldItems`), 월간 매출 상위/하위
    랭킹(`buildMonthlyRevenueRanking`), 냉동/생물 카테고리 매출(`buildProductCategoryPerformance`)
    모두 판매가 계획을 우선 사용한다.
  - **폴백 정책:** 품목에 판매가 계획이 없으면 매입/적용 단가로 폴백하되, 폴백한 품목을
    `salesBasis="cost"` / `salesPriceFallbackItemCount`로 표시해 "판매가 미반영(추정)"임을
    화면에 명시한다(데이터 연속성 유지). COGS(원가)는 종전대로 원가 기준으로 둔다.
- **계획 판매가 대비 실제 비교(P1):** `calculateLedgerReviewSummary`에 비교 지표를 추가한다.
  - `plannedSalesTotal`(Σ 판매수량×계획 판매가), `plannedGrossProfit`(계획매출−COGS),
    `plannedGrossMarginRate`, `plannedVsActualSalesDifference`(실제 총매출−계획매출).
  - 판매 품목 중 계획 판매가가 하나라도 빠지면 비교가 왜곡되므로 `policy-unconfirmed`(기준
    확인 필요)로 내리고, 입력 자체가 없으면 `data-insufficient`로 둔다(매입단가로 조용히
    메우지 않는다).
  - **지점장 노출 범위:** 계획 매출/계획 대비 차이는 지점장 본인 판매가 계획·총매출만으로
    산출되므로 노출하고, 계획 마진율은 마진율(%) 노출 정책과 동일하게 status가 ok일 때만
    노출한다. 계획 **매출이익**(절대 이익, 원가 역산 가능)은 매출이익 차단 정책에 따라
    지점장 요약에서 제외한다.
- **손실액 판매가 폴백(P2):** 손실액은 회의 결정대로 "팔고자 한 희망 판매가격" 기준이다.
  손실 저장 시 실제로 판매가 계획을 사용했는지를 `LedgerLossItem.usedPlannedPrice`에 스냅샷으로
  저장한다. 판매가 계획이 없어 매입/기본 단가로 폴백한 손실 품목은 `usedPlannedPrice=false`로
  표시하고, 손실 입력 화면에 "판매가 미반영(폴백)"임을 경고로 안내한다(손실액이 의도보다 낮게
  잡힐 수 있음을 입력자가 인지하도록). 폴백 자체는 데이터 연속성을 위해 유지한다.
- **이카운트 공급 리포트 기대 매출/이익(P2):** 공급 리포트 요약에 판매 예정가 기반
  `estimatedSalesAmount`(Σ 수량×판매 예정가), `estimatedGrossProfit`(기대 매출−공급금액)을
  추가한다. 판매 예정가가 매핑된 행만 합산하며, 산출 범위(`plannedRowCount`/`matchedSupplyAmount`)와
  제외된 라인 수를 함께 노출해 추정 범위를 명확히 한다.
