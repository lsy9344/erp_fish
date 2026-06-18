"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "~/components/ui/button";

const delayedLoadingThresholdMs = 3000;
const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function DashboardDelayedLoadingNotice() {
  const router = useRouter();
  const [lastRefreshAttemptAt, setLastRefreshAttemptAt] = useState<Date | null>(
    null,
  );
  const [isDelayed, setIsDelayed] = useState(false);

  useEffect(() => {
    setLastRefreshAttemptAt(new Date());
    const timeoutId = window.setTimeout(() => {
      setIsDelayed(true);
    }, delayedLoadingThresholdMs);

    return () => window.clearTimeout(timeoutId);
  }, []);

  if (!isDelayed) {
    return null;
  }

  const formattedRefreshAttempt = lastRefreshAttemptAt
    ? timeFormatter.format(lastRefreshAttemptAt)
    : "확인 중";

  return (
    <div
      className="bg-card rounded-lg border p-4 text-sm shadow-sm"
      role="status"
      aria-live="polite"
      data-testid="hq-dashboard-delayed-loading"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <p className="font-medium">관제판 데이터 로딩이 지연되고 있습니다.</p>
          <dl className="text-muted-foreground grid gap-1 sm:grid-cols-2 sm:gap-x-6">
            <div>
              <dt className="text-foreground font-medium">부분 로드</dt>
              <dd>화면 골격을 유지하며 지점 행 데이터를 기다리는 중입니다.</dd>
            </div>
            <div>
              <dt className="text-foreground font-medium">마지막 갱신 시각</dt>
              <dd className="tabular-nums">{formattedRefreshAttempt}</dd>
            </div>
          </dl>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.refresh()}
        >
          재시도
        </Button>
      </div>
    </div>
  );
}
