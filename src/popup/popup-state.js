export function resolveTheme(preference = "system", systemDark = false) {
  return preference === "dark" || (preference !== "light" && systemDark) ? "dark" : "light";
}

export function nextTheme(preference = "system") {
  return preference === "system" ? "light" : preference === "light" ? "dark" : "system";
}

export function resolveBooleanPreference(stored, defaultValue = true) {
  return typeof stored === "boolean" ? stored : defaultValue;
}

const phrase = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

export const isOperationRunning = (result) => result?.status === "running";
export const shouldDisableActions = (result) => isOperationRunning(result);
export function operationVisualState(result) {
  if (result?.status === "busy" || result?.status === "running") return "busy";
  if (["interrupted", "failed", "partial"].includes(result?.status)) return "error";
  if (result?.status === "complete") return "success";
  return "";
}

export function formatOperationResult(result = {}) {
  if ((result.status === "busy" || result.status === "partial" || result.status === "failed") && result.message) return result.message;
  const parts = [];
  if (result.moved) parts.push(`Moved ${phrase(result.moved, "tab")}`);
  if (result.removed) parts.push(`Removed ${phrase(result.removed, "duplicate")}`);
  if (result.ungrouped) parts.push(`Ungrouped ${phrase(result.ungrouped, "tab")}`);
  if (result.unpinned) parts.push(`Unpinned ${phrase(result.unpinned, "tab")}`);
  if (result.skippedSplit) parts.push(`Skipped ${phrase(result.skippedSplit, "split-view tab")}`);
  if (result.changed) parts.push(`Changed ${phrase(result.changed, "tab")}`);
  if (result.retained) parts.push(`Retained ${phrase(result.retained, "tab")}`);
  if (result.failed) parts.push(`Failed ${phrase(result.failed, "step")}`);
  if (result.sortingSkipped && !result.skippedSplit) parts.push("Sorting skipped");
  return parts.join(" · ") || "No tab changes were needed";
}
