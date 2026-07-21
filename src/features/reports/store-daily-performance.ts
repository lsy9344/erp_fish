export const DEFAULT_REPORT_MARGIN_GAP_THRESHOLD_BPS = 150;
const FLOATING_COMPARISON_SAFETY_FACTOR = 4;

export function hasSignificantGrossMarginGap(
  actual: number | null,
  expected: number | null,
  thresholdBps = DEFAULT_REPORT_MARGIN_GAP_THRESHOLD_BPS,
) {
  if (actual === null || expected === null) return false;

  const threshold = thresholdBps / 10_000;

  const tolerance =
    Number.EPSILON *
    Math.max(1, Math.abs(actual), Math.abs(expected), Math.abs(threshold)) *
    FLOATING_COMPARISON_SAFETY_FACTOR;

  return Math.abs(actual - expected) + tolerance >= threshold;
}
