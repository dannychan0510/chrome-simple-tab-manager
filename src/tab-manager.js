import { createBrowserAdapter } from "./browser-adapter.js";
import { planConsolidation, planDuplicateRemoval, planSort } from "./core/tab-planner.js";
import { isDuplicateEligible, isSplitViewTab } from "./core/tab-rules.js";

const actions = new Set(["organize", "consolidate", "sort", "deduplicate"]);
const STALE_LEASE_MS = 10 * 60 * 1000;

export function createEmptyResult(action) {
  return { action, status: "running", moved: 0, removed: 0, ungrouped: 0, skippedSplit: 0, changed: 0, retained: 0, failed: 0, sortingSkipped: false, message: "" };
}

const phrase = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

function resultMessage(result) {
  const parts = [];
  if (result.moved) parts.push(`Moved ${phrase(result.moved, "tab")}`);
  if (result.removed) parts.push(`Removed ${phrase(result.removed, "duplicate")}`);
  if (result.ungrouped) parts.push(`Ungrouped ${phrase(result.ungrouped, "tab")}`);
  if (result.skippedSplit) parts.push(`Skipped ${phrase(result.skippedSplit, "split-view tab")}`);
  if (result.retained) parts.push(`Retained ${phrase(result.retained, "tab")}`);
  if (result.changed) parts.push(`Changed ${phrase(result.changed, "tab")}`);
  if (result.failed) parts.push(`Failed ${phrase(result.failed, "step")}`);
  if (result.sortingSkipped && !result.skippedSplit) parts.push("Sorting skipped");
  return parts.join(" · ") || "No tab changes were needed";
}

