// Pixel size field: type any value, or pick one of the preset sizes from the menu
// that opens when the field is focused or clicked.

let count = 0;

export function createSizeInput(container, { id, label, presets, value, min, max, onChange }) {
  const menuId = `size-menu-${++count}`;

  const input = Object.assign(document.createElement("input"), {
    id,
    type: "number",
    min,
    max,
    step: 1,
    value,
    inputMode: "numeric",
  });
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-label", `${label} in pixels`);
  input.setAttribute("aria-controls", menuId);
  input.setAttribute("aria-expanded", "false");

  const unit = Object.assign(document.createElement("span"), { className: "size-unit", textContent: "px" });
  const menu = Object.assign(document.createElement("ul"), { id: menuId, className: "size-menu", hidden: true });
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", `${label} presets`);

  for (const size of presets) {
    const li = Object.assign(document.createElement("li"), { textContent: `${size} px` });
    li.setAttribute("role", "option");
    li.dataset.value = size;
    li.addEventListener("click", () => {
      set(size);
      close();
    });
    menu.append(li);
  }

  container.classList.add("size-input");
  container.append(input, unit, menu);

  let current = value;
  const valid = (v) => Number.isFinite(v) && v >= min && v <= max;

  function set(v) {
    input.value = v;
    commit(v);
  }

  function commit(v) {
    if (v === current) return;
    current = v;
    markActive();
    onChange(v);
  }

  function markActive() {
    for (const li of menu.children) li.setAttribute("aria-selected", +li.dataset.value === current);
  }

  function open() {
    menu.hidden = false;
    input.setAttribute("aria-expanded", "true");
    markActive();
  }

  function close() {
    menu.hidden = true;
    input.setAttribute("aria-expanded", "false");
  }

  // Keep focus in the input while choosing a preset.
  menu.addEventListener("mousedown", (e) => e.preventDefault());
  input.addEventListener("focus", open);
  input.addEventListener("click", open);
  input.addEventListener("blur", close);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      close();
      e.stopPropagation();
    } else if (e.key === "Enter") {
      input.blur();
    }
  });

  // Apply while typing when the value is in range; clamp when the field is left.
  input.addEventListener("input", () => {
    if (valid(+input.value)) commit(+input.value);
  });
  input.addEventListener("change", () => {
    const v = Number.isFinite(+input.value) && input.value !== "" ? +input.value : current;
    set(Math.min(max, Math.max(min, Math.round(v))));
  });

  return { get value() { return current; } };
}
