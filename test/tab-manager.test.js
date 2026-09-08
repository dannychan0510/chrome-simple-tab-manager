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

test("a changed tab is counted once across repeated phase reads", async () => {
  const api = createFakeBrowser([{ id: 1, type: "normal", tabs: [{ id: 1, url: "https://a.test/", active: true }] }], { closedIds: new Set([1]) });
  const result = await createTabManager(api).run("organize", 1);
  assert.equal(result.changed, 1);
});

test("regular and private operations keep separate leases while running together", async () => {
  const api = createFakeBrowser([
    { id: 1, type: "normal", incognito: false, tabs: [{ id: 1, url: "https://regular.test/", active: true }] },
    { id: 2, type: "normal", incognito: true, tabs: [{ id: 2, url: "https://private.test/", active: true }] },
  ]);
  const manager = createTabManager(api);
  const [regular, privateResult] = await Promise.all([manager.run("sort", 1), manager.run("sort", 2)]);
  assert.equal(regular.status, "complete");
  assert.equal(privateResult.status, "complete");
  const writes = api.calls.filter(({ name }) => name === "storage.session.set").map(({ values }) => Object.keys(values)[0]);
  assert.ok(writes.includes("operation_regular"));
  assert.equal(writes.includes("operation_private"), false);
  assert.equal((await manager.getStatus(2)).status, "complete");
});

test("a private operation never writes its lease to browser storage", async () => {
  const api = createFakeBrowser([{ id: 1, type: "normal", incognito: true, tabs: [{ id: 1, url: "https://private.example/", active: true }] }]);
  const result = await createTabManager(api).run("sort", 1);
  assert.equal(result.status, "complete");
  assert.equal(api.calls.some(({ name }) => name === "storage.session.set"), false);
});

test("pinned consolidation preserves captured order across batches", async () => {
  const sourceTabs = Array.from({ length: 101 }, (_, index) => ({ id: index + 2, url: `https://pinned-${index}.test/`, pinned: true }));
  const api = createFakeBrowser([
    { id: 1, type: "normal", tabs: [{ id: 1, url: "https://target.test/", active: true }] },
    { id: 2, type: "normal", tabs: sourceTabs },
  ]);
  await createTabManager(api).run("consolidate", 1);
  assert.deepEqual(api.snapshotWindow(1).tabs.slice(0, 101).map(({ id }) => id), sourceTabs.map(({ id }) => id));
});

test("sort leaves unrelated and split-view groups untouched", async () => {
  const api = createFakeBrowser([
    { id: 1, type: "normal", tabs: [{ id: 1, url: "https://z.test/", active: true }, { id: 2, url: "https://a.test/", groupId: 5 }] },
    { id: 2, type: "normal", tabs: [{ id: 3, url: "https://other.test/", groupId: 8 }, { id: 4, url: "https://split.test/", groupId: 9, splitViewId: 3 }] },
  ]);
  const result = await createTabManager(api).run("sort", 1, { keepGroups: false });
  assert.equal(result.ungrouped, 1);
  assert.equal(api.snapshotWindow(2).tabs.find(({ id }) => id === 3).groupId, 8);
  assert.equal(api.snapshotWindow(2).tabs.find(({ id }) => id === 4).groupId, 9);
});

test("consolidate leaves source split-view groups untouched", async () => {
  const api = createFakeBrowser([
    { id: 1, type: "normal", tabs: [{ id: 1, url: "https://target.test/", active: true }] },
    { id: 2, type: "normal", tabs: [{ id: 3, url: "https://split.test/", groupId: 7, splitViewId: 4 }, { id: 4, url: "https://move.test/", groupId: 8 }] },
  ]);
  await createTabManager(api).run("consolidate", 1, { keepGroups: false });
  assert.equal(api.snapshotWindow(2).tabs.find(({ id }) => id === 3).groupId, 7);
  assert.equal(api.snapshotWindow(1).tabs.find(({ id }) => id === 4).groupId, -1);
});

test("a target closure after the last phase returns a partial failure", async () => {
  const api = createFakeBrowser([{ id: 1, type: "normal", tabs: [{ id: 1, url: "https://a.test/", active: true }] }]);
  const originalGet = api.windows.get;
  let checks = 0;
  api.windows.get = async (...args) => { checks += 1; if (checks >= 3) throw new Error("No window with id: 1"); return originalGet(...args); };
  const result = await createTabManager(api).run("sort", 1);
  assert.notEqual(result.status, "complete");
  assert.match(result.message, /target window/i);
});

