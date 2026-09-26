import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, generateMockData } from "../src/data.js";

function walk(node, depth = 0, out = []) {
  out.push({ node, depth });
  for (const c of node.children ?? []) walk(c, depth + 1, out);
  return out;
}

test("generated data stays within the limits", () => {
  for (let seed = 1; seed <= 500; seed++) {
    const { data, leafConnections, levels } = generateMockData(seed);
    const nodes = walk(data);
    const deepest = Math.max(...nodes.map((n) => n.depth));

    assert.ok(levels >= LIMITS.levels[0] && levels <= LIMITS.levels[1], `seed ${seed}: levels`);
    assert.equal(deepest + 1, levels, `seed ${seed}: deepest level is reached`);
    assert.ok(
      nodes.length >= LIMITS.nodes[0] && nodes.length <= LIMITS.nodes[1],
      `seed ${seed}: ${nodes.length} nodes`,
    );

    const names = nodes.map((n) => n.node.name);
    assert.equal(new Set(names).size, names.length, `seed ${seed}: unique names`);
    assert.ok(nodes.every((n) => n.node.children === undefined || n.node.children.length > 0));

    const leafNames = new Set(nodes.filter((n) => !n.node.children).map((n) => n.node.name));
    assert.ok(leafConnections.length <= LIMITS.maxLinks, `seed ${seed}: link count`);
    const pairs = new Set();
    for (const { source, target } of leafConnections) {
      assert.ok(leafNames.has(source) && leafNames.has(target), `seed ${seed}: endpoints are leaves`);
      assert.notEqual(source, target);
      const key = [source, target].sort().join("|");
      assert.ok(!pairs.has(key), `seed ${seed}: duplicate link`);
      pairs.add(key);
    }
  }
});

test("the same seed produces the same data", () => {
  assert.deepEqual(generateMockData(42), generateMockData(42));
  assert.notDeepEqual(generateMockData(42), generateMockData(43));
});
