import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "src");
const distRoot = join(root, "dist");
const sourceFiles = [
  "background.js",
  "browser-adapter.js",
  "tab-manager.js",
  "core/tab-planner.js",
  "core/tab-rules.js",
  "popup/popup-state.js",
  "popup/popup.css",
  "popup/popup.html",
  "popup/popup.js",
];
const iconSizes = [16, 32, 48, 128];

async function copyIfNeeded(from, to) { await mkdir(dirname(to), { recursive: true }); await cp(from, to); }

async function buildTarget(target) {
  const out = join(distRoot, target);
  await mkdir(out, { recursive: true });
  for (const file of sourceFiles) await copyIfNeeded(join(source, file), join(out, file));
  await mkdir(join(out, "assets", "fonts"), { recursive: true });
  for (const weight of [400, 600]) await copyIfNeeded(join(root, "node_modules/@fontsource/ibm-plex-sans/files", `ibm-plex-sans-latin-${weight}-normal.woff2`), join(out, "assets/fonts", `ibm-plex-sans-latin-${weight}-normal.woff2`));
  await copyIfNeeded(join(root, "LICENSES/IBM-Plex-Sans.txt"), join(out, "LICENSES/IBM-Plex-Sans.txt"));
  await mkdir(join(out, "icons"), { recursive: true });
  for (const size of iconSizes) await sharp(join(source, "assets/icon.svg")).resize(size, size).png().toFile(join(out, "icons", `icon${size}.png`));
  const manifest = JSON.parse(await readFile(join(root, "manifests", `${target}.json`), "utf8"));
  await writeFile(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

const requestedTarget = process.argv[2];
if (requestedTarget && !["chrome", "firefox"].includes(requestedTarget)) throw new Error(`Unknown build target: ${requestedTarget}`);
const targets = requestedTarget ? [requestedTarget] : ["chrome", "firefox"];

await mkdir(distRoot, { recursive: true });
for (const target of targets) {
  await rm(join(distRoot, target), { recursive: true, force: true });
  await buildTarget(target);
}
console.log(`Built ${targets.map((target) => `dist/${target}`).join(" and ")}`);