test("a normal organize operation does not count intentional removals as changed", async () => {
  const api = createFakeBrowser([
    { id: 1, type: "normal", tabs: [{ id: 1, url: "https://x.test/", active: true }] },
    { id: 2, type: "normal", tabs: [{ id: 2, url: "https://x.test/", pinned: true }] },
  ]);
  const result = await createTabManager(api).run("organize", 1);
  assert.equal(result.removed, 1);
  assert.equal(result.changed, 0);
});

test("deduplication reports split-view skips once", async () => {
  const api = createFakeBrowser([{ id: 1, type: "normal", tabs: [
    { id: 1, url: "https://split.test/", splitViewId: 1, active: true },
    { id: 2, url: "https://split.test/", splitViewId: 1 },
  ] }]);
  const result = await createTabManager(api).run("deduplicate", 1);
  assert.equal(result.skippedSplit, 2);
});

test("deduplication revalidates each batch after a URL and container change", async () => {
  const sourceTabs = Array.from({ length: 101 }, (_, index) => ({ id: index + 2, url: "https://same.test/", cookieStoreId: "default" }));
  const api = createFakeBrowser([{ id: 1, type: "normal", tabs: [{ id: 1, url: "https://same.test/", active: true }, ...sourceTabs] }]);
  const originalRemove = api.tabs.remove;
  const originalGet = api.tabs.get;
  let changed = false;
  api.tabs.remove = async (ids) => { const result = await originalRemove(ids); changed = true; return result; };
  api.tabs.get = async (id) => {
    const tab = await originalGet(id);
    if (changed && id === 52) return { ...tab, url: "https://changed.test/", cookieStoreId: "firefox-container-2" };
    return tab;
  };
  const result = await createTabManager(api).run("deduplicate", 1);
  assert.equal(result.removed, 100);
  assert.ok(api.snapshotWindow(1).tabs.some(({ id }) => id === 52));
});

test("deduplication keeps a formerly duplicate tab when its survivor navigates", async () => {
  const sourceTabs = Array.from({ length: 101 }, (_, index) => ({ id: index + 2, url: "https://same.test/", cookieStoreId: "default" }));
  const api = createFakeBrowser([{ id: 1, type: "normal", tabs: [{ id: 1, url: "https://same.test/", active: true }, ...sourceTabs] }]);
  const originalRemove = api.tabs.remove;
  const originalGet = api.tabs.get;
  let changed = false;
  api.tabs.remove = async (ids) => { const result = await originalRemove(ids); changed = true; return result; };
  api.tabs.get = async (id) => {
    const tab = await originalGet(id);
    return changed && id === 1 ? { ...tab, url: "https://navigated.test/" } : tab;
  };
  const result = await createTabManager(api).run("deduplicate", 1);
  assert.equal(result.removed, 100);
  assert.ok(api.snapshotWindow(1).tabs.some(({ id }) => id === 1));
  assert.ok(api.snapshotWindow(1).tabs.some(({ id }) => id === 52));
});

test("a later partial move preserves confirmed moved count", async () => {
  const sourceTabs = Array.from({ length: 60 }, (_, index) => ({ id: index + 2, url: `https://source-${index}.test/` }));
  const api = createFakeBrowser([
    { id: 1, type: "normal", tabs: [{ id: 1, url: "https://target.test/", active: true }] },
    { id: 2, type: "normal", tabs: sourceTabs },
  ]);
  const originalMove = api.tabs.move;
  let calls = 0;
  api.tabs.move = async (ids, properties) => {
    calls += 1;
    const moved = await originalMove(ids, properties);
    return calls === 2 ? moved.slice(0, 1) : moved;
  };
  const result = await createTabManager(api).run("consolidate", 1);
  assert.equal(result.status, "partial");
  assert.equal(result.moved, 51);
  assert.match(result.message, /Tabs moved 1 of 10 tabs/);
});

test("completed operation messages persist in the session lease", async () => {
  const api = createFakeBrowser([{ id: 1, type: "normal", tabs: [{ id: 1, url: "https://a.test/", active: true }] }]);
  const manager = createTabManager(api);
  const result = await manager.run("sort", 1);
  const state = await manager.getStatus(1);
  assert.equal(state.status, result.status);
  assert.equal(state.message, result.message);
});

