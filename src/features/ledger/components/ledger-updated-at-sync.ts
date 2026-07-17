"use client";

import { useEffect, useRef } from "react";

const LEDGER_UPDATED_EVENT = "erp-fish:ledger-updated";
const latestLedgerSnapshot = new Map<string, LedgerUpdatedSnapshot>();

export type LedgerUpdatedSnapshot = {
  id: string;
  updatedAt: string;
  version: number;
  // Loss and inventory step responses do not include this unrelated aggregate.
  expenseTotal?: number;
};

export function notifyLedgerUpdated(snapshot: LedgerUpdatedSnapshot) {
  const previous = latestLedgerSnapshot.get(snapshot.id);

  if (previous && snapshot.version < previous.version) {
    return;
  }

  const normalizedSnapshot: LedgerUpdatedSnapshot = {
    id: snapshot.id,
    updatedAt: snapshot.updatedAt,
    version: snapshot.version,
    ...(snapshot.expenseTotal !== undefined
      ? { expenseTotal: snapshot.expenseTotal }
      : {}),
  };

  latestLedgerSnapshot.set(normalizedSnapshot.id, normalizedSnapshot);

  window.dispatchEvent(
    new CustomEvent<LedgerUpdatedSnapshot>(LEDGER_UPDATED_EVENT, {
      detail: normalizedSnapshot,
    }),
  );
}

export function useLedgerSync(
  ledgerId: string,
  onSnapshot: (snapshot: LedgerUpdatedSnapshot) => void,
) {
  const onSnapshotRef = useRef(onSnapshot);

  onSnapshotRef.current = onSnapshot;

  useEffect(() => {
    const latestSnapshot = latestLedgerSnapshot.get(ledgerId);

    if (latestSnapshot) {
      onSnapshotRef.current(latestSnapshot);
    }

    function handleLedgerUpdated(event: Event) {
      const detail = (event as CustomEvent<LedgerUpdatedSnapshot>).detail;

      if (detail?.id === ledgerId) {
        onSnapshotRef.current(detail);
      }
    }

    window.addEventListener(LEDGER_UPDATED_EVENT, handleLedgerUpdated);

    return () => {
      window.removeEventListener(LEDGER_UPDATED_EVENT, handleLedgerUpdated);
    };
  }, [ledgerId]);
}
