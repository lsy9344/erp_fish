export const DEFAULT_REPORT_MARGIN_GAP_THRESHOLD_BPS = 500;
const FLOATING_COMPARISON_SAFETY_FACTOR = 4;

export function getGrossMarginGap(
  actual: number | null,
  expected: number | null,
) {
  return actual === null || expected === null ? null : actual - expected;
}

export function hasSignificantGrossMarginGap(
  actual: number | null,
  expected: number | null,
  thresholdBps = DEFAULT_REPORT_MARGIN_GAP_THRESHOLD_BPS,
) {
  if (actual === null || expected === null) return false;
  const gap = actual - expected;

  const threshold = thresholdBps / 10_000;

  const tolerance =
    Number.EPSILON *
    Math.max(1, Math.abs(actual), Math.abs(expected), Math.abs(threshold)) *
    FLOATING_COMPARISON_SAFETY_FACTOR;

  return Math.abs(gap) + tolerance >= threshold;
}
