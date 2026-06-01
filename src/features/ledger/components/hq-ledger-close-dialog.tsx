"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { closeHqLedger } from "~/features/ledger/hq-close-actions";
import { useLedgerUpdatedAtSync } from "~/features/ledger/components/ledger-updated-at-sync";
import type { LedgerCostStepData } from "~/features/ledger/types";

type HqLedgerCloseDialogProps = {
  ledgerId: string;
  ledgerUpdatedAt: string;
  status: LedgerCostStepData["status"];
};

export function HqLedgerCloseDialog({
  ledgerId,
  ledgerUpdatedAt,
  status,
}: HqLedgerCloseDialogProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentLedgerUpdatedAt, setCurrentLedgerUpdatedAt] =
    useState(ledgerUpdatedAt);

  const isEditable = status === "IN_PROGRESS" || status === "IN_REVIEW";

  useLedgerUpdatedAtSync(ledgerId, setCurrentLedgerUpdatedAt);

  if (!isEditable) {
    return null;
  }

  async function handleConfirm() {
    setIsSubmitting(true);

    try {
      const result = await closeHqLedger({
        ledgerId,
        ledgerUpdatedAt: currentLedgerUpdatedAt,
      });

      if (!result.ok) {
        setErrorMessage(result.error.message);
        return;
      }

      setErrorMessage(null);
      setIsOpen(false);
      router.refresh();
    } catch {
      setErrorMessage("마감 요청이 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);

        if (open) {
          setErrorMessage(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          본사마감
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>장부를 마감합니다</DialogTitle>
          <DialogDescription>
            본사 마감 후에는 원본 항목을 수정할 수 없습니다. 정정 기록만
            추가할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm text-muted-foreground">
          마감하면 원본 데이터는 잠기고 보고서 기준이 사용하는 원본 값이 고정됩니다.
        </div>
        {errorMessage ? (
          <Alert role="alert" className="border-destructive/50">
            <AlertTitle>요청 처리 실패</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isSubmitting}>
              취소
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isSubmitting}
          >
            {isSubmitting ? "마감 중..." : "마감 확정"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
