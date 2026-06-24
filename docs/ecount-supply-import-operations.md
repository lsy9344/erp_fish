# 이카운트 출고/입고 업로드 운영 매뉴얼

작성일: 2026-06-24
기준 작업지시서: `docs/goal/2026-06-24-ecount-supply-work-order.md`
기준 컨셉 문서: `docs/goal/2026-06-24-ecount-supply-concept-review-and-improvement-direction.md`

## 1. 개념

이카운트 엑셀은 품목별 단일 `매입 기준` 단가를 만드는 파일이 아니라, **본사가 각
지점에 어떤 품목을 얼마에 공급했는지** 담은 `본사 출고 / 지점 입고 원장`이다. 같은 품목/규격이라도
지점·날짜·전표(`일자-No.`)에 따라 단가가 다를 수 있으며, 이를 정상 데이터로 보존한다.

## 2. 용어

| 용어 | 의미 |
| --- | --- |
| 이카운트 업로드 | 본사 전용 출고/입고 파일 업로드 메뉴. 경로 `/app/ecount-imports` |
| 본사 출고 / 지점 입고 | 한 파일의 각 행. 본사 관점은 출고, 지점장 관점은 입고/매입 |
| 이카운트 출고/입고 라인 | `LedgerPurchaseSource.ECOUNT_UPLOAD` 라인 (구 "ECOUNT_UPLOAD 매입") |
| 원본 이카운트 단가 | 본사가 파일에서 불러온 단가. `EcountImportLine.unitPrice`에 보존. 수정 불가 |
| 장부 적용 단가 | 장부 행에 최종 저장되는 단가. `LedgerPurchaseItem.unitPrice`. 재고/FIFO/마진 계산 기준 |
| 품목 참고 단가 | `Product.defaultUnitPrice`. 품목 선택 시 시작값으로만 채움 |

`매입 기준`(`PurchaseStandard`)은 deprecated이다. 즉시 물리 삭제하지 않고 단계적으로 비활성화한다.

## 3. 업로드 → commit 흐름

1. 본사가 하루 전체 이카운트 파일을 업로드한다(`previewEcountSupplyUpload`).
2. 서버가 파일 `fileHash`를 계산해 중복 업로드를 차단한다. 중복이면 기존 batch를 안내한다.
3. 파싱 결과를 `EcountImportBatch` + `EcountImportLine`으로 저장하고 원본 행을 보존한다.
4. 거래처명→지점(`StoreExternalAlias`), 품목명/규격→품목(`ProductExternalAlias`) 매핑 상태를 계산한다.
   - 미매핑이 있으면 batch 상태 `MAPPING_REQUIRED`.
   - 모두 매핑되면 `READY`.
5. 미리보기 화면에서 운영자가 미매핑 거래처/품목을 매핑한다(`saveEcountStoreAlias`,
   `saveEcountProductAlias`). 저장된 매핑은 다음 업로드에서 자동 적용된다.
6. `READY` 상태에서 commit한다(`commitEcountSupplyImport`).
   - 하나의 transaction 안에서 지점별 `DailyLedger`를 찾거나 생성하고, 각 라인을
     `LedgerPurchaseItem`으로 저장한다.
   - 일부 지점 실패 시 **전체 rollback**한다(부분 성공 없음).
   - 재고 purchased quantity와 FIFO lot을 갱신한다.
   - 성공 시 batch/line 상태를 `COMMITTED`로 바꾼다.

## 4. 상태값

`PREVIEW` → `MAPPING_REQUIRED` / `READY` → `COMMITTED` / `FAILED` / `VOIDED`

화면 표시명: 미리보기 / 매핑 필요 / commit 가능 / 완료 / 실패 / 취소

## 5. 단가 정책

- `LedgerPurchaseItem.unitPrice` = 장부 적용 단가. `amount = unitPrice * quantity`.
- 원본 이카운트 단가는 `EcountImportLine.unitPrice`(+ 필요 시 `LedgerPurchaseItem.sourceUnitPrice`)에 보존.
- 지점장은 장부 적용 단가만 수정할 수 있다(사유 선택). 원본 정보(품목, 원본 행, 원본 거래처명,
  원본 `일자-No.`, 수량)는 수정할 수 없다. 새 `ECOUNT_UPLOAD` 행을 직접 만들 수 없다.
  비상 수동 입력은 `MANUAL` 라인으로만 허용한다.
- 본사는 장부 적용 단가를 보정할 수 있고, 이때 원본 단가/변경 전·후 단가/수정자/사유를 감사 로그에 남긴다.
- 원본 단가와 적용 단가가 다르면 화면과 감사 로그에서 차이를 확인할 수 있다.

## 6. 취소와 재처리

- MVP는 `voidEcountSupplyImport(batchId, reason)`까지 구현한다.
  - commit 전 batch는 취소 가능하다.
  - commit 후 batch 취소는 장부 정정 정책이 정해지기 전까지 막는다(감사 로그 없이 삭제 금지).
- `reprocessEcountSupplyImport(batchId)`(매핑 변경 후 재처리, 실패 행 재시도)는 **후속 작업**이다.
  현재는 구현하지 않고 문서에만 남긴다.

## 7. 추정 표기 원칙

실제 품목별 판매 데이터(POS)가 없으므로, 마진/성과/매출 관련 값은 화면과 문서에서 반드시
`추정`으로 표시한다. `확정 매출`, `확정 이익률`, `확정 마진` 표현을 쓰지 않는다.

## 8. 권한

- 본사: 업로드, 매핑 생성/수정, commit, 미반영 batch 취소, 반영된 장부 적용 단가 보정.
- 지점장: 반영된 이카운트 입고 라인 조회, 장부 적용 단가 수정, 판매 예정가 입력.
  원본 연결 정보 수정 차단.
