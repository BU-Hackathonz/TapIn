// The gear on the host wall opens this panel: who is hosting, the place name, sound, and Leave room.
// Nothing here changes how the wall looks (no views, styles, tables or names): that is set once, before Start.
(() => {
  const gear = document.getElementById("hostset");
  if (!gear) return;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const panel = el("aside", "hp"); panel.id = "hostpanel"; panel.hidden = true; panel.setAttribute("aria-label", "Host account and settings");
  document.body.append(panel);
  let me = {}, cur = {};

  const save = async (patch) => {
    const r = await fetch("/api/host/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...cur, ...patch }) });
    if (r.ok) cur = await r.json(); return r.ok;
  };
  const render = () => {
    const head = el("div", "hp-bar"); head.append(el("b", "", "Host"));
    const x = el("button", "hp-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Close"); x.addEventListener("click", () => open(false)); head.append(x);
    const body = el("div", "hp-body");
    if (!me.signed_in) {
      body.append(el("p", "hp-note", "Not signed in as a host."));
      const a = el("a", "hp-btn", "Host sign in"); a.href = "/host/"; body.append(a);
    } else {
      body.append(el("h3", "hp-h", "Account"), el("p", "hp-note", "Signed in as the host with the room PIN."));
      body.append(el("h3", "hp-h", "Room"));
      const form = el("form", "hp-form"), lab = el("label", "", "Place name"), inp = el("input");
      inp.type = "text"; inp.maxLength = 40; inp.required = true; inp.value = cur.venue || ""; lab.append(inp);
      const ok = el("button", "hp-btn", "Save"); ok.type = "submit"; const msg = el("span", "hp-msg");
      form.append(lab, ok, msg);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const v = inp.value.trim();
        if (v && await save({ venue: v })) { document.getElementById("locname").textContent = cur.venue; document.getElementById("venue").textContent = ""; msg.textContent = "Saved"; }
        else msg.textContent = "Could not save";
        setTimeout(() => { msg.textContent = ""; }, 1800);
      });
      body.append(form);
      const sw = el("label", "hp-sw"), cb = el("input"); cb.type = "checkbox"; cb.checked = cur.sound !== false;
      sw.append(el("span", "", "Sound on the wall"), cb);
      cb.addEventListener("change", async () => {
        if (await save({ sound: cb.checked }) && window.Sound) {
          if (cb.checked) { try { await Sound.start(); } catch {} }
          if (Sound.setMuted) Sound.setMuted(!cb.checked);
        }
      });
      body.append(sw);
      const out = el("button", "hp-btn leave", "Leave room"); out.type = "button";
      out.addEventListener("click", async () => {
        out.disabled = true;
        await fetch("/api/host/logout", { method: "POST" }).catch(() => {});
        document.body.classList.add("hp-leaving");
        setTimeout(() => location.assign("/landing/?skip"), 380);
      });
      body.append(el("h3", "hp-h", "Leave"), out, el("p", "hp-note", "Signs you out and goes back to the front door. The room stays as it is."));
    }
    panel.replaceChildren(head, body);
  };
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
  addEventListener("keydown", (e) => { if (e.key === "Escape") open(false); });
})();
