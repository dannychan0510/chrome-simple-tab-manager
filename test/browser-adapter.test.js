import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserAdapter } from "../src/browser-adapter.js";
import { createFakeBrowser } from "./support/fake-browser.js";

test("move retries a temporary drag failure and normalizes one returned tab", async () => {
  let attempts = 0;
  const api = {
    tabs: { move: async () => { attempts += 1; if (attempts < 3) throw new Error("Tabs cannot be edited right now (user may be dragging a tab)."); return { id: 7 }; } },
    storage: { session: { get: async () => ({}), set: async () => {} } },
  };
  const adapter = createBrowserAdapter(api, { delay: async () => {} });
  assert.deepEqual(await adapter.move([7], { windowId: 1, index: 0 }), [7]);
  assert.equal(attempts, 3);
});

test("move rejects a silent empty result", async () => {
  const api = { tabs: { move: async () => [] }, storage: { session: { get: async () => ({}), set: async () => {} } } };
  const adapter = createBrowserAdapter(api);
  await assert.rejects(adapter.move([7], { windowId: 1, index: 0 }), /moved 0 of 1 tabs/);
});

test("moves are split into batches of fifty", async () => {
  const calls = [];
  const api = { tabs: { move: async (ids) => { calls.push(ids); return ids.map((id) => ({ id })); } }, storage: { session: { get: async () => ({}), set: async () => {} } } };
  const adapter = createBrowserAdapter(api);
  const ids = Array.from({ length: 101 }, (_, index) => index + 1);
  assert.equal((await adapter.move(ids, { windowId: 1, index: -1 })).length, 101);
  assert.deepEqual(calls.map((batch) => batch.length), [50, 50, 1]);
});

test("private operation state stays in memory and never reaches browser storage", async () => {
  const writes = [];
  const api = { tabs: {}, storage: { session: { get: async () => ({}), set: async (value) => writes.push(value) } } };
  const adapter = createBrowserAdapter(api);
  await adapter.writeOperationState(false, { status: "running" });
  await adapter.writeOperationState(true, { status: "private-running" });
  assert.deepEqual(Object.keys(writes[0]), ["operation_regular"]);
  assert.equal(writes.length, 1);
  assert.deepEqual(await createBrowserAdapter(api).readOperationState(true), { status: "private-running" });
});

test("readCaptured filters moved tabs and reports closed ids", async () => {
  const api = {
    tabs: { get: async (id) => {
      if (id === 3) throw new Error("No tab with id: 3");
      return { id, windowId: id === 2 ? 9 : 1, incognito: false };
    } },
    storage: { session: { get: async () => ({}), set: async () => {} } },
  };
  const adapter = createBrowserAdapter(api);
  const result = await adapter.readCaptured({ tabIds: [1, 2, 3], windowIds: [1], incognito: false });
  assert.deepEqual(result.tabs.map(({ id }) => id), [1]);
  assert.deepEqual(result.changedIds.sort((a, b) => a - b), [2, 3]);
});

test("a partial move error carries confirmed IDs from earlier and current batches", async () => {
  let call = 0;
  const api = {
    tabs: { move: async (ids) => { call += 1; if (call === 2) return ids.slice(0, 1).map((id) => ({ id })); return ids.map((id) => ({ id })); } },
    storage: { session: { get: async () => ({}), set: async () => {} } },
  };
  const adapter = createBrowserAdapter(api);
  const ids = Array.from({ length: 60 }, (_, index) => index + 1);
  await assert.rejects(adapter.move(ids, { windowId: 1, index: -1 }), (error) => {
    assert.deepEqual(error.confirmedMovedIds, [...Array.from({ length: 50 }, (_, index) => index + 1), 51]);
    return true;
  });
});

test("ungroup counts only tabs confirmed outside groups", async () => {
  const tabs = new Map([[1, { id: 1, groupId: -1 }], [2, { id: 2, groupId: 4 }]]);
  const api = {
    tabs: {
      get: async (id) => tabs.get(id),
      ungroup: async () => {},
    },
    storage: { session: { get: async () => ({}), set: async () => {} } },
  };
  const adapter = createBrowserAdapter(api);
  assert.equal(await adapter.ungroup([1, 2]), 1);
});

test("unpin clears pinned state and counts confirmed tabs", async () => {
  const api = createFakeBrowser([{ id: 1, type: "normal", tabs: [{ id: 11, pinned: true }, { id: 12, pinned: true }] }]);
  const adapter = createBrowserAdapter(api);
  const count = await adapter.unpin([11, 12]);
  assert.equal(count, 2);
  assert.equal((await api.tabs.get(11)).pinned, false);
});

test("regroupTabs creates a new group with the source title and color when no match exists", async () => {
  const api = createFakeBrowser([{ id: 1, type: "normal", tabs: [{ id: 11 }] }]);
  const adapter = createBrowserAdapter(api);
  const groupId = await adapter.regroupTabs([11], { title: "Research", color: "blue" }, 1);
  assert.equal((await api.tabs.get(11)).groupId, groupId);
  assert.deepEqual(await api.tabGroups.get(groupId), { id: groupId, title: "Research", color: "blue", collapsed: false, windowId: 1 });
});

test("regroupTabs reuses an existing group with a case-insensitively matching title", async () => {
  const api = createFakeBrowser(
    [{ id: 1, type: "normal", tabs: [{ id: 11 }, { id: 12 }] }],
    { groups: [{ id: 500, title: "research", color: "red", windowId: 1 }] },
  );
  const adapter = createBrowserAdapter(api);
  const groupId = await adapter.regroupTabs([12], { title: "Research", color: "blue" }, 1);
  assert.equal(groupId, 500);
  assert.equal((await api.tabGroups.get(500)).color, "red");
});

test("readGroupMeta returns null for an ungrouped tab's groupId", async () => {
  const api = createFakeBrowser([{ id: 1, type: "normal", tabs: [{ id: 11 }] }]);
  const adapter = createBrowserAdapter(api);
  assert.equal(await adapter.readGroupMeta(-1), null);
});
