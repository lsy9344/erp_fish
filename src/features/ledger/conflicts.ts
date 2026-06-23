import type { Prisma } from "../../../generated/prisma";

import {
  actionError,
  type ActionConflictValue,
  type ActionResult,
  type LedgerConflictPayload,
} from "~/lib/action-result";

type LedgerConflictSection =
  | "sales"
  | "expenses"
  | "purchases"
  | "inventory"
  | "inventory-adjustment"
  | "losses"
  | "work"
  | "labor"
  | "review"
  | "hq-close";

type LedgerConflictInput = {
  ledgerId: string;
  section: LedgerConflictSection;
  clientToken: string | number;
  serverToken: string | number;
  clientValues: Record<string, ActionConflictValue>;
  serverValues: Record<string, ActionConflictValue>;
  lastModifiedBy: string | null;
  lastModifiedAt: string;
  reloadRequired?: boolean;
  hqEditing?: boolean;
};

const ledgerConflictMetaSelect = {
  id: true,
  version: true,
  updatedAt: true,
  updatedBy: {
    select: {
      name: true,
      email: true,
      role: true,
    },
  },
} as const;

export type LedgerConflictMeta = Prisma.DailyLedgerGetPayload<{
  select: typeof ledgerConflictMetaSelect;
}>;

export async function getLedgerConflictMetaInTx(
  tx: Prisma.TransactionClient,
  ledgerId: string,
): Promise<LedgerConflictMeta | null> {
  return tx.dailyLedger.findUnique({
    where: { id: ledgerId },
    select: ledgerConflictMetaSelect,
  });
}

export async function getLedgerConflictMeta(
  client: Prisma.TransactionClient,
  ledgerId: string,
): Promise<LedgerConflictMeta | null> {
  return getLedgerConflictMetaInTx(client, ledgerId);
}

function getLastModifiedBy(meta: LedgerConflictMeta | null) {
  return meta?.updatedBy.name ?? meta?.updatedBy.email ?? null;
}

function isHeadquartersModified(meta: LedgerConflictMeta | null) {
  return meta?.updatedBy?.role === "HEADQUARTERS";
}

export function toLedgerConflictPayload({
  ledgerId,
  section,
  clientToken,
  serverToken,
  clientValues,
  serverValues,
  lastModifiedBy,
  lastModifiedAt,
  reloadRequired = true,
  hqEditing,
}: LedgerConflictInput): LedgerConflictPayload {
  return {
    ledgerId,
    section,
    clientToken,
    serverToken,
    clientValues,
    serverValues,
    lastModifiedBy,
    lastModifiedAt,
    reloadRequired,
    hqEditing,
  };
}

export function ledgerConflictError<T = never>({
  message = "장부가 다른 곳에서 변경됐습니다. 최신값을 확인한 뒤 다시 저장해 주세요.",
  ...input
}: LedgerConflictInput & { message?: string }): ActionResult<T> {
  return actionError<T>(
    "LEDGER_CONFLICT",
    message,
    undefined,
    toLedgerConflictPayload(input),
  );
}

export function ledgerConflictErrorFromMeta<T = never>({
  meta,
  clientToken,
  serverToken = meta?.version ?? "unknown",
  lastModifiedAt = meta?.updatedAt.toISOString() ?? new Date().toISOString(),
  ...input
}: Omit<
  LedgerConflictInput,
  "serverToken" | "lastModifiedBy" | "lastModifiedAt"
> & {
  meta: LedgerConflictMeta | null;
  serverToken?: string | number;
  lastModifiedAt?: string;
}): ActionResult<T> {
  return ledgerConflictError<T>({
    ...input,
    clientToken,
    serverToken,
    lastModifiedBy: getLastModifiedBy(meta),
    lastModifiedAt,
    hqEditing: input.hqEditing ?? isHeadquartersModified(meta),
  });
}
