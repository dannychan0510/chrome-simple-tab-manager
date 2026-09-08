import { formatOperationResult, nextTheme, resolveTheme } from "./popup-state.js";

const api = globalThis.browser ?? globalThis.chrome;
const themeButton = document.querySelector("#theme-button");
const status = document.querySelector("#status");
const statusText = document.querySelector("#status-text");
const actionButtons = [...document.querySelectorAll("[data-action]")];
const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
let preference = "system";
let targetWindowId = null;

function setStatus(message, state = "") {
  statusText.textContent = message;
  if (state) status.dataset.state = state;
  else delete status.dataset.state;
}

function preferenceLabel(value) { return value[0].toUpperCase() + value.slice(1); }

function applyTheme() {
  const theme = resolveTheme(preference, Boolean(media?.matches));
  document.documentElement.dataset.theme = theme;
  const label = `Theme: ${preferenceLabel(preference)}`;
  themeButton.setAttribute("aria-label", label);
  themeButton.title = label;
  const hidden = themeButton.querySelector(".sr-only");
  if (hidden) hidden.textContent = label;
}

async function storageGet(key) {
  const local = api?.storage?.local;
  if (!local?.get) return {};
  return local.get(key);
}

async function storageSet(value) {
  const local = api?.storage?.local;
  if (local?.set) await local.set(value);
}

async function send(request) {
  if (!api?.runtime?.sendMessage) throw new Error("The extension background process is unavailable.");
  return api.runtime.sendMessage(request);
}

function setBusy(busy) { actionButtons.forEach((button) => { button.disabled = busy; }); }

async function runAction(action) {
  setBusy(true);
  setStatus("Working…");
  try {
    const response = await send({ action, targetWindowId });
    if (!response?.ok) throw new Error(response?.error || "The operation could not be completed.");
    const result = response.result || {};
    setStatus(formatOperationResult(result), result.status === "failed" || result.status === "partial" ? "error" : "success");
  } catch (error) {
    setStatus(error?.message || String(error), "error");
  } finally { setBusy(false); }
}

async function restoreStatus() {
  try {
    let response = await send({ action: "getStatus", targetWindowId });
    if (!response?.ok || !response.result) return;
    let state = response.result;
    while (state?.status === "running") {
      setBusy(true);
      setStatus(`Working on ${state.action}…`);
      await new Promise((resolve) => setTimeout(resolve, 250));
      response = await send({ action: "getStatus", targetWindowId });
      state = response?.ok ? response.result : null;
    }
    setBusy(false);
    if (state?.message) setStatus(state.message, state.status === "failed" || state.status === "partial" ? "error" : "success");
  } catch {
    // The status is optional while a browser background process starts.
    setBusy(false);
  }
}

async function init() {
  const stored = await storageGet("themePreference").catch(() => ({}));
  preference = ["system", "light", "dark"].includes(stored?.themePreference) ? stored.themePreference : "system";
  applyTheme();
  const current = await api.windows.getCurrent({ populate: false });
  targetWindowId = current.id;
  await restoreStatus();
}

themeButton.addEventListener("click", async () => {
  preference = nextTheme(preference);
  applyTheme();
  await storageSet({ themePreference: preference });
});
media?.addEventListener?.("change", () => { if (preference === "system") applyTheme(); });
for (const button of actionButtons) button.addEventListener("click", () => runAction(button.dataset.action));
init().catch((error) => setStatus(error?.message || String(error), "error"));
