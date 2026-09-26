// Pure layout helpers: no DOM access and no d3 global, so they can be unit-tested
// with plain objects that mimic d3.hierarchy nodes ({ data, parent, depth, children, _children }).

export const TAU = 2 * Math.PI;

export function nodeName(d) {
  return d?.data?.name ?? d?.data?.label ?? d?.data?.title ?? "";
}

// Angles come from d3.cluster (0 = top, clockwise), so rotate by -90deg.
export function polarToCartesian(angle, radius) {
  const a = angle - Math.PI / 2;
  return [Math.cos(a) * radius, Math.sin(a) * radius];
}

function normalizeAngle(a) {
  const x = a % TAU;
  return x < 0 ? x + TAU : x;
}

// Signed angular difference b - a, taking the short way round (-PI..PI).
export function shortestDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// Interpolates between two angles the short way round, so nodes don't spin
// all the way around the circle when they cross 0.
export function interpolateAngle(a, b) {
  const d = shortestDelta(a, b);
  return (t) => a + d * t;
}

// Assign a path-based id to every node, e.g. "NSAT/SZ-Core/Prod". Call this before
// collapsing anything; ids stay on the node objects. Duplicate sibling names get a
// "#n" suffix so ids are always unique.
export function assignStableIds(node, id = nodeName(node) || "(unnamed)") {
  node.id = id;
  const seen = new Map();
  for (const child of node.children ?? node._children ?? []) {
    const name = nodeName(child) || "(unnamed)";
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    assignStableIds(child, `${id}/${n > 1 ? `${name}#${n}` : name}`);
  }
}

// Number of tree edges between two nodes (via their lowest common ancestor).
export function treeDistance(a, b) {
  let d = 0;
  while (a.depth > b.depth) (a = a.parent), d++;
  while (b.depth > a.depth) (b = b.parent), d++;
  while (a !== b) (a = a.parent), (b = b.parent), (d += 2);
  return d;
}

// The node that currently stands in for `node` on screen: itself if every ancestor
// is expanded, otherwise its topmost collapsed ancestor.
export function visibleAncestor(node) {
  let rep = node;
  for (let a = node.parent; a; a = a.parent) if (!a.children) rep = a;
  return rep;
}

// Map { source, target, ...extra } connections to leaf nodes (extra fields such as
// `legend` and `arrow` are kept). Endpoints may be a full path id or a leaf name;
// names shared by several leaves are ambiguous and skipped.
export function resolveConnections(leaves, connections) {
  const byId = new Map(leaves.map((l) => [l.id, l]));
  const byName = new Map();
  for (const l of leaves) {
    const name = nodeName(l);
    byName.set(name, byName.has(name) ? null : l); // null marks an ambiguous name
  }
  const find = (key) => byId.get(key) ?? byName.get(key);

  const resolved = [];
  for (const c of connections) {
    const source = find(c.source);
    const target = find(c.target);
    if (source && target) resolved.push({ ...c, source, target });
    else
      console.warn(
        `Skipping connection ${c.source} → ${c.target}: endpoint not found or ambiguous (use the full path id).`,
      );
  }
  return resolved;
}

// Re-route leaf connections to their visible stand-ins and merge duplicates of the same
// legend, so collapsed branches still show how much flows between them.
// Connection `arrow` is "none" (default), "end" (source → target) or "both".
// Returns [{ key, source, target, legend, count, arrowStart, arrowEnd }].
export function aggregateLinks(connections) {
  const byKey = new Map();
  for (const c of connections) {
    const a = visibleAncestor(c.source);
    const b = visibleAncestor(c.target);
    if (a === b) continue; // both ends hidden inside the same collapsed node
    const flipped = b.id < a.id;
    const [source, target] = flipped ? [b, a] : [a, b];
    const legend = c.legend ?? null;
    const key = `${source.id}→${target.id}|${legend ?? ""}`;

    let link = byKey.get(key);
    if (!link) {
      link = { key, source, target, legend, count: 0, arrowStart: false, arrowEnd: false };
      byKey.set(key, link);
    }
    link.count++;
    if (c.arrow === "both") link.arrowStart = link.arrowEnd = true;
    else if (c.arrow === "end") link[flipped ? "arrowStart" : "arrowEnd"] = true;
  }
  return [...byKey.values()];
}

// Angular intervals live on a circle, so also compare against copies shifted by a full turn.
export function arcsOverlap(a, b) {
  return [-TAU, 0, TAU].some((k) => a.s < b.e + k && b.s + k < a.e);
}

// Give each outer link a control radius (stored as link.arc) so that wider arcs sit
// strictly outside the narrower arcs they cover ("rainbow" stacking), and links between
// distant parts of the hierarchy bulge further out.
export function assignArcLayers(links, { rBase, gap, spanBoost, spanPow, maxDepth }) {
  const items = links.map((l) => {
    const a1 = l.source.x;
    const delta = shortestDelta(a1, l.target.x);
    const span = Math.abs(delta);
    const s = normalizeAngle(Math.min(a1, a1 + delta));
    const hierNorm = Math.min(1, treeDistance(l.source, l.target) / (2 * maxDepth));
    return { l, a1, delta, span, s, e: s + span, hierNorm };
  });

  items.sort((A, B) => A.span - B.span);

  const placed = [];
  for (const it of items) {
    let maxLayerUnder = -1;
    for (const other of placed) {
      if (arcsOverlap(it, other)) maxLayerUnder = Math.max(maxLayerUnder, other.layer);
    }
    it.layer = maxLayerUnder + 1;
    placed.push(it);

    const bulge = spanBoost * Math.pow(it.hierNorm, spanPow);
    it.l.arc = {
      layer: it.layer,
      r: rBase + it.layer * gap + bulge,
      a1: it.a1,
      delta: it.delta,
      spanNorm: Math.min(1, it.span / Math.PI),
    };
  }
  return links;
}

// Cubic curve between two polar points, with control points at the mid radius.
export function radialLinkPath(s, t) {
  const midR = (s.y + t.y) / 2;
  const [sx, sy] = polarToCartesian(s.x, s.y);
  const [c1x, c1y] = polarToCartesian(s.x, midR);
  const [c2x, c2y] = polarToCartesian(t.x, midR);
  const [tx, ty] = polarToCartesian(t.x, t.y);
  return `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`;
}

// Arc for an outer link after assignArcLayers has run. The ends start `padStart` /
// `padEnd` px outside the node centres. The curve is split at its midpoint (same
// shape) so the apex is a path vertex that can carry a `marker-mid` arrow.
export function outerArcPath(l, padStart = 0, padEnd = 0) {
  const { a1, delta, r, spanNorm } = l.arc;
  // Tighter control points for wide arcs so they rise "up" rather than "out".
  const K = 0.25 + 0.1 * spanNorm;
  const p0 = polarToCartesian(a1, l.source.y + padStart);
  const p1 = polarToCartesian(a1 + delta * K, r);
  const p2 = polarToCartesian(a1 + delta * (1 - K), r);
  const p3 = polarToCartesian(a1 + delta, l.target.y + padEnd);

  // de Casteljau split at t = 0.5
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const p01 = mid(p0, p1);
  const p12 = mid(p1, p2);
  const p23 = mid(p2, p3);
  const p012 = mid(p01, p12);
  const p123 = mid(p12, p23);
  const m = mid(p012, p123);
  return `M${p0} C${p01} ${p012} ${m} C${p123} ${p23} ${p3}`;
}
