import { expect, test } from "@playwright/test";
import {
  setupReportFixtures,
  STORE_IDS,
  STORY_EMPLOYEE_ID,
  login,
  getTodayKstInput,
  seedDailyChartAndRankingFixtures,
  seedEqualInventoryRatioFixture,
  cleanupDailyChartAndRankingFixtures,
  getDesktopRow,
} from "./_helpers/hq-reports";

setupReportFixtures();

test("본사는 일별 아침 회의 리포트에서 지점별 상태와 정정 반영 숫자를 본다", async ({
  page,
}) => {
  await seedEqualInventoryRatioFixture();
  await login(page, "hq@example.com");
  await page.goto("/app/reports/daily?date=today");

  await expect(
    page.getByRole("heading", { name: "아침 회의 리포트" }),
  ).toBeVisible();
  // 냉동/생물 매출 차트 카드는 일별 리포트에서 제거됐다.
  await expect(
    page.getByRole("heading", { name: "냉동/생물 매출 (추정)" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("품목별 POS 매출이 없어 재고 흐름 기반 추정값입니다."),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "지점별 영업 매출·이익률" }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "마진율순", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "매출액순", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "품목별 판매 현황" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("columnheader", { name: "판매수량" })
      .or(page.getByText("품목별 판매 데이터 없음"))
      .first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "오늘" })).toBeVisible();
  await expect(page.getByRole("link", { name: "어제" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Excel/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /CSV/ })).toBeVisible();
  await expect(page.getByLabel("조회 날짜")).toHaveValue(getTodayKstInput());
  await expect(
    page.getByRole("columnheader", { name: "최신 반영" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "상태 메시지" }),
  ).toBeVisible();

  const expectedSectionOrder = [
    "지점별 영업 매출·이익률",
    "매출 분석",
    "직원 근태 현황",
    "품목별 판매 현황",
    "마감·이상 신호 현황",
  ];
  const sectionHeadings = await page.locator("h2").allTextContents();
  expect(
    expectedSectionOrder.map((heading) => sectionHeadings.indexOf(heading)),
  ).toEqual([...expectedSectionOrder.keys()]);

  const salesAnalysisSection = page
    .getByRole("heading", { name: "매출 분석", exact: true })
    .locator("..");
  const salesChangeCard = salesAnalysisSection
    .locator('[data-slot="card"]')
    .filter({ hasText: "전일 대비 매출액 증감률" });
  await expect(
    salesChangeCard.getByLabel("지점별 전일 대비 매출액 증감률 차트"),
  ).toBeVisible();
  await expect(salesChangeCard).toContainText("+50% 증가");
  await expect(salesChangeCard).toContainText("15,000원");
  await expect(salesChangeCard).not.toContainText("선택일 매출");
  await expect(salesChangeCard).not.toContainText("전일 매출액");

  const inventoryCard = salesAnalysisSection
    .locator('[data-slot="card"]')
    .filter({ hasText: "재고비율" });
  await expect(inventoryCard.getByLabel("지점별 재고비율 차트")).toBeVisible();
  const inventoryRatioRow = inventoryCard
    .getByRole("table", { name: "지점별 재고비율 데이터" })
    .getByRole("row")
    .filter({ hasText: "스토리6-1 정정마감점" });
  await expect(inventoryRatioRow).toContainText("₩120,000");
  await expect(inventoryRatioRow).toContainText("266.7%");
  await expect(inventoryRatioRow).not.toContainText("+");
  await expect(inventoryCard).toContainText("266.7%");
  await expect(inventoryCard).not.toContainText("75,000원");
  const inventoryRatioLabels = inventoryCard.locator(
    '[data-slot="inventory-ratio-label"]',
  );
  await expect(inventoryRatioLabels.first()).toBeVisible();
  const inventoryRatioLabelBoxes = await inventoryRatioLabels.evaluateAll(
    (labels) =>
      labels
        .map((label) => label.getBoundingClientRect())
        .sort((a, b) => a.top - b.top)
        .map(({ top, bottom }) => ({ top, bottom })),
  );
  for (let index = 1; index < inventoryRatioLabelBoxes.length; index += 1) {
    expect(inventoryRatioLabelBoxes[index]!.top).toBeGreaterThanOrEqual(
      inventoryRatioLabelBoxes[index - 1]!.bottom,
    );
  }
  const equalInventoryRatioRow = inventoryCard
    .getByRole("table", { name: "지점별 재고비율 데이터" })
    .getByRole("row")
    .filter({ hasText: "재고동일점" });
  await expect(equalInventoryRatioRow).toContainText("₩45,000");
  await expect(equalInventoryRatioRow).toContainText("100.0%");
  await expect(salesChangeCard).toContainText("전일 매출 0원");
  const incompleteInventoryRow = inventoryCard
    .getByRole("table", { name: "지점별 재고비율 데이터" })
    .getByRole("row")
    .filter({ hasText: "스토리6-2 입력중점" });
  await expect(incompleteInventoryRow).toContainText("저장 FIFO 재고금액 누락");

  const positionCard = salesAnalysisSection
    .locator('[data-slot="card"]')
    .filter({ hasText: "매장 매출 포지션" });
  await expect(
    positionCard.getByLabel("지점별 선택일 매출 비중 도넛 차트"),
  ).toBeVisible();
  await expect(positionCard).toContainText("가 동률점");
  await expect(positionCard).toContainText("나 동률점");
  await expect(positionCard).toContainText("스토리6-1 정정마감점");
  await expect(positionCard).toContainText(/\d+(?:\.\d+)?% \([\d,]+원\)/);
  await expect(positionCard).not.toContainText("전체 평균 대비");
  await expect(positionCard).toContainText(
    "스토리6-1 미입력점: 선택일 장부 미입력",
  );
  await expect(positionCard).toContainText("스토리6-1 휴무점: 선택일 휴무");

  const attendanceSection = page
    .getByRole("heading", { name: "직원 근태 현황", exact: true })
    .locator("..");
  await expect(attendanceSection).toContainText("복합 미연결 직원");
  await expect(attendanceSection).toContainText("지각");
  await expect(attendanceSection).toContainText("조퇴");
  await expect(attendanceSection).toContainText("특이사항");
  await expect(attendanceSection).toContainText("직원 미연결");
  await expect(attendanceSection).not.toContainText("정상 연결 직원");
  await expect(attendanceSection).not.toContainText("명단 미입력 1명");
  await expect(attendanceSection).not.toContainText("근태 미입력");
  const attendanceText = await attendanceSection.innerText();
  const attendanceDigits = attendanceText.replace(/\D/g, "");
  expect(attendanceDigits).not.toContain("987654321");
  expect(attendanceDigits).not.toContain("876543219");
  expect(attendanceText).not.toContain(STORY_EMPLOYEE_ID);

  const emptyRow = getDesktopRow(page, STORE_IDS.empty);
  await expect(emptyRow).toContainText("스토리6-1 미입력점");
  await expect(emptyRow).toContainText("미입력");
  await expect(emptyRow).toContainText("반영 전");
  await expect(emptyRow).toContainText("미제출");
  await expect(emptyRow).toContainText("입력 전");

  const closedRow = getDesktopRow(page, STORE_IDS.closed);
  await expect(closedRow).toContainText("스토리6-1 정정마감점");
  await expect(closedRow).toContainText("본사 마감");
  await expect(closedRow).toContainText(
    /회의 반영 완료|지연 제출|확인 필요 - 기준값 설정 전/,
  );
  await expect(closedRow).toContainText("₩45,000");
  await expect(
    closedRow.getByRole("link", { name: "상세 보기" }),
  ).toHaveAttribute("href", /\/app\/ledgers\//);

  const holidayRow = getDesktopRow(page, STORE_IDS.holiday);
  await expect(holidayRow).toContainText("스토리6-1 휴무점");
  await expect(holidayRow).toContainText("휴무");
  await expect(holidayRow).toContainText("휴무일");
  await expect(holidayRow).toContainText("정정 확인 필요");
});

