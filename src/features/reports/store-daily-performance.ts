const SIGNIFICANT_GROSS_MARGIN_GAP = 0.015;
const FLOATING_COMPARISON_SAFETY_FACTOR = 4;

export function hasSignificantGrossMarginGap(
  actual: number | null,
  expected: number | null,
) {
  if (actual === null || expected === null) return false;

  const tolerance =
    Number.EPSILON *
    Math.max(1, Math.abs(actual), Math.abs(expected)) *
    FLOATING_COMPARISON_SAFETY_FACTOR;

  return (
    Math.abs(actual - expected) + tolerance >= SIGNIFICANT_GROSS_MARGIN_GAP
  );
}
