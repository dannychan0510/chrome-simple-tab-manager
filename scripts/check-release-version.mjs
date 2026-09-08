import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const packageVersion = (await readJson(join(root, "package.json"))).version;
const chromeVersion = (await readJson(join(root, "manifests/chrome.json"))).version;
const firefoxVersion = (await readJson(join(root, "manifests/firefox.json"))).version;
if (chromeVersion !== packageVersion || firefoxVersion !== packageVersion) {
  throw new Error(`Version mismatch: package=${packageVersion}, chrome=${chromeVersion}, firefox=${firefoxVersion}`);
}

const tag = process.argv[2];
if (tag && tag !== `v${packageVersion}`) throw new Error(`Release tag ${tag} must equal v${packageVersion}`);
console.log(`Release version ${packageVersion}${tag ? ` matches ${tag}` : " is consistent"}`);
