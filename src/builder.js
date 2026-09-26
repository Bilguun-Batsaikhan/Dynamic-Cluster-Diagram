// "New tree" dialog: name the tree and its levels, add nodes level by level, define
// connection legends (name + color) and connect leaves, optionally with an arrow.
//
// Builder state (plain JSON, kept on the created tree as `draft` for future editing):
//   { name, levels: [group level names], leafLabel,
//     nodes: [{ uid, name, children: [...] }],        // top-level groups
//     legends: [{ uid, name, color }],
//     connections: [{ uid, source, target, legend, arrow }],  // leaf uids; arrow "none" | "end" | "both"
//     style: { bg, text, link, node, nodeCollapsed, leaf, highlight } }  // see styles.js
// Nodes at depth levels.length + 1 are the leaves.
import { assignStableIds } from "./layout.js";
import { THEMES, STYLE_FIELDS, DEFAULT_STYLE } from "./styles.js";

const PALETTE = ["#58a6ff", "#e5534b", "#57ab5a", "#daaa3f", "#b083f0", "#39c5cf", "#f47067"];
const MAX_LEVELS = 8;

const uid = () => Math.random().toString(36).slice(2, 10);
const node = (name, children = []) => ({ uid: uid(), name, children });

function emptyState() {
  return {
    name: "",
    levels: ["Level 1", "Level 2"],
    leafLabel: "Leaf",
    nodes: [],
    legends: [{ uid: uid(), name: "Related", color: PALETTE[0] }],
    connections: [],
    style: { ...DEFAULT_STYLE },
  };
}

// The animal kingdom: where animals live › their class › the animals themselves.
function exampleState() {
  const group = (name, leaves) => node(name, leaves.map((n) => node(n)));
  const state = {
    name: "Animal kingdom",
    levels: ["Environment", "Class"],
    leafLabel: "Animal",
    nodes: [
      node("Land", [
        group("Birds", ["Crow", "Sparrow", "Eagle"]),
        group("Insects", ["Ant", "Bee"]),
        group("Annelids", ["Worm"]),
        group("Mammals", ["Fox", "Rabbit"]),
      ]),
      node("Water", [
        group("Fish", ["Salmon", "Shark"]),
        group("Mammals", ["Dolphin", "Seal"]),
        group("Crustaceans", ["Crab", "Shrimp"]),
      ]),
    ],
    legends: [
      { uid: uid(), name: "Eats", color: "#e5534b" },
      { uid: uid(), name: "Helps", color: "#57ab5a" },
    ],
    connections: [],
    style: { ...THEMES.Forest },
  };
  const [eats, helps] = state.legends;
  const leaf = (name) => leafEntries(state).find((l) => l.name === name).uid;
  const link = (source, legend, target) => ({
    uid: uid(),
    source: leaf(source),
    target: leaf(target),
    legend: legend.uid,
    arrow: "end",
  });
  state.connections = [
    link("Crow", eats, "Worm"),
    link("Ant", helps, "Crow"), // crows let ants clean their feathers ("anting")
    link("Sparrow", eats, "Ant"),
    link("Eagle", eats, "Rabbit"),
    link("Fox", eats, "Rabbit"),
    link("Bee", helps, "Rabbit"), // pollinates the plants rabbits eat
    link("Shark", eats, "Seal"),
    link("Seal", eats, "Salmon"),
    link("Dolphin", eats, "Salmon"),
    link("Salmon", eats, "Shrimp"),
    link("Shrimp", helps, "Shark"), // cleaner shrimp
    link("Crab", eats, "Worm"),
  ];
  return state;
}

// Leaves in tree order: [{ uid, name, group: "Land / Birds" }].
function leafEntries(state) {
  const out = [];
  const leafDepth = state.levels.length + 1;
  (function walk(list, depth, path) {
    for (const n of list) {
      if (depth === leafDepth) out.push({ uid: n.uid, name: n.name, group: path.join(" / ") });
      else walk(n.children, depth + 1, [...path, n.name || "(unnamed)"]);
    }
  })(state.nodes, 1, []);
  return out;
}

