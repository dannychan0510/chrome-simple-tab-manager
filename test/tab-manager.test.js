import test from "node:test";
import assert from "node:assert/strict";
import { createTabManager } from "../src/tab-manager.js";
import { createFakeBrowser } from "./support/fake-browser.js";

test("organize consolidates before deleting the target window's only losing copy", async () => {
  const api = createFakeBrowser([
    { id: 1, type: "normal", incognito: false, tabs: [{ id: 1, url: "https://x.test/", pinned: false, active: true, status: "complete" }] },
    { id: 2, type: "normal", incognito: false, tabs: [{ id: 2, url: "https://x.test/", pinned: true, active: true, status: "complete" }] },
  ]);
  const result = await createTabManager(api).run("organize", 1);
  assert.equal(result.status, "complete");
  assert.equal(result.moved, 1);
  assert.equal(result.removed, 1);
  assert.ok(api.calls.findIndex(({ name }) => name === "tabs.move") < api.calls.findIndex(({ name }) => name === "tabs.remove"));
  assert.deepEqual(api.snapshotWindow(1).tabs.map(({ id }) => id), [2]);
});

test("standalone deduplicate protects a target that would become empty", async () => {
  const api = createFakeBrowser([
    { id: 1, type: "normal", incognito: false, tabs: [{ id: 1, url: "https://x.test/", pinned: false, active: true, status: "complete" }] },
    { id: 2, type: "normal", incognito: false, tabs: [{ id: 2, url: "https://x.test/", pinned: true, active: true, status: "complete" }] },
  ]);
  await createTabManager(api).run("deduplicate", 1);
  assert.deepEqual(api.snapshotWindow(1).tabs.map(({ id }) => id), [2]);
});

test("a split view skips sorting and remains untouched", async () => {
  const api = createFakeBrowser([{ id: 1, type: "normal", incognito: false, tabs: [
    { id: 1, url: "https://z.test/", splitViewId: 6, pinned: false, active: true, status: "complete" },
    { id: 2, url: "https://a.test/", splitViewId: 6, pinned: false, active: false, status: "complete" },
  ] }]);
  const result = await createTabManager(api).run("sort", 1);
  assert.equal(result.sortingSkipped, true);
  assert.equal(api.calls.some(({ name }) => name === "tabs.move"), false);
});

test("the target active tab is restored without focusing its window", async () => {
  const api = createFakeBrowser([{ id: 1, type: "normal", incognito: false, tabs: [
    { id: 1, url: "https://z.test/", pinned: false, active: true, status: "complete" },
    { id: 2, url: "https://a.test/", pinned: false, active: false, status: "complete" },
  ] }]);
  await createTabManager(api).run("sort", 1);
  assert.equal(api.snapshotWindow(1).tabs.find(({ id }) => id === 1).active, true);
  assert.equal(api.calls.some(({ name }) => name === "windows.update"), false);
});

test("a second request in the same privacy scope receives a busy result", async () => {
  const api = createFakeBrowser([{ id: 1, type: "normal", incognito: false, tabs: [{ id: 1, url: "https://a.test/", active: true }] }]);
  let release;
  let blocked = true;
  const manager = createTabManager(api, { beforePhase: () => blocked ? new Promise((resolve) => { release = () => { blocked = false; resolve(); }; }) : undefined });
  const first = manager.run("sort", 1);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = await manager.run("sort", 1);
  assert.equal(second.status, "busy");
  release?.();
  await first;
});

test("retained duplicate tabs are reported when a close prompt keeps them open", async () => {
  const api = createFakeBrowser([
    { id: 1, type: "normal", tabs: [{ id: 1, url: "https://a.test/", active: true }] },
    { id: 2, type: "normal", tabs: [{ id: 2, url: "https://a.test/", pinned: true }] },
  ], { retainedIds: new Set([1]) });
  const result = await createTabManager(api).run("deduplicate", 1);
  assert.equal(result.retained, 1);
  assert.equal(result.removed, 0);
});
