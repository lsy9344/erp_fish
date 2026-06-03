import { cn } from "~/lib/utils";

type MetricCardVariant = "default" | "success" | "warning" | "danger" | "muted";

type MetricCardProps = {
  label: string;
  value: React.ReactNode;
  description?: React.ReactNode;
  variant?: MetricCardVariant;
  className?: string;
  valueClassName?: string;
  children?: React.ReactNode;
};

const variantClassName: Record<MetricCardVariant, string> = {
  default: "border-border bg-card",
  success: "border-success/20 bg-success/5",
  warning: "border-warning/25 bg-warning/10",
  danger: "border-destructive/25 bg-destructive/5",
  muted: "border-border bg-card",
};

const valueClassNameByVariant: Record<MetricCardVariant, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  muted: "text-muted-foreground",
};

export function MetricCard({
  label,
  value,
  description,
  variant = "default",
  className,
  valueClassName,
  children,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "text-card-foreground min-w-0 rounded-lg border p-4 shadow-sm",
        variantClassName[variant],
        className,
      )}
    >
      <p className="text-muted-foreground text-sm font-medium">{label}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold tracking-normal break-words tabular-nums",
          valueClassNameByVariant[variant],
          valueClassName,
        )}
      >
        {value}
      </p>
      {description ? (
        <p className="text-muted-foreground mt-1 text-sm break-words">
          {description}
        </p>
      ) : null}
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}
