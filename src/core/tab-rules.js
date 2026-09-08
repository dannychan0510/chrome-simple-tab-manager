const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

export const hasUsableId = (tab) => Number.isInteger(tab?.id) && tab.id >= 0;

export const isSplitViewTab = (tab) => Number.isInteger(tab?.splitViewId) && tab.splitViewId >= 0;

export const isDuplicateEligible = (tab) =>
  hasUsableId(tab) && tab.status !== "loading" && !tab.pendingUrl &&
  typeof tab.url === "string" && tab.url.length > 0 && !isSplitViewTab(tab);

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
    collator.compare(left.title, right.title) || left.index - right.index;
}

export function sortPinnedSections(tabs) {
  return [...tabs.filter((tab) => tab.pinned).sort(compareTabsByDomain), ...tabs.filter((tab) => !tab.pinned).sort(compareTabsByDomain)];
}

export function chooseDuplicateSurvivors(tabs, targetWindowId, windowOrder, tabOrder = new Map()) {
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
      (tabOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (tabOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
      (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER) || a.id - b.id,
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
