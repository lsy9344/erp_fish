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
import { submitLedgerForReview } from "~/features/ledger/actions";
import { LedgerContextHeader } from "~/features/ledger/components/ledger-context-header";
import { LedgerSaveStatus } from "~/features/ledger/components/ledger-save-status";
import { SaveConflictDialog } from "~/features/ledger/components/save-conflict-dialog";
import { StoreEntryStepNavigation } from "~/features/ledger/components/store-entry-step-navigation";
import { StoreTopSoldItemsChart } from "~/features/ledger/components/store-top-sold-items-chart";
import { useSaveConflictDialog } from "~/features/ledger/components/use-save-conflict-dialog";
import { getKstLedgerDateParam } from "~/features/ledger/date";
import type {
  LedgerReviewStepMetric,
  StoreManagerLedgerReviewStepData,
} from "~/features/ledger/review-types";
import type { FieldErrors } from "~/lib/action-result";
import { formatKrw, formatSignedKrw, formatSignedQuantity } from "~/lib/format";

type ReviewSummaryClientProps = {
  storeName: string;
  reviewData: StoreManagerLedgerReviewStepData;
};

type SubmitFeedback =
  | { kind: "success"; message: string }
  | { kind: "error"; message: string; fieldErrors?: FieldErrors };

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

function normalizeStatusLabel(
  status: StoreManagerLedgerReviewStepData["status"],
) {
  if (status === "IN_PROGRESS") {
    return "입력 중";
  }

  if (status === "IN_REVIEW") {
    return "검토 대기";
  }

  if (status === "HEADQUARTERS_CLOSED") {
    return "본사 마감";
  }

  return "휴무";
}

function normalizeStepStatusLabel(
  status: StoreManagerLedgerReviewStepData["stepSummaries"][number]["status"],
) {
  if (status === "saved") {
    return "저장됨";
  }

  if (status === "missing") {
    return "입력 필요";
  }

  if (status === "needs-attention") {
    return "확인 필요";
  }

  return "검토";
}

function stepStatusVariant(
  status: StoreManagerLedgerReviewStepData["stepSummaries"][number]["status"],
) {
  if (status === "saved") {
    return "secondary";
  }

  return "outline";
}

function formatMetric(metric: LedgerReviewStepMetric) {
  if (metric.status !== "ok") {
    return metric.value === null ? "계산 불가" : String(metric.value);
  }

  if (metric.kind === "signed-krw" && typeof metric.value === "number") {
    return formatSignedKrw(metric.value);
  }

  if (metric.kind === "krw" && typeof metric.value === "number") {
    return formatKrw(metric.value);
  }

  return metric.value === null ? "계산 불가" : String(metric.value);
}

export function ReviewSummaryClient({
  storeName,
  reviewData,
}: ReviewSummaryClientProps) {
  const [currentReviewData, setCurrentReviewData] = useState(reviewData);
  const [feedback, setFeedback] = useState<SubmitFeedback | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const saveConflict = useSaveConflictDialog();
  const previousReviewContextKey = useRef(
    `${reviewData.id}:${reviewData.storeId}:${reviewData.closingDate}`,
  );

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

      if (saveConflict.captureConflict(result)) {
        setFeedback({
          kind: "error",
          message: result.error.message,
          fieldErrors: result.error.fieldErrors,
        });
        return;
      }

      setFeedback({
        kind: "error",
        message: result.error.message,
        fieldErrors: result.error.fieldErrors,
      });
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
      <SaveConflictDialog
        open={saveConflict.isOpen}
        conflict={saveConflict.conflict}
        onOpenChange={saveConflict.setIsOpen}
        onReload={saveConflict.reloadLatest}
        onKeepEditing={saveConflict.keepEditing}
      />
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
          stepCompletion={currentReviewData.stepCompletion}
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
            검토 요약
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {currentReviewData.stepSummaries.map((stepSummary) => (
              <article
                key={stepSummary.id}
                className="min-w-0 rounded-lg border p-3"
              >
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold break-words">
                    {stepSummary.label}
                  </h3>
                  <Badge
                    variant={stepStatusVariant(stepSummary.status)}
                    className="break-words whitespace-normal"
                  >
                    {normalizeStepStatusLabel(stepSummary.status)}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-2 text-sm break-words">
                  {stepSummary.detail}
                </p>
                <dl className="mt-3 grid gap-2">
                  {stepSummary.metrics.map((metric) => (
                    <div
                      key={metric.id}
                      className="bg-muted/40 flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-md px-3 py-2"
                    >
                      <dt className="text-muted-foreground min-w-0 text-sm break-words">
                        {metric.label}
                      </dt>
                      <dd className="min-w-0 text-right text-sm font-medium break-words tabular-nums">
                        {formatMetric(metric)}
                      </dd>
                      {metric.detail ? (
                        <dd className="text-muted-foreground basis-full text-xs break-words">
                          {metric.detail}
                        </dd>
                      ) : null}
                    </div>
                  ))}
                </dl>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="mt-3 min-h-8"
                >
                  <a
                    href={stepSummary.href}
                    aria-label={`${stepSummary.label} 단계로 이동`}
                  >
                    <ArrowRightIcon aria-hidden="true" />
                    이동
                  </a>
                </Button>
              </article>
            ))}
          </div>
        </section>

        {currentReviewData.topSoldItems.length > 0 ? (
          <section
            aria-labelledby="review-top-sold-heading"
            className="bg-card text-card-foreground rounded-lg border p-4"
          >
            <h2
              id="review-top-sold-heading"
              className="text-base font-semibold"
            >
              오늘 많이 팔린 품목
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              추정 매출은 1단계 매입의 오늘 팔 가격(예상)을 우선 사용합니다.
              값이 없는 품목은 매입 단가로 대체해 표시합니다(판매가 미반영).
            </p>
            {/* WO(2026-06-25): 판매가 미반영 품목이 있으면 입력 위치인 3단계 매입으로
                바로 이동할 수 있게 안내한다. 현재 지점/영업일을 유지한 채 step=purchase로 간다. */}
            {currentReviewData.topSoldItems.some(
              (item) => item.salesBasis === "cost",
            ) ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="mt-2 min-h-8"
              >
                <a
                  href={`/app/store-entry?${new URLSearchParams({
                    storeId: currentReviewData.storeId,
                    date: getKstLedgerDateParam(currentReviewData.closingDate),
                    step: "purchase",
                  }).toString()}`}
                  aria-label="1단계 매입에서 오늘 팔 가격 입력"
                >
                  <ArrowRightIcon aria-hidden="true" />
                  1단계 매입에서 오늘 팔 가격 입력
                </a>
              </Button>
            ) : null}
            <StoreTopSoldItemsChart items={currentReviewData.topSoldItems} />
          </section>
        ) : null}

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
                  {/* 역산 부정행위 방지(point_summary.md:37): 결제 차액 금액은
                      지점장 화면에 노출하지 않는다. 경고 사실만 표시한다. */}
                  <p className="break-words">{warning.detail}</p>
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
                      <span>
                        {signal.quantityLabel ?? "수량"}{" "}
                        {signal.quantityText ??
                          formatSignedQuantity(signal.quantity)}
                      </span>
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
                {feedback.fieldErrors ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {Object.entries(feedback.fieldErrors).flatMap(
                      ([field, messages]) =>
                        messages.map((message) => (
                          <li
                            key={`${field}-${message}`}
                            className="break-words"
                          >
                            {message}
                          </li>
                        )),
                    )}
                  </ul>
                ) : null}
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
