// Entry point: builds the chart and wires up the control panel.
import { data, leafConnections, seed } from "./data.js";
import { createChart } from "./chart.js";
import { createSearch } from "./search.js";
import { createBuilder } from "./builder.js";
import { loadSavedTrees, persistTrees, newTreeId } from "./trees.js";
import { applyStyle } from "./styles.js";
import { createSizeInput } from "./sizeInput.js";

if (typeof d3 === "undefined") throw new Error("D3 failed to load.");

const $ = (id) => document.getElementById(id);

const radiusSlider = $("radiusSlider");
const arcHeightSlider = $("arcHeightSlider");
const toggleLeafLinks = $("toggleLeafLinks");
const searchInput = $("searchInput");
const treeSelect = $("treeSelect");

// ---- Trees: the random example first, then any saved in this browser ----
const exampleTree = {
  id: "example",
  name: "Example (random)",
  example: true,
  data,
  connections: leafConnections,
};
const trees = [exampleTree, ...loadSavedTrees()];
let current = exampleTree;

// Pixel defaults for the Appearance size fields. Node size is the dot diameter of an
// expanded node (12 px = the chart's 1× node scale).
const SIZES = {
  label: { value: 14, presets: [10, 12, 14, 18, 24], min: 6, max: 72 },
  node: { value: 12, presets: [8, 12, 16, 24, 36], min: 4, max: 96 },
  arrow: { value: 10, presets: [6, 8, 10, 14, 20], min: 2, max: 80 },
};
const NODE_BASE_DIAMETER = 12;

applyStyle(current.style);
const chart = createChart($("chart"), {
  tree: current,
  radius: +radiusSlider.value,
  arcHeight: +arcHeightSlider.value,
  labelSize: SIZES.label.value,
  nodeScale: SIZES.node.value / NODE_BASE_DIAMETER,
  arrowSize: SIZES.arrow.value,
  showLeafLinks: toggleLeafLinks.checked,
});

const search = createSearch({
  input: searchInput,
  dropdown: $("searchDropdown"),
  crumbs: $("searchCrumbs"),
  list: $("searchList"),
  chart,
});

const builder = createBuilder({
  dialog: $("builder"),
  onCreate(tree) {
    const created = { ...tree, id: newTreeId(), saved: false };
    trees.push(created);
    selectTree(created);
  },
});

function selectTree(tree) {
  current = tree;
  applyStyle(tree.style);
  chart.setTree(tree);
  search.reset();
  renderTreeUI();
}

function renderTreeUI(message) {
  treeSelect.replaceChildren(
    ...trees.map((t) =>
      Object.assign(document.createElement("option"), {
        value: t.id,
        textContent: t.example || t.saved ? t.name : `${t.name} (unsaved)`,
      }),
    ),
  );
  treeSelect.value = current.id;

  $("treeName").textContent = current.name;
  $("treeBadge").textContent = current.example ? `seed ${seed}` : current.saved ? "" : "Unsaved";
  $("treeBadge").hidden = !current.example && current.saved;
  document.title = `${current.name} · Radial Cluster`;

  $("btnSaveTree").disabled = current.example || current.saved;
  $("btnDeleteTree").disabled = current.example;
  $("treeStatus").textContent =
    message ??
    (current.example
      ? "Random example: a new one is generated on every page load."
      : current.saved
        ? "Saved in this browser. Clearing site data removes it."
        : "Not saved: it disappears when the page reloads.");

  renderConnectionLegend();
}

function renderConnectionLegend() {
  const legends = current.legends ?? [];
  $("connectionLegendBox").hidden = !legends.length;
  $("connectionLegend").replaceChildren(
    ...legends.map((l) => {
      const line = Object.assign(document.createElement("span"), { className: "swatch-line" });
      line.style.setProperty("--c", l.color);
      const li = document.createElement("li");
      li.append(line, l.name);
      return li;
    }),
  );
}

