import Link from "next/link";

import type { ReportLedgerLink } from "../types";

// 근거가 가리키는 장부를 날짜 링크로 보여준다. 날짜 정보가 없으면 '장부 상세'로 대신한다.
export function EvidenceLedgerLinks({
  label,
  ledgers,
  fallbackHref = null,
}: {
  label?: string;
  ledgers?: ReportLedgerLink[];
  fallbackHref?: string | null;
}) {
  if (!ledgers || ledgers.length === 0) {
    return fallbackHref ? (
      <Link className="text-primary underline" href={fallbackHref}>
        장부 상세
      </Link>
    ) : null;
  }

  return (
    <div
      className="flex max-h-24 w-full min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 overflow-y-auto text-left"
      data-testid="evidence-ledger-links"
    >
      <span className="text-muted-foreground">
        {label ?? "관련 장부"}
        {ledgers.length > 1 ? ` ${ledgers.length}일` : ""}
      </span>
      {ledgers.map((ledger) => (
        <Link
          key={ledger.href}
          className="text-primary tabular-nums underline"
          href={ledger.href}
        >
          {Number(ledger.dateInput.slice(5, 7))}/
          {Number(ledger.dateInput.slice(8, 10))}
        </Link>
      ))}
    </div>
  );
}
