// Radial cluster tree with leaf-to-leaf "outer" arcs. Expects the global `d3` (v7).
import {
  TAU,
  nodeName,
  polarToCartesian,
  interpolateAngle,
  assignStableIds,
  visibleAncestor,
  resolveConnections,
  aggregateLinks,
  assignArcLayers,
  radialLinkPath,
  outerArcPath,
  arcApex,
} from "./layout.js";
import { applyHighlight, applyLinkHighlight, clearHighlight, dotRadius } from "./highlight.js";

const DURATION = 400;

// Arc tuning: stacked arcs sit ARC_GAP apart; links between distant parts of the
// hierarchy bulge outward by up to radius * arcHeight (shaped by ARC_SPAN_POW).
const ARC_GAP = 40;
const ARC_SPAN_POW = 2;

const CHAR_WIDTH = 0.6; // rough glyph width as a fraction of font size
const HIT_MARGIN = 14; // extra clickable radius around each dot

// ---- Expand / collapse ----
// `children` holds visible children; `_children` holds hidden ones (ignored by layout).
function collapse(d) {
  if (d.children) {
    d._children = d.children;
    d.children = null;
  }
}

function expand(d) {
  if (d._children) {
    d.children = d._children;
    d._children = null;
  }
}

function collapseAll(d) {
  (d.children ?? d._children ?? []).forEach(collapseAll);
  collapse(d);
}

function expandAll(d) {
  expand(d);
  (d.children ?? []).forEach(expandAll);
}

const polar = (d) => ({ x: d.x, y: d.y });

function translate(p) {
  const [x, y] = polarToCartesian(p.x, p.y);
  return `translate(${x},${y})`;
}

// Keep labels readable around the circle: flip the ones on the left half.
// The root sits at the centre, so its label is simply placed above it.
function labelTransform(d, offset) {
  if (!d.depth) return `translate(0,${-offset - 4})`;
  const rotate = (d.x * 180) / Math.PI - 90;
  const flip = d.x < Math.PI ? "" : " rotate(180)";
  return `rotate(${rotate}) translate(${offset},0)${flip}`;
}

const isLeaf = (d) => !d.children && !d._children;

// Plain description of a node for the search / browse UI.
function nodeInfo(d) {
  const kids = d.children ?? d._children ?? [];
  return {
    id: d.id,
    name: nodeName(d),
    parentId: d.parent?.id ?? null,
    childCount: kids.length,
    leafCount: d.value,
  };
}

// Transitions interpolate in polar space so nodes and links sweep around the circle
// instead of cutting across it. Each element remembers its current polar position in
// `__polar`, so an interrupted transition continues from wherever it stopped.
function tweenNode(target) {
  return function (d) {
    const el = this;
    const a = el.__polar;
    const b = target(d);
    const ix = interpolateAngle(a.x, b.x);
    const iy = d3.interpolateNumber(a.y, b.y);
    return (t) => translate((el.__polar = { x: ix(t), y: iy(t) }));
  };
}

function tweenLink(target) {
  return function (d) {
    const el = this;
    const a = el.__polar;
    const b = target(d);
    const sx = interpolateAngle(a.s.x, b.s.x);
    const sy = d3.interpolateNumber(a.s.y, b.s.y);
    const tx = interpolateAngle(a.t.x, b.t.x);
    const ty = d3.interpolateNumber(a.t.y, b.t.y);
    return (t) => {
      el.__polar = { s: { x: sx(t), y: sy(t) }, t: { x: tx(t), y: ty(t) } };
      return radialLinkPath(el.__polar.s, el.__polar.t);
    };
  };
}

