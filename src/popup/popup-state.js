export function resolveTheme(preference = "system", systemDark = false) {
  return preference === "dark" || (preference !== "light" && systemDark) ? "dark" : "light";
}

export function nextTheme(preference = "system") {
  return preference === "system" ? "light" : preference === "light" ? "dark" : "system";
}

const phrase = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

export function formatOperationResult(result = {}) {
  const parts = [];
  if (result.moved) parts.push(`Moved ${phrase(result.moved, "tab")}`);
  if (result.removed) parts.push(`Removed ${phrase(result.removed, "duplicate")}`);
  if (result.ungrouped) parts.push(`Ungrouped ${phrase(result.ungrouped, "tab")}`);
  if (result.skippedSplit) parts.push(`Skipped ${phrase(result.skippedSplit, "split-view tab")}`);
  if (result.changed) parts.push(`Changed ${phrase(result.changed, "tab")}`);
  if (result.retained) parts.push(`Retained ${phrase(result.retained, "tab")}`);
  if (result.failed) parts.push(`Failed ${phrase(result.failed, "step")}`);
  if (result.sortingSkipped && !result.skippedSplit) parts.push("Sorting skipped");
  return parts.join(" · ") || "No tab changes were needed";
}

