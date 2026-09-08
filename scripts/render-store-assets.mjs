import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "store-assets");
const screenshotOutput = join(output, "screenshots");
const promoOutput = join(output, "promotional");
const chromeCandidates = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

async function firstReadable(paths) {
  for (const path of paths) {
    try { await readFile(path); return path; } catch { /* Try the next browser. */ }
  }
  throw new Error("Chrome or Chromium was not found. Set CHROME_BIN to its executable path.");
}

function runScreenshot(command, args, outputPath) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timeout);
      child.kill("SIGTERM");
      if (error) reject(error);
      else resolvePromise();
    };
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", finish);
    child.on("close", async (code) => {
      if (settled) return;
      try {
        if ((await stat(outputPath)).size > 0) finish();
        else finish(new Error(`${basename(command)} exited ${code}: ${stderr}`));
      } catch { finish(new Error(`${basename(command)} exited ${code}: ${stderr}`)); }
    });
    const poll = setInterval(async () => {
      try { if ((await stat(outputPath)).size > 0) finish(); } catch { /* Wait for Chrome to write the image. */ }
    }, 100);
    const timeout = setTimeout(() => finish(new Error(`${basename(command)} did not write ${basename(outputPath)} within 20 seconds.`)), 20_000);
  });
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function popupDocument({ theme = "light", status = "Ready", state = "", highlight = "" }) {
  const [html, rawCss, regularFont, semiboldFont] = await Promise.all([
    readFile(join(root, "src/popup/popup.html"), "utf8"),
    readFile(join(root, "src/popup/popup.css"), "utf8"),
    readFile(join(root, "node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2")),
    readFile(join(root, "node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2")),
  ]);
  const tray = html.match(/<main class="tray">[\s\S]*?<\/main>/)?.[0];
  if (!tray) throw new Error("Could not find the popup tray markup.");
  const css = rawCss
    .replace('url("../assets/fonts/ibm-plex-sans-latin-400-normal.woff2")', `url("data:font/woff2;base64,${regularFont.toString("base64")}")`)
    .replace('url("../assets/fonts/ibm-plex-sans-latin-600-normal.woff2")', `url("data:font/woff2;base64,${semiboldFont.toString("base64")}")`);
  const adjusted = tray
    .replace('id="status" class="status"', `id="status" class="status"${state ? ` data-state="${state}"` : ""}`)
    .replace('<span id="status-text">Ready</span>', `<span id="status-text">${escapeXml(status)}</span>`)
    .replace(`data-action="${highlight}"`, `data-action="${highlight}" data-demo-highlight="true"`);
  return `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8"><style>${css}
    html, body { width: 400px; height: 392px; min-width: 0; overflow: hidden; }
    body { display: grid; place-items: center; background: transparent; }
    .tray { width: 360px; min-height: 0; border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 24px 60px rgba(23, 32, 42, .2); }
    [data-demo-highlight="true"] { border-radius: 8px; background: color-mix(in srgb, var(--accent) 10%, transparent); color: var(--accent); }
  </style></head><body>${adjusted}</body></html>`;
}

async function capturePopup(chrome, temp, name, options) {
  const htmlPath = join(temp, `${name}.html`);
  const imagePath = join(temp, `${name}.png`);
  const profile = join(temp, `${name}-profile`);
  await writeFile(htmlPath, await popupDocument(options));
  await runScreenshot(chrome, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--force-device-scale-factor=1",
    "--window-size=400,392",
    `--user-data-dir=${profile}`,
    `--screenshot=${imagePath}`,
    pathToFileURL(htmlPath).href,
  ], imagePath);
  return imagePath;
}

function popupImage(buffer, x, y, width = 440, height = 431) {
  return `<image href="data:image/png;base64,${buffer.toString("base64")}" x="${x}" y="${y}" width="${width}" height="${height}"/>`;
}

function iconImage(svg, x, y, size) {
  return `<image href="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
}

function textBlock({ title, lines, accent = "#2563EB", dark = false }) {
  const ink = dark ? "#F4F7FB" : "#17202A";
  const muted = dark ? "#B9C6D8" : "#536173";
  return `<circle cx="92" cy="104" r="6" fill="${accent}"/>
    <text x="116" y="113" font-family="IBM Plex Sans, Arial, sans-serif" font-size="25" font-weight="600" fill="${ink}">Simple Tab Manager</text>
    ${title.map((line, index) => `<text x="72" y="${250 + index * 68}" font-family="IBM Plex Sans, Arial, sans-serif" font-size="58" font-weight="600" letter-spacing="-1.5" fill="${ink}">${escapeXml(line)}</text>`).join("")}
    ${lines.map((line, index) => `<text x="74" y="${435 + index * 35}" font-family="IBM Plex Sans, Arial, sans-serif" font-size="24" fill="${muted}">${escapeXml(line)}</text>`).join("")}`;
}

function frame(content, { background = "#EDF3FF", dark = false } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${background}"/><stop offset="1" stop-color="${dark ? "#18212D" : "#F8FAFD"}"/></linearGradient></defs>
    <rect width="1280" height="800" fill="url(#bg)"/>
    <circle cx="1120" cy="30" r="280" fill="${dark ? "#23447C" : "#D9E7FF"}" opacity=".5"/>
    <circle cx="1090" cy="760" r="220" fill="${dark ? "#183F35" : "#DDF6ED"}" opacity=".6"/>
    ${content}
  </svg>`;
}

