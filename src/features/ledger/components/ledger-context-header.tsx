"use client";

import { useId } from "react";
import { CalendarIcon } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { LedgerStatusBadge } from "~/features/ledger/components/ledger-status-badge";
import type { StoreEntryStep } from "~/features/ledger/step-completion";
import type { DailyLedgerStatus } from "../../../../generated/prisma";

type LedgerContextHeaderProps = {
  ledgerLabel: string;
  title: string;
  storeName?: string;
  storeId: string;
  closingDate: string;
  authorDisplayName?: string | null;
  status: DailyLedgerStatus;
  step?: StoreEntryStep;
};

function formatClosingDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "full",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function toDateInputValue(value: string) {
  return value.slice(0, 10);
}

function formatAuthorDisplayName(value?: string | null) {
  const displayName = value?.trim();

  return displayName && displayName.length > 0 ? displayName : "미입력";
}

export function LedgerContextHeader({
  ledgerLabel,
  title,
  storeName,
  storeId,
  closingDate,
  authorDisplayName,
  status,
  step,
}: LedgerContextHeaderProps) {
  const pathname = usePathname();
  const dateInputId = useId();

  return (
    <header className="bg-card text-card-foreground rounded-lg border p-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-muted-foreground text-sm">{ledgerLabel}</p>
          <h1 className="text-2xl font-semibold tracking-normal break-words">
            {title}
          </h1>
          <div className="text-muted-foreground mt-1 flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <span>
              {storeName ? `${storeName} · ` : ""}영업일:{" "}
              {formatClosingDate(closingDate)}
            </span>
            <LedgerStatusBadge status={status} />
          </div>
          <p className="text-muted-foreground mt-1 text-sm break-words">
            작성자 표시명: {formatAuthorDisplayName(authorDisplayName)}
          </p>
        </div>

        <form
          action={pathname}
          method="get"
          aria-label="장부 날짜 선택"
          className="flex w-full flex-wrap items-end gap-2 sm:w-auto sm:justify-end"
        >
          <input type="hidden" name="storeId" value={storeId} />
          {step ? <input type="hidden" name="step" value={step} /> : null}
          <label
            htmlFor={dateInputId}
            className="text-muted-foreground flex w-full flex-col gap-1 text-xs font-medium sm:w-auto"
          >
            영업일
            <Input
              id={dateInputId}
              type="date"
              name="date"
              defaultValue={toDateInputValue(closingDate)}
              className="h-9 min-w-36 text-sm"
            />
          </label>
          <Button type="submit" variant="outline" size="lg">
            <CalendarIcon data-icon="inline-start" />
            열기
          </Button>
        </form>
      </div>
    </header>
  );
}
