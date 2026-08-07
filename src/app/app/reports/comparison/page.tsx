import { DownloadIcon } from "lucide-react";

import { PermissionAction } from "../../../../../generated/prisma";
import { Button } from "~/components/ui/button";
import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { Input } from "~/components/ui/input";
import { PageHeader } from "~/components/page-header";
import { PeriodContrastTable } from "~/features/reports/components/period-contrast-table";
import { PeriodTrendTable } from "~/features/reports/components/period-trend-table";
import { ReportsNav } from "~/features/reports/components/reports-nav";
import { StoreComparisonReportTable } from "~/features/reports/components/store-comparison-report-table";
import { PERIOD_ANALYSIS_METRICS } from "~/features/reports/period-analysis";
import {
  getHqPeriodContrastReport,
  getHqPeriodTrendReport,
  getHqStoreComparisonReport,
} from "~/features/reports/queries";
import { hasActionPermission, requireReportAccess } from "~/server/authz";

// WO-0806 [F]: 대표 엑셀의 4개 뷰를 신규 페이지 없이 모드 3개로 덮는다.
//   single(현행) / contrast(`분석` 시트) / trend(`매장 별(달)`·`매장 별(년도)`·지표 피벗)
type PeriodAnalysisMode = "single" | "contrast" | "trend";

