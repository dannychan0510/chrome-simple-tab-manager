# Simple Tab Manager Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Simple Tab Manager as a tested Manifest V3 extension that consolidates, deduplicates, and domain-sorts tabs in Chrome and Firefox with an accessible light/dark popup.

**Architecture:** Pure modules decide duplicate survivors and tab order from immutable snapshots. A browser adapter validates live state and normalizes Chrome/Firefox API behavior, while one operation runner owns batching, retries, leases, and the four user actions. Separate manifests and one build script produce browser-specific distributions from shared source.

**Tech Stack:** JavaScript ES modules, WebExtensions APIs, Node.js 20+ built-in test runner, `@fontsource/ibm-plex-sans` 5.3.0, `sharp` 0.35.4, HTML, CSS, SVG.

**Spec:** `docs/superpowers/specs/2026-09-08-tab-manager-rebuild-design.md`

## Global Constraints

- Support current desktop Chrome and Firefox with separate Manifest V3 packages.
- Use exact URL equality for duplicates; query parameters and fragments remain significant.
- A pinned duplicate always survives an unpinned duplicate.
- Never mix regular and private windows or touch windows and tabs created after an operation starts.
- Skip loading, pending, missing-URL, and split-view tabs during duplicate removal.
- Keep Firefox container identities separate with `cookieStoreId`.
- Sort pinned and unpinned sections independently with reversed hostname labels.
- Store no URLs or titles; operation state contains only action, target ID, timestamps, and counts.
- Request only `tabs` and `storage` permissions.
- Bundle every script, style, font, and icon locally.
- Use test-driven development: add each behavior test, observe the expected failure, then add production code.

---

### Task 1: Project scaffold and pure tab rules

