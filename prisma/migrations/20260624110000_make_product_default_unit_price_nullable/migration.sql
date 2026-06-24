-- 정책 전환(2026-06-24): 품목 마스터 단가는 본사 매입가/기준 매입가가 아니다.
-- 선택적 "참고 단가"로만 남기고, 신규 품목은 단가 없이 생성 가능해야 한다.
-- 기존 데이터(이미 입력된 단가)는 그대로 보존한다.
ALTER TABLE "Product"
ALTER COLUMN "defaultUnitPrice" DROP NOT NULL;
