"use client";

import { useState } from "react";

import {
  isLedgerConflictResult,
  type ActionResult,
  type LedgerConflictPayload,
} from "~/lib/action-result";

export function useSaveConflictDialog() {
  const [conflict, setConflict] = useState<LedgerConflictPayload | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  function captureConflict<T>(result: ActionResult<T>) {
    if (!isLedgerConflictResult(result)) {
      return false;
    }

    setConflict(result.error.conflict);
    setIsOpen(true);
    return true;
  }

  function keepEditing() {
    setIsOpen(false);
  }

  function reloadLatest() {
    window.location.reload();
  }

  return {
    conflict,
    isOpen,
    setIsOpen,
    captureConflict,
    keepEditing,
    reloadLatest,
  };
}
