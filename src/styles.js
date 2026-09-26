// Per-tree color styles. Each field maps to a CSS custom property used by the chart
// (see style.css); applyStyle sets them on <body> so the chart, legend and search
// swatches all follow the current tree.

export const STYLE_FIELDS = [
  { key: "bg", label: "Background", cssVar: "--chart-bg" },
  { key: "text", label: "Labels", cssVar: "--chart-text" },
  { key: "link", label: "Branches", cssVar: "--link" },
  { key: "node", label: "Expanded node", cssVar: "--node" },
  { key: "nodeCollapsed", label: "Collapsed node", cssVar: "--node-collapsed" },
  { key: "leaf", label: "Leaf node", cssVar: "--leaf" },
  { key: "highlight", label: "Highlight", cssVar: "--hover" },
];

export const THEMES = {
  Midnight: {
    bg: "#090623",
    text: "#e6edf3",
    link: "#27b814",
    node: "#9da7b3",
    nodeCollapsed: "#e6edf3",
    leaf: "#d16d9e",
    highlight: "#58a6ff",
  },
  Daylight: {
    bg: "#f6f8fa",
    text: "#1f2328",
    link: "#8c959f",
    node: "#6e7781",
    nodeCollapsed: "#24292f",
    leaf: "#cf222e",
    highlight: "#0969da",
  },
  Forest: {
    bg: "#0f1a14",
    text: "#e8f0e3",
    link: "#4c8c4a",
    node: "#93a58f",
    nodeCollapsed: "#f0f5e8",
    leaf: "#e0a458",
    highlight: "#7cc4ff",
  },
  Sunset: {
    bg: "#1d1022",
    text: "#fbe9e7",
    link: "#e0823d",
    node: "#b39ca8",
    nodeCollapsed: "#fff3e0",
    leaf: "#ff6b9a",
    highlight: "#ffd166",
  },
};

export const DEFAULT_STYLE = THEMES.Midnight;

export function applyStyle(style = DEFAULT_STYLE, target = document.body) {
  for (const { key, cssVar } of STYLE_FIELDS) {
    target.style.setProperty(cssVar, style[key] ?? DEFAULT_STYLE[key]);
  }
}