export function createChart(
  container,
  {
    tree, // { data, connections?, legends?, levelNames? }
    radius = 1000,
    labelSize = 14,
    nodeScale = 1,
    arrowSize = 10, // px height of direction arrows
    arcHeight = 1.5,
    rotation = 0, // degrees clockwise
    showLeafLinks = true,
    // Called with details of the clicked connection (and its apex position in
    // container pixels, updated on pan/zoom), or null when it's deselected.
    onSelectLink = () => {},
  },
) {
  let width = 0;
  let height = 0;
  measure();

  const svg = d3
    .select(container)
    .append("svg")
    .attr("role", "group")
    .attr("aria-label", "Radial cluster diagram");
  const defs = svg.append("defs"); // arrowhead markers, one per legend color
  const g = svg.append("g");
  const gLinks = g.append("g").attr("class", "links");
  const gOuterLinks = g.append("g").attr("class", "outer-links");
  // Invisible, wide click targets for the arcs (above them, below the nodes).
  const gOuterHits = g.append("g").attr("class", "outer-hits");
  const gNodes = g.append("g").attr("class", "nodes");
  const layers = { gLinks, gOuterLinks, gNodes };

  const zoom = d3
    .zoom()
    .scaleExtent([0.2, 4])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
      if (pinnedLinkKey) emitSelectedLink(); // keep the details card on the arc
    });
  svg
    .call(zoom)
    .on("dblclick.zoom", null) // double-clicking a node should not zoom
    .on("click", () => unpin()); // d3.zoom suppresses this click after a drag

  // Only angles come from the cluster layout; radii are set from depth in update().
  const cluster = d3.cluster().size([TAU, 1]);

  // Current tree
  let data;
  let connections;
  let legendById; // legend id -> { id, name, color }
  let levelNames; // name of each depth level below the root (tooltips)

  let root; // d3.hierarchy with collapse state
  let allNodes; // every node, including hidden ones (for search)
  let byId; // node id -> node
  let maxDepth; // depth of the full tree, so rings don't move when expanding
  let resolved; // leaf connections resolved to leaf nodes
  let adjacency = new Map(); // node id -> Set of connected visible nodes
  let connectionCount = new Map(); // node id -> number of leaf connections
  let pinned = null; // highlighted node
  let pinnedLinkKey = null; // highlighted connection (outer link key); excludes `pinned`
  let outerLinks = []; // outer links currently drawn
  let fitTimer = 0;

  // Direction arrows sit at each arc's apex (marker-mid): ends are covered by labels.
  const markerPrefix = `arrow-${Math.random().toString(36).slice(2, 8)}`;
  // `aspect` = marker width relative to its height (arrowSize px).
  const ARROWS = {
    forward: { viewBox: "-5 -5 10 10", aspect: 1, d: "M-5,-5L5,0L-5,5Z" },
    backward: { viewBox: "-5 -5 10 10", aspect: 1, d: "M5,-5L-5,0L5,5Z" },
    both: { viewBox: "-11 -5 22 10", aspect: 2.2, d: "M-11,0L-1,-5L-1,5Z M11,0L1,-5L1,5Z" },
  };
  const markerUrl = (l) => {
    const kind = l.arrowStart && l.arrowEnd ? "both" : l.arrowEnd ? "forward" : l.arrowStart ? "backward" : null;
    if (!kind) return null;
    return `url(#${markerPrefix}-${legendById.has(l.legend) ? l.legend : "default"}-${kind})`;
  };

  load(tree);
  update();
  fit();

  function load(next) {
    data = next.data;
    connections = next.connections ?? [];
    legendById = new Map((next.legends ?? []).map((l) => [l.id, l]));
    levelNames = next.levelNames ?? [];

    renderMarkers();
    g.selectAll(".links > *, .outer-links > *, .outer-hits > *, .nodes > *").interrupt("layout").remove();
    build();
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.5));
  }

  // One marker per legend color and arrow kind. Sized in drawing units (arrowSize px
  // at 100% zoom) so arrows scale with the chart rather than the stroke width.
  function renderMarkers() {
    const colors = [{ id: "default", color: "var(--hover)" }, ...legendById.values()];
    const markers = colors.flatMap((c) =>
      Object.entries(ARROWS).map(([kind, shape]) => ({ id: `${c.id}-${kind}`, color: c.color, ...shape })),
    );
    defs
      .selectAll("marker")
      .data(markers, (d) => d.id)
      .join((enter) =>
        enter
          .append("marker")
          .attr("orient", "auto")
          .attr("markerUnits", "userSpaceOnUse")
          .call((m) => m.append("path")),
      )
      .attr("id", (d) => `${markerPrefix}-${d.id}`)
      .attr("viewBox", (d) => d.viewBox)
      .attr("markerHeight", arrowSize)
      .attr("markerWidth", (d) => arrowSize * d.aspect)
      .select("path")
      .attr("d", (d) => d.d)
      .style("fill", (d) => d.color);
  }

  // Labels sit clear of the dot, which grows with the node size setting.
  function labelOffset() {
    return 3 + 9 * nodeScale;
  }

  function measure() {
    width = container.clientWidth || 900;
    height = container.clientHeight || 700;
  }

  function build() {
    root = d3.hierarchy(data);
    assignStableIds(root);
    root.count(); // node.value = number of leaves below it
    maxDepth = root.height || 1;
    allNodes = root.descendants();
    byId = new Map(allNodes.map((d) => [d.id, d]));
    resolved = resolveConnections(root.leaves(), connections);

    // Initial state: everything collapsed except the root.
    collapseAll(root);
    expand(root);
    root.x0 = 0;
    root.y0 = 0;
    pinned = null;
    setLink(null);
  }

  // ---- Render ----
  function update(source = root, duration = DURATION) {
    cluster(root);
    const nodes = root.descendants();
    // Rotate by shifting every angle (not by rotating the drawing), so labels on the
    // left half still flip and stay readable.
    const shift = (rotation * Math.PI) / 180;
    for (const d of nodes) {
      d.x = (d.x + shift) % TAU;
      d.y = (d.depth / maxDepth) * radius;
    }

    // Entering elements grow out of the source's old position; exiting ones shrink into its new one.
    const from = { x: source.x0 ?? source.x, y: source.y0 ?? source.y };
    const to = polar(source);
    const t = svg.transition("layout").duration(duration);

    renderLinks(root.links(), from, to, t);
    renderOuterLinks(nodes, t);
    renderNodes(nodes, from, to, t);
    refreshHighlight();

    for (const d of nodes) {
      d.x0 = d.x;
      d.y0 = d.y;
    }
  }

  function renderLinks(links, from, to, t) {
    gLinks
      .selectAll("path.link")
      .data(links, (l) => l.target.id)
      .join(
        (enter) =>
          enter
            .append("path")
            .attr("class", "link")
            .property("__polar", { s: from, t: from })
            .attr("d", radialLinkPath(from, from)),
        (update) => update,
        (exit) =>
          exit
            .transition(t)
            .attrTween("d", tweenLink(() => ({ s: to, t: to })))
            .remove(),
      )
      .transition(t)
      .attrTween("d", tweenLink((l) => ({ s: polar(l.source), t: polar(l.target) })));
  }

  function renderOuterLinks(nodes, t) {
    const links = showLeafLinks ? aggregateLinks(resolved) : [];

    adjacency = new Map();
    connectionCount = new Map();
    for (const l of links) {
      for (const [a, b] of [
        [l.source, l.target],
        [l.target, l.source],
      ]) {
        if (!adjacency.has(a.id)) adjacency.set(a.id, new Set());
        adjacency.get(a.id).add(b);
        connectionCount.set(a.id, (connectionCount.get(a.id) ?? 0) + l.count);
      }
    }

    // Start the arcs just outside the outermost ring's labels.
    const outerY = d3.max(nodes, (d) => d.y);
    const longestLabel =
      d3.max(
        nodes.filter((d) => d.y === outerY),
        (d) => nodeName(d).length,
      ) ?? 0;
    assignArcLayers(links, {
      rBase: outerY + labelOffset() + longestLabel * labelSize * CHAR_WIDTH,
      gap: ARC_GAP,
      spanBoost: radius * arcHeight,
      spanPow: ARC_SPAN_POW,
      maxDepth,
    });

    outerLinks = links;
    const arcPath = (l) => outerArcPath(l, ...arcPads(l));

    gOuterLinks
      .selectAll("path.outer-link")
      .data(links, (l) => l.key)
      .join(
        (enter) =>
          enter
            .append("path")
            .attr("class", "outer-link")
            .attr("stroke-opacity", 0)
            .attr("d", arcPath),
        (update) => update,
        (exit) => exit.transition(t).attr("stroke-opacity", 0).remove(),
      )
      .style("--w", (l) => `${1.6 + Math.log2(l.count)}px`) // thicker for merged links
      .style("--c", (l) => legendById.get(l.legend)?.color ?? null)
      .attr("marker-mid", markerUrl)
      .transition(t)
      .attr("stroke-opacity", 1)
      .attr("d", arcPath);

    // Click/hover targets: a wide transparent stroke along each arc, a fixed width on
    // screen at any zoom (non-scaling stroke, see style.css).
    const arcFor = (l) => gOuterLinks.selectAll("path.outer-link").filter((x) => x.key === l.key);
    gOuterHits
      .selectAll("path.outer-hit")
      .data(links, (l) => l.key)
      .join(
        (enter) =>
          enter
            .append("path")
            .attr("class", "outer-hit")
            .attr("d", arcPath)
            .on("click", (event, l) => {
              event.stopPropagation();
              selectLink(l);
            })
            .on("mouseenter", (event, l) => arcFor(l).classed("hover", true))
            .on("mouseleave", (event, l) => arcFor(l).classed("hover", false))
            .call((p) => p.append("title")),
        (update) => update,
        (exit) => exit.remove(),
      )
      .call((p) => p.select("title").text(arcTooltip))
      .transition(t)
      .attr("d", arcPath);
  }

  // Reads in the arrow's direction, e.g. "Crow â†’ Worm Â· Eats (1 connection)".
  function arcTooltip(l) {
    const [from, to] = l.arrowStart && !l.arrowEnd ? [l.target, l.source] : [l.source, l.target];
    const arrow = l.arrowStart && l.arrowEnd ? "â†”" : l.arrowStart || l.arrowEnd ? "â†’" : "â€”";
    const legend = legendById.get(l.legend);
    return (
      `${nodeName(from)} ${arrow} ${nodeName(to)}` +
      `${legend ? ` Â· ${legend.name}` : ""} (${plural(l.count, "connection")})\nClick for details`
    );
  }

  // Arcs start at the edge of each dot rather than its centre.
  function arcPads(l) {
    return [dotRadius(l.source, false, nodeScale) + 1, dotRadius(l.target, false, nodeScale) + 1];
  }

  function renderNodes(nodes, from, to, t) {
    const sel = gNodes
      .selectAll("g.node")
      .data(nodes, (d) => d.id)
      .join(
        (enter) => {
          const node = enter
            .append("g")
            .attr("class", "node")
            .attr("tabindex", 0)
            .attr("role", "button")
            .property("__polar", from)
            .attr("transform", translate(from))
            .attr("opacity", 0)
            // Click highlights; double-click expands/collapses (its two clicks pin first).
            .on("click", (event, d) => {
              event.stopPropagation();
              pin(d);
            })
            .on("dblclick", (event, d) => {
              event.stopPropagation();
              toggle(d);
            })
            // Keyboard: Space highlights, Enter expands/collapses.
            .on("keydown", (event, d) => {
              if (event.key === " ") pin(d);
              else if (event.key === "Enter") toggle(d);
              else return;
              event.preventDefault();
            });

          node.append("circle").attr("class", "node-dot");
          node.append("circle").attr("class", "node-hit"); // big hit area
          node
            .append("text")
            .attr("class", "node-label")
            .attr("dy", "0.32em")
            .attr("transform", (d) => labelTransform(d, labelOffset()))
            .text(nodeName);
          node.append("title");
          return node;
        },
        (update) => update,
        (exit) =>
          exit
            .attr("pointer-events", "none")
            .transition(t)
            .attr("opacity", 0)
            .attrTween("transform", tweenNode(() => to))
            .remove(),
      );

    sel
      .attr("pointer-events", null) // in case a node re-entered while exiting
      .classed("collapsed", (d) => !!d._children)
      .classed("leaf", isLeaf)
      .attr("aria-expanded", (d) => (d.children ? "true" : d._children ? "false" : null))
      .attr(
        "aria-label",
        (d) => `${nodeName(d)}${d._children ? " (collapsed)" : isLeaf(d) ? " (leaf)" : ""}`,
      );

    sel.select("title").text(tooltip);
    sel.select("circle.node-hit").attr("r", (d) => dotRadius(d, false, nodeScale) + HIT_MARGIN);

    sel
      .select("text.node-label")
      .style("font-size", `${labelSize}px`)
      .attr("text-anchor", (d) => (!d.depth ? "middle" : d.x < Math.PI ? "start" : "end"))
      .transition(t)
      .attr("transform", (d) => labelTransform(d, labelOffset()));

    sel
      .transition(t)
      .attr("opacity", 1)
      .attrTween("transform", tweenNode(polar));
  }

  function tooltip(d) {
    const lines = [d.id.split("/").join(" / ")];
    const level = d.depth ? levelNames[d.depth - 1] : null;
    if (level) lines.push(level);
    if (isLeaf(d)) lines.push("Leaf (no children)");
    else {
      lines.push(plural(d.value, "leaf", "leaves"));
      lines.push(d._children ? "Double-click to expand" : "Double-click to collapse");
    }
    const n = connectionCount.get(d.id);
    if (n) lines.push(plural(n, "connection"));
    return lines.join("\n");
  }

  // ---- Highlight ----
  // A selected connection wins; a hidden pinned node is represented by its visible ancestor.
  function refreshHighlight() {
    const link = pinnedLinkKey && outerLinks.find((l) => l.key === pinnedLinkKey);
    if (pinnedLinkKey && !link) setLink(null); // merged away by expand/collapse, or hidden

    const target = !link && pinned && visibleAncestor(pinned);
    gNodes.selectAll("g.node").classed("pinned", (d) => d === target);

    if (link) {
      applyLinkHighlight(layers, link, nodeScale);
      emitSelectedLink();
    } else if (target) applyHighlight(layers, target, adjacency, nodeScale);
    else clearHighlight(layers, nodeScale);
  }

  function setLink(key) {
    if (key === pinnedLinkKey) return;
    pinnedLinkKey = key;
    if (!key) onSelectLink(null);
  }

  function selectLink(l) {
    pinned = null;
    setLink(l.key);
    refreshHighlight();
  }

  function pin(d) {
    pinned = d;
    setLink(null);
    refreshHighlight();
  }

  function unpin() {
    pinned = null;
    setLink(null);
    refreshHighlight();
  }

  function toggle(d) {
    if (d.children) collapse(d);
    else expand(d);
    pinned = d;
    setLink(null);
    update(d);
  }

  // Report the selected connection: its legend, the connections merged into it
  // (with their notes) and where its apex is on screen.
  function emitSelectedLink() {
    const l = outerLinks.find((x) => x.key === pinnedLinkKey);
    if (!l) return;
    const [x, y] = d3.zoomTransform(svg.node()).apply(arcApex(l, ...arcPads(l)));
    onSelectLink({
      key: l.key,
      legend: legendById.get(l.legend) ?? null,
      between: [nodeName(l.source), nodeName(l.target)],
      // true when the arc stands in for connections between hidden (collapsed) leaves
      merged: l.members.some(
        (c) => ![l.source, l.target].includes(c.source) || ![l.source, l.target].includes(c.target),
      ),
      members: l.members.map((c) => ({
        from: nodeName(c.source),
        to: nodeName(c.target),
        arrow: c.arrow ?? "none",
        note: c.note ?? "",
      })),
      x,
      y,
    });
  }

  // ---- View ----
  // Fits the whole drawing into the viewport once the layout transition has finished.
  function fit({ wait = DURATION, duration = 300 } = {}) {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => {
      const box = g.node().getBBox();
      if (!box.width || !box.height) return;

      const pad = 30;
      const scale = Math.min(
        1.2,
        Math.max(
          0.2,
          0.95 / Math.max((box.width + pad * 2) / width, (box.height + pad * 2) / height),
        ),
      );
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;

      svg
        .transition()
        .duration(duration)
        .call(
          zoom.transform,
          d3.zoomIdentity.translate(width / 2 - scale * cx, height / 2 - scale * cy).scale(scale),
        );
    }, wait);
  }

  function find(query) {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return (
      allNodes.find((d) => d.id.toLowerCase() === q) ??
      allNodes.find((d) => nodeName(d).toLowerCase() === q) ??
      allNodes.find((d) => d.id.toLowerCase().includes(q)) ??
      null
    );
  }

  // Ranked matches: exact name, name prefix, name substring, then path substring.
  function search(query, limit) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const rank = (d) => {
      const name = nodeName(d).toLowerCase();
      if (name === q) return 0;
      if (name.startsWith(q)) return 1;
      if (name.includes(q)) return 2;
      return d.id.toLowerCase().includes(q) ? 3 : -1;
    };
    return allNodes
      .map((d) => [rank(d), d])
      .filter(([r]) => r >= 0)
      .sort((a, b) => a[0] - b[0] || a[1].depth - b[1].depth)
      .slice(0, limit)
      .map(([, d]) => nodeInfo(d));
  }

  // ---- Public API ----
  return {
    // Hierarchy lookups for the search / browse dropdown (they see collapsed nodes too).
    rootId: () => root.id,
    childrenOf: (id) => (byId.get(id)?.children ?? byId.get(id)?._children ?? []).map(nodeInfo),
    pathTo: (id) => byId.get(id)?.ancestors().reverse().map(nodeInfo) ?? [],
    search: (query, limit = 50) => search(query, limit),

    expandAll() {
      expandAll(root);
      update();
      fit();
    },

    collapseAll() {
      collapseAll(root);
      expand(root);
      update();
      fit();
    },

    // Show a different tree: { data, connections?, legends?, levelNames? }.
    setTree(next) {
      load(next);
      update();
      fit();
    },

    fit: () => fit({ wait: 0 }),

    zoomBy(k) {
      svg.transition().duration(150).call(zoom.scaleBy, k);
    },

    setRadius(r) {
      radius = r;
      update(root, 0);
    },

    setLabelSize(px) {
      labelSize = px;
      update(root, 0);
    },

    setNodeScale(scale) {
      nodeScale = scale;
      update(root, 0);
    },

    setArrowSize(px) {
      arrowSize = px;
      renderMarkers();
    },

    setArcHeight(h) {
      arcHeight = h;
      update(root, 0);
    },

    setRotation(degrees) {
      rotation = degrees;
      update(root, 0);
    },

    setShowLeafLinks(show) {
      showLeafLinks = show;
      update();
    },

    unpin,

    // Expand the path to the first node matching `query` (an id or name), pin it and
    // pan to it. With `expand`, the node's own children are shown too.
    reveal(query, { expand: expandNode = false } = {}) {
      const node = find(query);
      if (!node) return false;
      node.ancestors().slice(expandNode ? 0 : 1).forEach(expand);
      pinned = node;
      setLink(null);
      update();

      clearTimeout(fitTimer);
      const k = Math.max(d3.zoomTransform(svg.node()).k, 1);
      const [x, y] = polarToCartesian(node.x, node.y);
      svg
        .transition()
        .duration(600)
        .call(zoom.transform, d3.zoomIdentity.translate(width / 2 - k * x, height / 2 - k * y).scale(k));
      return true;
    },

    // Keep the current zoom/pan, but keep the drawing centred in the resized viewport.
    resize() {
      const oldW = width;
      const oldH = height;
      measure();
      const { k } = d3.zoomTransform(svg.node());
      svg.call(zoom.translateBy, (width - oldW) / 2 / k, (height - oldH) / 2 / k);
    },
  };
}

function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
