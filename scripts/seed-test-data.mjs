// 3일치(2026-06-22 ~ 06-24) 실매장 테스트 데이터 시드.
// - Neon DB(.env.local) 대상. 앱 계산 로직(refreshLedgerInventoryFifoLots)을 직접 호출해 정합성 유지.
// - 이카운트 6/17 엑셀은 실제 파서/커밋 경로로 6/24 장부에 반영.
//
// 실행: node --experimental-strip-types scripts/seed-test-data.mjs
import "./_loadenv.mjs";
import { readFileSync } from "node:fs";
import { PrismaClient } from "../generated/prisma/index.js";
import { refreshLedgerInventoryFifoLots } from "../src/features/inventory/fifo-lots.ts";
import { parseEcountSupplyWorkbook } from "../src/features/ledger/ecount-supply-import.ts";

// 시드는 많은 순차 쿼리를 돌리므로 unpooled 연결을 쓰고 트랜잭션 타임아웃을 늘린다.
if (process.env.DATABASE_URL_UNPOOLED) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}
const db = new PrismaClient();

const EXCEL_PATH = "docs/erp_input/이카운트 엑셀파일.xlsx";
const DAYS = ["2026-06-22", "2026-06-23", "2026-06-24"];
const ECOUNT_TARGET_DAY = "2026-06-24"; // 엑셀 6/17 라인을 이 영업일로 반영

function utcDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

// 결정적 의사난수(매일·품목별로 흔들되 재현 가능). Math.random 미사용.
function seeded(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

async function getActors() {
  const hq = await db.user.findFirst({ where: { role: "HEADQUARTERS" } });
  const sm = await db.user.findFirst({ where: { role: "STORE_MANAGER" } });
  if (!hq || !sm) throw new Error("HQ 또는 STORE_MANAGER 사용자가 없습니다. seed를 먼저 실행하세요.");
  return { hqId: hq.id, smId: sm.id };
}

const STORE_NAMES = ["강남점", "서초점", "송파점"];

// 엑셀 거래처명 → 지점 분배(별칭). 한 지점에 여러 공급처가 매핑된다.
const SUPPLIER_TO_STORE = {
  "진수산(수산물)": "강남점",
  "제일수산": "강남점",
  "정수산": "강남점",
  "오산제일수산": "강남점",
  "안양참수산": "서초점",
  "삼국유통": "서초점",
  "불광수산": "서초점",
  "못골참수산": "서초점",
  "리얼수산": "송파점",
  "구로참수산": "송파점",
  "강서수산": "송파점",
};

async function ensureStores({ smId }) {
  const stores = {};
  for (const name of STORE_NAMES) {
    const store = await db.store.upsert({
      where: { name },
      create: { name, isActive: true },
      update: { isActive: true },
    });
    stores[name] = store;
    await db.userStoreAssignment.upsert({
      where: { userId_storeId: { userId: smId, storeId: store.id } },
      create: { userId: smId, storeId: store.id },
      update: {},
    });
  }
  return stores;
}

const PAYMENT_METHODS = ["현금", "카드", "계좌이체", "기타"];
const EXPENSE_ITEMS = ["임대료", "인건비잡비", "공과금", "소모품", "운반비"];
const LOSS_TYPES = ["폐기", "파손", "변질", "시식제공"];

async function ensureInputCodes({ hqId }) {
  const out = { PAYMENT_METHOD: {}, EXPENSE_ITEM: {}, LOSS_TYPE: {} };
  const groups = [
    ["PAYMENT_METHOD", PAYMENT_METHODS],
    ["EXPENSE_ITEM", EXPENSE_ITEMS],
    ["LOSS_TYPE", LOSS_TYPES],
  ];
  for (const [group, names] of groups) {
    let order = 1;
    for (const name of names) {
      const code = await db.ledgerInputCode.upsert({
        where: { group_name: { group, name } },
        create: { group, name, displayOrder: order, isActive: true, updatedById: hqId },
        update: { isActive: true, displayOrder: order },
      });
      out[group][name] = code;
      order += 1;
    }
  }
  return out;
}

// 엑셀에서 distinct 품목(이름/규격/구분/단가)을 뽑는다.
function extractExcelProducts(parsed) {
  const map = new Map();
  for (const line of parsed.lines) {
    const key = `${line.rawProductName}::${line.productSpec}`;
    if (!map.has(key)) {
      map.set(key, {
        rawProductName: line.rawProductName,
        productName: line.productName,
        productCategory: line.productCategory,
        productSpec: line.productSpec,
        unitPrice: line.unitPrice,
      });
    }
  }
  return [...map.values()];
}

async function ensureProductsAndAliases({ hqId }, parsed) {
  const excelProducts = extractExcelProducts(parsed);
  const products = []; // {id, name, category, spec, unitPrice}
  for (const p of excelProducts) {
    const name = p.productName;
    const category = p.productCategory;
    const spec = p.productSpec;
    const product = await db.product.upsert({
      where: { name_category_spec: { name, category, spec } },
      create: { name, category, spec, defaultUnitPrice: p.unitPrice, isActive: true, updatedById: hqId },
      update: { isActive: true },
    });
    // 이카운트 원문 품목명/규격 → 앱 품목 별칭
    await db.productExternalAlias.upsert({
      where: {
        provider_rawName_rawSpec: { provider: "ECOUNT", rawName: p.rawProductName, rawSpec: p.productSpec },
      },
      create: { provider: "ECOUNT", rawName: p.rawProductName, rawSpec: p.productSpec, productId: product.id, updatedById: hqId },
      update: { productId: product.id, updatedById: hqId },
    });
    products.push({ id: product.id, name, category, spec, unitPrice: p.unitPrice });
  }
  return products;
}

async function ensureStoreAliases({ hqId }, stores) {
  for (const [supplier, storeName] of Object.entries(SUPPLIER_TO_STORE)) {
    const store = stores[storeName];
    const rawName = supplier.trim().replace(/\s+/g, " ");
    await db.storeExternalAlias.upsert({
      where: { provider_rawName: { provider: "ECOUNT", rawName } },
      create: { provider: "ECOUNT", rawName, storeId: store.id, updatedById: hqId },
      update: { storeId: store.id, updatedById: hqId },
    });
  }
}

export {
  db,
  EXCEL_PATH,
  DAYS,
  ECOUNT_TARGET_DAY,
  utcDate,
  seeded,
  getActors,
  ensureStores,
  ensureInputCodes,
  ensureProductsAndAliases,
  ensureStoreAliases,
  STORE_NAMES,
  SUPPLIER_TO_STORE,
  PAYMENT_METHODS,
  EXPENSE_ITEMS,
  LOSS_TYPES,
};

// 메인은 별도 파일에서 import해 구성한다.
