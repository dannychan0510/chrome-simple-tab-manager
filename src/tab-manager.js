import { BATCH_SIZE, createBrowserAdapter } from "./browser-adapter.js";
import { planConsolidation, planDuplicateRemoval, planSort } from "./core/tab-planner.js";
import { duplicateKey, isDuplicateEligible, isSplitViewTab } from "./core/tab-rules.js";

const actions = new Set(["organize", "consolidate", "sort", "deduplicate"]);
const STALE_LEASE_MS = 10 * 60 * 1000;
const SKIPPED_SPLIT_IDS = Symbol("skippedSplitIds");
const MOVED_IDS = Symbol("movedIds");

export function createEmptyResult(action) {
  const result = { action, status: "running", moved: 0, removed: 0, ungrouped: 0, unpinned: 0, skippedSplit: 0, changed: 0, retained: 0, failed: 0, sortingSkipped: false, message: "" };
  Object.defineProperties(result, {
    [SKIPPED_SPLIT_IDS]: { value: new Set(), enumerable: false },
    [MOVED_IDS]: { value: new Set(), enumerable: false },
  });
  return result;
}

const phrase = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

function resultMessage(result) {
  const parts = [];
  if (result.moved) parts.push(`Moved ${phrase(result.moved, "tab")}`);
  if (result.removed) parts.push(`Removed ${phrase(result.removed, "duplicate")}`);
  if (result.ungrouped) parts.push(`Ungrouped ${phrase(result.ungrouped, "tab")}`);
  if (result.unpinned) parts.push(`Unpinned ${phrase(result.unpinned, "tab")}`);
  if (result.skippedSplit) parts.push(`Skipped ${phrase(result.skippedSplit, "split-view tab")}`);
  if (result.retained) parts.push(`Retained ${phrase(result.retained, "tab")}`);
  if (result.changed) parts.push(`Changed ${phrase(result.changed, "tab")}`);
  if (result.failed) parts.push(`Failed ${phrase(result.failed, "step")}`);
  if (result.sortingSkipped && !result.skippedSplit) parts.push("Sorting skipped");
  return parts.join(" · ") || "No tab changes were needed";
}

function addSkippedSplit(result, tabs) {
  for (const tab of tabs) {
    if (result[SKIPPED_SPLIT_IDS].has(tab.id)) continue;
    result[SKIPPED_SPLIT_IDS].add(tab.id);
    result.skippedSplit += 1;
  }
}

async function moveWithCount(opAdapter, ids, properties, result, expectation = null) {
  try {
    const moved = await opAdapter.move(ids, properties, expectation);
    for (const id of moved) result[MOVED_IDS].add(id);
    result.moved = result[MOVED_IDS].size;
    return moved;
  } catch (error) {
    for (const id of error.confirmedMovedIds || []) result[MOVED_IDS].add(id);
    result.moved = result[MOVED_IDS].size;
    throw error;
  }
}

async function ungroupWithProgress(opAdapter, ids, result) {
  const count = await opAdapter.ungroup(ids);
  if (count === 0) throw new Error("Ungrouping made no progress.");
  result.ungrouped += count;
  return count;
}

