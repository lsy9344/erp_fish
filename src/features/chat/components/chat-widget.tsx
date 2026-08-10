"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircleIcon, SendIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { cn } from "~/lib/utils";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
};

type ChatResponse = { reply?: string; message?: string };

const MAX_MESSAGE_LENGTH = 500;

const EXAMPLE_QUESTIONS = [
  "12월 매출 얼마야?",
  "지난달 남은금액이 줄어든 원인 알려줘",
  "7월에 가장 많이 팔린 품목 알려줘",
];

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isPending, setIsPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, isPending]);

  async function send(question: string) {
    const trimmed = question.trim();

    if (trimmed.length === 0 || isPending) {
      return;
    }

    // 히스토리는 서버에 저장하지 않는다. 매 요청에 함께 보낸다.
    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];

    setMessages(nextMessages);
    setDraft("");
    setIsPending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages
            .filter((message) => !message.isError)
            .map((message) => ({
              role: message.role,
              content: message.content,
            })),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as ChatResponse;

      if (!response.ok) {
        setMessages((previous) => [
          ...previous,
          {
            role: "assistant",
            content: body.message ?? "답변을 가져오지 못했습니다.",
            isError: true,
          },
        ]);

        return;
      }

      setMessages((previous) => [
        ...previous,
        { role: "assistant", content: body.reply ?? "" },
      ]);
    } catch {
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: "네트워크 오류로 답변을 가져오지 못했습니다.",
          isError: true,
        },
      ]);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      {!isOpen && (
        <Button
          type="button"
          size="icon"
          aria-label="데이터 질문하기"
          onClick={() => setIsOpen(true)}
          className="fixed right-6 bottom-6 z-40 size-14 rounded-full shadow-lg"
        >
          <MessageCircleIcon className="size-6" />
        </Button>
      )}

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b">
            <SheetTitle>데이터 질문</SheetTitle>
            <SheetDescription>
              매출 · 손익 · 품목 · 인건비 · 재고를 물어보세요.
            </SheetDescription>
          </SheetHeader>

          <div
            ref={scrollRef}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
          >
            {messages.length === 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground text-xs">
                  이런 질문을 할 수 있어요
                </p>
                {EXAMPLE_QUESTIONS.map((question) => (
                  <Button
                    key={question}
                    type="button"
                    variant="outline"
                    className="h-auto justify-start py-2 text-left text-sm whitespace-normal"
                    onClick={() => void send(question)}
                  >
                    {question}
                  </Button>
                ))}
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground self-end"
                    : "bg-muted self-start",
                  // 오류도 대화 맥락에 남아야 하므로 토스트가 아니라 말풍선이다.
                  message.isError && "bg-destructive/10 text-destructive",
                )}
              >
                {message.content}
              </div>
            ))}

            {isPending && (
              <div className="bg-muted text-muted-foreground self-start rounded-lg px-3 py-2 text-sm">
                조회 중…
              </div>
            )}
          </div>

          <form
            className="flex items-center gap-2 border-t p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={MAX_MESSAGE_LENGTH}
              disabled={isPending}
              placeholder="예: 8월 1일 강서수산 매출 얼마야?"
              aria-label="질문 입력"
            />
            <Button
              type="submit"
              size="icon"
              disabled={isPending || draft.trim().length === 0}
              aria-label="질문 보내기"
            >
              <SendIcon className="size-4" />
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
