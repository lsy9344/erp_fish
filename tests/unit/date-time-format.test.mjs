import assert from "node:assert/strict";
import test from "node:test";
import {
  formatKstDateTime,
  formatShortKstDateTime,
} from "../../src/lib/format.ts";

test("KST date-time formatting is deterministic across day periods", () => {
  assert.equal(
    formatKstDateTime("2026-07-12T15:05:00.000Z"),
    "2026. 7. 13. 오전 12:05",
  );
  assert.equal(
    formatKstDateTime("2026-07-13T00:07:00.000Z"),
    "2026. 7. 13. 오전 9:07",
  );
  assert.equal(
    formatKstDateTime("2026-07-13T03:35:00.000Z"),
    "2026. 7. 13. 오후 12:35",
  );
  assert.equal(
    formatShortKstDateTime("2026-07-13T03:35:00.000Z"),
    "26. 7. 13. 오후 12:35",
  );
});
