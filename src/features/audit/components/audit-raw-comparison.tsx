"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import type { AuditHistoryDetail } from "../audit-queries";

export function AuditRawComparison({ auditId }: { auditId: string }) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [detail, setDetail] = useState<AuditHistoryDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || detail) return;
    const controller = new AbortController();
    void fetch(`/api/audit/${encodeURIComponent(auditId)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("audit_detail_unavailable");
        const value: unknown = await response.json();
        if (
          !value ||
          typeof value !== "object" ||
          !("beforeText" in value) ||
          typeof value.beforeText !== "string" ||
          !("afterText" in value) ||
          typeof value.afterText !== "string"
        ) {
          throw new Error("audit_detail_invalid");
        }
        if (!controller.signal.aborted) {
          setDetail({
            beforeText: value.beforeText,
            afterText: value.afterText,
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [open, attempt, auditId, detail]);

  return (
    <details
      className="rounded-md border"
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        if (nextOpen) setFailed(false);
        setOpen(nextOpen);
      }}
    >
      <summary className="cursor-pointer p-3 text-sm font-semibold">
        원문 변경 전/후 (JSON)
      </summary>
      {open && !detail ? (
        <div className="flex flex-col gap-3 p-3 pt-0">
          {failed ? (
            <>
              <Alert>
                <AlertDescription>
                  원문을 불러오지 못했습니다. 접근 권한을 확인하거나 다시 불러와
                  주세요.
                </AlertDescription>
              </Alert>
              <Button
                variant="outline"
                onClick={() => {
                  setFailed(false);
                  setAttempt((value) => value + 1);
                }}
              >
                다시 불러오기
              </Button>
            </>
          ) : (
            <p role="status" className="text-muted-foreground text-sm">
              원문을 불러오는 중입니다.
            </p>
          )}
        </div>
      ) : null}
      {detail ? (
        <div className="grid gap-4 p-3 pt-0 lg:grid-cols-2">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">변경 전</h3>
            <pre className="bg-muted max-h-96 overflow-auto rounded-md p-3 text-sm break-words whitespace-pre-wrap">
              {detail.beforeText}
            </pre>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">변경 후</h3>
            <pre className="bg-muted max-h-96 overflow-auto rounded-md p-3 text-sm break-words whitespace-pre-wrap">
              {detail.afterText}
            </pre>
          </section>
        </div>
      ) : null}
    </details>
  );
}
