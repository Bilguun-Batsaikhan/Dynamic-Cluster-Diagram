// Entry point: builds the chart and wires up the control panel.
import { data, leafConnections, seed } from "./data.js";
import { createChart } from "./chart.js";
import { createSearch } from "./search.js";
import { createBuilder } from "./builder.js";
import { loadSavedTrees, persistTrees, newTreeId } from "./trees.js";

if (typeof d3 === "undefined") throw new Error("D3 failed to load.");

const $ = (id) => document.getElementById(id);

const radiusSlider = $("radiusSlider");
const arcHeightSlider = $("arcHeightSlider");
const labelSize = $("labelSize");
const nodeSize = $("nodeSize");
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

const chart = createChart($("chart"), {
  tree: current,
  radius: +radiusSlider.value,
  arcHeight: +arcHeightSlider.value,
  labelSize: +labelSize.value,
  nodeScale: +nodeSize.value,
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
labelSize.addEventListener("change", () => chart.setLabelSize(+labelSize.value));
nodeSize.addEventListener("change", () => chart.setNodeScale(+nodeSize.value));
toggleLeafLinks.addEventListener("change", () => chart.setShowLeafLinks(toggleLeafLinks.checked));

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
