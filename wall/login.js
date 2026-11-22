// Sign-in prototype: five short steps, then Join a room / Host an event. Saves to localStorage("wall.me") so the wall's
// You tab shows this profile. Nothing leaves the browser.
(() => {
  const SKILLS = ["hardware", "firmware", "frontend", "backend", "design", "ml", "data", "mobile", "pitch", "research"];
  const SCHOOLS = ["Boston University", "Northeastern University", "MIT", "Harvard University", "Boston College",
    "Tufts University", "Emerson College", "Suffolk University", "Wentworth Institute of Technology",
    "UMass Boston", "Berklee College of Music", "Simmons University", "Brandeis University", "Bentley University",
    "Massachusetts College of Art and Design", "Babson College", "Olin College of Engineering", "Other"];
  const APPS = [
    { k: "linkedin", label: "LinkedIn", hint: "linkedin.com/in/…" },
    { k: "github", label: "GitHub", hint: "github username" },
    { k: "instagram", label: "Instagram", hint: "@handle" },
    { k: "web", label: "Website", hint: "yoursite.com" },
  ];
  const LAST = 5;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("wall.me") || "null"); } catch { /* private mode */ }
  const me = Object.assign({ name: "", role: "student", bio: "", school: "", major: "", year: 2027,
                             skills: [], looking_for: [], links: {}, face: `face-${Date.now()}` }, saved || {});
  let step = 0;

  // ---------------------------------------------------------- steps

  // Signed in before on this device: offer to go straight back in.
  function showBack() {
    document.body.classList.add("at-start");
    for (const s of document.querySelectorAll(".step")) s.hidden = s.dataset.step !== "back";
    $("dots").hidden = true;
    $("nav").hidden = true;
    $("back-face").src = me.photo || View3D.avatar(person()).toDataURL();
    $("back-title").textContent = `Welcome back, ${me.name}`;
    $("back-sub").textContent = [me.school, me.major].filter(Boolean).join(" · ") || "Your profile is saved on this device.";
  }
  $("back-edit").addEventListener("click", () => show(1));
  $("back-out").addEventListener("click", () => {
    try { localStorage.removeItem("wall.me"); } catch { /* private mode */ }
    location.replace("login.html");
  });

  function show(n) {
    step = Math.max(0, Math.min(LAST, n));
    document.body.classList.toggle("at-start", step === 0);
    for (const s of document.querySelectorAll(".step")) s.hidden = Number(s.dataset.step) !== step || s.dataset.step === "back";
    $("dots").replaceChildren(...Array.from({ length: LAST }, (_, i) => el("li", i < step ? "done" : i === step - 1 ? "on" : "")));
    $("dots").hidden = step === 0;
    $("nav").hidden = step === 0 || step === LAST;
    $("next").textContent = step === LAST - 1 ? "Finish" : "Next";
    if (step === 1) refreshFace();
    if (step === LAST) finish();
    document.querySelector(`.step[data-step="${step}"] input, .step[data-step="${step}"] button`)?.focus({ preventScroll: true });
  }

  function next() {
    if (step === 1) {
      // nothing is required: an empty name just becomes Guest
      me.name = $("name").value.trim() || "Guest";
      me.bio = $("bio").value.trim();
    }
    if (step === 2) { me.school = $("school").value.trim(); me.major = $("major").value.trim(); }
    if (step === 4) readApps();
    show(step + 1);
  }

  // ---------------------------------------------------------- about you

  const person = () => ({ id: -1, name: me.name || "You", face: me.face, photo: me.photo });
  function refreshFace() {
    $("face").src = me.photo || View3D.avatar(person()).toDataURL();
    $("shuffle").textContent = me.photo ? "Use a drawn face" : "Shuffle drawn face";
  }
  $("shuffle").addEventListener("click", () => {
    if (me.photo) delete me.photo;
    else me.face = `face-${Math.random().toString(36).slice(2)}`;
    refreshFace();
  });

  // Photo from the camera or the gallery: centre-cropped to a square, 256 px JPEG, kept in this browser only.
  const PIC = 256;
  function usePhoto(file) {
    $("pic-err").hidden = true;
    if (!file || !file.type.startsWith("image/")) { $("pic-err").hidden = !file; return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const c = document.createElement("canvas");
      c.width = c.height = PIC;
      c.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, PIC, PIC);
      me.photo = c.toDataURL("image/jpeg", 0.85);
      URL.revokeObjectURL(url);
      refreshFace();
    };
    img.onerror = () => { URL.revokeObjectURL(url); $("pic-err").hidden = false; };
    img.src = url;
  }
  for (const id of ["camera", "gallery"]) {
    $(id).addEventListener("change", (e) => { usePhoto(e.target.files[0]); e.target.value = ""; });
  }
  // Only phones and tablets can open the camera straight from a page; elsewhere one upload button is enough.
  if (!matchMedia("(pointer: coarse)").matches) {
    $("camera-btn").hidden = true;
    $("gallery-label").textContent = "Upload a photo";
  }
  for (const b of $("role").children) {
    b.addEventListener("click", () => {
      me.role = b.dataset.v;
      for (const o of $("role").children) o.setAttribute("aria-checked", String(o === b));
    });
  }

  // ---------------------------------------------------------- school

  function suggest() {
    const q = $("school").value.trim().toLowerCase(), list = $("school-list");
    const hits = q ? SCHOOLS.filter((s) => s.toLowerCase().includes(q)).slice(0, 6) : [];
    list.replaceChildren(...hits.map((s) => {
      const li = el("li", "", s);
      li.setAttribute("role", "option");
      li.addEventListener("mousedown", (e) => { e.preventDefault(); $("school").value = s; list.replaceChildren(); $("major").focus(); });
      return li;
    }));
  }
  $("school").addEventListener("input", suggest);
  $("school").addEventListener("blur", () => setTimeout(() => $("school-list").replaceChildren(), 100));
  for (let y = 2026; y <= 2030; y++) {
    const b = el("button", "chip", String(y));
    b.type = "button";
    b.addEventListener("click", () => { me.year = y; markYear(); });
    $("year").append(b);
  }
  const markYear = () => { for (const b of $("year").children) b.classList.toggle("on", Number(b.textContent) === me.year); };

  // ---------------------------------------------------------- skills

  function chipGroup(id, key, max, countId, label) {
    const box = $(id);
    const mark = () => {
      for (const b of box.children) {
        const on = me[key].includes(b.dataset.v);
        b.classList.toggle("on", on);
        b.disabled = !on && me[key].length >= max;
      }
      $(countId).textContent = me[key].length ? `${me[key].length} of ${max}` : `pick up to ${max}`;
    };
    for (const s of SKILLS) {
      const b = el("button", "chip", s);
      b.type = "button";
      b.dataset.v = s;
      b.setAttribute("aria-label", `${label}: ${s}`);
      b.addEventListener("click", () => {
        me[key] = me[key].includes(s) ? me[key].filter((x) => x !== s) : [...me[key], s];
        mark();
      });
      box.append(b);
    }
    mark();
  }

  // ---------------------------------------------------------- link apps

  function renderApps() {
    $("apps").replaceChildren(...APPS.map((a) => {
      const icon = View3D.socialIcon(a.k), row = el("div", "app");
      const logo = el("span", "logo");
      logo.style.background = icon.bg;
      logo.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${icon.svg}</svg>`;   // static icon markup
      const input = el("input");
      input.type = "text";
      input.placeholder = a.hint;
      input.maxLength = 80;
      input.value = me.links[a.k] || "";
      input.dataset.k = a.k;
      input.setAttribute("aria-label", `${a.label} handle`);
      const btn = el("button", "connect", me.links[a.k] ? "Linked" : "Link");
      btn.type = "button";
      row.classList.toggle("linked", !!me.links[a.k]);
      const status = el("small", "", me.links[a.k] || "Not linked");
      btn.addEventListener("click", () => {
        if (row.classList.contains("open") && input.value.trim()) {
          me.links[a.k] = input.value.trim();
          row.classList.remove("open"); row.classList.add("linked"); btn.textContent = "Linked";
          status.textContent = me.links[a.k];
        } else if (row.classList.contains("linked")) {
          delete me.links[a.k]; input.value = "";
          row.classList.remove("linked"); btn.textContent = "Link";
          status.textContent = "Not linked";
        } else {
          row.classList.add("open"); btn.textContent = "Save"; input.focus();
        }
      });
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); btn.click(); } });
      const name = el("span", "name");
      name.append(el("b", "", a.label), status);
      row.append(logo, name, btn, input);
      return row;
    }));
  }
  function readApps() {
    for (const input of $("apps").querySelectorAll("input")) {
      const v = input.value.trim();
      if (v) me.links[input.dataset.k] = v;
    }
  }

  // ---------------------------------------------------------- done

  function finish() {
    const profile = { name: me.name, role: me.role, bio: me.bio || undefined, school: me.school, major: me.major,
                      year: me.year, skills: me.skills, looking_for: me.looking_for, face: me.face, photo: me.photo,
                      links: me.links, socials: Object.keys(me.links) };
    try { localStorage.setItem("wall.me", JSON.stringify(profile)); } catch { /* private mode or full: carry on without saving */ }
    // Last thing before the room: join one (badge tap) or host your own. Either one leads into the room.
    Room.chooser({ into: $("room-slot"), bare: true, onDone: () => { if (typeof TapLoading !== "undefined") TapLoading.go("index.html"); else location.href = "index.html"; } });
  }

  // ---------------------------------------------------------- wire up

  for (const b of document.querySelectorAll("[data-next]")) b.addEventListener("click", next);
  // One tap, no questions: a guest profile with a drawn face, straight into the room.
  $("guest").addEventListener("click", () => {
    me.name = me.name || "Guest";
    show(LAST);   // straight to All set, which ends with Join a room / Host an event
  });
  $("email-form").addEventListener("submit", (e) => { e.preventDefault(); next(); });
  $("next").addEventListener("click", next);
  $("prev").addEventListener("click", () => show(step - 1));
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "name") { e.preventDefault(); next(); } });

  // Front page art: the name is the logo. ?art=trio|tap|circle|table and ?logo=classic|twotone|dot|stacked|colours
  // preview the other mockups (see mockups/brand.html).
  // ?layout=1..5 picks the page layout (split, split mirrored, banner, card on art, logo first).
  {
    const q = new URLSearchParams(location.search);
    const art = TapArt.scenes[q.get("art")], logo = TapArt.logos[q.get("logo")] || TapArt.logos.wifi;
    const layout = ["1", "2", "3", "4", "5"].includes(q.get("layout")) ? q.get("layout") : "1";
    document.body.className = document.body.className.replace(/layout-\d/, `layout-${layout}`);
    // The front-page picture is the original illustration, unchanged, with its cut-off shapes finished around it
    // (TapArt.photo). No panel and no fade: the page is the picture's cream. ?art=<scene> swaps in a drawn mockup.
    if (art) {
      $("hero").innerHTML = art({ bare: true });     // drawn by art.js from fixed shapes, no user text
      const svg = $("hero").querySelector("svg");
      if (svg) { svg.setAttribute("preserveAspectRatio", "xMidYMid meet"); svg.classList.add("art-blend"); }
    } else if (q.get("scene") !== "kiosk" && typeof PixelBoston !== "undefined") {
      // the pixel front page: a pixel Boston with a train behind a pixel menu (pixel.js); ?scene=kiosk for the picture
      document.body.classList.add("scene-pixel");
      PixelBoston.mount($("hero"));
      // the same moving pixel Boston fills the whole background behind the window
      const back = document.createElement("div");
      back.className = "px-backdrop"; back.setAttribute("aria-hidden", "true");
      document.body.prepend(back);
      PixelBoston.mount(back);
    } else {
      $("hero").innerHTML = TapArt.photo("img/kiosk.webp", "Someone taps a badge at a station; a dotted trail leads to two people at a table, one waving");
    }
    // David's wordmark (host.html): heavy Bricolage "tap in" with a red Wi-Fi dot on the i
    $("brand").innerHTML = q.get("logo") ? logo() : '<span class="wm" role="img" aria-label="Tap In">tap <span class="ii">&#305;<svg class="wifi" viewBox="0 0 24 20" aria-hidden="true"><circle cx="12" cy="16.6" r="2.3"/><path d="M6.6 11.6a7.6 7.6 0 0 1 10.8 0"/><path d="M2.9 7.4a12.8 12.8 0 0 1 18.2 0"/></svg></span>n</span>';
    $("brand-art").innerHTML = logo();
    // The host screen's style (hostlook.css): same picture, logo and layout, restyled; ?mk=1..5 picks the mockup
    // (tlook.js), ?mk=0 or ?look=classic shows the old style.
    if (q.get("look") !== "classic" && typeof TLook !== "undefined" && TLook.mk && typeof HostLook !== "undefined") HostLook.apply();
  }
  $("name").value = me.name;
  $("bio").value = me.bio || "";
  $("school").value = me.school;
  $("major").value = me.major;
  for (const o of $("role").children) o.setAttribute("aria-checked", String(o.dataset.v === me.role));
  markYear();
  chipGroup("skills", "skills", 3, "skills-count", "Skill");
  chipGroup("looking", "looking_for", 2, "looking-count", "Looking for");
  renderApps();
  // Remembered sign-in: straight to "welcome back", or to editing when the wall's Edit link sent us here.
  // Signed out, "← Room" would just bounce back here, so it only shows once there's a profile.
  document.querySelector(".back").hidden = !saved;
  if (saved && new URLSearchParams(location.search).has("edit")) show(1);
  else if (saved) showBack();
  else show(0);
})();
