import test from "node:test";
import assert from "node:assert/strict";
import { formatOperationResult, isOperationRunning, nextTheme, operationVisualState, resolveBooleanPreference, resolveTheme, shouldDisableActions } from "../src/popup/popup-state.js";

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

test("busy and partial result text preserves the detailed message", () => {
  assert.equal(formatOperationResult({ status: "busy", message: "Another tab operation is already running." }), "Another tab operation is already running.");
  assert.equal(formatOperationResult({ status: "partial", message: "Moved 50 tabs · Tabs moved 1 of 50 tabs." }), "Moved 50 tabs · Tabs moved 1 of 50 tabs.");
});

test("running status disables actions while completed status releases them", () => {
  assert.equal(isOperationRunning({ status: "running" }), true);
  assert.equal(shouldDisableActions({ status: "running" }), true);
  assert.equal(shouldDisableActions({ status: "complete" }), false);
});

test("operation visual states keep busy neutral and failures in error styling", () => {
  assert.equal(operationVisualState({ status: "busy" }), "busy");
  assert.equal(operationVisualState({ status: "running" }), "busy");
  assert.equal(operationVisualState({ status: "interrupted" }), "error");
  assert.equal(operationVisualState({ status: "failed" }), "error");
  assert.equal(operationVisualState({ status: "partial" }), "error");
  assert.equal(operationVisualState({ status: "complete" }), "success");
});

test("boolean preference resolves stored value or falls back to the default", () => {
  assert.equal(resolveBooleanPreference(true, true), true);
  assert.equal(resolveBooleanPreference(false, true), false);
  assert.equal(resolveBooleanPreference(undefined, true), true);
  assert.equal(resolveBooleanPreference("not-a-boolean", true), true);
});

test("result text reports unpinned tabs", () => {
  assert.equal(formatOperationResult({ moved: 0, removed: 0, ungrouped: 0, unpinned: 3, skippedSplit: 0, changed: 0, retained: 0, failed: 0, sortingSkipped: false }), "Unpinned 3 tabs");
});
