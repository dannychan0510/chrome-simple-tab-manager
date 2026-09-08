import { access, readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(new URL("..", import.meta.url).pathname);
const targets = ["chrome", "firefox"];
const required = ["background.js", "browser-adapter.js", "tab-manager.js", "manifest.json", "popup/popup.html", "popup/popup.css", "popup/popup.js", "popup/popup-state.js", "core/tab-rules.js", "core/tab-planner.js", "assets/icon.svg", "assets/fonts/ibm-plex-sans-latin-400-normal.woff2", "assets/fonts/ibm-plex-sans-latin-600-normal.woff2", "LICENSES/IBM-Plex-Sans.txt", "icons/icon16.png", "icons/icon32.png", "icons/icon48.png", "icons/icon128.png"];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) { const path = join(dir, entry.name); if (entry.isDirectory()) files.push(...await walk(path)); else files.push(path); }
  return files;
}

for (const target of targets) {
  const dir = join(root, "dist", target);
  const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
  if (manifest.manifest_version !== 3) throw new Error(`${target}: Manifest V3 is required`);
  if (JSON.stringify(manifest.permissions) !== JSON.stringify(["tabs", "storage"])) throw new Error(`${target}: unexpected permissions`);
  if (target === "firefox" && JSON.stringify(manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required) !== JSON.stringify(["none"])) throw new Error("Firefox data collection permission must be none");
  for (const path of required) await access(join(dir, path));
  const files = await walk(dir);
  for (const path of files) {
    if (!/\.(html|css|js|json|svg)$/.test(path)) continue;
    const text = await readFile(path, "utf8");
    if (/(?:src|href|url)\s*[:=]\s*["'(]?\s*https?:\/\//i.test(text)) throw new Error(`${target}: remote asset reference in ${relative(dir, path)}`);
  }
  for (const size of [16, 32, 48, 128]) {
    const metadata = await sharp(join(dir, "icons", `icon${size}.png`)).metadata();
    if (metadata.width !== size || metadata.height !== size) throw new Error(`${target}: icon${size}.png has wrong dimensions`);
  }
}
console.log("Build verification passed for Chrome and Firefox");
