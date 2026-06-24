# WO-02 ECount Ledger Purchase Import Implementation Plan

> **폐기/대체됨 (2026-06-24).** 이 문서는 이카운트 엑셀을 `매입 기준` 또는 단일 장부 범위로
> 다루던 이전 정책에 기반한다. 2026-06-24 정책 전환으로 이카운트 엑셀은 `본사 출고 / 지점 입고
> 원장`으로 재정의되었고, 다중 지점 업로드·원본 보존(`EcountImportBatch`/`EcountImportLine`)·
> 지점/품목 alias 매핑·preview/commit 흐름으로 재설계되었다. 현행 기준 문서는
> `docs/goal/2026-06-24-ecount-supply-work-order.md`와
> `docs/ecount-supply-import-operations.md`이며, 본 문서는 이력 보존 목적으로만 남긴다.

**Goal:** Let headquarters upload an ECount xlsx file into a selected daily ledger and create locked `LedgerPurchaseItem` rows with `sourceType = ECOUNT_UPLOAD`.

## Background

The ECount purchase xlsx parser already exists in `src/features/ledger/ecount-purchase-import.ts`.
Purchase standards import (master data) exists in `src/features/master-data/purchase-standard-import-actions.ts`.
What's missing is a **ledger-level** upload that maps parsed rows to existing products/purchase-standards and writes `LedgerPurchaseItem` rows linked to a specific `DailyLedger`.

## Scope

- HQ only: store managers can view but not create/edit/delete `ECOUNT_UPLOAD` rows
- Preview step shows parsed rows before committing
- Commit step creates `LedgerPurchaseItem` rows, then refreshes FIFO lots

## Files

- Create: `src/features/ledger/ecount-purchase-actions.ts`
- Create: `src/features/ledger/components/ecount-purchase-upload-client.tsx`
- Modify: `src/app/app/ledgers/[ledgerId]/page.tsx` — add upload tab/section for HQ
- Modify: `src/features/ledger/hq-edit-actions.ts` — allow HQ to override unit price/quantity with reason
- Modify: `src/features/ledger/purchase-edit-policy.ts` — keep store block, allow HQ override
