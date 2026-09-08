# Group and Pin Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two user-controlled preferences ("keep pins", "keep groups") so Organize/Bring tabs together/Sort by domain preserve the user's existing Chrome tab groups and pin arrangement by default, instead of always dissolving them.

**Architecture:** The pure planning functions in `src/core/tab-planner.js` gain optional `{ keepGroups }` parameters that default to today's behavior when omitted, so no existing caller breaks. `src/tab-manager.js` reads the two preferences at the top of `run()`, builds a dynamic list of "prep phases" (unpin, ungroup) that only run when a preference is off, and passes `{ keepGroups }` into the sort/consolidate phases so their move-ordering logic can use group-aware plans. A new adapter layer (`src/browser-adapter.js`) adds `unpin`, `regroupTabs`, and `readGroupMeta`, backed by an extended fake browser for tests. The popup gets a small settings panel that persists the two booleans to `chrome.storage.local` (same mechanism as the existing theme preference) and sends them with every action request.

**Tech Stack:** Vanilla JS (ES modules), `node:test` + `node:assert/strict`, Chrome/Firefox MV3 WebExtension APIs (`chrome.tabs`, `chrome.tabGroups`).

**Spec:** `docs/superpowers/specs/2026-09-08-group-preservation-design.md`

## Global Constraints

- Both preferences default to **on** (`keepPins: true`, `keepGroups: true`) at the product level — but the **pure functions** in `tab-planner.js` default their `keepGroups` option to `false`, so any existing call site that doesn't pass options keeps producing today's exact output. `tab-manager.js` is the one place that applies the product-level default.
- "Keep pins" OFF unpins the tab first (`tabs.update(id, { pinned: false })`), then treats it as a normal tab for everything downstream. It never tries to interleave a still-pinned tab into a mixed order — that's not achievable in Chrome or Firefox.
- The dedup rule "a pinned copy always survives over an unpinned duplicate" is unconditional and untouched by either preference.
- Group title comparisons are case-insensitive everywhere (sort ordering and "does the target window already have a matching group" both use the same rule).
- Split-view tabs are always skipped by every phase, unaffected by either preference — no change from today.
- Both preferences only affect **Organize all tabs**, **Bring tabs together**, and **Sort by domain**. **Remove duplicate URLs** is untouched.
- `manifests/chrome.json` and `manifests/firefox.json` need the `tabGroups` permission back — this time it's used by real code.
- Firefox's actual support for `tabs.group`/`tabGroups.get`/`tabGroups.update`/`groupId` must be verified against a real Firefox build during Task 11, not assumed. Existing code already has a defensive pattern for a missing API (`browser-adapter.js:72`, `!api.tabs.ungroup`) — new adapter functions follow the same pattern so an unsupported browser just no-ops instead of throwing.

---

### Task 1: Adapter support for unpinning and tab groups

**Files:**
- Modify: `test/support/fake-browser.js`
- Modify: `src/browser-adapter.js`
- Test: `test/browser-adapter.test.js`

**Interfaces:**
- Produces: `adapter.unpin(tabIds: number[]): Promise<number>` (count of tabs confirmed unpinned)
- Produces: `adapter.readGroupMeta(groupId: number): Promise<{id, title, color, windowId, collapsed} | null>`
- Produces: `adapter.regroupTabs(tabIds: number[], meta: {title?, color?}, windowId: number): Promise<number | null>` (returns the destination groupId)

- [ ] **Step 1: Extend the fake browser with group and pin-update support**

In `test/support/fake-browser.js`, replace the whole file with:

```js
export function createFakeBrowser(inputWindows = [], options = {}) {
  const windows = inputWindows.map((window) => ({
    id: window.id,
    type: window.type || "normal",
    incognito: Boolean(window.incognito),
    tabs: (window.tabs || []).map((tab, index) => ({
      id: tab.id,
      windowId: window.id,
      index,
      title: tab.title || `Tab ${tab.id}`,
      url: tab.url ?? "",
      pendingUrl: tab.pendingUrl,
      pinned: Boolean(tab.pinned),
      active: Boolean(tab.active),
      status: tab.status || "complete",
      incognito: Boolean(window.incognito),
      groupId: tab.groupId ?? -1,
      splitViewId: tab.splitViewId,
      cookieStoreId: tab.cookieStoreId,
      mutedInfo: tab.mutedInfo,
      discarded: tab.discarded,
      frozen: tab.frozen,
      ...tab,
    })),
  }));
  const groups = (options.groups || []).map((group) => ({ collapsed: false, color: "grey", title: "", ...group }));
  let nextGroupId = 1000;
  const calls = [];
  const session = {};
  const getWindow = (id) => windows.find((window) => window.id === id);
  const getTab = (id) => windows.flatMap(({ tabs }) => tabs).find((tab) => tab.id === id);
  const getGroup = (id) => groups.find((group) => group.id === id);
  const normalize = () => windows.forEach((window) => window.tabs.forEach((tab, index) => { tab.windowId = window.id; tab.index = index; tab.incognito = window.incognito; }));
  const api = {
    calls,
    windows: {
      async getAll(options = {}) {
        calls.push({ name: "windows.getAll", options });
        return windows.filter((window) => !options.windowTypes || options.windowTypes.includes(window.type)).map((window) => ({ ...window, tabs: window.tabs.map((tab) => ({ ...tab })) }));
      },
      async get(id, options = {}) {
        calls.push({ name: "windows.get", id, options });
        const window = getWindow(id);
        if (!window) throw new Error(`No window with id: ${id}`);
        return { ...window, tabs: options.populate ? window.tabs.map((tab) => ({ ...tab })) : undefined };
      },
    },
    tabs: {
      async get(id) {
        calls.push({ name: "tabs.get", id });
        const tab = getTab(id);
        if (!tab || options.closedIds?.has?.(id)) throw new Error(`No tab with id: ${id}`);
        return { ...tab };
      },
      async move(ids, properties) {
        calls.push({ name: "tabs.move", ids: [...ids], properties: { ...properties } });
        if (options.moveError) throw options.moveError;
        if (options.moveErrors?.length) throw options.moveErrors.shift();
        const requested = Array.isArray(ids) ? ids : [ids];
        const moving = requested.map((id) => getTab(id)).filter(Boolean);
        if (!moving.length) return [];
        const destination = getWindow(properties.windowId) || getWindow(moving[0].windowId);
        for (const tab of moving) {
          const source = getWindow(tab.windowId);
          source.tabs = source.tabs.filter(({ id }) => id !== tab.id);
        }
        let index = properties.index == null || properties.index < 0 ? destination.tabs.length : properties.index;
        if (moving.some((tab) => tab.pinned) && index > destination.tabs.filter((tab) => tab.pinned).length) index = destination.tabs.filter((tab) => tab.pinned).length;
        destination.tabs.splice(index, 0, ...moving);
        normalize();
        return moving.map((tab) => ({ ...tab }));
      },
      async remove(ids) {
        calls.push({ name: "tabs.remove", ids: [...ids] });
        if (options.removeError) throw options.removeError;
        for (const id of ids) {
          if (options.retainedIds?.has?.(id)) continue;
          const tab = getTab(id);
          if (!tab) continue;
          const window = getWindow(tab.windowId);
          window.tabs = window.tabs.filter(({ id: tabId }) => tabId !== id);
          if (window.tabs.length && !window.tabs.some(({ active }) => active)) window.tabs[0].active = true;
        }
        normalize();
      },
      async ungroup(ids) {
        calls.push({ name: "tabs.ungroup", ids: [...ids] });
        for (const id of ids) { const tab = getTab(id); if (tab) tab.groupId = -1; }
        return ids.map((id) => ({ id }));
      },
      async update(id, properties) {
        calls.push({ name: "tabs.update", id, properties: { ...properties } });
        const tab = getTab(id);
        if (!tab) throw new Error(`No tab with id: ${id}`);
        if (properties.active) {
          const window = getWindow(tab.windowId);
          window.tabs.forEach((candidate) => { candidate.active = candidate.id === id; });
        }
        if (typeof properties.pinned === "boolean") tab.pinned = properties.pinned;
        return { ...tab };
      },
      async group({ tabIds, groupId, createProperties }) {
        calls.push({ name: "tabs.group", tabIds: [...tabIds], groupId, createProperties });
        let resultGroupId = groupId;
        if (resultGroupId == null) {
          resultGroupId = nextGroupId++;
          const windowId = createProperties?.windowId ?? getTab(tabIds[0])?.windowId;
          groups.push({ id: resultGroupId, title: "", color: "grey", collapsed: false, windowId });
        }
        for (const id of tabIds) { const tab = getTab(id); if (tab) tab.groupId = resultGroupId; }
        return resultGroupId;
      },
    },
    tabGroups: {
      async get(groupId) {
        calls.push({ name: "tabGroups.get", groupId });
        const group = getGroup(groupId);
        if (!group) throw new Error(`No group with id: ${groupId}`);
        return { ...group };
      },
      async query(queryInfo = {}) {
        calls.push({ name: "tabGroups.query", queryInfo });
        return groups.filter((group) => queryInfo.windowId == null || group.windowId === queryInfo.windowId).map((group) => ({ ...group }));
      },
      async update(groupId, properties) {
        calls.push({ name: "tabGroups.update", groupId, properties: { ...properties } });
        const group = getGroup(groupId);
        if (!group) throw new Error(`No group with id: ${groupId}`);
        Object.assign(group, properties);
        return { ...group };
      },
    },
    storage: { session: {
      async get(key) { calls.push({ name: "storage.session.get", key }); return key ? { [key]: session[key] } : { ...session }; },
      async set(values) { calls.push({ name: "storage.session.set", values }); Object.assign(session, values); },
    } },
    snapshotWindow(id) { const window = getWindow(id); return { ...window, tabs: window.tabs.map((tab) => ({ ...tab })) }; },
    snapshotGroup(id) { const group = getGroup(id); return group ? { ...group } : null; },
  };
  normalize();
  return api;
}
```

The only behavioral additions versus the current file: `groups` seed data via `options.groups`, `tabs.update` now applies a `pinned` property when given one, and the new `tabs.group` / `tabGroups.*` methods. Nothing existing changed shape.

- [ ] **Step 2: Add `unpin`, `readGroupMeta`, `regroupTabs` to the adapter**

In `src/browser-adapter.js`, add these three functions inside `createBrowserAdapter`, right after the existing `ungroup` function (after its closing `}` around line 81):

```js
  async function unpin(tabIds) {
    let count = 0;
    for (const id of tabIds) {
      if (!api.tabs.update) continue;
      await api.tabs.update(id, { pinned: false });
      const tab = await readTab(api, id);
      if (tab && !tab.pinned) count += 1;
    }
    await refresh();
    return count;
  }

  async function readGroupMeta(groupId) {
    if (!Number.isInteger(groupId) || groupId < 0 || !api.tabGroups?.get) return null;
    try { return await api.tabGroups.get(groupId); } catch { return null; }
  }

  async function regroupTabs(tabIds, meta, windowId) {
    if (!tabIds.length || !api.tabs.group) return null;
    let targetGroupId = null;
    if (api.tabGroups?.query) {
      const existing = await api.tabGroups.query({ windowId }).catch(() => []);
      const wantedTitle = (meta.title || "").toLowerCase();
      const match = existing.find((group) => (group.title || "").toLowerCase() === wantedTitle);
      if (match) targetGroupId = match.id;
    }
    if (targetGroupId == null) {
      targetGroupId = await api.tabs.group({ tabIds, createProperties: { windowId } });
      if (api.tabGroups?.update) await api.tabGroups.update(targetGroupId, { title: meta.title || "", color: meta.color || "grey" });
    } else {
      await api.tabs.group({ tabIds, groupId: targetGroupId });
    }
    await refresh();
    return targetGroupId;
  }
```

Then update the final `return` statement (around line 151) to:

```js
  return { capture, readCaptured, ungroup, unpin, regroupTabs, readGroupMeta, move, remove, activate, readOperationState, writeOperationState };
```

- [ ] **Step 3: Write the failing tests**

Add to `test/browser-adapter.test.js`:

```js
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
```

