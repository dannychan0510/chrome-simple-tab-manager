import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

const exec = promisify(execFile);
const root = new URL("..", import.meta.url).pathname;

test("build creates valid Chrome and Firefox packages", async () => {
  await exec("npm", ["run", "build"], { cwd: root });
  const chrome = JSON.parse(await readFile(join(root, "dist/chrome/manifest.json"), "utf8"));
  const firefox = JSON.parse(await readFile(join(root, "dist/firefox/manifest.json"), "utf8"));
  assert.equal(chrome.manifest_version, 3);
  assert.equal(chrome.background.service_worker, "background.js");
  assert.deepEqual(chrome.permissions, ["tabs", "storage"]);
  assert.deepEqual(firefox.background.scripts, ["background.js"]);
  assert.deepEqual(firefox.browser_specific_settings.gecko.data_collection_permissions.required, ["none"]);
  assert.equal(firefox.browser_specific_settings.gecko.id, "{a69d42cb-0283-4e28-9a86-47e4274dc993}");
  for (const browser of ["chrome", "firefox"]) for (const size of [16, 32, 48, 128]) {
    const path = join(root, "dist", browser, "icons", `icon${size}.png`);
    await access(path);
    const metadata = await sharp(path).metadata();
    assert.deepEqual([metadata.width, metadata.height], [size, size]);
  }
  await access(join(root, "dist/chrome/assets/fonts/ibm-plex-sans-latin-400-normal.woff2"));
  await access(join(root, "dist/chrome/LICENSES/IBM-Plex-Sans.txt"));
});

