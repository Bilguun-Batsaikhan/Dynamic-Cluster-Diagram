// Saved trees live in this browser's localStorage (no backend). They survive reloads
// and restarts, but are gone if the site data is cleared or in another browser.

const STORAGE_KEY = "dynamic-cluster-diagram.trees.v1";

export function loadSavedTrees() {
  try {
    const trees = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(trees) ? trees.map((t) => ({ ...t, saved: true })) : [];
  } catch {
    return [];
  }
}

// Writes every tree marked `saved`. Returns false if storage is unavailable or full.
export function persistTrees(trees) {
  const saved = trees.filter((t) => t.saved).map(({ saved, ...tree }) => tree);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    return true;
  } catch {
    return false;
  }
}

export function newTreeId() {
  return `tree-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
