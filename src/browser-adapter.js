import { captureScope } from "./core/tab-planner.js";

export const BATCH_SIZE = 50;
export const MAX_MOVE_ATTEMPTS = 5;
export const MOVE_RETRY_DELAY_MS = 50;

export function chunkIds(ids, size = BATCH_SIZE) {
  const chunks = [];
  for (let index = 0; index < ids.length; index += size) chunks.push(ids.slice(index, index + size));
  return chunks;
}

const normalizeMovedTabs = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
const isTransientMoveError = (error) => String(error?.message || error).includes("Tabs cannot be edited right now");

function areaOrMemory(api) {
  const area = api?.storage?.session;
  if (area?.get && area?.set) return area;
  const values = {};
  return {
    async get(keys) {
      if (keys == null) return { ...values };
      const requested = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys);
      return Object.fromEntries(requested.map((key) => [key, values[key]]).filter(([, value]) => value !== undefined));
    },
    async set(next) { Object.assign(values, next); },
  };
}

async function readTab(api, id) {
  try { return await api.tabs.get(id); } catch { return null; }
}

export function createBrowserAdapter(api, options = {}) {
  if (!api) throw new Error("A WebExtensions API is required.");
  const storage = areaOrMemory(api);
  const delay = options.delay || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const refresh = options.onBatch || (async () => {});
  const verifyMove = options.verifyMove || (api.tabs.get ? async (ids, properties) => {
    const confirmed = [];
    for (const id of ids) {
      const tab = await api.tabs.get(id).catch(() => null);
      if (tab?.windowId === properties.windowId) confirmed.push(id);
    }
    return confirmed;
  } : null);

  async function capture(targetWindowId) {
    const windows = await api.windows.getAll({ populate: true, windowTypes: ["normal"] });
    return captureScope(windows, targetWindowId);
  }

  async function readCaptured(scope) {
    const tabs = [];
    const changedIds = [];
    for (const id of scope.tabIds || []) {
      let tab;
      try { tab = await api.tabs.get(id); } catch { changedIds.push(id); continue; }
      if (!tab || !scope.windowIds.includes(tab.windowId) || Boolean(tab.incognito) !== Boolean(scope.incognito)) {
        changedIds.push(id);
        continue;
      }
      tabs.push(tab);
    }
    return { tabs, changedIds };
  }

  async function ungroup(tabIds) {
    let count = 0;
    for (const batch of chunkIds(tabIds)) {
      if (batch.length === 0 || !api.tabs.ungroup) continue;
      await api.tabs.ungroup(batch);
      for (const id of batch) {
        const tab = await readTab(api, id);
        if (tab && (!Number.isInteger(tab.groupId) || tab.groupId < 0)) count += 1;
      }
      await refresh();
    }
    return count;
  }

  async function move(tabIds, properties, expectation = null) {
    const movedIds = [];
    for (const batch of chunkIds(tabIds)) {
      if (batch.length === 0) continue;
      let response;
      let lastError;
      for (let attempt = 1; attempt <= MAX_MOVE_ATTEMPTS; attempt += 1) {
        try {
          response = await api.tabs.move(batch, properties);
          break;
        } catch (error) {
          lastError = error;
          if (!isTransientMoveError(error) || attempt === MAX_MOVE_ATTEMPTS) throw error;
          await delay(MOVE_RETRY_DELAY_MS);
        }
      }
      if (response === undefined && lastError) throw lastError;
      const returned = normalizeMovedTabs(response).map((tab) => tab?.id).filter(Number.isInteger);
      const confirmed = verifyMove ? await verifyMove(returned, properties, expectation) : returned;
      const confirmedSet = new Set(confirmed);
      const missing = batch.filter((id) => !confirmedSet.has(id));
      if (missing.length) {
        const error = new Error(`Tabs moved ${confirmed.length} of ${batch.length} tabs; live placement confirmed ${confirmed.length}.`);
        error.confirmedMovedIds = [...movedIds, ...confirmed];
        error.requestedMovedIds = [...movedIds, ...batch];
        throw error;
      }
      movedIds.push(...confirmed);
      await refresh();
    }
    return movedIds;
  }

  async function remove(tabIds) {
    const removedIds = [];
    const retainedIds = [];
    for (const batch of chunkIds(tabIds)) {
      if (!batch.length) continue;
      await api.tabs.remove(batch);
      for (const id of batch) (await readTab(api, id) ? retainedIds : removedIds).push(id);
      await refresh();
    }
    return { removedIds, retainedIds };
  }

  async function activate(tabId) {
    if (!Number.isInteger(tabId)) return;
    if (api.tabs.update) await api.tabs.update(tabId, { active: true });
  }

  async function readOperationState(incognito) {
    const key = incognito ? "operation_private" : "operation_regular";
    const result = await storage.get(key);
    return result[key] ?? null;
  }

  async function writeOperationState(incognito, state) {
    const key = incognito ? "operation_private" : "operation_regular";
    await storage.set({ [key]: state });
  }

  return { capture, readCaptured, ungroup, move, remove, activate, readOperationState, writeOperationState };
}
