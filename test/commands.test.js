import test from "node:test";
import assert from "node:assert/strict";
import { CHROME_SHORTCUT_SETTINGS, FIREFOX_SHORTCUT_SETTINGS, commandRunArguments, openShortcutSettings } from "../src/commands.js";

test("known command maps stored preferences and the current window", () => {
  assert.deepEqual(commandRunArguments("sort", { keepPinsSeparate: false, keepGroupsTogether: true }, 7), {
    action: "sort",
    targetWindowId: 7,
    preferences: { keepPins: false, keepGroups: true },
  });
});

test("missing preferences default to keeping pins and groups", () => {
  assert.deepEqual(commandRunArguments("organize", {}, 3).preferences, { keepPins: true, keepGroups: true });
  assert.deepEqual(commandRunArguments("deduplicate", null, 3).preferences, { keepPins: true, keepGroups: true });
});

test("non-boolean stored values fall back to defaults", () => {
  assert.deepEqual(commandRunArguments("consolidate", { keepPinsSeparate: "yes", keepGroupsTogether: 0 }, 2).preferences, { keepPins: true, keepGroups: true });
});

test("unknown commands are ignored", () => {
  assert.equal(commandRunArguments("_execute_action", {}, 1), null);
  assert.equal(commandRunArguments("nope", { keepPinsSeparate: false }, 1), null);
});

test("Firefox openShortcutSettings is used when it exists", async () => {
  let called = 0;
  const result = await openShortcutSettings({ commands: { openShortcutSettings: async () => { called += 1; } }, tabs: { create: () => { throw new Error("should not open a tab"); } } });
  assert.equal(called, 1);
  assert.deepEqual(result, { opened: true });
});

test("a failed Firefox shortcut settings call shows about:addons", async () => {
  const result = await openShortcutSettings({ commands: { openShortcutSettings: async () => { throw new Error("unavailable"); } } });
  assert.equal(result.opened, false);
  assert.equal(result.address, FIREFOX_SHORTCUT_SETTINGS);
  assert.match(result.instructions, /about:addons/);
});

test("Chrome opens the shortcuts page when the browser accepts it", async () => {
  const result = await openShortcutSettings({ tabs: { create: async ({ url }) => ({ id: 4, pendingUrl: url }) } });
  assert.equal(result.opened, true);
});

test("Chrome reports the shortcuts address when opening the page fails", async () => {
  const result = await openShortcutSettings({ tabs: { create: async () => { throw new Error("Cannot access a chrome:// URL"); } } });
  assert.deepEqual(result, { opened: false, address: CHROME_SHORTCUT_SETTINGS, instructions: `Open ${CHROME_SHORTCUT_SETTINGS} to change these shortcuts.` });
});

test("a tab that does not land on the shortcuts page is closed", async () => {
  const removed = [];
  const result = await openShortcutSettings({
    tabs: {
      create: async () => ({ id: 9, url: "chrome://newtab/" }),
      remove: async (id) => { removed.push(id); },
    },
  });
  assert.deepEqual(removed, [9]);
  assert.equal(result.opened, false);
  assert.equal(result.address, CHROME_SHORTCUT_SETTINGS);
});
