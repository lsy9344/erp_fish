# HANDOFF: 강서수산 8/3 이익률 차이(엑셀 시트 vs DB) 깊이 재조사

작성일: 2026-08-07 / 최종 갱신: 2026-08-08 / 상태: **원인 확정·코드 수정·운영 DB 보정 완료**

## 1. 문제 정의

고객이 제공한 엑셀 장부 `장부-202608강서.xlsx`의 **'3' 시트(2026-08-03 강서)** 이익률이
우리 운영 DB(Neon)가 계산한 이익률과 다르다. 차이의 원인을 품목·입력 경로 수준까지
완전히 특정하는 것이 이 조사의 목표다.

아래 1~7절의 DB 수치는 2026-08-08 보정 transaction 전 조사 snapshot이다. 최종 적용 상태와
독립 검증 결과는 8절에 기록한다.

- 엑셀 원본 위치: `C:\Users\dltnd\Desktop\garbage\장부-202608강서.xlsx`
  (WSL: `/mnt/c/Users/dltnd/Desktop/garbage/장부-202608강서.xlsx`)

| 수치 | 엑셀 '3' 시트 | DB(앱 계산) | 비고 |
|---|---|---|---|
| 매출 | 2,267,000 | 2,267,000 | 동일 |
| 매출원가 | 1,627,730 | 1,612,170 | **DB가 15,560 낮음** |
| 매출이익 | 639,270 | 654,830 | |
| **이익률** | **28.20%** | **28.89%** | **0.69%p 차이** |
| 매입 합계 | 1,715,500 | 1,715,500 | 동일 |
| 지출 | 90,000 (식대 30k+얼음 60k) | 동일 | 이익률에는 영향 없음 |
| 전일재고 | 2,449,310 | (금액 직접 저장 안 함) | |
| 당일재고 | 2,537,080 | FIFO 잔액 합 2,537,530 / 요약 표시는 2,563,140 | 표시값 차이도 설명 필요 |

- DB 장부: storeId `cmqs3j6gr0029jrdwbtwrhwuv` (강서수산), closingDate `2026-08-04T00:00Z` 아님 → **`2026-08-03T00:00:00.000Z`**, ledgerId `cmsciv10x001yl104n7u4l1ds`, 상태 IN_REVIEW v10, 작성자 이현호, 정정(CorrectionRecord) 0건.
- 이 장부의 이익률 지표는 앱에서 **"확인 필요(policy-unconfirmed)"** 상태. 이유: 일부 품목에
  FIFO lot가 없어(예: 오징어 25미B rows lots=[]) `calculateCostOfGoodsSold`가 전체 품목에 대해
  **폴백 공식** `Σ round((전일+매입−당일) × 행단가)`를 사용했기 때문.

## 2. 양쪽 계산 방식(반드시 먼저 이해할 것)

- 엑셀: `원가 = 전일재고금액(시트'2') + 매입금액 − 당일재고금액(시트'3')`. 금액은 점주가
  각 행의 `단가×수량`으로 직접 기재. 규격별 행이 분리됨(오징어 20미/25미/25미A 별도 행).
- DB: FIFO lot(consumedAmount)가 전 품목 완전할 때만 FIFO 합계를 쓰고, 하나라도 없으면
  전 품목 폴백 공식(행 unitPrice 기준). 코드: `src/server/calculations/ledger.ts`
  (`calculateCostOfGoodsSold`, `canUseFifoConsumedAmounts`, `calculateLedgerReviewSummary`).
  호출 구성은 `src/features/ledger/review-queries.ts` `getLedgerReviewStepData`,
  대시보드 경로는 `src/features/dashboard/queries.ts` (정정 overlay 적용).

## 3. 1차 대사 결과 (초기 관찰; 2026-08-08 재조사로 확정)

품목 단위 대사(스크립트: `tmp/gen-excel-0803.py` → `tmp/recon-0803.py`, DB 덤프 `tmp/db0803.json`):

