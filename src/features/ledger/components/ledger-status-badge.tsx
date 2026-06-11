import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { mapLedgerStatus, type LedgerDisplayStatusKey } from "../status";
import type { DailyLedgerStatus } from "../../../../generated/prisma";

type LedgerStatusBadgeProps = {
  status: DailyLedgerStatus | null;
  prefix?: string;
  className?: string;
};

const statusClassName: Record<LedgerDisplayStatusKey, string> = {
  EMPTY: "border-border bg-muted text-muted-foreground",
  IN_PROGRESS: "border-primary/20 bg-primary/10 text-primary",
  IN_REVIEW: "border-warning/25 bg-warning/15 text-warning",
  HEADQUARTERS_CLOSED: "border-success/20 bg-success/10 text-success",
  HOLIDAY: "border-border bg-muted text-muted-foreground",
};

export function LedgerStatusBadge({
  status,
  prefix = "상태",
  className,
}: LedgerStatusBadgeProps) {
  const displayStatus = mapLedgerStatus(status);

  return (
    <Badge
      variant="outline"
      className={cn(statusClassName[displayStatus.key], className)}
    >
      {prefix ? `${prefix} ${displayStatus.label}` : displayStatus.label}
    </Badge>
  );
}
