// The join transition: after the badge is linked, a full-screen pixel scene plays for about 1.6 s (the route 57 bus rushes through,
// the Wi-Fi arcs ping, "Got it, <name>"), then the promise resolves and the caller goes to the client page.
//   <script src="/landing/transition.js"></script>
//   await TapTransition.play({ name: "Maya" });  location.replace("me.html?id=...");
// Standalone: no dependencies, draws in code, injects its own overlay. Honors prefers-reduced-motion (a plain 0.6 s fade).
const TapTransition = (() => {
  const W = 320, H = 180;
  const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const clamp = (x) => Math.min(1, Math.max(0, x));
  function play({ name = "", ms = 1600 } = {}) {
    return new Promise((done) => {
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const el = document.createElement("div");
      el.setAttribute("role", "status");
      el.style.cssText = "position:fixed;inset:0;z-index:99999;background:#ecd9d2;opacity:0;transition:opacity .25s ease;display:grid;place-items:center;overflow:hidden";
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges";
      const msg = document.createElement("p");
      msg.textContent = name ? "Got it, " + name : "Got it";
      msg.style.cssText = "position:relative;margin:0;font:800 clamp(34px,8vw,72px)/1 'Bricolage Grotesque','Helvetica Neue',sans-serif;letter-spacing:-.03em;color:#2b1f23;opacity:0;transform:translateY(12px);transition:opacity .3s ease,transform .3s ease";
      el.append(cv, msg); document.body.append(el);
      requestAnimationFrame(() => { el.style.opacity = "1"; });
      if (reduce) { msg.style.opacity = "1"; msg.style.transform = "none"; return setTimeout(() => { el.remove(); done(); }, 600); }
      const g = cv.getContext("2d");
      const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
      const t0 = performance.now();
      const frame = (now) => {
        const t = (now - t0) / ms, T = clamp(t);
        g.imageSmoothingEnabled = false; g.clearRect(0, 0, W, H);
        for (let i = 0; i < 9; i++) rect(0, i * 20, W, 20, ["#f3e4dc", "#f1e0d8", "#efdcd3", "#edd9d0", "#ecd6cc", "#ead2c8", "#e8cfc4", "#e6cbc0", "#e4c8bc"][i]);
        const y = 126;
        rect(0, y + 28, W, 1, "#8a7a7e"); rect(0, y + 29, W, 12, "#2b1f23");                                          // curb and road
        for (let i = -1; i < 18; i++) rect(((i * 22 - T * 300) % 352 + 352) % 352 - 10, y + 35, 12, 1, "#e9c46a");     // lane dashes streak past
        // the bus crosses from the left to past the right edge
        const x = -150 + ease(T) * (W + 200);
        rect(x, y, 146, 24, "#f7f5f0"); rect(x, y, 146, 2, "#ffffff"); rect(x + 146, y + 3, 4, 20, "#e4e1da");
        rect(x, y + 16, 150, 3, "#ffc72c"); rect(x, y + 19, 150, 4, "#1c3f94");
        for (let i = 0; i < 6; i++) rect(x + 8 + i * 17, y + 4, 13, 9, "#2b3a55");
        rect(x + 128, y + 1, 18, 7, "#111111"); rect(x + 132, y + 3, 10, 3, "#ffb000");                              // route sign
        rect(x + 130, y + 8, 16, 8, "#2b3a55"); rect(x + 146, y + 17, 4, 3, "#ffe9a8");
        for (const wx of [20, 116]) { rect(x + wx - 1, y + 20, 18, 9, "#1b1b1b"); rect(x + wx + 5, y + 23, 6, 3, "#9a8f92"); }   // wheels
        for (let i = 0; i < 9; i++) rect(x - 14 - i * 10 - (now / 14) % 10, y + 6 + (i % 4) * 5, 7 - i * 0.6, 1, "#fff");   // speed streaks
        // the Wi-Fi arcs ping in the middle once the bus has gone by
        const k = clamp((T - 0.45) / 0.4);
        if (k > 0) for (let i = 1; i <= 3; i++) { g.strokeStyle = "rgba(212,21,27," + (1 - k) * (1 - i * 0.18) + ")"; g.lineWidth = 2; g.beginPath(); g.arc(W / 2, 74, 6 + i * 9 + k * 14, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
        if (T > 0.3) { msg.style.opacity = "1"; msg.style.transform = "none"; }
        if (t < 1) requestAnimationFrame(frame); else { el.style.opacity = "0"; setTimeout(() => { el.remove(); done(); }, 260); }
      };
      requestAnimationFrame(frame);
    });
  }
  return { play };
})();
