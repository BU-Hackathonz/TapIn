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
// The people and tables match the fake room in tools/seed.py, so screenshots look like the real thing.
const fake = { claimFrom: 0, focus: false };
function fakeReply(method, path, body) {
  const g = (id, working_on, looking_for, size, known_count) =>
    ({ id, name: `Table ${id}`, station_id: id === 2 ? 2 : 1, mode: "open", working_on, looking_for, size, known_count });
  const min = m => new Date(Date.now() - m * 60000).toISOString();
  if (path === "/signup") return { person_id: 1, claim_code: "FAKE01", expires_in: 30 };
  if (path.startsWith("/claim/")) {
    fake.claimFrom ||= Date.now();
    return { status: Date.now() - fake.claimFrom > 4000 ? "claimed" : "waiting" };  // countdown shows about 4 s
  }
  if (path.endsWith("/focus")) { fake.focus = body.focus; return { ok: true }; }
  if (path.endsWith("/mode")) return { ok: true };
  if (path === "/needs") return [
    { group_id: 2, table: "Table 2", need: "firmware", since: min(12), handled_by: null },
    { group_id: 3, table: "Table 3", need: "backend", since: min(25), handled_by: null },
    { group_id: 1, table: "Table 1", need: "design", since: min(40), handled_by: 19 }];
  if (path.startsWith("/me/")) {
    const form = store.get("tapin_form", sessionStorage) || {};
    return {
      person: { id: 1, name: form.name || "Maya", role: form.role || "student", skills: ["firmware", "hardware"],
                looking_for: ["design"], working_on: "", focus: fake.focus },
      here: true,
      group: null,  // like Maya in the seed room: on her own, so the tables that fit her show
      known_here: [{ id: 2, name: "Sam" }],
      suggested_groups: [
        { group: g(2, "a robot arm", ["firmware"], 3, 1), score: 14, reason: "needs firmware" },
        { group: g(3, "a study-room finder", ["backend"], 2, 0), score: 8, reason: "could use your firmware" },
        { group: g(1, "a T delay predictor", ["design"], 3, 0), score: 5, reason: "could use your firmware" }],
      suggested_people: [
        { person: { id: 9, name: "Lina", skills: ["design"] }, score: 7, reason: "does design, which you want" },
        { person: { id: 12, name: "Ravi", skills: ["firmware"] }, score: 4, reason: "also does firmware" }],
      points: 6,
    };
  }
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
// "Working on today" quick picks that aren't projects, so nobody has to be building something to tap in.
const SOCIAL = ["Just hanging out", "Meeting new people", "Looking for a team", "Studying", "Exploring ideas"];
// "Building a robot arm" for a project, but "Just hanging out" as is.
const doing = (w) => (SOCIAL.some((s) => s.toLowerCase() === String(w).trim().toLowerCase()) ? w : "Building " + w);

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

// A small Back link at the top left of every phone page: back to where you came from on this site, otherwise the front page.
(() => {
  const a = document.createElement("a");
  a.className = "pback"; a.href = "/landing/?skip"; a.textContent = "\u2039 Back";
  a.addEventListener("click", (e) => {
    let same = false;
    try { same = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch { /* no referrer */ }
    if (same && history.length > 1) { e.preventDefault(); history.back(); }
  });
  document.body.prepend(a);
})();