**Files:**
- Create: `package.json`
- Create: `src/core/tab-rules.js`
- Create: `test/tab-rules.test.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `hasUsableId(tab): boolean`
- Produces: `isSplitViewTab(tab): boolean`
- Produces: `isDuplicateEligible(tab): boolean`
- Produces: `duplicateKey(tab): string | null`
- Produces: `domainSortKey(tab): { category: number, reversedHost: string, host: string, url: string, title: string, index: number }`
- Produces: `compareTabsByDomain(a, b): number`
- Produces: `sortPinnedSections(tabs): Tab[]`
- Produces: `chooseDuplicateSurvivors(tabs, targetWindowId, windowOrder): { survivors: Tab[], removals: Tab[], survivorByRemovedId: Map<number, number> }`

- [ ] **Step 1: Add the Node project metadata**

Create this dependency and script shape in `package.json`:

```json
{
  "name": "simple-tab-manager",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test",
    "build": "node scripts/build.mjs",
    "verify": "npm test && npm run build && node scripts/verify-build.mjs"
  },
  "devDependencies": {
    "@fontsource/ibm-plex-sans": "5.3.0",
    "sharp": "0.35.4"
  }
}
```

Add `node_modules/`, `dist/`, `.worktrees/`, and `graphify-out/` to `.gitignore`, then run `npm install` to create `package-lock.json`.

- [ ] **Step 2: Write failing rule tests**

Create `test/tab-rules.test.js` with explicit fixtures and assertions:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseDuplicateSurvivors,
  domainSortKey,
  duplicateKey,
  isDuplicateEligible,
  isSplitViewTab,
  sortPinnedSections,
} from "../src/core/tab-rules.js";

const tab = (id, url, extra = {}) => ({
  id,
  url,
  title: `Tab ${id}`,
  windowId: 1,
  index: id,
  pinned: false,
  active: false,
  status: "complete",
  ...extra,
});

test("a pinned URL copy survives an earlier unpinned copy", () => {
  const result = chooseDuplicateSurvivors(
    [tab(1, "https://example.com/"), tab(2, "https://example.com/", { pinned: true, windowId: 2 })],
    1,
    new Map([[1, 0], [2, 1]]),
  );
  assert.deepEqual(result.removals.map(({ id }) => id), [1]);
  assert.equal(result.survivorByRemovedId.get(1), 2);
});

test("the target-window copy wins when pinned state matches", () => {
  const result = chooseDuplicateSurvivors(
    [tab(4, "https://same.test/", { windowId: 2 }), tab(3, "https://same.test/", { windowId: 1 })],
    1,
    new Map([[2, 0], [1, 1]]),
  );
  assert.deepEqual(result.removals.map(({ id }) => id), [4]);
});

test("loading, pending, empty, and split-view tabs cannot be duplicate removals", () => {
  assert.equal(isDuplicateEligible(tab(1, "https://a.test/", { status: "loading" })), false);
  assert.equal(isDuplicateEligible(tab(2, "https://a.test/", { pendingUrl: "https://b.test/" })), false);
  assert.equal(isDuplicateEligible(tab(3, "")), false);
  assert.equal(isDuplicateEligible(tab(4, "https://a.test/", { splitViewId: 9 })), false);
  assert.equal(isSplitViewTab(tab(5, "https://a.test/", { splitViewId: -1 })), false);
});

test("Firefox containers are separate duplicate namespaces", () => {
  assert.notEqual(
    duplicateKey(tab(1, "https://mail.test/", { cookieStoreId: "firefox-container-1" })),
    duplicateKey(tab(2, "https://mail.test/", { cookieStoreId: "firefox-container-2" })),
  );
});

test("reversed host labels keep related base domains together", () => {
  const tabs = [
    tab(1, "https://mail.google.com/"),
    tab(2, "https://docs.microsoft.com/"),
    tab(3, "https://docs.google.com/"),
  ];
  assert.deepEqual(sortPinnedSections(tabs).map(({ id }) => id), [3, 1, 2]);
  assert.equal(domainSortKey(tab(4, "https://example.com./")).reversedHost, "com.example");
  assert.equal(domainSortKey(tab(5, "https://192.168.1.20/")).reversedHost, "192.168.1.20");
});

test("pinned and unpinned tabs sort independently", () => {
  const ordered = sortPinnedSections([
    tab(1, "https://z.test/", { pinned: true }),
    tab(2, "https://a.test/"),
    tab(3, "https://a.test/", { pinned: true }),
    tab(4, "https://z.test/"),
  ]);
  assert.deepEqual(ordered.map(({ id }) => id), [3, 1, 2, 4]);
});
```

- [ ] **Step 3: Run the rule tests and confirm the expected failure**

Run: `npm test -- test/tab-rules.test.js`

Expected: FAIL because `src/core/tab-rules.js` does not exist.

- [ ] **Step 4: Implement the pure rules**

Implement `src/core/tab-rules.js` with these exact decision rules:

```js
const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

export const hasUsableId = (tab) => Number.isInteger(tab?.id) && tab.id >= 0;

export const isSplitViewTab = (tab) =>
  Number.isInteger(tab?.splitViewId) && tab.splitViewId >= 0;

export const isDuplicateEligible = (tab) =>
  hasUsableId(tab) &&
  tab.status !== "loading" &&
  !tab.pendingUrl &&
  typeof tab.url === "string" &&
  tab.url.length > 0 &&
  !isSplitViewTab(tab);

export function duplicateKey(tab) {
  if (!isDuplicateEligible(tab)) return null;
  return `${tab.cookieStoreId ?? "default"}\u0000${tab.url}`;
}

function isIpHost(host) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

export function domainSortKey(tab) {
  const effective = tab.pendingUrl || tab.url || "";
  try {
    const parsed = new URL(effective);
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    return {
      category: host ? 0 : 1,
      reversedHost: host && !isIpHost(host) ? host.split(".").reverse().join(".") : host,
      host,
      url: effective,
      title: tab.title || "",
      index: tab.index ?? Number.MAX_SAFE_INTEGER,
    };
  } catch {
    return { category: 2, reversedHost: "", host: "", url: effective, title: tab.title || "", index: tab.index ?? Number.MAX_SAFE_INTEGER };
  }
}

export function compareTabsByDomain(a, b) {
  const left = domainSortKey(a);
  const right = domainSortKey(b);
  return left.category - right.category ||
    collator.compare(left.reversedHost, right.reversedHost) ||
    collator.compare(left.host, right.host) ||
    collator.compare(left.url, right.url) ||
    collator.compare(left.title, right.title) ||
    left.index - right.index;
}

export function sortPinnedSections(tabs) {
  return [
    ...tabs.filter((tab) => tab.pinned).sort(compareTabsByDomain),
    ...tabs.filter((tab) => !tab.pinned).sort(compareTabsByDomain),
  ];
}
```