test("getStatus does not populate the target window", async () => {
  const api = createFakeBrowser([{ id: 1, type: "normal", tabs: [{ id: 1, url: "https://private.example/", active: true }] }]);
  await createTabManager(api).getStatus(1);
  const getCall = api.calls.find(({ name }) => name === "windows.get");
  assert.equal(getCall.options.populate, false);
  assert.equal(api.calls.some(({ name }) => name === "tabs.get" || name === "windows.getAll"), false);
});

test("getStatus interrupts a stale running lease after a background restart", async () => {
  let now = 1_000_000;
  const api = createFakeBrowser([{ id: 1, type: "normal", tabs: [{ id: 1, url: "https://a.test/", active: true }] }]);
  const manager = createTabManager(api, { now: () => now });
  await manager.run("sort", 1);
  await api.storage.session.set({ operation_regular: { status: "running", action: "sort", targetWindowId: 1, startedAt: 0, lastUpdatedAt: 0 } });
  const state = await manager.getStatus(1);
  assert.equal(state.status, "interrupted");
  assert.match(state.message, /interrupted/i);
});

test("sort fails with a direct no-progress error when a move does not change order", async () => {
  const api = createFakeBrowser([{ id: 1, type: "normal", tabs: [
    { id: 1, url: "https://z.test/", active: true },
    { id: 2, url: "https://a.test/" },
  ] }]);
  api.tabs.move = async (ids) => ids.map((id) => ({ id }));
  const result = await createTabManager(api).run("sort", 1);
  assert.notEqual(result.status, "complete");
  assert.match(result.message, /no progress/i);
});

test("deduplication stops after the target closes between removal batches", async () => {
  const sourceTabs = Array.from({ length: 101 }, (_, index) => ({ id: index + 2, url: "https://same.test/" }));
  const api = createFakeBrowser([{ id: 1, type: "normal", tabs: [{ id: 1, url: "https://same.test/", active: true }, ...sourceTabs] }]);
  const originalGet = api.windows.get;
  const originalRemove = api.tabs.remove;
  let closed = false;
  let removeCalls = 0;
  api.windows.get = async (...args) => { if (closed) throw new Error("No window with id: 1"); return originalGet(...args); };
  api.tabs.remove = async (ids) => { removeCalls += 1; const result = await originalRemove(ids); closed = true; return result; };
  const result = await createTabManager(api).run("deduplicate", 1);
  assert.notEqual(result.status, "complete");
  assert.equal(removeCalls, 1);
});

test("consolidate rejects a cross-window no-op move before counting it", async () => {
  const api = createFakeBrowser([
    { id: 1, type: "normal", tabs: [{ id: 1, url: "https://target.test/", active: true }] },
    { id: 2, type: "normal", tabs: [{ id: 2, url: "https://source.test/" }] },
  ]);
  api.tabs.move = async (ids) => ids.map((id) => ({ id }));
  const result = await createTabManager(api).run("consolidate", 1);
  assert.notEqual(result.status, "complete");
  assert.equal(result.moved, 0);
  assert.match(result.message, /placement confirmed 0/i);
});

test("deduplicate stops after a no-op target protection move", async () => {
  const api = createFakeBrowser([
    { id: 1, type: "normal", tabs: [{ id: 1, url: "https://same.test/", active: true }] },
    { id: 2, type: "normal", tabs: [{ id: 2, url: "https://same.test/", pinned: true }] },
  ]);
  api.tabs.move = async (ids) => ids.map((id) => ({ id }));
  const result = await createTabManager(api).run("deduplicate", 1);
  assert.notEqual(result.status, "complete");
  assert.equal(result.removed, 0);
  assert.equal(api.calls.some(({ name }) => name === "tabs.remove"), false);
});

