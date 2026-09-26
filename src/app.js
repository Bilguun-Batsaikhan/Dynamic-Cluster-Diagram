// Entry point: builds the chart and wires up the control panel.
import { data, leafConnections } from "./data.js";
import { createChart } from "./chart.js";
import { createSearch } from "./search.js";

if (typeof d3 === "undefined") throw new Error("D3 failed to load.");

const $ = (id) => document.getElementById(id);

const radiusSlider = $("radiusSlider");
const arcHeightSlider = $("arcHeightSlider");
const labelSize = $("labelSize");
const nodeSize = $("nodeSize");
const toggleLeafLinks = $("toggleLeafLinks");
const searchInput = $("searchInput");

const chart = createChart($("chart"), {
  data,
  connections: leafConnections,
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

// ---- Tree ----
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
  const sync = () => {
    output.textContent = format(+slider.value);
    apply(+slider.value);
  };
  output.textContent = format(+slider.value);
  slider.addEventListener("input", sync);
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
