import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();
const toolsPath = path.join(root, "src", "features", "chat", "tools.ts");
const rateLimitPath = path.join(
  root,
  "src",
  "features",
  "chat",
  "rate-limit.ts",
);

const {
  CHAT_TOOLS,
  CHAT_TOOL_BY_NAME,
  chatToolInternals: internals,
} = await import(pathToFileURL(toolsPath).href);
const { consumeRateLimit, CHAT_RATE_LIMIT_PER_MINUTE } = await import(
  pathToFileURL(rateLimitPath).href
);

test("도구 계층은 DB에 직접 접근하지 않는다", () => {
  const source = readFileSync(toolsPath, "utf8");

  // 작업지시서 §2.1: 조회는 전부 기존 리포트 함수 위임이어야 한다.
  // db를 직접 잡으면 그 함수들이 수행하는 authz·지점 scope를 우회하게 된다.
  assert.equal(
    /from\s+["'][^"']*server\/db/.test(source),
    false,
    "tools.ts는 server/db를 import하면 안 된다",
  );
  assert.equal(
    /import\(\s*["'][^"']*server\/db/.test(source),
    false,
    "tools.ts는 server/db를 동적 import해서도 안 된다",
  );
});

test("7개 도구가 모두 등록되어 있다", () => {
  assert.deepEqual(
    CHAT_TOOLS.map((tool) => tool.name),
    [
      "get_period_metrics",
      "get_month_overview",
      "get_product_sales",
      "get_monthly_pnl",
      "get_labor_report",
      "get_inventory_position",
      "get_loss_breakdown",
    ],
  );
  assert.equal(CHAT_TOOL_BY_NAME.size, 7);

  for (const tool of CHAT_TOOLS) {
    assert.ok(tool.description.length > 0, `${tool.name} 설명 필요`);
    assert.equal(tool.parameters.type, "object");
  }
});

test("인건비 도구 출력 allowlist에 개인정보가 없다", () => {
  // Employee/WorkerSettlement에는 계좌번호·주소·연락처가 있다.
  // 이 값들이 외부 LLM API로 나가면 안 된다.
  const forbidden = [
    "bankAccount",
    "address",
    "phone",
    "desiredInsuranceAmount",
    "desiredCashAmount",
    "position",
  ];
  const allowed = [
    ...internals.LABOR_SETTLEMENT_FIELDS,
    ...internals.LABOR_STORE_SUMMARY_FIELDS,
  ];

  for (const field of forbidden) {
    assert.equal(
      allowed.includes(field),
      false,
      `${field}는 챗봇 출력에 포함되면 안 된다`,
    );
  }
});

test("allowlist는 나열된 필드만 통과시킨다", () => {
  const row = {
    workerName: "홍길동",
    storeNames: ["강서수산"],
    workdayCount: 12,
    laborAmount: 1_200_000,
    bankAccount: "110-123-456789",
    desiredCashAmount: 900_000,
    // 원본 타입에 나중에 추가된 필드를 흉내낸다.
    residentNumber: "900101-1234567",
  };

  const picked = internals.pick(row, internals.LABOR_SETTLEMENT_FIELDS);

  assert.deepEqual(Object.keys(picked).sort(), [
    "laborAmount",
    "storeNames",
    "workdayCount",
    "workerName",
  ]);
  // 새 필드가 원본에 생겨도 자동으로 새어 나가지 않아야 한다.
  assert.equal("residentNumber" in picked, false);
  assert.equal("bankAccount" in picked, false);
});

test("계산 불가 지표를 0으로 만들지 않는다", () => {
  assert.equal(internals.metric({ value: 1_234_000, status: "OK" }), 1_234_000);
  assert.equal(internals.metric({ value: 0, status: "OK" }), 0);

  const unavailable = internals.metric({
    value: null,
    status: "UNAVAILABLE",
    reason: "매출원가 미입력",
  });

  assert.equal(typeof unavailable, "string");
  assert.match(unavailable, /산출 불가/);
  assert.match(unavailable, /매출원가 미입력/);

  assert.match(internals.metric(undefined), /산출 불가/);
});

test("지점명은 공백을 무시하고 비교한다", () => {
  assert.equal(internals.normalizeStoreName(" 강서 수산 "), "강서수산");
  assert.equal(internals.normalizeStoreName("강서수산"), "강서수산");
});

test("기간 검증 — 형식·순서·상한", () => {
  assert.deepEqual(internals.resolveRange("2026-08-01", "2026-08-01"), {
    ok: true,
    startDate: "2026-08-01",
    endDate: "2026-08-01",
  });

  const badFormat = internals.resolveRange("2026-8-1", "2026-08-01");
  assert.equal(badFormat.ok, false);
  assert.match(badFormat.error, /YYYY-MM-DD/);

  const badDay = internals.resolveRange("2026-02-30", "2026-03-01");
  assert.equal(badDay.ok, false);

  const reversed = internals.resolveRange("2026-08-10", "2026-08-01");
  assert.equal(reversed.ok, false);
  assert.match(reversed.error, /시작일/);

  // 상한 초과는 조용히 자르지 않는다. 자르면 사용자가 물은 기간과 다른 답이 나간다.
  const tooLong = internals.resolveRange("2024-01-01", "2026-01-01");
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.error, new RegExp(String(internals.MAX_RANGE_DAYS)));

  // 366일 경계는 통과해야 한다(윤년 포함 1년 조회).
  const exactlyMax = internals.resolveRange("2024-01-01", "2024-12-31");
  assert.equal(exactlyMax.ok, true);
});

test("limit은 서버가 강제한다", () => {
  assert.equal(internals.clampLimit(200), internals.MAX_LIMIT);
  assert.equal(internals.clampLimit(0), 1);
  assert.equal(internals.clampLimit(-5), 1);
  assert.equal(internals.clampLimit(7), 7);
  assert.equal(internals.clampLimit(3.9), 3);
  assert.equal(internals.clampLimit(undefined), 5);
  assert.equal(internals.clampLimit(Number.NaN), 5);
});

test("잘못된 도구 인자는 DB 조회 전에 거부된다", async () => {
  const tool = CHAT_TOOL_BY_NAME.get("get_period_metrics");

  const missing = await tool.run({});
  assert.equal(missing.ok, false);
  assert.match(missing.error, /인자가 올바르지 않습니다/);

  const wrongType = await tool.run({
    startDate: 20260801,
    endDate: "2026-08-01",
  });
  assert.equal(wrongType.ok, false);

  const wrongShape = await tool.run({
    startDate: "2026/08/01",
    endDate: "2026-08-01",
  });
  assert.equal(wrongShape.ok, false);
});

test("월 인자는 YYYY-MM만 받는다", async () => {
  const tool = CHAT_TOOL_BY_NAME.get("get_month_overview");

  assert.equal((await tool.run({ month: "2026-8" })).ok, false);
  assert.equal((await tool.run({ month: "2026-08-01" })).ok, false);
  assert.equal((await tool.run({})).ok, false);
});

test("품목 순위는 지점별 행을 품목으로 합산한다", () => {
  // 회귀 방지: 원본은 store × product 단위라(queries.ts:1667) 그대로 자르면
  // 한 지점 수량이 전사 1위로 둔갑한다. 실제로 그렇게 틀렸던 적이 있다
  // (전복 13미: 불광수산 152.9를 전사 1위로 답변. 정답은 합산 429.5).
  const rows = [
    {
      productId: "p1",
      productName: "전복",
      productSpec: "13미",
      productCategory: "생물",
      storeName: "불광수산",
      soldQuantity: 152.9,
      estimatedSalesAmount: 4_000_000,
      lossQuantity: 1,
      statusLabel: "추정",
    },
    {
      productId: "p1",
      productName: "전복",
      productSpec: "13미",
      productCategory: "생물",
      storeName: "못골참수산",
      soldQuantity: 135.9,
      estimatedSalesAmount: 3_500_000,
      lossQuantity: 0,
      statusLabel: "추정",
    },
    {
      productId: "p1",
      productName: "전복",
      productSpec: "13미",
      productCategory: "생물",
      storeName: "강서수산",
      soldQuantity: 87.4,
      estimatedSalesAmount: 1_922_800,
      lossQuantity: 0,
      statusLabel: "판매가 미반영",
    },
    {
      productId: "p2",
      productName: "광어",
      productSpec: "대",
      productCategory: "생물",
      storeName: "불광수산",
      soldQuantity: 200,
      estimatedSalesAmount: 900_000,
      lossQuantity: 0,
      statusLabel: "추정",
    },
  ];

  const { items, productCount } = internals.rankProductSales(
    rows,
    "soldQuantity",
    5,
  );

  assert.equal(productCount, 2, "품목 2개로 묶여야 한다");

  const [top] = items;
  assert.equal(top.productName, "전복");
  // 152.9 + 135.9 + 87.4 = 376.2 — 단일 지점 최대값(200)보다 커야 1위다.
  assert.equal(top.soldQuantity, 376.2);
  assert.equal(top.estimatedSalesAmount, 9_422_800);
  assert.equal(top.lossQuantity, 1);

  // 지점명을 숨기면 LLM이 출처를 오인한다. 반드시 실려 보낸다.
  assert.deepEqual(top.storeNames, ["불광수산", "못골참수산", "강서수산"]);
  // 섞인 상태를 한쪽으로 묻지 않는다.
  assert.deepEqual(top.statusLabels, ["추정", "판매가 미반영"]);

  // 부동소수 꿸리(26.799999999999994)를 그대로 내보내지 않는다.
  const drift = internals.rankProductSales(
    [
      {
        productId: "p3",
        productName: "오징어",
        productSpec: "중",
        productCategory: "냉동",
        storeName: "A",
        soldQuantity: 26.7,
        estimatedSalesAmount: 1,
        lossQuantity: 0,
        statusLabel: "추정",
      },
      {
        productId: "p3",
        productName: "오징어",
        productSpec: "중",
        productCategory: "냉동",
        storeName: "B",
        soldQuantity: 0.1,
        estimatedSalesAmount: 1,
        lossQuantity: 0,
        statusLabel: "추정",
      },
    ],
    "soldQuantity",
    5,
  );
  assert.equal(drift.items[0].soldQuantity, 26.8);

  // productId가 없는 행은 품목명+규격으로 묶는다.
  const noId = internals.rankProductSales(
    [
      {
        productId: null,
        productName: "미등록",
        productSpec: "소",
        productCategory: "기준 미정",
        storeName: "A",
        soldQuantity: 5,
        estimatedSalesAmount: 10,
        lossQuantity: 0,
        statusLabel: "추정",
      },
      {
        productId: null,
        productName: "미등록",
        productSpec: "소",
        productCategory: "기준 미정",
        storeName: "B",
        soldQuantity: 3,
        estimatedSalesAmount: 6,
        lossQuantity: 0,
        statusLabel: "추정",
      },
      {
        productId: null,
        productName: "미등록",
        productSpec: "대",
        productCategory: "기준 미정",
        storeName: "A",
        soldQuantity: 9,
        estimatedSalesAmount: 20,
        lossQuantity: 0,
        statusLabel: "추정",
      },
    ],
    "soldQuantity",
    5,
  );
  assert.equal(noId.productCount, 2, "규격이 다르면 다른 품목이다");
  assert.equal(noId.items[0].soldQuantity, 9);

  // limit은 그대로 적용된다.
  assert.equal(
    internals.rankProductSales(rows, "soldQuantity", 1).items.length,
    1,
  );
});

test("손실은 유형을 자르지 않고 유형 필터는 OR로 합산한다", () => {
  // 회귀 방지: 개요 화면 손실분해는 상위 3개 + "기타"로 뭉치는 탓에(overview.ts:462)
  // "8월 떨이·폐기 합계"를 산출 불가로 답한 적이 있다. 4위 이하 유형도 이름이 남아야 한다.
  const rows = [
    {
      storeName: "강서수산",
      lossTypeName: "폐기",
      productId: "p-flat",
      productName: "광어",
      productSpec: "대",
      quantity: 1.5,
      amount: 30_000,
      usedPlannedPrice: true,
    },
    {
      storeName: "불광수산",
      lossTypeName: "떨이",
      productId: "p-flat",
      productName: "광어",
      productSpec: "대",
      quantity: 2,
      amount: 20_000,
      usedPlannedPrice: true,
    },
    {
      storeName: "강서수산",
      lossTypeName: "떨이",
      productId: "p-abalone",
      productName: "전복",
      productSpec: "13미",
      quantity: 0.1,
      amount: 0,
      // 판매계획가가 없으면 금액이 0으로 저장된다(losses/actions.ts:402).
      usedPlannedPrice: false,
    },
    {
      storeName: "강서수산",
      lossTypeName: "파손",
      productId: "p-octopus",
      productName: "낙지",
      productSpec: "중",
      quantity: 3,
      amount: 90_000,
      usedPlannedPrice: true,
    },
    {
      storeName: "강서수산",
      lossTypeName: "반품",
      productId: "p-octopus",
      productName: "낙지",
      productSpec: "중",
      quantity: 1,
      amount: 10_000,
      usedPlannedPrice: true,
    },
    {
      storeName: "강서수산",
      lossTypeName: "시식",
      productId: "p-octopus",
      productName: "낙지",
      productSpec: "중",
      quantity: 1,
      amount: 5_000,
      usedPlannedPrice: true,
    },
  ];

  const all = internals.groupLossItems(rows, undefined, 5);

  // 유형이 5개면 5개 다 이름이 남아야 한다. "기타"로 뭉치지 않는다.
  assert.deepEqual(
    all.types.map((type) => type.유형),
    ["파손", "폐기", "떨이", "반품", "시식"],
  );
  assert.equal(all.total.금액, 155_000);
  assert.equal(all.total.건수, 6);
  assert.equal(all.total.금액미산정건수, 1);

  const filtered = internals.groupLossItems(rows, ["떨이", "폐기"], 5);

  assert.equal(filtered.total.금액, 50_000);
  assert.equal(filtered.total.수량, 3.6);
  assert.equal(filtered.total.건수, 3);
  assert.equal(filtered.total.금액미산정건수, 1);
  assert.deepEqual(filtered.unmatchedTypeNames, []);

  // 품목은 유형을 가로질러 합산되고 지점·유형 출처를 함께 싣는다.
  const [topProduct] = filtered.products;
  assert.equal(topProduct.품목, "광어");
  assert.equal(topProduct.규격, "대");
  assert.equal(topProduct.금액, 50_000);
  assert.equal(topProduct.수량, 3.5);
  assert.equal(topProduct.지점, "강서수산, 불광수산");

  // 오타·별칭으로 0건이 되면 0원이라고 답하지 않도록 되돌려준다.
  const typo = internals.groupLossItems(rows, ["떠리"], 5);
  assert.deepEqual(typo.unmatchedTypeNames, ["떠리"]);
  assert.equal(typo.total.건수, 0);
  assert.deepEqual(typo.availableTypeNames, [
    "떨이",
    "반품",
    "시식",
    "파손",
    "폐기",
  ]);

  // 공백은 무시한다("떨 이"도 매칭).
  assert.equal(internals.groupLossItems(rows, ["떨 이"], 5).total.건수, 2);

  // 품목 목록만 자르고, 몇 개를 잘랐는지 알려준다.
  const limited = internals.groupLossItems(rows, undefined, 1);
  assert.equal(limited.products.length, 1);
  assert.equal(limited.productCount, 3);
});

test("분당 상한을 넘기면 차단하고 다음 창에서 풀린다", () => {
  const store = new Map();
  const start = 1_000_000;

  for (let call = 1; call <= CHAT_RATE_LIMIT_PER_MINUTE; call += 1) {
    const result = consumeRateLimit(store, "user-1", start + call);

    assert.equal(result.limited, false, `${call}번째 호출은 통과해야 한다`);
  }

  assert.equal(consumeRateLimit(store, "user-1", start + 100).limited, true);

  // 카운터는 사용자별로 독립이다.
  assert.equal(consumeRateLimit(store, "user-2", start + 101).limited, false);

  // 창이 지나면 초기화된다.
  assert.equal(
    consumeRateLimit(store, "user-1", start + 61_000).limited,
    false,
  );
});
