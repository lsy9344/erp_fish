"use client";

import {
  AlertCircleIcon,
  CheckCircle2Icon,
  LoaderCircleIcon,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type LedgerSaveStatusProps = {
  stepLabel: string;
  authorDisplayName?: string | null;
  updatedAt: string;
  isSaving?: boolean;
  errorMessage?: string | null;
  successMessage?: string | null;
  unsavedFields?: string[];
  onRetry?: () => void;
  retryDisabled?: boolean;
};

function formatSavedAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function formatAuthorDisplayName(value?: string | null) {
  const displayName = value?.trim();

  return displayName && displayName.length > 0 ? displayName : "미입력";
}

export function LedgerSaveStatus({
  stepLabel,
  authorDisplayName,
  updatedAt,
  isSaving = false,
  errorMessage,
  successMessage,
  unsavedFields = [],
  onRetry,
  retryDisabled = false,
}: LedgerSaveStatusProps) {
  const stateLabel = isSaving
    ? "저장 중"
    : errorMessage
      ? "저장 실패"
      : "저장됨";
  const Icon = isSaving
    ? LoaderCircleIcon
    : errorMessage
      ? AlertCircleIcon
      : CheckCircle2Icon;

  return (
    <section
      aria-label="장부 저장 상태"
      className={cn(
        "bg-card text-card-foreground rounded-lg border p-4",
        errorMessage ? "border-destructive/40" : "",
      )}
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p
            className={cn(
              "flex min-w-0 items-center gap-2 text-sm font-medium",
              errorMessage ? "text-destructive" : "text-foreground",
            )}
            role={errorMessage ? "alert" : "status"}
            aria-live="polite"
          >
            <Icon
              className={cn("size-4 shrink-0", isSaving ? "animate-spin" : "")}
              aria-hidden
            />
            <span className="break-words">
              {stepLabel} {stateLabel}
            </span>
          </p>
          <p className="text-muted-foreground text-sm break-words">
            마지막 저장: {formatSavedAt(updatedAt)}
          </p>
          <p className="text-muted-foreground text-sm break-words">
            작성자 표시명: {formatAuthorDisplayName(authorDisplayName)}
          </p>
          {successMessage ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              {successMessage}
            </p>
          ) : null}
          {errorMessage ? (
            <p className="text-destructive text-sm break-words">
              {errorMessage}
            </p>
          ) : null}
          {errorMessage && unsavedFields.length > 0 ? (
            <p className="text-muted-foreground text-sm break-words">
              저장되지 않았을 수 있는 항목: {unsavedFields.join(", ")}
            </p>
          ) : null}
        </div>
        {errorMessage && onRetry ? (
          <Button
            type="button"
            variant="outline"
            onClick={onRetry}
            disabled={retryDisabled}
            className="min-h-11 w-full sm:w-auto"
          >
            다시 시도
          </Button>
        ) : null}
      </div>
    </section>
  );
}
