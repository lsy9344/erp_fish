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
    className: "border-slate-200 bg-slate-50 text-slate-700",
  },
  warning: {
    icon: TriangleAlertIcon,
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  critical: {
    icon: CircleAlertIcon,
    className: "border-red-200 bg-red-50 text-red-800",
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
            className={cn(
              style.className,
              showDetails &&
                "h-auto max-w-full items-start justify-start whitespace-normal py-1 text-left",
            )}
          >
            <Icon aria-hidden="true" className={showDetails ? "mt-0.5" : ""} />
            <span
              className={cn(
                "min-w-0",
                showDetails && "flex flex-col gap-0.5",
              )}
            >
              <span>{signal.label}</span>
              {showDetails && signal.detail ? (
                <span className="break-words font-normal opacity-80">
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