test("consolidation re-ungroups a tab that becomes grouped after its first ungroup phase", async () => {
  const api = createFakeBrowser([
    { id: 1, type: "normal", tabs: [{ id: 1, url: "https://target.test/", active: true }] },
    { id: 2, type: "normal", tabs: [{ id: 2, url: "https://source.test/", groupId: 5 }] },
  ]);
  const originalGet = api.tabs.get;
  const originalUngroup = api.tabs.ungroup;
  let ungroupCalls = 0;
  let readsAfterFirstUngroup = 0;
  api.tabs.ungroup = async (ids) => { ungroupCalls += 1; return originalUngroup(ids); };
  api.tabs.get = async (id) => {
    const tab = await originalGet(id);
    if (ungroupCalls === 1 && id === 2 && ++readsAfterFirstUngroup > 1) return { ...tab, groupId: 7 };
    return tab;
  };
  const result = await createTabManager(api).run("consolidate", 1, { keepGroups: false });
  assert.equal(result.status, "complete");
  assert.ok(ungroupCalls >= 2);
});

test("sort re-ungroups a tab that becomes grouped after its first ungroup phase", async () => {
  const api = createFakeBrowser([{ id: 1, type: "normal", tabs: [
    { id: 1, url: "https://z.test/", active: true },
    { id: 2, url: "https://a.test/", groupId: 5 },
  ] }]);
  const originalGet = api.tabs.get;
  const originalUngroup = api.tabs.ungroup;
  let ungroupCalls = 0;
  let readsAfterFirstUngroup = 0;
  api.tabs.ungroup = async (ids) => { ungroupCalls += 1; return originalUngroup(ids); };
  api.tabs.get = async (id) => {
    const tab = await originalGet(id);
    if (ungroupCalls === 1 && id === 2 && ++readsAfterFirstUngroup > 1) return { ...tab, groupId: 7 };
    return tab;
  };
  const result = await createTabManager(api).run("sort", 1, { keepGroups: false });
  assert.equal(result.status, "complete");
  assert.ok(ungroupCalls >= 2);
});

test("consolidate terminates when ungroup makes no progress", async () => {
  const api = createFakeBrowser([
    { id: 1, type: "normal", tabs: [{ id: 1, url: "https://target.test/", active: true }] },
    { id: 2, type: "normal", tabs: [{ id: 2, url: "https://source.test/", groupId: 5 }] },
  ]);
  api.tabs.ungroup = async () => {};
  const result = await createTabManager(api).run("consolidate", 1, { keepGroups: false });
  assert.notEqual(result.status, "complete");
  assert.equal(api.calls.some(({ name }) => name === "tabs.move"), false);
  assert.match(result.message, /ungroup.*progress/i);
});

test("sort terminates when ungroup makes no progress", async () => {
  const api = createFakeBrowser([{ id: 1, type: "normal", tabs: [
    { id: 1, url: "https://z.test/", active: true },
    { id: 2, url: "https://a.test/", groupId: 5 },
  ] }]);
  api.tabs.ungroup = async () => {};
  const result = await createTabManager(api).run("sort", 1, { keepGroups: false });
  assert.notEqual(result.status, "complete");
  assert.equal(api.calls.some(({ name }) => name === "tabs.move"), false);
  assert.match(result.message, /ungroup.*progress/i);
});

test("consolidate rejects a move placed after the existing pinned boundary", async () => {
  const api = createFakeBrowser([
    { id: 1, type: "normal", tabs: [{ id: 1, url: "https://target-pinned.test/", pinned: true, active: true }] },
    { id: 2, type: "normal", tabs: [{ id: 2, url: "https://source-pinned.test/", pinned: true }] },
  ]);
  const originalMove = api.tabs.move;
  api.tabs.move = (ids, properties) => originalMove(ids, { ...properties, index: -1 });
  const result = await createTabManager(api).run("consolidate", 1);
  assert.notEqual(result.status, "complete");
  assert.equal(result.moved, 1);
  assert.match(result.message, /Tabs moved 1 of 1 tabs/i);
});

test("deduplicate preserves the target when a pinned survivor loses its pinned state", async () => {
  const api = createFakeBrowser([
    { id: 1, type: "normal", tabs: [{ id: 1, url: "https://same.test/", active: true }] },
    { id: 2, type: "normal", tabs: [{ id: 2, url: "https://same.test/", pinned: true }] },
  ]);
  const originalMove = api.tabs.move;
  const originalWindowGet = api.windows.get;
  let moved = false;
  api.tabs.move = async (ids, properties) => { const result = await originalMove(ids, properties); moved = true; return result; };
  api.windows.get = async (...args) => {
    const window = await originalWindowGet(...args);
    if (moved && window.tabs) window.tabs = window.tabs.map((tab) => tab.id === 2 ? { ...tab, pinned: false } : tab);
    return window;
  };
  const result = await createTabManager(api).run("deduplicate", 1);
  assert.notEqual(result.status, "complete");
  assert.equal(result.removed, 0);
  assert.equal(api.calls.some(({ name }) => name === "tabs.remove"), false);
});