function countByDepth(state) {
  const counts = new Array(state.levels.length + 1).fill(0);
  (function walk(list, depth) {
    for (const n of list) {
      counts[depth - 1]++;
      if (depth <= state.levels.length) walk(n.children, depth + 1);
    }
  })(state.nodes, 1);
  return counts;
}

// Convert builder state into a chart tree ({ name, data, connections, legends, levelNames }).
function toTree(state) {
  const shadow = (n) => ({
    uid: n.uid,
    data: { name: n.name.trim() },
    children: n.children.length ? n.children.map(shadow) : null,
  });
  const root = { data: { name: state.name.trim() }, children: state.nodes.map(shadow) };
  assignStableIds(root); // same path ids the chart will compute

  const idByUid = new Map();
  (function walk(n) {
    if (n.uid) idByUid.set(n.uid, n.id);
    n.children?.forEach(walk);
  })(root);

  const toData = (n) =>
    n.children ? { name: n.data.name, children: n.children.map(toData) } : { name: n.data.name };

  return {
    name: state.name.trim(),
    data: toData(root),
    levelNames: [...state.levels, state.leafLabel],
    legends: state.legends.map((l) => ({ id: l.uid, name: l.name.trim(), color: l.color })),
    connections: state.connections.map((c) => ({
      source: idByUid.get(c.source),
      target: idByUid.get(c.target),
      legend: c.legend || null,
      arrow: c.arrow,
    })),
    style: { ...state.style },
    draft: structuredClone(state),
  };
}

function el(tag, props = {}, ...children) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

function iconButton(label, title, onClick) {
  return el("button", { type: "button", className: "b-icon", textContent: label, title, ariaLabel: title, onclick: onClick });
}

