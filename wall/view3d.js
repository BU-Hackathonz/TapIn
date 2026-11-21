// 3D room view on a plain 2D canvas (perspective projection, no WebGL), so it runs on phones too.
// Tables are regions on a sphere, people orbit inside their table, new arrivals sit in the core.
// Drag to rotate, pinch or scroll to zoom, double-tap or right-click to reset, tap a person for their card,
// tap a table chip to isolate it. Idle for a few seconds and it rotates on its own.
const View3D = (() => {
  const PHONE = matchMedia("(max-width: 700px), (pointer: coarse)").matches;
  const PRESET = PHONE ? { dpr: 1.5, fps: 30, labels: 10 } : { dpr: 2, fps: 60, labels: 40 };
  const R = 300;               // table centers sit on this sphere
  let canvas, ctx, scene, COLOR, W = 0, H = 0, active = false;
  let rotY = 0.4, rotX = -0.3, zoom = 1, lastTouch = 0, lastFrame = 0, isolate = null;
  const pos = new Map();       // person id -> {x,y,z,tx,ty,tz}
  const centers = new Map();   // group id -> {x,y,z,r}
  const pulses = [];
  let picked = null, pickedUntil = 0, chipKey = "";

  const fib = (i, n) => {
    if (n <= 1) return [0, 0, 0];
    const y = 1 - (2 * (i + 0.5)) / n, rad = Math.sqrt(1 - y * y), th = i * 2.399963;
    return [Math.cos(th) * rad, y, Math.sin(th) * rad];
  };
  const spread = (n) => 34 + 14 * Math.sqrt(n);

  function init(sceneFn, colors) {
    canvas = document.getElementById("map3d");
    ctx = canvas.getContext("2d");
    if (!ctx) return false;
    scene = sceneFn;
    COLOR = colors;
    bindInput();
    addEventListener("resize", size);
    size();
    requestAnimationFrame(frame);
    return true;
  }

  function size() {
    const dpr = Math.min(devicePixelRatio || 1, PRESET.dpr);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setActive(on) {
    active = on;
    if (on) { size(); relayout(); }
  }

  // Recompute target positions; people glide there over the next frames.
  function relayout() {
    if (!scene) return;
    const { visible, shownGroups } = scene();
    centers.clear();
    // Stretch the sphere toward the screen's long side: tall on portrait phones, wide on the projector.
    const xs = W > H ? Math.min(1.8, W / H) : 1, ys = H > W ? 1.7 : 0.8;
    shownGroups.forEach((g, i) => {
      const [x, y, z] = fib(i, shownGroups.length);
      const n = visible.filter((p) => p.group_id === g.id).length;
      const k = shownGroups.length === 1 ? 0 : R;
      centers.set(g.id, { x: x * k * xs, y: y * k * ys, z: z * k, r: spread(n) });
    });
    const byGroup = new Map();
    for (const p of visible) {
      const key = centers.has(p.group_id) ? p.group_id : 0;
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key).push(p);
    }
    const seen = new Set();
    for (const [gid, ms] of byGroup) {
      const c = centers.get(gid) || { x: 0, y: 0, z: 0, r: spread(ms.length) };
      ms.forEach((p, i) => {
        const [ox, oy, oz] = fib(i, ms.length), r = c.r * 0.72;
        const q = pos.get(p.id) || { x: c.x, y: c.y, z: c.z };
        Object.assign(q, { tx: c.x + ox * r, ty: c.y + oy * r, tz: c.z + oz * r });
        pos.set(p.id, q);
        seen.add(p.id);
      });
    }
    for (const id of [...pos.keys()]) if (!seen.has(id)) pos.delete(id);
    renderChips(shownGroups);
  }

  function project(x, y, z) {
    const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(rotX), sx = Math.sin(rotX);
    const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
    const y2 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
    const D = 950 / zoom, f = Math.min(W, H) * (H > W ? 1.35 : 0.95), s = f / (z2 + D);
    return { x: W / 2 + x1 * s, y: H / 2 + y2 * s, s, z: z2 };
  }
  const depthAlpha = (z) => Math.max(0.18, Math.min(1, 0.6 - z / (R * 2.2)));

  function frame(t) {
    requestAnimationFrame(frame);
    if (!active || document.hidden || t - lastFrame < 1000 / PRESET.fps - 2) return;
    const dt = Math.min(64, t - lastFrame);
    lastFrame = t;
    if (t - lastTouch > 5000) rotY += 0.00018 * dt;   // idle spin
    for (const q of pos.values()) {
      q.x += (q.tx - q.x) * 0.08; q.y += (q.ty - q.y) * 0.08; q.z += (q.tz - q.z) * 0.08;
    }
    draw(t);
  }

  function draw(t) {
    const { S, radius } = scene();
    ctx.clearRect(0, 0, W, H);
    const P = new Map();
    for (const [id, q] of pos) P.set(id, project(q.x, q.y, q.z));
    const C = new Map([...centers].map(([gid, c]) => [gid, { ...project(c.x, c.y, c.z), r: c.r }]));
    const dim = (gid) => isolate !== null && gid !== isolate;
    const focusLinks = picked && t < pickedUntil ? picked : null;

    // table regions, far first
    for (const [gid, c] of [...C].sort((a, b) => b[1].z - a[1].z)) {
      const g = S.groups.get(gid);
      ctx.globalAlpha = dim(gid) ? 0.12 : depthAlpha(c.z);
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r * c.s, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(127,224,189,0.05)";
      ctx.fill();
      ctx.setLineDash(g?.mode === "heads_down" ? [6, 6] : []);
      ctx.strokeStyle = g?.glow ? COLOR.raspberry : "#3a3a3a";
      ctx.lineWidth = g?.glow ? 3 : 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // links
    for (const [k, l] of S.links) {
      const a = P.get(l.a), b = P.get(l.b);
      if (!a || !b) continue;
      const pa = S.people.get(l.a), pb = S.people.get(l.b);
      const inner = pa.group_id && pa.group_id === pb.group_id;
      const mine = focusLinks && (l.a === focusLinks || l.b === focusLinks);
      const hidden = dim(pa.group_id) && dim(pb.group_id);
      ctx.globalAlpha = hidden ? 0.04 : (mine ? 1 : depthAlpha((a.z + b.z) / 2) * (inner ? 0.55 : 0.2));
      ctx.strokeStyle = S.fresh.has(k) || mine ? COLOR.raspberry : inner ? COLOR.mint : "#8a8a8a";
      ctx.lineWidth = Math.min(1 + (l.strength - 1) * 0.7, 4) * (mine ? 1.6 : 1);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    // newcomer -> suggested table
    ctx.setLineDash([5, 7]);
    ctx.strokeStyle = COLOR.raspberry; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
    for (const h of S.hints) {
      const a = P.get(h.pid), c = C.get(h.gid);
      if (a && c && h.until > Date.now()) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke(); }
    }
    ctx.setLineDash([]);

    // people, far first
    const order = [...P].sort((a, b) => b[1].z - a[1].z);
    for (const [id, p] of order) {
      const person = S.people.get(id);
      const r = radius(person) * p.s;
      ctx.globalAlpha = dim(person.group_id) ? 0.12 : person.here ? depthAlpha(p.z) : 0.22;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      const col = person.here ? COLOR[person.role] || COLOR.student : COLOR.away;
      if (person.focus) { ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke(); }
      else { ctx.fillStyle = col; ctx.fill(); }
    }

    // Labels, nearest first; a label that would overlap one already drawn is skipped (no label piles).
    ctx.textAlign = "center";
    const boxes = [];
    const fits = (x, y, w, h) => {
      const b = { l: x - w / 2 - 4, r: x + w / 2 + 4, t: y - h, btm: y + 4 };
      if (boxes.some((o) => b.l < o.r && b.r > o.l && b.t < o.btm && b.btm > o.t)) return false;
      boxes.push(b);
      return true;
    };
    const big = PHONE ? 15 : 20, small = PHONE ? 12 : 14;
    for (const [gid, c] of [...C].sort((a, b) => a[1].z - b[1].z)) {
      if (dim(gid)) continue;
      const g = S.groups.get(gid), need = scene().needLine(g), top = c.y - c.r * c.s - 10;
      ctx.font = `700 ${big}px "IBM Plex Sans", sans-serif`;
      const w = Math.max(ctx.measureText(g?.name || "").width, need.length * small * 0.5);
      if (!fits(c.x, top, w, big + small + 8)) continue;
      ctx.globalAlpha = Math.max(0.5, depthAlpha(c.z));
      ctx.fillStyle = "#f2f2f2";
      ctx.fillText(g?.name || "", c.x, top - small - 4);
      ctx.fillStyle = g?.mode === "heads_down" ? "#8a8a8a" : COLOR.mint;
      ctx.font = `${small}px "IBM Plex Sans", sans-serif`;
      ctx.fillText(need, c.x, top);
    }
    ctx.font = `${small}px "IBM Plex Sans", sans-serif`;
    const near = order.slice(-PRESET.labels).map(([id]) => id).reverse();
    if (focusLinks) near.unshift(focusLinks);
    for (const id of near) {
      const p = P.get(id), person = S.people.get(id);
      if (dim(person.group_id)) continue;
      const y = p.y + radius(person) * p.s + 15;
      if (!fits(p.x, y, ctx.measureText(person.name).width, small)) continue;
      ctx.globalAlpha = id === focusLinks ? 1 : depthAlpha(p.z) * 0.9;
      ctx.fillStyle = "#d6d6d6";
      ctx.fillText(person.name, p.x, y);
    }

    // arrival pulses
    for (let i = pulses.length - 1; i >= 0; i--) {
      const u = (t - pulses[i].t0) / 1400, p = P.get(pulses[i].id);
      if (u >= 1 || !p) { pulses.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - u;
      ctx.strokeStyle = pulses[i].color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 10 + u * 70, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    lastProjection = P;
  }
  let lastProjection = new Map();

  function pulse(id, color) {
    pulses.push({ id, color: color || COLOR.raspberry, t0: performance.now() });
  }

  // ------------------------------------------------------------ input

  function reset() { rotY = 0.4; rotX = -0.3; zoom = 1; isolate = null; picked = null; markChips(); }

  function bindInput() {
    const pts = new Map();
    let moved = 0, pinch = 0, lastTap = 0;
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0; lastTouch = performance.now();
    });
    canvas.addEventListener("pointermove", (e) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      pts.set(e.pointerId, cur);
      lastTouch = performance.now();
      if (pts.size === 1) {
        rotY += (cur.x - prev.x) * 0.006;
        rotX = Math.max(-1.3, Math.min(1.3, rotX + (cur.y - prev.y) * 0.006));
        moved += Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) zoom = Math.max(0.5, Math.min(3, zoom * (d / pinch)));
        pinch = d; moved = 99;
      }
    });
    const up = (e) => {
      const was = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = 0;
      if (!was || moved > 6 || e.button === 2) return;
      const now = performance.now();
      if (now - lastTap < 300) { reset(); hideCard(); lastTap = 0; return; }
      lastTap = now;
      pick(e.clientX - canvas.getBoundingClientRect().left, e.clientY - canvas.getBoundingClientRect().top);
    };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      lastTouch = performance.now();
      zoom = Math.max(0.5, Math.min(3, zoom * Math.exp(-e.deltaY * 0.001)));
    }, { passive: false });
    canvas.addEventListener("contextmenu", (e) => { e.preventDefault(); reset(); hideCard(); });
  }

  function pick(x, y) {
    const { S, radius } = scene();
    let best = null, bestD = Infinity;
    for (const [id, p] of lastProjection) {
      const d = Math.hypot(p.x - x, p.y - y), person = S.people.get(id);
      if (d < Math.max(22, radius(person) * p.s + 8) && d < bestD) { best = id; bestD = d; }
    }
    if (best === null) { hideCard(); return; }
    picked = best; pickedUntil = performance.now() + 6000;
    const person = S.people.get(best), g = S.groups.get(person.group_id);
    const card = document.getElementById("card3d");
    card.replaceChildren();
    const b = document.createElement("b");
    b.textContent = person.name;
    const line = g ? `${g.name}${scene().needLine(g) ? " · " + scene().needLine(g) : ""}` : person.here ? "just arrived" : "away";
    card.append(b, document.createElement("br"), line);
    card.style.left = `${Math.min(x + 14, W - 220)}px`;
    card.style.top = `${Math.max(y - 60, 70)}px`;
    card.hidden = false;
    clearTimeout(pick.timer);
    pick.timer = setTimeout(hideCard, 6000);
  }
  function hideCard() { document.getElementById("card3d").hidden = true; picked = null; }

  // Table chips: tap one to isolate that table, tap again or "All" to show everything.
  function renderChips(groups) {
    const key = groups.map((g) => `${g.id}:${g.name}`).join(",");
    if (key === chipKey) return;
    chipKey = key;
    const bar = document.getElementById("chips");
    bar.replaceChildren();
    const mk = (label, gid) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = label; b.dataset.gid = gid ?? "";
      b.addEventListener("click", () => { isolate = gid === null || isolate === gid ? null : gid; markChips(); });
      bar.append(b);
    };
    mk("All", null);
    for (const g of groups) mk(g.name.replace("Table ", "T"), g.id);
    if (isolate !== null && !groups.some((g) => g.id === isolate)) isolate = null;
    markChips();
  }
  function markChips() {
    for (const b of document.querySelectorAll("#chips button"))
      b.classList.toggle("on", b.dataset.gid === "" ? isolate === null : Number(b.dataset.gid) === isolate);
  }

  return { init, setActive, relayout, pulse, PHONE };
})();
