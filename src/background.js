import { commandRunArguments } from "./commands.js";
import { createTabManager } from "./tab-manager.js";

const api = globalThis.browser ?? globalThis.chrome;
const manager = createTabManager(api);

api.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (!request || typeof request.action !== "string") return false;
  const operation = request.action === "getStatus" ? manager.getStatus(request.targetWindowId) : manager.run(request.action, request.targetWindowId, request.preferences);
  operation.then((result) => sendResponse({ ok: true, result }), (error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});

api.commands?.onCommand.addListener((command) => {
  runCommand(command);
});

async function runCommand(command) {
  const stored = await api.storage.local.get(["keepPinsSeparate", "keepGroupsTogether"]);
  const current = await api.windows.getCurrent({ populate: false });
  const args = commandRunArguments(command, stored, current.id);
  if (!args) return;
  await manager.run(args.action, args.targetWindowId, args.preferences);
}