async function writeSvgPng(path, svg, width, height) {
  await sharp(Buffer.from(svg)).resize(width, height).png({ compressionLevel: 9 }).toFile(path);
}

const chrome = await firstReadable(chromeCandidates);
const temp = await mkdtemp(join(tmpdir(), "simple-tab-manager-store-"));
await mkdir(screenshotOutput, { recursive: true });
await mkdir(promoOutput, { recursive: true });

const light = await capturePopup(chrome, temp, "light", { theme: "light" });
const together = await capturePopup(chrome, temp, "together", { theme: "light", highlight: "consolidate" });
const duplicates = await capturePopup(chrome, temp, "duplicates", { theme: "light", status: "Removed 8 duplicates · Retained 1 tab", state: "success", highlight: "deduplicate" });
const sort = await capturePopup(chrome, temp, "sort", { theme: "light", status: "Moved 12 tabs", state: "success", highlight: "sort" });
const dark = await capturePopup(chrome, temp, "dark", { theme: "dark" });
const [lightPng, togetherPng, duplicatesPng, sortPng, darkPng, iconSvg] = await Promise.all([
  readFile(light), readFile(together), readFile(duplicates), readFile(sort), readFile(dark), readFile(join(root, "src/assets/icon.svg"), "utf8"),
]);

const shots = [
  ["01-organize-all-tabs.png", frame(`${textBlock({ title: ["All your tabs.", "One tidy window."], lines: ["Bring windows together, remove exact copies,", "and sort by domain in one click."] })}${popupImage(lightPng, 760, 178)}`)],
  ["02-keep-pinned-tabs.png", frame(`${textBlock({ title: ["Pinned stays", "pinned."], lines: ["Move tabs into one window while keeping", "the pinned and unpinned sections intact."] })}${popupImage(togetherPng, 760, 178)}`, { background: "#ECF9F4" })],
  ["03-sort-by-domain.png", frame(`${textBlock({ title: ["Domains, sorted", "at a glance."], lines: ["Related sites stay together inside separate", "pinned and unpinned sections."] })}${popupImage(sortPng, 760, 178)}`, { background: "#EEF0FF" })],
  ["04-remove-duplicates.png", frame(`${textBlock({ title: ["Keep one.", "Close the copies."], lines: ["Exact URL matches are removed safely.", "A pinned copy always wins."] })}${popupImage(duplicatesPng, 760, 178)}`, { background: "#FFF4E4" })],
  ["05-light-and-dark.png", frame(`${textBlock({ title: ["Clear in light", "or dark."], lines: ["Follow the browser theme or choose the", "appearance that works for you."], dark: true, accent: "#78A9FF" })}${popupImage(lightPng, 688, 240, 330, 323)}${popupImage(darkPng, 934, 330, 330, 323)}`, { background: "#202A38", dark: true })],
];
for (const [name, svg] of shots) await writeSvgPng(join(screenshotOutput, name), svg, 1280, 800);

const smallPromo = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280">
  <defs><linearGradient id="p" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1D4ED8"/><stop offset="1" stop-color="#5B7FFF"/></linearGradient></defs>
  <rect width="440" height="280" fill="url(#p)"/><circle cx="380" cy="30" r="130" fill="#8FB3FF" opacity=".35"/>
  ${iconImage(iconSvg, 44, 64, 112)}
  <text x="180" y="116" font-family="IBM Plex Sans, Arial, sans-serif" font-size="27" font-weight="600" fill="#FFFFFF">Simple Tab</text>
  <text x="180" y="151" font-family="IBM Plex Sans, Arial, sans-serif" font-size="27" font-weight="600" fill="#FFFFFF">Manager</text>
  <text x="181" y="188" font-family="IBM Plex Sans, Arial, sans-serif" font-size="16" fill="#DCE8FF">One tidy window.</text>
</svg>`;
await writeSvgPng(join(promoOutput, "small-promo-440x280.png"), smallPromo, 440, 280);

const marquee = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="560" viewBox="0 0 1400 560">
  <defs><linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#163B82"/><stop offset=".55" stop-color="#2563EB"/><stop offset="1" stop-color="#668DFF"/></linearGradient></defs>
  <rect width="1400" height="560" fill="url(#m)"/><circle cx="1240" cy="60" r="360" fill="#8FB3FF" opacity=".28"/><circle cx="1180" cy="560" r="300" fill="#54D2A5" opacity=".18"/>
  ${iconImage(iconSvg, 100, 162, 190)}
  <text x="340" y="247" font-family="IBM Plex Sans, Arial, sans-serif" font-size="62" font-weight="600" letter-spacing="-1" fill="#FFFFFF">Simple Tab Manager</text>
  <text x="343" y="310" font-family="IBM Plex Sans, Arial, sans-serif" font-size="29" fill="#DCE8FF">Bring together. Remove copies. Sort by domain.</text>
</svg>`;
await writeSvgPng(join(promoOutput, "marquee-1400x560.png"), marquee, 1400, 560);

await sharp(join(root, "src/assets/icon.svg")).resize(128, 128).png({ compressionLevel: 9 }).toFile(join(output, "store-icon-128.png"));
console.log(`Rendered store assets in ${output}`);
