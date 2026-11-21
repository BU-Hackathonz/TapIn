// Sign-in prototype: five short steps, then a preview. Saves to localStorage("wall.me") so the wall's
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

  function show(n) {
    step = Math.max(0, Math.min(LAST, n));
    for (const s of document.querySelectorAll(".step")) s.hidden = Number(s.dataset.step) !== step;
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
      me.name = $("name").value.trim();
      me.bio = $("bio").value.trim();
      $("name-err").hidden = !!me.name;
      if (!me.name) { $("name").focus(); return; }
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
  $("name").addEventListener("input", () => { $("name-err").hidden = true; });
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

  let timer = null;
  function finish() {
    const profile = { name: me.name, role: me.role, bio: me.bio || undefined, school: me.school, major: me.major,
                      year: me.year, skills: me.skills, looking_for: me.looking_for, face: me.face, photo: me.photo,
                      links: me.links, socials: Object.keys(me.links) };
    try { localStorage.setItem("wall.me", JSON.stringify(profile)); } catch { /* private mode or full: still show the preview */ }
    const card = $("preview");
    const pic = el("img", "face");
    pic.src = me.photo || View3D.avatar(person()).toDataURL();
    pic.alt = "";
    const text = el("div");
    text.append(el("b", "", me.name));
    text.append(el("span", "", [me.school, me.major, me.year ? `'${String(me.year).slice(2)}` : ""].filter(Boolean).join(" · ") || me.role));
    const chips = el("div", "chips small");
    for (const s of me.skills) chips.append(el("span", "chip on", s));
    for (const s of me.looking_for) chips.append(el("span", "chip want", `wants ${s}`));
    const apps = el("div", "mini-apps");
    for (const k of Object.keys(me.links)) {
      const icon = View3D.socialIcon(k), s = el("span", "logo sm");
      s.style.background = icon.bg;
      s.title = `${me.links[k]}`;
      s.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">${icon.svg}</svg>`;   // static icon markup
      apps.append(s);
    }
    const head = el("div", "pv-head");
    head.append(pic, text);
    card.replaceChildren(head, chips, apps);
    // mock badge claim: the real one is POST /api/signup then a tap within 30 s
    let left = 30;
    clearInterval(timer);
    timer = setInterval(() => {
      left -= 1;
      $("countdown").textContent = left > 0 ? `within ${left} s to link it to you` : "Linked (mock). See you in the room!";
      if (left <= 0) clearInterval(timer);
    }, 1000);
  }

  // ---------------------------------------------------------- wire up

  for (const b of document.querySelectorAll("[data-next]")) b.addEventListener("click", next);
  $("email-form").addEventListener("submit", (e) => { e.preventDefault(); next(); });
  $("next").addEventListener("click", next);
  $("prev").addEventListener("click", () => show(step - 1));
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "name") { e.preventDefault(); next(); } });

  $("name").value = me.name;
  $("bio").value = me.bio || "";
  $("school").value = me.school;
  $("major").value = me.major;
  for (const o of $("role").children) o.setAttribute("aria-checked", String(o.dataset.v === me.role));
  markYear();
  chipGroup("skills", "skills", 3, "skills-count", "Skill");
  chipGroup("looking", "looking_for", 2, "looking-count", "Looking for");
  renderApps();
  show(0);
})();
