// Demo room for when no Tap In server is reachable (e.g. the wall hosted on its own, or ?demo).
// A small in-browser copy of tools/fake_taps.py --events: same /api shapes, same {type, data} events.
const Demo = (() => {
  const SKILLS = ["hardware", "firmware", "frontend", "backend", "design", "ml", "data", "mobile", "pitch", "research"];
  const NAMES = ("Maya Sam Priya Leo Ava Omar Zoe Ethan Lina Noah Chloe Ravi Mia Jonah Aisha Theo Nora Kai Elena " +
    "Marcus Iris Diego Hana Felix Sofia Ben Yara Luca Grace Amir Ruby Owen Tara Hugo Lily Malik Jade Arjun Nina Cole").split(" ");
  const WORKING_ON = ["a study-room finder", "a T delay predictor", "a dorm laundry bot", "an AR campus map",
    "a food-waste tracker", "a bike-lane heatmap", "a lab-bench scheduler", "a noise meter for libraries"];

  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const sample = (xs, n) => { const c = [...xs], out = []; while (out.length < n && c.length) out.push(c.splice(Math.floor(rnd() * c.length), 1)[0]); return out; };
  const now = () => new Date().toISOString();
  const lk = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

  const people = new Map(), groups = new Map(), links = new Map(), needs = [];

  function addPerson(role = "student", here = false) {
    const id = people.size + 1, skills = sample(SKILLS, 1 + Math.floor(rnd() * 3));
    const p = { id, name: NAMES[(id - 1) % NAMES.length], role, group_id: null, here, focus: rnd() < 0.08,
                points: here ? Math.floor(rnd() * 20) : 0, note: null, skills,
                looking_for: sample(SKILLS.filter((s) => !skills.includes(s)), 2) };
    people.set(id, p);
    return p;
  }
  const members = (gid) => [...people.values()].filter((p) => p.group_id === gid).map((p) => p.id);
  function link(a, b) {
    const k = lk(a, b), l = links.get(k);
    if (l) { l.strength++; return false; }
    links.set(k, { a: Math.min(a, b), b: Math.max(a, b), strength: 1 });
    return true;
  }
  function give(pts, gpts = {}) {
    for (const id in pts) people.get(+id).points += pts[id];
    for (const id in gpts) groups.get(+id).points += gpts[id];
    return ["points_updated", { people: Object.keys(pts).map((id) => ({ id: +id, points: people.get(+id).points })),
                                groups: Object.keys(gpts).map((id) => ({ id: +id, points: groups.get(+id).points })) }];
  }
  function needsList() {
    return needs.filter((n) => groups.get(n.group_id).mode === "open")
      .map((n) => ({ group_id: n.group_id, table: groups.get(n.group_id).name, need: n.need, since: n.since, handled_by: n.handled_by }));
  }
  function formGroup(ids, quiet) {
    const gid = groups.size + 1, first = people.get(ids[0]);
    groups.set(gid, { id: gid, name: `Table ${gid}`, station_id: gid % 2 ? 2 : 1, mode: gid % 5 === 0 ? "heads_down" : "open",
                      looking_for: first.looking_for, working_on: pick(WORKING_ON), points: 0 });
    const since = new Date(Date.now() - rnd() * 50 * 60000).toISOString();
    for (const t of first.looking_for) needs.push({ group_id: gid, need: t, since, handled_by: null });
    const pts = {};
    for (const m of ids) people.get(m).group_id = gid;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++)
      if (link(ids[i], ids[j])) { pts[ids[i]] = (pts[ids[i]] || 0) + 5; pts[ids[j]] = (pts[ids[j]] || 0) + 5; }
    if (quiet) { for (const id in pts) people.get(+id).points += pts[id]; return []; }
    return [["group_formed", { group_id: gid, member_ids: ids, station_id: groups.get(gid).station_id }],
            ["needs_updated", { needs: needsList() }], give(pts)];
  }
  function suggestions(pid) {
    const me = people.get(pid), out = [];
    for (const g of groups.values()) {
      if (g.mode !== "open" || g.id === me.group_id) continue;
      const need = g.looking_for.find((t) => me.skills.includes(t));
      out.push([need ? 1 : 0, g.id, need ? `needs ${need}` : "new here"]);
    }
    out.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    return out.slice(0, 3).map(([, gid, reason]) => ({ group_id: gid, reason }));
  }

  // one random change, weighted like fake_taps.py
  function step() {
    const all = [...people.values()];
    const solo = all.filter((p) => p.here && !p.group_id && p.role === "student").map((p) => p.id);
    const away = all.filter((p) => !p.here).map((p) => p.id);
    const mentors = all.filter((p) => p.here && p.role !== "student").map((p) => p.id);
    const open = needs.filter((n) => !n.handled_by && groups.get(n.group_id).mode === "open");
    const opts = [["checkin", away.length ? 4 : 0], ["form", solo.length >= 2 ? 2 : 0], ["join", solo.length ? 3 : 0],
                  ["help", mentors.length && open.length ? 1 : 0], ["strengthen", links.size ? 1 : 0],
                  ["new_person", people.size < 40 ? 1 : 0]];
    let r = rnd() * opts.reduce((s, [, w]) => s + w, 0), kind = "strengthen";
    for (const [k, w] of opts) { if ((r -= w) < 0) { kind = k; break; } }
    const station = rnd() < 0.5 ? 1 : 2;

    if (kind === "checkin") {
      const p = people.get(pick(away));
      p.here = true;
      const known = [...links.values()].filter((l) => l.a === p.id || l.b === p.id)
        .map((l) => (l.a === p.id ? l.b : l.a)).filter((o) => people.get(o).here);
      const sugg = suggestions(p.id), ev = [["checked_in", { person_id: p.id, station_id: station, known_here: known, suggested_groups: sugg }], give({ [p.id]: 1 })];
      if (sugg.length) {
        const g = groups.get(sugg[0].group_id);
        ev.push(["icebreaker", { person_id: p.id, group_id: g.id, text: `${p.name}, ${g.name} is building ${g.working_on} and could use your ${p.skills[0]}.` }]);
      }
      return ev;
    }
    if (kind === "form") return formGroup(sample(solo, 2 + Math.floor(rnd() * 2)));
    if (kind === "join") {
      const pid = pick(solo), openG = [...groups.values()].filter((g) => g.mode === "open").map((g) => g.id);
      const gid = pick(openG.length ? openG : [...groups.keys()]), mem = members(gid);
      people.get(pid).group_id = gid;
      const fresh = mem.filter((m) => link(pid, m)).map((m) => [Math.min(pid, m), Math.max(pid, m)]);
      const pts = { [pid]: 10 + 5 * fresh.length };
      for (const m of mem) pts[m] = 10;
      return [["group_joined", { group_id: gid, new_member_ids: [pid], new_links: fresh }], give(pts, { [gid]: 5 * mem.length })];
    }
    if (kind === "help") {
      const n = pick(open), mentor = pick(mentors);
      for (const x of needs) if (x.group_id === n.group_id && !x.handled_by) x.handled_by = mentor;
      for (const m of members(n.group_id)) link(mentor, m);
      return [["help", { group_id: n.group_id, mentor_id: mentor }], ["needs_updated", { needs: needsList() }]];
    }
    if (kind === "strengthen") {
      const l = pick([...links.values()]);
      l.strength++;
      return [["link_strengthened", { a: l.a, b: l.b, strength: l.strength }]];
    }
    const p = addPerson();
    return [["person_created", { person_id: p.id, name: p.name, role: p.role }]];
  }

  // The demo room: the same 14 people as tools/demo_people.py (stock photos in wall/img/people/), at tables of 4, 4, 3
  // and 2, plus one person on their own. Fixed, so the room always looks the same; the photo path rides in `note`.
  const ROSTER = [
    ["a T delay predictor", ["design"], [["Jasmine", ["backend", "data"], ["design"], "women-44"], ["Tyler", ["frontend"], ["ml"], "men-32"],
                                         ["Ananya", ["ml", "data"], ["frontend"], "women-68"], ["Andre", ["hardware", "firmware"], ["pitch"], "men-75"]]],
    ["a study-room finder", ["hardware"], [["Sofia", ["design", "frontend"], ["backend"], "women-21"], ["Daniel", ["backend"], ["design"], "men-46"],
                                           ["Fatima", ["pitch", "research"], ["mobile"], "women-90"], ["Kenji", ["mobile", "frontend"], ["data"], "men-11"]]],
    ["a dining hall wait-time app", ["pitch"], [["Olivia", ["data", "research"], ["firmware"], "women-57"], ["Liam", ["firmware", "hardware"], ["design"], "men-86"],
                                                ["Hana", ["design"], ["ml"], "women-12"]]],
    ["a bike-share rebalancer", ["frontend"], [["Carlos", ["backend", "ml"], ["frontend"], "men-64"], ["Grace", ["hardware"], ["backend"], "women-33"]]],
  ];
  const SOLO = ["Diego", ["frontend", "design"], ["hardware", "backend"], "men-52", "Looking for a team"];
  let fixed = false;
  function person(name, skills, looking_for, photo, working_on) {
    const id = people.size + 1;
    const p = { id, name, role: "student", group_id: null, here: true, focus: false, points: 0, note: null, bot: true,   // demo people: plain nodes
                skills, looking_for, working_on };
    people.set(id, p);
    return p;
  }
  function build() {
    fixed = true;
    for (const [working_on, want, team] of ROSTER) {
      const ids = team.map(([n, s, lf, ph]) => person(n, s, lf, ph, working_on).id);
      formGroup(ids, true);
      const g = groups.get(groups.size);
      Object.assign(g, { working_on, looking_for: want, mode: "open" });
      needs.splice(0, needs.length, ...needs.filter((x) => x.group_id !== g.id), ...want.map((t) => ({ group_id: g.id, need: t, since: new Date(Date.now() - 600000).toISOString(), handled_by: null })));
    }
    person(...SOLO.slice(0, 4), SOLO[4]);
  }

  // Same shapes as the real GET endpoints.
  function snapshot(path) {
    if (path === "/api/graph") {
      return { people: [...people.values()].map(({ id, name, role, group_id, here, focus, points, note, skills, looking_for, working_on }) => ({ id, name, role, group_id, here, focus, points, note: `/wall/img/people/demo-${id}`, skills, looking_for, working_on })),
               groups: [...groups.values()].map((g) => ({ ...g })), links: [...links.values()].map((l) => ({ ...l })) };
    }
    if (path === "/api/needs") return needsList();
    throw new Error(`${path} not in demo`);
  }

  // Runs one change every `every` ms and hands each event to `emit({type, ts, data})`.
  function start(emit, every = 2600) {
    if (!people.size) build();
    if (fixed) return;                      // the fixed demo room stays as it is
    setInterval(() => {
      for (const [type, data] of step()) {
        const send = () => emit({ type, ts: now(), data });
        if (type === "icebreaker") setTimeout(send, 1200); else send();   // the real one lands a moment later
      }
    }, every);
  }

  return { build, snapshot, start };
})();
