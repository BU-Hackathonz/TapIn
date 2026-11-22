// The gear at the top right of the side dashboard opens this panel: Jun's account panel from the room map (You / Settings: profile,
// account sign in and out, room, sound), minus the Style picker and the Display switches (room plan, 2D, names, spin). The host wall is
// one fixed view. End room asks "Are you sure?" first.
// Everything is kept in this browser (wall.me, wall.room), the same keys the join page writes.
(() => {
  const pill = document.getElementById("hostset");
  if (!pill) return;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const DOOR = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4H6v16h8"/><path d="M14 4l5 2v12l-5 2z"/><path d="M3 12h7M7 9l3 3-3 3"/></svg>';
  const get = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const panel = el("aside", "hp"); panel.id = "hostpanel"; panel.hidden = true; panel.setAttribute("aria-label", "Your account and settings");
  document.body.append(panel);
  let tab = "you";
  const mine = () => get("wall.me") || {};
  const room = () => get("wall.room") || {};
  const bar = (t) => el("h3", "hp-bar", t);

  const trigger = () => { pill.setAttribute("aria-label", "Account and settings"); };

  const link = (text, href) => { const a = el("a", "hp-link", text); a.href = href; return a; };
  const you = (body) => {
    const m = mine(), r = room(), signedIn = !!m.name;
    body.append(bar("You"), el("p", "hp-big", m.name || "Not signed in"));
    if (m.school || m.major) body.append(el("p", "hp-note", [m.school, m.major].filter(Boolean).join(" · ")));
    if (m.bio) body.append(el("p", "hp-note", m.bio));
    body.append(el("p", "hp-note", r.host && r.name ? `Hosting ${r.name}${r.place ? " · " + r.place : ""}` : "Not in a room"),
                el("p", "hp-note", signedIn ? `Signed in as ${m.name}` : "Sign in to keep your profile on this screen."),
                signedIn ? link("Edit your profile", "join.html?edit") : link("Sign in or set up your profile", "join.html?login"));
  };

  const settings = (body) => {
    const m = mine();
    body.append(bar("Profile"));
    const form = el("form", "hp-form");
    const field = (label, name, value, ph, max) => { const l = el("label", "", label), i = el("input"); i.type = "text"; i.name = name; i.value = value || ""; i.placeholder = ph; i.maxLength = max; l.append(i); return l; };
    const save = el("button", "hp-save", "Save"), msg = el("span", "hp-msg"), row = el("div", "hp-row");
    save.type = "submit"; row.append(save, link("Photo, skills and apps", "join.html?edit"), msg);
    form.append(field("Name", "name", m.name, "First name", 30), field("School", "school", m.school, "Boston University", 60),
                field("Major", "major", m.major, "Computer Engineering", 40), field("One line about you", "bio", m.bio, "Likes soldering more than slides.", 80), row);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = form.elements, next = { role: "student", skills: [], looking_for: [], links: {}, socials: [], ...mine() };
      next.name = f.name.value.trim() || "Host";
      for (const k of ["school", "major", "bio"]) { const v = f[k].value.trim(); if (v) next[k] = v; else delete next[k]; }
      const saved = put("wall.me", next);
      msg.textContent = saved ? "Saved" : "Couldn't save in this browser";
      if (typeof UISound !== "undefined") (saved ? UISound.ok : UISound.no)();
      trigger();
      setTimeout(() => { msg.textContent = ""; }, 1800);
    });
    const sw = el("label", "hp-sw"), cb = el("input"); cb.type = "checkbox";
    cb.checked = !!(typeof Sound !== "undefined" && Sound.started && !Sound.muted);
    sw.append(el("span", "", "Bell and plucks"), cb);
    cb.addEventListener("change", async () => {
      if (cb.checked) { try { await Sound.start(); } catch { /* no audio yet */ } }
      if (typeof Sound !== "undefined" && Sound.setMuted) Sound.setMuted(!cb.checked);
      try { localStorage.setItem("wall.hostSound", cb.checked ? "on" : "off"); } catch { /* private mode */ }
    });
    const acct = el("button", "hp-save hp-out", mine().name ? "Sign out" : "Sign in"); acct.type = "button";
    acct.addEventListener("click", () => { const was = !!mine().name; if (was) { try { localStorage.removeItem("wall.me"); } catch { /* private mode */ } } location.href = was ? "join.html" : "join.html?login"; });
    const qw = el("label", "hp-sw"), qb = el("input"); qb.type = "checkbox";
    qb.checked = !!(typeof Sound !== "undefined" && Sound.mode === "quiet");
    qw.append(el("span", "", "Quiet mode (study hours)"), qb);
    qb.addEventListener("change", () => {
      if (typeof Sound !== "undefined" && Sound.setMode) Sound.setMode(qb.checked ? "quiet" : "event");
      try { localStorage.setItem("wall.hostQuiet", qb.checked ? "on" : "off"); } catch { /* private mode */ }
    });
    body.append(form, bar("Account"), acct, bar("Sound"), sw, qw, el("p", "hp-note", "Quiet mode: no bell when someone taps in, just plucks for tables. Good for study hours."));
  };

  const render = () => {
    const tabs = el("nav", "hp-tabs");
    for (const [id, label] of [["you", "You"], ["settings", "Settings"]]) {
      const b = el("button", id === tab ? "on" : "", label); b.type = "button";
      b.addEventListener("click", () => { tab = id; render(); });
      tabs.append(b);
    }
    const body = el("div", "hp-body");
    (tab === "you" ? you : settings)(body);
    const end = el("button", "hp-leave"); end.type = "button"; end.innerHTML = DOOR; end.append(el("span", "", "End room"));   // static icon markup
    end.addEventListener("click", ask);
    body.append(bar("Room"), end, link("Join or host another", "join.html?host"), link("People and badges (team)", "/host/admin.html"));
    panel.replaceChildren(tabs, body);
  };

  // End room asks first, like Leave room on the room map.
  const shade = el("div", "hp-shade"); shade.hidden = true;
  const win = el("div", "hp-win"); win.setAttribute("role", "alertdialog"); win.setAttribute("aria-modal", "true"); win.setAttribute("aria-labelledby", "hp-t");
  const title = el("h2", null, "Are you sure?"); title.id = "hp-t";
  const wtext = el("p", "hp-wtext");
  const yes = el("button", "hp-yes", "Yes, end it"), no = el("button", "hp-no", "No, keep going"), yn = el("div", "hp-yn");
  yes.type = no.type = "button"; yn.append(yes, no);
  win.append(el("p", "hp-wbar", "End room"), title, wtext, yn);
  shade.append(win); document.body.append(shade);
  let last = null;
  const ask = () => {
    const r = room();
    wtext.textContent = `You'll stop hosting ${r.name || "this room"} and go back to the front page. You can host again any time.`;
    last = document.activeElement; shade.hidden = false; no.focus();
  };
  const close = () => { shade.hidden = true; if (last && last.focus) last.focus(); };
  no.addEventListener("click", close);
  shade.addEventListener("click", (e) => { e.stopPropagation(); if (e.target === shade) close(); });
  yes.addEventListener("click", () => {
    yes.disabled = true;
    if (typeof UISound !== "undefined") UISound.end();
    try { localStorage.removeItem("wall.room"); } catch { /* private mode */ }
    fetch("/api/host/logout", { method: "POST" }).catch(() => {});
    document.body.classList.add("hp-leaving");
    setTimeout(() => location.assign("/landing/?skip"), 380);
  });

  const open = (v) => { panel.hidden = !v; pill.setAttribute("aria-expanded", String(v)); if (v) render(); };
  pill.setAttribute("aria-haspopup", "dialog"); pill.setAttribute("aria-expanded", "false");
  pill.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); open(panel.hidden); });
  panel.addEventListener("click", (e) => e.stopPropagation());
  addEventListener("click", () => open(false));
  addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!shade.hidden) close(); else open(false);
  });
  trigger();
})();
