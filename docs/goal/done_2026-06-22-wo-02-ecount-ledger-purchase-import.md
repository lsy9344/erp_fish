# WO-02 ECount Ledger Purchase Import Implementation Plan

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
