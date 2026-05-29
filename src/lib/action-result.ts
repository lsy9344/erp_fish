export type FieldErrors = Record<string, string[]>;

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fieldErrors?: FieldErrors;
      };
    };

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionError<T = never>(
  code: string,
  message: string,
  fieldErrors?: FieldErrors,
): ActionResult<T> {
  return {
    ok: false,
    error: {
      code,
      message,
      fieldErrors,
    },
  };
}
