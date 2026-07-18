import Link from "next/link";

import { cn } from "~/lib/utils";

export type ReportKey =
  | "daily"
  | "overview"
  | "comparison"
  | "monthly"
  | "inventory"
  | "ecount-supply"
  | "product-review"
  | "sales-review";

type ReportLink = { key: ReportKey; label: string; href: string };
type ReportGroup = { label: string; items: ReportLink[] };

// 리포트 하위 메뉴의 단일 출처. 각 리포트 페이지 상단에서 동일하게 렌더링한다.
// 링크 라벨은 e2e가 클릭 대상으로 참조하므로 바꿀 때 tests/e2e/hq-reports.spec.ts 확인.
const REPORT_GROUPS: ReportGroup[] = [
  {
    label: "일일 운영",
    items: [{ key: "daily", label: "아침 회의", href: "/app/reports/daily" }],
  },
  {
    label: "기간 분석",
    items: [
      { key: "overview", label: "통합 리포트", href: "/app/reports/overview" },
      {
        key: "comparison",
        label: "기간 비교",
        href: "/app/reports/comparison",
      },
      { key: "monthly", label: "월간", href: "/app/reports/monthly" },
    ],
  },
  {
    label: "재고 · 공급",
    items: [
      { key: "inventory", label: "재고 현황", href: "/app/reports/inventory" },
      {
        key: "ecount-supply",
        label: "출고/입고",
        href: "/app/reports/ecount-supply",
      },
    ],
  },
  {
    label: "검토 (추정)",
    items: [
      {
        key: "product-review",
        label: "품목 검토",
        href: "/app/reports/product-review",
      },
      {
        key: "sales-review",
        label: "매출 검토",
        href: "/app/reports/sales-review",
      },
    ],
  },
];

export function ReportsNav({ active }: { active: ReportKey }) {
  return (
    <nav
      aria-label="리포트 메뉴"
      className="border-border bg-card rounded-lg border p-2 sm:p-3"
    >
      <ul className="flex flex-wrap items-stretch gap-x-5 gap-y-3">
        {REPORT_GROUPS.map((group, index) => (
          <li
            key={group.label}
            className={cn(
              "flex min-w-0 flex-col gap-1.5",
              index > 0 && "sm:border-border sm:border-l sm:pl-5",
            )}
          >
            <span className="text-muted-foreground px-1 text-[11px] font-semibold tracking-wide">
              {group.label}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {group.items.map((item) => {
                const isActive = item.key === active;

                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </nav>
  );
}
