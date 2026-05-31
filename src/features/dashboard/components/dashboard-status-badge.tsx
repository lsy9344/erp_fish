import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import type { DashboardLedgerStatus } from "../types.ts";

type DashboardStatusBadgeProps = {
  status: DashboardLedgerStatus;
  className?: string;
  "data-testid"?: string;
};

const statusClassName: Record<DashboardLedgerStatus["key"], string> = {
  EMPTY: "border-slate-200 bg-slate-50 text-slate-700",
  IN_PROGRESS: "border-amber-200 bg-amber-50 text-amber-800",
  IN_REVIEW: "border-sky-200 bg-sky-50 text-sky-800",
  HEADQUARTERS_CLOSED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  HOLIDAY: "border-zinc-200 bg-zinc-50 text-zinc-700",
};

export function DashboardStatusBadge({
  status,
  className,
  "data-testid": testId,
}: DashboardStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      data-testid={testId}
      className={cn(statusClassName[status.key], className)}
    >
      {status.label}
    </Badge>
  );
}
