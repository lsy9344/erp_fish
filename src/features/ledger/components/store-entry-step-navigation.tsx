"use client";

import { cn } from "~/lib/utils";
import { getKstLedgerDateParam } from "~/features/ledger/date";
import {
  type StoreEntryStep,
  type StoreEntryStepCompletion,
} from "~/features/ledger/step-completion";

type StoreEntryStepNavigationProps = {
  storeId: string;
  closingDate: string;
  currentStep: StoreEntryStep;
  stepCompletion?: StoreEntryStepCompletion;
  onNavigateAttempt?: (href: string, trigger: HTMLAnchorElement) => void;
};

const steps: { id: StoreEntryStep; label: string }[] = [
  { id: "sales", label: "1단계: 매출/결제" },
  { id: "cost", label: "2단계: 비용" },
  { id: "purchase", label: "3단계: 매입" },
  { id: "losses", label: "4단계: 손실/폐기" },
  { id: "inventory", label: "5단계: 재고" },
  { id: "work", label: "6단계: 근무/인건비" },
  { id: "review", label: "7단계: 검토/제출" },
];

function stepHref(storeId: string, closingDate: string, step: StoreEntryStep) {
  const params = new URLSearchParams({
    storeId,
    date: getKstLedgerDateParam(closingDate),
  });

  if (step === "inventory" || step === "losses") {
    return `/app/store-entry/${step}?${params.toString()}`;
  }

  params.set("step", step);

  return `/app/store-entry?${params.toString()}`;
}

export function StoreEntryStepNavigation({
  storeId,
  closingDate,
  currentStep,
  stepCompletion = {},
  onNavigateAttempt,
}: StoreEntryStepNavigationProps) {
  return (
    <section
      aria-label="장부 입력 단계"
      className="bg-card text-card-foreground rounded-lg border p-4"
    >
      <p className="mb-3 text-sm font-medium">현재 단계</p>
      <ol className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
        {steps.map((step) => {
          const isCurrent = step.id === currentStep;
          const isSaved = stepCompletion[step.id] === true;

          return (
            <li key={step.id}>
              <a
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "block min-h-11 rounded-md border px-3 py-2 text-sm",
                  isCurrent
                    ? "border-emerald-500/40 bg-emerald-500/5 font-medium text-emerald-700 dark:text-emerald-300"
                    : "text-muted-foreground hover:text-foreground",
                )}
                href={stepHref(storeId, closingDate, step.id)}
                onClick={(event) => {
                  if (!onNavigateAttempt || isCurrent) {
                    return;
                  }

                  event.preventDefault();
                  onNavigateAttempt(
                    event.currentTarget.href,
                    event.currentTarget,
                  );
                }}
              >
                {step.label}
                {isSaved ? (
                  <span
                    className={cn(
                      "ml-1 text-xs",
                      isCurrent
                        ? "font-normal opacity-75"
                        : "text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    저장됨
                  </span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
