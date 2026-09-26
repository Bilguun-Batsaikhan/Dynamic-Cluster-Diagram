// Randomly generated mock hierarchy and leaf-to-leaf connections.
// Every page load gets a new seed; add ?seed=<n> to the URL to reproduce a layout
// (the seed in use is logged to the console).

export const LIMITS = {
  levels: [4, 10], // tree levels, including the root
  nodes: [40, 160], // total node budget
  rootChildren: [2, 5],
  growth: [1.2, 2.4], // a level has this many times the nodes of the level above (within budget)
  linksPerLeaf: [0.3, 0.8], // number of connections relative to the number of leaves
  maxLinks: 60,
  localLinkBias: 0.6, // share of connections whose target is a nearby leaf
};

// Small seedable PRNG (mulberry32), returns floats in [0, 1).
export function createRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateMockData(seed, limits = LIMITS) {
  const rand = createRandom(seed);
  const int = ([min, max]) => min + Math.floor(rand() * (max - min + 1));
  const between = ([min, max]) => min + rand() * (max - min);

  const levels = int(limits.levels);
  const minNodes = limits.nodes[0];
  const budget = int(limits.nodes);

  // Build level by level. Each new node picks a random parent from the level above,
  // so some branches end early and fan-out varies, like real inventories.
  const data = { name: "Root", children: [] };
  let previous = [data];
  let used = 1;
  for (let depth = 1; depth < levels; depth++) {
    // Stay under the budget, and (below the first level) grow enough to reach the minimum.
    const cap = Math.max(1, Math.floor((budget - used) / (levels - depth)));
    const floor = depth === 1 ? 1 : Math.ceil((minNodes - used) / (levels - depth));
    const wanted =
      depth === 1
        ? int(limits.rootChildren)
        : Math.round(previous.length * between(limits.growth));
    const count = Math.max(1, floor, Math.min(cap, wanted));
    const width = String(count).length;

    const current = [];
    for (let i = 0; i < count; i++) {
      const node = { name: `L${depth}-N${String(i + 1).padStart(width, "0")}`, children: [] };
      previous[Math.floor(rand() * previous.length)].children.push(node);
      current.push(node);
    }
    previous = current;
    used += count;
  }

  // Leaves in drawing order; drop empty child arrays.
  const leaves = [];
  (function walk(node) {
    if (node.children.length) node.children.forEach(walk);
    else {
      delete node.children;
      leaves.push(node);
    }
  })(data);

  const n = leaves.length;
  const maxPairs = (n * (n - 1)) / 2;
  const linkCount = Math.min(limits.maxLinks, maxPairs, Math.round(n * between(limits.linksPerLeaf)));
  const span = Math.max(2, Math.round(n * 0.1));

  const leafConnections = [];
  const seen = new Set();
  for (let attempts = 0; leafConnections.length < linkCount && attempts < linkCount * 50; attempts++) {
    const i = Math.floor(rand() * n);
    const j =
      rand() < limits.localLinkBias
        ? Math.min(n - 1, Math.max(0, i + Math.round((rand() * 2 - 1) * span)))
        : Math.floor(rand() * n);
    const key = i < j ? `${i}-${j}` : `${j}-${i}`;
    if (i === j || seen.has(key)) continue;
    seen.add(key);
    leafConnections.push({ source: leaves[i].name, target: leaves[j].name });
  }

  return { data, leafConnections, levels };
}

const params = new URLSearchParams(globalThis.location?.search ?? "");
export const seed = Number.parseInt(params.get("seed"), 10) || Math.floor(Math.random() * 1e9);
export const { data, leafConnections } = generateMockData(seed);

if (globalThis.location) {
  console.info(`Mock data seed ${seed}: add ?seed=${seed} to the URL to reproduce this layout.`);
}