Implement `chooseDuplicateSurvivors` by grouping eligible tabs by `duplicateKey`, sorting each group by pinned first, target window first, captured window order, then tab index, and returning stable survivor/removal collections plus `survivorByRemovedId`.

```js
export function chooseDuplicateSurvivors(tabs, targetWindowId, windowOrder) {
  const groups = new Map();
  for (const tab of tabs) {
    const key = duplicateKey(tab);
    if (key === null) continue;
    const group = groups.get(key) || [];
    group.push(tab);
    groups.set(key, group);
  }

  const removedIds = new Set();
  const survivorByRemovedId = new Map();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      Number(b.windowId === targetWindowId) - Number(a.windowId === targetWindowId) ||
      (windowOrder.get(a.windowId) ?? Number.MAX_SAFE_INTEGER) - (windowOrder.get(b.windowId) ?? Number.MAX_SAFE_INTEGER) ||
      a.index - b.index,
    );
    const survivor = group[0];
    for (const duplicate of group.slice(1)) {
      removedIds.add(duplicate.id);
      survivorByRemovedId.set(duplicate.id, survivor.id);
    }
  }

  return {
    survivors: tabs.filter(({ id }) => !removedIds.has(id)),
    removals: tabs.filter(({ id }) => removedIds.has(id)),
    survivorByRemovedId,
  };
}
```

- [ ] **Step 5: Run the rule tests**

Run: `npm test -- test/tab-rules.test.js`

Expected: all rule tests PASS with no warnings.

- [ ] **Step 6: Commit the rule layer**

```bash
git add .gitignore package.json package-lock.json src/core/tab-rules.js test/tab-rules.test.js
git commit -m "feat: add deterministic tab rules"
```

---

### Task 2: Scope capture and operation planning

**Files:**
- Create: `src/core/tab-planner.js`
- Create: `test/tab-planner.test.js`

**Interfaces:**
- Consumes: pure rules from `src/core/tab-rules.js`
- Produces: `captureScope(windows, targetWindowId): Scope`
- Produces: `planConsolidation(tabs, targetWindowId): { groupedIds: number[], pinnedIds: number[], unpinnedIds: number[], skippedSplitIds: number[] }`
- Produces: `planDuplicateRemoval(tabs, scope): DuplicatePlan`
- Produces: `planSort(tabs): { orderedIds: number[], groupedIds: number[], skippedForSplitView: boolean }`

- [ ] **Step 1: Write failing planner tests**

Use fixtures covering normal versus popup windows, private-state matching, new tabs outside captured IDs, groups, split views, and the target-window protection case:

```js
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
```

- [ ] **Step 2: Run the planner tests and confirm the expected failure**

Run: `npm test -- test/tab-planner.test.js`

Expected: FAIL because `src/core/tab-planner.js` does not exist.

- [ ] **Step 3: Implement planner functions**

`captureScope` must return this stable shape:

```js
{
  targetWindowId,
  incognito,
  activeTabId,
  windowIds,
  tabIds,
  windowOrder: new Map(windowIds.map((id, index) => [id, index])),
}
```

