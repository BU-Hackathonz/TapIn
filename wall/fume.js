// David's pixel smoke from the host wall, behind every wall view: low-res value noise, posterised through a 4x4 ordered
// dither, drifting and stepping about ten times a second, stirred a little by the mouse. Only in the host look (T looks).
(() => {
  const c = document.createElement("canvas");
  c.id = "fume"; c.setAttribute("aria-hidden", "true"); c.width = 120; c.height = 75;
  document.body.prepend(c);
  const g = c.getContext("2d"), img = g.createImageData(c.width, c.height);
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  let mx = 0.5, my = 0.5;
  addEventListener("pointermove", (e) => { mx = e.clientX / innerWidth; my = e.clientY / innerHeight; }, { passive: true });
  const draw = (now) => {
    const w = c.width, h = c.height, s = now / 1000;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = (Math.sin(x * 0.07 + s * 0.3) + Math.sin(y * 0.12 - s * 0.2) + Math.sin((x + y) * 0.045 + s * 0.25)
        + Math.sin(Math.hypot(x - w * mx, y - h * my) * 0.11 - s * 0.4)) / 4;
      const lv = Math.floor(((v + 1) / 2) * 3 + BAYER[(y % 4) * 4 + (x % 4)] - 0.5);
      const i = (y * w + x) * 4;
      img.data[i] = 214; img.data[i + 1] = 43; img.data[i + 2] = 80; img.data[i + 3] = lv <= 0 ? 0 : lv === 1 ? 22 : 46;
    }
    g.putImageData(img, 0, 0);
  };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { draw(0); return; }
  let last = 0;
  const loop = (now) => { if (now - last > 100 && !document.hidden) { last = now; draw(now); } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
})();
