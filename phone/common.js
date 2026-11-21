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

// FAKE = true at the top of a page: answer from these hard-coded replies (same shapes as the server).
const fake = { claimFrom: 0, focus: false, mode: "open", looking: ["firmware"] };
function fakeReply(method, path, body) {
  const g = (id, n, known) => ({ id, name: `Table ${id}`, station_id: 2, mode: "open", working_on: "a robot arm",
    looking_for: ["firmware"], size: n, known_count: known });
  if (path === "/signup") return { person_id: 1, claim_code: "FAKE01", expires_in: 30 };
  if (path.startsWith("/claim/")) {
    fake.claimFrom ||= Date.now();
    return { status: Date.now() - fake.claimFrom > 4000 ? "claimed" : "waiting" };
  }
  if (path.endsWith("/focus")) { fake.focus = body.focus; return { ok: true }; }
  if (path.endsWith("/mode")) { fake.mode = body.mode; fake.looking = body.looking_for; return { ok: true }; }
  if (path === "/needs") return [
    { group_id: 2, table: "Table 2", need: "firmware", since: new Date(Date.now() - 12 * 60000).toISOString(), handled_by: null },
    { group_id: 4, table: "Table 4", need: "design", since: new Date(Date.now() - 30 * 60000).toISOString(), handled_by: 9 }];
  if (path.startsWith("/me/")) return {
    person: { id: 1, name: "Maya", role: "student", skills: ["firmware"], looking_for: ["design"], working_on: "", focus: fake.focus },
    here: true,
    group: { ...g(3, 2, 1), mode: fake.mode, looking_for: fake.looking, points: 25, members: [{ id: 1, name: "Maya" }, { id: 8, name: "Sam" }] },
    known_here: [{ id: 8, name: "Sam" }],
    suggested_groups: [{ group: g(2, 3, 1), score: 9, reason: "needs firmware" }, { group: g(4, 2, 1), score: 4, reason: "you know Leo" }],
    suggested_people: [{ person: { id: 9, name: "Priya", skills: ["design"] }, score: 6, reason: "does design, which you want" }],
    points: 31,
  };
  return null;
}

async function api(method, path, body) {
  if (typeof FAKE !== "undefined" && FAKE) return { status: 200, data: fakeReply(method, path, body) };
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
