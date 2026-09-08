import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseDuplicateSurvivors,
  domainSortKey,
  duplicateKey,
  isDuplicateEligible,
  isSplitViewTab,
  sortPinnedSections,
} from "../src/core/tab-rules.js";

const tab = (id, url, extra = {}) => ({
  id,
  url,
  title: `Tab ${id}`,
  windowId: 1,
  index: id,
  pinned: false,
  active: false,
  status: "complete",
  ...extra,
});

test("a pinned URL copy survives an earlier unpinned copy", () => {
  const result = chooseDuplicateSurvivors(
    [tab(1, "https://example.com/"), tab(2, "https://example.com/", { pinned: true, windowId: 2 })],
    1,
    new Map([[1, 0], [2, 1]]),
  );
  assert.deepEqual(result.removals.map(({ id }) => id), [1]);
  assert.equal(result.survivorByRemovedId.get(1), 2);
});

test("the target-window copy wins when pinned state matches", () => {
  const result = chooseDuplicateSurvivors(
    [tab(4, "https://same.test/", { windowId: 2 }), tab(3, "https://same.test/", { windowId: 1 })],
    1,
    new Map([[2, 0], [1, 1]]),
  );
  assert.deepEqual(result.removals.map(({ id }) => id), [4]);
});

test("loading, pending, empty, and split-view tabs cannot be duplicate removals", () => {
  assert.equal(isDuplicateEligible(tab(1, "https://a.test/", { status: "loading" })), false);
  assert.equal(isDuplicateEligible(tab(2, "https://a.test/", { pendingUrl: "https://b.test/" })), false);
  assert.equal(isDuplicateEligible(tab(3, "")), false);
  assert.equal(isDuplicateEligible(tab(4, "https://a.test/", { splitViewId: 9 })), false);
  assert.equal(isSplitViewTab(tab(5, "https://a.test/", { splitViewId: -1 })), false);
});

test("Firefox containers are separate duplicate namespaces", () => {
  assert.notEqual(
    duplicateKey(tab(1, "https://mail.test/", { cookieStoreId: "firefox-container-1" })),
    duplicateKey(tab(2, "https://mail.test/", { cookieStoreId: "firefox-container-2" })),
  );
});

test("reversed host labels keep related base domains together", () => {
  const tabs = [
    tab(1, "https://mail.google.com/"),
    tab(2, "https://docs.microsoft.com/"),
    tab(3, "https://docs.google.com/"),
  ];
  assert.deepEqual(sortPinnedSections(tabs).map(({ id }) => id), [3, 1, 2]);
  assert.equal(domainSortKey(tab(4, "https://example.com./")).reversedHost, "com.example");
  assert.equal(domainSortKey(tab(5, "https://192.168.1.20/")).reversedHost, "192.168.1.20");
});

test("pinned and unpinned tabs sort independently", () => {
  const ordered = sortPinnedSections([
    tab(1, "https://z.test/", { pinned: true }),
    tab(2, "https://a.test/"),
    tab(3, "https://a.test/", { pinned: true }),
    tab(4, "https://z.test/"),
  ]);
  assert.deepEqual(ordered.map(({ id }) => id), [3, 1, 2, 4]);
});

