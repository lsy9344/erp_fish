"use server";

import { redirect } from "next/navigation";

import {
  requireHeadquartersStoreScope,
  requireLedgerHqEditAccess,
} from "~/server/authz";
import { db } from "~/server/db";
import { revalidateDashboardAndReports } from "~/server/revalidation";
import { getHqLedgerOpenTarget } from "./hq-open-policy";
import { getOrCreateStoreLedgerInTx } from "./queries";

function readField(formData: FormData, name: string) {
  const value = formData.get(name);

  return typeof value === "string" ? value.trim() : "";
}

// 지점이 아예 작성하지 않은 날짜도 본사가 열어 작성·수정할 수 있게 한다.
// 매입·입력이 하나도 없어도 빈 IN_PROGRESS 장부를 만들고 상세로 보낸다.
// 이미 있으면 그대로 연다(getOrCreateStoreLedgerInTx가 멱등).
export async function openHqLedgerForDate(formData: FormData) {
  const target = getHqLedgerOpenTarget(
    readField(formData, "storeId"),
    readField(formData, "closingDate"),
  );

  if (!target) {
    redirect("/app/unauthorized");
  }

  const user = await requireLedgerHqEditAccess();
  await requireHeadquartersStoreScope(target.storeId);

  const ledger = await db.$transaction((tx) =>
    getOrCreateStoreLedgerInTx(tx, target.storeId, target.closingDate, user.id),
  );

  revalidateDashboardAndReports();
  redirect(`/app/ledgers/${ledger.id}`);
}
