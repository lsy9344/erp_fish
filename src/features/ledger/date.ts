const LEGAL_SEOUL_TZ = "Asia/Seoul";

export function getKstBusinessDate(input: string | Date = new Date()) {
  if (typeof input === "string") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      throw new Error("Invalid business date.");
    }

    const [year, month, day] = input.split("-");
    const date = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0),
    );

    if (date.toISOString().slice(0, 10) !== input) {
      throw new Error("Invalid business date.");
    }

    return date;
  }

  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: LEGAL_SEOUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(input)
    .split("-");

  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0),
  );
}

export function getKstBusinessDateParam(input: string | Date = new Date()) {
  const date = getKstBusinessDate(input);

  return date.toISOString().slice(0, 10);
}

export function getKstLedgerDateParam(input: string | Date = new Date()) {
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return getKstBusinessDateParam(input);
  }

  const date = typeof input === "string" ? new Date(input) : input;

  return getKstBusinessDateParam(date);
}
