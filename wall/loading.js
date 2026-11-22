// The loading train, for any page that sends you into the room: the pixel Boston fills the screen under a LOADING board
// with a line-colour progress bar, then the train races off, the screen fades and the wall's arrival takes over
// (sessionStorage "tapin.arrive", read by arrive.js). TapLoading.go(href, { sub }) runs it; needs pixel.js.
const TapLoading = (() => {
  const CSS = `
  .tl { position: fixed; inset: 0; z-index: 60; background: #f4cfc4; animation: tl-in .35s ease-out; }
  .tl-scene { position: absolute; inset: 0; }
  .tl-scene .px-scene { display: block; width: 100%; height: 100%; image-rendering: pixelated; image-rendering: crisp-edges; }
  .tl-top { position: absolute; left: 0; right: 0; top: 9vh; display: grid; justify-items: center; gap: 10px; text-align: center; }
  .tl-word { margin: 0; padding: 10px 26px 8px; background: #111; color: #ffb000; font: 400 clamp(30px, 5vw, 56px)/1 "DotGothic16", monospace; letter-spacing: .12em; box-shadow: 8px 8px 0 #DA291C; }
  .tl-word i { font-style: normal; animation: tl-dot 1.2s steps(1) infinite; } .tl-word i:nth-child(2) { animation-delay: .2s; } .tl-word i:nth-child(3) { animation-delay: .4s; }
  .tl-sub { margin: 0; color: #fff; font: 400 18px "DotGothic16", monospace; text-transform: uppercase; letter-spacing: .06em; text-shadow: 2px 2px 0 rgba(17,17,17,.75); }
  .tl-bar { width: min(360px, 70vw); height: 14px; padding: 2px; background: #111; }
  .tl-bar i { display: block; height: 100%; width: 0; background: repeating-linear-gradient(90deg, #DA291C 0 8px, #ED8B00 8px 16px, #003DA5 16px 24px, #00843D 24px 32px); transition: width 1.6s steps(16); }
  .tl-fade { position: absolute; inset: 0; background: #fbf9f6; opacity: 0; transition: opacity .5s ease; pointer-events: none; }
  .tl-fade.on { opacity: 1; }
  @keyframes tl-in { from { opacity: 0; } }
  @keyframes tl-dot { 0%, 30% { opacity: 0; } 31%, 100% { opacity: 1; } }`;

  function go(href, { sub = "Next stop: BostonHacks 2026" } = {}) {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    try { sessionStorage.setItem("tapin.arrive", "1"); } catch { /* private mode */ }
    if (typeof PixelBoston === "undefined" || reduce) { location.href = href; return; }
    if (!document.getElementById("tl-css")) { const st = document.createElement("style"); st.id = "tl-css"; st.textContent = CSS; document.head.append(st); }
    const box = document.createElement("div");
    box.className = "tl"; box.setAttribute("aria-live", "polite");
    box.innerHTML = '<div class="tl-scene" aria-hidden="true"></div><div class="tl-top"><p class="tl-word">LOADING<i>.</i><i>.</i><i>.</i></p>'
      + '<p class="tl-sub"></p><div class="tl-bar"><i></i></div></div><div class="tl-fade"></div>';
    box.querySelector(".tl-sub").textContent = sub;
    document.body.append(box);
    const scene = PixelBoston.mount(box.querySelector(".tl-scene"));
    requestAnimationFrame(() => { box.querySelector(".tl-bar i").style.width = "100%"; });
    setTimeout(async () => {
      box.querySelector(".tl-sub").textContent = "Arriving";
      await scene.leave(900);
      box.querySelector(".tl-fade").classList.add("on");
      setTimeout(() => { location.href = href; }, 450);
    }, 1700);
  }
  return { go };
})();