test("unpinned consolidation rejects placement before the pinned boundary without anchors", async () => {
  const api = createFakeBrowser([
    { id: 1, type: "normal", tabs: [{ id: 1, url: "https://target-pinned.test/", pinned: true, active: true }] },
    { id: 2, type: "normal", tabs: [{ id: 2, url: "https://source-unpinned.test/" }] },
  ]);
  const originalMove = api.tabs.move;
  const originalWindowGet = api.windows.get;
  let moved = false;
  api.tabs.move = async (ids, properties) => { const result = await originalMove(ids, properties); moved = true; return result; };
  api.windows.get = async (...args) => {
    const window = await originalWindowGet(...args);
    if (moved && window.id === 1 && window.tabs) window.tabs = window.tabs.sort((a, b) => (a.id === 2 ? -1 : b.id === 2 ? 1 : a.index - b.index)).map((tab, index) => ({ ...tab, index }));
    return window;
  };
  const result = await createTabManager(api).run("consolidate", 1);
  assert.notEqual(result.status, "complete");
  assert.equal(result.moved, 0);
  assert.match(result.message, /placement confirmed 0/i);
});

test("mixed placement failure reports individually confirmed IDs", async () => {
  const api = createFakeBrowser([
    { id: 1, type: "normal", tabs: [{ id: 1, url: "https://target-pinned.test/", pinned: true, active: true }] },
    { id: 2, type: "normal", tabs: [{ id: 2, url: "https://source-a.test/" }, { id: 3, url: "https://source-b.test/" }] },
  ]);
  const originalMove = api.tabs.move;
  const originalWindowGet = api.windows.get;
  let moved = false;
  api.tabs.move = async (ids, properties) => { const result = await originalMove(ids, properties); moved = true; return result; };
  api.windows.get = async (...args) => {
    const window = await originalWindowGet(...args);
    if (moved && window.id === 1 && window.tabs) window.tabs = window.tabs.sort((a, b) => (a.id === 2 ? -1 : b.id === 2 ? 1 : a.index - b.index)).map((tab, index) => ({ ...tab, index }));
    return window;
  };
  const result = await createTabManager(api).run("consolidate", 1);
  assert.equal(result.status, "partial");
  assert.equal(result.moved, 1);
  assert.match(result.message, /Tabs moved 1 of 2 tabs/);
});

test("unpinned placement verification covers batches larger than fifty", async () => {
  const sourceTabs = Array.from({ length: 101 }, (_, index) => ({ id: index + 2, url: `https://source-${index}.test/` }));
  const api = createFakeBrowser([
    { id: 1, type: "normal", tabs: [{ id: 1, url: "https://target-pinned.test/", pinned: true, active: true }] },
    { id: 2, type: "normal", tabs: sourceTabs },
  ]);
  const result = await createTabManager(api).run("consolidate", 1);
  assert.equal(result.status, "complete");
  assert.equal(result.moved, 101);
  assert.deepEqual(api.snapshotWindow(1).tabs.slice(1).map(({ id }) => id), sourceTabs.map(({ id }) => id));
});

test("sort keeps grouped tabs grouped by default (keepGroups defaults to true)", async () => {
  const api = createFakeBrowser([{ id: 1, type: "normal", tabs: [
    { id: 1, url: "https://z.test/", active: true, groupId: -1 },
    { id: 2, url: "https://a.test/", groupId: 5 },
  ] }]);
  const result = await createTabManager(api).run("sort", 1);
  assert.equal(result.status, "complete");
  assert.equal(result.ungrouped, 0);
  assert.equal(api.snapshotWindow(1).tabs.find(({ id }) => id === 2).groupId, 5);
});

