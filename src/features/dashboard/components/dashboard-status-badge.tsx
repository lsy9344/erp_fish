import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import type { DashboardLedgerStatus } from "../types.ts";

type DashboardStatusBadgeProps = {
  status: DashboardLedgerStatus;
  className?: string;
  "data-testid"?: string;
};

const statusClassName: Record<DashboardLedgerStatus["key"], string> = {
  EMPTY: "border-border bg-muted text-muted-foreground",
  IN_PROGRESS: "border-primary/20 bg-primary/10 text-primary",
  IN_REVIEW: "border-warning/25 bg-warning/15 text-warning",
  HEADQUARTERS_CLOSED: "border-success/20 bg-success/10 text-success",
  HOLIDAY: "border-border bg-muted text-muted-foreground",
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