type StoreComparisonReportPageProps = {
  searchParams: Promise<{
    mode?: string | string[];
    startDate?: string | string[];
    endDate?: string | string[];
    baseStartDate?: string | string[];
    baseEndDate?: string | string[];
    axis?: string | string[];
    unit?: string | string[];
    year?: string | string[];
    fromMonth?: string | string[];
    toMonth?: string | string[];
    metricKey?: string | string[];
    storeId?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function toPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export default async function StoreComparisonReportPage({
  searchParams,
}: StoreComparisonReportPageProps) {
  const user = await requireReportAccess();
  // WO-0806 #5: 인건비 링크는 대표(LABOR_VIEW) 계정에만 노출한다.
  const canViewLabor = await hasActionPermission(
    user.id,
    PermissionAction.LABOR_VIEW,
  );
  const navigationItems = await getHeadquartersNavigationItems(user.id);
  const canExportReports = await hasActionPermission(
    user.id,
    PermissionAction.EXPORT_CREATE,
  );
  const params = await searchParams;
  const startDate = firstParam(params.startDate);
  const endDate = firstParam(params.endDate);
  const storeId = firstParam(params.storeId);
  const modeParam = firstParam(params.mode);
  const mode: PeriodAnalysisMode =
    modeParam === "contrast" || modeParam === "trend" ? modeParam : "single";
  const axis = firstParam(params.axis) === "metric" ? "metric" : "store";
  const unit = firstParam(params.unit) === "year" ? "year" : "month";
  const currentYear = new Date().getUTCFullYear();
  const year = toPositiveInt(firstParam(params.year), currentYear);
  const fromMonth = toPositiveInt(firstParam(params.fromMonth), 1);
  const toMonth = toPositiveInt(firstParam(params.toMonth), 12);
  const metricKey = firstParam(params.metricKey);

  const report = await getHqStoreComparisonReport({
    startDate,
    endDate,
    storeId,
  });
  const contrast =
    mode === "contrast"
      ? await getHqPeriodContrastReport({
          startDate,
          endDate,
          baseStartDate: firstParam(params.baseStartDate),
          baseEndDate: firstParam(params.baseEndDate),
          storeId,
        })
      : null;
  const trend =
    mode === "trend"
      ? await getHqPeriodTrendReport({
          axis,
          unit,
          year,
          // 연도 모드는 최근 7년을 기본으로 보여준다(엑셀 `매장 별(년도)`와 같은 폭).
          years: Array.from({ length: 7 }, (_, index) => year - 6 + index),
          fromMonth,
          toMonth,
          metricKey,
          storeId,
        })
      : null;
  const selectedStoreLabel = report.selectedStoreName ?? "전체 활성 지점";
  const exportParams = new URLSearchParams({
    report: "comparison",
    startDate: report.range.startDateInput,
    endDate: report.range.endDateInput,
    format: "csv",
  });

  if (report.selectedStoreId) {
    exportParams.set("storeId", report.selectedStoreId);
  }

  // WO-0806 [F]: mode=single은 파라미터를 더하지 않아 기존 export URL과 동일하게 남긴다.
  if (mode === "contrast" && contrast) {
    exportParams.set("mode", "contrast");
    exportParams.set("baseStartDate", contrast.base.range.startDateInput);
    exportParams.set("baseEndDate", contrast.base.range.endDateInput);
  } else if (mode === "trend" && trend) {
    exportParams.set("mode", "trend");
    exportParams.set("axis", trend.axis);
    exportParams.set("unit", trend.unit);
    exportParams.set("year", String(year));
    exportParams.set("fromMonth", String(fromMonth));
    exportParams.set("toMonth", String(toMonth));
    exportParams.set("metricKey", trend.metric.key);
  }

  const exportHref = `/api/reports/export?${exportParams.toString()}`;
  const exportXlsxParams = new URLSearchParams(exportParams);

  exportXlsxParams.set("format", "xlsx");

  const exportXlsxHref = `/api/reports/export?${exportXlsxParams.toString()}`;

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <ReportsNav active="comparison" canViewLabor={canViewLabor} />

      {/* WO-0806 [F]: 모드 전환은 링크로만 한다. 이 페이지는 서버 컴포넌트 + <form action>이라
          라디오를 두면 클라이언트 상태가 필요해진다. */}
      <nav aria-label="기간 분석 모드" className="flex flex-wrap gap-1.5">
        {(
          [
            ["single", "단일 기간"],
            ["contrast", "기간 대조"],
            ["trend", "월별 추이"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            asChild
            size="sm"
            variant={mode === key ? "default" : "outline"}
          >
            <a
              href={`/app/reports/comparison?mode=${key}`}
              aria-current={mode === key ? "page" : undefined}
            >
              {label}
            </a>
          </Button>
        ))}
      </nav>

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <PageHeader
          title="기간 분석"
          description={`${report.range.startDateInput}부터 ${report.range.endDateInput}까지 ${selectedStoreLabel}의 지점별 실적을 비교합니다.`}
        />
        <div className="flex flex-col gap-2 md:items-end">
          <form
            action="/app/reports/comparison"
            className="flex flex-wrap items-end gap-2"
          >
            <div className="grid gap-1">
              <label
                className="text-muted-foreground text-xs"
                htmlFor="startDate"
              >
                시작일
              </label>
              <Input
                id="startDate"
                name="startDate"
                type="date"
                defaultValue={report.range.startDateInput}
                className="h-9 w-36"
              />
            </div>
            <div className="grid gap-1">
              <label
                className="text-muted-foreground text-xs"
                htmlFor="endDate"
              >
                종료일
              </label>
              <Input
                id="endDate"
                name="endDate"
                type="date"
                defaultValue={report.range.endDateInput}
                className="h-9 w-36"
              />
            </div>
            <div className="grid gap-1">
              <label
                className="text-muted-foreground text-xs"
                htmlFor="storeId"
              >
                지점
              </label>
              <select
                id="storeId"
                name="storeId"
                defaultValue={report.selectedStoreId ?? ""}
                className="border-input bg-card ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 min-w-40 rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">전체 활성 지점</option>
                {report.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>
            {mode === "contrast" ? (
              <>
                <input type="hidden" name="mode" value="contrast" />
                <div className="grid gap-1">
                  <label
                    className="text-muted-foreground text-xs"
                    htmlFor="baseStartDate"
                  >
                    대조 시작일
                  </label>
                  <Input
                    id="baseStartDate"
                    name="baseStartDate"
                    type="date"
                    defaultValue={contrast?.base.range.startDateInput}
                    className="h-9 w-36"
                  />
                </div>
                <div className="grid gap-1">
                  <label
                    className="text-muted-foreground text-xs"
                    htmlFor="baseEndDate"
                  >
                    대조 종료일
                  </label>
                  <Input
                    id="baseEndDate"
                    name="baseEndDate"
                    type="date"
                    defaultValue={contrast?.base.range.endDateInput}
                    className="h-9 w-36"
                  />
                </div>
              </>
            ) : null}
            {mode === "trend" ? (
              <>
                <input type="hidden" name="mode" value="trend" />
                <div className="grid gap-1">
                  <label
                    className="text-muted-foreground text-xs"
                    htmlFor="axis"
                  >
                    행 기준
                  </label>
                  <select
                    id="axis"
                    name="axis"
                    defaultValue={axis}
                    className="border-input bg-card h-9 min-w-28 rounded-md border px-3 py-1 text-sm shadow-xs"
                  >
                    <option value="store">지점별</option>
                    <option value="metric">지표별</option>
                  </select>
                </div>
                <div className="grid gap-1">
                  <label
                    className="text-muted-foreground text-xs"
                    htmlFor="unit"
                  >
                    기간 단위
                  </label>
                  <select
                    id="unit"
                    name="unit"
                    defaultValue={unit}
                    className="border-input bg-card h-9 min-w-24 rounded-md border px-3 py-1 text-sm shadow-xs"
                  >
                    <option value="month">월</option>
                    <option value="year">연도</option>
                  </select>
                </div>
                <div className="grid gap-1">
                  <label
                    className="text-muted-foreground text-xs"
                    htmlFor="year"
                  >
                    기준 연도
                  </label>
                  <Input
                    id="year"
                    name="year"
                    type="number"
                    min={2000}
                    max={2100}
                    defaultValue={year}
                    className="h-9 w-24"
                  />
                </div>
                {/* 엑셀 `매장 별(년도)`는 6/1~6/30을 고정하고 연도만 바꾸는 시즌 비교다. */}
                {unit === "year" ? (
                  <div className="grid gap-1">
                    <label
                      className="text-muted-foreground text-xs"
                      htmlFor="fromMonth"
                    >
                      월 범위
                    </label>
                    <div className="flex items-center gap-1">
                      <Input
                        id="fromMonth"
                        name="fromMonth"
                        type="number"
                        min={1}
                        max={12}
                        defaultValue={fromMonth}
                        className="h-9 w-16"
                      />
                      <span className="text-muted-foreground text-xs">~</span>
                      <Input
                        name="toMonth"
                        type="number"
                        min={1}
                        max={12}
                        defaultValue={toMonth}
                        className="h-9 w-16"
                      />
                    </div>
                  </div>
                ) : null}
                {axis === "store" ? (
                  <div className="grid gap-1">
                    <label
                      className="text-muted-foreground text-xs"
                      htmlFor="metricKey"
                    >
                      지표
                    </label>
                    <select
                      id="metricKey"
                      name="metricKey"
                      defaultValue={trend?.metric.key}
                      className="border-input bg-card h-9 min-w-36 rounded-md border px-3 py-1 text-sm shadow-xs"
                    >
                      {PERIOD_ANALYSIS_METRICS.map((metric) => (
                        <option key={metric.key} value={metric.key}>
                          {metric.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </>
            ) : null}
            <Button type="submit" variant="outline" size="sm">
              조회
            </Button>
            {canExportReports ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <a href={exportXlsxHref}>
                    <DownloadIcon data-icon="inline-start" />
                    Excel
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={exportHref}>
                    <DownloadIcon data-icon="inline-start" />
                    CSV
                  </a>
                </Button>
              </>
            ) : null}
          </form>
        </div>
      </div>

      {report.errorMessages.length > 0 ? (
        <div className="grid gap-2">
          {report.errorMessages.map((message) => (
            <p
              key={message}
              className="bg-muted text-muted-foreground rounded-lg border px-4 py-3 text-sm break-words"
            >
              {message}
            </p>
          ))}
        </div>
      ) : null}

      {trend && trend.errorMessages.length > 0 ? (
        <div className="grid gap-2">
          {trend.errorMessages.map((message) => (
            <p
              key={message}
              className="bg-muted text-muted-foreground rounded-lg border px-4 py-3 text-sm break-words"
            >
              {message}
            </p>
          ))}
        </div>
      ) : null}

      {mode === "contrast" && contrast ? (
        <PeriodContrastTable
          base={contrast.base}
          current={contrast.current}
          contrastRows={contrast.contrastRows}
        />
      ) : null}

      {mode === "trend" && trend ? (
        <PeriodTrendTable
          axis={trend.axis}
          columns={trend.columns}
          rows={trend.rows}
          metric={trend.metric}
        />
      ) : null}

      {mode === "single" ? (
        <StoreComparisonReportTable report={report} />
      ) : null}
    </HeadquartersShell>
  );
}
