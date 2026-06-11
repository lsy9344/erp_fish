"use client";

import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import type { LedgerConflictPayload } from "~/lib/action-result";

type SaveConflictDialogProps = {
  open: boolean;
  conflict: LedgerConflictPayload | null;
  onOpenChange: (open: boolean) => void;
  onReload: () => void;
  onKeepEditing: () => void;
};

const sectionLabels: Record<string, string> = {
  sales: "매출/결제",
  expenses: "비용",
  purchases: "매입",
  inventory: "재고",
  "inventory-adjustment": "재고 조정",
  losses: "손실/폐기",
  work: "근무",
  review: "검토 제출",
  "hq-close": "본사마감",
};

function formatModifiedAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "표시할 수 없는 값";
  }
}

export function SaveConflictDialog({
  open,
  conflict,
  onOpenChange,
  onReload,
  onKeepEditing,
}: SaveConflictDialogProps) {
  if (!conflict) {
    return null;
  }

  const fieldNames = Array.from(
    new Set([
      ...Object.keys(conflict.clientValues),
      ...Object.keys(conflict.serverValues),
    ]),
  );
  const sectionLabel = sectionLabels[conflict.section] ?? conflict.section;
  const lastModifiedBy = conflict.lastModifiedBy ?? "수정자 확인 필요";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-labelledby="save-conflict-dialog-title"
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle id="save-conflict-dialog-title">
            저장 충돌이 발생했습니다
          </DialogTitle>
          <DialogDescription>
            같은 장부의 {sectionLabel} 영역이 다른 화면에서 먼저 저장됐습니다.
            최신값을 확인한 뒤 다시 저장해 주세요.
          </DialogDescription>
        </DialogHeader>

        <Alert className="border-amber-500/50">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertTitle className="flex flex-wrap items-center gap-2">
            <span>최신 상태 재확인 필요</span>
            {conflict.hqEditing ? (
              <Badge variant="outline">본사 수정 중</Badge>
            ) : null}
          </AlertTitle>
          <AlertDescription className="grid gap-1">
            <p>마지막 수정자: {lastModifiedBy}</p>
            <p>수정 시각: {formatModifiedAt(conflict.lastModifiedAt)}</p>
            <p>
              내 token {formatValue(conflict.clientToken)} / 서버 token{" "}
              {formatValue(conflict.serverToken)}
            </p>
          </AlertDescription>
        </Alert>

        <div className="grid gap-2" aria-label="저장 충돌 값 비교">
          {fieldNames.length > 0 ? (
            fieldNames.map((fieldName) => (
              <div
                key={fieldName}
                className="grid gap-2 rounded-md border border-amber-500/50 p-3 sm:grid-cols-[minmax(7rem,0.8fr)_minmax(0,1fr)_minmax(0,1fr)]"
              >
                <div className="min-w-0">
                  <p className="text-muted-foreground text-xs">항목</p>
                  <p className="break-words text-sm font-medium">
                    {fieldName}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-muted-foreground text-xs">내 입력값</p>
                  <p className="break-words text-sm">
                    {formatValue(conflict.clientValues[fieldName])}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-muted-foreground text-xs">서버 최신값</p>
                  <p className="break-words text-sm font-medium">
                    {formatValue(conflict.serverValues[fieldName])}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              비교할 필드가 없습니다. 최신 장부를 다시 불러와 상태를 확인해
              주세요.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onKeepEditing}>
            계속 편집
          </Button>
          <Button type="button" onClick={onReload}>
            <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
            최신값 다시 불러오기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
