// ?look=host on the sign-in page: the same steps dressed as David's host screen (wall/host.html, its default red look).
// The room plan on the left is a small sample room drawn here (no server data): dashed tables, people as dots, lines for
// people who have met, and you in red walking in from the door. Behind it the pixel smoke, in front the scanlines.
// A dark strip along the bottom tells the latest moment, like the host screen. Mockup only: everything is sample data.
const HostLook = (() => {
  const C = {
    ink: "#2b1f23", names: "#3a2b2b", muted: "#7a6066", red: "#d4151b", green: "#2f6d4e", deep: "#1b4a33", line: "#d4bab2",
  };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // a sample room in plan units (0..1 across the plan box)
  const TABLES = [
    { x: 0.30, y: 0.36, label: "T1 · robotics", people: ["Maya", "Theo", "Ana", "Sam"] },
    { x: 0.66, y: 0.30, label: "T2 · health app", people: ["Priya", "Leo", "Jo"] },
    { x: 0.44, y: 0.72, label: "T3 · climate data", people: ["Kai", "Rosa", "Ben"] },
    { x: 0.80, y: 0.66, label: "T4 · game jam", people: ["Ivy", "Omar"], mentor: 1 },
  ];
  const SOLO = [{ x: 0.12, y: 0.55, n: "Eli" }, { x: 0.58, y: 0.50, n: "Nia" }, { x: 0.90, y: 0.40, n: "Max" }];
  const MET = [["Maya", "Priya"], ["Theo", "Kai"], ["Leo", "Ivy"], ["Rosa", "Nia"], ["Sam", "Eli"]];
  const DOOR = { x: 0.05, y: 0.94 };
  const GOAL = 3;                                  // you head for the table that needs you (T4 has room)

  const MOMENTS = [
    ["<b>Maya</b> tapped in", "<span>at the entrance</span>"],
    ["<b>T4 · game jam</b> needs a designer", "<span>2 of 4 seats taken</span>"],
    ["<b>Theo</b> and <b>Kai</b> met", "<span>at T3</span>"],
    ["<b>A mentor</b> is free", "<span>at T4</span>"],
    ["<b>You</b> could join T4", "<span>they need what you bring</span>"],
  ];

  let plan, pctx, fume, fctx, W = 0, H = 0, dpr = 1, t0 = performance.now();

  function el(tag, attrs = {}, html = "") {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (html) e.innerHTML = html;      // only fixed markup from this file
    return e;
  }

  const WORDMARK = `<span class="hl-wm" role="img" aria-label="Tap In">tap <span class="hl-ii">&#305;<svg class="hl-wifi" viewBox="0 0 24 20" aria-hidden="true"><circle cx="12" cy="16.6" r="2.3"/><path d="M6.6 11.6a7.6 7.6 0 0 1 10.8 0"/><path d="M2.9 7.4a12.8 12.8 0 0 1 18.2 0"/></svg></span>n</span>`;

  function apply() {
    document.documentElement.dataset.look = "host";
    document.body.className = document.body.className.replace(/\blayout-\d\b/g, "").trim() + " look-host";
    document.getElementById("brand").innerHTML = WORDMARK;

    const panel = document.querySelector(".art-panel");
    panel.replaceChildren();
    fume = el("canvas", { class: "hl-fume", "aria-hidden": "true" });
    plan = el("canvas", { class: "hl-plan", role: "img", "aria-label": "Sample room plan: tables, people, and you walking in" });
    const legend = el("header", { class: "hl-legend" }, `<p class="hl-lede">Tonight's room: who is here, and who is working together</p>
      <ul><li><i class="k dot"></i>person</li><li><i class="k sq"></i>mentor</li><li><i class="k dash"></i>a table</li><li><i class="k line"></i>have met</li><li><i class="k red"></i>you</li></ul>`);
    panel.append(fume, plan, legend);

    const strip = el("footer", { class: "hl-strip", "aria-live": "polite" }, `<time></time><p></p><span class="hl-tag">PROTOTYPE · SAMPLE DATA</span>`);
    document.querySelector(".stage").append(strip);

    pctx = plan.getContext("2d");
    fctx = fume.getContext("2d");
    fume.width = 96; fume.height = 60;
    addEventListener("resize", size);
    size();
    moment(0);
    if (!reduce) {
      let i = 0;
      setInterval(() => moment(++i), 4500);
      requestAnimationFrame(loop);
    } else { draw(performance.now() + 7000); drawFume(0); }
  }

  function moment(i) {
    const [a, b] = MOMENTS[i % MOMENTS.length];
    const d = new Date(), strip = document.querySelector(".hl-strip");
    strip.querySelector("time").textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    strip.querySelector("p").innerHTML = `${a} ${b}`;   // fixed sample strings from this file
  }

  function size() {
    dpr = Math.min(2, devicePixelRatio || 1);
    const r = plan.getBoundingClientRect();
    W = r.width; H = r.height;
    plan.width = Math.round(W * dpr); plan.height = Math.round(H * dpr);
    if (reduce) draw(performance.now() + 7000);
  }

  // where everyone sits, in pixels
  function layout() {
    const m = Math.min(W, H), R = Math.max(34, m * 0.11);
    const padX = W * 0.06, padT = H * 0.2, padB = H * 0.08;
    const P = (x, y) => ({ x: padX + x * (W - 2 * padX), y: padT + y * (H - padT - padB) });
    const people = new Map(), tables = [];
    TABLES.forEach((t, i) => {
      const c = P(t.x, t.y);
      tables.push({ ...c, r: R, label: t.label });
      const n = t.people.length + (i === GOAL ? 1 : 0);
      t.people.forEach((name, k) => {
        const a = -Math.PI / 2 + (k / n) * Math.PI * 2 + i;
        people.set(name, { x: c.x + Math.cos(a) * R, y: c.y + Math.sin(a) * R, mentor: t.mentor === k, ax: Math.cos(a), ay: Math.sin(a) });
      });
      if (i === GOAL) { const a = -Math.PI / 2 + ((n - 1) / n) * Math.PI * 2 + i; tables[i].seat = { x: c.x + Math.cos(a) * R, y: c.y + Math.sin(a) * R }; }
    });
    SOLO.forEach((s) => people.set(s.n, { ...P(s.x, s.y), solo: true }));
    return { tables, people, door: P(DOOR.x, DOOR.y), R };
  }

  const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

  function draw(now) {
    if (!W || !H) return;
    const g = pctx, L = layout(), t = (now - t0) / 1000;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const fs = Math.max(11, Math.min(15, W / 70));

    // tables: dashed rings and a mono label
    g.lineWidth = 2.5; g.strokeStyle = C.deep; g.setLineDash([7, 6]);
    for (const tb of L.tables) { g.beginPath(); g.arc(tb.x, tb.y, tb.r, 0, Math.PI * 2); g.stroke(); }
    g.setLineDash([]);
    g.font = `500 ${fs * 0.85}px "IBM Plex Mono", monospace`; g.fillStyle = C.muted; g.textAlign = "center";
    for (const tb of L.tables) g.fillText(tb.label, tb.x, tb.y + 4);

    // have met: solid lines between people
    g.lineWidth = 1.6; g.strokeStyle = C.deep; g.globalAlpha = 0.55;
    for (const [a, b] of MET) { const p = L.people.get(a), q = L.people.get(b); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke(); }
    g.globalAlpha = 1;

    // people
    const dot = Math.max(5, Math.min(8, W / 120));
    g.font = `500 ${fs}px "IBM Plex Sans", sans-serif`;
    for (const [name, p] of L.people) {
      if (p.mentor) { g.lineWidth = 2.4; g.strokeStyle = C.green; g.strokeRect(p.x - dot, p.y - dot, dot * 2, dot * 2); }
      else { g.fillStyle = C.green; g.beginPath(); g.arc(p.x, p.y, dot, 0, Math.PI * 2); g.fill(); }
      // names sit outside their table (away from its label); people on their own get the name below
      const ax = p.solo ? 0 : p.ax, ay = p.solo ? 1 : p.ay;
      g.fillStyle = C.names; g.textAlign = Math.abs(ax) < 0.35 ? "center" : ax > 0 ? "left" : "right";
      g.fillText(name, p.x + ax * (dot + 5), p.y + ay * (dot + 5) + (ay > 0.35 ? fs * 0.8 : ay < -0.35 ? -2 : fs * 0.35));
    }

    // you: walk in from the door to the free seat at T4, a line to the person you meet, then start over (12 s loop)
    const cyc = reduce ? 9 : t % 12, seat = L.tables[GOAL].seat;
    const k = ease((cyc - 1) / 5);
    const you = { x: L.door.x + (seat.x - L.door.x) * k, y: L.door.y + (seat.y - L.door.y) * k + Math.sin(k * Math.PI) * -30 };
    if (cyc > 6.4) {
      const omar = L.people.get("Omar"), a = Math.min(1, (cyc - 6.4) / 0.8);
      g.strokeStyle = C.red; g.lineWidth = 2; g.beginPath(); g.moveTo(you.x, you.y);
      g.lineTo(you.x + (omar.x - you.x) * a, you.y + (omar.y - you.y) * a); g.stroke();
    }
    const fade = cyc > 11.2 ? 1 - (cyc - 11.2) / 0.8 : cyc < 0.6 ? cyc / 0.6 : 1;
    g.globalAlpha = Math.max(0, fade);
    const pulse = (t * 1.1) % 1;
    g.strokeStyle = C.red; g.lineWidth = 2; g.globalAlpha = Math.max(0, fade) * (1 - pulse);
    g.beginPath(); g.arc(you.x, you.y, dot + pulse * 16, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = Math.max(0, fade);
    g.fillStyle = C.red; g.beginPath(); g.arc(you.x, you.y, dot + 1.5, 0, Math.PI * 2); g.fill();
    g.font = `600 ${fs}px "IBM Plex Sans", sans-serif`; g.textAlign = "center"; g.fillText("you", you.x, you.y - dot - 8);
    g.globalAlpha = 1;

    // the door, bottom left
    g.font = `500 ${fs * 0.8}px "IBM Plex Mono", monospace`; g.fillStyle = C.muted; g.textAlign = "left";
    g.fillText("ENTRANCE", L.door.x - 4, L.door.y + fs * 0.4 + 14);
  }

  // the pixel smoke: low-res value noise, posterised through a 4x4 ordered dither, stepping ~10 times a second
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  function drawFume(now) {
    const w = fume.width, h = fume.height, img = fctx.createImageData(w, h), s = now / 1000;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = (Math.sin(x * 0.07 + s * 0.35) + Math.sin(y * 0.11 - s * 0.22) + Math.sin((x + y) * 0.045 + s * 0.28) + Math.sin(Math.hypot(x - w * 0.7, y - h * 0.3) * 0.09 - s * 0.4)) / 4;
      const lv = Math.floor(((v + 1) / 2) * 3 + BAYER[(y % 4) * 4 + (x % 4)] - 0.5);   // 0..2
      const i = (y * w + x) * 4;
      img.data[i] = 212; img.data[i + 1] = 21; img.data[i + 2] = 27; img.data[i + 3] = lv <= 0 ? 0 : lv === 1 ? 10 : 22;
    }
    fctx.putImageData(img, 0, 0);
  }

  let lastFume = 0;
  function loop(now) {
    draw(now);
    if (now - lastFume > 100) { lastFume = now; drawFume(now); }
    requestAnimationFrame(loop);
  }

  return { apply };
})();
