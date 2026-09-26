import { test } from "node:test";
import assert from "node:assert/strict";
import { treeFile, parseTreeFile } from "../src/trees.js";

const tree = {
  id: "tree-1",
  saved: true,
  dirty: false,
  name: "Animal kingdom",
  data: { name: "Animal kingdom", children: [{ name: "Land", children: [{ name: "Crow" }, { name: "Worm" }] }] },
  connections: [{ source: "Crow", target: "Worm", legend: "eats", arrow: "end", note: "Crows eat worms." }],
  legends: [{ id: "eats", name: "Eats", color: "#e5534b" }],
  levelNames: ["Environment", "Animal"],
  style: { bg: "#000000" },
  draft: { levels: ["Environment"], nodes: [], legends: [], connections: [] },
};

test("export then import round-trips a tree without runtime fields", () => {
  const { filename, json } = treeFile(tree);
  assert.equal(filename, "animal-kingdom.json");

  const [imported] = parseTreeFile(json);
  const { id, saved, dirty, ...expected } = tree;
  assert.deepEqual(imported, expected);
});

test("import accepts a bare tree and a { trees } bundle", () => {
  assert.equal(parseTreeFile(JSON.stringify({ data: { name: "Solo" } }))[0].name, "Solo");
  const bundle = { trees: [{ data: { name: "A" } }, { name: "B", data: { name: "B" } }] };
  assert.deepEqual(parseTreeFile(JSON.stringify(bundle)).map((t) => t.name), ["A", "B"]);
});

test("import rejects unusable files with a readable reason", () => {
  assert.throws(() => parseTreeFile("{not json"), /valid JSON/);
  assert.throws(() => parseTreeFile(JSON.stringify({ name: "x" })), /hierarchy/);
  assert.throws(() => parseTreeFile(JSON.stringify({ data: { name: "x", children: [{}] } })), /hierarchy/);
  assert.throws(() => parseTreeFile(JSON.stringify({ data: { name: "x" }, connections: "no" })), /list/);
});

test("import drops malformed entries and a broken draft", () => {
  const [t] = parseTreeFile(
    JSON.stringify({
      data: { name: "x" },
      connections: [{ source: "a", target: "b" }, { source: 1 }],
      legends: [{ id: "l", name: "L", color: "#fff" }, { id: "bad" }],
      draft: { nodes: "nope" },
    }),
  );
  assert.equal(t.connections.length, 1);
  assert.equal(t.legends.length, 1);
  assert.equal(t.draft, undefined);
});