test("지정 지점 본사는 일별 매출 분석과 근태에서 권한 밖 지점을 보지 않는다", async ({
  page,
}) => {
  await login(page, "hq-assigned@example.com");
  await page.goto("/app/reports/daily?date=today");

  await expect(
    page.getByRole("heading", { name: "매출 분석", exact: true }),
  ).toBeVisible();
  const assignedSalesAnalysis = page
    .getByRole("heading", { name: "매출 분석", exact: true })
    .locator("..");
  const assignedAttendance = page
    .getByRole("heading", { name: "직원 근태 현황", exact: true })
    .locator("..");
  await expect(assignedSalesAnalysis).toContainText("서초점");
  await expect(assignedAttendance).toContainText(
    "선택일에 지각·조퇴·특이사항이 없습니다.",
  );
  for (const hiddenText of [
    "스토리6-1 정정마감점",
    "스토리6-1 미입력점",
    "스토리6-1 휴무점",
    "정상 연결 직원",
    "복합 미연결 직원",
    "10분 지각",
    "가 동률점",
    "나 동률점",
    "0원 매출점",
  ]) {
    await expect(page.getByText(hiddenText, { exact: false })).toHaveCount(0);
  }
});

test.describe("일별 차트와 품목 순위 전용 데이터", () => {
  test.beforeEach(async () => {
    await seedDailyChartAndRankingFixtures();
  });

  test.afterEach(async () => {
    await cleanupDailyChartAndRankingFixtures();
  });

  test("매출 검토는 기존 정렬 버튼으로 동일 차트의 지점 순서를 바꾼다", async ({
    page,
  }) => {
    await login(page, "hq@example.com");
    await page.goto("/app/reports/sales-review?date=today");

    const section = page
      .locator("section")
      .filter({ hasText: "지점별 영업 매출 합계·마진율" });
    const salesSort = section.getByRole("button", {
      name: "매출액순",
      exact: true,
    });
    const marginSort = section.getByRole("button", {
      name: "마진율순",
      exact: true,
    });
    const bars = section.locator('[data-testid^="store-performance-bar-"]');

    await expect(salesSort).toHaveAttribute("aria-pressed", "true");
    await expect(marginSort).toHaveAttribute("aria-pressed", "false");
    await expect(bars.first()).toHaveAttribute(
      "data-testid",
      `store-performance-bar-${STORE_IDS.marginSortHighSales}`,
    );
    const salesOrder = await bars.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-testid")),
    );
    expect(
      salesOrder.indexOf(
        `store-performance-bar-${STORE_IDS.marginSortHighSales}`,
      ),
    ).toBeLessThan(
      salesOrder.indexOf(`store-performance-bar-${STORE_IDS.marginDefault}`),
    );

    await marginSort.click();

    await expect(salesSort).toHaveAttribute("aria-pressed", "false");
    await expect(marginSort).toHaveAttribute("aria-pressed", "true");
    await expect(
      section.getByTestId("store-performance-chart-scroll"),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const marginOrder = await bars.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("data-testid")),
        );
        return (
          marginOrder.indexOf(
            `store-performance-bar-${STORE_IDS.marginDefault}`,
          ) <
          marginOrder.indexOf(
            `store-performance-bar-${STORE_IDS.marginSortHighSales}`,
          )
        );
      })
      .toBe(true);
  });

  test("아침 회의 지점별 실적은 매출·마진 보기를 분리하고 5.00%p 경계를 적용한다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "hq@example.com");
    await page.goto("/app/reports/daily?date=today");

    const section = page
      .locator("section")
      .filter({ hasText: "지점별 영업 매출·이익률" });
    const salesMode = section.getByRole("radio", {
      name: "매출액순",
      exact: true,
    });
    const marginMode = section.getByRole("radio", {
      name: "마진율순",
      exact: true,
    });
    await expect(salesMode).toHaveAttribute("aria-checked", "true");
    await expect(marginMode).toHaveAttribute("aria-checked", "false");

    const bars = section.locator('[data-testid^="store-performance-bar-"]');
    await expect(
      section.getByTestId(`store-performance-bar-${STORE_IDS.marginDefault}`),
    ).toBeAttached();
    const scroller = section.getByTestId("store-performance-chart-scroll");
    await expect(scroller).toBeVisible();
    expect(
      await scroller.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      ),
    ).toBe(true);

    for (const bar of await bars.all()) {
      expect((await bar.boundingBox())?.height ?? 0).toBeCloseTo(26, 0);
    }

    const performanceLabels = section.locator(
      '[data-slot="store-performance-bar-label"]',
    );
    await expect(performanceLabels.first()).toBeVisible();
    await expect(performanceLabels.first().locator("tspan")).toHaveCount(2);
    await expect(performanceLabels.first().locator("tspan").nth(0)).toHaveText(
      /^₩[\d,]+$/,
    );
    await expect(performanceLabels.first().locator("tspan").nth(1)).toHaveText(
      /^실제 .+ \(예상 .+\) · 차이 .+/,
    );
    const performanceLabelBoxes = await performanceLabels.evaluateAll(
      (labels) =>
        labels
          .map((label) => label.getBoundingClientRect())
          .sort((a, b) => a.top - b.top)
          .map(({ top, bottom }) => ({ top, bottom })),
    );
    for (let index = 1; index < performanceLabelBoxes.length; index += 1) {
      expect(performanceLabelBoxes[index]!.top).toBeGreaterThanOrEqual(
        performanceLabelBoxes[index - 1]!.bottom,
      );
    }

    const accessibleTable = section.getByRole("table", {
      name: "지점별 매출 구성과 마진 데이터",
    });
    const defaultMarginRow = accessibleTable
      .locator("tbody tr")
      .filter({ hasText: "경계 기본점" });
    await expect(defaultMarginRow).toContainText("경계 기본점");
    await expect(defaultMarginRow).toContainText("₩1,000,001");
    await expect(defaultMarginRow).toContainText("30.0%");
    await expect(defaultMarginRow).toContainText("25.0%");
    await expect(defaultMarginRow).toContainText("+5.0%p");
    await expect(defaultMarginRow).toContainText("기준 이내");

    const destructiveMarginRow = accessibleTable
      .locator("tbody tr")
      .filter({ hasText: "경계 경고점" });
    await expect(destructiveMarginRow).toContainText("+5.0%p");
    await expect(destructiveMarginRow).toContainText("지점 설정값 5.0%p 이상");

    const missingMarginRow = accessibleTable
      .locator("tbody tr")
      .filter({ hasText: "경계 예상없음점" });
    await expect(missingMarginRow).toContainText("경계 예상없음점");
    await expect(missingMarginRow).toContainText("₩1,000,001");
    await expect(missingMarginRow).toContainText("30.0%");
    await expect(missingMarginRow).toContainText("판정 불가");

    const salesOrder = await bars.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-testid")),
    );
    expect(
      salesOrder.indexOf(`store-performance-bar-${STORE_IDS.marginDefault}`),
    ).toBeLessThan(
      salesOrder.indexOf(`store-performance-bar-${STORE_IDS.closed}`),
    );
    expect(salesOrder).not.toContain(
      `store-performance-bar-${STORE_IDS.empty}`,
    );

    await section
      .getByTestId(`store-performance-bar-${STORE_IDS.marginDefault}`)
      .hover();
    await expect(section.locator(".recharts-tooltip-wrapper")).toContainText(
      /₩1,000,001\s*실제 30\.0% \(예상 25\.0%\) · 차이 \+5\.0%p/,
    );

    await section
      .getByTestId(`store-performance-bar-${STORE_IDS.marginDestructive}`)
      .hover();
    await expect(section.locator(".recharts-tooltip-wrapper")).toContainText(
      /₩1,000,001\s*실제 30\.0% \(예상 25\.0%\) · 차이 \+5\.0%p · 기준 이상/,
    );

    await marginMode.click();
    await expect(salesMode).toHaveAttribute("aria-checked", "false");
    await expect(marginMode).toHaveAttribute("aria-checked", "true");
    await expect(bars).toHaveCount(0);
    await expect(
      section.getByTestId("store-performance-chart-scroll"),
    ).toHaveCount(0);

    const marginCards = section.locator('[data-testid^="store-margin-card-"]');
    const marginCardLabels = await marginCards.allTextContents();
    const firstUnavailableIndex = marginCardLabels.findIndex((label) =>
      label.includes("판정 불가"),
    );
    expect(firstUnavailableIndex).toBeGreaterThan(0);
    expect(
      marginCardLabels
        .slice(firstUnavailableIndex)
        .every((label) => label.includes("판정 불가")),
    ).toBe(true);

    const defaultModeRow = section.getByTestId(
      `store-margin-card-${STORE_IDS.marginDefault}`,
    );
    await expect(defaultModeRow).toContainText("기준 이내");
    await expect(defaultModeRow).toContainText("+5.0%p");

    const destructiveModeRow = section.getByTestId(
      `store-margin-card-${STORE_IDS.marginDestructive}`,
    );
    await expect(destructiveModeRow).toContainText("지점 설정값 5.0%p 이상");
    await expect(destructiveModeRow).toContainText("+5.0%p");

    const missingModeRow = section.getByTestId(
      `store-margin-card-${STORE_IDS.marginMissing}`,
    );
    await expect(missingModeRow).toContainText("판정 불가");
    await expect(missingModeRow).toContainText(
      "계획 매출 또는 매출이익이 부족해 판매가 기준 마진율을 계산할 수 없습니다.",
    );
  });

  test("모바일 마진 보기는 카드로 읽히며 페이지 가로 넘침이 없다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "hq@example.com");
    await page.goto("/app/reports/daily?date=today");

    const section = page
      .locator("section")
      .filter({ hasText: "지점별 영업 매출·이익률" });
    await section.getByRole("radio", { name: "마진율순", exact: true }).click();

    const card = section.getByTestId(
      `store-margin-card-${STORE_IDS.marginDefault}`,
    );
    await expect(card).toBeVisible();
    await expect(
      section.getByTestId(`store-margin-row-${STORE_IDS.marginDefault}`),
    ).toBeHidden();
    await expect(card).toContainText("경계 기본점");
    await expect(card).toContainText("실제");
    await expect(card).toContainText("예상");
    await expect(card).toContainText("차이");

    const viewportWidths = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(viewportWidths.scrollWidth).toBeLessThanOrEqual(
      viewportWidths.clientWidth + 1,
    );

    const cardBox = await card.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(cardBox!.x).toBeGreaterThanOrEqual(0);
    expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(
      viewportWidths.clientWidth + 1,
    );
  });

  test("일별 품목별 판매 현황은 판매수량 상위 10개와 이름·규격 검색을 제공한다", async ({
    page,
  }) => {
    await login(page, "hq@example.com");
    await page.goto("/app/reports/daily?date=today");

    const section = page
      .locator("section")
      .filter({ hasText: "품목별 판매 현황" });
    // WO-25(2026-07-25) #5: 차트는 삭제되었고 표만 남는다.
    await expect(
      section.getByLabel("품목별 판매수량 상위 10개 세로 막대 차트"),
    ).toHaveCount(0);
    await expect(section.getByText("판매수량 상위 10개")).toBeVisible();
    for (const summaryLabel of [
      "추정 판매액 합계",
      "추정 매출이익 합계",
      "당일 추정 이익률",
      "품목 수",
    ]) {
      await expect(
        section.getByText(summaryLabel, { exact: true }),
      ).toHaveCount(0);
    }

    await expect(section.getByRole("columnheader")).toHaveText([
      "품목",
      "규격",
      "판매수량",
    ]);
    const salesRankingTable = section.getByRole("table");
    expect(
      (await salesRankingTable.boundingBox())?.width ??
        Number.POSITIVE_INFINITY,
    ).toBeLessThanOrEqual(672);
    for (const removedHeader of [
      "분류",
      "추정 판매액",
      "추정 원가",
      "추정 마진",
      "추정 이익률",
      "상태",
    ]) {
      await expect(
        section.getByRole("columnheader", { name: removedHeader, exact: true }),
      ).toHaveCount(0);
    }

    const rows = section.locator("tbody tr");
    await expect(rows).toHaveCount(10);
    // WO-25(2026-07-25) #5: 차트가 렌더링했던 "이름 · 규격" 합침 라벨은 사라졌다.
    // 표는 품목명과 규격을 별도 셀로 내려주므로 셀 단위로 확인한다.
    await expect(rows.first().locator("td").nth(0)).toContainText(
      "검색전용품목01",
    );
    await expect(rows.first().locator("td").nth(1)).toHaveText("숨은규격01");
    await expect(rows.first().locator("td").nth(2)).toHaveText(/\d/);
    await expect(rows.last()).toContainText("검색전용품목10");
    await expect(section.getByText("검색전용품목11")).toHaveCount(0);

    await rows
      .first()
      .getByRole("button", {
        name: "검색전용품목01 매장별 판매수량 상세 보기",
      })
      .click();
    const storeSalesDialog = page.getByRole("dialog");
    await expect(storeSalesDialog).toContainText(
      "검색전용품목01 매장별 판매수량",
    );
    await expect(storeSalesDialog).toContainText("전체 판매수량 12");
    await expect(storeSalesDialog).toContainText("품목 순위점");
    await expect(
      storeSalesDialog.getByRole("table", {
        name: "검색전용품목01 매장별 판매수량 목록",
      }),
    ).toContainText("12");
    await expect(storeSalesDialog).toContainText(
      "POS 실제 판매가 아니라 재고 흐름으로 계산한 추정값입니다.",
    );
    await page.keyboard.press("Escape");

    const search = section.getByLabel("품목 검색");
    await expect(search).toHaveAttribute("type", "search");
    await expect(search).toHaveAttribute(
      "placeholder",
      "품목명 또는 규격 검색",
    );
    await search.fill("검색전용품목11");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("검색전용품목11");

    await search.fill("");
    await expect(rows).toHaveCount(10);
    await search.fill("숨은규격12");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("검색전용품목12");
    await search.fill("없는 품목");
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator("td")).toHaveCount(1);
    await expect(rows.first().locator("td")).toHaveAttribute("colspan", "3");
    await expect(rows.first()).toHaveText("검색 결과가 없습니다.");

    await expect(section).toContainText(
      "판매수량 = 전일재고 + 당일매입 − 손실수량 − 당일재고. POS 실제 판매 데이터가 아닌 재고 흐름 기반 추정값입니다.",
    );

    await search.fill("");
    await page.setViewportSize({ width: 390, height: 844 });
    const viewportWidths = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(viewportWidths.scrollWidth).toBeLessThanOrEqual(
      viewportWidths.clientWidth + 1,
    );
  });
});

