"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  InfoIcon,
  RefreshCwIcon,
  SendIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import type { LedgerReviewMetric } from "~/server/calculations/ledger";
import { submitLedgerForReview } from "~/features/ledger/actions";
import { LedgerContextHeader } from "~/features/ledger/components/ledger-context-header";
import { LedgerSaveStatus } from "~/features/ledger/components/ledger-save-status";
import { StoreEntryStepNavigation } from "~/features/ledger/components/store-entry-step-navigation";
import { getKstLedgerDateParam } from "~/features/ledger/date";
import type { StoreManagerLedgerReviewStepData } from "~/features/ledger/review-types";

type ReviewSummaryClientProps = {
  storeName: string;
  reviewData: StoreManagerLedgerReviewStepData;
};

type SubmitFeedback =
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

function SuccessModal({
  message,
  statusLabel,
  onClose,
}: {
  message: string;
  statusLabel: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="success-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="bg-card relative z-10 mx-4 w-full max-w-sm rounded-xl border p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 rounded-sm opacity-70 hover:opacity-100 focus:outline-none"
          aria-label="닫기"
        >
          <XIcon className="size-4" />
        </button>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <CheckCircle2Icon className="size-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 id="success-modal-title" className="text-lg font-semibold">
              {message}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              현재 상태:{" "}
              <span className="text-foreground font-medium">{statusLabel}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-1 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:outline-none"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

function formatKrw(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function normalizeStatusLabel(
  status: StoreManagerLedgerReviewStepData["status"],
) {
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

function formatMetric(metric: LedgerReviewMetric) {
  if (metric.value === null) {
    return metric.unavailableReason ?? "계산 불가";
  }

  return formatKrw(metric.value);
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
}: {
  label: string;
  metric: LedgerReviewMetric;
}) {
  const detail = metricDetail(metric);

  return (
    <div className="min-w-0 rounded-lg border p-3">
      <p className="text-muted-foreground text-sm break-words">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-normal break-words tabular-nums">
        {formatMetric(metric)}
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
  const [currentReviewData, setCurrentReviewData] = useState(reviewData);
  const [feedback, setFeedback] = useState<SubmitFeedback | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const previousReviewContextKey = useRef(
    `${reviewData.id}:${reviewData.storeId}:${reviewData.closingDate}`,
  );
  const { summary } = currentReviewData;

  useEffect(() => {
    const nextReviewContextKey = `${reviewData.id}:${reviewData.storeId}:${reviewData.closingDate}`;

    setCurrentReviewData(reviewData);

    if (previousReviewContextKey.current !== nextReviewContextKey) {
      setFeedback(null);
      previousReviewContextKey.current = nextReviewContextKey;
    }
  }, [reviewData]);

  async function handleSubmit() {
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const result = await submitLedgerForReview({
        ledgerId: currentReviewData.id,
        storeId: currentReviewData.storeId,
        closingDate: getKstLedgerDateParam(currentReviewData.closingDate),
        version: currentReviewData.version,
      });

      if (result.ok) {
        setCurrentReviewData((current) => ({
          ...current,
          status: result.data.ledger.status,
          updatedAt: result.data.ledger.updatedAt,
          version: result.data.ledger.version,
          authorDisplayName: result.data.ledger.authorDisplayName,
          submittedById: result.data.ledger.submittedById,
          submittedAt: result.data.ledger.submittedAt,
        }));
        setFeedback({
          kind: "success",
          message:
            result.data.status === "already-in-review"
              ? "이미 검토 대기 상태입니다."
              : "장부를 제출했습니다.",
        });
        setShowSuccessModal(true);
        return;
      }

      setFeedback({ kind: "error", message: result.error.message });
    } catch {
      setFeedback({
        kind: "error",
        message: "제출에 실패했습니다. 다시 시도해 주세요.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {showSuccessModal && feedback?.kind === "success" ? (
        <SuccessModal
          message={feedback.message}
          statusLabel={normalizeStatusLabel(currentReviewData.status)}
          onClose={() => setShowSuccessModal(false)}
        />
      ) : null}
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <LedgerContextHeader
          ledgerLabel="오늘 장부 검토"
          title={storeName}
          storeId={currentReviewData.storeId}
          closingDate={currentReviewData.closingDate}
          authorDisplayName={currentReviewData.authorDisplayName}
          status={currentReviewData.status}
          step="review"
        />

        <StoreEntryStepNavigation
          storeId={currentReviewData.storeId}
          closingDate={currentReviewData.closingDate}
          currentStep="review"
        />

        <LedgerSaveStatus
          stepLabel="7단계 검토/제출"
          authorDisplayName={currentReviewData.authorDisplayName}
          updatedAt={currentReviewData.updatedAt}
          isSaving={isSubmitting}
          errorMessage={feedback?.kind === "error" ? feedback.message : null}
          successMessage={
            feedback?.kind === "success" ? feedback.message : null
          }
          unsavedFields={["검토 제출 상태"]}
          onRetry={handleSubmit}
          retryDisabled={isSubmitting}
        />

        <section
          aria-labelledby="review-metrics-heading"
          className="bg-card text-card-foreground rounded-lg border p-4"
        >
          <h2 id="review-metrics-heading" className="text-base font-semibold">
            계산값
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="총매출" metric={summary.totalSales} />
            <MetricCard label="결제 차액" metric={summary.paymentDifference} />
          </div>
        </section>

        {currentReviewData.missingItems.length > 0 ? (
          <section
            aria-labelledby="review-missing-heading"
            className="bg-card text-card-foreground rounded-lg border p-4"
          >
            <h2 id="review-missing-heading" className="text-base font-semibold">
              입력 확인 항목
            </h2>
            <div className="mt-3 flex flex-col gap-2">
              {currentReviewData.missingItems.map((item) => (
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
                      <a
                        href={item.href}
                        aria-label={`${item.label} 단계로 이동`}
                      >
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
            {currentReviewData.warnings.map((warning) => (
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

            {currentReviewData.signals.map((signal) => (
              <Alert key={signal.id} className="min-w-0 border-orange-500/40">
                <TriangleAlertIcon className="size-4" aria-hidden="true" />
                <AlertTitle className="break-words">{signal.label}</AlertTitle>
                <AlertDescription>
                  <p className="break-words">{signal.detail}</p>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-medium tabular-nums">
                    {signal.quantity !== undefined ? (
                      <span>수량 {formatSignedQuantity(signal.quantity)}</span>
                    ) : null}
                  </p>
                </AlertDescription>
              </Alert>
            ))}

            {currentReviewData.warnings.length === 0 &&
            currentReviewData.signals.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                현재 표시할 합계 불일치나 이상 후보가 없습니다.
              </p>
            ) : null}
          </div>
        </section>

        <section
          aria-labelledby="review-submit-heading"
          className="bg-card text-card-foreground rounded-lg border p-4"
        >
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2
                id="review-submit-heading"
                className="text-base font-semibold"
              >
                제출
              </h2>
              <Badge
                variant="outline"
                className="mt-2 break-words whitespace-normal"
              >
                현재 상태 {normalizeStatusLabel(currentReviewData.status)}
              </Badge>
            </div>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="min-h-11 w-full sm:w-auto"
            >
              <SendIcon aria-hidden="true" />
              {isSubmitting ? "제출 중..." : "검토 대기로 제출"}
            </Button>
          </div>

          {feedback?.kind === "success" ? (
            <Alert role="status" className="mt-3 min-w-0 border-emerald-500/40">
              <CheckCircle2Icon className="size-4" aria-hidden="true" />
              <AlertTitle className="break-words">
                {feedback.message}
              </AlertTitle>
              <AlertDescription className="min-w-0">
                <Badge variant="secondary" className="whitespace-normal">
                  {normalizeStatusLabel(currentReviewData.status)}
                </Badge>
              </AlertDescription>
            </Alert>
          ) : null}

          {feedback?.kind === "error" ? (
            <Alert role="alert" className="border-destructive/50 mt-3 min-w-0">
              <TriangleAlertIcon className="size-4" aria-hidden="true" />
              <AlertTitle className="break-words">
                {feedback.message}
              </AlertTitle>
              <AlertDescription className="min-w-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 min-h-8"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  <RefreshCwIcon aria-hidden="true" />
                  다시 시도
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
        </section>
      </div>
    </>
  );
}