`planConsolidation` excludes target-window and split-view tabs, preserves captured order, and returns grouped IDs plus pinned and unpinned move arrays. `planDuplicateRemoval` delegates survivor choice to `chooseDuplicateSurvivors` and sets `protectTargetWithTabId` only when removal would leave the target with zero tabs. `planSort` returns no order when any tab has a split view; otherwise it returns grouped IDs and `sortPinnedSections(tabs).map(tab => tab.id)`.

- [ ] **Step 4: Run rule and planner tests**

Run: `npm test -- test/tab-rules.test.js test/tab-planner.test.js`

Expected: all tests PASS.

- [ ] **Step 5: Commit the planner**

```bash
git add src/core/tab-planner.js test/tab-planner.test.js
git commit -m "feat: plan safe tab operations"
```

---

### Task 3: Browser adapter, batching, retries, and leases

**Files:**
- Create: `src/browser-adapter.js`
- Create: `test/browser-adapter.test.js`

**Interfaces:**
- Consumes: a `browser` or `chrome` WebExtensions API object
- Produces: `createBrowserAdapter(api, options): BrowserAdapter`
- `BrowserAdapter.capture(targetWindowId): Promise<ScopeSnapshot>`
- `BrowserAdapter.readCaptured(scope): Promise<{ tabs: Tab[], changedIds: number[] }>`
- `BrowserAdapter.ungroup(tabIds): Promise<number>`
- `BrowserAdapter.move(tabIds, properties): Promise<number[]>`
- `BrowserAdapter.remove(tabIds): Promise<{ removedIds: number[], retainedIds: number[] }>`
- `BrowserAdapter.activate(tabId): Promise<void>`
- `BrowserAdapter.readOperationState(incognito): Promise<object | null>`
- `BrowserAdapter.writeOperationState(incognito, state): Promise<void>`

- [ ] **Step 1: Write failing adapter tests**

Build a minimal fake API inside the test and assert batching, normalized single-object responses, empty move detection, five transient retries, permanent failure, live-tab filtering, retained removals, and separate session keys:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserAdapter } from "../src/browser-adapter.js";

test("move retries a temporary drag failure and normalizes one returned tab", async () => {
  let attempts = 0;
  const api = {
    tabs: {
      move: async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("Tabs cannot be edited right now (user may be dragging a tab).");
        return { id: 7 };
      },
    },
    storage: { session: { get: async () => ({}), set: async () => {} } },
  };
  const adapter = createBrowserAdapter(api, { delay: async () => {} });
  assert.deepEqual(await adapter.move([7], { windowId: 1, index: 0 }), [7]);
  assert.equal(attempts, 3);
});

test("move rejects a silent empty result", async () => {
  const api = {
    tabs: { move: async () => [] },
    storage: { session: { get: async () => ({}), set: async () => {} } },
  };
  const adapter = createBrowserAdapter(api);
  await assert.rejects(adapter.move([7], { windowId: 1, index: 0 }), /moved 0 of 1 tabs/);
});

test("operation state uses separate regular and private keys", async () => {
  const writes = [];
  const api = {
    tabs: {},
    storage: { session: { get: async () => ({}), set: async (value) => writes.push(value) } },
  };
  const adapter = createBrowserAdapter(api);
  await adapter.writeOperationState(false, { status: "running" });
  await adapter.writeOperationState(true, { status: "running" });
  assert.deepEqual(Object.keys(writes[0]), ["operation_regular"]);
  assert.deepEqual(Object.keys(writes[1]), ["operation_private"]);
});
```

- [ ] **Step 2: Run adapter tests and confirm the expected failure**

Run: `npm test -- test/browser-adapter.test.js`

Expected: FAIL because `src/browser-adapter.js` does not exist.

- [ ] **Step 3: Implement the adapter**

Use these constants and helpers:

```js
const BATCH_SIZE = 50;
const MAX_MOVE_ATTEMPTS = 5;
const MOVE_RETRY_DELAY_MS = 50;

