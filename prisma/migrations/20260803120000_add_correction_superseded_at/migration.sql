-- DESIGN.md D9: 정정 기록 supersede 시각 추가. 마스터가 직접 수정으로 덮어쓴
-- 정정은 이 값이 채워지고 읽기 시점 overlay에서만 제외된다. 기존 행은 전부
-- NULL로 남아 현행 동작(모든 정정 활성)을 그대로 유지한다.
ALTER TABLE "CorrectionRecord" ADD COLUMN "supersededAt" TIMESTAMP(3);