test("본사는 선택한 특정 일자의 리포트를 본다", async ({ page }) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/daily?date=2026-05-31");

  await expect(page.getByLabel("조회 날짜")).toHaveValue("2026-05-31");

  const closedRow = getDesktopRow(page, STORE_IDS.closed);
  await expect(closedRow).toContainText("스토리6-1 정정마감점");
  await expect(closedRow).toContainText("₩777,000");
  await expect(closedRow).not.toContainText("₩45,000");
});

test("본사는 리포트 숫자 근거에서 원본과 정정 반영값을 확인하고 정정 타임라인으로 이동한다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/daily?date=today");

  const closedRow = getDesktopRow(page, STORE_IDS.closed);
  await closedRow.getByText("근거 보기").first().click();

  await expect(closedRow).toContainText("원본");
  await expect(closedRow).toContainText("₩300,000");
  await expect(closedRow).toContainText("정정 반영");
  await expect(closedRow).toContainText("₩45,000");
  await expect(closedRow).toContainText("계산 불가 사유");

  const timelineLink = closedRow.getByRole("link", { name: "정정 타임라인" });
  await expect(timelineLink).toHaveAttribute(
    "href",
    /\/app\/ledgers\/.+#correction-timeline/,
  );

  await timelineLink.click();
  await expect(page).toHaveURL(/#correction-timeline$/);
  await expect(page.getByRole("heading", { name: "정정 기록" })).toBeVisible();
});

