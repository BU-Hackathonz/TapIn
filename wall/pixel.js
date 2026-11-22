// From David's landing hero (PR #109): Jun's pixel Boston scene with the train in Green Line colours.
// The pixel front page: a small pixel-art Boston at dusk (Hancock and Prudential towers, the Custom House, brownstones,
// the Zakim bridge, the Charles) with an original pixel train running down Commonwealth Ave through BU. Drawn in code on a
// low-resolution canvas (180 px tall) and scaled up with hard pixels, stepping about 12 times a second.
// PixelBoston.mount(el) fills el with the scene. No images, no outside art.
const PixelBoston = (() => {
  const H = 180, TRACK = 128;                       // scene height in pixels, rail line
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const px = (g, x, y, c) => { g.fillStyle = c; g.fillRect(x | 0, y | 0, 1, 1); };
  const rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x | 0, y | 0, w | 0, h | 0); };
  function poly(g, pts, c) {                         // pixel-exact polygon fill (no anti-aliasing)
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    g.fillStyle = c;
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) g.fillRect(x, y, 1, 1);
      }
    }
  }
  function line(g, x0, y0, x1, y1, c) {              // Bresenham
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) { px(g, x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  // a dark one-pixel outline around everything drawn on a sprite canvas
  function outline(c, col) {
    const g = c.getContext("2d"), d = g.getImageData(0, 0, c.width, c.height), a = d.data, w = c.width, h = c.height;
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 0;
    const edge = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) edge.push([x, y]);
    }
    for (const [x, y] of edge) px(g, x, y, col);
  }

  // ---------------------------------------------------------------- the train (an original design, 3/4 view)
  function train() {
    const c = document.createElement("canvas"); c.width = 124; c.height = 34;
    const g = c.getContext("2d");
    const BODY = "#00843D", TOP = "#2fbf6a", SHADE = "#005c2a", STRIPE = "#f3e4dc", DOOR = "#006b30";   // Green Line (Jun's sprite is teal)
    const WIN = "#f2b33d", WIN_HI = "#ffe28f", WIN_LO = "#d9822b", UNDER = "#2a2f36";
    const car = (x0, x1, lead) => {
      poly(g, [[x0, 14], [x1, 14], [x1 + 4, 10], [x0 + 4, 10]], TOP);                         // roof
      if (lead) {
        poly(g, [[x0, 14], [x1 - 6, 14], [x1 + 3, 20], [x1 + 5, 27], [x0, 27]], BODY);        // side, sloping nose
        poly(g, [[x1 - 6, 14], [x1 + 4, 10], [x1 + 12, 17], [x1 + 3, 20]], "#a9e2e6");        // nose top
        poly(g, [[x1 + 3, 20], [x1 + 12, 17], [x1 + 14, 24], [x1 + 5, 27]], SHADE);           // nose front
        poly(g, [[x1 - 3, 14], [x1 + 3, 11], [x1 + 9, 16], [x1 + 3, 19]], WIN);               // windscreen
        line(g, x1 - 1, 15, x1 + 3, 13, WIN_HI); line(g, x1 + 2, 18, x1 + 7, 16, WIN_LO);
        rect(g, x1 + 10, 22, 2, 1, "#ffd36b"); rect(g, x1 + 6, 24, 2, 1, "#ffd36b");          // headlights
        px(g, x1 + 10, 22, "#ffffff");
      } else {
        rect(g, x0, 14, x1 - x0, 13, BODY);
      }
      rect(g, x0, 24, (lead ? x1 + 3 : x1) - x0, 2, STRIPE);                                  // the stripe
      for (let wx = x0 + 4; wx + 7 < (lead ? x1 - 7 : x1 - 2); wx += 11) {                     // windows
        rect(g, wx, 16, 8, 4, WIN);
        line(g, wx + 1, 19, wx + 4, 16, WIN_HI); px(g, wx + 7, 19, WIN_LO);
        rect(g, wx + 9, 15, 1, 9, DOOR);
      }
      rect(g, x0 + 3, 27, (lead ? x1 : x1 - 3) - x0 - 3, 3, UNDER);                           // underframe
      for (const wx of [x0 + 7, x0 + 15, (lead ? x1 : x1 - 4) - 14, (lead ? x1 : x1 - 4) - 6]) {
        rect(g, wx - 2, 29, 5, 3, "#1b1b1b"); px(g, wx, 30, "#6b6b6b");                        // wheels
      }
    };
    car(2, 50, false);
    rect(g, 50, 22, 4, 2, "#2a2f36");                                                          // coupler
    car(54, 104, true);
    outline(c, "#1d2a33");
    return c;
  }

  // ---------------------------------------------------------------- the city (drawn once per size)
  function city(W) {
    const sky = document.createElement("canvas"); sky.width = W; sky.height = H;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    let g = sky.getContext("2d");
    // sky: warm dusk bands, dithered between steps
    const SKY = ["#f4cfc4", "#f8dccd", "#fbe7d6", "#fdf1e2", "#fdf6ea"];
    for (let y = 0; y < 112; y++) for (let x = 0; x < W; x++) {
      const t = (y / 112) * (SKY.length - 1), i = Math.floor(t), f = t - i;
      px(g, x, y, f > BAYER[(y % 4) * 4 + (x % 4)] ? SKY[Math.min(i + 1, SKY.length - 1)] : SKY[i]);
    }
    // sun and clouds
    const sx = Math.round(W * 0.78), sy = 34;
    for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) if (x * x + y * y <= 81) px(g, sx + x, sy + y, x * x + y * y > 60 ? "#ffc58a" : "#ffd9a0");
    const cloud = (x, y, w) => { rect(g, x + 3, y, w - 6, 2, "#fffaf2"); rect(g, x, y + 2, w, 3, "#fffaf2"); rect(g, x + 2, y + 5, w - 4, 1, "#f3e2d3"); };
    cloud(W * 0.12, 22, 26); cloud(W * 0.42, 14, 34); cloud(W * 0.62, 40, 20); cloud(W * 0.9, 18, 22);

    g = c.getContext("2d");          // from here on: the city, which scrolls past behind the train
    // far skyline, a soft rose-grey, with a few landmark shapes
    const FAR = "#d2b2a9", FAR_D = "#c19f96", WIN_F = "#e8cfc7";
    let x = 0;
    const tower = (x0, w, h, col = FAR) => { rect(g, x0, 118 - h, w, h, col); for (let yy = 118 - h + 3; yy < 114; yy += 4) for (let xx = x0 + 2; xx < x0 + w - 1; xx += 3) px(g, xx, yy, WIN_F); };
    while (x < W) { const w = 8 + ((x * 7) % 9), h = 14 + ((x * 13) % 22); tower(x, w, h); x += w + 1; }
    // Hancock-style glass slab: tall, thin, blue, a lighter edge
    const hx = Math.round(W * 0.76);
    rect(g, hx, 46, 12, 72, "#8fb6dd"); rect(g, hx + 9, 46, 3, 72, "#b9d4ee"); poly(g, [[hx, 46], [hx + 12, 46], [hx + 12, 44], [hx + 3, 44]], "#b9d4ee");
    for (let yy = 50; yy < 116; yy += 3) line(g, hx + 1, yy, hx + 8, yy, "#7ea6cf");
    // Prudential-style tower with a crown and antenna
    const pr = Math.round(W * 0.69);
    rect(g, pr, 58, 14, 60, FAR_D); rect(g, pr + 2, 54, 10, 4, FAR_D); rect(g, pr + 6, 40, 2, 14, "#a98b83");
    for (let yy = 62; yy < 116; yy += 3) for (let xx = pr + 2; xx < pr + 13; xx += 2) px(g, xx, yy, ((xx + yy) % 5) ? WIN_F : "#ffe2a8");
    // Custom House-style clock tower
    const ch = Math.round(W * 0.62);
    rect(g, ch, 64, 10, 54, "#cfb3a4"); poly(g, [[ch - 1, 64], [ch + 11, 64], [ch + 5, 52]], "#b9978b"); rect(g, ch + 4, 46, 2, 7, "#a98b83");
    for (let yy = 66; yy < 70; yy++) for (let xx = ch + 3; xx < ch + 7; xx++) px(g, xx, yy, "#fff3d6");
    px(g, ch + 5, 67, "#6b4b3a"); px(g, ch + 5, 68, "#6b4b3a");

    // BU: the Center for Computing & Data Sciences, a stack of offset glass blocks
    const cd = Math.round(W * 0.1);
    [[0, 0, 22], [3, 12, 22], [-2, 24, 22], [4, 36, 22], [0, 48, 22], [2, 60, 20]].forEach(([dx, dy, w]) => {
      const y0 = 118 - 12 - dy;
      rect(g, cd + dx, y0, w, 12, "#9fc2c9"); rect(g, cd + dx, y0, w, 1, "#d7ecef"); rect(g, cd + dx + w - 3, y0 + 1, 3, 11, "#7fa6ae");
      for (let xx = cd + dx + 2; xx < cd + dx + w - 3; xx += 3) rect(g, xx, y0 + 3, 1, 7, "#c4e0e4");
    });
    // BU: Warren Towers, three tall slabs on a podium
    const wt = Math.round(W * 0.19);
    rect(g, wt, 96, 40, 22, "#c9a99f");
    for (const k of [0, 14, 28]) { rect(g, wt + k, 62, 11, 34, "#d8bfb6"); for (let yy = 65; yy < 95; yy += 3) for (let xx = wt + k + 2; xx < wt + k + 10; xx += 2) px(g, xx, yy, (xx + yy) % 7 ? "#bfa197" : "#ffe2a8"); }
    // BU: Marsh Chapel spire
    const mc = Math.round(W * 0.03);
    rect(g, mc, 96, 12, 22, "#c7a99d"); rect(g, mc + 3, 84, 6, 12, "#c7a99d"); poly(g, [[mc + 2, 84], [mc + 10, 84], [mc + 6, 70]], "#b4948a"); rect(g, mc + 5, 99, 2, 5, "#ffe2a8");

    // the Zakim-style bridge on the right: two white towers and fanned cables
    const zb = Math.round(W * 0.86);
    for (const tx of [zb, zb + 34]) {
      line(g, tx - 4, 118, tx, 70, "#b9aaa3"); line(g, tx + 4, 118, tx, 70, "#fffaf4"); line(g, tx - 3, 118, tx + 1, 70, "#fffaf4"); line(g, tx + 3, 118, tx, 72, "#d9cbc4");
      for (let k = 0; k < 6; k++) { line(g, tx, 74 + k * 2, tx - 16 + k * 2, 112, "#d9cbc4"); line(g, tx, 74 + k * 2, tx + 16 - k * 2, 112, "#d9cbc4"); }
    }
    rect(g, zb - 22, 112, 78, 3, "#cbbcb4"); rect(g, zb - 22, 112, 78, 1, "#fffaf4");

    // near row: brick brownstones with bay windows, cornices and lit windows
    let bx = -4;
    const BRICK = ["#b5523b", "#a8492f", "#c0603f", "#9d4630"];
    while (bx < W) {
      const w = 18 + ((bx * 5) % 6), h = 22 + ((bx * 3) % 8), col = BRICK[Math.abs(bx) % BRICK.length], top = 128 - h;
      rect(g, bx, top, w, h, col); rect(g, bx - 1, top - 2, w + 2, 2, "#5a2a20");                         // cornice
      rect(g, bx + 2, top + 4, 6, h - 10, "#c98d73");                                                      // bay
      for (let yy = top + 5; yy < 122; yy += 6) for (const xx of [bx + 3, bx + 10, bx + 14]) {
        if (xx + 2 >= bx + w) continue;
        rect(g, xx, yy, 3, 3, ((xx * yy) % 7) < 3 ? "#ffd36b" : "#3d2b33");
        px(g, xx, yy, "#ffe9a8");
      }
      rect(g, bx + w - 7, 122, 5, 6, "#3d2b33");                                                         // door + stoop
      for (let k = 0; k < 3; k++) rect(g, bx + w - 9 - k, 126 + k, 9 + 2 * k, 1, "#8f8076");
      bx += w + 1;
    }

    // Commonwealth Ave through BU: the train runs on rails in the grassy median, with the avenue below it
    rect(g, 0, TRACK + 2, W, 5, "#7da35a");                                                   // median grass
    for (let tx = 0; tx < W; tx += 4) rect(g, tx, TRACK + 1, 2, 2, "#7a5a45");                // ties
    rect(g, 0, TRACK, W, 1, "#c9ccd3"); rect(g, 0, TRACK + 3, W, 1, "#9aa0a8");               // rails
    rect(g, 0, TRACK + 7, W, 2, "#d8d2c8");                                                   // curb
    rect(g, 0, TRACK + 9, W, H - TRACK - 21, "#5b5d63");                                      // asphalt
    for (let tx = 0; tx < W; tx += 14) rect(g, tx, TRACK + 9 + ((H - TRACK - 21) >> 1), 7, 1, "#f2d27a");   // centre line
    for (let tx = 6; tx < W; tx += 40) for (let k = 0; k < 4; k++) rect(g, tx + k * 4, TRACK + 11, 2, H - TRACK - 25, "#e9e6df");  // crosswalks
    rect(g, 0, H - 12, W, 12, "#cfc6b8");                                                     // sidewalk
    for (let tx = 0; tx < W; tx += 8) rect(g, tx, H - 12, 1, 12, "#b9b0a2");
    // lampposts with red banners and trees along the avenue
    for (let tx = 18; tx < W; tx += 36) {
      rect(g, tx, TRACK - 22, 1, 30, "#3d3f45"); rect(g, tx - 2, TRACK - 23, 5, 1, "#3d3f45"); px(g, tx - 2, TRACK - 22, "#ffe9a8"); px(g, tx + 2, TRACK - 22, "#ffe9a8");
      rect(g, tx + 1, TRACK - 18, 4, 7, "#cc0000"); rect(g, tx + 1, TRACK - 12, 4, 1, "#9e0000");
      const tr = tx + 18;
      rect(g, tr, TRACK - 8, 2, 10, "#6b4b3a");
      for (let y = -6; y <= 5; y++) for (let x2 = -7; x2 <= 7; x2++) if (x2 * x2 + y * y * 2 < 50) px(g, tr + 1 + x2, TRACK - 14 + y, (x2 + y) % 4 ? "#5e8f45" : "#76a85a");
    }
    return { sky, city: c };
  }

  function mount(el) {   // returns { leave }
    const cv = document.createElement("canvas");
    cv.className = "px-scene";
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", "Pixel Boston at dusk: towers, brownstones and a bridge, with a train running along Commonwealth Avenue through Boston University");
    el.replaceChildren(cv);
    const g = cv.getContext("2d"), sprite = train();
    let bg = null, W = 0, tx = 0, last = 0, scroll = 0;
    const size = () => {
      const r = el.getBoundingClientRect();
      W = Math.max(200, Math.round(H * (r.width / Math.max(1, r.height)) || 320));
      cv.width = W; cv.height = H; bg = city(W); g.imageSmoothingEnabled = false;
      tx = Math.round(W * 0.5 - sprite.width / 2);
      draw(0);
    };
    const draw = (now) => {
      // the camera follows the train: the sky stays, the city scrolls past (tiled), the train holds its place
      const o = Math.round(scroll) % W;
      g.drawImage(bg.sky, 0, 0); g.drawImage(bg.city, -o, 0); g.drawImage(bg.city, W - o, 0);
      g.drawImage(sprite, Math.round(tx), TRACK - sprite.height + 2);
      // window lights in the brownstones twinkle a little
      if (now) { const k = Math.floor(now / 700); for (let i = 0; i < 4; i++) { const x = (k * 53 + i * 97) % W; px(g, x, 104 + ((k + i) % 3) * 6, "#ffe9a8"); } }
    };
    new ResizeObserver(size).observe(el);
    size();
    // leave(ms): the train speeds up and rushes off to the right while the city streaks past (used when a choice is made)
    let leaving = null;
    const leave = (ms = 700) => new Promise((done) => { if (reduce) return done(); leaving = { t0: performance.now(), ms, base: tx, done }; });
    if (reduce) return { leave };
    const loop = (now) => {
      if (leaving) {
        const p = Math.min(1, (now - leaving.t0) / leaving.ms);
        tx = leaving.base + p * p * (W + sprite.width - leaving.base + 20); scroll += 1 + p * 14; draw(now);
        if (p >= 1) { const d = leaving.done; leaving = null; d(); }
      } else if (now - last > 80) { last = now; scroll += 1; draw(now); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return { leave };
  }
  return { mount, train };   // train(): the train sprite on its own canvas (the wall's arrival uses it)
})();
