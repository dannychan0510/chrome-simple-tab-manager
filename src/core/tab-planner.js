import { chooseDuplicateSurvivors, compareGroupBlocks, compareTabsByDomain, isSplitViewTab, sortPinnedSections } from "./tab-rules.js";

export function captureScope(windows, targetWindowId) {
  const target = windows.find((window) => window.id === targetWindowId && window.type === "normal");
  if (!target) throw new Error("The target window is no longer available.");
  const scoped = windows.filter((window) => window.type === "normal" && Boolean(window.incognito) === Boolean(target.incognito));
  const windowIds = scoped.map(({ id }) => id);
  const tabs = scoped.flatMap((window) => window.tabs || []);
  return {
    targetWindowId,
    incognito: Boolean(target.incognito),
    activeTabId: target.tabs?.find((tab) => tab.active)?.id ?? null,
    windowIds,
    tabIds: tabs.map(({ id }) => id).filter((id) => Number.isInteger(id)),
    windowOrder: new Map(windowIds.map((id, index) => [id, index])),
    tabOrder: new Map(tabs.map(({ id }, index) => [id, index])),
  };
}

export function planConsolidation(tabs, targetWindowId) {
  const groupedIds = [];
  const pinnedIds = [];
  const unpinnedIds = [];
  const skippedSplitIds = [];
  for (const tab of tabs) {
    if (tab.windowId === targetWindowId) continue;
    if (isSplitViewTab(tab)) {
      skippedSplitIds.push(tab.id);
      continue;
    }
    if (Number.isInteger(tab.groupId) && tab.groupId >= 0) groupedIds.push(tab.id);
    (tab.pinned ? pinnedIds : unpinnedIds).push(tab.id);
  }
  return { groupedIds, pinnedIds, unpinnedIds, skippedSplitIds };
}

export function planDuplicateRemoval(tabs, scope) {
  const choice = chooseDuplicateSurvivors(tabs, scope.targetWindowId, scope.windowOrder, scope.tabOrder);
  const removeIds = choice.removals.map(({ id }) => id);
  const targetIds = tabs.filter((tab) => tab.windowId === scope.targetWindowId).map(({ id }) => id);
  const targetWouldEmpty = targetIds.length > 0 && targetIds.every((id) => removeIds.includes(id));
  const protectTargetWithTabId = targetWouldEmpty
    ? choice.removals
      .filter((tab) => tab.windowId === scope.targetWindowId)
      .map((tab) => choice.survivorByRemovedId.get(tab.id))
      .map((id) => choice.survivors.find((tab) => tab.id === id))
      .find((tab) => tab && tab.windowId !== scope.targetWindowId)?.id ?? null
    : null;
  return { ...choice, removeIds, protectTargetWithTabId };
}

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
