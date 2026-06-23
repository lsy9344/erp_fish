"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { bulkCloseHqLedgers } from "~/features/ledger/hq-close-actions";
import type { HqDashboardData } from "../types";
import type { ActionResult } from "~/lib/action-result";
import type { HqBulkCloseLedgerResult } from "~/features/ledger/hq-close-actions";

type HqDashboardBulkClosePanelProps = {
  dashboard: HqDashboardData;
  closeAction?: (
    input: unknown,
  ) => Promise<ActionResult<HqBulkCloseLedgerResult>>;
};

export function HqDashboardBulkClosePanel({
  dashboard,
  closeAction = bulkCloseHqLedgers,
}: HqDashboardBulkClosePanelProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const closeableRows = useMemo(
    () =>
      dashboard.rows.filter(
        (row) =>
          row.ledgerId &&
          (row.ledgerStatus.key === "IN_PROGRESS" ||
            row.ledgerStatus.key === "IN_REVIEW"),
      ),
    [dashboard.rows],
  );
  const ledgerIds = closeableRows
    .map((row) => row.ledgerId)
    .filter((ledgerId): ledgerId is string => Boolean(ledgerId));

  function runBulkClose() {
    const trimmedReason = reason.trim();

    if (trimmedReason.length === 0) {
      setError("일괄 마감 사유를 입력해 주세요.");
      return;
    }

    setError(null);
    setMessage(null);

    startTransition(async () => {
      const result = await closeAction({
        ledgerIds,
        reason: trimmedReason,
        simplified: true,
      });

      if (!result.ok) {
        setError(result.error.message);
        toast.error(result.error.message);
        return;
      }

      const nextMessage = `본사 일괄 마감 ${result.data.closedCount}건 완료`;
      setMessage(nextMessage);
      setOpen(false);
      setReason("");
      toast.success(nextMessage);
    });
  }

  return (
    <section
      className="bg-card text-card-foreground rounded-lg border p-4"
      aria-label="본사 일괄 마감"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium">본사 일괄 마감</p>
          <p className="text-muted-foreground text-xs">
            현재 조회된 입력 중/검토 대기 장부 {ledgerIds.length}건을 점검 없이
            간소화 마감합니다.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          disabled={ledgerIds.length === 0 || isPending}
        >
          일괄 마감
        </Button>
      </div>
      {message ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2Icon className="size-4" aria-hidden />
          {message}
        </p>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>본사 일괄 마감</DialogTitle>
            <DialogDescription>
              수동 검토 단계를 생략하고 조회된 마감 가능 장부를 즉시 본사
              마감합니다.
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="hq-bulk-close-reason">
              일괄 마감 사유
            </FieldLabel>
            <Input
              id="hq-bulk-close-reason"
              value={reason}
              maxLength={500}
              onChange={(event) => {
                setReason(event.currentTarget.value);
                setError(null);
              }}
              disabled={isPending}
            />
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              취소
            </Button>
            <Button type="button" onClick={runBulkClose} disabled={isPending}>
              {isPending ? "마감 중..." : `${ledgerIds.length}건 마감`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
