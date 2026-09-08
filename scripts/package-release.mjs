import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = join(root, "artifacts");
const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const names = {
  chrome: `simple-tab-manager-chrome-v${version}.zip`,
  firefox: `simple-tab-manager-firefox-v${version}.zip`,
  source: `simple-tab-manager-source-v${version}.zip`,
};

function run(command, args, cwd = root) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

function capture(command, args, cwd = root) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "inherit"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolvePromise(output) : reject(new Error(`${command} exited with code ${code}`)));
  });
}

async function walkFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(path));
    else files.push(path);
  }
  return files.sort();
}

if ((await capture("git", ["status", "--porcelain", "--untracked-files=normal"])).trim()) {
  throw new Error("Refusing to package a dirty working tree. Commit or restore changes first.");
}

await run("npm", ["test"]);
await run(process.execPath, [join(root, "scripts/check-release-version.mjs")]);
await run(process.execPath, [join(root, "scripts/build.mjs")]);
await run(process.execPath, [join(root, "scripts/verify-build.mjs")]);
await mkdir(artifacts, { recursive: true });
for (const name of Object.values(names)) await rm(join(artifacts, name), { force: true });

for (const target of ["chrome", "firefox"]) {
  const directory = join(root, "dist", target);
  const files = await walkFiles(directory);
  const fixedTime = new Date((Number(process.env.SOURCE_DATE_EPOCH) || 946684800) * 1000);
  for (const path of files) {
    if ((await stat(path)).isFile()) await utimes(path, fixedTime, fixedTime);
  }
  await run("zip", ["-X", "-q", join(artifacts, names[target]), ...files.map((path) => relative(directory, path))], directory);
}

await run("git", [
  "archive",
  "--format=zip",
  `--output=${join(artifacts, names.source)}`,
  "HEAD",
  "package.json",
  "package-lock.json",
  "AMO-BUILD.md",
  "manifests",
  "scripts",
  "src",
  "test",
  "LICENSES",
]);

const checksumLines = [];
for (const name of Object.values(names)) {
  const hash = createHash("sha256").update(await readFile(join(artifacts, name))).digest("hex");
  checksumLines.push(`${hash}  ${name}`);
}
await writeFile(join(artifacts, "SHA256SUMS.txt"), `${checksumLines.join("\n")}\n`);
console.log(`Created release archives in ${artifacts}`);
