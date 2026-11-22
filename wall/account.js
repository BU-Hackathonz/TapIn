// Signed in on this device (localStorage "wall.me", made by the join page)? Then the front page greets you, its two
// tiles become Join a room / Host a room, and your picture sits in the top-right corner: click it for your profile,
// settings and sign out. Loaded by the landing page; does nothing when nobody is signed in.
(() => {
  let me = null;
  try { me = JSON.parse(localStorage.getItem("wall.me") || "null"); } catch { /* private mode */ }
  if (!me || !me.name) return;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // the greeting and the two tiles
  const tag = $(".tag");
  if (tag) { tag.textContent = ""; tag.append(el("b", "acc-hi", `Welcome back, ${me.name}`), el("span", "acc-q", "What do you want to do?")); }
  const join = $(".choice.join"), host = $(".choice.host");
  if (join) { join.href = "/wall/join.html?join"; join.querySelector("b").textContent = "Join a room"; join.querySelector("span").textContent = "Tap your badge at the event"; }
  if (host) { host.href = "/wall/join.html?host"; host.querySelector("b").textContent = "Host a room"; host.querySelector("span").textContent = "Start a room others can join"; }

  // your picture in the corner (photo if you added one, otherwise your initial)
  const btn = el("button", "acc-me"); btn.type = "button"; btn.setAttribute("aria-haspopup", "menu"); btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-label", `${me.name}: profile and settings`);
  if (me.photo) { const img = el("img"); img.src = me.photo; img.alt = ""; btn.append(img); }
  else btn.append(el("span", "acc-init", me.name.slice(0, 1).toUpperCase()));
  btn.append(el("i", "acc-dot"));

  const menu = el("div", "acc-menu"); menu.setAttribute("role", "menu"); menu.hidden = true;
  const head = el("div", "acc-mh");
  const av = btn.cloneNode(true); av.className = "acc-av"; av.removeAttribute("aria-haspopup"); av.removeAttribute("aria-expanded"); av.removeAttribute("aria-label"); av.querySelector(".acc-dot")?.remove();
  const who = el("div"); who.append(el("b", null, me.name), el("small", null, me.school || "Signed in"));
  head.append(av, who);
  menu.append(head);
  const item = (label, color, href, cls) => { const a = el("a", "acc-item" + (cls ? " " + cls : "")); a.setAttribute("role", "menuitem"); a.href = href; const i = el("i"); i.style.background = color; a.append(i, document.createTextNode(label)); menu.append(a); return a; };
  item("Your profile", "#DA291C", "/wall/join.html?profile");
  item("Edit profile & photo", "#ED8B00", "/wall/join.html?edit");
  item("Settings", "#003DA5", "/wall/index.html?open=settings");
  item("Your rooms", "#00843D", "/wall/index.html");
  const out = item("Sign out", "transparent", "#", "out");
  out.querySelector("i").remove(); out.prepend(document.createTextNode("⏻ "));
  out.addEventListener("click", (e) => {
    e.preventDefault();
    try { localStorage.removeItem("wall.me"); localStorage.removeItem("wall.room"); } catch { /* private mode */ }
    location.reload();
  });
  const shade = el("div", "acc-shade"); shade.hidden = true;
  const open = (v) => { menu.hidden = !v; shade.hidden = !v; btn.setAttribute("aria-expanded", String(v)); if (v) menu.querySelector("a")?.focus(); };
  btn.addEventListener("click", () => open(menu.hidden));
  shade.addEventListener("click", () => open(false));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { open(false); btn.focus(); } });
  document.body.append(shade, btn, menu);
  const bar = el("div", "acc-bar", `Signed in as ${me.name}`); document.body.append(bar);

  const css = el("style");
  css.textContent = `
  .acc-hi { display: block; font: 600 clamp(18px, 2vw, 24px) "IBM Plex Sans", sans-serif; color: #2b1f23; }
  .acc-q { display: block; font: 400 15px "IBM Plex Sans", sans-serif; color: #6b5a5e; }
  .acc-me { position: fixed; top: 14px; right: 16px; z-index: 30; width: 52px; height: 52px; padding: 0; border-radius: 50%; border: 3px solid #fff; background: #ED8B00;
            box-shadow: 0 0 0 2px #111, 0 6px 16px rgba(0,0,0,.2); cursor: pointer; overflow: visible; }
  .acc-me img, .acc-av img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; }
  .acc-init { display: grid; place-items: center; width: 100%; height: 100%; color: #fff; font: 400 24px "DotGothic16", monospace; }
  .acc-dot { position: absolute; right: -4px; bottom: -4px; width: 16px; height: 16px; border-radius: 50%; background: #00843D; border: 3px solid #fff; }
  .acc-me[aria-expanded="true"], .acc-me:focus-visible { box-shadow: 0 0 0 2px #111, 0 0 0 6px #ffb000; outline: none; }
  .acc-shade { position: fixed; inset: 0; z-index: 28; background: rgba(17,17,17,.2); }
  .acc-menu { position: fixed; top: 78px; right: 16px; z-index: 31; width: 270px; background: #fff; border: 2px solid #111; box-shadow: 6px 6px 0 #111; }
  .acc-menu::before { content: ""; position: absolute; top: -10px; right: 18px; border: 8px solid transparent; border-top: 0; border-bottom-color: #111; }
  .acc-mh { display: flex; gap: 10px; align-items: center; padding: 12px; border-bottom: 2px solid #111; }
  .acc-av { position: relative; flex: none; width: 42px; height: 42px; border-radius: 50%; overflow: hidden; background: #ED8B00; border: 2px solid #fff; box-shadow: 0 0 0 2px #111; }
  .acc-av .acc-init { font-size: 20px; }
  .acc-mh b { display: block; font: 700 16px "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; }
  .acc-mh small { color: #666; font-size: 12px; }
  .acc-item { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-bottom: 1px solid #e2ddd8; color: #111; text-decoration: none;
              font: 400 14px "DotGothic16", monospace; text-transform: uppercase; letter-spacing: .05em; }
  .acc-item i { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  .acc-item:hover, .acc-item:focus-visible { background: #111; color: #ffb000; outline: none; }
  .acc-item.out { color: #DA291C; border-bottom: 0; } .acc-item.out:hover { color: #fff; background: #DA291C; }
  .acc-bar { position: fixed; left: 0; bottom: 0; z-index: 4; padding: 8px 16px 6px; background: #111; color: #ffb000; font: 400 13px "DotGothic16", monospace; text-transform: uppercase; letter-spacing: .05em; }
  @media (max-width: 600px) { .acc-me { width: 44px; height: 44px; top: 10px; right: 10px; } .acc-menu { right: 10px; top: 66px; width: min(270px, calc(100vw - 20px)); } }`;
  document.head.append(css);
})();
