// Entry point: builds the chart and wires up the toolbar.
import { data, leafConnections } from "./data.js";
import { createChart } from "./chart.js";

if (typeof d3 === "undefined") throw new Error("D3 failed to load.");

const $ = (id) => document.getElementById(id);

const radiusSlider = $("radiusSlider");
const radiusValue = $("radiusValue");
const toggleLeafLinks = $("toggleLeafLinks");
const searchForm = $("searchForm");
const searchInput = $("searchInput");
const chips = [...document.querySelectorAll("[data-label-size]")];

const chart = createChart($("chart"), {
  data,
  connections: leafConnections,
  radius: +radiusSlider.value,
  labelSize: +(chips.find((c) => c.classList.contains("is-active"))?.dataset.labelSize ?? 14),
  showLeafLinks: toggleLeafLinks.checked,
});

// ---- Tree ----
$("btnExpandAll").addEventListener("click", () => chart.expandAll());
$("btnCollapseAll").addEventListener("click", () => chart.collapseAll());
$("btnReset").addEventListener("click", () => chart.reset());

// ---- View ----
$("btnZoomIn").addEventListener("click", () => chart.zoomBy(1.2));
$("btnZoomOut").addEventListener("click", () => chart.zoomBy(1 / 1.2));
$("btnFit").addEventListener("click", () => chart.fit());

// ---- Display ----
radiusValue.textContent = radiusSlider.value;
radiusSlider.addEventListener("input", () => {
  radiusValue.textContent = radiusSlider.value;
  chart.setRadius(+radiusSlider.value);
});

for (const chip of chips) {
  chip.setAttribute("aria-pressed", chip.classList.contains("is-active"));
  chip.addEventListener("click", () => {
    for (const c of chips) {
      c.classList.toggle("is-active", c === chip);
      c.setAttribute("aria-pressed", c === chip);
    }
    chart.setLabelSize(+chip.dataset.labelSize);
  });
}

toggleLeafLinks.addEventListener("change", () => chart.setShowLeafLinks(toggleLeafLinks.checked));

// ---- Search ----
$("nodeOptions").append(
  ...chart.nodeIds().map((id) => Object.assign(document.createElement("option"), { value: id })),
);

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (chart.reveal(searchInput.value)) return;
  searchInput.setCustomValidity("No matching node");
  searchInput.reportValidity();
});
searchInput.addEventListener("input", () => searchInput.setCustomValidity(""));

// ---- Keyboard shortcuts: "/" focuses search, Escape unpins ----
document.addEventListener("keydown", (event) => {
  const typing = event.target.closest?.("input, textarea");
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
