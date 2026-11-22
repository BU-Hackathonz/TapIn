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
  let room = null;
  try { room = JSON.parse(localStorage.getItem("wall.room") || "null"); } catch { /* private mode */ }
  if (room && (room.status !== "in" || (room.time && Date.now() - room.time > 18 * 3600e3))) room = null;   // same 18 h rule as the join page
  if (join) {
    join.href = "/wall/join.html?join";
    join.querySelector("b").textContent = room ? `Back to ${room.name || "your room"}` : "Join a room";
    join.querySelector("span").textContent = room ? "You're already in, no tap needed" : "Tap your badge at the event";
  }
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
  item("Settings", "#003DA5", "#").addEventListener("click", (e) => { e.preventDefault(); open(false); settings(); });
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

  // Settings opens here, in a window over this page (the room map has its own settings in its corner panel).
  const store = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch { return false; } };
  const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  function settings() {
    const back = el("div", "acc-set-back");
    const win = el("div", "acc-set"); win.setAttribute("role", "dialog"); win.setAttribute("aria-modal", "true"); win.setAttribute("aria-labelledby", "acc-set-t");
    const close = () => { back.remove(); removeEventListener("keydown", esc); btn.focus(); };
    const esc = (e) => { if (e.key === "Escape") close(); };
    addEventListener("keydown", esc);
    back.addEventListener("click", (e) => { if (e.target === back) close(); });
    const x = el("button", "acc-set-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Close settings"); x.addEventListener("click", close);
    const top = el("div", "acc-set-top"); const t = el("h2", null, "Settings"); t.id = "acc-set-t"; top.append(t, x);

    // profile: the quick fields; photo, skills and apps stay on the full editor
    const form = el("form", "acc-set-form");
    const field = (label, name, ph, max) => { const l = el("label", null, label), i = el("input"); i.type = "text"; i.name = name; i.value = me[name] || ""; i.placeholder = ph; i.maxLength = max; l.append(i); return l; };
    const saved = el("span", "acc-set-ok", ""); saved.setAttribute("role", "status");
    const save = el("button", "acc-set-btn", "Save"); save.type = "submit";
    const more = el("a", "acc-set-link", "Photo, skills and apps"); more.href = "/wall/join.html?edit";
    const row = el("div", "acc-set-row"); row.append(save, more, saved);
    form.append(field("Name", "name", "First name", 30), field("School", "school", "Boston University", 60),
                field("Major", "major", "Computer Engineering", 40), field("One line about you", "bio", "Likes soldering more than slides.", 80), row);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = form.elements;
      me.name = f.name.value.trim() || "Guest";
      for (const k of ["school", "major", "bio"]) { const v = f[k].value.trim(); if (v) me[k] = v; else delete me[k]; }
      if (!store("wall.me", JSON.stringify(me))) { saved.textContent = "Couldn't save in this browser"; return; }
      saved.textContent = "Saved";
      who.querySelector("b").textContent = me.name; who.querySelector("small").textContent = me.school || "Signed in";
      bar.textContent = `Signed in as ${me.name}`;
      const hi = document.querySelector(".acc-hi"); if (hi) hi.textContent = `Welcome back, ${me.name}`;
      for (const i of document.querySelectorAll(".acc-init")) i.textContent = me.name.slice(0, 1).toUpperCase();
      setTimeout(() => { saved.textContent = ""; }, 1800);
    });

    // a switch row
    const toggle = (label, on, change) => {
      const l = el("label", "acc-set-sw"), i = el("input"); i.type = "checkbox"; i.checked = on;
      i.addEventListener("change", () => change(i.checked));
      l.append(el("span", null, label), i, el("i")); return l;
    };
    const planOn = read("wall.view") === "plan";
    const soundOn = read("tapin.uisound") !== "off";

    const acct = el("div", "acc-set-row");
    if (me.person_id != null) { const a = el("a", "acc-set-link", "Your suggestions and table"); a.href = "/phone/me.html?id=" + encodeURIComponent(me.person_id); acct.append(a); }
    const so = el("button", "acc-set-btn out", "Sign out"); so.type = "button";
    so.addEventListener("click", () => { store("wall.me", null); store("wall.room", null); location.reload(); });
    acct.append(so);

    win.append(top,
      el("h3", null, "Profile"), form,
      el("h3", null, "Room map"),
      toggle("Open the room as a floor plan", planOn, (v) => store("wall.view", v ? "plan" : "3d")),
      el("h3", null, "Sound"),
      toggle("Interface sounds", soundOn, (v) => {
        const uis = document.querySelector(".uis-toggle");          // keep the page's speaker button in step
        if (uis && (read("tapin.uisound") !== "off") !== v) uis.click(); else store("tapin.uisound", v ? "on" : "off");
      }),
      el("h3", null, "Account"), acct);
    back.append(win); document.body.append(back);
    win.querySelector("input")?.focus();
  }

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
  .acc-set-back { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 16px; background: rgba(17,17,17,.45); }
  .acc-set { width: min(440px, 100%); max-height: calc(100vh - 32px); overflow: auto; background: #fff; border: 2px solid #111; box-shadow: 8px 8px 0 #111; padding: 0 18px 18px; }
  .acc-set-top { position: sticky; top: 0; display: flex; align-items: center; justify-content: space-between; margin: 0 -18px; padding: 12px 18px; background: #111; color: #ffb000; }
  .acc-set-top h2 { margin: 0; font: 400 18px "DotGothic16", monospace; text-transform: uppercase; letter-spacing: .06em; }
  .acc-set-x { width: 32px; height: 32px; border: 0; background: none; color: #fff; font-size: 26px; line-height: 1; cursor: pointer; }
  .acc-set-x:hover, .acc-set-x:focus-visible { color: #ffb000; outline: none; }
  .acc-set h3 { margin: 18px 0 8px; font: 400 13px "DotGothic16", monospace; text-transform: uppercase; letter-spacing: .08em; color: #003DA5; }
  .acc-set-form label { display: block; margin-bottom: 10px; font: 600 12px "IBM Plex Sans", sans-serif; color: #444; }
  .acc-set-form input { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 9px 10px; border: 2px solid #111; font: 400 15px "IBM Plex Sans", sans-serif; }
  .acc-set-form input:focus { outline: none; box-shadow: 0 0 0 3px #ffb000; }
  .acc-set-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  .acc-set-btn { padding: 9px 16px; border: 2px solid #111; background: #111; color: #ffb000; font: 400 14px "DotGothic16", monospace; text-transform: uppercase; letter-spacing: .05em; cursor: pointer; }
  .acc-set-btn:hover, .acc-set-btn:focus-visible { background: #ffb000; color: #111; outline: none; }
  .acc-set-btn.out { background: #fff; color: #DA291C; border-color: #DA291C; } .acc-set-btn.out:hover { background: #DA291C; color: #fff; }
  .acc-set-link { color: #003DA5; font: 600 14px "IBM Plex Sans", sans-serif; }
  .acc-set-ok { color: #00843D; font: 600 13px "IBM Plex Sans", sans-serif; }
  .acc-set-sw { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; font: 400 15px "IBM Plex Sans", sans-serif; color: #111; cursor: pointer; }
  .acc-set-sw input { position: absolute; opacity: 0; width: 1px; height: 1px; }
  .acc-set-sw i { flex: none; position: relative; width: 42px; height: 24px; border: 2px solid #111; border-radius: 14px; background: #e2ddd8; transition: background .15s; }
  .acc-set-sw i::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #111; transition: transform .15s; }
  .acc-set-sw input:checked + i { background: #00843D; } .acc-set-sw input:checked + i::after { transform: translateX(18px); background: #fff; }
  .acc-set-sw input:focus-visible + i { box-shadow: 0 0 0 3px #ffb000; }
  @media (max-width: 600px) { .acc-me { width: 44px; height: 44px; top: 10px; right: 10px; } .acc-menu { right: 10px; top: 66px; width: min(270px, calc(100vw - 20px)); } }`;
  document.head.append(css);
})();
