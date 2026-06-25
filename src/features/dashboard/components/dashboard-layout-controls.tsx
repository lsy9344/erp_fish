import Link from "next/link";

import { Button } from "~/components/ui/button";
import { getDashboardPath } from "~/features/dashboard/queries";
import type {
  DashboardDatePreset,
  DashboardDensity,
  DashboardFilterMode,
  DashboardSortMode,
} from "~/features/dashboard/types";

// WO-07(2026-06-22): 관제판 표시 밀도 컨트롤(기본/넓게/압축).
// WO-I(2026-06-22) 정책 확정: 원문(point_summary.md:10)의 "자유 리사이즈"는 운영
// 안정성을 위해 밀도 프리셋 + 컬럼 폭 조절로 대체한다. 임의 드래그 레이아웃 저장은
// 범위 밖이며, density만 URL 쿼리로 유지한다.
// 결정 근거: docs/meeting/point-summary-policy-decisions-2026-06-22.md
// 검토 재확인(2026-06-23): point_summary.md:10 대비 자유 리사이즈 미구현 지적이 있었으나,
// 이해관계자 합의로 밀도 프리셋 유지가 의도된 대체임을 재확인했다(현행 유지 결정).
const DENSITY_OPTIONS: Array<{ value: DashboardDensity; label: string }> = [
  { value: "default", label: "기본" },
  { value: "wide", label: "넓게" },
  { value: "compact", label: "압축" },
];

type DashboardLayoutControlsProps = {
  datePreset: DashboardDatePreset;
  sortMode: DashboardSortMode;
  filterMode: DashboardFilterMode;
  density: DashboardDensity;
};

export function DashboardLayoutControls({
  datePreset,
  sortMode,
  filterMode,
  density,
}: DashboardLayoutControlsProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label="관제판 표시 밀도 선택"
      data-testid="dashboard-density-controls"
    >
      {DENSITY_OPTIONS.map((option) => (
        <Button
          key={option.value}
          asChild
          variant={density === option.value ? "default" : "outline"}
        >
          <Link
            href={getDashboardPath({
              datePreset,
              sortMode,
              filterMode,
              density: option.value,
            })}
            aria-current={density === option.value ? "page" : undefined}
          >
            {option.label}
          </Link>
        </Button>
      ))}
    </div>
  );
}

// 요약 카드 그리드 밀도 클래스. 넓게=3열, 기본=5열, 압축=2열로 정보 밀도를 조절한다.
export function getDashboardSummaryGridClass(density: DashboardDensity) {
  switch (density) {
    case "wide":
      return "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";
    case "compact":
      return "grid gap-2 grid-cols-2 lg:grid-cols-5";
    default:
      return "grid gap-3 sm:grid-cols-2 lg:grid-cols-5";
  }
}

// 표 컨테이너 폭 밀도 클래스. 압축=좁은 폭으로 한눈에 보는 범위를 줄인다.
// 기본/넓게는 전체 폭(shell의 max-w-[1600px])을 채운다. 표 자연폭(~1620px)이
// max-w-5xl(1024px)보다 넓어 기본에서 신호 칼럼/뒤쪽 칼럼이 잘리고 오른쪽에
// 빈 공간이 생기던 문제를 해결한다. 넘치면 내부 overflow-x-auto가 가로 스크롤한다.
export function getDashboardTableContainerClass(density: DashboardDensity) {
  switch (density) {
    case "compact":
      return "w-full max-w-3xl";
    default:
      return "w-full max-w-none";
  }
}
