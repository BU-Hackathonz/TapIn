// 3D room view on a plain 2D canvas (perspective projection, no WebGL), so it runs on phones too.
// Tables are regions on a sphere, people orbit inside their table, new arrivals sit in the core.
// Drag to rotate (a flick keeps it turning, slowed by friction), pinch or scroll to zoom, double-tap or right-click to reset, tap a person for their card,
// Idle for a few seconds and it rotates on its own.
// Zoom in and dots turn into profile pictures (mockups: initials on a colour from the name, no real photos).
const View3D = (() => {
  const PHONE = matchMedia("(max-width: 700px), (pointer: coarse)").matches;
  const PRESET = PHONE ? { dpr: 1.5, fps: 30, labels: 10 } : { dpr: 2, fps: 60, labels: 40 };
  const R = 300;               // table centers sit on this sphere
  let canvas, ctx, scene, W = 0, H = 0, active = false;
  let rotY = 0.4, rotX = -0.3, zoom = 1, lastTouch = 0, lastFrame = 0;
  const pos = new Map();       // person id -> {x,y,z,tx,ty,tz}
  const centers = new Map();   // group id -> {x,y,z,r}
  const pulses = [];
  let picked = null, pickedUntil = 0;
  let zoomGoal = 1, focusId = null, spinX = 0, spinY = 0, pointers = 0, liftY = 0;
  const cam = { x: 0, y: 0, z: 0 };   // point the camera orbits; eases to a tapped person

  // Mockup profile picture: initials on a colour from the name, drawn in the active theme's style. Cached.
  const avatars = new Map();
  function avatar(person) {
    const style = Theme.c.avatar, key = `${style}:${person.id}:${person.name}:${person.face || ""}:${person.photo ? person.photo.length : 0}`;
    if (avatars.has(key)) return avatars.get(key);
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    let h = 0;
    for (const ch of person.name) h = (h * 31 + ch.charCodeAt(0)) % 360;
    if (person.photo) {
      // Draw the face first so there's something to show, then paint the photo over it once it decodes.
      drawFace(g, person);
      const img = new Image();
      img.onload = () => {
        g.save(); g.beginPath(); g.arc(64, 64, 64, 0, Math.PI * 2); g.clip();
        g.drawImage(img, 0, 0, 128, 128); g.restore();
        if (typeof Corner !== "undefined") Corner.refresh();   // the sign-in page has no Corner
      };
      img.src = person.photo;
      avatars.set(key, c);
      return c;
    }
    if (style === "face") {
      drawFace(g, person);
      avatars.set(key, c);
      return c;
    }
    const initials = person.name.split(/\s+/).filter((w) => /[A-Za-z]/.test(w[0])).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
    const circle = () => { g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); };
    const silhouette = (fill) => {
      g.fillStyle = fill;
      g.beginPath(); g.arc(64, 50, 24, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(64, 122, 46, 38, 0, Math.PI, 0); g.fill();
    };
    let ink = "#fff", font = '600 48px "IBM Plex Sans", sans-serif';
    if (style === "mono") {
      circle(); g.fillStyle = `hsl(0 0% ${82 + (h % 10)}%)`; g.fill();
      silhouette("rgba(0,0,0,0.06)"); ink = "#111";
    } else if (style === "pencil") {
      circle(); g.fillStyle = `hsl(${h} 55% 84%)`; g.fill();
      g.strokeStyle = "rgba(40,40,40,0.25)"; g.lineWidth = 2;
      for (let i = -128; i < 128; i += 10) { g.beginPath(); g.moveTo(i, 128); g.lineTo(i + 128, 0); g.stroke(); }  // hatching
      g.globalCompositeOperation = "destination-in"; circle(); g.fill(); g.globalCompositeOperation = "source-over";
      circle(); g.strokeStyle = "#2b2b2b"; g.lineWidth = 4; g.stroke();
      ink = "#1d1d1d"; font = '52px "Patrick Hand", cursive';
    } else if (style === "line") {
      circle(); g.fillStyle = "rgba(207,232,255,0.08)"; g.fill();
      g.strokeStyle = "#e6f3ff"; g.lineWidth = 4; g.stroke();
      ink = "#e6f3ff"; font = '600 44px "IBM Plex Mono", monospace';
    } else {
      const grad = g.createLinearGradient(0, 0, 128, 128);
      grad.addColorStop(0, `hsl(${h} 55% 52%)`);
      grad.addColorStop(1, `hsl(${(h + 40) % 360} 60% 30%)`);
      circle(); g.fillStyle = grad; g.fill();
      silhouette("rgba(255,255,255,0.16)");
    }
    g.fillStyle = ink; g.font = font;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(initials, 64, 68);
    avatars.set(key, c);
    return c;
  }

  // Mock profile picture: a simple drawn face (skin, hair, shirt, background picked from the name), so no real
  // person's photo is ever used. Same person, same face.
  const SKIN = ["#f8dcc8", "#efc4a4", "#dba57f", "#bf8460", "#93603f", "#64412a"];
  const HAIR = ["#2a1b12", "#4b2e1c", "#7b4a27", "#c79a5b", "#151515", "#9b3a24", "#8a8a8a", "#e0c48a"];
  function drawFace(g, person) {
    let s = 7;
    for (const ch of person.face || `${person.id}:${person.name}`) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
    const r = (n) => { s = Math.imul(s ^ (s >>> 13), 1274126177) >>> 0; return s % n; };
    const bgHue = r(360), skin = SKIN[r(SKIN.length)], hair = HAIR[r(HAIR.length)];
    const shirt = `hsl(${r(360)} 45% ${38 + r(20)}%)`, style = r(5);
    g.save();
    g.beginPath(); g.arc(64, 64, 64, 0, Math.PI * 2); g.clip();
    g.fillStyle = `hsl(${bgHue} 55% 88%)`; g.fillRect(0, 0, 128, 128);
    // long hair falls behind the shoulders
    if (style === 1) { g.fillStyle = hair; g.beginPath(); g.ellipse(64, 72, 34, 44, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = shirt; g.beginPath(); g.ellipse(64, 132, 48, 36, 0, Math.PI, 0); g.fill();
    g.fillStyle = skin; g.fillRect(56, 80, 16, 16);                                          // neck
    g.beginPath(); g.ellipse(64, 60, 25, 29, 0, 0, Math.PI * 2); g.fill();                   // head
    g.beginPath(); g.arc(39, 62, 5, 0, Math.PI * 2); g.arc(89, 62, 5, 0, Math.PI * 2); g.fill();  // ears
    g.fillStyle = hair;
    if (style === 0 || style === 1) {          // side part
      g.beginPath(); g.ellipse(64, 42, 27, 17, 0, Math.PI, 0); g.fill();
      g.beginPath(); g.ellipse(52, 40, 16, 10, -0.5, 0, Math.PI * 2); g.fill();
    } else if (style === 2) {                  // bun
      g.beginPath(); g.arc(64, 22, 11, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(64, 42, 26, 16, 0, Math.PI, 0); g.fill();
    } else if (style === 3) {                  // curls
      for (const [x, y] of [[44, 42], [54, 33], [64, 30], [74, 33], [84, 42], [40, 52], [88, 52]]) {
        g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
      }
    } else {                                    // short crop
      g.beginPath(); g.ellipse(64, 40, 25, 13, 0, Math.PI, 0); g.fill();
    }
    g.fillStyle = "#2a2a2a";
    g.beginPath(); g.arc(55, 61, 2.8, 0, Math.PI * 2); g.arc(73, 61, 2.8, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#2a2a2a"; g.lineWidth = 2.4; g.lineCap = "round";
    g.beginPath(); g.arc(64, 70, 7, 0.18 * Math.PI, 0.82 * Math.PI); g.stroke();
    g.fillStyle = "rgba(230,110,110,0.22)";
    g.beginPath(); g.arc(49, 71, 4.5, 0, Math.PI * 2); g.arc(79, 71, 4.5, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // Sketch style: every stroke is drawn twice with a small, stable wobble (seeded per element, so it doesn't boil).
  const seeded = (n) => { let x = (n * 2654435761) >>> 0; return () => ((x = Math.imul(x ^ (x >>> 15), 2246822507) >>> 0) / 4294967296 - 0.5); };
  const hash = (str) => { let h = 7; for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
  function line(x1, y1, x2, y2, seed) {
    if (!Theme.c.rough) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); return; }
    const r = seeded(seed), len = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
    for (let pass = 0; pass < 2; pass++) {
      const bow = r() * Math.min(6, len * 0.04), mx = (x1 + x2) / 2 + nx * bow, my = (y1 + y2) / 2 + ny * bow;
      ctx.beginPath();
      ctx.moveTo(x1 + r() * 2, y1 + r() * 2);
      ctx.quadraticCurveTo(mx, my, x2 + r() * 2, y2 + r() * 2);
      ctx.stroke();
    }
  }
  function ring(x, y, rad, seed) {
    if (!Theme.c.rough) { ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); return; }
    const r = seeded(seed);
    ctx.beginPath();
    for (let pass = 0; pass < 2; pass++) {
      const a0 = r() * 6, rx = rad * (1 + r() * 0.06), ry = rad * (1 + r() * 0.06);
      ctx.moveTo(x + Math.cos(a0) * rx + r() * 2, y + Math.sin(a0) * ry);
      ctx.ellipse(x + r() * 2, y + r() * 2, rx, ry, r() * 0.4, a0, a0 + Math.PI * 2.08);
    }
  }

  const fib = (i, n) => {
    if (n <= 1) return [0, 0, 0];
    const y = 1 - (2 * (i + 0.5)) / n, rad = Math.sqrt(1 - y * y), th = i * 2.399963;
    return [Math.cos(th) * rad, y, Math.sin(th) * rad];
  };
  const spread = (n) => 34 + 14 * Math.sqrt(n);

  function init(sceneFn) {
    canvas = document.getElementById("map3d");
    ctx = canvas.getContext("2d");
    if (!ctx) return false;
    scene = sceneFn;
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
    const xs = W > H ? Math.min(1.8, W / H) : 0.5, ys = H > W ? 1.7 : 0.8;
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
  }

  function project(x, y, z) {
    x -= cam.x; y -= cam.y; z -= cam.z;
    const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(rotX), sx = Math.sin(rotX);
    const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
    const y2 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
    const D = 950 / zoom, f = Math.min(W, H) * (H > W ? 1.35 : 0.95);
    // Near plane: anything closer than 60 units (or behind) the camera is culled, not drawn inside-out.
    const depth = z2 + D, s = depth > 60 ? f / depth : 0;
    return { x: W / 2 + x1 * s, y: H / 2 + liftY + y2 * s, s, z: z2, off: depth <= 60 };
  }
  const depthAlpha = (z) => Math.max(0.18, Math.min(1, 0.6 - z / (R * 2.2)));

  function frame(t) {
    requestAnimationFrame(frame);
    if (!active || document.hidden || t - lastFrame < 1000 / PRESET.fps - 2) return;
    const dt = Math.min(64, t - lastFrame);
    lastFrame = t;
    coast(dt, t);
    if (opts.spin && t - lastTouch > 5000) rotY += 0.00018 * dt;   // idle spin
    for (const q of pos.values()) {
      q.x += (q.tx - q.x) * 0.08; q.y += (q.ty - q.y) * 0.08; q.z += (q.tz - q.z) * 0.08;
    }
    const f = (focusId !== null && pos.get(focusId)) || (focusGroup !== null && centers.get(focusGroup));
    const goal = f || { x: 0, y: 0, z: 0 };
    cam.x += (goal.x - cam.x) * 0.1; cam.y += (goal.y - cam.y) * 0.1; cam.z += (goal.z - cam.z) * 0.1;
    zoom += (zoomGoal - zoom) * 0.12;
    // Phones: the profile is a bottom sheet, so lift the view to keep the tapped person above it.
    const sheet = W <= 700 && !document.getElementById("profile").hidden;
    liftY += ((sheet ? -H * 0.3 : 0) - liftY) * 0.12;
    draw(t);
  }

  function draw(t) {
    const { S, radius } = scene();
    ctx.clearRect(0, 0, W, H);
    const P = new Map();
    for (const [id, q] of pos) {
      const p = project(q.x, q.y, q.z);
      if (!p.off) P.set(id, p);
    }
    const C = new Map();
    for (const [gid, c] of centers) {
      const p = project(c.x, c.y, c.z);
      if (!p.off) C.set(gid, { ...p, r: c.r });
    }
    const focusLinks = picked && t < pickedUntil ? picked : null;
    const T = Theme.c;

    // table regions, far first
    for (const [gid, c] of [...C].sort((a, b) => b[1].z - a[1].z)) {
      const g = S.groups.get(gid);
      ctx.globalAlpha = depthAlpha(c.z);
      ring(c.x, c.y, c.r * c.s, gid * 977);
      ctx.fillStyle = T.regionFill;
      ctx.fill();
      ctx.setLineDash(g?.mode === "heads_down" ? [6, 6] : []);
      ctx.strokeStyle = g?.glow ? T.accent : T.region;
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
      ctx.globalAlpha = mine ? 1 : Math.min(1, depthAlpha((a.z + b.z) / 2) * (inner ? 0.55 : 0.2) * T.linkAlpha);
      ctx.strokeStyle = S.fresh.has(k) || mine ? T.accent : inner ? T.inner : T.link;
      ctx.lineWidth = Math.min(1 + (l.strength - 1) * 0.7, 4) * (mine ? 1.6 : 1);
      line(a.x, a.y, b.x, b.y, hash(k));
    }

    // newcomer -> suggested table
    ctx.setLineDash([5, 7]);
    ctx.strokeStyle = T.accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
    for (const h of S.hints) {
      const a = P.get(h.pid), c = C.get(h.gid);
      if (a && c && h.until > Date.now()) line(a.x, a.y, c.x, c.y, h.pid);
    }
    ctx.setLineDash([]);

    // people, far first
    const order = [...P].sort((a, b) => b[1].z - a[1].z);
    for (const [id, p] of order) {
      const person = S.people.get(id);
      const r = radius(person) * p.s;
      const base = person.here ? depthAlpha(p.z) : 0.22;
      const col = person.here ? T[person.role] || T.student : T.away;
      // Dot below ~14 px on screen, profile picture above ~22 px, cross-fade between.
      const pic = Math.max(0, Math.min(1, (r - 14) / 8));
      if (pic < 1) {
        ctx.globalAlpha = base * (1 - pic);
        ring(p.x, p.y, r, id);
        if (person.focus || T.rough) { ctx.strokeStyle = col; ctx.lineWidth = T.rough ? 1.6 : 2.5; ctx.stroke(); }
        if (!person.focus) { ctx.fillStyle = col; ctx.globalAlpha *= T.rough ? 0.85 : 1; ctx.fill(); }
      }
      if (pic > 0) {
        const rr = r * 1.25;
        ctx.globalAlpha = base * pic * (person.here ? 1 : 0.5);
        ctx.save();
        ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(avatar(person), p.x - rr, p.y - rr, rr * 2, rr * 2);
        ctx.restore();
        ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
        ctx.setLineDash(person.focus ? [4, 4] : []);
        ctx.strokeStyle = id === focusLinks ? T.accent : col;
        ctx.lineWidth = Math.max(2, rr * 0.08);
        ctx.stroke();
        ctx.setLineDash([]);
      }
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
    const k = T.rough ? 1.2 : 1, big = (PHONE ? 15 : 20) * k, small = (PHONE ? 12 : 14) * k;
    for (const [gid, c] of [...C].sort((a, b) => a[1].z - b[1].z)) {
      const g = S.groups.get(gid), need = scene().needLine(g), top = c.y - c.r * c.s - 10;
      ctx.font = `700 ${big}px ${T.font}`;
      const w = Math.max(ctx.measureText(g?.name || "").width, need.length * small * 0.5);
      const lx = Math.max(w / 2 + 8, Math.min(W - w / 2 - 8, c.x));   // keep the label on screen
      if (!fits(lx, top, w, big + small + 8)) continue;
      ctx.globalAlpha = Math.max(0.5, depthAlpha(c.z));
      ctx.fillStyle = T.title;
      ctx.fillText(g?.name || "", lx, top - small - 4);
      ctx.fillStyle = g?.mode === "heads_down" ? T.dim : T.need;
      ctx.font = `${small}px ${T.font}`;
      ctx.fillText(need, lx, top);
    }
    ctx.font = `${small}px ${T.font}`;
    const near = opts.names ? order.slice(-PRESET.labels).map(([id]) => id).reverse() : [];
    if (focusLinks) near.unshift(focusLinks);
    for (const id of near) {
      const p = P.get(id), person = S.people.get(id);
      if (!p) continue;
      const y = p.y + radius(person) * p.s * 1.25 + 15;
      if (!fits(p.x, y, ctx.measureText(person.name).width, small)) continue;
      ctx.globalAlpha = id === focusLinks ? 1 : depthAlpha(p.z) * 0.9;
      ctx.fillStyle = T.name;
      ctx.fillText(person.name, p.x, y);
    }

    // arrival pulses
    for (let i = pulses.length - 1; i >= 0; i--) {
      const u = (t - pulses[i].t0) / 1400, p = P.get(pulses[i].id);
      if (u >= 1 || !p) { pulses.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - u;
      ctx.strokeStyle = T[pulses[i].kind] || T.accent; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 10 + u * 70, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    lastProjection = P;
    lastCenters = C;
  }
  let lastProjection = new Map(), lastCenters = new Map(), focusGroup = null, onGroup = () => {};

  function pulse(id, kind = "accent") {
    pulses.push({ id, kind, t0: performance.now() });
  }

  // ------------------------------------------------------------ input

  function reset() {
    rotY = 0.4; rotX = -0.3; zoomGoal = 1; focusId = null; focusGroup = null; picked = null; spinX = spinY = 0;
  }
  const setZoom = (z) => { zoomGoal = zoom = Math.max(0.5, Math.min(4.5, z)); };

  // Swipe momentum: the drag's release speed keeps the room turning, friction bleeds it off.
  // Speed decays by e every FRICTION ms, so a fast flick coasts noticeably longer than a slow one.
  const FRICTION = 550, MAX_SPIN = 0.02, STOP = 4e-5;   // rad/ms; STOP is about 2 degrees a second
  function coast(dt, now) {
    if (pointers > 0) return;
    if (Math.abs(spinX) < STOP && Math.abs(spinY) < STOP) { spinX = spinY = 0; return; }
    // No tilt limit: a vertical flick rolls over the top and keeps going.
    rotY += spinY * dt;
    rotX = (rotX + spinX * dt) % (Math.PI * 2);
    const k = Math.exp(-dt / FRICTION);
    spinX *= k; spinY *= k;
    lastTouch = now;                         // no idle auto-spin until the coast has died down
  }

  function bindInput() {
    document.getElementById("profile-close").addEventListener("click", hideCard);
    addEventListener("keydown", (e) => { if (e.key === "Escape") hideCard(); });
    const pts = new Map();
    let moved = 0, pinch = 0, lastTap = 0, lastMove = 0, pinched = false;
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      pointers = pts.size;
      spinX = spinY = 0;                     // touching the room catches it
      moved = 0; lastTouch = lastMove = performance.now();
      if (pts.size === 1) pinched = false;
    });
    canvas.addEventListener("pointermove", (e) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY }, now = performance.now();
      pts.set(e.pointerId, cur);
      lastTouch = now;
      if (pts.size === 1) {
        // Upside down (rolled past the top), a sideways drag must turn the other way to follow the finger.
        const flip = Math.cos(rotX) < 0 ? -1 : 1;
        const dy = (cur.x - prev.x) * 0.006 * flip, dx = (cur.y - prev.y) * 0.006, dt = Math.max(8, now - lastMove);
        rotY += dy;
        rotX = (rotX + dx) % (Math.PI * 2);
        // Smoothed velocity over the last few moves, so one jittery event doesn't decide the flick.
        spinY = spinY * 0.5 + (dy / dt) * 0.5;
        spinX = spinX * 0.5 + (dx / dt) * 0.5;
        lastMove = now;
        moved += Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) setZoom(zoom * (d / pinch));
        pinch = d; moved = 99; pinched = true;
      }
    });
    const up = (e) => {
      const was = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      pointers = pts.size;
      if (pts.size < 2) pinch = 0;
      if (pts.size === 0) {
        // Finger rested before lifting, or this was a pinch: no throw.
        if (pinched || performance.now() - lastMove > 70) spinX = spinY = 0;
        spinX = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, spinX));
        spinY = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, spinY));
      }
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
      setZoom(zoom * Math.exp(-e.deltaY * 0.001));
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
    if (best !== null) { focusPerson(best); return; }
    // No person under the finger: a table bubble opens that table's hub. Nearest bubble wins.
    let table = null, tableD = Infinity;
    for (const [gid, c] of lastCenters) {
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < c.r * c.s && d < tableD) { table = gid; tableD = d; }
    }
    if (table !== null) { focusTable(table); return; }
    hideCard();
  }
  // Fly to the person: the camera orbits them and zooms until their picture shows.
  function focusPerson(id) {
    const { S } = scene();
    if (!S.people.has(id)) return;
    picked = id; pickedUntil = Infinity;
    focusId = id; focusGroup = null; zoomGoal = Math.max(zoom, 3);
    showProfile(S.people.get(id));
  }
  function focusTable(gid) {
    picked = null; focusId = null; focusGroup = gid; zoomGoal = Math.max(zoom, 1.9);
    onGroup(gid);
  }
  function hideCard() {
    document.getElementById("profile").hidden = true;
    picked = null; focusId = null; focusGroup = null; zoomGoal = Math.min(zoomGoal, 1);
  }

  // ------------------------------------------------------------ mock profile

  // The wall's data has no bios, so everything not in /api/graph is made up from the name (stable per person).
  const SKILLS = ["hardware", "firmware", "frontend", "backend", "design", "ml", "data", "mobile", "pitch", "research"];
  const MAJORS = ["Computer Engineering", "Computer Science", "Data Science", "Mechanical Engineering", "Design",
                  "Business Analytics", "Biomedical Engineering", "Economics", "Physics", "Urban Studies"];
  const BIOS = ["Here to build something people use by Sunday.", "First hackathon, looking for a team that ships.",
                "Likes soldering more than slides.", "Will trade debugging for snacks.",
                "Wants to try hardware this time.", "Making Boston's commute less painful."];
  function seedOf(person) {
    let h = 2166136261;
    for (const ch of `${person.id}:${person.name}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296);
  }
  function mock(person) {
    const r = seedOf(person), pickN = (xs, n) => [...xs].sort(() => r() - 0.5).slice(0, n);
    const skills = person.skills?.length ? person.skills : pickN(SKILLS, 1 + Math.floor(r() * 3));
    return {
      skills,
      looking: person.looking_for?.length ? person.looking_for : pickN(SKILLS.filter((s) => !skills.includes(s)), 2),
      major: MAJORS[Math.floor(r() * MAJORS.length)],
      year: 2026 + Math.floor(r() * 4),
      bio: BIOS[Math.floor(r() * BIOS.length)],
      // everyone shows LinkedIn and GitHub; Instagram and a website only for some, so profiles differ
      socials: ["linkedin", "github", ...(r() < 0.5 ? ["instagram"] : []), ...(r() < 0.6 ? ["web"] : [])],
      // a profile filled in on the sign-in page overrides the made-up parts
      ...(person.major ? { major: person.major } : {}),
      ...(person.year ? { year: person.year } : {}),
      ...(person.bio ? { bio: person.bio } : {}),
      school: person.school || "",
      ...(person.socials ? { socials: person.socials } : {}),
    };
  }

  // Mock social buttons. They go nowhere on purpose: made-up handles could belong to real people.
  const SOCIAL = {
    linkedin: { label: "LinkedIn", bg: "#0A66C2", svg:
      '<circle cx="7" cy="6.6" r="1.7" fill="#fff"/><rect x="5.5" y="9.2" width="3" height="9.3" fill="#fff"/>' +
      '<path fill="#fff" d="M10.6 9.2h2.8v1.3c.4-.8 1.4-1.5 2.9-1.5 3 0 3.5 2 3.5 4.5v5h-2.9v-4.4c0-1.1 0-2.4-1.5-2.4s-1.8 1.2-1.8 2.4v4.4h-3z"/>' },
    github: { label: "GitHub", bg: "#24292f", svg:
      '<g transform="translate(4 4)"><path fill="#fff" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></g>' },
    instagram: { label: "Instagram", bg: "linear-gradient(45deg,#f9a03f,#e1306c 50%,#833ab4)", svg:
      '<rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="#fff" stroke-width="1.8"/>' +
      '<circle cx="12" cy="12" r="3.3" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="16.3" cy="7.7" r="1" fill="#fff"/>' },
    web: { label: "Website", bg: "#3a3a3a", svg:
      '<circle cx="12" cy="12" r="7" fill="none" stroke="#fff" stroke-width="1.6"/>' +
      '<ellipse cx="12" cy="12" rx="3" ry="7" fill="none" stroke="#fff" stroke-width="1.6"/>' +
      '<path d="M5 12h14" stroke="#fff" stroke-width="1.6"/>' },
  };
  function socials(keys) {
    const row = document.createElement("div");
    row.className = "p-socials";
    for (const k of keys) {
      const s = SOCIAL[k], b = document.createElement("button");
      b.type = "button";
      b.className = "p-social";
      b.title = `${s.label} (mock)`;
      b.setAttribute("aria-label", `${s.label} (mock link)`);
      b.style.background = s.bg;
      b.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${s.svg}</svg>`;  // static icon markup only
      row.append(b);
    }
    return row;
  }

  // Builds the profile's content; used by the corner card (someone you tapped) and by the You tab.
  function buildProfile(person) {
    const { S, needLine } = scene();
    const m = mock(person), g = S.groups.get(person.group_id);
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    const chips = (xs, cls) => { const d = el("div", "p-chips"); for (const x of xs) d.append(el("span", cls, x)); return d; };
    const known = [];
    for (const l of S.links.values()) {
      const other = l.a === person.id ? l.b : l.b === person.id ? l.a : null;
      if (other !== null && S.people.has(other)) known.push(S.people.get(other));
    }
    const here = known.filter((p) => p.here);

    const head = el("div", "p-head");
    const img = el("img", "p-pic");
    img.src = avatar(person).toDataURL();
    img.alt = "";
    const who = el("div");
    who.append(el("h2", "", person.name));
    const tags = el("div", "p-tags");
    tags.append(el("span", `p-role ${person.role}`, person.role));
    tags.append(el("span", `p-state${person.here ? " here" : ""}`, person.focus ? "focus mode" : person.here ? "here now" : "away"));
    who.append(tags, el("p", "p-sub", `${m.school ? m.school + " · " : ""}${m.major} · '${String(m.year).slice(2)}`));
    head.append(img, who);

    const table = el("section", "p-sec");
    table.append(el("h3", "", "Table"));
    if (g) {
      table.append(el("p", "p-strong", `${g.name}${g.working_on ? ` · ${g.working_on}` : ""}`));
      const need = needLine(g);
      if (need) table.append(el("p", "p-need", need));
    } else {
      table.append(el("p", "p-muted", person.here ? "Just arrived, not at a table yet" : "Not here right now"));
    }

    const stats = el("div", "p-stats");
    for (const [n, label] of [[person.points || 0, "points"], [known.length, "connections"], [here.length, "know here"]]) {
      const s = el("div");
      s.append(el("b", "", String(n)), el("span", "", label));
      stats.append(s);
    }

    const skills = el("section", "p-sec");
    skills.append(el("h3", "", "Skills"), chips(m.skills, "p-chip"));
    const looking = el("section", "p-sec");
    looking.append(el("h3", "", "Looking for"), chips(m.looking, "p-chip want"));
    const knows = el("section", "p-sec");
    knows.append(el("h3", "", "Knows"));
    knows.append(known.length ? chips(known.slice(0, 6).map((p) => p.name), "p-chip person")
                              : el("p", "p-muted", "No connections yet"));

    return [head, el("p", "p-bio", m.bio), socials(m.socials), stats, table, skills, looking, knows,
            el("p", "p-foot", "Mock profile · skills, major, bio and links are sample data")];
  }
  function showProfile(person) {
    document.getElementById("profile-body").replaceChildren(...buildProfile(person));
    document.getElementById("profile").classList.remove("hub");
    document.getElementById("profile").hidden = false;
  }

  // Viewer settings from the corner tab.
  const opts = { names: true, spin: true };
  const setOption = (k, v) => { opts[k] = v; };

  return { init, setActive, relayout, pulse, avatar, buildProfile, setOption, focusPerson,
           onTable: (fn) => { onGroup = fn; }, socialIcon: (k) => SOCIAL[k], PHONE };
})();