test("sort keeps a tab group's members together and ordered by group title when keepGroups is on", async () => {
  const api = createFakeBrowser(
    [{ id: 1, type: "normal", tabs: [
      { id: 1, url: "https://zzz.test/", active: true, groupId: -1 },
      { id: 2, url: "https://a.test/", groupId: 10 },
      { id: 3, url: "https://aaa.test/", groupId: -1 },
      { id: 4, url: "https://b.test/", groupId: 10 },
    ] }],
    { groups: [{ id: 10, title: "Research", color: "blue", windowId: 1 }] },
  );
  const result = await createTabManager(api).run("sort", 1, { keepGroups: true });
  assert.equal(result.status, "complete");
  assert.deepEqual(api.snapshotWindow(1).tabs.map(({ id }) => id), [2, 4, 3, 1]);
  assert.equal(api.snapshotWindow(1).tabs.find(({ id }) => id === 2).groupId, 10);
  assert.equal(api.snapshotWindow(1).tabs.find(({ id }) => id === 4).groupId, 10);
});

test("consolidate unpins a tab first when keepPins is false", async () => {
  const api = createFakeBrowser([
    { id: 1, type: "normal", tabs: [{ id: 1, url: "https://target.test/", active: true }] },
    { id: 2, type: "normal", tabs: [{ id: 2, url: "https://source.test/", pinned: true }] },
  ]);
  const result = await createTabManager(api).run("consolidate", 1, { keepPins: false });
  assert.equal(result.status, "complete");
  assert.equal(result.unpinned, 1);
  assert.equal(api.snapshotWindow(1).tabs.find(({ id }) => id === 2).pinned, false);
});

test("consolidate moves a tab group as a unit and re-creates it in the target window", async () => {
  const api = createFakeBrowser(
    [
      { id: 1, type: "normal", tabs: [{ id: 1, url: "https://target.test/", active: true }] },
      { id: 2, type: "normal", tabs: [
        { id: 2, url: "https://a.test/", groupId: 10 },
        { id: 3, url: "https://b.test/", groupId: 10 },
      ] },
    ],
    { groups: [{ id: 10, title: "Research", color: "blue", windowId: 2 }] },
  );
  const result = await createTabManager(api).run("consolidate", 1, { keepGroups: true });
  assert.equal(result.status, "complete");
  const targetTabs = api.snapshotWindow(1).tabs;
  assert.deepEqual(targetTabs.filter((tab) => tab.id !== 1).map(({ id }) => id), [2, 3]);
  const newGroupId = targetTabs.find(({ id }) => id === 2).groupId;
  assert.notEqual(newGroupId, -1);
  assert.equal(targetTabs.find(({ id }) => id === 3).groupId, newGroupId);
  assert.equal((await api.tabGroups.get(newGroupId)).title, "Research");
});

test("consolidate adds a moved group to an existing same-titled group in the target window", async () => {
  const api = createFakeBrowser(
    [
      { id: 1, type: "normal", tabs: [{ id: 1, url: "https://target.test/", active: true, groupId: 20 }] },
      { id: 2, type: "normal", tabs: [{ id: 2, url: "https://a.test/", groupId: 10 }] },
    ],
    { groups: [{ id: 20, title: "Research", color: "red", windowId: 1 }, { id: 10, title: "research", color: "blue", windowId: 2 }] },
  );
  const result = await createTabManager(api).run("consolidate", 1, { keepGroups: true });
  assert.equal(result.status, "complete");
  const targetTabs = api.snapshotWindow(1).tabs;
  assert.equal(targetTabs.find(({ id }) => id === 2).groupId, 20);
  assert.equal((await api.tabGroups.get(20)).color, "red");
});

test("organize keeps pinned tabs pinned and groups intact by default", async () => {
  const api = createFakeBrowser(
    [
      { id: 1, type: "normal", tabs: [{ id: 1, url: "https://target.test/", active: true }] },
      { id: 2, type: "normal", tabs: [
        { id: 2, url: "https://pinned.test/", pinned: true },
        { id: 3, url: "https://a.test/", groupId: 10 },
        { id: 4, url: "https://b.test/", groupId: 10 },
      ] },
    ],
    { groups: [{ id: 10, title: "Research", color: "blue", windowId: 2 }] },
  );
  const result = await createTabManager(api).run("organize", 1);
  assert.equal(result.status, "complete");
  const targetTabs = api.snapshotWindow(1).tabs;
  assert.equal(targetTabs.find(({ id }) => id === 2).pinned, true);
  const groupId = targetTabs.find(({ id }) => id === 3).groupId;
  assert.notEqual(groupId, -1);
  assert.equal(targetTabs.find(({ id }) => id === 4).groupId, groupId);
});