export function createTabManager(api, options = {}) {
  const activeOperations = new Map();
  const clock = options.now || (() => Date.now());
  const adapter = createBrowserAdapter(api, { delay: options.delay });

  async function assertTarget(targetWindowId) {
    const window = await api.windows.get(targetWindowId, { populate: false });
    if (!window || window.type !== "normal") throw new Error("Choose a regular browser window.");
    return window;
  }

  async function ensureTarget(scope) {
    const target = await api.windows.get(scope.targetWindowId, { populate: false }).catch(() => null);
    if (!target) throw new Error("The target window closed while the operation was running.");
  }

  async function updateLease(lease, result) {
    lease.lastUpdatedAt = clock();
    lease.counts = { moved: result.moved, removed: result.removed, ungrouped: result.ungrouped, unpinned: result.unpinned, skippedSplit: result.skippedSplit, changed: result.changed, retained: result.retained, failed: result.failed };
    lease.message = result.message;
    await adapter.writeOperationState(lease.incognito, lease);
  }

  async function readPhase(opAdapter, scope, result, changedIds, intentionalRemovals) {
    const read = await opAdapter.readCaptured(scope);
    for (const id of read.changedIds) {
      if (intentionalRemovals.has(id) || changedIds.has(id)) continue;
      changedIds.add(id);
      result.changed += 1;
    }
    return read.tabs;
  }

  async function ungroupPhase(opAdapter, scope, result, changedIds, intentionalRemovals, mode) {
    const tabs = await readPhase(opAdapter, scope, result, changedIds, intentionalRemovals);
    const pending = new Set(tabs.filter((tab) => {
      if (!Number.isInteger(tab.groupId) || tab.groupId < 0 || isSplitViewTab(tab)) return false;
      if (mode === "consolidate") return tab.windowId !== scope.targetWindowId;
      if (mode === "sort") return tab.windowId === scope.targetWindowId;
      return true;
    }).map(({ id }) => id));
    let attempts = 0;
    while (pending.size) {
      const liveTabs = await readPhase(opAdapter, scope, result, changedIds, intentionalRemovals);
      const ids = liveTabs.filter((tab) => pending.has(tab.id) && Number.isInteger(tab.groupId) && tab.groupId >= 0 && !isSplitViewTab(tab) && (mode === "organize" || (mode === "consolidate" ? tab.windowId !== scope.targetWindowId : tab.windowId === scope.targetWindowId))).map(({ id }) => id).slice(0, BATCH_SIZE);
      if (!ids.length) break;
      await ensureTarget(scope);
      await ungroupWithProgress(opAdapter, ids, result);
      const after = await readPhase(opAdapter, scope, result, changedIds, intentionalRemovals);
      const stillGrouped = new Set(after.filter((tab) => ids.includes(tab.id) && Number.isInteger(tab.groupId) && tab.groupId >= 0 && !isSplitViewTab(tab)).map(({ id }) => id));
      ids.forEach((id) => { if (!stillGrouped.has(id)) pending.delete(id); });
      if (++attempts > Math.max(2, pending.size * 2)) throw new Error("Ungrouping made no progress.");
    }
  }

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

  async function deduplicatePhase(opAdapter, scope, result, changedIds, intentionalRemovals) {
    let tabs = await readPhase(opAdapter, scope, result, changedIds, intentionalRemovals);
    addSkippedSplit(result, tabs.filter(isSplitViewTab));
    let plan = planDuplicateRemoval(tabs, scope);
    if (plan.protectTargetWithTabId) {
      await ensureTarget(scope);
      const protectedTab = tabs.find((tab) => tab.id === plan.protectTargetWithTabId);
      await moveWithCount(opAdapter, [plan.protectTargetWithTabId], { windowId: scope.targetWindowId, index: -1 }, result, {
        pinnedById: new Map([[plan.protectTargetWithTabId, Boolean(protectedTab?.pinned)]]),
      });
      tabs = await readPhase(opAdapter, scope, result, changedIds, intentionalRemovals);
      addSkippedSplit(result, tabs.filter(isSplitViewTab));
      plan = planDuplicateRemoval(tabs, scope);
    }
    const plannedKeys = new Map(plan.removals.map((tab) => [tab.id, duplicateKey(tab)]));
    let pending = new Set(plan.removeIds);
    while (pending.size) {
      tabs = await readPhase(opAdapter, scope, result, changedIds, intentionalRemovals);
      addSkippedSplit(result, tabs.filter(isSplitViewTab));
      const livePlan = planDuplicateRemoval(tabs, scope);
      const liveRemovalIds = new Set(livePlan.removeIds);
      const liveRemovals = tabs.filter((tab) => pending.has(tab.id) && liveRemovalIds.has(tab.id) && isDuplicateEligible(tab) && plannedKeys.get(tab.id) === duplicateKey(tab)).map(({ id }) => id);
      if (!liveRemovals.length) break;
      const batch = liveRemovals.slice(0, BATCH_SIZE);
      await ensureTarget(scope);
      batch.forEach((id) => intentionalRemovals.add(id));
      const removed = await opAdapter.remove(batch);
      result.removed += removed.removedIds.length;
      result.retained += removed.retainedIds.length;
      batch.forEach((id) => pending.delete(id));
    }
    result.survivorByRemovedId = plan.survivorByRemovedId;
  }

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

  async function run(action, targetWindowId, preferences = {}) {
    if (!actions.has(action)) throw new Error(`Unknown action: ${action}`);
    if (!Number.isInteger(targetWindowId)) throw new Error("A target window is required.");
    const target = await assertTarget(targetWindowId);
    const keepGroups = preferences.keepGroups ?? true;
    const keepPins = preferences.keepPins ?? true;
    const incognito = Boolean(target.incognito);
    const leaseKey = incognito ? "private" : "regular";
    const existing = await adapter.readOperationState(incognito);
    const now = clock();
    if (activeOperations.has(leaseKey) || (existing?.status === "running" && now - (existing.lastUpdatedAt || existing.startedAt || 0) < STALE_LEASE_MS)) {
      return { ...createEmptyResult(action), status: "busy", message: "Another tab operation is already running." };
    }
    if (existing?.status === "running") await adapter.writeOperationState(incognito, { ...existing, status: "interrupted", finishedAt: now, message: "The previous tab operation was interrupted." });
    const result = createEmptyResult(action);
    const lease = { status: "running", action, targetWindowId, incognito, startedAt: now, lastUpdatedAt: now, counts: {}, message: "" };
    activeOperations.set(leaseKey, lease);
    await adapter.writeOperationState(incognito, lease);
    const opAdapter = createBrowserAdapter(api, {
      delay: options.delay,
      verifyMove: async (ids, properties, expectation) => {
        const target = await api.windows.get(properties.windowId, { populate: true }).catch(() => null);
        const liveTabs = target?.tabs?.slice().sort((a, b) => a.index - b.index) || [];
        const confirmed = ids.filter((id) => {
          const tab = liveTabs.find((candidate) => candidate.id === id);
          if (!tab || tab.windowId !== properties.windowId) return false;
          if (expectation?.pinnedById?.has(id) && Boolean(tab.pinned) !== expectation.pinnedById.get(id)) return false;
          if (expectation?.section === "pinned" && !tab.pinned) return false;
          if (expectation?.section === "unpinned" && tab.pinned) return false;
          const position = liveTabs.findIndex((candidate) => candidate.id === id);
          const pinnedPositions = liveTabs.map((candidate, index) => candidate.pinned ? index : -1).filter((index) => index >= 0);
          const lastPinnedBoundary = pinnedPositions.length ? Math.max(...pinnedPositions) + 1 : 0;
          const firstUnpinned = liveTabs.findIndex((candidate) => !candidate.pinned);
          if (expectation?.section === "pinned" && firstUnpinned >= 0 && position >= firstUnpinned) return false;
          if (expectation?.section === "unpinned" && position < lastPinnedBoundary) return false;
          return true;
        });
        let valid = confirmed.length === ids.length;
        if (expectation?.orderIds) {
          const positions = expectation.orderIds.map((id) => liveTabs.findIndex((tab) => tab.id === id));
          if (positions.some((position) => position < 0) || positions.some((position, index) => index > 0 && position <= positions[index - 1])) valid = false;
          const anchors = expectation.anchorIds?.map((id) => liveTabs.findIndex((tab) => tab.id === id)).filter((position) => position >= 0) || [];
          if (anchors.length && (expectation.place === "before" ? positions.some((position) => position >= Math.min(...anchors)) : positions.some((position) => position <= Math.max(...anchors)))) valid = false;
        }
        return { confirmed, valid };
      },
      onBatch: async () => {
        lease.lastUpdatedAt = clock();
        lease.counts = { moved: result.moved, removed: result.removed, ungrouped: result.ungrouped, unpinned: result.unpinned, skippedSplit: result.skippedSplit, changed: result.changed, retained: result.retained, failed: result.failed };
        lease.message = result.message;
        await adapter.writeOperationState(lease.incognito, lease);
      },
    });
    let scope;
    try {
      scope = await adapter.capture(targetWindowId);
      const initialActiveId = scope.activeTabId;
      const changedIds = new Set();
      const intentionalRemovals = new Set();
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
      for (const phase of phaseMap[action]) {
        if (options.beforePhase) await options.beforePhase(phase.name);
        const currentWindow = await api.windows.get(targetWindowId, { populate: false }).catch(() => null);
        if (!currentWindow) throw new Error("The target window closed while the operation was running.");
        await phase.run(opAdapter, scope, result, changedIds, intentionalRemovals);
        await updateLease(lease, result);
      }
      const finalWindow = await api.windows.get(targetWindowId, { populate: false }).catch(() => null);
      if (!finalWindow) throw new Error("The target window closed before the operation could finish.");
      const finalRead = await opAdapter.readCaptured(scope);
      for (const id of finalRead.changedIds) if (!intentionalRemovals.has(id) && !changedIds.has(id)) { changedIds.add(id); result.changed += 1; }
      const finalIds = new Set(finalRead.tabs.map(({ id }) => id));
      const survivor = result.survivorByRemovedId?.get(initialActiveId);
      const activateId = finalIds.has(initialActiveId) ? initialActiveId : finalIds.has(survivor) ? survivor : null;
      if (activateId) await opAdapter.activate(activateId);
      result.status = result.failed ? "partial" : "complete";
      result.message = resultMessage(result);
      lease.status = result.status;
      lease.finishedAt = clock();
      await updateLease(lease, result);
      return result;
    } catch (error) {
      result.failed += 1;
      result.status = result.moved || result.removed || result.ungrouped ? "partial" : "failed";
      result.message = `${resultMessage(result)} · ${error?.message || String(error)}`;
      lease.status = result.status;
      lease.finishedAt = clock();
      lease.error = error?.message || String(error);
      await updateLease(lease, result);
      return result;
    } finally {
      activeOperations.delete(leaseKey);
    }
  }

  async function getStatus(targetWindowId) {
    try {
      const target = await assertTarget(targetWindowId);
      const incognito = Boolean(target.incognito);
      const key = incognito ? "private" : "regular";
      const state = await adapter.readOperationState(incognito);
      if (state?.status === "running" && !activeOperations.has(key) && clock() - (state.lastUpdatedAt || state.startedAt || 0) >= STALE_LEASE_MS) {
        const interrupted = { ...state, status: "interrupted", finishedAt: clock(), message: "The previous tab operation was interrupted." };
        await adapter.writeOperationState(incognito, interrupted);
        return interrupted;
      }
      return state;
    } catch { return null; }
  }

  return { run, getStatus };
}
