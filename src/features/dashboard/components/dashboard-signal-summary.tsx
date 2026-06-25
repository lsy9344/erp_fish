import {
  CircleAlertIcon,
  InfoIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import type {
  DashboardSignalSeverity,
  DashboardSignalSummary as DashboardSignalSummaryType,
} from "../types.ts";

type DashboardSignalSummaryProps = {
  signals: DashboardSignalSummaryType[];
  className?: string;
  showDetails?: boolean;
  "data-testid"?: string;
};

const severityStyle: Record<
  DashboardSignalSeverity,
  { icon: LucideIcon; className: string }
> = {
  info: {
    icon: InfoIcon,
    className: "border-primary/20 bg-primary/10 text-primary",
  },
  warning: {
    icon: TriangleAlertIcon,
    className: "border-warning/25 bg-warning/15 text-warning",
  },
  critical: {
    icon: CircleAlertIcon,
    className: "border-destructive/25 bg-destructive/10 text-destructive",
  },
};

export function DashboardSignalSummary({
  signals,
  className,
  showDetails = false,
  "data-testid": testId,
}: DashboardSignalSummaryProps) {
  return (
    <div
      data-testid={testId}
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {signals.map((signal) => {
        const style = severityStyle[signal.severity];
        const Icon = style.icon;

        return (
          <Badge
            key={signal.id}
            variant="outline"
            title={signal.detail}
            aria-label={getSignalAccessibilityLabel(signal)}
            className={cn(
              style.className,
              // Badge 기본값(overflow-hidden·whitespace-nowrap·h-5)을 덮어써 라벨이
              // 잘리지 않고 줄바꿈되며 뱃지 높이가 늘어나게 한다.
              "h-auto max-w-full overflow-visible whitespace-normal",
              showDetails && "items-start justify-start py-1 text-left",
            )}
          >
            <Icon aria-hidden="true" className={showDetails ? "mt-0.5" : ""} />
            <span className={cn(showDetails && "flex flex-col gap-0.5")}>
              <span>{signal.label}</span>
              {showDetails && signal.detail ? (
                <span className="font-normal break-words opacity-80">
                  {signal.detail}
                </span>
              ) : null}
            </span>
          </Badge>
        );
      })}
    </div>
  );
}

function getSignalAccessibilityLabel(signal: DashboardSignalSummaryType) {
  return signal.detail ? `${signal.label}: ${signal.detail}` : signal.label;
}