| 품목 | DB원가 − 엑셀원가 | 관찰 사실 |
|---|---|---|
| 오징어 | **−14,000** | 아래 4절 상세 |
| 바지락 | −1,500 | 매입 공급가액 31,500(양쪽 동일)인데 재고행 unitPrice=30,000 |
| 생합 | −450 | 당일 수량 DB 0.9 vs 시트 0.89 |
| 냉)참조기 | +390 | 시트 '40-42A' 3마리×30,000 존재. DB는 40-42 단일행 31,000으로 전량 계산 |
| 나머지 19품목 | 0 | 수량·단가 일치 |
| **합계** | **−15,560** | |

위 표는 첫 대사에서 확인한 차이와 당시의 관찰을 기록한 것이다. 아래 오징어 항목의
단가·매핑 원인은 초기에는 가설 상태였지만, 2026-08-08 재조사에서 ECOUNT 원문과
과거 업로드 이력으로 확정하거나 반박했다. 최종 적용값과 검증값은 8절을 기준으로 한다.

## 4. 오징어 문제 — 초기 관찰과 재조사 결론

엑셀 시트에는 규격이 다른 오징어가 **별도 행**으로 있다:
- 시트'2'(전일): 20미 2@58,000 / **25미 8@52,000**
- 시트'3'(당일): 20미 1.5@58,000 / **25미A 5@45,000** / 25미 1@52,000
- 시트'3' 매입: `오징어 [25미]A` 5 × 45,000 = 225,000

DB 마스터에는 오징어 규격이 **9종**(25미, 25미A, 25미B, 25미파, 25미.a, 25미.b, 20미, 20미A, 30미)이나 된다.

초기 대사에서 확인한 사실과 미해결 질문(쿼리 재현: `tmp/q-squid.ts`)은 다음처럼
2026-08-08 재조사에서 정리됐다.

1. 8/3 매입행의 DB 원문은 `rawProductName="오징어 [25미]"`, `productSpec="25미"`,
   `productId="cmr2q7d4b0001jo04qpsmeuuh"`였다. 엑셀의 25미A 표기와 다르다는 관찰만으로
   25미A alias 오매핑이라고 단정할 수 없었고, DB 원문에 맞는 25미 매핑으로 확인됐다.
2. 8/3 재고행 오징어[25미]는 prev=8, purch=5, cur=6, `unitPrice=50,000`이었다.
   첫 대사에서는 50,000원의 기원이 미상이었지만, FIFO lot는 전일 8×52,000원과 당일
   매입 5×45,000원을 보존하고 있었다.
3. 전일 수량·단가는 8/1 장부의 마감재고 이월에서 왔고, 50,000원은 7/29 ECOUNT 업로드
   line의 원본/적용 단가에서 승계된 것으로 확정됐다. 이는 숨은 계산값이나 25미A alias에서
   생성된 값이 아니다.

### 초기 미해결 질문 — 2026-08-08 재조사 결과
- [x] 25미A 마스터가 있는데 왜 25미에 연결됐는가? -- DB ECOUNT 원문 자체가 25미였고,
      별도 25미A alias는 정상 연결되어 있어 alias는 변경하지 않았다.
- [x] `LedgerInventoryItem.unitPrice`의 결정 경로는 무엇인가? -- 7/29 업로드 단가가
      8/1·8/3 이월 표시 단가로 승계됐고, FIFO lot 단가와는 별개였다.
- [x] 50,000원의 기원은 무엇인가? -- 7/29 ECOUNT 업로드 line에서 확인했다.
- [ ] 중복 규격 마스터와 참조기 40-42/40-42A의 정규화 원인 -- 이번 강서수산 보정 범위
      밖의 후속 조사로 남긴다.
- [x] 폴백 공식의 적용 범위는 무엇인가? -- 비제로 흐름에서 lot가 없으면 기존 전체 폴백을
      유지하고, 0수량·0흐름 빈 lot만 0원 근거로 인정하도록 코드와 테스트를 확정했다.

## 5. 데이터 접근 방법

- 운영 DB: Neon. 접속문자열은 `.env.local`의 `DATABASE_URL_UNPOOLED`(sslmode=require).
  로컬 docker DB는 비어 있음(샘플 지점만) — 속지 말 것.
