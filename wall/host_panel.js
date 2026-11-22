// The gear on the host wall opens this panel, in the same look as the room map's corner panel: a You tab (who is hosting) and a
// Settings tab (place name, sound), plus Leave room, which asks "Are you sure?" first. Nothing here changes how the wall looks
// (no views, styles, tables or names): that is set once, before Start.
(() => {
  const gear = document.getElementById("hostset");
  if (!gear) return;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const DOOR = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4H6v16h8"/><path d="M14 4l5 2v12l-5 2z"/><path d="M3 12h7M7 9l3 3-3 3"/></svg>';
  const panel = el("aside", "hp"); panel.id = "hostpanel"; panel.hidden = true; panel.setAttribute("aria-label", "Host account and settings");
  document.body.append(panel);
  let me = {}, cur = {}, tab = "you";

  const save = async (patch) => {
    const r = await fetch("/api/host/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...cur, ...patch }) });
    if (r.ok) cur = await r.json();
    return r.ok;
  };
  const bar = (t) => el("h3", "hp-bar", t);

  const you = (body) => {
    body.append(bar("You"), el("p", "hp-big", "Host"), el("p", "hp-note", cur.venue ? `Hosting ${cur.venue}` : "Hosting this room"),
                el("p", "hp-note", "Signed in with the room PIN."));
  };
  const settings = (body) => {
    body.append(bar("Room"));
    const form = el("form", "hp-form"), lab = el("label", "", "Place name"), inp = el("input");
    inp.type = "text"; inp.maxLength = 40; inp.required = true; inp.value = cur.venue || ""; lab.append(inp);
    const ok = el("button", "hp-save", "Save"), msg = el("span", "hp-msg"), row = el("div", "hp-row");
    ok.type = "submit"; row.append(ok, msg); form.append(lab, row);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = inp.value.trim();
      if (v && await save({ venue: v })) { document.getElementById("locname").textContent = cur.venue; document.getElementById("venue").textContent = ""; msg.textContent = "Saved"; }
      else msg.textContent = "Could not save";
      setTimeout(() => { msg.textContent = ""; }, 1800);
    });
    const sw = el("label", "hp-sw"), cb = el("input"); cb.type = "checkbox"; cb.checked = cur.sound !== false;
    sw.append(el("span", "", "Sound on the wall"), cb);
    cb.addEventListener("change", async () => {
      if (await save({ sound: cb.checked }) && window.Sound) {
        if (cb.checked) { try { await Sound.start(); } catch { /* no audio yet */ } }
        if (Sound.setMuted) Sound.setMuted(!cb.checked);
      }
    });
    body.append(form, bar("Sound"), sw);
  };

  const render = () => {
    const tabs = el("nav", "hp-tabs");
    for (const [id, label] of [["you", "You"], ["settings", "Settings"]]) {
      const b = el("button", id === tab ? "on" : "", label); b.type = "button";
      b.addEventListener("click", () => { tab = id; render(); });
      tabs.append(b);
    }
    const body = el("div", "hp-body");
    if (!me.signed_in) {
      body.append(bar("Host"), el("p", "hp-note", "Not signed in as a host."));
      const a = el("a", "hp-save", "Host sign in"); a.href = "/host/"; body.append(a);
      panel.replaceChildren(body); return;
    }
    (tab === "you" ? you : settings)(body);
    const leave = el("button", "hp-leave"); leave.type = "button"; leave.innerHTML = DOOR; leave.append(el("span", "", "Leave room"));   // static icon markup
    leave.addEventListener("click", ask);
    body.append(bar("Leave"), leave);
    panel.replaceChildren(tabs, body);
  };

  // Leave room asks first, like the room map does.
  const shade = el("div", "hp-shade"); shade.hidden = true;
  const win = el("div", "hp-win"); win.setAttribute("role", "alertdialog"); win.setAttribute("aria-modal", "true"); win.setAttribute("aria-labelledby", "hp-t");
  const title = el("h2", null, "Are you sure?"); title.id = "hp-t";
  const yes = el("button", "hp-yes", "Yes, leave"), no = el("button", "hp-no", "No, stay"), row = el("div", "hp-yn");
  yes.type = no.type = "button"; row.append(yes, no);
  win.append(el("p", "hp-wbar", "Leave room"), title, el("p", "hp-wtext", "You'll sign out and go back to the front door. The room stays as it is."), row);
  shade.append(win); document.body.append(shade);
  let last = null;
  const ask = () => { last = document.activeElement; shade.hidden = false; no.focus(); };
  const close = () => { shade.hidden = true; if (last && last.focus) last.focus(); };
  no.addEventListener("click", close);
  shade.addEventListener("click", (e) => { if (e.target === shade) close(); });
  yes.addEventListener("click", async () => {
    yes.disabled = true;
    await fetch("/api/host/logout", { method: "POST" }).catch(() => {});
    document.body.classList.add("hp-leaving");
    setTimeout(() => location.assign("/landing/?skip"), 380);
  });

  const open = async (v) => {
    panel.hidden = !v; gear.setAttribute("aria-expanded", String(v));
    if (!v) return;
    me = await fetch("/api/host/me").then((r) => r.json()).catch(() => ({}));
    cur = await fetch("/api/room-settings").then((r) => r.json()).catch(() => ({}));
    render();
  };
  gear.setAttribute("aria-haspopup", "dialog"); gear.setAttribute("aria-expanded", "false");
  gear.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); open(panel.hidden); });
  panel.addEventListener("click", (e) => e.stopPropagation());
  addEventListener("click", () => open(false));
  addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!shade.hidden) close(); else open(false);
  });
})();