export function createTabManager(api, options = {}) {
  const activeOperations = new Map();
  let currentLease = null;
  const adapter = createBrowserAdapter(api, {
    delay: options.delay,
    onBatch: async () => {
      if (!currentLease) return;
      currentLease.lastUpdatedAt = Date.now();
      await adapter.writeOperationState(currentLease.incognito, currentLease);
    },
  });

  async function assertTarget(targetWindowId) {
    const window = await api.windows.get(targetWindowId, { populate: true });
    if (!window || window.type !== "normal") throw new Error("Choose a regular browser window.");
    return window;
  }

  async function updateLease(lease, result) {
    lease.lastUpdatedAt = Date.now();
    lease.counts = { moved: result.moved, removed: result.removed, ungrouped: result.ungrouped, skippedSplit: result.skippedSplit, changed: result.changed, retained: result.retained, failed: result.failed };
    currentLease = lease;
    await adapter.writeOperationState(lease.incognito, lease);
  }

  async function readPhase(scope, result) {
    const read = await adapter.readCaptured(scope);
    result.changed += read.changedIds.length;
    return read.tabs;
  }

  async function ungroupPhase(scope, result) {
    const tabs = await readPhase(scope, result);
    const ids = tabs.filter((tab) => Number.isInteger(tab.groupId) && tab.groupId >= 0).map(({ id }) => id);
    if (ids.length) result.ungrouped += await adapter.ungroup(ids);
  }

  async function consolidatePhase(scope, result) {
    const tabs = await readPhase(scope, result);
    const plan = planConsolidation(tabs, scope.targetWindowId);
    result.skippedSplit += plan.skippedSplitIds.length;
    if (plan.pinnedIds.length) result.moved += (await adapter.move(plan.pinnedIds, { windowId: scope.targetWindowId, index: 0 })).length;
    if (plan.unpinnedIds.length) result.moved += (await adapter.move(plan.unpinnedIds, { windowId: scope.targetWindowId, index: -1 })).length;
  }

  async function deduplicatePhase(scope, result) {
    let tabs = await readPhase(scope, result);
    let plan = planDuplicateRemoval(tabs, scope);
    if (plan.protectTargetWithTabId) {
      result.moved += (await adapter.move([plan.protectTargetWithTabId], { windowId: scope.targetWindowId, index: -1 })).length;
      tabs = await readPhase(scope, result);
      plan = planDuplicateRemoval(tabs, scope);
    }
    const liveRemovals = plan.removeIds.filter((id) => {
      const tab = tabs.find((candidate) => candidate.id === id);
      return tab && isDuplicateEligible(tab);
    });
    if (liveRemovals.length) {
      const removed = await adapter.remove(liveRemovals);
      result.removed += removed.removedIds.length;
      result.retained += removed.retainedIds.length;
    }
    result.survivorByRemovedId = plan.survivorByRemovedId;
  }

  async function sortPhase(scope, result) {
    const tabs = (await readPhase(scope, result)).filter((tab) => tab.windowId === scope.targetWindowId);
    const plan = planSort(tabs);
    result.skippedSplit += tabs.filter(isSplitViewTab).length;
    if (plan.skippedForSplitView) { result.sortingSkipped = true; return; }
    const currentIds = tabs.slice().sort((a, b) => a.index - b.index).map(({ id }) => id);
    for (const [index, id] of plan.orderedIds.entries()) {
      if (currentIds[index] === id) continue;
      result.moved += (await adapter.move([id], { windowId: scope.targetWindowId, index })).length;
      const oldIndex = currentIds.indexOf(id);
      currentIds.splice(oldIndex, 1);
      currentIds.splice(index, 0, id);
    }
  }

  async function run(action, targetWindowId) {
    if (!actions.has(action)) throw new Error(`Unknown action: ${action}`);
    if (!Number.isInteger(targetWindowId)) throw new Error("A target window is required.");
    const target = await assertTarget(targetWindowId);
    const incognito = Boolean(target.incognito);
    const leaseKey = incognito ? "private" : "regular";
    const existing = await adapter.readOperationState(incognito);
    const now = Date.now();
    if (activeOperations.has(leaseKey) || (existing?.status === "running" && now - (existing.lastUpdatedAt || existing.startedAt || 0) < STALE_LEASE_MS)) {
      return { ...createEmptyResult(action), status: "busy", message: "Another tab operation is already running." };
    }
    if (existing?.status === "running") await adapter.writeOperationState(incognito, { ...existing, status: "interrupted", finishedAt: now, message: "The previous tab operation was interrupted." });
    const result = createEmptyResult(action);
    const lease = { status: "running", action, targetWindowId, incognito, startedAt: now, lastUpdatedAt: now, counts: {} };
    activeOperations.set(leaseKey, lease);
    currentLease = lease;
    await adapter.writeOperationState(incognito, lease);
    let scope;
    try {
      scope = await adapter.capture(targetWindowId);
      const initialActiveId = scope.activeTabId;
      const phaseMap = {
        consolidate: [ungroupPhase, consolidatePhase],
        sort: [ungroupPhase, sortPhase],
        deduplicate: [deduplicatePhase],
        organize: [ungroupPhase, consolidatePhase, deduplicatePhase, sortPhase],
      };
      for (const phase of phaseMap[action]) {
        if (options.beforePhase) await options.beforePhase(phase.name);
        const currentWindow = await api.windows.get(targetWindowId, { populate: false }).catch(() => null);
        if (!currentWindow) throw new Error("The target window closed while the operation was running.");
        await phase(scope, result);
        await updateLease(lease, result);
      }
      const finalRead = await adapter.readCaptured(scope);
      result.changed += finalRead.changedIds.length;
      const finalIds = new Set(finalRead.tabs.map(({ id }) => id));
      const survivor = result.survivorByRemovedId?.get(initialActiveId);
      const activateId = finalIds.has(initialActiveId) ? initialActiveId : finalIds.has(survivor) ? survivor : null;
      if (activateId) await adapter.activate(activateId);
      result.status = result.failed ? "partial" : "complete";
      result.message = resultMessage(result);
      lease.status = result.status;
      lease.finishedAt = Date.now();
      await updateLease(lease, result);
      return result;
    } catch (error) {
      result.failed += 1;
      result.status = result.moved || result.removed || result.ungrouped ? "partial" : "failed";
      result.message = `${resultMessage(result)} · ${error?.message || String(error)}`;
      lease.status = result.status;
      lease.finishedAt = Date.now();
      lease.error = error?.message || String(error);
      await updateLease(lease, result);
      return result;
    } finally {
      activeOperations.delete(leaseKey);
      currentLease = null;
    }
  }

  async function getStatus(targetWindowId) {
    try {
      const target = await assertTarget(targetWindowId);
      return adapter.readOperationState(Boolean(target.incognito));
    } catch { return null; }
  }

  return { run, getStatus };
}
