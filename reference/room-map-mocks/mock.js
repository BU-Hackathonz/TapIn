// Draws the sample room on a canvas, in the same look as the host screen. Used by the mock pages only.
//   MockRoom.render({ canvas, select: { type: "table" | "person", id }, k })
const MockRoom = (() => {
  const css = getComputedStyle(document.documentElement);
  const v = (n) => css.getPropertyValue(n).trim();
  const C = { bg: v("--bg"), fg: v("--fg"), muted: v("--muted"), dim: v("--dim"), pink: v("--pink"), green: v("--green"), forest: v("--forest"), deep: v("--deep") || v("--forest"), sand: v("--sand") };
  const SANS = '"IBM Plex Sans", system-ui, sans-serif', MONO = '"IBM Plex Mono", ui-monospace, monospace';
  const letter = MockData.letter;

  function shapeEdges(n, v2) {   // the same idea as the host screen: the shape depends on how many sit at the table, no seat gets more than three lines
    const e = [], add = (i, j) => { if (i !== j && !e.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) e.push([i, j]); };
    if (n === 2) add(0, 1);
    else if (n === 3) { add(0, 1); add(1, 2); add(2, 0); }
    else if (n === 4) { add(0, 2); add(1, 3); }
    else if (v2 % 2) for (let i = 0; i < n; i++) add(i, (i + 2) % n);
    else for (let i = 0; i < n; i++) add(i, (i + Math.floor(n / 2)) % n);
    const deg = new Map();
    return e.filter(([i, j]) => { const a = deg.get(i) || 0, b = deg.get(j) || 0; if (a >= 3 || b >= 3) return false; deg.set(i, a + 1); deg.set(j, b + 1); return true; });
  }

  function render({ canvas, select, k = 1, margin, you }) {
    const r = canvas.getBoundingClientRect(), W = r.width, H = r.height, dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const K = Math.max(0.7, (H / 1000) * k);
    const layout = RoomLayout.create({ width: W, height: H, scale: K, margin: margin || { x: 96 * K, top: 120 * K, bottom: 110 * K } });
    layout.setData(MockData.graph);
    for (let i = 0; i < 400; i++) layout.step();
    const tables = layout.tables(), pos = layout.positions(), byId = new Map(pos.map((p) => [p.id, p]));
    const selTable = select?.type === "table" ? select.id : select?.type === "person" ? byId.get(select.id)?.gid ?? byId.get(select.id)?.seatTable : null;
    const knows = select?.type === "person" ? new Set(MockData.links.filter((l) => l.a === select.id || l.b === select.id).map((l) => (l.a === select.id ? l.b : l.a))) : new Set();
    const dim = (on) => (select ? (on ? 1 : 0.28) : 1);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round";

    // faint lines between tables
    const seen = new Set();
    for (const l of MockData.links) {
      const a = byId.get(l.a), b = byId.get(l.b);
      if (!a || !b || a.gid == null || b.gid == null || a.gid === b.gid) continue;
      const key = [a.gid, b.gid].sort().join("-"); if (seen.has(key)) continue; seen.add(key);
      const A = tables.get(a.gid), B = tables.get(b.gid), dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), ra = A.R + 34 * K, rb = B.R + 34 * K;
      ctx.globalAlpha = 0.22 * dim(!select || a.gid === selTable || b.gid === selTable); ctx.strokeStyle = C.deep; ctx.lineWidth = 1.8 * K;
      ctx.beginPath(); ctx.moveTo(A.x + (dx / d) * ra, A.y + (dy / d) * ra);
      ctx.quadraticCurveTo((A.x + B.x) / 2 - (dy / d) * d * 0.16, (A.y + B.y) / 2 + (dx / d) * d * 0.16, B.x - (dx / d) * rb, B.y - (dy / d) * rb); ctx.stroke();
    }

    // tables: ring, shape between the people, label
    for (const [gid, t] of tables) {
      const g = MockData.groupOf(gid), on = !select || gid === selTable, ms = pos.filter((p) => p.gid === gid).sort((a, b) => a.ang - b.ang);
      const ringR = t.R + 34 * K, quiet = g.mode === "heads_down";
      ctx.globalAlpha = dim(on); ctx.setLineDash([7 * K, 8 * K]); ctx.lineWidth = (gid === selTable ? 3.6 : 2.5) * K;
      ctx.strokeStyle = gid === selTable ? C.pink : quiet ? C.dim : C.deep;
      ctx.beginPath();
      for (let i = 0; i <= 72; i++) { const a = (i / 72) * Math.PI * 2, rr = ringR * (1 + 0.09 * Math.sin(2 * a + gid * 1.9) + 0.06 * Math.sin(3 * a + gid * 0.8)); const x = t.x + Math.cos(a) * rr, y = t.y + Math.sin(a) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
      if (ms.length > 1) {
        ctx.strokeStyle = C.deep; ctx.lineWidth = 2.3 * K; ctx.globalAlpha = 0.9 * dim(on);
        ctx.beginPath(); for (const [i, j] of shapeEdges(ms.length, gid)) { ctx.moveTo(ms[i].x, ms[i].y); ctx.lineTo(ms[j].x, ms[j].y); } ctx.stroke();
      }
      ctx.globalAlpha = dim(on); ctx.fillStyle = gid === selTable ? C.pink : C.green; ctx.font = `${gid === selTable ? 600 : 500} ${Math.max(12, 13 * K)}px ${MONO}`; ctx.textAlign = "center";
      ctx.fillText("table " + letter(gid).toLowerCase(), t.x, t.y - ringR - 10 * K);
    }

    // lines from the selected person to the people they know
    if (select?.type === "person") {
      const me = byId.get(select.id);
      ctx.globalAlpha = 1; ctx.strokeStyle = C.pink; ctx.lineWidth = 3 * K;
      for (const id of knows) { const o = byId.get(id); if (!o) continue; ctx.beginPath(); ctx.moveTo(me.x, me.y); ctx.lineTo(o.x, o.y); ctx.stroke(); }
    }

    // people
    for (const p of pos) {
      const isSel = select?.type === "person" && p.id === select.id, isKnown = knows.has(p.id);
      const on = !select || isSel || isKnown || (select.type === "table" && p.gid === selTable);
      const rad = p.r * (isSel ? 1.9 : 1), helper = p.role !== "student", quiet = p.focus;
      ctx.globalAlpha = dim(on); ctx.lineWidth = 2 * K;
      ctx.strokeStyle = isSel ? C.pink : quiet ? C.dim : C.green; ctx.fillStyle = isSel ? C.pink : C.green;
      ctx.beginPath();
      if (helper) { ctx.rect(p.x - rad, p.y - rad, rad * 2, rad * 2); ctx.fillStyle = C.bg; ctx.fill(); ctx.stroke(); }
      else if (quiet) { ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fillStyle = C.bg; ctx.fill(); ctx.stroke(); }
      else { ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill(); }
      if (you === p.id) { ctx.strokeStyle = C.pink; ctx.lineWidth = 2.4 * K; ctx.beginPath(); ctx.arc(p.x, p.y, rad + 7 * K, 0, Math.PI * 2); ctx.stroke(); }
      if (isSel) { ctx.strokeStyle = C.pink; ctx.lineWidth = 2.4 * K; ctx.beginPath(); ctx.arc(p.x, p.y, rad + 8 * K, 0, Math.PI * 2); ctx.stroke(); }
      const size = Math.max(11, (isSel ? 16 : 13) * K), gap = rad + 7 * K;
      ctx.font = `${isSel || isKnown || helper ? 600 : 400} ${size}px ${SANS}`;
      const seated = p.gid != null || p.seatTable != null; let align = "center", x = p.x, y = p.y + rad + size + 2 * K, base = "alphabetic";
      if (seated && !p.solo) { const c = Math.cos(p.ang), s = Math.sin(p.ang); if (c > 0.3) { align = "left"; x = p.x + gap; y = p.y; base = "middle"; } else if (c < -0.3) { align = "right"; x = p.x - gap; y = p.y; base = "middle"; } else if (s < 0) { y = p.y - gap; } }
      ctx.textAlign = align; ctx.textBaseline = base;
      ctx.lineJoin = "round"; ctx.lineWidth = 4 * K; ctx.strokeStyle = C.bg; ctx.strokeText(p.name, x, y);
      ctx.fillStyle = isSel || isKnown ? C.fg : C.sand; ctx.fillText(you === p.id ? p.name + " (you)" : p.name, x, y);
    }
    ctx.globalAlpha = 1;
    return { layout, tables, pos, byId };
  }
  return { render, letter };
})();
