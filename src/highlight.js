// Hover / pin highlighting. All styling lives in style.css; this module only toggles
// classes (plus the dot radius, which CSS can't set portably on SVG circles).

export const dotRadius = (d, active = false) => (active ? 9 : d._children ? 8 : 6);

// Highlight `node`, its root path, its visible subtree, every node connected to that
// subtree by an outer link, and those nodes' root paths.
// `adjacency` maps node id -> Set of connected (visible) nodes.
export function applyHighlight({ gLinks, gOuterLinks, gNodes }, node, adjacency) {
  const pathIds = new Set(node.ancestors().map((d) => d.id));

  // Visible leaves of the subtree (collapsed nodes count as leaves).
  const endpoints = node.leaves();
  const endpointIds = new Set(endpoints.map((d) => d.id));

  const subtreePathIds = new Set();
  for (const leaf of endpoints) {
    for (const a of leaf.ancestors()) subtreePathIds.add(a.id);
  }

  const connected = new Set();
  for (const leaf of endpoints) {
    for (const n of adjacency.get(leaf.id) ?? []) connected.add(n);
  }
  const connectedIds = new Set([...connected].map((d) => d.id));

  const destPathIds = new Set();
  for (const n of connected) {
    for (const a of n.ancestors()) destPathIds.add(a.id);
  }

  const activeIds = new Set([...subtreePathIds, ...destPathIds]);

  gLinks.selectAll("path.link").attr("class", (l) => {
    const id = l.target.id;
    if (pathIds.has(id)) return "link path";
    if (subtreePathIds.has(id)) return "link subtree";
    if (destPathIds.has(id)) return "link dest";
    return "link dim";
  });

  const touches = (l) =>
    endpointIds.has(l.source.id) ||
    endpointIds.has(l.target.id) ||
    connectedIds.has(l.source.id) ||
    connectedIds.has(l.target.id);

  gOuterLinks
    .selectAll("path.outer-link")
    .classed("active", touches)
    .classed("dim", (l) => !touches(l));

  gNodes
    .selectAll("g.node")
    .classed("active", (d) => activeIds.has(d.id))
    .classed("dim", (d) => !activeIds.has(d.id))
    .select("circle.node-dot")
    .attr("r", (d) => dotRadius(d, activeIds.has(d.id)));
}

export function clearHighlight({ gLinks, gOuterLinks, gNodes }) {
  gLinks.selectAll("path.link").attr("class", "link");

  gOuterLinks
    .selectAll("path.outer-link")
    .classed("active", false)
    .classed("dim", false);

  gNodes
    .selectAll("g.node")
    .classed("active", false)
    .classed("dim", false)
    .select("circle.node-dot")
    .attr("r", (d) => dotRadius(d));
}
