"use client";

import {
  ArrowRightIcon,
  CircleAlertIcon,
  InfoIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import type { LedgerReviewMetric } from "~/server/calculations/ledger";
import type { LedgerReviewStepData } from "~/features/ledger/review-types";

type ReviewSummaryClientProps = {
  storeName: string;
  reviewData: LedgerReviewStepData;
};

function formatKrw(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value * 100)}%`;
}

function formatClosingDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "full",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function normalizeStatusLabel(status: LedgerReviewStepData["status"]) {
  if (status === "IN_PROGRESS") {
    return "입력중";
  }

  if (status === "IN_REVIEW") {
    return "검토대기";
  }

  if (status === "HEADQUARTERS_CLOSED") {
    return "본사마감";
  }

  return "휴무";
}

function stepHref(
  storeId: string,
  step: "sales" | "cost" | "purchase" | "work" | "review",
) {
  return `/app/store-entry?storeId=${storeId}&step=${step}`;
}

function formatMetric(metric: LedgerReviewMetric, kind: "krw" | "percent") {
  if (metric.value === null) {
    return metric.unavailableReason ?? "계산 불가";
  }

  return kind === "percent"
    ? formatPercent(metric.value)
    : formatKrw(metric.value);
}

function metricDetail(metric: LedgerReviewMetric) {
  if (metric.value !== null) {
    return null;
  }

  return metric.unavailableReason ?? "계산 불가";
}

function MetricCard({
  label,
  metric,
  kind = "krw",
}: {
  label: string;
  metric: LedgerReviewMetric;
  kind?: "krw" | "percent";
}) {
  const detail = metricDetail(metric);

  return (
    <div className="min-w-0 rounded-lg border p-3">
      <p className="text-muted-foreground text-sm break-words">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-normal break-words tabular-nums">
        {formatMetric(metric, kind)}
      </p>
      {detail ? (
        <p className="text-muted-foreground mt-1 text-xs break-words">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function formatSignedKrw(value: number) {
  const prefix = value > 0 ? "+" : "";

  return `${prefix}${formatKrw(value)}`;
}

function formatSignedQuantity(value: number) {
  const prefix = value > 0 ? "+" : "";

  return `${prefix}${new Intl.NumberFormat("ko-KR").format(value)}개`;
}

export function ReviewSummaryClient({
  storeName,
  reviewData,
}: ReviewSummaryClientProps) {
  const { summary } = reviewData;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <header className="bg-card text-card-foreground rounded-lg border p-4">
        <p className="text-muted-foreground text-sm">오늘 장부 검토</p>
        <h1 className="text-2xl font-semibold tracking-normal">{storeName}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          영업일: {formatClosingDate(reviewData.closingDate)} · 상태:{" "}
          <span className="text-foreground font-medium">
            {normalizeStatusLabel(reviewData.status)}
          </span>
        </p>
      </header>

      <section
        aria-label="검토 단계"
        className="bg-card text-card-foreground rounded-lg border p-4"
      >
        <p className="mb-3 text-sm font-medium">현재 단계</p>
        <ol className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          <li>
            <a
              className="text-muted-foreground hover:text-foreground block rounded-md border px-3 py-2 text-sm"
              href={stepHref(reviewData.storeId, "sales")}
            >
              1단계: 매출/결제
            </a>
          </li>
          <li>
            <a
              className="text-muted-foreground hover:text-foreground block rounded-md border px-3 py-2 text-sm"
              href={stepHref(reviewData.storeId, "cost")}
            >
              2단계: 비용
            </a>
          </li>
          <li>
            <a
              className="text-muted-foreground hover:text-foreground block rounded-md border px-3 py-2 text-sm"
              href={stepHref(reviewData.storeId, "purchase")}
            >
              3단계: 매입
            </a>
          </li>
          <li>
            <a
              className="text-muted-foreground hover:text-foreground block rounded-md border px-3 py-2 text-sm"
              href={`/app/store-entry/inventory?storeId=${reviewData.storeId}`}
            >
              4단계: 재고
            </a>
          </li>
          <li>
            <a
              className="text-muted-foreground hover:text-foreground block rounded-md border px-3 py-2 text-sm"
              href={`/app/store-entry/losses?storeId=${reviewData.storeId}`}
            >
              5단계: 손실/폐기
            </a>
          </li>
          <li>
            <a
              className="text-muted-foreground hover:text-foreground block rounded-md border px-3 py-2 text-sm"
              href={stepHref(reviewData.storeId, "work")}
            >
              6단계: 근무인원
            </a>
          </li>
          <li>
            <a
              aria-current="step"
              className="block rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"
              href={stepHref(reviewData.storeId, "review")}
            >
              7단계: 검토/제출
            </a>
          </li>
        </ol>
      </section>

      <section
        aria-labelledby="review-metrics-heading"
        className="bg-card text-card-foreground rounded-lg border p-4"
      >
        <h2 id="review-metrics-heading" className="text-base font-semibold">
          계산값
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="총매출" metric={summary.totalSales} />
          <MetricCard label="매출원가" metric={summary.costOfGoodsSold} />
          <MetricCard label="매출이익" metric={summary.grossProfit} />
          <MetricCard
            label="이익률"
            metric={summary.grossMarginRate}
            kind="percent"
          />
          <MetricCard label="영업이익" metric={summary.operatingProfit} />
          <MetricCard label="인당생산성" metric={summary.productivity} />
          <MetricCard label="재고금액" metric={summary.inventoryAmount} />
          <MetricCard label="매출차액" metric={summary.salesDifference} />
        </div>
      </section>

      {reviewData.missingItems.length > 0 ? (
        <section
          aria-labelledby="review-missing-heading"
          className="bg-card text-card-foreground rounded-lg border p-4"
        >
          <h2 id="review-missing-heading" className="text-base font-semibold">
            입력 확인 항목
          </h2>
          <div className="mt-3 flex flex-col gap-2">
            {reviewData.missingItems.map((item) => (
              <Alert key={item.id} className="min-w-0">
                {item.status === "missing" ? (
                  <CircleAlertIcon className="size-4" aria-hidden="true" />
                ) : (
                  <InfoIcon className="size-4" aria-hidden="true" />
                )}
                <AlertTitle className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="break-words">{item.label}</span>
                  <Badge
                    variant={
                      item.status === "missing" ? "outline" : "secondary"
                    }
                  >
                    {item.status === "missing" ? "입력 필요" : "검토"}
                  </Badge>
                </AlertTitle>
                <AlertDescription className="min-w-0">
                  <p className="break-words">{item.detail}</p>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="mt-2 min-h-8"
                  >
                    <a href={item.href}>
                      <ArrowRightIcon aria-hidden="true" />
                      이동
                    </a>
                  </Button>
                </AlertDescription>
              </Alert>
            ))}
          </div>
        </section>
      ) : null}

      <section
        aria-labelledby="review-warnings-heading"
        className="bg-card text-card-foreground rounded-lg border p-4"
      >
        <h2 id="review-warnings-heading" className="text-base font-semibold">
          경고와 이상 후보
        </h2>
        <div className="mt-3 flex flex-col gap-2">
          {reviewData.warnings.map((warning) => (
            <Alert key={warning.id} className="min-w-0 border-amber-500/40">
              <TriangleAlertIcon className="size-4" aria-hidden="true" />
              <AlertTitle className="break-words">{warning.label}</AlertTitle>
              <AlertDescription>
                <p className="break-words">{warning.detail}</p>
                {warning.amount !== undefined ? (
                  <p className="mt-1 font-medium tabular-nums">
                    차액 {formatSignedKrw(warning.amount)}
                  </p>
                ) : null}
              </AlertDescription>
            </Alert>
          ))}

          {reviewData.signals.map((signal) => (
            <Alert key={signal.id} className="min-w-0 border-orange-500/40">
              <TriangleAlertIcon className="size-4" aria-hidden="true" />
              <AlertTitle className="break-words">{signal.label}</AlertTitle>
              <AlertDescription>
                <p className="break-words">{signal.detail}</p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-medium tabular-nums">
                  {signal.quantity !== undefined ? (
                    <span>수량 {formatSignedQuantity(signal.quantity)}</span>
                  ) : null}
                  {signal.amount !== undefined ? (
                    <span>금액 {formatSignedKrw(signal.amount)}</span>
                  ) : null}
                </p>
              </AlertDescription>
            </Alert>
          ))}

          {reviewData.warnings.length === 0 &&
          reviewData.signals.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              현재 표시할 합계 불일치나 이상 후보가 없습니다.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
