"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";

import { Tabs } from "~/components/ui/tabs";

type LedgerDetailTabsProps = {
  /** 서버에서 정한 초기 탭(?tab= 또는 기본 sales). */
  value: string;
  /** 허용된 탭 값. URL/popstate에서 읽은 값 검증에 쓴다. */
  tabs: readonly string[];
  children: ReactNode;
  className?: string;
};

// WO-02(2026-06-28): 본사 장부 상세 탭을 URL ?tab= 과 연결한다.
// 핵심 제약(WO-02 보완): 탭 변경이 서버 컴포넌트 전체 재렌더/remount를 유발하면
// 입력 폼이 초기화되고 미저장 경고와 충돌한다. 그래서 router.push(서버 round-trip)
// 대신 client 상태로 즉시 전환하고, URL은 History API로만 동기화한다.
// - pushState로 history 항목을 남겨 뒤로/앞으로가기에서 탭이 같이 움직인다.
// - 기존 쿼리(date/sort/filter)는 보존하고 tab만 바꾼다.
// - 모든 TabsContent는 forceMount이므로 client value만 바꾸면 패널이 즉시 보인다.
function readTabFromLocation(
  fallback: string,
  tabs: readonly string[],
): string {
  if (typeof window === "undefined") {
    return fallback;
  }

  const tab = new URLSearchParams(window.location.search).get("tab");

  return tab && tabs.includes(tab) ? tab : fallback;
}

export function LedgerDetailTabs({
  value,
  tabs,
  children,
  className,
}: LedgerDetailTabsProps) {
  const [activeTab, setActiveTab] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  function scrollToPanel(tab: string) {
    requestAnimationFrame(() => {
      const targetPanel = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(
          "[data-ledger-detail-panel]",
        ) ?? [],
      ).find((panel) => panel.dataset.ledgerDetailPanel === tab);

      targetPanel?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  // 뒤로/앞으로가기로 URL이 바뀌면 탭 상태도 같이 움직인다.
  useEffect(() => {
    function syncFromLocation() {
      setActiveTab(readTabFromLocation(value, tabs));
    }

    window.addEventListener("popstate", syncFromLocation);

    return () => window.removeEventListener("popstate", syncFromLocation);
  }, [value, tabs]);

  function handleValueChange(nextTab: string) {
    if (nextTab === activeTab) {
      return;
    }

    setActiveTab(nextTab);

    const params = new URLSearchParams(window.location.search);
    params.set("tab", nextTab);
    window.history.pushState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}`,
    );

    // forceMount된 패널은 모두 세로로 쌓여 있으므로 탭 컨테이너가 아니라
    // 클릭한 탭에 대응하는 패널 자체를 스크롤 대상으로 삼는다.
    scrollToPanel(nextTab);
  }

  function handleTabClick(event: MouseEvent<HTMLDivElement>) {
    if (
      event.target instanceof Element &&
      event.target.closest('[role="tab"][aria-selected="true"]')
    ) {
      // Radix는 이미 선택된 탭을 다시 누르면 onValueChange를 호출하지 않는다.
      // 탭 클릭 자체가 항상 해당 입력 섹션으로 이동하도록 이 경우를 보완한다.
      scrollToPanel(activeTab);
    }
  }

  return (
    <div ref={containerRef} onClickCapture={handleTabClick}>
      <Tabs
        value={activeTab}
        onValueChange={handleValueChange}
        className={className}
      >
        {children}
      </Tabs>
    </div>
  );
}
