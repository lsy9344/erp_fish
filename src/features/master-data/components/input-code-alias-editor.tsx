"use client";

import { useEffect, useState } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  codeAliasTerms,
  type CodeAliasGroupKey,
} from "~/features/master-data/code-alias-terms";
import { setLedgerInputCodeStoreAlias } from "~/features/master-data/code-alias-actions";

export type InputCodeAliasOption = {
  id: string;
  // 현재 이 지점 화면에 보이는 표시명(alias가 있으면 alias, 없으면 본사 등록명).
  name: string;
};

type InputCodeAliasEditorProps = {
  storeId: string;
  options: InputCodeAliasOption[];
  // 손실 유형/비용 항목 등 어떤 코드 그룹의 표시명을 편집하는지.
  groupKey: CodeAliasGroupKey;
};

// 미팅 결정(2026-06-21): 코드 등록은 본사 전용. 지점장은 자기 지점에 보이는
// 표시명만 덮어쓸 수 있다. 빈 값으로 저장하면 본사 등록명으로 되돌아간다.
// WO-09: 손실 유형 전용이던 편집기를 코드 그룹별로 재사용하도록 일반화했다.
export function InputCodeAliasEditor({
  storeId,
  options,
  groupKey,
}: InputCodeAliasEditorProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(options.map((option) => [option.id, option.name])),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  if (options.length === 0) {
    return null;
  }

  const groupTerms = codeAliasTerms[groupKey];
  const headingId = `input-code-alias-heading-${groupKey}`;

  async function handleSave(codeId: string) {
    if (!isHydrated || pendingId === codeId) {
      return;
    }

    setPendingId(codeId);

    try {
      const result = await setLedgerInputCodeStoreAlias(codeId, {
        storeId,
        displayName: drafts[codeId] ?? "",
      });

      if (result.ok) {
        toast.success(codeAliasTerms.saveSuccess);
        return;
      }

      toast.error(result.error.message);
    } catch {
      toast.error(codeAliasTerms.saveError);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="bg-card text-card-foreground rounded-lg border p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-base font-semibold">
          {groupTerms.heading}
        </h2>
        <p className="text-muted-foreground text-sm">
          {groupTerms.description}
        </p>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {options.map((option) => (
          <li
            key={option.id}
            className="flex min-w-0 flex-wrap items-center gap-2"
          >
            <Input
              aria-label={`${option.name} 표시명`}
              value={drafts[option.id] ?? ""}
              onChange={(event) => {
                // currentTarget은 이벤트 핸들러가 끝나면 React가 null로 비운다.
                // setState 업데이터(나중에 호출됨) 안에서 참조하면 null 오류가 나므로
                // 값을 먼저 캡처한 뒤 상태를 갱신한다.
                const nextValue = event.currentTarget.value;
                setDrafts((current) => ({
                  ...current,
                  [option.id]: nextValue,
                }));
              }}
              maxLength={80}
              disabled={!isHydrated || pendingId === option.id}
              className="h-11 min-w-0 flex-1"
              placeholder={codeAliasTerms.fallbackPlaceholder}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-9"
              disabled={!isHydrated || pendingId === option.id}
              onClick={() => handleSave(option.id)}
            >
              <CheckCircle2Icon aria-hidden="true" />
              {pendingId === option.id
                ? codeAliasTerms.saving
                : codeAliasTerms.save}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
