// Entry point: builds the chart and wires up the control panel.
import { data, leafConnections, seed } from "./data.js";
import { createChart } from "./chart.js";
import { createSearch } from "./search.js";
import { createBuilder, canEdit } from "./builder.js";
import { loadSavedTrees, storeTree, unstoreTree, newTreeId } from "./trees.js";
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
  label: { value: 24, presets: [12, 16, 20, 24, 32], min: 6, max: 72 },
  node: { value: 24, presets: [12, 16, 20, 24, 32], min: 4, max: 96 },
  arrow: { value: 24, presets: [12, 16, 20, 24, 32], min: 2, max: 80 },
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
  onSelectLink: renderConnectionCard,
});

// ---- Connection details card: shown when an arc is clicked, anchored to its apex ----
const ARROW_GLYPHS = { end: "→", both: "↔", none: "—" };

function make(tag, className, text) {
  return Object.assign(document.createElement(tag), { className: className ?? "", textContent: text ?? "" });
}

function renderConnectionCard(detail) {
  const card = $("connectionCard");
  if (!detail) {
    card.hidden = true;
    delete card.dataset.key;
    return;
  }
  if (card.dataset.key !== detail.key) {
    fillConnectionCard(card, detail);
    card.dataset.key = detail.key;
  }
  card.hidden = false;
  positionConnectionCard(card, detail.x, detail.y);
}

function fillConnectionCard(card, { legend, between, merged, members }) {
  const swatch = make("span", "swatch-line");
  if (legend) swatch.style.setProperty("--c", legend.color);
  const close = make("button", "conn-card-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  close.addEventListener("click", () => chart.unpin());

  const parts = [make("div", "conn-card-head")];
  parts[0].append(swatch, make("strong", "conn-card-title", legend?.name ?? "Connection"), close);
  if (merged) {
    const count = `${members.length} connection${members.length === 1 ? "" : "s"}`;
    parts.push(make("p", "conn-card-sub", `${count} between ${between[0]} and ${between[1]}`));
  }

  const list = make("ul", "conn-card-list");
  for (const m of members) {
    const li = make("li");
    li.append(
      make("div", "conn-card-route", `${m.from} ${ARROW_GLYPHS[m.arrow] ?? "—"} ${m.to}`),
      make("p", m.note ? "conn-card-note" : "conn-card-note empty", m.note || "No explanation added."),
    );
    list.append(li);
  }
  parts.push(list);
  card.replaceChildren(...parts);
}

// Beside the arc's apex, flipped/clamped so it stays inside the chart area.
function positionConnectionCard(card, x, y) {
  const chartEl = $("chart");
  const stage = card.offsetParent;
  const gap = 14;
  const ax = chartEl.offsetLeft + x;
  const ay = chartEl.offsetTop + y;
  let left = ax + gap;
  if (left + card.offsetWidth > stage.clientWidth - 8) left = ax - gap - card.offsetWidth;
  left = Math.max(8, Math.min(left, stage.clientWidth - card.offsetWidth - 8));
  const top = Math.max(8, Math.min(ay - 20, stage.clientHeight - card.offsetHeight - 8));
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

const search = createSearch({
  input: searchInput,
  dropdown: $("searchDropdown"),
  crumbs: $("searchCrumbs"),
  list: $("searchList"),
  chart,
});

// Tree states: `saved` = stored in this browser; `dirty` = saved, but edited since.
const builder = createBuilder({
  dialog: $("builder"),
  onSubmit(tree, edited) {
    if (edited) {
      Object.assign(edited, tree, { dirty: edited.saved });
      selectTree(edited);
    } else {
      const created = { ...tree, id: newTreeId(), saved: false, dirty: false };
      trees.push(created);
      selectTree(created);
    }
  },
});

const hasUnsavedWork = (t) => !t.example && (!t.saved || t.dirty);

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
        textContent: !t.saved && !t.example ? `${t.name} (unsaved)` : t.dirty ? `${t.name} (edited)` : t.name,
      }),
    ),
  );
  treeSelect.value = current.id;

  $("treeName").textContent = current.name;
  $("treeBadge").textContent = current.example
    ? `seed ${seed}`
    : !current.saved
      ? "Unsaved"
      : current.dirty
        ? "Unsaved changes"
        : "";
  $("treeBadge").hidden = !$("treeBadge").textContent;
  document.title = `${current.name} · Radial Cluster`;

  const editable = canEdit(current);
  $("btnEditTree").disabled = !editable;
  $("btnEditTree").title = current.example
    ? "The random example can't be edited"
    : editable
      ? "Edit this tree"
      : "This tree was saved without its editing data";
  $("btnSaveTree").disabled = !hasUnsavedWork(current);
  $("btnDeleteTree").disabled = current.example;
  $("treeStatus").textContent =
    message ??
    (current.example
      ? "Random example: a new one is generated on every page load."
      : !current.saved
        ? "Not saved: it disappears when the page reloads."
        : current.dirty
          ? "Edited: press Save to keep the changes. Reloading brings back the saved version."
          : "Saved in this browser. Clearing site data removes it.");

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
$("btnEditTree").addEventListener("click", () => {
  if (canEdit(current)) builder.open({ tree: current });
});

$("btnSaveTree").addEventListener("click", () => {
  if (!storeTree(current)) {
    renderTreeUI("Couldn't save: browser storage is unavailable or full.");
    return;
  }
  current.saved = true;
  current.dirty = false;
  renderTreeUI();
});

$("btnDeleteTree").addEventListener("click", () => {
  if (current.example || !confirm(`Delete "${current.name}"? This can't be undone.`)) return;
  trees.splice(trees.indexOf(current), 1);
  if (current.saved) unstoreTree(current.id);
  selectTree(exampleTree);
});

// Warn before losing new trees or edits that weren't saved.
window.addEventListener("beforeunload", (event) => {
  if (trees.some(hasUnsavedWork)) event.preventDefault();
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
