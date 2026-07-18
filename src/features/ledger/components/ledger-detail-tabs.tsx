"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

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

    // 탭바가 요약 섹션들 아래에 있어, 탭만 바꾸면 선택한 항목이 화면에 보이지
    // 않는다. 클릭한 탭 영역을 화면 상단으로 스크롤해 해당 섹션으로 이동시킨다.
    // scroll-mt로 모바일 sticky 헤더(h-14) 높이만큼 여백을 둔다.
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div ref={containerRef} className="scroll-mt-16">
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
