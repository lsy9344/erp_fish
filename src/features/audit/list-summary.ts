import type { Prisma } from "../../../generated/prisma";
import {
  auditItemDetailLabels,
  auditItemNameKeys,
  auditSummaryFieldLabels,
  snapshotNameKeys,
} from "./audit-format.ts";
import { omitSensitiveFields } from "../../server/sensitive-fields.ts";

// v1 필드는 migration의 SQL과 동일하게 유지한다. 형식 변경은 새 버전으로 추가한다.
export const auditListSummaryKeys = [
  ...new Set([...Object.keys(auditSummaryFieldLabels), ...snapshotNameKeys]),
];
export const auditListItemKeys = [
  ...new Set([
    ...auditItemNameKeys,
    "productSpec",
    ...Object.keys(auditItemDetailLabels),
  ]),
];

export type AuditListSummary = {
  version: 1;
  before: Prisma.JsonValue;
  after: Prisma.JsonValue;
  // 배열·단순 값인 구형 형식의 비교 결과. 민감 필드를 제거한 뒤의 동등성만 기록한다.
  rootChanged: boolean | null;
};

function isObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function project(
  value: Prisma.JsonValue,
  summaryObject = true,
): Prisma.JsonValue {
  if (Array.isArray(value)) return value.map((item) => project(item, false));
  if (!isObject(value)) return value;
  const allowed = summaryObject ? auditListSummaryKeys : auditListItemKeys;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) =>
      allowed.includes(key) && item !== undefined
        ? [[key, project(item, summaryObject && isObject(item))]]
        : [],
    ),
  );
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value ?? null;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

/** INSERT 트리거·구형 SQL 투영의 참조 구현. 원문 전체나 서식 적용 문장은 저장하지 않는다. */
export function toAuditListSummary(
  before: Prisma.JsonValue | undefined,
  after: Prisma.JsonValue | undefined,
): AuditListSummary {
  const originalBefore = before ?? null;
  const originalAfter = after ?? null;
  return {
    version: 1,
    before: project(originalBefore),
    after: project(originalAfter),
    rootChanged:
      isObject(originalBefore) || isObject(originalAfter)
        ? null
        : JSON.stringify(canonical(omitSensitiveFields(originalBefore))) !==
          JSON.stringify(canonical(omitSensitiveFields(originalAfter))),
  };
}

export function isAuditListSummary(
  value: Prisma.JsonValue | undefined,
): value is AuditListSummary {
  return Boolean(
    value &&
    isObject(value) &&
    value.version === 1 &&
    Object.hasOwn(value, "before") &&
    Object.hasOwn(value, "after") &&
    (typeof value.rootChanged === "boolean" || value.rootChanged === null),
  );
}
