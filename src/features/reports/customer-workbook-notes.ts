const COMMENT_ELEMENT_PATTERN =
  /<(?:(?:[A-Za-z_][\w.-]*):)?comment\b[^>]*(?:\/>|>[\s\S]*?<\/(?:(?:[A-Za-z_][\w.-]*):)?comment\s*>)/g;
const COMMENT_REF_PATTERN = /\bref\s*=\s*(["'])([A-Z]+)(\d+)\1/i;
const SHAPE_ELEMENT_PATTERN =
  /<(?:(?:[A-Za-z_][\w.-]*):)?shape\b[^>]*>[\s\S]*?<\/(?:(?:[A-Za-z_][\w.-]*):)?shape\s*>/g;
const NOTE_CLIENT_DATA_PATTERN =
  /<(?:(?:[A-Za-z_][\w.-]*):)?ClientData\b[^>]*\bObjectType\s*=\s*(["'])Note\1[\s\S]*?<\/(?:(?:[A-Za-z_][\w.-]*):)?ClientData\s*>/i;
const VML_ROW_PATTERN =
  /(<(?:(?:[A-Za-z_][\w.-]*):)?Row\b[^>]*>)(\s*)-?\d+(\s*<\/(?:(?:[A-Za-z_][\w.-]*):)?Row\s*>)/i;
const VML_ANCHOR_PATTERN =
  /(<(?:(?:[A-Za-z_][\w.-]*):)?Anchor\b[^>]*>)([\s\S]*?)(<\/(?:(?:[A-Za-z_][\w.-]*):)?Anchor\s*>)/i;

function mappedRow(
  originalRow: number,
  rowMap: ReadonlyMap<number, number>,
): number | null {
  const nextRow = rowMap.get(originalRow);
  if (!Number.isInteger(nextRow) || nextRow === undefined || nextRow < 1)
    return null;
  return nextRow;
}

function updateCommentElement(
  commentXml: string,
  rowMap: ReadonlyMap<number, number>,
): string {
  const refMatch = COMMENT_REF_PATTERN.exec(commentXml);
  if (!refMatch) return commentXml;

  const columnText = refMatch[2]!;
  const rowText = refMatch[3]!;
  const originalRow = Number(rowText);
  const nextRow = mappedRow(originalRow, rowMap);
  if (nextRow === null) return "";

  const rowStart =
    refMatch.index + refMatch[0].length - columnText.length - rowText.length;
  return `${commentXml.slice(0, rowStart)}${nextRow}${commentXml.slice(
    rowStart + rowText.length,
  )}`;
}

/**
 * Move legacy comment cell references along with reordered source rows.
 *
 * Both arguments use one-based worksheet row numbers. Comments whose source
 * row was not exported are removed so Excel cannot attach them to another row.
 */
export function remapCustomerWorkbookNotes(
  commentsXml: string,
  rowMap: ReadonlyMap<number, number>,
): string {
  return commentsXml.replace(COMMENT_ELEMENT_PATTERN, (commentXml) =>
    updateCommentElement(commentXml, rowMap),
  );
}

function shiftAnchorRows(anchorBody: string, delta: number): string {
  const parts = anchorBody.split(",");
  if (parts.length < 8) return anchorBody;

  for (const index of [2, 6]) {
    const match = /^(\s*)(-?\d+)(\s*)$/.exec(parts[index]!);
    if (!match) return anchorBody;
    parts[index] = `${match[1]}${Number(match[2]) + delta}${match[3]}`;
  }

  return parts.join(",");
}

function updateNoteShape(
  shapeXml: string,
  rowMap: ReadonlyMap<number, number>,
): string {
  if (!NOTE_CLIENT_DATA_PATTERN.exec(shapeXml)) return shapeXml;

  const rowMatch = VML_ROW_PATTERN.exec(shapeXml);
  if (!rowMatch) return "";

  const rowNumberMatch = /-?\d+/.exec(rowMatch[0]);
  const originalZeroBasedRow = Number(rowNumberMatch?.[0]);
  if (!Number.isInteger(originalZeroBasedRow) || originalZeroBasedRow < 0)
    return "";

  const nextOneBasedRow = mappedRow(originalZeroBasedRow + 1, rowMap);
  if (nextOneBasedRow === null) return "";

  const nextZeroBasedRow = nextOneBasedRow - 1;
  const delta = nextZeroBasedRow - originalZeroBasedRow;
  let nextShape = shapeXml.replace(
    VML_ROW_PATTERN,
    `$1$2${nextZeroBasedRow}$3`,
  );

  nextShape = nextShape.replace(
    VML_ANCHOR_PATTERN,
    (_match, start: string, body: string, end: string) =>
      `${start}${shiftAnchorRows(body, delta)}${end}`,
  );
  return nextShape;
}

/**
 * Move legacy VML note shapes along with reordered source rows.
 *
 * `x:Row` and the two row positions in `x:Anchor` are zero-based. The map is
 * still one-based to match worksheet cell references and comment `ref` values.
 * Non-note VML shapes are returned byte-for-byte unchanged.
 */
export function remapCustomerWorkbookNoteShapes(
  vmlXml: string,
  rowMap: ReadonlyMap<number, number>,
): string {
  return vmlXml.replace(SHAPE_ELEMENT_PATTERN, (shapeXml) =>
    updateNoteShape(shapeXml, rowMap),
  );
}