- 재현 스크립트(모두 `tmp/`):
  - `tmp/q-brief.ts` — 특정 날짜 장부 요약(앱 계산 함수 직접 호출, `node --experimental-strip-types`)
  - `tmp/q-db-0803.ts` → `tmp/db0803.json` — 8/3 장부 원본(품목별 prev/purch/cur/unitPrice/fifoLots/매입)
  - `tmp/q-spec2.ts` — 재고행+품목 규격 출력
  - `tmp/q-squid.ts` — 오징어 마스터 9종/매입 productId/FIFO lot 조회
  - `tmp/gen-excel-0803.py` → `tmp/excel0803.json` — 엑셀 시트2/3 파싱
  - `tmp/recon-0803.py` — 품목별 원가 대사(차이 품목만 출력)
- 엑셀 원본:
  - 호스트 PC(Windows) 경로: `C:\Users\dltnd\Desktop\garbage\장부-202608강서.xlsx`
  - WSL 접근 경로: `/mnt/c/Users/dltnd/Desktop/garbage/장부-202608강서.xlsx`
  (시트 '1'~'31' = 8월 일자별 장부, '이월', '근무표'. 시트'2'는 8/2인데 날짜란 공백,
  매출 0 — 시트'3'의 전일재고 근거로 쓰임. 전일재고 2,449,310 = 시트'2' 냉동1,383,910+생물1,065,400)
- 앱 계산 로직: `src/server/calculations/ledger.ts`, `inventory.ts` / 호출부 `src/features/ledger/review-queries.ts`

## 6. 주의 사항

- DB 운영데이터는 7/29 리셋 이력 있음(`tmp/db-backups/`, `scripts/reset-neon-data.mjs`).
  7/28 이전 장부·LINE 발송 로그는 없음. 과거 단가 추적은 Historical* 테이블과 엑셀 파일에 의존.
- 초기 조사 단계는 읽기 전용으로 수행했다. 이후 별도 승인된 보정 transaction을 완료했으며,
  그 후속 검증과 일반 조사는 읽기 전용으로 수행한다.
- 이익률 비교 시 "앱 표시 이익률"이 어느 경로 값인지 구분할 것:
  검토 화면(review-queries)과 대시보드(dashboard/queries, 정정 overlay)가 다를 수 있음. 현재 8/3은 정정 0건이라 동일.
- 엑셀에는 '관리자모드 - 매출 분석' 패널(AD열, 매출 2,162,999 / 이익률 27.89%)이 또 있는데
  이는 수량×단가 추정 기반의 제3의 수치라 본 비교 대상이 아님.

## 7. 산출물 기대치

1. 15,560원 차이의 품목별 확정 근거 (위 3절 표 검증 또는 반박)
2. 오징어 25미/25미A 문제의 입력 경로 특정 (누가/어느 기능이 25미에 연결했는지)
3. 행 unitPrice 50,000의 기원 추적 결과
4. 재발 방지 제안: 규격 정규화, 매입-품목 매핑 검증, 폴백 공식 기준(행단가 vs FIFO) 정책 판단

## 8. 재조사 확정 결과 및 운영 DB 보정 완료 (2026-08-08)

### 확정 결과 (보정 전 원본과 목표)

