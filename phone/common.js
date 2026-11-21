// Shared helpers for the phone pages. Text from other people only ever goes in through textContent.
const SKILLS = ["hardware", "firmware", "frontend", "backend", "design", "ml", "data", "mobile", "pitch", "research"];

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, "");
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k instanceof Node ? k : String(k));
  return n;
}

// Chip group of checkboxes with a max. onChange gets the checked values.
function chipGroup(name, values, checked, max, onChange) {
  const box = el("div", { class: "chips" });
  const sync = () => {
    const boxes = [...box.querySelectorAll("input")];
    const full = boxes.filter(b => b.checked).length >= max;
    boxes.forEach(b => { b.disabled = full && !b.checked; });
  };
  for (const v of values) {
    const input = el("input", { type: "checkbox", name, value: v, checked: checked.includes(v) });
    input.addEventListener("change", () => { sync(); onChange && onChange(picked(box)); });
    box.append(el("label", { class: "chip" }, input, el("span", {}, v)));
  }
  sync();
  return box;
}
const picked = box => [...box.querySelectorAll("input:checked")].map(b => b.value);

async function api(method, path, body) {
  const r = await fetch("/api" + path, {
    method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch (_) {}
  return { status: r.status, data };
}

// Storage can be blocked (private mode); the pages still work, they just forget you.
const store = {
  get(k, s = localStorage) { try { return JSON.parse(s.getItem(k)); } catch (_) { return null; } },
  set(k, v, s = localStorage) { try { s.setItem(k, JSON.stringify(v)); } catch (_) {} },
  del(k, s = localStorage) { try { s.removeItem(k); } catch (_) {} },
};

function signupError(status, data) {
  if (status === 409) return "Someone else is claiming a badge right now. Try again in a few seconds.";
  if (status === 422) return "Check your first name (1 to 30 letters) and pick at most 3 skills and 2 looking-for tags.";
  if (status === 503) return "The server isn't ready yet. Find the Tap In table.";
  return "Couldn't reach Tap In. Check you're on the TapIn Wi-Fi and try again.";
}

function ago(iso) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}
