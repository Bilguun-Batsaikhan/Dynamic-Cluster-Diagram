import { leafConnections } from "./data.js";
import { data } from "./data.js";
// app.js (Radial Cluster Tree + Controls)
// Requirements:
// - D3 loaded (v6/v7 recommended)
// - A variable named `data` exists BEFORE this script runs (tree JSON)
// - HTML has: <div id="chart"></div> and control buttons with the ids you posted.

(function () {
  if (typeof d3 === "undefined") throw new Error("D3 is not loaded.");
  if (typeof data === "undefined" || !data)
    throw new Error(
      "Missing global `data`. Define `data` before app.js is loaded.",
    );

  const container = document.getElementById("chart");
  if (!container) throw new Error("Missing #chart container element.");

  // ---- Controls ----
  const btnExpandAll = document.getElementById("btnExpandAll");
  const btnCollapseAll = document.getElementById("btnCollapseAll");
  const btnReset = document.getElementById("btnReset");
  const btnZoomIn = document.getElementById("btnZoomIn");
  const btnZoomOut = document.getElementById("btnZoomOut");
  const btnViewReset = document.getElementById("btnViewReset");

  const radiusSlider = document.getElementById("radiusSlider");
  const radiusValueEl = document.getElementById("radiusValue");
  const toggleLeafLinks = document.getElementById("toggleLeafLinks");

  // ---- UI state ----
  let radiusValue = 1000;
  let labelFontSize = 12;
  let showLeafLinks = true;
  // Leaf connection adjacency (recomputed each update)
  let leafAdjacency = new Map(); // nodeId -> Set(nodeId)

  // ---- Helpers ----
  function getSize() {
    // If your CSS doesn't give #chart a height, it can be 0. Provide fallbacks.
    const w = container.clientWidth || 900;
    const h = container.clientHeight || 700;
    return { w, h };
  }

  function safeName(d) {
    return d?.data?.name ?? d?.data?.label ?? d?.data?.title ?? "";
  }

  // Assign a stable id to EVERY node (including collapsed nodes in _children).
  // Using the full path avoids collisions like multiple "Tier-Web" nodes.
  function assignStableIds(node, parentId = "") {
    const name = safeName(node) || "(unnamed)";
    const id = parentId ? `${parentId}/${name}` : name;
    node.id = id;
    if (node.children) node.children.forEach((c) => assignStableIds(c, id));
    if (node._children) node._children.forEach((c) => assignStableIds(c, id));
  }

  function polarToCartesian(angle, radius) {
    // d3 cluster uses angle in radians; rotate by -90deg so it starts at top
    const a = angle - Math.PI / 2;
    return [Math.cos(a) * radius, Math.sin(a) * radius];
  }

  // ---- SVG + Zoom layer ----
  let { w: width, h: height } = getSize();

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .style("cursor", "grab");

  const g = svg.append("g"); // zoomed group
  const gLinks = g.append("g").attr("class", "links");
  const gOuterLinks = g.append("g").attr("class", "outer-links");
  const gNodes = g.append("g").attr("class", "nodes");

  const zoom = d3
    .zoom()
    .scaleExtent([0.2, 4])
    .on("zoom", (event) => g.attr("transform", event.transform));
  //Attach the zoom behavior to the SVG element.
  svg.call(zoom);

  // ---- Layout ----
  function getRadius() {
    return radiusValue;
  }

  let radius = getRadius();
  // creates a radial (circular) layout using polar coordinates.
  const cluster = d3.cluster().size([2 * Math.PI, radius]);

  // ---- Build hierarchy ----
  /*
  class HierarchyNode {
  data        // original data object
  parent      // reference to parent node
  children[]  // array of child HierarchyNodes
  depth       // distance from root
  height      // distance to furthest leaf
  value       // optional (used by some layouts)
}
   */
  let root = d3.hierarchy(data);
  root.x0 = 0; // angle (radians)
  root.y0 = 0; // radius (distance from center)

  // Save an "initial state" snapshot by collapsing everything at start
  collapseAll(root);
  // but keep root expanded so you can see top-level
  expandNode(root);

  // Assign stable ids for joins (includes collapsed nodes)
  assignStableIds(root);

  update(root);
  requestAnimationFrame(fitToView);

  // ---- Core actions ----
  // Save the other nodes data in _children when collapsing and mark node as collapsed by setting children to null
  function collapseNode(d) {
    if (d.children) {
      d._children = d.children;
      d.children = null;
    }
  }

  function expandNode(d) {
    if (d._children) {
      d.children = d._children;
      d._children = null;
    }
  }
  // Recursively collapses the entire tree by hiding all children nodes, while keeping them stored internally so they can be expanded later. children is "visible children", if node has children it is considered expanded. _children is "hidden children", ignored by layout and rendering.
  function collapseAll(d) {
    if (d.children) {
      d.children.forEach(collapseAll);
      collapseNode(d);
    }
    // collapse all children of collapsed nodes too
    if (d._children) {
      d._children.forEach(collapseAll);
    }
  }

  function expandAll(d) {
    expandNode(d);
    if (d.children) d.children.forEach(expandAll);
  }

  function resetToInitial() {
    // Fully rebuild hierarchy (avoids broken parent pointers / stale heights)
    gLinks.selectAll("*").remove();
    gOuterLinks.selectAll("*").remove();
    gNodes.selectAll("*").remove();

    root = d3.hierarchy(data);
    root.x0 = 0;
    root.y0 = 0;

    // restore the initial collapsed state (everything collapsed, root expanded)
    collapseAll(root);
    expandNode(root);

    // stable ids must cover both children and _children
    assignStableIds(root);

    update(root);
    requestAnimationFrame(fitToView);
  }

  // ---- Update/render ----
  function update(source) {
    // Update dimensions/layout (in case resized)
    ({ w: width, h: height } = getSize());
    svg.attr("width", width).attr("height", height);

    radius = getRadius();
    cluster.size([2 * Math.PI, radius]);

    // Ensure ids stay defined even when nodes are expanded/collapsed
    assignStableIds(root);

    // Ensure every node (including collapsed ones) has a stable id
    // so joins/highlighting never see undefined ids.
    assignStableIds(root);

    // Compute layout
    cluster(root);

    // IMPORTANT: d3.cluster() sets y using (depth * radius / root.height).
    // If root.height becomes 0 or stale after collapse/expand/reset, y can become NaN.
    // So we compute radial distance ourselves from depth (always safe).
    const nodes = root.descendants();
    const maxDepth = d3.max(nodes, (d) => d.depth) || 1;
    nodes.forEach((d) => {
      d.y = (d.depth / maxDepth) * radius;
    });

    const links = root.links();

    // ---- LINKS ----
    const linkSel = gLinks
      .selectAll("path.link")
      .data(links, (d) => d.target.id);

    const linkEnter = linkSel
      .enter()
      .append("path")
      .attr("class", "link")
      .attr("fill", "none")
      .attr("stroke", "rgb(39, 184, 20)")
      // initial setup for the links
      .attr("stroke-opacity", 0.9)
      .attr("stroke-width", 1.5);

    linkEnter.merge(linkSel).attr("d", (d) => {
      // Radial curved link:
      // Use cubic-ish curve by going from source angle/r to target angle/r,
      // via an intermediate radius.
      const [sx, sy] = polarToCartesian(d.source.x, d.source.y);
      const [tx, ty] = polarToCartesian(d.target.x, d.target.y);

      // Intermediate control points (keep at mid radius)
      const midR = (d.source.y + d.target.y) / 2;
      const [c1x, c1y] = polarToCartesian(d.source.x, midR);
      const [c2x, c2y] = polarToCartesian(d.target.x, midR);

      return `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`;
    });

    linkSel.exit().remove();

    // ---- OUTER (leaf-to-leaf) LINKS ----
    // Only draw when enabled, and only when both endpoints are currently visible leaves.
    const visibleLeaves = nodes.filter((d) => !d.children && !d._children);
    const leafByName = new Map(visibleLeaves.map((d) => [safeName(d), d]));

    const outerLinksData = showLeafLinks
      ? leafConnections
          .map((l) => ({
            source: leafByName.get(l.source),
            target: leafByName.get(l.target),
          }))
          .filter((l) => l.source && l.target)
      : [];

    // Build adjacency so hovering a node can highlight its connected endpoints
    leafAdjacency = new Map();
    for (const l of outerLinksData) {
      const a = l.source?.id;
      const b = l.target?.id;
      if (!a || !b) continue; // safety
      if (!leafAdjacency.has(a)) leafAdjacency.set(a, new Set());
      if (!leafAdjacency.has(b)) leafAdjacency.set(b, new Set());
      leafAdjacency.get(a).add(b);
      leafAdjacency.get(b).add(a);
    }

    // Assign each outer link a layer so overlapping angular spans don't sit on the same radius.
    // Greedy "interval coloring" on the circle (fast + looks good).
    // ---------------------------------------------------------
    // ARC TUNING: Make them bulge high like the red drawing
    // ---------------------------------------------------------

    // 1. Base Radius: Start just outside the text labels
    // (Adjust this if arcs overlap your text)
    const rArcBase = radius + 40;

    // 2. Gap: Space between stacked lines
    const arcGap = 40;

    // 3. Span Boost: How high do long links go?
    // INCREASED to 2.0 (was 0.7). This makes cross-circle links HUGE.
    const spanBoost = radius * 1.5;

    // 4. Power Curve: Controls the "shape" of the growth.
    // 3.0 means short links stay low, but long links grow exponentially.
    const spanPow = 2.0;

    const TAU = 2 * Math.PI;
    const norm = (a) => {
      let x = a % TAU;
      if (x < 0) x += TAU;
      return x;
    };

    // Compute LCA for two nodes
    function lcaDepth(a, b) {
      const seen = new Set();
      for (let x = a; x; x = x.parent) seen.add(x);
      for (let y = b; y; y = y.parent) {
        if (seen.has(y)) return y.depth;
      }
      return 0; // root fallback
    }

    // Assign layers so larger spans are strictly outside smaller overlapping spans
    function assignArcLayers(links) {
      const items = links.map((l) => {
        const a1 = l.source.x;
        const a2 = l.target.x;

        let delta = a2 - a1;
        while (delta > Math.PI) delta -= TAU;
        while (delta < -Math.PI) delta += TAU;

        const a2short = a1 + delta;
        let s, e;
        if (delta >= 0) {
          s = norm(a1);
          e = norm(a2short);
          if (e < s) e += TAU;
        } else {
          s = norm(a2short);
          e = norm(a1);
          if (e < s) e += TAU;
        }

        const span = Math.abs(delta);

        // ---- NEW: hierarchy distance ----
        const lcaD = lcaDepth(l.source, l.target);
        const dist = l.source.depth + l.target.depth - 2 * lcaD; // tree distance in edges
        const hierNorm = Math.min(1, dist / (2 * maxDepth)); // normalize to ~0..1
        return {
          l,
          a1,
          a2short,
          delta,
          span,
          s,
          e,
          spanNorm: Math.min(1, span / Math.PI),
          hierNorm,
        };
      });

      // 1. Sort SMALL spans to LARGE spans (Rainbow order)
      items.sort((A, B) => A.span - B.span);

      const overlaps = (a, b) => !(a.e <= b.s || b.e <= a.s);
      const assigned = [];

      for (const it of items) {
        // 2. Find the highest layer of anything currently under this arc
        let maxLayerUnder = -1;
        for (const other of assigned) {
          if (overlaps(it, other)) {
            maxLayerUnder = Math.max(maxLayerUnder, other.layer);
          }
        }

        // 3. This arc must be exactly one layer higher than the highest one it covers
        it.layer = maxLayerUnder + 1;
        assigned.push(it);

        // 4. Calculate Final Radius
        // Combining LayerStacking + ExponentialBulge for maximum "Rainbow" separation
        const bulge = spanBoost * Math.pow(it.hierNorm, spanPow);
        it.l.__arc = {
          layer: it.layer,
          r: rArcBase + it.layer * arcGap + bulge,
          a1: it.a1,
          a2short: it.a2short,
          delta: it.delta,
          spanNorm: it.spanNorm,
        };
      }
    }

    // compute layers & store per-link arc params
    assignArcLayers(outerLinksData);

    function outerArcPath(l) {
      const arc = l.__arc;
      if (!arc) return "";

      const s = l.source;
      const t = l.target;

      const a1 = arc.a1;
      const a2 = arc.a2short;

      const rStart = s?.y ?? 0;
      const rEnd = t?.y ?? 0;

      // shortest angular delta
      let da = a2 - a1;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;

      // Control Point Spread (K)
      // For very high arches, we tighten the control points slightly
      // so the curve goes "up" faster rather than "out".
      const K = 0.25 + 0.1 * arc.spanNorm;

      const [sx, sy] = polarToCartesian(a1, rStart);
      const [tx, ty] = polarToCartesian(a1 + da, rEnd);

      const rCtrl = arc.r; // This now includes the massive spanBoost

      // Control points
      const [c1x, c1y] = polarToCartesian(a1 + da * K, rCtrl);
      const [c2x, c2y] = polarToCartesian(a1 + da * (1 - K), rCtrl);

      return `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`;
    }

    const outerSel = gOuterLinks
      .selectAll("path.outer-link")
      .data(
        outerLinksData,
        (d) => `${safeName(d.source)}→${safeName(d.target)}`,
      );

    outerSel
      .enter()
      .append("path")
      .attr("class", "outer-link")
      .attr("d", outerArcPath)
      .attr("stroke-linecap", "round")
      .attr("opacity", 0.85)
      .on("mouseenter", (event, l) => highlightConnected(l.source))
      .on("mouseleave", resetHighlight);

    outerSel.attr("d", outerArcPath);

    outerSel.exit().remove();

    // ---- NODES ----

    const nodeSel = gNodes.selectAll("g.node").data(nodes, (d) => d.id);

    const nodeEnter = nodeSel
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", () => {
        const [x, y] = polarToCartesian(source.x0 ?? 0, source.y0 ?? 0);
        return `translate(${x},${y})`;
      });

    // visible dot
    nodeEnter
      .append("circle")
      .attr("class", "node-dot")
      .attr("r", (d) => (d._children ? 8 : 6)) // Slightly larger for collapsed
      .attr("fill", (d) =>
        d._children ? "var(--node-collapsed)" : "var(--node)",
      );

    // big hit area for easy clicking/hover
    nodeEnter
      .append("circle")
      .attr("class", "node-hit")
      .attr("r", 20)
      .attr("fill", "transparent")
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        if (d.children) collapseNode(d);
        else expandNode(d);
        update(d);
      })
      .on("mouseenter", (event, d) => highlightConnected(d))
      .on("mouseleave", resetHighlight);

    // label
    nodeEnter
      .append("text")
      .attr("class", "node-label")
      .text((d) => safeName(d))
      .style("font-size", `${labelFontSize}px`)
      .style("pointer-events", "none")
      .attr("dy", "0.32em")
      .attr("paint-order", "stroke") // Draw the stroke *behind* the text
      .attr("stroke", "var(--bg)") // Match your CSS background color (#dee5ed)
      .attr("stroke-width", 3) // How thick the "background" mask should be
      .attr("stroke-linejoin", "round"); // Smooths out corners of the outline

    // tooltip title (optional)
    nodeEnter.append("title").text((d) => safeName(d));

    // Position nodes in radial coordinates
    const nodeMerge = nodeEnter.merge(nodeSel);

    // Keep label size in sync with UI
    nodeMerge
      .select("text.node-label")
      .style("font-size", `${labelFontSize}px`);

    nodeMerge.attr("transform", (d) => {
      const [x, y] = polarToCartesian(d.x, d.y);
      return `translate(${x},${y})`;
    });

    // Label orientation: readable around the circle
    nodeMerge
      .select("text.node-label")
      .attr("transform", (d) => {
        const angleDeg = (d.x * 180) / Math.PI;
        const isRightSide = d.x < Math.PI; // 0..180 degrees
        const rotate = angleDeg - 90;
        const translate = 12;
        const flip = isRightSide ? "" : " rotate(180)";
        return `rotate(${rotate}) translate(${translate},0)${flip}`;
      })
      .attr("text-anchor", (d) => (d.x < Math.PI ? "start" : "end"));

    nodeSel.exit().remove();

    // Save previous positions for next click animation (basic)
    nodes.forEach((d) => {
      d.x0 = d.x;
      d.y0 = d.y;
    });
  }

  function highlightConnected(node) {
    if (!node) return;

    const nodeId = node.id;

    // thick: selected -> root
    const pathIds = new Set(node.ancestors().map((d) => d.id));

    // lookup rendered nodes
    const nodeById = new Map();
    gNodes.selectAll("g.node").each(function (d) {
      nodeById.set(d.id, d);
    });

    // leaves in the VISIBLE subtree (Option A)
    const subtreeLeaves = node.leaves();
    const subtreeLeafIds = new Set(subtreeLeaves.map((d) => d.id));

    // medium: all nodes on root->leaf paths for leaves in subtree
    const subtreePathIds = new Set();
    for (const leaf of subtreeLeaves) {
      for (const a of leaf.ancestors()) subtreePathIds.add(a.id);
    }

    // union of adjacency for ALL subtree leaves
    const connectedLeafIds = new Set();
    for (const leafId of subtreeLeafIds) {
      const neigh = leafAdjacency.get(leafId);
      if (!neigh) continue;
      for (const x of neigh) connectedLeafIds.add(x);
    }

    // active = thick path + subtree paths + connected leaves + their root paths
    const activeIds = new Set([...pathIds, ...subtreePathIds]);
    const destinationPathIds = new Set();

    for (const leafId of connectedLeafIds) {
      activeIds.add(leafId);
      const leafNode = nodeById.get(leafId);
      for (const a of leafNode.ancestors()) {
        destinationPathIds.add(a.id);
        activeIds.add(a.id); // still active, just styled differently
      }
    }

    // --- Tree links styling (unchanged, but uses activeIds/pathIds) ---
    gLinks
      .selectAll("path.link")
      .attr("stroke", (l) => {
        const id = l.target.id;

        if (pathIds.has(id)) return "var(--hover)"; // primary
        if (subtreePathIds.has(id)) return "var(--hover)"; // subtree
        if (destinationPathIds.has(id)) return "var(--dest)"; // NEW color
        return "var(--link)";
      })
      .attr("stroke-opacity", (l) => {
        const id = l.target.id;
        if (pathIds.has(id)) return 1.0;
        if (subtreePathIds.has(id)) return 0.6;
        if (destinationPathIds.has(id)) return 0.6;
        return 0.05;
      })
      .attr("stroke-width", (l) => {
        const id = l.target.id;
        // root->selected path thickness
        if (pathIds.has(id)) return 5;
        // subtree paths thickness
        if (subtreePathIds.has(id) || destinationPathIds.has(id)) return 2;
        // return 2;
      });

    // --- Outer arcs: active if touches subtree leaf OR a connected leaf (unchanged logic) ---
    gOuterLinks
      .selectAll("path.outer-link")
      .classed("active", (l) => {
        const s = l.source?.id,
          t = l.target?.id;
        return (
          subtreeLeafIds.has(s) ||
          subtreeLeafIds.has(t) ||
          connectedLeafIds.has(s) ||
          connectedLeafIds.has(t)
        );
      })
      .classed("dim", (l) => {
        const s = l.source?.id,
          t = l.target?.id;
        return !(
          subtreeLeafIds.has(s) ||
          subtreeLeafIds.has(t) ||
          connectedLeafIds.has(s) ||
          connectedLeafIds.has(t)
        );
      });

    // --- Nodes + labels (unchanged, uses activeIds) ---
    gNodes.selectAll("g.node").each(function (d) {
      const isActive = activeIds.has(d.id);
      const g = d3.select(this);

      g.select("circle.node-dot")
        .attr(
          "fill",
          isActive
            ? "var(--hover)"
            : d._children
              ? "var(--node-collapsed)"
              : "var(--node)",
        )
        .attr("r", isActive ? 9 : d._children ? 8 : 6)
        .attr("opacity", isActive ? 1 : 0.3);

      g.select("text.node-label")
        .style("fill", isActive ? "#fff" : "var(--muted)")
        .style("font-weight", isActive ? "bold" : "normal")
        .style("opacity", isActive ? 1 : 0.1);
    });
  }

  function resetHighlight() {
    // 0. Reset Outer (leaf-to-leaf) Links
    gOuterLinks
      .selectAll("path.outer-link")
      .classed("active", false)
      .classed("dim", false);

    // 1. Reset Links to var(--link)
    gLinks
      .selectAll("path.link")
      .attr("stroke", "var(--link)")
      .attr("stroke-opacity", 1)
      .attr("stroke-width", 1.5);

    // 2. Reset Nodes to var(--node) or var(--node-collapsed)
    gNodes.selectAll("g.node").each(function (d) {
      const g = d3.select(this);

      g.select("circle.node-dot")
        .attr("fill", d._children ? "var(--node-collapsed)" : "var(--node)")
        .attr("r", d._children ? 8 : 6);

      // 3. Reset Labels to var(--text)
      g.select("text.node-label")
        .style("fill", "var(--text)")
        .style("font-weight", "normal")
        .style("opacity", 1);
    });
  }

  // ---- Fit to view / center ----
  function fitToView() {
    // Center the graph at the middle of the SVG.
    // Then scale to fit bounding box.
    const bbox = g.node().getBBox();
    if (!bbox || bbox.width === 0 || bbox.height === 0) {
      // fallback: just center at viewport
      svg.call(
        zoom.transform,
        d3.zoomIdentity.translate(width / 2, height / 2).scale(1),
      );
      return;
    }

    const pad = 30;
    const bw = bbox.width + pad * 2;
    const bh = bbox.height + pad * 2;

    const scale = Math.min(
      1.2,
      Math.max(0.2, 0.95 / Math.max(bw / width, bh / height)),
    );

    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;

    const tx = width / 2 - scale * cx;
    const ty = height / 2 - scale * cy;

    svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  // ---- Wire up controls ----
  if (btnExpandAll) {
    btnExpandAll.addEventListener("click", () => {
      expandAll(root);
      update(root);
      requestAnimationFrame(fitToView);
    });
  }

  if (btnCollapseAll) {
    btnCollapseAll.addEventListener("click", () => {
      // collapse everything but keep root visible
      collapseAll(root);
      expandNode(root);
      update(root);
      requestAnimationFrame(fitToView);
    });
  }

  if (btnReset) {
    btnReset.addEventListener("click", () => {
      resetToInitial();
    });
  }

  if (btnZoomIn) {
    btnZoomIn.addEventListener("click", () => {
      svg.transition().duration(150).call(zoom.scaleBy, 1.2);
    });
  }

  if (btnZoomOut) {
    btnZoomOut.addEventListener("click", () => {
      svg
        .transition()
        .duration(150)
        .call(zoom.scaleBy, 1 / 1.2);
    });
  }

  if (btnViewReset) {
    btnViewReset.addEventListener("click", () => {
      requestAnimationFrame(fitToView);
    });
  }

  if (radiusSlider) {
    // init
    radiusValue = +radiusSlider.value || radiusValue;
    if (radiusValueEl) radiusValueEl.textContent = String(radiusValue);

    radiusSlider.addEventListener("input", (e) => {
      radiusValue = +e.target.value;
      if (radiusValueEl) radiusValueEl.textContent = String(radiusValue);
      update(root);
      requestAnimationFrame(fitToView);
    });
  }

  // Label-size chips
  document.querySelectorAll("[data-label-size]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const size = +btn.dataset.labelSize;
      if (!Number.isFinite(size)) return;
      labelFontSize = size;

      document
        .querySelectorAll("[data-label-size]")
        .forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");

      update(root);
    });
  });

  if (toggleLeafLinks) {
    showLeafLinks = !!toggleLeafLinks.checked;
    toggleLeafLinks.addEventListener("change", () => {
      showLeafLinks = !!toggleLeafLinks.checked;
      update(root);
    });
  }

  // Resize handling
  window.addEventListener("resize", () => {
    requestAnimationFrame(() => {
      update(root);
      fitToView();
    });
  });

  // Optional: click empty area to reset highlight
  svg.on("click", () => resetHighlight());
})();
