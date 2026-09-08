import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../src/popup/popup.html", import.meta.url), "utf8");
const css = await readFile(new URL("../src/popup/popup.css", import.meta.url), "utf8");

test("popup exposes all four actions with accessible status", () => {
  for (const action of ["organize", "consolidate", "sort", "deduplicate"]) assert.match(html, new RegExp(`data-action=\\"${action}\\"`));
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(html, /(?:src|href)=['"]https?:/);
  assert.match(html, /Open-tab URLs are processed locally and never sent\./);
});
test("popup styles cover themes, focus, motion, and forced colors", () => {
  for (const token of ["prefers-reduced-motion", "prefers-color-scheme", "forced-colors", ":focus-visible", "@font-face"]) assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(css, /ibm-plex-sans-latin-400-normal\.woff2/);
  assert.match(css, /ibm-plex-sans-latin-600-normal\.woff2/);
});

test("inline icons use visible labels and the shared stroke system", () => {
  assert.ok((html.match(/aria-hidden="true"/g) || []).length >= 4);
  assert.match(html, /stroke="currentColor"/);
  assert.match(html, /stroke-width="1\.75"/);
  assert.match(html, /stroke-linecap="round"/);
  assert.match(html, /stroke-linejoin="round"/);
});

test("popup exposes a settings panel with pin and group toggles", () => {
  assert.match(html, /id="settings-button"/);
  assert.match(html, /id="settings-panel"/);
  assert.match(html, /id="keep-pins-toggle"/);
  assert.match(html, /id="keep-groups-toggle"/);
  assert.match(html, /Keep pinned tabs pinned/);
  assert.match(html, /Keep tab groups together/);
  assert.match(html, /aria-controls="settings-panel"/);
});
