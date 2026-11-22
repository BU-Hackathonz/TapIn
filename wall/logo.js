// The "tap in" wordmark, wherever it appears:
// 1) the Wi-Fi mark is centred on the i's stem. The stem in this font sits a little right of the letter box's middle, so
//    we measure the ink and nudge the mark onto it (any size, any font).
// 2) On start-up the main logo pops in like a cartoon: it springs up with a squash and stretch, action lines burst out,
//    and the Wi-Fi arcs pop on one by one. Once per visit (sessionStorage "tapin.logopop"); reduced motion skips it.
(() => {
  function centre() {
    for (const ii of document.querySelectorAll(".ii")) {
      const svg = ii.querySelector("svg"), text = [...ii.childNodes].find((n) => n.nodeType === 3);
      if (!svg || !text || !ii.offsetParent) continue;
      const cs = getComputedStyle(ii), fs = parseFloat(cs.fontSize);
      const c = document.createElement("canvas"); c.width = Math.ceil(fs * 2); c.height = Math.ceil(fs * 2);
      const g = c.getContext("2d"); g.font = `${cs.fontStyle} ${cs.fontWeight} ${fs}px ${cs.fontFamily}`; g.fillText(text.data.trim() || "ı", 0, fs * 1.5);
      const d = g.getImageData(0, 0, c.width, c.height).data; let mn = Infinity, mx = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 128) { if (x < mn) mn = x; if (x > mx) mx = x; }
      if (mx < 0) continue;
      const r = document.createRange(); r.selectNodeContents(text);
      const box = r.getBoundingClientRect(), ink = box.left + (mn + mx) / 2;
      svg.style.marginLeft = "0px";
      const s = svg.getBoundingClientRect(), now = s.left + s.width / 2;
      svg.style.marginLeft = (ink - now).toFixed(2) + "px";
    }
  }
  const run = () => requestAnimationFrame(centre);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(run); else run();
  addEventListener("load", run); addEventListener("resize", () => setTimeout(run, 80));

  // ---- the pop-up
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let seen = false;
  try { seen = sessionStorage.getItem("tapin.logopop") === "1"; } catch { /* private mode */ }
  if (reduce || seen) return;
  const css = document.createElement("style");
  css.textContent = `
  .lp-pop { animation: lp-pop .9s cubic-bezier(.2,.9,.25,1.25) both; transform-origin: 50% 85%; }
  @keyframes lp-pop { 0% { transform: scale(0) rotate(-10deg); opacity: 0; } 45% { transform: scale(1.22, .82) rotate(3deg); opacity: 1; }
    65% { transform: scale(.9, 1.12) rotate(-2deg); } 82% { transform: scale(1.05, .96); } 100% { transform: none; } }
  .lp-pop .wifi > * { opacity: 0; animation: lp-arc .28s steps(3) forwards; }
  .lp-pop .wifi > :nth-child(1) { animation-delay: .55s; } .lp-pop .wifi > :nth-child(2) { animation-delay: .72s; } .lp-pop .wifi > :nth-child(3) { animation-delay: .89s; }
  @keyframes lp-arc { 0% { opacity: 0; transform: scale(.4); transform-origin: 50% 85%; } 100% { opacity: 1; transform: none; } }
  .lp-burst { position: fixed; z-index: 40; pointer-events: none; width: 0; height: 0; }
  .lp-burst i { position: absolute; left: 0; top: 0; width: var(--len); height: var(--w); background: var(--c); border-radius: 2px;
    transform-origin: 0 50%; transform: rotate(var(--a)) translateX(var(--r0)) scaleX(.2); opacity: 0; animation: lp-line .55s cubic-bezier(.2,.8,.3,1) forwards; animation-delay: var(--d); }
  @keyframes lp-line { 0% { opacity: 1; transform: rotate(var(--a)) translateX(var(--r0)) scaleX(.2); }
    60% { opacity: 1; transform: rotate(var(--a)) translateX(var(--r1)) scaleX(1); }
    100% { opacity: 0; transform: rotate(var(--a)) translateX(var(--r2)) scaleX(.3); } }
  .lp-burst b { position: absolute; left: 0; top: 0; width: 10px; height: 10px; background: var(--c); opacity: 0; transform: rotate(var(--a)) translateX(var(--r1));
    animation: lp-star .5s steps(4) forwards; animation-delay: var(--d); clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%); }
  @keyframes lp-star { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 0; transform: rotate(var(--a)) translateX(var(--r2)) scale(.4); } }`;
  document.head.append(css);

  function pop(wm) {
    try { sessionStorage.setItem("tapin.logopop", "1"); } catch { /* private mode */ }
    wm.classList.remove("lp-pop"); void wm.offsetWidth; wm.classList.add("lp-pop");
    setTimeout(() => {
      const rg = document.createRange(); rg.selectNodeContents(wm);   // the word itself (the logo element can be a full-width block)
      const r = rg.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * 0.55, size = Math.max(r.width, r.height);
      const burst = document.createElement("div"); burst.className = "lp-burst"; burst.style.left = cx + "px"; burst.style.top = cy + "px";
      const N = 16, colors = ["#111", "#DA291C", "#111", "#ED8B00", "#111", "#003DA5", "#111", "#00843D"];
      for (let k = 0; k < N; k++) {
        const a = (k / N) * 360 + (k % 2 ? 6 : -6), line = document.createElement("i");
        const rx = size * 0.5, ry = r.height * 0.55;                 // lines start just outside the logo's edge
        const rad = (a * Math.PI) / 180, edge = Math.min(Math.abs(rx / (Math.cos(rad) || 1e-6)), Math.abs(ry / (Math.sin(rad) || 1e-6)));
        line.style.cssText = `--a:${a}deg;--r0:${edge * 0.9}px;--r1:${edge + size * 0.06}px;--r2:${edge + size * 0.12}px;--len:${size * (k % 2 ? 0.07 : 0.11)}px;--w:${Math.max(3, size * 0.012)}px;--c:${colors[k % colors.length]};--d:${(k % 3) * 0.03}s`;
        burst.append(line);
        if (k % 4 === 2) { const st = document.createElement("b"); st.style.cssText = `--a:${a + 11}deg;--r1:${edge + size * 0.1}px;--r2:${edge + size * 0.2}px;--c:${colors[(k + 3) % colors.length]};--d:.12s`; burst.append(st); }
      }
      document.body.append(burst);
      setTimeout(() => burst.remove(), 1200);
    }, 330);                                                         // the burst fires as the logo hits full size
  }
  // the main logo: the biggest visible wordmark, once it is on screen (the landing page reveals it after its opening scene)
  function main() {
    const all = [...document.querySelectorAll(".wm")].filter((e) => e.offsetParent && e.getBoundingClientRect().width > 40);
    return all.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
  }
  let tries = 0;
  const wait = setInterval(() => {
    const wm = main(), intro = document.getElementById("scene");
    const blocked = intro && !intro.classList.contains("gone") && getComputedStyle(intro).display !== "none" && intro.isConnected;
    if (wm && !blocked && (!document.body.classList.contains("leaving"))) {
      const r = wm.getBoundingClientRect();
      if (r.bottom > 0 && r.top < innerHeight) { clearInterval(wait); pop(wm); }
    }
    if (++tries > 200) clearInterval(wait);
  }, 100);
})();