export function chunkIds(ids, size = BATCH_SIZE) {
  const chunks = [];
  for (let index = 0; index < ids.length; index += size) chunks.push(ids.slice(index, index + size));
  return chunks;
}

const normalizeMovedTabs = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
const isTransientMoveError = (error) => String(error?.message || error).includes("Tabs cannot be edited right now");
```

`capture` must call `windows.getAll({ populate: true, windowTypes: ["normal"] })`, verify the target exists, and delegate to `captureScope`. `readCaptured` calls `tabs.get` for captured IDs, treats missing/replaced IDs as changed, and rejects tabs whose current window is outside `scope.windowIds` or whose private state differs. `move`, `ungroup`, and `remove` process at most 50 IDs per API call and refresh operation state after each batch through a callback supplied in adapter options. `remove` re-reads requested IDs to distinguish removed from retained tabs. If `storage.session` is unavailable, use an in-memory storage-area shim with the same `get` and `set` signatures.

- [ ] **Step 4: Run adapter tests**

Run: `npm test -- test/browser-adapter.test.js`

Expected: all adapter tests PASS.

- [ ] **Step 5: Commit the adapter**

```bash
git add src/browser-adapter.js test/browser-adapter.test.js
git commit -m "feat: add cross-browser tab adapter"
```

---

### Task 4: Operation runner and background messaging

**Files:**
- Create: `src/tab-manager.js`
- Create: `src/background.js`
- Create: `test/support/fake-browser.js`
- Create: `test/tab-manager.test.js`

**Interfaces:**
- Consumes: `createBrowserAdapter`, planner functions, and a WebExtensions API object
- Produces: `createTabManager(api, options): { run(action, targetWindowId): Promise<OperationResult>, getStatus(targetWindowId): Promise<OperationState | null> }`
- Produces message actions: `organize`, `consolidate`, `sort`, `deduplicate`, `getStatus`
- Produces `OperationResult`: `{ action, status, moved, removed, ungrouped, skippedSplit, changed, retained, failed, sortingSkipped, message }`

- [ ] **Step 1: Create the fake browser and failing integration tests**

`test/support/fake-browser.js` must keep mutable windows, tabs, session storage, call records, and injectable failures. Its methods mirror only APIs used by production: `windows.getAll`, `windows.get`, `tabs.get`, `tabs.move`, `tabs.remove`, `tabs.ungroup`, `tabs.update`, `storage.session.get`, and `storage.session.set`.

Write integration tests with these assertions:

```js
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
```

The same test file must contain separately named `test(...)` cases with direct final-state and API-call assertions for a tab that navigates before removal, a tab replaced before movement, new tabs ignored after capture, close prompts retaining duplicates, group ungrouping, more than 50 tabs, partial failure counts, private/regular concurrent leases, stale leases after a simulated restart, and a second request receiving a busy result.

- [ ] **Step 2: Run integration tests and confirm the expected failure**

Run: `npm test -- test/tab-manager.test.js`

Expected: FAIL because the operation runner and fake browser do not exist.

- [ ] **Step 3: Implement the operation runner**

Use an explicit action map:

```js
const actions = new Set(["organize", "consolidate", "sort", "deduplicate"]);

