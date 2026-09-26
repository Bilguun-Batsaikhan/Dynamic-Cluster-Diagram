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

// ---- Import / export as .json files ----

const FORMAT = "dynamic-cluster-diagram/tree";

// File contents for downloading one tree.
export function treeFile(tree) {
  const { id, saved, dirty, example, ...rest } = tree;
  const slug = tree.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    filename: `${slug || "tree"}.json`,
    json: JSON.stringify(
      { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), tree: rest },
      null,
      2,
    ),
  };
}

// Trees from an imported file: one exported tree, { trees: [...] }, or a bare tree
// object. Throws an Error with a readable message if the file isn't usable.
export function parseTreeFile(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("it isn't valid JSON");
  }
  const list = Array.isArray(json?.trees) ? json.trees : json?.tree ? [json.tree] : [json];
  if (!list.length) throw new Error("it contains no trees");
  return list.map(normalizeTree);
}

function validNode(node, depth = 0) {
  if (!node || typeof node !== "object" || typeof node.name !== "string" || depth > 64) return false;
  if (node.children === undefined) return true;
  return Array.isArray(node.children) && node.children.every((c) => validNode(c, depth + 1));
}

const isObject = (x) => !!x && typeof x === "object" && !Array.isArray(x);

function list(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`"${field}" must be a list`);
  return value;
}

// Keep only well-formed fields, so a hand-edited or foreign file can't break the app.
function normalizeTree(t) {
  if (!isObject(t)) throw new Error("it doesn't contain a tree");
  if (!validNode(t.data)) throw new Error('its "data" hierarchy is missing or malformed');

  const draft = t.draft;
  const draftOk =
    isObject(draft) &&
    ["levels", "nodes", "legends", "connections"].every((k) => Array.isArray(draft[k]));

  return {
    name: typeof t.name === "string" && t.name.trim() ? t.name.trim() : t.data.name,
    data: t.data,
    connections: list(t.connections, "connections").filter(
      (c) => isObject(c) && typeof c.source === "string" && typeof c.target === "string",
    ),
    legends: list(t.legends, "legends").filter(
      (l) => isObject(l) && ["id", "name", "color"].every((k) => typeof l[k] === "string"),
    ),
    levelNames: list(t.levelNames, "levelNames").filter((s) => typeof s === "string"),
    ...(isObject(t.style) && { style: t.style }),
    ...(draftOk && { draft }), // needed for Edit
  };
}
