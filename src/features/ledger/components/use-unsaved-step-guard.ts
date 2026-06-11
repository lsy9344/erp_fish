"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type GuardSaveResult = boolean | void | Promise<boolean | void>;

export function useUnsavedStepGuard({
  isDirty,
  onSave,
}: {
  isDirty: boolean;
  onSave: () => GuardSaveResult;
}) {
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  const requestNavigation = useCallback(
    (href: string, trigger?: HTMLElement | null) => {
      if (!isDirty) {
        window.location.href = href;
        return;
      }

      lastTriggerRef.current = trigger ?? null;
      setPendingHref(href);
      setIsDialogOpen(true);
    },
    [isDirty],
  );

  const keepEditing = useCallback(() => {
    setIsDialogOpen(false);
    setPendingHref(null);
    window.setTimeout(() => lastTriggerRef.current?.focus(), 0);
  }, []);

  const discard = useCallback(() => {
    if (pendingHref) {
      window.location.href = pendingHref;
    }
  }, [pendingHref]);

  const saveAndContinue = useCallback(async () => {
    const result = await onSave();

    if (result === false) {
      return;
    }

    if (pendingHref) {
      window.location.href = pendingHref;
    }
  }, [onSave, pendingHref]);

  return {
    isDialogOpen,
    setIsDialogOpen,
    requestNavigation,
    keepEditing,
    discard,
    saveAndContinue,
  };
}
