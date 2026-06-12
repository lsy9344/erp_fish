"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
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
import {
  closeHqLedger,
  runHqLedgerClosePreflight,
} from "~/features/ledger/hq-close-actions";
import { useLedgerUpdatedAtSync } from "~/features/ledger/components/ledger-updated-at-sync";
import { SaveConflictDialog } from "~/features/ledger/components/save-conflict-dialog";
import { useSaveConflictDialog } from "~/features/ledger/components/use-save-conflict-dialog";
import type {
  HqLedgerClosePreflightItem,
  HqLedgerClosePreflightResult,
  HqLedgerClosePreflightSeverity,
} from "~/features/ledger/hq-close-preflight";
import { isLedgerConflictResult } from "~/lib/action-result";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
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
  const [isChecking, setIsChecking] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [preflight, setPreflight] =
    useState<HqLedgerClosePreflightResult | null>(null);
  const [currentLedgerUpdatedAt, setCurrentLedgerUpdatedAt] =
    useState(ledgerUpdatedAt);
  const saveConflict = useSaveConflictDialog();

  const isEditable = status === "IN_PROGRESS" || status === "IN_REVIEW";
  const isPreflightStale =
    preflight !== null && preflight.ledgerUpdatedAt !== currentLedgerUpdatedAt;
  const canConfirm =
    preflight !== null &&
    preflight.canClose &&
    !isPreflightStale &&
    !isChecking &&
    !isSubmitting;

  useLedgerUpdatedAtSync(ledgerId, setCurrentLedgerUpdatedAt);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    void loadPreflight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isEditable) {
    return null;
  }

  async function handleConfirm() {
    if (!preflight || isPreflightStale) {
      setErrorMessage("마감 전 점검 결과가 최신이 아닙니다. 재점검해 주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await closeHqLedger({
        ledgerId,
        ledgerUpdatedAt: preflight.ledgerUpdatedAt,
      });

      if (!result.ok) {
        if (isLedgerConflictResult(result)) {
          saveConflict.captureConflict(result);
        }
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

  async function loadPreflight() {
    setIsChecking(true);
    setErrorMessage(null);

    try {
      const result = await runHqLedgerClosePreflight({ ledgerId });

      if (!result.ok) {
        setPreflight(null);
        setErrorMessage(result.error.message);
        return;
      }

      setPreflight(result.data);
      setCurrentLedgerUpdatedAt(result.data.ledgerUpdatedAt);
    } catch {
      setPreflight(null);
      setErrorMessage("마감 전 점검을 실행하지 못했습니다.");
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);

          if (open) {
            setErrorMessage(null);
          } else {
            setPreflight(null);
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
          <div className="text-muted-foreground text-sm">
            마감하면 원본 데이터는 잠기고 보고서 기준이 사용하는 원본 값이
            고정됩니다.
          </div>
          {isChecking ? (
            <Alert>
              <AlertTitle>마감 전 점검 중</AlertTitle>
              <AlertDescription>
                권한, 장부 상태, 필수 누락, 계산 상태, 이월과 기준 확인 항목을
                확인하고 있습니다.
              </AlertDescription>
            </Alert>
          ) : null}
          {preflight ? (
            <div className="flex flex-col gap-3">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">장부</span>
                  <div className="font-medium">
                    {preflight.storeName} ·{" "}
                    {new Date(preflight.closingDate).toLocaleDateString(
                      "ko-KR",
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">점검 실행</span>
                  <div className="font-medium">
                    {preflight.executedBy.name ??
                      preflight.executedBy.email ??
                      "본사"}
                    {" · "}
                    {new Date(preflight.executedAt).toLocaleString("ko-KR")}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="destructive">
                  차단 {preflight.summary.blockingCount}
                </Badge>
                <Badge variant="secondary">
                  사유 필요 {preflight.summary.exceptionAllowedCount}
                </Badge>
                <Badge variant="outline">
                  경고 {preflight.summary.warningCount}
                </Badge>
                <Badge variant="outline">
                  정보 {preflight.summary.infoCount}
                </Badge>
              </div>
              {isPreflightStale ? (
                <Alert variant="destructive">
                  <AlertTitle>재점검 필요</AlertTitle>
                  <AlertDescription>
                    장부 token이 바뀌었습니다. 최신 상태로 ClosePreflight를 다시
                    실행해야 마감할 수 있습니다.
                  </AlertDescription>
                </Alert>
              ) : null}
              <ClosePreflightTable items={preflight.items} />
            </div>
          ) : null}
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
              variant="outline"
              onClick={() => void loadPreflight()}
              disabled={isChecking || isSubmitting}
            >
              {isChecking ? "점검 중..." : "재점검"}
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={!canConfirm}
            >
              {isSubmitting
                ? "마감 중..."
                : preflight?.canClose && !isPreflightStale
                  ? "마감 확정"
                  : "차단 항목 보완 필요"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SaveConflictDialog
        open={saveConflict.isOpen}
        conflict={saveConflict.conflict}
        onOpenChange={saveConflict.setIsOpen}
        onReload={saveConflict.reloadLatest}
        onKeepEditing={saveConflict.keepEditing}
      />
    </>
  );
}

function ClosePreflightTable({
  items,
}: {
  items: HqLedgerClosePreflightItem[];
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>조건명</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>설명</TableHead>
            <TableHead>필요한 조치</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="min-w-32 font-medium whitespace-normal">
                {item.label}
              </TableCell>
              <TableCell className="whitespace-normal">
                <Badge variant={getSeverityBadgeVariant(item.severity)}>
                  {getSeverityText(item.severity)}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground min-w-60 whitespace-normal">
                {item.detail}
              </TableCell>
              <TableCell className="min-w-40 whitespace-normal">
                {item.href ? (
                  <Button asChild variant="link" className="h-auto p-0">
                    <a href={item.href}>{item.actionLabel}</a>
                  </Button>
                ) : (
                  item.actionLabel
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function getSeverityText(severity: HqLedgerClosePreflightSeverity) {
  if (severity === "blocking") {
    return "차단";
  }

  if (severity === "warning") {
    return "경고";
  }

  if (severity === "exception-allowed") {
    return "사유 필요";
  }

  return "정보";
}

function getSeverityBadgeVariant(severity: HqLedgerClosePreflightSeverity) {
  if (severity === "blocking") {
    return "destructive";
  }

  if (severity === "exception-allowed") {
    return "secondary";
  }

  return "outline";
}
