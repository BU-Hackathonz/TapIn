// Draws the sample room as the 3D map (tables on a sphere, perspective, depth fade) in the Boston T look. Used by the mock pages only.
//   MockRoom.render({ canvas, select: { type: "table" | "person", id }, you, k, rotY, rotX, zoom })
const MockRoom = (() => {
  const css = getComputedStyle(document.documentElement);
  const v = (n) => css.getPropertyValue(n).trim();
  const C = { bg: v("--bg"), fg: v("--fg"), muted: v("--muted"), dim: v("--dim"), pink: v("--pink"), green: v("--green"), deep: v("--deep") || v("--forest"), sand: v("--sand") };
  const SANS = '"IBM Plex Sans", system-ui, sans-serif', MONO = '"IBM Plex Mono", ui-monospace, monospace';
  const letter = MockData.letter;
  const LC = ["#DA291C", "#ED8B00", "#003DA5", "#00843D"];

  function shapeEdges(n, g) {
    const e = [], add = (i, j) => { if (i !== j && !e.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) e.push([i, j]); };
    if (n === 2) add(0, 1); else if (n === 3) { add(0, 1); add(1, 2); add(2, 0); } else if (n === 4) { add(0, 2); add(1, 3); }
    else for (let i = 0; i < n; i++) add(i, (i + (g % 2 ? 2 : Math.floor(n / 2))) % n);
    return e;
  }

  // table centres spread over a sphere, people on a small circle round their centre
  const R = 300, ids = MockData.groups.map((g) => g.id);
  const centres = new Map(ids.map((id, i) => { const y = 1 - (i + 0.5) * (2 / ids.length), r = Math.sqrt(1 - y * y), a = i * 2.399963; return [id, { x: Math.cos(a) * r * R, y: y * R * 0.8, z: Math.sin(a) * r * R }]; }));
  const people3 = [];
  for (const g of MockData.groups) {
    const ms = MockData.people.filter((p) => p.group_id === g.id), c = centres.get(g.id), rad = 38 + ms.length * 7;
    ms.forEach((p, i) => { const a = (i / ms.length) * Math.PI * 2 + g.id; people3.push({ p, gid: g.id, x: c.x + Math.cos(a) * rad, y: c.y + Math.sin(a) * rad * 0.9, z: c.z + Math.sin(a * 2) * 14, ang: a, idx: i, n: ms.length }); });
  }
  const loose = MockData.people.filter((p) => p.group_id == null);
  loose.forEach((p, i) => { const a = i * 1.7 + 0.5; people3.push({ p, gid: null, x: Math.cos(a) * R * 1.05, y: (i % 2 ? 1 : -1) * R * 0.45, z: Math.sin(a) * R * 1.05, ang: 0, idx: 0, n: 1 }); });

  function render({ canvas, select, you, k = 1, rotY = 0.55, rotX = -0.28, zoom = 1 }) {
    const r = canvas.getBoundingClientRect(), W = r.width, H = r.height, dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const K = Math.max(0.6, (H / 1000) * k), D = 900, sc = (Math.min(W, H) / 800) * zoom * 1.05;
    const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(rotX), sx = Math.sin(rotX);
    const proj = (o) => { let x = o.x * cy - o.z * sy, z = o.x * sy + o.z * cy, y = o.y * cx - z * sx; z = o.y * sx + z * cx; const f = D / (D + z); return { x: W / 2 + x * f * sc, y: H / 2 + y * f * sc, f, z }; };
    const near = (f) => Math.max(0.3, Math.min(1, (f - 0.65) / 0.55));    // depth fade: far things are fainter
    const selTable = select?.type === "table" ? select.id : select?.type === "person" ? MockData.byId.get(select.id).group_id : null;
    const knows = select?.type === "person" ? new Set(MockData.links.filter((l) => l.a === select.id || l.b === select.id).map((l) => (l.a === select.id ? l.b : l.a))) : new Set();
    const dimmed = (on) => (select ? (on ? 1 : 0.22) : 1);
    ctx.lineCap = "round";
    const P = new Map(people3.map((o) => [o.p.id, { o, s: proj(o) }]));
    const T = new Map([...centres].map(([id, c]) => [id, proj(c)]));

    // links between tables, drawn under everything
    const seen = new Set();
    for (const l of MockData.links) {
      const a = P.get(l.a), b = P.get(l.b); if (!a || !b || a.o.gid == null || b.o.gid == null || a.o.gid === b.o.gid) continue;
      const key = [a.o.gid, b.o.gid].sort().join("-"); if (seen.has(key)) continue; seen.add(key);
      ctx.globalAlpha = 0.32 * near((a.s.f + b.s.f) / 2) * dimmed(!select || a.o.gid === selTable || b.o.gid === selTable); ctx.strokeStyle = C.deep; ctx.lineWidth = 1.8 * K;
      ctx.beginPath(); ctx.moveTo(a.s.x, a.s.y); ctx.lineTo(b.s.x, b.s.y); ctx.stroke();
    }
    // draw tables and people far to near
    const items = [];
    for (const g of MockData.groups) items.push({ t: "table", g, z: T.get(g.id).z });
    for (const o of people3) items.push({ t: "person", o, z: P.get(o.p.id).s.z });
    items.sort((a, b) => b.z - a.z);
    for (const it of items) {
      if (it.t === "table") {
        const g = it.g, s = T.get(g.id), on = !select || g.id === selTable, ms = people3.filter((o) => o.gid === g.id), fa = near(s.f);
        const ringR = (38 + ms.length * 7 + 34) * s.f * sc;
        ctx.globalAlpha = dimmed(on) * fa; ctx.setLineDash([7 * K, 8 * K]); ctx.lineWidth = (g.id === selTable ? 3.6 : 2.5) * K; ctx.strokeStyle = g.id === selTable ? C.pink : g.mode === "heads_down" ? C.dim : C.deep;
        ctx.beginPath(); for (let i = 0; i <= 72; i++) { const a = (i / 72) * Math.PI * 2, rr = ringR * (1 + 0.09 * Math.sin(2 * a + g.id * 1.9) + 0.06 * Math.sin(3 * a + g.id * 0.8)); const x = s.x + Math.cos(a) * rr, y = s.y + Math.sin(a) * rr * 0.92; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
        if (ms.length > 1) { ctx.strokeStyle = C.deep; ctx.lineWidth = 2.2 * K; ctx.globalAlpha = 0.9 * dimmed(on) * fa; ctx.beginPath(); for (const [i, j] of shapeEdges(ms.length, g.id)) { const a = P.get(ms[i].p.id).s, b = P.get(ms[j].p.id).s; ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } ctx.stroke(); }
        const lab = Math.max(11, 14 * K * s.f);
        ctx.globalAlpha = dimmed(on) * fa; ctx.font = `700 ${lab}px ${SANS}`; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        const tx = s.x, ty = s.y - ringR - 8 * K, w = ctx.measureText("Table " + letter(g.id)).width + lab * 1.9;
        ctx.fillStyle = LC[g.id % 4]; ctx.fillRect(tx - w / 2, ty - lab * 1.15, lab * 1.4, lab * 1.4);
        ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.fillText(letter(g.id), tx - w / 2 + lab * 0.7, ty - lab * 0.05);
        ctx.fillStyle = g.id === selTable ? C.pink : C.fg; ctx.textAlign = "left"; ctx.fillText("Table " + letter(g.id), tx - w / 2 + lab * 1.7, ty - lab * 0.05);
      } else {
        const { o, s } = { o: it.o, s: P.get(it.o.p.id).s }, p = o.p, isSel = select?.type === "person" && p.id === select.id, isKnown = knows.has(p.id);
        const on = !select || isSel || isKnown || (select.type === "table" && o.gid === selTable), fa = near(s.f), helper = p.role !== "student";
        const rad = (4.8 + 3 * Math.min(1, Math.sqrt(p.points / 60))) * K * s.f * sc * (isSel ? 1.9 : 1);
        ctx.globalAlpha = dimmed(on) * fa; ctx.lineWidth = 2 * K; ctx.strokeStyle = isSel ? C.pink : C.green; ctx.fillStyle = isSel ? C.pink : C.green; ctx.beginPath();
        if (helper) { ctx.rect(s.x - rad, s.y - rad, rad * 2, rad * 2); ctx.fillStyle = C.bg; ctx.fill(); ctx.stroke(); }
        else if (p.focus) { ctx.arc(s.x, s.y, rad, 0, Math.PI * 2); ctx.fillStyle = C.bg; ctx.fill(); ctx.stroke(); }
        else { ctx.arc(s.x, s.y, rad, 0, Math.PI * 2); ctx.fill(); }
        if (isSel || you === p.id) { ctx.strokeStyle = C.pink; ctx.lineWidth = 2.4 * K; ctx.beginPath(); ctx.arc(s.x, s.y, rad + 7 * K, 0, Math.PI * 2); ctx.stroke(); }
        if (isSel) { ctx.strokeStyle = C.pink; ctx.lineWidth = 3 * K; for (const id of knows) { const q = P.get(id)?.s; if (!q) continue; ctx.globalAlpha = 1; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(q.x, q.y); ctx.stroke(); } }
        const size = Math.max(10, (isSel ? 16 : 12.5) * K * Math.max(0.8, s.f)); ctx.globalAlpha = dimmed(on) * fa;
        ctx.font = `${isSel || isKnown || helper ? 600 : 400} ${size}px ${SANS}`; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        ctx.lineJoin = "round"; ctx.lineWidth = 4 * K; ctx.strokeStyle = C.bg; const name = you === p.id ? p.name + " (you)" : p.name, ly = s.y + rad + size + 2 * K;
        ctx.strokeText(name, s.x, ly); ctx.fillStyle = isSel || isKnown ? C.fg : C.sand; ctx.fillText(name, s.x, ly);
      }
    }
    ctx.globalAlpha = 1;
  }
  return { render, letter };
})();
