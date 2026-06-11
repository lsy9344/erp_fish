"use client";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

type UnsavedChangeDialogProps = {
  open: boolean;
  isSaving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  onDiscard: () => void;
  onKeepEditing: () => void;
};

export function UnsavedChangeDialog({
  open,
  isSaving = false,
  onOpenChange,
  onSave,
  onDiscard,
  onKeepEditing,
}: UnsavedChangeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-labelledby="unsaved-change-dialog-title">
        <DialogHeader>
          <DialogTitle id="unsaved-change-dialog-title">
            저장하지 않은 변경이 있습니다
          </DialogTitle>
          <DialogDescription>
            이동하기 전에 현재 단계의 입력값을 어떻게 처리할지 선택해 주세요.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onKeepEditing}
            disabled={isSaving}
            className="min-h-11"
          >
            계속 편집
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onDiscard}
            disabled={isSaving}
            className="min-h-11"
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="min-h-11"
          >
            {isSaving ? "저장 중..." : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
