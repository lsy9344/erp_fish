export type FieldErrors = Record<string, string[]>;

export type ActionConflictValue = string | number | boolean | null;

export type LedgerConflictPayload = {
  ledgerId: string;
  section: string;
  clientToken: string | number;
  serverToken: string | number;
  clientValues: Record<string, ActionConflictValue>;
  serverValues: Record<string, ActionConflictValue>;
  lastModifiedBy: string | null;
  lastModifiedAt: string;
  reloadRequired: boolean;
  hqEditing?: boolean;
};

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fieldErrors?: FieldErrors;
        conflict?: LedgerConflictPayload;
      };
    };

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionError<T = never>(
  code: string,
  message: string,
  fieldErrors?: FieldErrors,
  conflict?: LedgerConflictPayload,
): ActionResult<T> {
  return {
    ok: false,
    error: {
      code,
      message,
      fieldErrors,
      conflict,
    },
  };
}

export function isLedgerConflictResult<T>(
  result: ActionResult<T>,
): result is Extract<ActionResult<T>, { ok: false }> & {
  error: { code: "LEDGER_CONFLICT"; conflict: LedgerConflictPayload };
} {
  return (
    !result.ok &&
    result.error.code === "LEDGER_CONFLICT" &&
    Boolean(result.error.conflict)
  );
}