export function createEmptyResult(action) {
  return {
    action,
    status: "running",
    moved: 0,
    removed: 0,
    ungrouped: 0,
    skippedSplit: 0,
    changed: 0,
    retained: 0,
    failed: 0,
    sortingSkipped: false,
    message: "",
  };
}
```

`run` validates the action and target, captures scope once, obtains the matching regular/private lease, and executes only captured IDs. Implement the four actions as combinations of private phase functions:

```js
const phaseMap = {
  consolidate: [ungroupPhase, consolidatePhase],
  deduplicate: [deduplicatePhase],
  sort: [ungroupPhase, sortPhase],
  organize: [ungroupPhase, consolidatePhase, deduplicatePhase, sortPhase],
};
```

Every phase calls `adapter.readCaptured(scope)` first. `deduplicatePhase` re-checks duplicate eligibility and URL/container identity immediately before each removal batch. `sortPhase` returns without moves when the target has a split view. After phases, activate the original target active tab if it survives, otherwise its survivor. Re-read final tabs to calculate actual counts. Mark the lease `complete`, `partial`, `failed`, or `interrupted` with a plain-English message and timestamps. An in-memory map keyed by private state prevents overlap while the background context remains alive.

- [ ] **Step 4: Implement background messaging**

`src/background.js` must select the API and keep the message channel open:

```js
import { createTabManager } from "./tab-manager.js";

const api = globalThis.browser ?? globalThis.chrome;
const manager = createTabManager(api);

api.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (!request || typeof request.action !== "string") return false;
  const operation = request.action === "getStatus"
    ? manager.getStatus(request.targetWindowId)
    : manager.run(request.action, request.targetWindowId);
  operation.then(
    (result) => sendResponse({ ok: true, result }),
    (error) => sendResponse({ ok: false, error: error?.message || String(error) }),
  );
  return true;
});
```

- [ ] **Step 5: Run all core and integration tests**

Run: `npm test`

Expected: all tests PASS with no warnings or unhandled rejections.

- [ ] **Step 6: Commit the operation layer**

```bash
git add src/background.js src/tab-manager.js test/support/fake-browser.js test/tab-manager.test.js
git commit -m "feat: run safe tab organization actions"
```

---

### Task 5: Popup, themes, and modern iconography

**Files:**
- Create: `src/popup/popup.html`
- Create: `src/popup/popup.css`
- Create: `src/popup/popup.js`
- Create: `src/popup/popup-state.js`
- Create: `src/assets/icon.svg`
- Create: `test/popup-state.test.js`
- Create: `test/popup-static.test.js`

**Interfaces:**
- Produces: `resolveTheme(preference, systemDark): "light" | "dark"`
- Produces: `nextTheme(preference): "system" | "light" | "dark"`
- Produces: `formatOperationResult(result): string`
- Popup messages: `{ action, targetWindowId }`

- [ ] **Step 1: Write failing popup-state and static-structure tests**

```js
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
```

In `test/popup-static.test.js`, read the HTML and CSS as text and assert the four action values, one `role="status"` region with `aria-live="polite"`, visible labels for every SVG icon, no `http://` or `https://` assets, `prefers-reduced-motion`, `prefers-color-scheme`, `forced-colors`, `:focus-visible`, and local IBM Plex font declarations.

- [ ] **Step 2: Run popup tests and confirm the expected failure**

Run: `npm test -- test/popup-state.test.js test/popup-static.test.js`

Expected: FAIL because the popup files do not exist.

- [ ] **Step 3: Implement popup state helpers**

Implement the exact three functions with sentence-case result phrases, singular/plural handling, and a useful fallback of `No tab changes were needed`.

- [ ] **Step 4: Build the popup markup and script**

The HTML contains a header with the tab-stack brand and theme button, the line `Bring order to this window`, a filled `data-action="organize"` button, three list-row buttons for `consolidate`, `sort`, and `deduplicate`, and one status footer. Use inline 24-pixel SVGs with `stroke="currentColor"`, `stroke-width="1.75"`, `stroke-linecap="round"`, and `stroke-linejoin="round"`. Use no inline JavaScript and no remote assets.

`popup.js` must:

1. Select `globalThis.browser ?? globalThis.chrome`.
2. Get the popup's current window ID before sending any action.
3. Read `themePreference` from `storage.local` and apply `data-theme` to the document root.
4. Cycle and persist System, Light, and Dark from the theme button.
5. Listen for system-theme changes only when preference is System.
6. Disable all action buttons while a request is pending.
7. Send `{ action, targetWindowId }` and render `formatOperationResult`.
8. Query `getStatus` when opened and restore running or recent state.
9. Restore buttons and show a direct error if messaging fails.

