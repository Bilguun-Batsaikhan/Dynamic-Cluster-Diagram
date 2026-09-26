// Saved trees live in this browser's localStorage (no backend). They survive reloads
// and restarts, but are gone if the site data is cleared or in another browser.
// Trees are stored one at a time, so unsaved edits to other trees never leak in.

const STORAGE_KEY = "dynamic-cluster-diagram.trees.v1";

// Runtime-only fields that are never written to storage.
const strip = ({ saved, dirty, ...tree }) => tree;

function readAll() {
  try {
    const trees = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(trees) ? trees : [];
  } catch {
    return [];
  }
}

function writeAll(trees) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trees));
    return true;
  } catch {
    return false;
  }
}

export function loadSavedTrees() {
  return readAll().map((t) => ({ ...t, saved: true, dirty: false }));
}

// Add or replace one tree. Returns false if storage is unavailable or full.
export function storeTree(tree) {
  const trees = readAll();
  const i = trees.findIndex((t) => t.id === tree.id);
  if (i >= 0) trees[i] = strip(tree);
  else trees.push(strip(tree));
  return writeAll(trees);
}

export function unstoreTree(id) {
  return writeAll(readAll().filter((t) => t.id !== id));
}

export function newTreeId() {
  return `tree-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
