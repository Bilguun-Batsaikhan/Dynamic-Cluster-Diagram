import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TAU,
  assignStableIds,
  treeDistance,
  visibleAncestor,
  resolveConnections,
  aggregateLinks,
  arcsOverlap,
  assignArcLayers,
  interpolateAngle,
} from "../src/layout.js";

// Minimal stand-in for d3.hierarchy nodes: only the fields layout.js reads.
function tree(spec, parent = null, depth = 0) {
  const node = { data: { name: spec.name }, parent, depth, children: null };
  if (spec.children) node.children = spec.children.map((c) => tree(c, node, depth + 1));
  return node;
}

function all(node) {
  return [node, ...(node.children ?? node._children ?? []).flatMap(all)];
}

function collapse(node) {
  node._children = node.children;
  node.children = null;
}

function sample() {
  const root = tree({
    name: "root",
    children: [
      { name: "A", children: [{ name: "a1" }, { name: "a2" }] },
      { name: "B", children: [{ name: "b1" }, { name: "b1" }] },
    ],
  });
  assignStableIds(root);
  const byId = Object.fromEntries(all(root).map((d) => [d.id, d]));
  return { root, byId };
}

test("assignStableIds uses paths and disambiguates duplicate siblings", () => {
  const { byId } = sample();
  assert.ok(byId["root/A/a1"]);
  assert.ok(byId["root/B/b1"]);
  assert.ok(byId["root/B/b1#2"]);
});

test("treeDistance counts edges through the common ancestor", () => {
  const { byId } = sample();
  assert.equal(treeDistance(byId["root/A/a1"], byId["root/A/a2"]), 2);
  assert.equal(treeDistance(byId["root/A/a1"], byId["root/B/b1"]), 4);
  assert.equal(treeDistance(byId["root/A"], byId["root/A/a1"]), 1);
});

test("visibleAncestor returns the topmost collapsed ancestor", () => {
  const { byId } = sample();
  assert.equal(visibleAncestor(byId["root/A/a1"]), byId["root/A/a1"]);
  collapse(byId["root/A"]);
  assert.equal(visibleAncestor(byId["root/A/a1"]), byId["root/A"]);
  collapse(byId["root"]);
  assert.equal(visibleAncestor(byId["root/A/a1"]), byId["root"]);
});

test("resolveConnections matches ids and unique names, skips ambiguous names", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const { byId } = sample();
  const leaves = ["root/A/a1", "root/A/a2", "root/B/b1", "root/B/b1#2"].map((id) => byId[id]);
  const resolved = resolveConnections(leaves, [
    { source: "a1", target: "root/B/b1#2" },
    { source: "a2", target: "b1" }, // "b1" is ambiguous
    { source: "a1", target: "missing" },
  ]);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].source, byId["root/A/a1"]);
  assert.equal(resolved[0].target, byId["root/B/b1#2"]);
  assert.equal(warn.mock.callCount(), 2);
});

test("aggregateLinks merges links between collapsed branches and drops internal ones", () => {
  const { byId } = sample();
  const conn = (s, t) => ({ source: byId[s], target: byId[t] });
  const links = [
    conn("root/A/a1", "root/B/b1"),
    conn("root/A/a2", "root/B/b1#2"),
    conn("root/A/a1", "root/A/a2"),
  ];

  assert.equal(aggregateLinks(links).length, 3);

  collapse(byId["root/A"]);
  collapse(byId["root/B"]);
  const merged = aggregateLinks(links);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].count, 2);
  assert.deepEqual([merged[0].source.id, merged[0].target.id], ["root/A", "root/B"]);
});

test("aggregateLinks keeps legends apart and maps arrow direction onto the merged link", () => {
  const { byId } = sample();
  const conn = (s, t, extra) => ({ source: byId[s], target: byId[t], ...extra });

  // root/B sorts after root/A, so a B → A arrow lands on the merged link's start.
  const links = aggregateLinks([
    conn("root/B/b1", "root/A/a1", { legend: "eats", arrow: "end" }),
    conn("root/A/a1", "root/B/b1", { legend: "helps", arrow: "both" }),
    conn("root/A/a1", "root/B/b1", { legend: "helps" }),
  ]);
  assert.equal(links.length, 2);

  const eats = links.find((l) => l.legend === "eats");
  assert.equal(eats.source.id, "root/A/a1");
  assert.deepEqual([eats.arrowStart, eats.arrowEnd], [true, false]);

  const helps = links.find((l) => l.legend === "helps");
  assert.equal(helps.count, 2);
  assert.deepEqual([helps.arrowStart, helps.arrowEnd], [true, true]);
});

test("arcsOverlap handles intervals that wrap past 0", () => {
  assert.equal(arcsOverlap({ s: 6.1, e: 6.1 + 0.48 }, { s: 0.05, e: 0.15 }), true);
  assert.equal(arcsOverlap({ s: 1, e: 2 }, { s: 3, e: 4 }), false);
});

test("assignArcLayers stacks a wider arc above a narrower one across 0", () => {
  const root = { depth: 0, parent: null };
  const leaf = (x) => ({ x, y: 100, depth: 1, parent: root });
  const wide = { source: leaf(6.1), target: leaf(0.3) };
  const narrow = { source: leaf(0.05), target: leaf(0.15) };
  assignArcLayers([wide, narrow], { rBase: 100, gap: 10, spanBoost: 0, spanPow: 2, maxDepth: 1 });
  assert.equal(narrow.arc.layer, 0);
  assert.equal(wide.arc.layer, 1);
  assert.ok(wide.arc.r > narrow.arc.r);
});

test("interpolateAngle takes the short way round", () => {
  const i = interpolateAngle(TAU - 0.1, 0.1);
  assert.ok(Math.abs(i(0.5) - TAU) < 1e-9);
});
