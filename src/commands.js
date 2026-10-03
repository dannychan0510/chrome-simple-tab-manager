import { resolveBooleanPreference } from "./popup/popup-state.js";

const commandActions = new Set(["organize", "consolidate", "sort", "deduplicate"]);

export const CHROME_SHORTCUT_SETTINGS = "chrome://extensions/shortcuts";
export const FIREFOX_SHORTCUT_SETTINGS = "about:addons";

const chromeInstructions = `Open ${CHROME_SHORTCUT_SETTINGS} to change these shortcuts.`;
const firefoxInstructions = "Open about:addons, choose the gear menu, then Manage Extension Shortcuts.";

export function commandRunArguments(command, stored = {}, windowId) {
  if (!commandActions.has(command)) return null;
  return {
    action: command,
    targetWindowId: windowId,
    preferences: {
      keepPins: resolveBooleanPreference(stored?.keepPinsSeparate, true),
      keepGroups: resolveBooleanPreference(stored?.keepGroupsTogether, true),
    },
  };
}

function blocked(address, instructions) {
  return { opened: false, address, instructions };
}

function shortcutTabUrl(tab) {
  return tab?.pendingUrl || tab?.url || "";
}

export async function openShortcutSettings(api) {
  const open = api?.commands?.openShortcutSettings;
  if (typeof open === "function") {
    try {
      await open();
      return { opened: true };
    } catch {
      return blocked(FIREFOX_SHORTCUT_SETTINGS, firefoxInstructions);
    }
  }
  if (typeof api?.tabs?.create !== "function") return blocked(CHROME_SHORTCUT_SETTINGS, chromeInstructions);
  let tab;
  try {
    tab = await api.tabs.create({ url: CHROME_SHORTCUT_SETTINGS });
  } catch {
    return blocked(CHROME_SHORTCUT_SETTINGS, chromeInstructions);
  }
  const url = shortcutTabUrl(tab);
  if (url === CHROME_SHORTCUT_SETTINGS || (!url && tab?.id)) return { opened: true };
  if (tab?.id) await api.tabs.remove?.(tab.id);
  return blocked(CHROME_SHORTCUT_SETTINGS, chromeInstructions);
}