test("본사는 리포트 숫자 근거에서 미입력과 휴무 상태를 구분해 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto("/app/reports/daily?date=today");

  const emptyRow = getDesktopRow(page, STORE_IDS.empty);
  await emptyRow.getByText("근거 보기").first().click();
  await expect(emptyRow).toContainText("미입력");
  await expect(emptyRow).toContainText("계산 불가 사유");

  const holidayRow = getDesktopRow(page, STORE_IDS.holiday);
  await holidayRow.getByText("근거 보기").first().click();
  await expect(holidayRow).toContainText("휴무");
  await expect(holidayRow).toContainText("원본");
});

test("본사는 좁은 화면에서도 일별 아침 회의 리포트 핵심 상태를 본다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page, "hq@example.com");
  await page.goto("/app/reports/daily?date=today");

  await expect(
    page.getByRole("heading", { name: "아침 회의 리포트" }),
  ).toBeVisible();
  const expectedSectionOrder = [
    "지점별 영업 매출·이익률",
    "매출 분석",
    "직원 근태 현황",
    "품목별 판매 현황",
    "마감·이상 신호 현황",
  ];
  const sectionHeadings = await page.locator("h2").allTextContents();
  expect(
    expectedSectionOrder.map((heading) => sectionHeadings.indexOf(heading)),
  ).toEqual([...expectedSectionOrder.keys()]);

  const attendanceSection = page
    .getByRole("heading", { name: "직원 근태 현황", exact: true })
    .locator("..");
  const attendanceCards = attendanceSection.locator("div.md\\:hidden");
  await expect(attendanceCards.getByText("복합 미연결 직원")).toBeVisible();
  await expect(attendanceCards.getByText("정상 연결 직원")).toHaveCount(0);
  await expect(attendanceCards.getByText("명단 미입력 1명")).toHaveCount(0);

  const emptyCard = page.locator(
    `[data-testid="hq-report-mobile-row-${STORE_IDS.empty}"]`,
  );
  await expect(emptyCard).toBeVisible();
  await expect(emptyCard).toContainText("스토리6-1 미입력점");
  await expect(emptyCard).toContainText("최신 반영");
  await expect(emptyCard).toContainText("반영 전");
  await expect(emptyCard).toContainText("상태 메시지");
  await expect(emptyCard).toContainText("미제출");
  await expect(emptyCard).toContainText("입력 전");

  const closedCard = page.locator(
    `[data-testid="hq-report-mobile-row-${STORE_IDS.closed}"]`,
  );
  await expect(closedCard).toBeVisible();
  await expect(closedCard).toContainText("스토리6-1 정정마감점");
  await expect(closedCard).toContainText("본사 마감");
  await expect(closedCard).toContainText(
    /회의 반영 완료|지연 제출|확인 필요 - 기준값 설정 전/,
  );
  await expect(closedCard).toContainText("₩45,000");
  await expect(closedCard).toContainText("정정 반영");
  await expect(
    closedCard.getByRole("link", { name: "상세 보기" }),
  ).toHaveAttribute("href", /\/app\/ledgers\//);

  const holidayCard = page.locator(
    `[data-testid="hq-report-mobile-row-${STORE_IDS.holiday}"]`,
  );
  await expect(holidayCard).toBeVisible();
  await expect(holidayCard).toContainText("스토리6-1 휴무점");
  await expect(holidayCard).toContainText("휴무일");
  await expect(holidayCard).toContainText("정정 확인 필요");

  const viewportWidths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewportWidths.scrollWidth).toBeLessThanOrEqual(
    viewportWidths.clientWidth + 1,
  );
});
