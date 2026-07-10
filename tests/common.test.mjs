import test from "node:test";
import assert from "node:assert/strict";

import {
  getTimestampMillis,
  isApplicationWindowOpen,
  normalizeDateTimeValue,
} from "../assets/js/shared/common.js";

test("normalizeDateTimeValue returns a valid Date for supported inputs", () => {
  const fromString = normalizeDateTimeValue("2026-07-10T12:00:00+09:00");
  const fromTimestamp = normalizeDateTimeValue({
    toDate: () => new Date("2026-07-10T03:00:00Z"),
  });

  assert.ok(fromString instanceof Date);
  assert.equal(fromString.toISOString(), "2026-07-10T03:00:00.000Z");
  assert.ok(fromTimestamp instanceof Date);
  assert.equal(normalizeDateTimeValue("not-a-date"), "");
});

test("getTimestampMillis handles Date, Firestore-like values, and epoch zero", () => {
  assert.equal(getTimestampMillis(new Date(1234)), 1234);
  assert.equal(getTimestampMillis({ seconds: 2 }), 2000);
  assert.equal(getTimestampMillis({ toMillis: () => 3456 }), 3456);
  assert.equal(getTimestampMillis(0, -1), 0);
  assert.equal(getTimestampMillis("invalid", -1), -1);
});

test("manual application state is used when no open time exists", () => {
  assert.equal(isApplicationWindowOpen({ isOpen: true }, 1000), true);
  assert.equal(isApplicationWindowOpen({ isOpen: false }, 1000), false);
});

test("scheduled open time takes precedence over the manual state", () => {
  const openAt = new Date(2000);

  assert.equal(isApplicationWindowOpen({ isOpen: true, openAt }, 1999), false);
  assert.equal(isApplicationWindowOpen({ isOpen: false, openAt }, 2000), true);
});

test("close time always closes the application window", () => {
  const closeAt = new Date(3000);

  assert.equal(isApplicationWindowOpen({ isOpen: true, closeAt }, 2999), true);
  assert.equal(isApplicationWindowOpen({ isOpen: true, closeAt }, 3000), false);
  assert.equal(isApplicationWindowOpen({ isOpen: true, closeAt }, 3001), false);
});