- [ ] **Step 5: Implement the visual system and app mark**

Use the exact light/dark tokens from the spec. Bundle IBM Plex Sans regular and semibold through local `@font-face` rules pointing to `../assets/fonts/ibm-plex-sans-latin-400-normal.woff2` and `ibm-plex-sans-latin-600-normal.woff2`. Use one 360-pixel surface, a blue full-width primary action, quiet divider-separated secondary rows, 10-pixel control corners, and the stacked-tab motif only in the brand and primary action. Add pressed, disabled, focus-visible, reduced-motion, forced-colors, and 200% text-scaling behavior.

Create `src/assets/icon.svg` as a transparent 128-by-128 geometric mark with three offset tab outlines and one filled blue foreground tab. Use a dark navy outer stroke plus a white inner keyline so it remains visible on both toolbar themes. Keep the silhouette readable when rendered to 16 pixels.

- [ ] **Step 6: Run popup tests**

Run: `npm test -- test/popup-state.test.js test/popup-static.test.js`

Expected: all popup tests PASS.

- [ ] **Step 7: Serve and inspect the popup visually**

Run: `python3 -m http.server 4173 --directory src` and open `http://127.0.0.1:4173/popup/popup.html` in a browser. Capture light and dark screenshots at the popup's natural width. Check icon alignment, 16-pixel toolbar mark legibility, 200% text scaling, keyboard focus, and contrast. Fix CSS or SVG defects, rerun popup tests, and retain the screenshots under `tmp/visual-qa/` only; do not commit them.

- [ ] **Step 8: Commit the popup**

```bash
git add src/popup src/assets/icon.svg test/popup-state.test.js test/popup-static.test.js
git commit -m "feat: add accessible themed popup"
```

---

### Task 6: Browser manifests, reproducible builds, and documentation

**Files:**
- Create: `manifests/chrome.json`
- Create: `manifests/firefox.json`
- Create: `scripts/build.mjs`
- Create: `scripts/verify-build.mjs`
- Create: `LICENSES/IBM-Plex-Sans.txt`
- Create: `test/build.test.js`
- Modify: `README.md`
- Delete: `background.js`
- Delete: `manifest.json`
- Delete: `popup.html`
- Delete: `popup.js`
- Delete: `popup.css`
- Delete: `styles.css`
- Delete: `icons/icon16.png`
- Delete: `icons/icon32.png`
- Delete: `icons/icon48.png`
- Delete: `icons/icon128.png`
- Delete: `chrome-simple-tab-manager.zip`

**Interfaces:**
- Produces: `npm run build` with `dist/chrome/` and `dist/firefox/`
- Produces: `npm run verify` as the full local verification command

- [ ] **Step 1: Write failing build tests**

`test/build.test.js` runs `npm run build`, parses both generated manifests, and checks:

```js
assert.equal(chrome.manifest_version, 3);
assert.equal(chrome.background.service_worker, "background.js");
assert.deepEqual(chrome.permissions, ["tabs", "storage"]);
assert.deepEqual(firefox.background.scripts, ["background.js"]);
assert.deepEqual(firefox.browser_specific_settings.gecko.data_collection_permissions.required, ["none"]);
assert.equal(firefox.browser_specific_settings.gecko.id, "{a69d42cb-0283-4e28-9a86-47e4274dc993}");
```

Also assert that every manifest-referenced file exists, both packages contain only local asset references, background modules resolve, popup modules resolve, IBM Plex license and fonts exist, and 16/32/48/128 PNG icons have matching pixel dimensions.

- [ ] **Step 2: Run the build test and confirm the expected failure**

Run: `npm test -- test/build.test.js`

Expected: FAIL because the manifests and build script do not exist.

- [ ] **Step 3: Add browser manifests**

