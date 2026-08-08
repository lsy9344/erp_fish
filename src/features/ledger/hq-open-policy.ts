import { getKstBusinessDateParam, getTodayKstInput } from "./date.ts";

// 본사가 미작성 장부를 열 때의 입력 판정. 지점 범위·권한은 action이 이어서 본다.
// 미래 날짜는 오타로 빈 장부를 만들어 관제판을 오염시키므로 막는다.
export function getHqLedgerOpenTarget(
  storeId: string,
  closingDateInput: string,
  today = getTodayKstInput(),
): { storeId: string; closingDate: string } | null {
  if (storeId.length === 0) {
    return null;
  }

  let closingDate: string;

  try {
    closingDate = getKstBusinessDateParam(closingDateInput);
  } catch {
    return null;
  }

  return closingDate > today ? null : { storeId, closingDate };
}
