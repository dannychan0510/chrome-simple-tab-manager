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
        const movingIds = new Set(moving.map((tab) => tab.id));
        for (const tab of moving) {
          if (!Number.isInteger(tab.groupId) || tab.groupId < 0) continue;
          const groupmates = windows.flatMap(({ tabs }) => tabs).filter((candidate) => candidate.groupId === tab.groupId);
          if (groupmates.some((candidate) => !movingIds.has(candidate.id))) tab.groupId = -1;
        }
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
