"use client";

import {
  InputCodeAliasEditor,
  type InputCodeAliasOption,
} from "~/features/master-data/components/input-code-alias-editor";

export type LossTypeAliasOption = InputCodeAliasOption;

type LossTypeAliasEditorProps = {
  storeId: string;
  options: LossTypeAliasOption[];
};

// WO-09: 손실 유형 표시명 편집기는 일반화된 InputCodeAliasEditor의 얇은 래퍼다.
// 기존 호출부(손실 입력 페이지)를 깨지 않으려고 같은 이름을 유지한다.
export function LossTypeAliasEditor({
  storeId,
  options,
}: LossTypeAliasEditorProps) {
  return (
    <InputCodeAliasEditor
      storeId={storeId}
      options={options}
      groupKey="lossType"
    />
  );
}
