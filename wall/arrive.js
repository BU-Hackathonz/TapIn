// Arriving from the join page's loading screen: a pixel train races in along a track at the bottom of the wall, brakes
// to a stop in the middle, your "You" node steps out and is pulled along a curve into your seat on the map, then the
// train pulls away. Runs once (sessionStorage "tapin.arrive"); reduced motion or no train sprite just shows the map.
(() => {
  let arrive = false;
  try { arrive = !!sessionStorage.getItem("tapin.arrive"); sessionStorage.removeItem("tapin.arrive"); } catch { /* private mode */ }
  if (!arrive) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || typeof PixelBoston === "undefined" || !PixelBoston.train || typeof View3D === "undefined") return;

  View3D.setOption("hideMe", true);
  const sprite = PixelBoston.train(), PX = 3;                       // the sprite scaled up 3x with hard pixels
  const cv = document.createElement("canvas");
  cv.className = "arrive";
  cv.setAttribute("aria-hidden", "true");
  document.body.append(cv);
  const g = cv.getContext("2d");
  const map = document.getElementById("map3d");
  let W = 0, H = 0, dpr = 1;
  const size = () => {
    const r = map.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1); W = r.width; H = innerHeight;
    cv.style.width = W + "px"; cv.style.height = H + "px"; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  };
  size(); addEventListener("resize", size);

  const bar = document.querySelector(".plan-bar");
  const barH = bar && getComputedStyle(bar).display !== "none" ? bar.getBoundingClientRect().height : 0;
  const tw = sprite.width * PX, th = sprite.height * PX;
  const railY = () => H - barH - 18;                                 // the rail sits just above the bottom bar
  const stopX = () => W / 2 - tw / 2;
  const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const me = (typeof Corner !== "undefined" && Corner.me) ? Corner.me() : null;
  const face = me ? View3D.avatar(me) : null;

  // timeline (ms): race in and brake, pause, You steps out and flies to the map, pause, train pulls away
  const T_IN = 1300, T_OUT = 450, T_FLY = 1100, T_GO = 900, t0 = performance.now();
  const t1 = T_IN, t2 = t1 + T_OUT, t3 = t2 + T_FLY, t4 = t3 + 250, t5 = t4 + T_GO;

  function track() {
    const y = railY();
    g.fillStyle = "#5d5f66"; g.fillRect(0, y + 3, W, 6);
    g.fillStyle = "#7a5a45"; for (let x = 0; x < W; x += 14) g.fillRect(x, y + 1, 7, 4);
    g.fillStyle = "#c9ccd3"; g.fillRect(0, y, W, 2);
  }
  function youAt(x, y, r) {
    g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
    if (face) g.drawImage(face, x - r, y - r, r * 2, r * 2); else { g.fillStyle = "#f6ece8"; g.fill(); }
    g.restore();
    g.beginPath(); g.arc(x, y, r + 2, 0, Math.PI * 2); g.strokeStyle = "#d4151b"; g.lineWidth = 3; g.stroke();
  }

  function frame(now) {
    const t = now - t0;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); g.imageSmoothingEnabled = false;
    track();
    // the train: from off the left edge to the middle with braking, then away to the right
    let x;
    if (t < t1) x = -tw - 40 + (stopX() + tw + 40) * ease(t / T_IN);
    else if (t < t4) x = stopX();
    else x = stopX() + (W - stopX() + 40) * Math.pow((t - t4) / T_GO, 2);
    const y = railY() - th + 3 * PX;
    if (t < t1 && t > T_IN * 0.55) { g.globalAlpha = 0.35; for (let k = 1; k <= 3; k++) g.drawImage(sprite, x - k * 18, y, tw, th); g.globalAlpha = 1; }  // speed lines while braking
    g.drawImage(sprite, Math.round(x), Math.round(y), tw, th);

    // You: steps out of the door, then is pulled along a curve into your seat on the map
    const seat = View3D.mePoint();
    const door = { x: stopX() + tw * 0.32, y: y + th * 0.45 };
    if (t >= t1 && t < t3 && seat) {
      const out = Math.min(1, (t - t1) / T_OUT), fly = Math.max(0, (t - t2) / T_FLY);
      const r0 = 14, r1 = seat.r, k = inOut(fly);
      const sx = door.x, sy = door.y - 26 * ease(out);                // hop out and up
      const cx = (sx + seat.x) / 2 + (seat.x > sx ? -60 : 60), cy = Math.min(sy, seat.y) - 120;   // a curved pull
      const px = (1 - k) * (1 - k) * sx + 2 * (1 - k) * k * cx + k * k * seat.x;
      const py = (1 - k) * (1 - k) * sy + 2 * (1 - k) * k * cy + k * k * seat.y;
      if (fly > 0) {                                                 // the "drag" line behind it
        g.setLineDash([6, 6]); g.strokeStyle = "rgba(212,21,27,0.5)"; g.lineWidth = 2;
        g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(cx, cy, px, py); g.stroke(); g.setLineDash([]);
      }
      youAt(px, py, r0 + (r1 - r0) * k * (out >= 1 ? 1 : 0));
    }
    if (t >= t3 && View3D.option("hideMe")) View3D.setOption("hideMe", false);   // You lands: the map draws it from here
    if (t < t5) requestAnimationFrame(frame);
    else { View3D.setOption("hideMe", false); cv.remove(); }
  }
  // give the map a moment to lay out first
  setTimeout(() => requestAnimationFrame(frame), 350);
})();
