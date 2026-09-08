import test from "node:test";
import assert from "node:assert/strict";
import { formatOperationResult, nextTheme, resolveTheme } from "../src/popup/popup-state.js";

test("theme preference resolves and cycles", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(nextTheme("system"), "light");
  assert.equal(nextTheme("light"), "dark");
  assert.equal(nextTheme("dark"), "system");
});

test("result text reports every material count", () => {
  assert.equal(formatOperationResult({ moved: 12, removed: 4, ungrouped: 2, skippedSplit: 1, changed: 0, retained: 0, failed: 0, sortingSkipped: false }), "Moved 12 tabs · Removed 4 duplicates · Ungrouped 2 tabs · Skipped 1 split-view tab");
});

test("result text handles no-op and singular counts", () => {
  assert.equal(formatOperationResult({ moved: 0, removed: 0, ungrouped: 0, skippedSplit: 0, changed: 0, retained: 0, failed: 0, sortingSkipped: false }), "No tab changes were needed");
  assert.match(formatOperationResult({ moved: 1, removed: 1, ungrouped: 1, skippedSplit: 1, changed: 1, retained: 1, failed: 1, sortingSkipped: true }), /Moved 1 tab · Removed 1 duplicate · Ungrouped 1 tab · Skipped 1 split-view tab/);
});

