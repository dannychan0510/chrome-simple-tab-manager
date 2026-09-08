import test from "node:test";
import assert from "node:assert/strict";
import { captureScope, planConsolidation, planDuplicateRemoval, planSort } from "../src/core/tab-planner.js";

test("captureScope includes only normal windows with the target private state", () => {
  const windows = [
    { id: 1, type: "normal", incognito: false, tabs: [{ id: 11, active: true }] },
    { id: 2, type: "normal", incognito: false, tabs: [{ id: 21 }] },
    { id: 3, type: "normal", incognito: true, tabs: [{ id: 31 }] },
    { id: 4, type: "popup", incognito: false, tabs: [{ id: 41 }] },
  ];
  const scope = captureScope(windows, 1);
  assert.deepEqual(scope.windowIds, [1, 2]);
  assert.deepEqual(scope.tabIds, [11, 21]);
  assert.equal(scope.activeTabId, 11);
});

test("consolidation separates pinned, unpinned, grouped, and split tabs", () => {
  const plan = planConsolidation([
    { id: 1, windowId: 2, pinned: true, groupId: 8 },
    { id: 2, windowId: 2, pinned: false, groupId: -1 },
    { id: 3, windowId: 2, pinned: false, splitViewId: 5 },
  ], 1);
  assert.deepEqual(plan.groupedIds, [1]);
  assert.deepEqual(plan.pinnedIds, [1]);
  assert.deepEqual(plan.unpinnedIds, [2]);
  assert.deepEqual(plan.skippedSplitIds, [3]);
});

test("sorting is skipped when the target contains a split view", () => {
  const plan = planSort([{ id: 1, splitViewId: 4, pinned: false }]);
  assert.equal(plan.skippedForSplitView, true);
  assert.deepEqual(plan.orderedIds, []);
});

test("duplicate plan moves a survivor before removing every target tab", () => {
  const scope = { targetWindowId: 1, windowOrder: new Map([[1, 0], [2, 1]]) };
  const plan = planDuplicateRemoval([
    { id: 1, windowId: 1, index: 0, url: "https://x.test/", status: "complete", pinned: false },
    { id: 2, windowId: 2, index: 0, url: "https://x.test/", status: "complete", pinned: true },
  ], scope);
  assert.equal(plan.protectTargetWithTabId, 2);
  assert.deepEqual(plan.removeIds, [1]);
});

test("target protection selects the mapped survivor for a losing target duplicate", () => {
  const scope = { targetWindowId: 1, windowOrder: new Map([[1, 0], [2, 1]]) };
  const plan = planDuplicateRemoval([
    { id: 1, windowId: 1, index: 0, url: "https://same.test/", status: "complete", pinned: false },
    { id: 2, windowId: 2, index: 0, url: "https://same.test/", status: "complete", pinned: true },
    { id: 3, windowId: 2, index: 1, url: "https://unique.test/", status: "loading", pinned: false },
  ], scope);
  assert.equal(plan.protectTargetWithTabId, 2);
});

test("target protection ignores unrelated, loading, and split-view survivors", () => {
  const scope = { targetWindowId: 1, windowOrder: new Map([[1, 0], [2, 1]]) };
  const plan = planDuplicateRemoval([
    { id: 1, windowId: 1, index: 0, url: "https://same.test/", status: "complete", pinned: false },
    { id: 2, windowId: 2, index: 0, url: "https://other.test/", status: "complete", pinned: true },
    { id: 3, windowId: 2, index: 1, url: "https://loading.test/", status: "loading", pinned: true },
    { id: 4, windowId: 2, index: 2, url: "https://split.test/", status: "complete", splitViewId: 8, pinned: true },
  ], scope);
  assert.equal(plan.protectTargetWithTabId, null);
});

test("planSort keeps a tab group's members contiguous and orders blocks by title", () => {
  const tabs = [
    { id: 1, index: 0, pinned: false, groupId: -1, url: "https://zzz.example/", title: "" },
    { id: 2, index: 1, pinned: false, groupId: 10, url: "https://a.example/", title: "" },
    { id: 3, index: 2, pinned: false, groupId: -1, url: "https://aaa.example/", title: "" },
    { id: 4, index: 3, pinned: false, groupId: 10, url: "https://b.example/", title: "" },
  ];
  const plan = planSort(tabs, { keepGroups: true, groupTitleById: new Map([[10, "Research"]]) });
  assert.deepEqual(plan.orderedIds, [2, 4, 3, 1]);
});

test("planSort with two same-titled groups ties by leftmost tab index", () => {
  const tabs = [
    { id: 1, index: 0, pinned: false, groupId: 20, url: "https://a.example/" },
    { id: 2, index: 1, pinned: false, groupId: 21, url: "https://b.example/" },
  ];
  const plan = planSort(tabs, { keepGroups: true, groupTitleById: new Map([[20, "Work"], [21, "Work"]]) });
  assert.deepEqual(plan.orderedIds, [1, 2]);
});

test("planSort falls back to today's flattened sort when keepGroups is omitted", () => {
  const tabs = [
    { id: 1, index: 0, pinned: false, groupId: 30, url: "https://zzz.example/" },
    { id: 2, index: 1, pinned: false, groupId: -1, url: "https://aaa.example/" },
  ];
  const plan = planSort(tabs);
  assert.deepEqual(plan.orderedIds, [2, 1]);
  assert.deepEqual(plan.groupedIds, [1]);
});
