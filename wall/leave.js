// Leave room: a button beside your corner tab on the room map. It asks first ("Are you sure?", Yes / No); Yes leaves the
// room (Room.leave) and takes you back to the front page, where you can join or host again. Not on the projector (?kiosk).
(() => {
  if (new URLSearchParams(location.search).has("kiosk")) return;
  const room = () => { try { return JSON.parse(localStorage.getItem("wall.room") || "null"); } catch { return null; } };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const DOOR = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4H6v16h8"/><path d="M14 4l5 2v12l-5 2z"/><path d="M3 12h7M7 9l3 3-3 3"/></svg>';

  const btn = el("button", "lv-btn"); btn.type = "button";
  btn.innerHTML = DOOR;                                              // static icon markup
  btn.append(el("span", null, "Leave room"));
  document.body.append(btn);

  const shade = el("div", "lv-shade"); shade.hidden = true;
  const win = el("div", "lv-win"); win.setAttribute("role", "alertdialog"); win.setAttribute("aria-modal", "true"); win.setAttribute("aria-labelledby", "lv-title"); win.setAttribute("aria-describedby", "lv-text");
  const bar = el("p", "lv-bar", "Leave room");
  const title = el("h2", null, "Are you sure?"); title.id = "lv-title";
  const text = el("p", "lv-text"); text.id = "lv-text";
  const row = el("div", "lv-row");
  const yes = el("button", "lv-yes", "Yes, leave"); yes.type = "button";
  const no = el("button", "lv-no", "No, stay"); no.type = "button";
  row.append(yes, no);
  win.append(bar, title, text, row);
  shade.append(win);
  document.body.append(shade);

  const refresh = () => { const r = room(); btn.hidden = !(r && r.status === "in"); };
  refresh();
  if (typeof Room !== "undefined" && Room.onChange) Room.onChange(refresh);

  let last = null;
  const open = () => {
    const r = room();
    text.textContent = `You'll leave ${r && r.name ? r.name : "this room"}${r && r.host ? " (you're hosting it)" : ""}. You can join again any time by tapping your badge.`;
    last = document.activeElement; shade.hidden = false; no.focus();
  };
  const close = () => { shade.hidden = true; if (last && last.focus) last.focus(); };
  btn.addEventListener("click", open);
  no.addEventListener("click", close);
  shade.addEventListener("click", (e) => { if (e.target === shade) close(); });
  addEventListener("keydown", (e) => {
    if (shade.hidden) return;
    if (e.key === "Escape") close();
    if (e.key === "Tab") { const f = [yes, no], i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus(); }   // keep focus in the window
  });
  yes.addEventListener("click", () => {
    if (typeof Room !== "undefined" && Room.leave) Room.leave();
    try { localStorage.removeItem("wall.room"); } catch { /* private mode */ }
    location.href = "/landing/";
  });

  const css = el("style");
  css.textContent = `
  .lv-btn { position: fixed; z-index: 6; top: 18px; left: 178px; display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 14px; cursor: pointer;
            background: #fff; color: #111; border: 2px solid #111; box-shadow: 4px 4px 0 #DA291C; font: 400 14px "DotGothic16", monospace; text-transform: uppercase; letter-spacing: .05em;
            transition: transform .06s, box-shadow .06s; }
  .lv-btn:hover, .lv-btn:focus-visible { background: #DA291C; color: #fff; outline: none; }
  .lv-btn:active { transform: translate(4px, 4px); box-shadow: 0 0 0 #DA291C; }
  .lv-btn[hidden] { display: none; }
  .lv-shade { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 16px; background: rgba(17, 17, 17, .4); animation: lv-in .18s ease-out; }
  .lv-shade[hidden] { display: none; }
  .lv-win { width: min(380px, 100%); background: #fbf9f6; border: 3px solid #111; box-shadow: 0 0 0 3px #fbf9f6, 0 0 0 6px #111, 10px 10px 0 6px rgba(17,17,17,.85); padding: 18px 20px 20px;
            font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; animation: lv-pop .28s cubic-bezier(.2,.9,.25,1.25); }
  .lv-bar { margin: 0 0 12px; padding: 7px 26px 6px 10px; background: #111; color: #fff; font: 400 13px "DotGothic16", monospace; text-transform: uppercase; letter-spacing: .06em; box-shadow: inset -12px 0 0 #ff4b3e; }
  .lv-win h2 { margin: 0 0 6px; font: 700 26px/1.1 "Helvetica Neue", Helvetica, Arial, sans-serif; letter-spacing: -.02em; }
  .lv-text { margin: 0 0 18px; color: #444; font-size: 15px; line-height: 1.4; }
  .lv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .lv-row button { min-height: 50px; cursor: pointer; border: 0; font: 400 16px "DotGothic16", monospace; text-transform: uppercase; letter-spacing: .05em; transition: transform .06s, box-shadow .06s; }
  .lv-yes { background: #DA291C; color: #fff; box-shadow: 6px 6px 0 #111; }
  .lv-yes:hover, .lv-yes:focus-visible { background: #a31c12; outline: none; }
  .lv-no { background: #111; color: #ffb000; box-shadow: 6px 6px 0 #DA291C; }
  .lv-no:hover, .lv-no:focus-visible { background: #2a2a2a; outline: 2px solid #ffb000; outline-offset: 2px; }
  .lv-row button:active { transform: translate(6px, 6px); box-shadow: none; }
  @keyframes lv-in { from { opacity: 0; } }
  @keyframes lv-pop { from { transform: scale(.85); opacity: 0; } }
  @media (max-width: 800px) { .lv-btn { top: 16px; left: auto; right: 12px; height: 40px; padding: 0 10px; } .lv-btn span { display: none; } body.hw .count { top: 64px; } }
  @media (prefers-reduced-motion: reduce) { .lv-shade, .lv-win { animation: none; } }`;
  document.head.append(css);
})();
