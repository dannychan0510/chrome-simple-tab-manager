import { createTabManager } from "./tab-manager.js";

const api = globalThis.browser ?? globalThis.chrome;
const manager = createTabManager(api);

api.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (!request || typeof request.action !== "string") return false;
  const operation = request.action === "getStatus" ? manager.getStatus(request.targetWindowId) : manager.run(request.action, request.targetWindowId);
  operation.then((result) => sendResponse({ ok: true, result }), (error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});