Import `createFakeBrowser` at the top of `test/browser-adapter.test.js` if it isn't already: `import { createFakeBrowser } from "./support/fake-browser.js";`

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test test/browser-adapter.test.js`
Expected: all 4 new tests PASS, and every pre-existing test in the file still PASSES (they don't touch groups/pins).

- [ ] **Step 5: Commit**

```bash
git add test/support/fake-browser.js src/browser-adapter.js test/browser-adapter.test.js
git commit -m "feat: add adapter support for unpinning and tab-group creation"
```

---

### Task 2: Pure group-ordering helper

**Files:**
- Modify: `src/core/tab-rules.js`
- Test: `test/tab-rules.test.js`

**Interfaces:**
- Produces: `compareGroupBlocks({title, leftmostIndex}, {title, leftmostIndex}): number`

- [ ] **Step 1: Write the failing test**

Add to `test/tab-rules.test.js` (check the top of the file for its existing import line and add `compareGroupBlocks` to it):

```js
test("group blocks sort by title case-insensitively, untitled first, tie-break by leftmost tab index", () => {
  const blocks = [
    { title: "Work", leftmostIndex: 2 },
    { title: "", leftmostIndex: 5 },
    { title: "work", leftmostIndex: 0 },
    { title: "Archive", leftmostIndex: 9 },
  ];
  const sorted = blocks.slice().sort(compareGroupBlocks);
  assert.deepEqual(sorted, [
    { title: "", leftmostIndex: 5 },
    { title: "Archive", leftmostIndex: 9 },
    { title: "work", leftmostIndex: 0 },
    { title: "Work", leftmostIndex: 2 },
  ]);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test test/tab-rules.test.js`
Expected: FAIL with `compareGroupBlocks is not defined` (not yet exported).

- [ ] **Step 3: Implement it**

In `src/core/tab-rules.js`, add this export anywhere after the `collator` declaration at the top (it reuses the existing module-level `collator`, which is already `{ sensitivity: "base" }` — case-insensitive):

```js
export function compareGroupBlocks(a, b) {
  return collator.compare(a.title || "", b.title || "") || (a.leftmostIndex ?? Number.MAX_SAFE_INTEGER) - (b.leftmostIndex ?? Number.MAX_SAFE_INTEGER);
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `node --test test/tab-rules.test.js`
Expected: PASS, and every pre-existing test in the file still passes.

- [ ] **Step 5: Commit**

```bash
git add src/core/tab-rules.js test/tab-rules.test.js
git commit -m "feat: add group-block comparator for group-aware sorting"
```

---

### Task 3: Group-aware `planSort`

**Files:**
- Modify: `src/core/tab-planner.js`
- Test: `test/tab-planner.test.js`

**Interfaces:**
- Consumes: `compareGroupBlocks` from Task 2 (`src/core/tab-rules.js`)
- Produces: `planSort(tabs, { keepGroups?: boolean, groupTitleById?: Map<number,string> }): { orderedIds: number[], groupedIds: number[], skippedForSplitView: boolean }` — `keepGroups` defaults to `false` (today's behavior, unchanged for any caller that omits it)

- [ ] **Step 1: Write the failing tests**

Add to `test/tab-planner.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test test/tab-planner.test.js`
Expected: the first two FAIL (orderedIds doesn't group-cluster yet); the third PASSES already (it matches current behavior) — that's expected, it's there to lock in the backward-compatible default.

- [ ] **Step 3: Implement group-aware `planSort`**

In `src/core/tab-planner.js`, change the top import line to:

```js
import { chooseDuplicateSurvivors, compareGroupBlocks, compareTabsByDomain, isSplitViewTab, sortPinnedSections } from "./tab-rules.js";
```

Replace the existing `planSort` function with:

```js
export function planSort(tabs, { keepGroups = false, groupTitleById = new Map() } = {}) {
  const skippedForSplitView = tabs.some(isSplitViewTab);
  const groupedIds = tabs.filter((tab) => Number.isInteger(tab.groupId) && tab.groupId >= 0).map(({ id }) => id);
  if (skippedForSplitView) return { orderedIds: [], groupedIds, skippedForSplitView };
  if (!keepGroups) return { orderedIds: sortPinnedSections(tabs).map(({ id }) => id), groupedIds, skippedForSplitView };
  const orderSection = (sectionTabs) => {
    const byGroup = new Map();
    const ungrouped = [];
    for (const tab of sectionTabs) {
      if (Number.isInteger(tab.groupId) && tab.groupId >= 0) {
        if (!byGroup.has(tab.groupId)) byGroup.set(tab.groupId, []);
        byGroup.get(tab.groupId).push(tab);
      } else ungrouped.push(tab);
    }
    const blocks = [...byGroup.entries()]
      .map(([groupId, groupTabs]) => {
        const ordered = groupTabs.slice().sort((a, b) => a.index - b.index);
        return { tabs: ordered, title: groupTitleById.get(groupId) || "", leftmostIndex: Math.min(...ordered.map((tab) => tab.index)) };
      })
      .sort(compareGroupBlocks);
    return [...blocks.flatMap((block) => block.tabs), ...ungrouped.slice().sort(compareTabsByDomain)];
  };
  const orderedIds = [...orderSection(tabs.filter((tab) => tab.pinned)), ...orderSection(tabs.filter((tab) => !tab.pinned))].map(({ id }) => id);
  return { orderedIds, groupedIds, skippedForSplitView };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test test/tab-planner.test.js`
Expected: all PASS, including every pre-existing test in the file (`planSort` with no options must still behave exactly as before).

- [ ] **Step 5: Commit**

```bash
git add src/core/tab-planner.js test/tab-planner.test.js
git commit -m "feat: make planSort group-aware while keeping today's default behavior"
```

---

### Task 4: Group-aware `planConsolidation`

**Files:**
- Modify: `src/core/tab-planner.js`
- Test: `test/tab-planner.test.js`

**Interfaces:**
- Produces: `planConsolidation(tabs, targetWindowId, { keepGroups?: boolean }): { groupedIds, pinnedIds, unpinnedIds, skippedSplitIds, groupsToMove: Array<{groupId: number, tabIds: number[]}> }` — `keepGroups` defaults to `false`

- [ ] **Step 1: Write the failing tests**

Add to `test/tab-planner.test.js`:

```js
test("planConsolidation groups grouped tabs into move units when keepGroups is true", () => {
  const tabs = [
    { id: 1, windowId: 2, index: 0, pinned: false, groupId: 10 },
    { id: 2, windowId: 2, index: 1, pinned: false, groupId: -1 },
    { id: 3, windowId: 2, index: 2, pinned: false, groupId: 10 },
  ];
  const plan = planConsolidation(tabs, 1, { keepGroups: true });
  assert.deepEqual(plan.groupsToMove, [{ groupId: 10, tabIds: [1, 3] }]);
  assert.deepEqual(plan.unpinnedIds, [2]);
});

test("planConsolidation without keepGroups keeps today's flat grouped-tab handling", () => {
  const tabs = [{ id: 1, windowId: 2, index: 0, pinned: false, groupId: 10 }];
  const plan = planConsolidation(tabs, 1);
  assert.deepEqual(plan.groupsToMove, []);
  assert.deepEqual(plan.unpinnedIds, [1]);
  assert.deepEqual(plan.groupedIds, [1]);
});
```

- [ ] **Step 2: Run the tests and confirm the first fails**

Run: `node --test test/tab-planner.test.js`
Expected: the first FAILS (`plan.groupsToMove` is `undefined`); the second PASSES already.

- [ ] **Step 3: Implement it**

Replace the existing `planConsolidation` function in `src/core/tab-planner.js` with:

```js
export function planConsolidation(tabs, targetWindowId, { keepGroups = false } = {}) {
  const groupedIds = [];
  const pinnedIds = [];
  const unpinnedIds = [];
  const skippedSplitIds = [];
  const groupBuckets = new Map();
  for (const tab of tabs) {
    if (tab.windowId === targetWindowId) continue;
    if (isSplitViewTab(tab)) { skippedSplitIds.push(tab.id); continue; }
    const isGrouped = Number.isInteger(tab.groupId) && tab.groupId >= 0;
    if (isGrouped) groupedIds.push(tab.id);
    if (keepGroups && isGrouped) {
      if (!groupBuckets.has(tab.groupId)) groupBuckets.set(tab.groupId, []);
      groupBuckets.get(tab.groupId).push(tab);
      continue;
    }
    (tab.pinned ? pinnedIds : unpinnedIds).push(tab.id);
  }
  const groupsToMove = [...groupBuckets.entries()].map(([groupId, groupTabs]) => ({
    groupId,
    tabIds: groupTabs.slice().sort((a, b) => a.index - b.index).map(({ id }) => id),
  }));
  return { groupedIds, pinnedIds, unpinnedIds, skippedSplitIds, groupsToMove };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test test/tab-planner.test.js`
Expected: all PASS, including every pre-existing test in the file.

- [ ] **Step 5: Commit**

```bash
git add src/core/tab-planner.js test/tab-planner.test.js
git commit -m "feat: make planConsolidation group-aware while keeping today's default behavior"
```

---

### Task 5: Preferences flow through `run()`, new unpin phase, conditional prep phases

**Files:**
- Modify: `src/tab-manager.js`
- Test: `test/tab-manager.test.js`

**Interfaces:**
- Consumes: `planSort`/`planConsolidation`'s new `{ keepGroups }` option (Tasks 3–4); `adapter.unpin` (Task 1)
- Produces: `createTabManager(api).run(action, targetWindowId, preferences?: { keepPins?: boolean, keepGroups?: boolean })` — when `preferences` is omitted, both default to `true`
- Produces: `result.unpinned: number` on every operation result

This task changes the *default* behavior of `run()` for organize/consolidate/sort (they no longer dissolve groups/unpin tabs unless asked to), which breaks 6 existing tests that relied on today's implicit always-ungroup behavior. Those tests are updated in Step 1 to explicitly request `{ keepGroups: false }`, preserving exactly what they were testing (the ungroup-phase mechanics), not deleting coverage.

- [ ] **Step 1: Update the 6 existing tests that assume today's default ungrouping**

In `test/tab-manager.test.js`, make these five one-line edits (each adds `{ keepGroups: false }` as the third argument to `run`, which is the only change):

Line 114, change:
```js
  const result = await createTabManager(api).run("sort", 1);
```
to:
```js
  const result = await createTabManager(api).run("sort", 1, { keepGroups: false });
```

Line 125, change:
```js
  await createTabManager(api).run("consolidate", 1);
```
to:
```js
  await createTabManager(api).run("consolidate", 1, { keepGroups: false });
```

Line 304 (inside `"consolidation re-ungroups a tab that becomes grouped after its first ungroup phase"`), change:
```js
  const result = await createTabManager(api).run("consolidate", 1);
```
to:
```js
  const result = await createTabManager(api).run("consolidate", 1, { keepGroups: false });
```

Line 324 (inside `"sort re-ungroups a tab that becomes grouped after its first ungroup phase"`), change:
```js
  const result = await createTabManager(api).run("sort", 1);
```
to:
```js
  const result = await createTabManager(api).run("sort", 1, { keepGroups: false });
```

Line 335 (inside `"consolidate terminates when ungroup makes no progress"`), change:
```js
  const result = await createTabManager(api).run("consolidate", 1);
```
to:
```js
  const result = await createTabManager(api).run("consolidate", 1, { keepGroups: false });
```

Line 347 (inside `"sort terminates when ungroup makes no progress"`), change:
```js
  const result = await createTabManager(api).run("sort", 1);
```
to:
```js
  const result = await createTabManager(api).run("sort", 1, { keepGroups: false });
```

- [ ] **Step 2: Write the failing tests for the new default**

Add to `test/tab-manager.test.js`:

```js
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
```

- [ ] **Step 3: Run the tests and confirm the new ones fail**

Run: `node --test test/tab-manager.test.js`
Expected: the 6 updated tests still PASS (they now explicitly ask for the old behavior); the 2 new tests FAIL (`run` doesn't accept a `preferences` argument yet, groups still always dissolve).

- [ ] **Step 4: Implement it**

In `src/tab-manager.js`:

1. Add `unpinned: 0` to the result shape in `createEmptyResult` (around line 11):

```js
  const result = { action, status: "running", moved: 0, removed: 0, ungrouped: 0, unpinned: 0, skippedSplit: 0, changed: 0, retained: 0, failed: 0, sortingSkipped: false, message: "" };
```

2. Add an `unpinned` line to `resultMessage` (around line 25), right after the `ungrouped` line:

```js
  if (result.ungrouped) parts.push(`Ungrouped ${phrase(result.ungrouped, "tab")}`);
  if (result.unpinned) parts.push(`Unpinned ${phrase(result.unpinned, "tab")}`);
```

3. Add `unpinned: result.unpinned` to both count-snapshot objects: `updateLease` (around line 80) and the `onBatch` callback inside `run` (around line 261). Both currently read:

```js
    lease.counts = { moved: result.moved, removed: result.removed, ungrouped: result.ungrouped, skippedSplit: result.skippedSplit, changed: result.changed, retained: result.retained, failed: result.failed };
```

Change both occurrences to:

```js
    lease.counts = { moved: result.moved, removed: result.removed, ungrouped: result.ungrouped, unpinned: result.unpinned, skippedSplit: result.skippedSplit, changed: result.changed, retained: result.retained, failed: result.failed };
```

4. Add a new `unpinPhase` function, right after `ungroupPhase` (after its closing `}` around line 115):

```js
  async function unpinPhase(opAdapter, scope, result, changedIds, intentionalRemovals, mode) {
    const inScope = (tab) => {
      if (!tab.pinned) return false;
      if (mode === "consolidate") return tab.windowId !== scope.targetWindowId;
      if (mode === "sort") return tab.windowId === scope.targetWindowId;
      return true;
    };
    const tabs = await readPhase(opAdapter, scope, result, changedIds, intentionalRemovals);
    const pending = new Set(tabs.filter(inScope).map(({ id }) => id));
    let attempts = 0;
    while (pending.size) {
      const liveTabs = await readPhase(opAdapter, scope, result, changedIds, intentionalRemovals);
      const ids = liveTabs.filter((tab) => pending.has(tab.id) && inScope(tab)).map(({ id }) => id).slice(0, BATCH_SIZE);
      if (!ids.length) break;
      await ensureTarget(scope);
      const count = await opAdapter.unpin(ids);
      if (count === 0) throw new Error("Unpinning made no progress.");
      result.unpinned += count;
      const after = await readPhase(opAdapter, scope, result, changedIds, intentionalRemovals);
      const stillPinned = new Set(after.filter((tab) => ids.includes(tab.id) && tab.pinned).map(({ id }) => id));
      ids.forEach((id) => { if (!stillPinned.has(id)) pending.delete(id); });
      if (++attempts > Math.max(2, pending.size * 2)) throw new Error("Unpinning made no progress.");
    }
  }
```

5. Change the `run` function signature (around line 215) from `async function run(action, targetWindowId) {` to:

```js
  async function run(action, targetWindowId, preferences = {}) {
```

6. Right after `const target = await assertTarget(targetWindowId);` inside `run`, add:

```js
    const keepGroups = preferences.keepGroups ?? true;
    const keepPins = preferences.keepPins ?? true;
```

7. Replace the static `phaseMap` object (currently built directly inside the `try` block) with a dynamically-built one. Find this block:

```js
      const phaseMap = {
        consolidate: [
          { name: "ungroup", run: (a, s, r, c, i) => ungroupPhase(a, s, r, c, i, "consolidate") },
          { name: "consolidate", run: consolidatePhase },
        ],
        sort: [
          { name: "ungroup", run: (a, s, r, c, i) => ungroupPhase(a, s, r, c, i, "sort") },
          { name: "sort", run: sortPhase },
        ],
        deduplicate: [{ name: "deduplicate", run: deduplicatePhase }],
        organize: [
          { name: "ungroup", run: (a, s, r, c, i) => ungroupPhase(a, s, r, c, i, "organize") },
          { name: "consolidate", run: consolidatePhase },
          { name: "deduplicate", run: deduplicatePhase },
          { name: "sort", run: sortPhase },
        ],
      };
```

Replace it with:

```js
      const prepPhases = [];
      if (action !== "deduplicate") {
        if (!keepPins) prepPhases.push({ name: "unpin", run: (a, s, r, c, i) => unpinPhase(a, s, r, c, i, action) });
        if (!keepGroups) prepPhases.push({ name: "ungroup", run: (a, s, r, c, i) => ungroupPhase(a, s, r, c, i, action) });
      }
      const phaseMap = {
        consolidate: [...prepPhases, { name: "consolidate", run: (a, s, r, c, i) => consolidatePhase(a, s, r, c, i, { keepGroups }) }],
        sort: [...prepPhases, { name: "sort", run: (a, s, r, c, i) => sortPhase(a, s, r, c, i, { keepGroups }) }],
        deduplicate: [{ name: "deduplicate", run: deduplicatePhase }],
        organize: [
          ...prepPhases,
          { name: "consolidate", run: (a, s, r, c, i) => consolidatePhase(a, s, r, c, i, { keepGroups }) },
          { name: "deduplicate", run: deduplicatePhase },
          { name: "sort", run: (a, s, r, c, i) => sortPhase(a, s, r, c, i, { keepGroups }) },
        ],
      };
```

`sortPhase` and `consolidatePhase` don't accept a `{ keepGroups }` argument yet — that's Tasks 6 and 7. For this task, temporarily give both functions a no-op 6th parameter so the file still runs: add `, options = {}` to each function's parameter list (`async function sortPhase(opAdapter, scope, result, changedIds, intentionalRemovals, options = {}) {` and the same for `consolidatePhase`). Task 6 and 7 will use `options.keepGroups` for real.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `node --test test/tab-manager.test.js`
Expected: all PASS, including the 6 updated tests and the 2 new ones. `result.unpinned` is `0` in the "sort keeps grouped tabs grouped by default" test since keepGroups being the default-true doesn't ungroup, and keepPins default-true doesn't unpin either — the group stays intact and no unpinning happens, matching the assertion `ungrouped: 0`.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all tests pass (65 existing + new ones from Tasks 1–5).

- [ ] **Step 7: Commit**

```bash
git add src/tab-manager.js test/tab-manager.test.js
git commit -m "feat: default Organize/Bring-together/Sort to preserving pins and groups"
```

---

### Task 6: Group-aware `sortPhase`

**Files:**
- Modify: `src/tab-manager.js`
- Test: `test/tab-manager.test.js`

**Interfaces:**
- Consumes: `planSort(tabs, { keepGroups, groupTitleById })` (Task 3), `adapter.readGroupMeta` (Task 1)

- [ ] **Step 1: Write the failing test**

Add to `test/tab-manager.test.js`:

```js
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
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test test/tab-manager.test.js`
Expected: FAIL — `sortPhase` currently ignores `options.keepGroups` (from Task 5's placeholder), so it still tries to ungroup the tabs and produces a plain domain-sorted order instead of the group-clustered one.

- [ ] **Step 3: Implement it**

Replace `sortPhase` in `src/tab-manager.js` with:

```js
  async function sortPhase(opAdapter, scope, result, changedIds, intentionalRemovals, { keepGroups = false } = {}) {
    let previousOrder = null;
    let iterations = 0;
    while (true) {
      const tabs = (await readPhase(opAdapter, scope, result, changedIds, intentionalRemovals)).filter((tab) => tab.windowId === scope.targetWindowId);
      addSkippedSplit(result, tabs.filter(isSplitViewTab));
      let groupTitleById = new Map();
      if (keepGroups) {
        const groupIds = [...new Set(tabs.filter((tab) => Number.isInteger(tab.groupId) && tab.groupId >= 0).map((tab) => tab.groupId))];
        for (const groupId of groupIds) {
          const meta = await opAdapter.readGroupMeta(groupId);
          if (meta) groupTitleById.set(groupId, meta.title || "");
        }
      }
      const plan = planSort(tabs, { keepGroups, groupTitleById });
      if (plan.skippedForSplitView) { result.sortingSkipped = true; return; }
      if (!keepGroups) {
        const grouped = plan.groupedIds.filter((id) => tabs.some((tab) => tab.id === id && !isSplitViewTab(tab))).slice(0, BATCH_SIZE);
        if (grouped.length) {
          await ensureTarget(scope);
          await ungroupWithProgress(opAdapter, grouped, result);
          continue;
        }
      }
      const currentIds = tabs.slice().sort((a, b) => a.index - b.index).map(({ id }) => id);
      const moveIndex = plan.orderedIds.findIndex((id, index) => currentIds[index] !== id);
      if (moveIndex < 0) return;
      const order = currentIds.join(",");
      if (order === previousOrder || ++iterations > Math.max(1, tabs.length * 2)) throw new Error("Sorting made no progress after a tab move.");
      const id = plan.orderedIds[moveIndex];
      await ensureTarget(scope);
      await moveWithCount(opAdapter, [id], { windowId: scope.targetWindowId, index: moveIndex }, result, {
        pinnedById: new Map([[id, Boolean(tabs.find((tab) => tab.id === id)?.pinned)]]),
      });
      previousOrder = order;
    }
  }
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test test/tab-manager.test.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tab-manager.js test/tab-manager.test.js
git commit -m "feat: make sortPhase group-aware"
```

---

### Task 7: Group-aware `consolidatePhase`

**Files:**
- Modify: `src/tab-manager.js`
- Test: `test/tab-manager.test.js`

**Interfaces:**
- Consumes: `planConsolidation(tabs, targetWindowId, { keepGroups })` (Task 4), `adapter.regroupTabs`/`adapter.readGroupMeta` (Task 1)

- [ ] **Step 1: Write the failing tests**

Add to `test/tab-manager.test.js`:

```js
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
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node --test test/tab-manager.test.js`
Expected: FAIL — `consolidatePhase` currently ignores `options.keepGroups` (Task 5's placeholder), so it dissolves the groups instead of moving them as units.

- [ ] **Step 3: Implement it**

Replace `consolidatePhase` in `src/tab-manager.js` with:

```js
  async function consolidatePhase(opAdapter, scope, result, changedIds, intentionalRemovals, { keepGroups = false } = {}) {
    const moveGroups = async () => {
      let pendingGroupIds = new Set();
      const initial = await readPhase(opAdapter, scope, result, changedIds, intentionalRemovals);
      const initialPlan = planConsolidation(initial, scope.targetWindowId, { keepGroups: true });
      addSkippedSplit(result, initial.filter((tab) => initialPlan.skippedSplitIds.includes(tab.id)));
      for (const group of initialPlan.groupsToMove) pendingGroupIds.add(group.groupId);
      while (pendingGroupIds.size) {
        const tabs = await readPhase(opAdapter, scope, result, changedIds, intentionalRemovals);
        const plan = planConsolidation(tabs, scope.targetWindowId, { keepGroups: true });
        addSkippedSplit(result, tabs.filter((tab) => plan.skippedSplitIds.includes(tab.id)));
        const group = plan.groupsToMove.find((candidate) => pendingGroupIds.has(candidate.groupId));
        if (!group) break;
        const meta = await opAdapter.readGroupMeta(group.groupId);
        await ensureTarget(scope);
        const targetSection = tabs.filter((tab) => tab.windowId === scope.targetWindowId && !tab.pinned).map(({ id }) => id);
        const moved = await moveWithCount(opAdapter, group.tabIds, { windowId: scope.targetWindowId, index: -1 }, result, {
          section: "unpinned",
          pinnedById: new Map(group.tabIds.map((id) => [id, false])),
          orderIds: group.tabIds,
          anchorIds: targetSection,
          place: "after",
        });
        if (moved.length) await opAdapter.regroupTabs(moved, meta || { title: "", color: "grey" }, scope.targetWindowId);
        pendingGroupIds.delete(group.groupId);
      }
    };
    const moveSection = async (pinned) => {
      const pending = new Set();
      const initial = await readPhase(opAdapter, scope, result, changedIds, intentionalRemovals);
      const initialPlan = planConsolidation(initial, scope.targetWindowId, { keepGroups });
      addSkippedSplit(result, initial.filter((tab) => initialPlan.skippedSplitIds.includes(tab.id)));
      for (const id of (pinned ? initialPlan.pinnedIds : initialPlan.unpinnedIds)) pending.add(id);
      while (pending.size) {
        const tabs = await readPhase(opAdapter, scope, result, changedIds, intentionalRemovals);
        const plan = planConsolidation(tabs, scope.targetWindowId, { keepGroups });
        addSkippedSplit(result, tabs.filter((tab) => plan.skippedSplitIds.includes(tab.id)));
        const available = (pinned ? plan.pinnedIds : plan.unpinnedIds).filter((id) => pending.has(id));
        if (!available.length) break;
        if (!keepGroups) {
          const grouped = available.filter((id) => plan.groupedIds.includes(id)).slice(0, BATCH_SIZE);
          if (grouped.length) {
            await ensureTarget(scope);
            await ungroupWithProgress(opAdapter, grouped, result);
            continue;
          }
        }
        const batch = (pinned ? available.slice(-BATCH_SIZE) : available.slice(0, BATCH_SIZE));
        await ensureTarget(scope);
        const targetSection = tabs.filter((tab) => tab.windowId === scope.targetWindowId && Boolean(tab.pinned) === pinned).map(({ id }) => id);
        await moveWithCount(opAdapter, batch, { windowId: scope.targetWindowId, index: pinned ? 0 : -1 }, result, {
          section: pinned ? "pinned" : "unpinned",
          pinnedById: new Map(batch.map((id) => [id, pinned])),
          orderIds: batch,
          anchorIds: targetSection,
          place: pinned ? "before" : "after",
        });
        batch.forEach((id) => pending.delete(id));
      }
    };
    if (keepGroups) await moveGroups();
    await moveSection(true);
    await moveSection(false);
  }
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test test/tab-manager.test.js`
Expected: all PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/tab-manager.js test/tab-manager.test.js
git commit -m "feat: make consolidatePhase group-aware, completing group preservation"
```

---

### Task 8: Re-add the `tabGroups` permission

**Files:**
- Modify: `manifests/chrome.json`
- Modify: `manifests/firefox.json`

- [ ] **Step 1: Edit both manifests**

In both `manifests/chrome.json` and `manifests/firefox.json`, change:

```json
  "permissions": ["tabs", "storage"],
```

to:

```json
  "permissions": ["tabs", "tabGroups", "storage"],
```

- [ ] **Step 2: Rebuild and verify**

Run: `npm run verify`
Expected: tests pass, both builds succeed, `dist/chrome/manifest.json` and `dist/firefox/manifest.json` both list `tabGroups` in `permissions`.

- [ ] **Step 3: Commit**

```bash
git add manifests/chrome.json manifests/firefox.json
git commit -m "feat: re-add tabGroups permission, now used by group preservation"
```

---

### Task 9: Popup settings panel

**Files:**
- Modify: `src/popup/popup.html`
- Modify: `src/popup/popup.css`
- Modify: `src/popup/popup-state.js`
- Modify: `src/popup/popup.js`
- Modify: `src/background.js`
- Test: `test/popup-state.test.js`
- Test: `test/popup-static.test.js`

**Interfaces:**
- Produces: `resolveBooleanPreference(stored: unknown, defaultValue: boolean): boolean`
- Produces: `formatOperationResult` now also reports `result.unpinned`

- [ ] **Step 1: Write the failing tests**

Add to `test/popup-state.test.js` (add `resolveBooleanPreference` to the existing import line at the top):

```js
test("boolean preference resolves stored value or falls back to the default", () => {
  assert.equal(resolveBooleanPreference(true, true), true);
  assert.equal(resolveBooleanPreference(false, true), false);
  assert.equal(resolveBooleanPreference(undefined, true), true);
  assert.equal(resolveBooleanPreference("not-a-boolean", true), true);
});

test("result text reports unpinned tabs", () => {
  assert.equal(formatOperationResult({ moved: 0, removed: 0, ungrouped: 0, unpinned: 3, skippedSplit: 0, changed: 0, retained: 0, failed: 0, sortingSkipped: false }), "Unpinned 3 tabs");
});
```

Add to `test/popup-static.test.js`:

```js
test("popup exposes a settings panel with pin and group toggles", () => {
  assert.match(html, /id="settings-button"/);
  assert.match(html, /id="settings-panel"/);
  assert.match(html, /id="keep-pins-toggle"/);
  assert.match(html, /id="keep-groups-toggle"/);
  assert.match(html, /Keep pinned tabs pinned/);
  assert.match(html, /Keep tab groups together/);
  assert.match(html, /aria-controls="settings-panel"/);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test test/popup-state.test.js test/popup-static.test.js`
Expected: FAIL — `resolveBooleanPreference` doesn't exist yet, the settings markup isn't in `popup.html` yet, and the "Unpinned" test fails since `formatOperationResult` doesn't handle `unpinned` yet.

- [ ] **Step 3: Implement `popup-state.js` changes**

In `src/popup/popup-state.js`, add this export anywhere in the file:

```js
export function resolveBooleanPreference(stored, defaultValue = true) {
  return typeof stored === "boolean" ? stored : defaultValue;
}
```

In `formatOperationResult`, add a line right after the `ungrouped` line:

```js
  if (result.ungrouped) parts.push(`Ungrouped ${phrase(result.ungrouped, "tab")}`);
  if (result.unpinned) parts.push(`Unpinned ${phrase(result.unpinned, "tab")}`);
```

- [ ] **Step 4: Implement the HTML**

In `src/popup/popup.html`, add a settings button right before the existing `#theme-button` (inside `.header`, before `<button id="theme-button" ...>`):

```html
        <button id="settings-button" class="theme-button" type="button" aria-label="Settings" title="Settings" aria-expanded="false" aria-controls="settings-panel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.63 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.63a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.37 9a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.04Z"/>
          </svg>
          <span class="sr-only">Settings</span>
        </button>
```

Right after the closing `</header>` tag, before `<p class="tagline">`, add the panel:

```html
      <div id="settings-panel" class="settings-panel" hidden>
        <label class="settings-toggle">
          <input type="checkbox" id="keep-pins-toggle" checked>
          <span class="settings-toggle-text">
            <span class="settings-toggle-label">Keep pinned tabs pinned</span>
            <span class="settings-toggle-description">Off unpins tabs first so they can be sorted or moved like any other tab.</span>
          </span>
        </label>
        <label class="settings-toggle">
          <input type="checkbox" id="keep-groups-toggle" checked>
          <span class="settings-toggle-text">
            <span class="settings-toggle-label">Keep tab groups together</span>
            <span class="settings-toggle-description">Off dissolves your tab groups so tabs can be freely reorganized.</span>
          </span>
        </label>
      </div>
```

- [ ] **Step 5: Implement the CSS**

Add to `src/popup/popup.css`, near the existing `.status` rules:

```css
.settings-panel { display: flex; flex-direction: column; gap: 10px; margin: 12px 0; padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--canvas); }
.settings-toggle { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
.settings-toggle input { margin-top: 3px; flex: 0 0 auto; width: 16px; height: 16px; accent-color: var(--accent); }
.settings-toggle-text { display: flex; flex-direction: column; gap: 2px; }
.settings-toggle-label { font-size: 13px; font-weight: 600; color: var(--ink); }
.settings-toggle-description { font-size: 11.5px; color: var(--muted); }
```

- [ ] **Step 6: Implement the `popup.js` wiring**

In `src/popup/popup.js`:

Add to the import line at the top:

```js
import { formatOperationResult, nextTheme, operationVisualState, resolveBooleanPreference, resolveTheme } from "./popup-state.js";
```

Add new element references right after the existing `const actionButtons = ...` line:

```js
const settingsButton = document.querySelector("#settings-button");
const settingsPanel = document.querySelector("#settings-panel");
const keepPinsToggle = document.querySelector("#keep-pins-toggle");
const keepGroupsToggle = document.querySelector("#keep-groups-toggle");
```

Add new state variables next to `let preference = "system";`:

```js
let keepPins = true;
let keepGroups = true;
```

In `runAction`, change the `send` call from:

```js
    const response = await send({ action, targetWindowId });
```

to:

```js
    const response = await send({ action, targetWindowId, preferences: { keepPins, keepGroups } });
```

In `init`, right after the existing theme-loading block (`applyTheme();`), add:

```js
  const storedPrefs = await storageGet(["keepPinsSeparate", "keepGroupsTogether"]).catch(() => ({}));
  keepPins = resolveBooleanPreference(storedPrefs.keepPinsSeparate, true);
  keepGroups = resolveBooleanPreference(storedPrefs.keepGroupsTogether, true);
  keepPinsToggle.checked = keepPins;
  keepGroupsToggle.checked = keepGroups;
```

Add new event listeners next to the existing `themeButton.addEventListener(...)` block:

```js
settingsButton.addEventListener("click", () => {
  const expanded = settingsButton.getAttribute("aria-expanded") === "true";
  settingsButton.setAttribute("aria-expanded", String(!expanded));
  settingsPanel.hidden = expanded;
});
keepPinsToggle.addEventListener("change", async () => {
  keepPins = keepPinsToggle.checked;
  await storageSet({ keepPinsSeparate: keepPins });
});
keepGroupsToggle.addEventListener("change", async () => {
  keepGroups = keepGroupsToggle.checked;
  await storageSet({ keepGroupsTogether: keepGroups });
});
```

- [ ] **Step 7: Implement the `background.js` wiring**

In `src/background.js`, change:

```js
  const operation = request.action === "getStatus" ? manager.getStatus(request.targetWindowId) : manager.run(request.action, request.targetWindowId);
```

to:

```js
  const operation = request.action === "getStatus" ? manager.getStatus(request.targetWindowId) : manager.run(request.action, request.targetWindowId, request.preferences);
```

- [ ] **Step 8: Run the tests and confirm they pass**

Run: `node --test test/popup-state.test.js test/popup-static.test.js`
Expected: all PASS.

- [ ] **Step 9: Run the full suite**

Run: `npm run verify`
Expected: all tests pass, both builds succeed.

- [ ] **Step 10: Commit**

```bash
git add src/popup/popup.html src/popup/popup.css src/popup/popup-state.js src/popup/popup.js src/background.js test/popup-state.test.js test/popup-static.test.js
git commit -m "feat: add settings panel for keep-pins and keep-groups preferences"
```

---

### Task 10: Store listing permission justification

**Files:**
- Modify: `store-listing/chrome/listing.md`

- [ ] **Step 1: Add the new permission justification section**

In `store-listing/chrome/listing.md`, right after the existing `## Permission justification: storage` section and before `## Privacy practices answers`, add:

```markdown
## Permission justification: tabGroups

Simple Tab Manager reads a tab group's title and color, and creates or
extends a matching group, only when the user's chosen action moves grouped
tabs into a different window and the "Keep tab groups together" setting is
on. It never reads, modifies, or removes a tab group the user did not just
ask the extension to touch.
```

- [ ] **Step 2: Sanity-check the file**

Run: `grep -c "^## Permission justification" store-listing/chrome/listing.md`
Expected: `3` (tabs, storage, tabGroups).

- [ ] **Step 3: Commit**

```bash
git add store-listing/chrome/listing.md
git commit -m "docs: add tabGroups permission justification to the Chrome listing"
```

---

### Task 11: Full verification and manual test checklist

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated verification**

Run: `npm run verify`
Expected: all tests pass, both Chrome and Firefox builds succeed and pass `verify-build.mjs`.

- [ ] **Step 2: Rebuild the release archives**

Run: `npm run release:package`
Expected: fresh ZIPs in `artifacts/`, still versioned `2.0.0` (this feature doesn't need a version bump by itself, but bump it if it's shipping as part of the same submission as other user-visible changes — that's a product call, not this plan's).

- [ ] **Step 3: Manual test in Chrome — the original bug**

Load `dist/chrome` unpacked via `chrome://extensions` (Developer mode → Load unpacked). Create a native Chrome tab group with 2+ tabs. Click "Organize all tabs". Confirm: the group still exists in the target window, its tabs are still together, and the group's title/color match what you set.

- [ ] **Step 4: Manual test in Chrome — the toggles**

Open the new settings panel (gear icon). Turn off "Keep tab groups together", repeat Step 3's group setup, click "Organize all tabs". Confirm: the group is dissolved, exactly like before this feature existed. Turn off "Keep pinned tabs pinned", pin a tab in a source window, run "Bring tabs together". Confirm: that tab arrives unpinned.

- [ ] **Step 5: Manual test in Firefox — check real API support**

Load `dist/firefox/manifest.json` as a temporary add-on in Firefox. Repeat Step 3. If Firefox's tab-groups support doesn't match Chrome's, the "Keep tab groups together" switch should just have no visible effect (tabs get dissolved as if the switch were off) — it must not throw or leave the popup stuck on "Working…". Record what actually happens; if it doesn't degrade gracefully, that's a bug to fix before shipping, not a plan follow-up.

- [ ] **Step 6: Update store assets**

Once the above manual checks pass, decide with the user whether the store screenshots/description need updating to mention the new settings (this plan doesn't do that automatically — the design spec says assets are updated only after the feature is verified working).
