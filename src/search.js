// Search box with a drill-down dropdown. With an empty query it browses the hierarchy one
// level at a time (breadcrumbs go back up); typing filters every node instead.
// Choosing a node reveals it in the chart; choosing a branch also lists its children.
//
// Keys: ↑/↓ move, Enter or → opens, ← or Backspace (empty box) goes up a level, Esc closes.

const MAX_RESULTS = 50;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function createSearch({ input, dropdown, crumbs, list, chart }) {
  let level = chart.rootId(); // node whose children are listed while browsing
  let items = [];
  let active = -1;

  const query = () => input.value.trim();
  const isOpen = () => !dropdown.hidden;

  function open() {
    if (isOpen()) return;
    dropdown.hidden = false;
    input.setAttribute("aria-expanded", "true");
    render();
  }

  function close() {
    dropdown.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function render() {
    const q = query();
    crumbs.replaceChildren();

    if (q) {
      items = chart.search(q, MAX_RESULTS);
      const more = items.length === MAX_RESULTS ? "+" : "";
      crumbs.append(el("span", "crumb-note", `${items.length}${more} match${items.length === 1 ? "" : "es"}`));
    } else {
      items = chart.childrenOf(level);
      const path = chart.pathTo(level);
      path.forEach((n, i) => {
        if (i) crumbs.append(el("span", "crumb-sep", "›"));
        const b = el("button", "crumb", n.name);
        b.type = "button";
        if (i === path.length - 1) b.setAttribute("aria-current", "location");
        b.addEventListener("click", () => goTo(n.id));
        crumbs.append(b);
      });
    }

    active = items.length ? 0 : -1;
    list.replaceChildren(
      ...(items.length
        ? items.map((item, i) => option(item, i, !!q))
        : [el("li", "option-empty", q ? "No matching nodes" : "No children")]),
    );
    showActive();
  }

  function option(item, i, showPath) {
    const li = el("li", "option");
    li.id = `search-option-${i}`;
    li.setAttribute("role", "option");

    const branch = item.childCount > 0;
    li.append(el("span", `swatch ${branch ? "collapsed" : "leaf"}`));

    const text = el("span", "option-text");
    text.append(el("span", "option-name", item.name));
    if (showPath && item.parentId) {
      text.append(el("span", "option-path", item.parentId.split("/").join(" / ")));
    }
    li.append(text);

    li.append(el("span", "option-meta", branch ? `${item.childCount} ›` : "leaf"));
    li.title = branch
      ? `${item.childCount} children, ${item.leafCount} leaves`
      : "Leaf (no children)";

    li.addEventListener("mousemove", () => {
      if (active !== i) {
        active = i;
        showActive();
      }
    });
    li.addEventListener("click", () => choose(item));
    return li;
  }

  function showActive() {
    list.querySelectorAll(".option").forEach((li, i) => {
      li.setAttribute("aria-selected", i === active);
      if (i === active) li.scrollIntoView({ block: "nearest" });
    });
    if (active >= 0) input.setAttribute("aria-activedescendant", `search-option-${active}`);
    else input.removeAttribute("aria-activedescendant");
  }

  function choose(item) {
    input.value = "";
    if (item.childCount > 0) {
      chart.reveal(item.id, { expand: true });
      level = item.id;
      render();
    } else {
      chart.reveal(item.id);
      level = item.parentId ?? chart.rootId();
      close();
    }
  }

  function goTo(id) {
    input.value = "";
    level = id;
    if (id === chart.rootId()) chart.unpin();
    else chart.reveal(id, { expand: true });
    render();
  }

  function goUp() {
    const path = chart.pathTo(level);
    if (path.length > 1) goTo(path[path.length - 2].id);
  }

  // Keep focus in the input while clicking inside the dropdown.
  dropdown.addEventListener("mousedown", (event) => event.preventDefault());

  input.addEventListener("focus", open);
  input.addEventListener("click", open);
  input.addEventListener("blur", close);
  input.addEventListener("input", () => {
    open();
    render();
  });

  input.addEventListener("keydown", (event) => {
    const empty = !input.value;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        if (!isOpen()) open();
        else if (items.length) {
          const step = event.key === "ArrowDown" ? 1 : -1;
          active = (active + step + items.length) % items.length;
          showActive();
        }
        break;
      case "Enter":
        if (!isOpen()) open();
        else if (items[active]) choose(items[active]);
        break;
      case "ArrowRight":
        if (!empty || !items[active]?.childCount) return;
        choose(items[active]);
        break;
      case "ArrowLeft":
      case "Backspace":
        if (!empty) return;
        goUp();
        break;
      case "Escape":
        if (!isOpen()) return; // let the page-level handler clear the highlight
        close();
        event.stopPropagation();
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  // The chart rebuilds its hierarchy when the tree changes, so start browsing from the top again.
  return {
    reset() {
      level = chart.rootId();
      if (isOpen()) render();
    },
  };
}