Both manifests use name `Simple Tab Manager`, version `2.0.0`, the description `Bring tabs together, remove duplicate URLs, and sort them by domain.`, `action.default_popup: "popup/popup.html"`, and PNG icons at 16, 32, 48, and 128 pixels. Chrome uses `background: { "service_worker": "background.js", "type": "module" }`. Firefox uses `background: { "scripts": ["background.js"], "type": "module" }` plus the exact Gecko ID and `data_collection_permissions.required: ["none"]`.

- [ ] **Step 4: Implement the build and verification scripts**

`scripts/build.mjs` must remove only `dist/chrome` and `dist/firefox`, recreate them, copy shared JavaScript and popup files, copy the IBM Plex 400 and 600 Latin WOFF2 files from `node_modules/@fontsource/ibm-plex-sans/files/`, copy the OFL license, write each target manifest as `manifest.json`, and render `src/assets/icon.svg` through `sharp` into the four exact PNG sizes.

`scripts/verify-build.mjs` must parse both manifests; scan generated `.html`, `.css`, `.js`, `.json`, and `.svg` files for remote `http://` or `https://` asset references; verify every manifest-referenced path; and verify icon metadata through `sharp`. License and plain-text documentation files are not asset sources and are excluded from the URL scan.

- [ ] **Step 5: Replace the old project documentation and files**

Rewrite `README.md` with the four actions, pinned duplicate policy, split-view and group behavior, privacy statement, Node.js 20 setup, `npm test`, `npm run build`, Chrome unpacked installation from `dist/chrome`, Firefox temporary installation from `dist/firefox/manifest.json`, and release-build notes. Remove the superseded root implementation, old PNGs, and old zip listed in this task.

- [ ] **Step 6: Run the full verification**

Run: `npm run verify`

Expected: all tests PASS, both builds complete, every manifest and asset check passes, and there are no warnings or unhandled rejections.

- [ ] **Step 7: Inspect both built packages**

Load `dist/chrome` as an unpacked Chrome extension and `dist/firefox/manifest.json` as a temporary Firefox add-on. Run all four actions with pinned/unpinned duplicates, multiple normal windows, a loading tab, a grouped tab, and a split view where supported. Check System, Light, and Dark themes and all four toolbar icon sizes. Record any browser-only defect as a failing automated test before fixing it.

- [ ] **Step 8: Commit the complete build**

```bash
git add manifests scripts LICENSES README.md test/build.test.js
git add -u background.js manifest.json popup.html popup.js popup.css styles.css icons chrome-simple-tab-manager.zip
git commit -m "build: package Chrome and Firefox extensions"
```

---

### Task 7: Final requirement audit

**Files:**
- Modify only files required by failures found in this audit

**Interfaces:**
- Consumes: the approved spec and all implemented files
- Produces: verified Chrome and Firefox distribution folders

- [ ] **Step 1: Run focused tests for every product rule**

Run:

```bash
npm test -- test/tab-rules.test.js test/tab-planner.test.js test/browser-adapter.test.js test/tab-manager.test.js test/popup-state.test.js test/popup-static.test.js test/build.test.js
```

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Run the complete verification from a clean build**

Run:

```bash
npm run verify
git diff --check
```

Expected: tests, builds, manifest checks, asset checks, and whitespace checks all PASS.

- [ ] **Step 3: Compare implementation against the spec**

Confirm every Supported Browsers, Tab Behavior, Architecture, Popup Design, Permissions and Privacy, Testing and Verification, and Out of Scope statement has either implementation evidence or a named automated test. Fix each gap through a failing test followed by the smallest implementation change.

- [ ] **Step 4: Commit audit fixes if any exist**

```bash
git add src manifests scripts test README.md LICENSES package.json package-lock.json .gitignore
git commit -m "fix: close tab manager verification gaps"
```

Skip this commit only when `git status --short` shows no tracked changes after the audit.
