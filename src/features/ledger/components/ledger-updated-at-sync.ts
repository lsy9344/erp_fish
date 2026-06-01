"use client";

import { useEffect } from "react";

const LEDGER_UPDATED_EVENT = "erp-fish:ledger-updated";
const latestLedgerUpdatedAt = new Map<string, string>();

type LedgerUpdatedEventDetail = {
  ledgerId: string;
  updatedAt: string;
};

export function notifyLedgerUpdated(ledgerId: string, updatedAt: string) {
  latestLedgerUpdatedAt.set(ledgerId, updatedAt);

  window.dispatchEvent(
    new CustomEvent<LedgerUpdatedEventDetail>(LEDGER_UPDATED_EVENT, {
      detail: { ledgerId, updatedAt },
    }),
  );
}

export function useLedgerUpdatedAtSync(
  ledgerId: string,
  onUpdatedAt: (updatedAt: string) => void,
) {
  useEffect(() => {
    const latestUpdatedAt = latestLedgerUpdatedAt.get(ledgerId);

    if (latestUpdatedAt) {
      onUpdatedAt(latestUpdatedAt);
    }

    function handleLedgerUpdated(event: Event) {
      const detail = (event as CustomEvent<LedgerUpdatedEventDetail>).detail;

      if (detail?.ledgerId === ledgerId) {
        onUpdatedAt(detail.updatedAt);
      }
    }

    window.addEventListener(LEDGER_UPDATED_EVENT, handleLedgerUpdated);

    return () => {
      window.removeEventListener(LEDGER_UPDATED_EVENT, handleLedgerUpdated);
    };
  }, [ledgerId, onUpdatedAt]);
}