treeSelect.addEventListener("change", () => {
  selectTree(trees.find((t) => t.id === treeSelect.value));
});

$("btnNewTree").addEventListener("click", () => builder.open());

$("btnSaveTree").addEventListener("click", () => {
  current.saved = true;
  if (!persistTrees(trees)) {
    current.saved = false;
    renderTreeUI("Couldn't save: browser storage is unavailable or full.");
    return;
  }
  renderTreeUI();
});

$("btnDeleteTree").addEventListener("click", () => {
  if (current.example || !confirm(`Delete "${current.name}"? This can't be undone.`)) return;
  trees.splice(trees.indexOf(current), 1);
  if (current.saved) persistTrees(trees);
  selectTree(exampleTree);
});

// Warn before losing trees that were never saved.
window.addEventListener("beforeunload", (event) => {
  if (trees.some((t) => !t.example && !t.saved)) event.preventDefault();
});

// ---- Nodes ----
$("btnExpandAll").addEventListener("click", () => chart.expandAll());
$("btnCollapseAll").addEventListener("click", () => chart.collapseAll());
$("btnReset").addEventListener("click", () => {
  chart.reset();
  search.reset();
});

// ---- View ----
$("btnZoomIn").addEventListener("click", () => chart.zoomBy(1.2));
$("btnZoomOut").addEventListener("click", () => chart.zoomBy(1 / 1.2));
$("btnFit").addEventListener("click", () => chart.fit());

// ---- Layout ----
function bindSlider(slider, output, format, apply) {
  output.textContent = format(+slider.value);
  slider.addEventListener("input", () => {
    output.textContent = format(+slider.value);
    apply(+slider.value);
  });
}

bindSlider(radiusSlider, $("radiusValue"), String, (v) => chart.setRadius(v));
bindSlider(arcHeightSlider, $("arcHeightValue"), (v) => `${v.toFixed(1)}×`, (v) =>
  chart.setArcHeight(v),
);

// ---- Appearance ----
createSizeInput($("labelSizeInput"), {
  id: "labelSize",
  label: "Label size",
  ...SIZES.label,
  onChange: (px) => chart.setLabelSize(px),
});
createSizeInput($("nodeSizeInput"), {
  id: "nodeSize",
  label: "Node size",
  ...SIZES.node,
  onChange: (px) => chart.setNodeScale(px / NODE_BASE_DIAMETER),
});
createSizeInput($("arrowSizeInput"), {
  id: "arrowSize",
  label: "Arrow size",
  ...SIZES.arrow,
  onChange: (px) => chart.setArrowSize(px),
});
toggleLeafLinks.addEventListener("change", () => chart.setShowLeafLinks(toggleLeafLinks.checked));

// ---- Legend (top-left overlay): collapsible, remembered in this browser ----
const legendToggle = $("legendToggle");
function setLegendOpen(open) {
  legendToggle.setAttribute("aria-expanded", open);
  $("legendBody").hidden = !open;
}
try {
  setLegendOpen(localStorage.getItem("dynamic-cluster-diagram.legend") !== "closed");
} catch {
  setLegendOpen(true);
}
legendToggle.addEventListener("click", () => {
  const open = legendToggle.getAttribute("aria-expanded") !== "true";
  setLegendOpen(open);
  try {
    localStorage.setItem("dynamic-cluster-diagram.legend", open ? "open" : "closed");
  } catch {}
});

// ---- Keyboard shortcuts: "/" focuses search, Escape clears the highlight ----
document.addEventListener("keydown", (event) => {
  if ($("builder").open) return;
  const typing = event.target.closest?.("input, textarea, select");
  if (event.key === "/" && !typing) {
    event.preventDefault();
    searchInput.focus();
  } else if (event.key === "Escape") {
    if (typing) event.target.blur();
    chart.unpin();
  }
});

// ---- Resize (debounced) ----
let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(chart.resize, 150);
});

renderTreeUI();