- 엑셀 시트 원본 행은 25미A로 표기되지만, 8/3 장부의 실제 DB ECOUNT 원본 line `cmsciuhch001pl204adpfso6f`는 `rawProductName="오징어 [25미]"`, `productSpec="25미"`, `productId="cmr2q7d4b0001jo04qpsmeuuh"`였다. 따라서 DB에 저장된 이 line의 25미 매핑 자체는 DB 원문과 일치한다. 별도 25미A alias `cmrwsblno0001kv04plhg34il`은 `cmrto9cx40001k004i6z3hgw3`에 정상 연결되어 있고 **alias는 변경하지 않는다**.
- 7/31 활문어 ECOUNT 원본 line `cms85g96a003jla04qyrxyqnt`는 수량 2, 원본 단가 14,000원, 공급가액 28,000원이며, `LedgerPurchaseItem`의 적용 단가도 14,000원이었다. 이 적용 단가를 18,000원으로 보정해야 8/3 FIFO 활문어 원가가 엑셀과 일치한다. ECOUNT 원본 `unitPrice`와 `LedgerPurchaseItem.sourceUnitPrice`는 보존 대상이다.
- 오징어 행의 50,000원 기원은 7/29 ECOUNT 업로드 line `cms5ch7op001jjv04i5uawbwh`의 원본/적용 단가 50,000원(12개)으로 확인된다. 이 값이 7/29 재고행과 이후 이월 행의 `LedgerInventoryItem.unitPrice`로 승계됐고, 8/1의 52,000원 매입 lot와는 별개의 표시용 이월 단가였다. 숨은 계산값이나 25미A alias에서 생성된 값은 아니다.
- 8/3 생합 재고행 `cmsdkclq4000ll704z6kr4j2i`는 전일 1.2, 매입 0, 당일 `currentQuantity=quantity=0.9`, 단가 45,000원이다. 엑셀의 0.89와 0.01 차이로 FIFO 원가가 450원 부족하다.
- 기존 행 단가 폴백 원가는 1,612,170원, 현재 저장된 FIFO lot 합계는 1,622,480원, FIFO 잔액은 2,537,530원이다. 0수량·0매입·0당일재고인데 `fifoLots=[]`인 행을 0원 근거로 인정하면 전체 장부 폴백이 해제되고, 코드 수정 후 남는 차이는 생합 450원과 활문어 4,800원뿐이다.
- 따라서 보정 후 기대값은 매출원가 1,627,730원, 매출이익 639,270원, 이익률 28.20%, FIFO 당일재고 2,537,080원이다.

### 운영 DB 보정 완료

`scripts/repair-gangseo-0803-fifo.mjs`를 작성해 dry-run과 독립 안전 검토를 통과한 뒤 운영 DB에 적용했다. 스크립트는 기본 읽기 전용이고, 쓰기 실행 시에도 사전조건·Serializable 격리·버전 충돌·커밋 전 목표값을 모두 검증한다.

- 적용 전 대상 지점/장부는 강서수산 `cmqs3j6gr0029jrdwbtwrhwuv`, 7/31 `cms85gd2y002nl704s1oldmf7` v9, 8/1 `cms9or5hq0024l504v7caqtsj` v10, 8/3 `cmsciv10x001yl104n7u4l1ds` v10이었다.
- 정확한 대상 purchase `cms8rhuu0000nl404xarbbxi8`(7/31 활문어 2×14,000원)의 적용 단가/28,000원 금액을 2×18,000원/36,000원으로 변경했다. (원본 line ID `cms85g96a003jla04qyrxyqnt`, 원본 단가 14,000원 보존.)
- 8/3 생합 행을 0.90에서 0.89로 변경했다.
- 단일 Serializable transaction에서 7/31 → 8/1 → 8/3 순서로 FIFO를 재생성하고, 각 관련 장부의 version·updatedBy·updatedAt 및 repair AuditLog를 남겼다.
- actor `admin@example.com`의 본사 활성 상태와 `LEDGER_CLOSED_EDIT` 권한, 기존 보정 AuditLog 0건, 8/3 correction 0건, 현재 원가/재고 합계를 검증했다. 예상 ID·단가·수량·버전이 다르면 전체를 중단하도록 했다.
- dry-run `node --experimental-strip-types scripts/repair-gangseo-0803-fifo.mjs`에서 `writesAttempted: 0`과 전체 사전조건 통과를 확인했다.
- 승인 후 `node --experimental-strip-types scripts/repair-gangseo-0803-fifo.mjs --apply --confirm-remote-db`를 1회 실행했다. transaction 내부 검증 결과는 매출 2,267,000원, FIFO 원가 1,627,730원, FIFO 재고 2,537,080원, 매출이익 639,270원, 표시 이익률 28.20%다.
- 독립 읽기 전용 재조회에서도 생합 0.89·소비액 13,950원, 활문어 적용 단가 18,000원, `sourceUnitPrice` 및 ECOUNT 원본 단가 14,000원 보존, 대상 장부 version 10/11/11, repair AuditLog 3건을 확인했다.
- 코드에서는 0수량 빈 lot 행만 0원 FIFO 근거로 인정하고 HQ 재고 입력을 소수 둘째 자리까지 허용했다. 관련 단위 테스트와 변경 파일 lint는 통과했다. 운영 화면에 새 FIFO 선택 로직을 반영하려면 이 코드의 일반 배포 절차가 별도로 필요하다.