export function createBuilder({ dialog, onCreate }) {
  const $ = (sel) => dialog.querySelector(sel);
  const form = $("form");
  const nameInput = $("#bName");
  const levelCount = $("#bLevelCount");
  const levelsBox = $("#bLevels");
  const summary = $("#bSummary");
  const structure = $("#bStructure");
  const legendsBox = $("#bLegends");
  const connectionsBox = $("#bConnections");
  const errorsBox = $("#bErrors");
  const themesBox = $("#bThemes");
  const colorsBox = $("#bColors");
  const preview = $("#bPreview");

  let state = emptyState();

  levelCount.max = MAX_LEVELS;
  const levelLabel = (depth) =>
    depth <= state.levels.length
      ? state.levels[depth - 1].trim() || `Level ${depth}`
      : state.leafLabel.trim() || "Leaf";

  function renderAll() {
    nameInput.value = state.name;
    levelCount.value = state.levels.length;
    errorsBox.replaceChildren();
    renderLevels();
    renderStructure();
    renderLegends();
    renderConnections();
    renderStyle();
  }

  // ---- 5. Style ----
  function renderStyle() {
    const matches = (theme) => STYLE_FIELDS.every(({ key }) => theme[key] === state.style[key]);
    themesBox.replaceChildren(
      ...Object.entries(THEMES).map(([name, theme]) => {
        const chip = el("button", {
          type: "button",
          className: "b-theme",
          title: `${name} theme`,
          onclick: () => {
            state.style = { ...theme };
            renderStyle();
          },
        });
        chip.setAttribute("aria-pressed", matches(theme));
        const dots = el("span", { className: "b-theme-dots" });
        for (const key of ["bg", "link", "leaf", "highlight"]) {
          const dot = el("span");
          dot.style.background = theme[key];
          dots.append(dot);
        }
        chip.append(dots, name);
        return chip;
      }),
    );

    colorsBox.replaceChildren(
      ...STYLE_FIELDS.map(({ key, label }) =>
        el(
          "label",
          { className: "b-color" },
          el("input", {
            type: "color",
            value: state.style[key],
            oninput: (e) => {
              state.style[key] = e.target.value;
              renderPreview();
              themesBox.querySelectorAll(".b-theme").forEach((chip, i) => {
                chip.setAttribute("aria-pressed", matches(Object.values(THEMES)[i]));
              });
            },
          }),
          label,
        ),
      ),
    );
    renderPreview();
  }

  // A tiny radial tree drawn with the chosen colors.
  function renderPreview() {
    const s = state.style;
    const svg = (tag, attrs) => {
      const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      return e;
    };
    const root = [28, 60];
    const groups = [[86, 28], [86, 92]];
    const leaves = [[146, 14, 0, "Crow"], [146, 42, 0, "Ant"], [146, 80, 1, "Salmon"], [146, 106, 1, "Shark"]];
    const curve = ([x1, y1], [x2, y2]) => `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
    const link = (a, b) => svg("path", { d: curve(a, b), fill: "none", stroke: s.link, "stroke-width": 1.5 });
    const dot = ([x, y], r, fill) => svg("circle", { cx: x, cy: y, r, fill });
    const label = ([x, y]) =>
      svg("text", { x: x + 8, y: y + 3.5, fill: s.text, "font-size": 10, "font-family": "system-ui, sans-serif" });

    const parts = [
      svg("rect", { width: 200, height: 120, rx: 8, fill: s.bg }),
      ...groups.map((g) => link(root, g)),
      ...leaves.map(([x, y, gi]) => link(groups[gi], [x, y])),
      svg("path", { d: "M154,14 C196,30 196,90 154,106", fill: "none", stroke: s.highlight, "stroke-width": 1.8 }),
      dot(root, 5, s.node),
      dot(groups[0], 5, s.node),
      dot(groups[1], 6, s.nodeCollapsed),
      ...leaves.map(([x, y]) => dot([x, y], 4, s.leaf)),
    ];
    for (const [x, y, , name] of leaves) {
      const t = label([x, y]);
      t.textContent = name;
      parts.push(t);
    }
    preview.replaceChildren(...parts);
  }

  // ---- 1. Levels ----
  function renderLevels() {
    const row = (label, value, onInput) =>
      el(
        "label",
        { className: "b-level-row" },
        el("span", { textContent: label }),
        el("input", {
          value,
          oninput: (e) => onInput(e.target.value),
          onchange: () => renderStructure(),
        }),
      );
    levelsBox.replaceChildren(
      ...state.levels.map((name, i) =>
        row(`Level ${i + 1}`, name, (v) => (state.levels[i] = v)),
      ),
      row("Leaves", state.leafLabel, (v) => (state.leafLabel = v)),
    );
  }

  function setLevelCount(count) {
    count = Math.max(1, Math.min(MAX_LEVELS, Math.round(count) || 1));
    const current = state.levels.length;
    if (count < current) {
      // Nodes deeper than the new leaf level are removed; the old deepest groups become leaves.
      const removed = countByDepth(state).slice(count + 1).reduce((a, b) => a + b, 0);
      if (removed && !confirm(`Reducing to ${count} level(s) removes ${removed} node(s). Continue?`)) {
        levelCount.value = current;
        return;
      }
      (function trim(list, depth) {
        for (const n of list) {
          if (depth === count + 1) n.children = [];
          else trim(n.children, depth + 1);
        }
      })(state.nodes, 1);
      state.levels.length = count;
    }
    while (state.levels.length < count) state.levels.push(`Level ${state.levels.length + 1}`);
    renderLevels();
    renderStructure();
    renderConnections();
  }

  // ---- 2. Nodes ----
  function renderStructure(focusAddFor) {
    const counts = countByDepth(state);
    summary.textContent = counts.map((n, i) => `${levelLabel(i + 1)}: ${n}`).join(" · ");
    structure.replaceChildren(addRow(null, 1), ...state.nodes.map((n) => nodeEl(n, 1)));
    if (focusAddFor) structure.querySelector(`[data-add-for="${focusAddFor}"]`)?.focus();
  }

  function nodeEl(n, depth) {
    const isLeaf = depth > state.levels.length;
    const input = el("input", {
      value: n.name,
      placeholder: `${levelLabel(depth)} name`,
      oninput: () => (n.name = input.value),
      onchange: renderConnections,
    });
    input.dataset.uid = n.uid;
    const row = el(
      "div",
      { className: "b-row" },
      el("span", { className: `b-tag${isLeaf ? " leaf" : ""}`, textContent: levelLabel(depth) }),
      input,
      iconButton("×", `Remove ${n.name || levelLabel(depth)}`, () => {
        removeNode(state.nodes, n.uid);
        renderStructure();
        renderConnections();
      }),
    );
    const wrap = el("div", { className: "b-node" }, row);
    if (!isLeaf) wrap.append(...n.children.map((c) => nodeEl(c, depth + 1)), addRow(n, depth + 1));
    return wrap;
  }

  // Add one or more children at once: "Crow, Sparrow, Eagle" + Enter.
  function addRow(parent, depth) {
    const key = parent?.uid ?? "root";
    const input = el("input", {
      placeholder: `Add ${levelLabel(depth)} — names separated by commas`,
    });
    input.dataset.addFor = key;
    const add = () => {
      const names = input.value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
      if (!names.length) return;
      (parent ? parent.children : state.nodes).push(...names.map((name) => node(name)));
      renderStructure(key);
      renderConnections();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        add();
      }
    });
    return el(
      "div",
      { className: "b-add" },
      input,
      el("button", { type: "button", textContent: "Add", onclick: add }),
    );
  }

  function removeNode(list, id) {
    const i = list.findIndex((n) => n.uid === id);
    if (i >= 0) list.splice(i, 1);
    else list.forEach((n) => removeNode(n.children, id));
  }

  // ---- 3. Legends ----
  function renderLegends() {
    legendsBox.replaceChildren(
      ...state.legends.map((legend) =>
        el(
          "div",
          { className: "b-legend" },
          el("input", {
            type: "color",
            value: legend.color,
            title: "Legend color",
            ariaLabel: "Legend color",
            oninput: (e) => {
              legend.color = e.target.value;
              renderConnections();
            },
          }),
          el("input", {
            value: legend.name,
            placeholder: "Legend name, e.g. Eats",
            oninput: (e) => (legend.name = e.target.value),
            onchange: renderConnections,
          }),
          iconButton("×", `Remove legend ${legend.name}`, () => {
            state.legends = state.legends.filter((l) => l !== legend);
            for (const c of state.connections) if (c.legend === legend.uid) c.legend = "";
            renderLegends();
            renderConnections();
          }),
        ),
      ),
    );
    if (!state.legends.length) {
      legendsBox.append(el("p", { className: "b-empty", textContent: "No legends: connections use the default color." }));
    }
  }

  function addLegend() {
    const n = state.legends.length;
    state.legends.push({ uid: uid(), name: `Type ${n + 1}`, color: PALETTE[n % PALETTE.length] });
    renderLegends();
    renderConnections();
    legendsBox.querySelector(".b-legend:last-child input:not([type=color])")?.select();
  }

  // ---- 4. Connections ----
  function renderConnections() {
    const leaves = leafEntries(state);
    const leafIds = new Set(leaves.map((l) => l.uid));
    const groups = Map.groupBy
      ? Map.groupBy(leaves, (l) => l.group)
      : leaves.reduce((m, l) => m.set(l.group, [...(m.get(l.group) ?? []), l]), new Map());

    const leafSelect = (value, label, onChange) => {
      const select = el(
        "select",
        { ariaLabel: label, onchange: (e) => onChange(e.target.value) },
        el("option", { value: "", textContent: `${label}…` }),
        ...[...groups].map(([group, list]) =>
          el(
            "optgroup",
            { label: group || "Top level" },
            ...list.map((l) => el("option", { value: l.uid, textContent: l.name || "(unnamed)" })),
          ),
        ),
      );
      select.value = leafIds.has(value) ? value : "";
      return select;
    };

    const rows = state.connections.map((c) => {
      const swatch = el("span", { className: "b-swatch" });
      const paintSwatch = () =>
        swatch.style.setProperty("--c", state.legends.find((l) => l.uid === c.legend)?.color ?? "var(--hover)");
      paintSwatch();

      const legendSelect = el(
        "select",
        {
          ariaLabel: "Legend",
          onchange: (e) => {
            c.legend = e.target.value;
            paintSwatch();
          },
        },
        el("option", { value: "", textContent: "No legend" }),
        ...state.legends.map((l) => el("option", { value: l.uid, textContent: l.name || "(unnamed)" })),
      );
      legendSelect.value = c.legend ?? "";

      const arrowSelect = el(
        "select",
        { ariaLabel: "Direction", className: "b-arrow", onchange: (e) => (c.arrow = e.target.value) },
        el("option", { value: "none", textContent: "—", title: "No direction" }),
        el("option", { value: "end", textContent: "→", title: "From → to" }),
        el("option", { value: "both", textContent: "↔", title: "Both directions" }),
      );
      arrowSelect.value = c.arrow;

      return el(
        "div",
        { className: "b-conn" },
        leafSelect(c.source, "From", (v) => (c.source = v)),
        arrowSelect,
        leafSelect(c.target, "To", (v) => (c.target = v)),
        el("span", { className: "b-legend-pick" }, swatch, legendSelect),
        iconButton("×", "Remove connection", () => {
          state.connections = state.connections.filter((x) => x !== c);
          renderConnections();
        }),
      );
    });

    connectionsBox.replaceChildren(...rows);
    if (!leaves.length) {
      connectionsBox.append(
        el("p", { className: "b-empty", textContent: `Add some ${levelLabel(state.levels.length + 1)} nodes first — connections link leaves.` }),
      );
    } else if (!rows.length) {
      connectionsBox.append(el("p", { className: "b-empty", textContent: "No connections yet." }));
    }
  }

  function addConnection() {
    state.connections.push({
      uid: uid(),
      source: "",
      target: "",
      legend: state.legends[0]?.uid ?? "",
      arrow: "none",
    });
    renderConnections();
    connectionsBox.querySelector(".b-conn:last-child select")?.focus();
  }

  // ---- Validate & create ----
  function validate() {
    const errors = [];
    if (!state.name.trim()) errors.push("Give the tree a name.");
    if (state.levels.some((l) => !l.trim()) || !state.leafLabel.trim()) errors.push("Name every level.");

    let unnamed = 0;
    (function walk(list) {
      for (const n of list) {
        if (!n.name.trim()) unnamed++;
        walk(n.children);
      }
    })(state.nodes);
    if (!state.nodes.length) errors.push(`Add at least one ${levelLabel(1)}.`);
    if (unnamed) errors.push(`${unnamed} node(s) have no name.`);

    const leaves = leafEntries(state);
    if (state.nodes.length && !leaves.length) {
      errors.push(`Add at least one ${levelLabel(state.levels.length + 1)} (the leaves).`);
    }
    if (state.legends.some((l) => !l.name.trim())) errors.push("Name every legend.");

    const leafIds = new Set(leaves.map((l) => l.uid));
    state.connections.forEach((c, i) => {
      if (!leafIds.has(c.source) || !leafIds.has(c.target)) {
        errors.push(`Connection ${i + 1}: choose both ends.`);
      } else if (c.source === c.target) {
        errors.push(`Connection ${i + 1}: a leaf can't connect to itself.`);
      }
    });

    // Flag empty inputs so they're easy to find.
    dialog.querySelectorAll(".b-row input, .b-legend input:not([type=color]), #bName, .b-level-row input").forEach((input) => {
      input.toggleAttribute("aria-invalid", !input.value.trim());
    });
    return errors;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const errors = validate();
    errorsBox.replaceChildren(...errors.map((msg) => el("li", { textContent: msg })));
    if (errors.length) return;
    onCreate(toTree(state));
    dialog.close();
  });

  // Enter in a text field shouldn't submit the whole form.
  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("input:not([type=submit])")) e.preventDefault();
  });

  const hasWork = () => state.name.trim() || state.nodes.length || state.connections.length;
  const discard = () => !hasWork() || confirm("Discard this tree?");

  dialog.addEventListener("cancel", (e) => {
    if (!discard()) e.preventDefault();
  });
  $("#builderCancel").addEventListener("click", () => discard() && dialog.close());
  $("#builderClose").addEventListener("click", () => discard() && dialog.close());
  $("#builderExample").addEventListener("click", () => {
    if (hasWork() && !confirm("Replace what you've entered with the example?")) return;
    state = exampleState();
    renderAll();
  });
  $("#bAddLegend").addEventListener("click", addLegend);
  $("#bAddConnection").addEventListener("click", addConnection);
  nameInput.addEventListener("input", () => (state.name = nameInput.value));
  levelCount.addEventListener("change", () => setLevelCount(+levelCount.value));

  return {
    open() {
      state = emptyState();
      renderAll();
      dialog.showModal();
      nameInput.focus();
    },
  };
}
