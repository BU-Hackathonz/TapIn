// Flat, colourful people for the sign-in page: half-length figures over bold blocks, with hand-drawn doodles.
// Our own palette (sunflower, mint, sky, coral, lilac); everything is drawn here, no images.
const TapArt = (() => {
  const C = { sun: "#f7b928", mint: "#27b376", sky: "#3f7df0", coral: "#f2694f", lilac: "#9b7be8", ink: "#1d1d1f", paper: "#ffffff" };
  const SKIN = { a: "#f6cfb2", b: "#e2a882", c: "#b97a52", d: "#7d4e33", e: "#5a3826" };
  const HAIR = { black: "#1d1a1a", brown: "#5b3a24", gray: "#b9b5b0", auburn: "#9a3f22", blond: "#e2bc72" };

  // One person, drawn bottom-centre at (x, y), about 120 wide and 150 tall at s = 1.
  function person({ x = 0, y = 0, s = 1, skin = SKIN.b, hair = HAIR.black, style = "short", shirt = C.paper, pose = "front", beard = false, glasses = false, flip = false }) {
    const hairBack = {
      long: `<path d="M-30 -96c0-30 14-44 30-44s30 14 30 44v52h-60z" fill="${hair}"/>`,
      curly: `<g fill="${hair}"><circle cx="-24" cy="-104" r="14"/><circle cx="-10" cy="-120" r="15"/><circle cx="10" cy="-121" r="15"/><circle cx="25" cy="-106" r="14"/><circle cx="-28" cy="-88" r="11"/><circle cx="29" cy="-89" r="11"/></g>`,
    }[style] || "";
    const hairFront = {
      short: `<path d="M-23 -98c-2-24 10-34 23-34s27 9 23 34c-6-12-18-16-27-15-8 1-15 6-19 15z" fill="${hair}"/>`,
      long: `<path d="M-22 -100c2-20 12-28 24-28s22 8 22 26c-14-2-28-8-34-18-3 8-7 14-12 20z" fill="${hair}"/>`,
      curly: "",
      bun: `<circle cx="0" cy="-130" r="11" fill="${hair}"/><path d="M-23 -96c-1-22 10-32 23-32s24 10 23 32c-8-10-18-14-23-14s-15 4-23 14z" fill="${hair}"/>`,
      bald: `<path d="M-22 -92c0 -8 2-14 5-18M22 -92c0-8-2-14-5-18" stroke="${hair}" stroke-width="7" stroke-linecap="round" fill="none"/>`,
    }[style] || "";
    const face = `<g fill="none" stroke="${C.ink}" stroke-width="2.4" stroke-linecap="round">
        <path d="M-10 -96q3-3 6 0M5 -96q3-3 6 0"/><path d="M-5 -82q5 4 10 0"/></g>
      ${glasses ? `<g fill="none" stroke="${C.ink}" stroke-width="2"><circle cx="-8" cy="-95" r="6"/><circle cx="9" cy="-95" r="6"/><path d="M-2 -95h5"/></g>` : ""}
      ${beard ? `<path d="M-20 -92c2 20 10 26 20 26s18-6 20-26c-6 8-12 10-20 10s-14-2-20-10z" fill="${hair}"/>` : ""}`;
    const arms = {
      crossed: `<path d="M-40 -30c14 10 66 10 80 0v16c-14 10-66 10-80 0z" fill="${skin}"/><path d="M-44 -34c10-6 20-6 26 4l-6 14c-8-4-14-4-20 0z" fill="${shirt}" opacity="0.9"/><path d="M44 -34c-10-6-20-6-26 4l6 14c8-4 14-4 20 0z" fill="${shirt}" opacity="0.9"/>`,
      wave: `<path d="M38 -46c10-12 18-30 20-46" stroke="${shirt}" stroke-width="20" stroke-linecap="round" fill="none"/><ellipse cx="60" cy="-100" rx="9" ry="11" fill="${skin}"/>`,
      point: `<path d="M38 -44c16 0 32-6 44-14" stroke="${shirt}" stroke-width="18" stroke-linecap="round" fill="none"/><ellipse cx="88" cy="-62" rx="10" ry="7" fill="${skin}"/>`,
      badge: `<path d="M30 -30c12-4 22-14 28-26" stroke="${shirt}" stroke-width="18" stroke-linecap="round" fill="none"/><rect x="54" y="-82" width="18" height="26" rx="3" fill="${C.paper}" stroke="${C.ink}" stroke-width="2"/><ellipse cx="60" cy="-58" rx="9" ry="7" fill="${skin}"/>`,
    }[pose] || "";
    return `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})">
      ${hairBack}
      <path d="M-56 0c0-44 20-64 56-64s56 20 56 64z" fill="${shirt}" stroke="${shirt === C.paper ? C.ink : "none"}" stroke-width="2"/>
      <path d="M-10 -63l10 12 10-12" fill="none" stroke="${C.ink}" stroke-width="2" stroke-linejoin="round" opacity="0.5"/>
      <rect x="-9" y="-76" width="18" height="16" fill="${skin}"/>
      <ellipse cx="0" cy="-96" rx="22" ry="25" fill="${skin}"/>
      ${hairFront}${face}${arms}
    </g>`;
  }

  // Hand-drawn bits.
  const squiggle = (x, y, w = 60, color = C.ink) => {
    let d = `M${x} ${y}`;
    for (let i = 0; i < w; i += 10) d += ` q2.5 -6 5 0 t5 0`;
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/>`;
  };
  const scribble = (x, y, color = C.ink) => `<path d="M${x} ${y}c8-10 16 8 24-2s14 6 22-4M${x + 4} ${y + 10}c8-8 14 6 22-2" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>`;
  const hatch = (x, y, w, h, color) => {
    let lines = "";
    for (let i = -h; i < w; i += 8) lines += `<path d="M${x + i} ${y + h}l${h} ${-h}" stroke="${C.paper}" stroke-width="2" opacity="0.55"/>`;
    return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>${lines}</g>`;
  };
  const ring = (x, y, r, color) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${color}" stroke-width="2.4"/>`;
  const play = (x, y, color = C.ink) => `<path d="M${x} ${y}l14 9-14 9z" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/>`;
  const pill = (x, y, w, color) => `<rect x="${x}" y="${y}" width="${w}" height="18" rx="9" fill="${color}"/>`;

  // Scenes. Each is a full <svg>, 360 x 220, clipped to the card.
  const wrap = (inner, label) => `<svg viewBox="0 0 360 220" role="img" aria-label="${label}" class="art">
    <defs><clipPath id="artclip"><rect width="360" height="220" rx="18"/></clipPath></defs>
    <g clip-path="url(#artclip)"><rect width="360" height="220" fill="${C.paper}"/>${inner}</g></svg>`;

  const scenes = {
    trio: () => wrap(`
      <rect x="-10" y="0" width="140" height="150" rx="14" fill="${C.sun}"/>
      <rect x="128" y="70" width="120" height="160" rx="12" fill="${C.mint}"/>
      <rect x="248" y="28" width="130" height="200" rx="12" fill="${C.sky}"/>
      ${hatch(100, 168, 28, 28, C.coral)}
      ${pill(240, 18, 70, C.sun)}${ring(318, 176, 13, C.mint)}${play(258, 160)}
      ${person({ x: 64, y: 165, s: 0.95, skin: SKIN.c, hair: HAIR.black, style: "long", pose: "front" })}
      ${person({ x: 188, y: 228, s: 0.95, skin: SKIN.d, hair: HAIR.black, style: "short", pose: "crossed" })}
      ${person({ x: 304, y: 228, s: 0.95, skin: SKIN.a, hair: HAIR.gray, style: "bald", pose: "point", beard: true, glasses: true, shirt: C.ink, flip: true })}
      ${squiggle(30, 190, 60)}${scribble(300, 60, C.paper)}
    `, "Three people over coloured blocks"),
    tap: () => wrap(`
      <circle cx="120" cy="120" r="110" fill="${C.coral}"/>
      <rect x="228" y="40" width="96" height="150" rx="20" fill="${C.sky}"/>
      <rect x="250" y="66" width="52" height="74" rx="12" fill="${C.paper}"/>
      <circle cx="276" cy="96" r="11" fill="none" stroke="${C.ink}" stroke-width="2.4"/>
      <path d="M266 78a14 14 0 0 1 20 0" fill="none" stroke="${C.ink}" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="276" cy="126" r="4" fill="${C.mint}"/>
      ${ring(276, 96, 24, C.sun)}${ring(276, 96, 34, C.sun)}
      ${person({ x: 140, y: 228, s: 1.05, skin: SKIN.b, hair: HAIR.auburn, style: "bun", pose: "badge", shirt: C.sun })}
      ${squiggle(24, 30, 50)}${play(40, 180, C.paper)}${pill(300, 200, 60, C.mint)}
    `, "Someone tapping a badge on a station"),
    circle: () => wrap(`
      <rect width="360" height="220" fill="#f6f3ee"/>
      <path d="M60 110 L150 60 L240 110 L300 70 M150 60 L170 170 L240 110" stroke="${C.ink}" stroke-width="2" stroke-dasharray="2 7" stroke-linecap="round" fill="none"/>
      ${[[60, 110, C.sun, SKIN.c, HAIR.black, "curly"], [150, 60, C.mint, SKIN.a, HAIR.blond, "long"], [240, 110, C.sky, SKIN.d, HAIR.black, "short"],
         [300, 70, C.coral, SKIN.b, HAIR.brown, "bun"], [170, 170, C.lilac, SKIN.e, HAIR.black, "short"]].map(([x, y, bg, sk, hr, st]) =>
        `<g><clipPath id="face-${x}-${y}"><circle cx="${x}" cy="${y}" r="34"/></clipPath><circle cx="${x}" cy="${y}" r="34" fill="${bg}"/>
          <g clip-path="url(#face-${x}-${y})">${person({ x, y: y + 50, s: 0.55, skin: sk, hair: hr, style: st, shirt: C.paper })}</g></g>`).join("")}
      ${scribble(20, 190)}${ring(330, 180, 10, C.sky)}
    `, "Five faces in coloured circles, linked by dotted lines"),
    table: () => wrap(`
      <rect x="0" y="120" width="360" height="100" fill="${C.sky}"/>
      <rect x="40" y="24" width="90" height="60" rx="10" fill="${C.sun}"/>
      <rect x="250" y="20" width="80" height="80" rx="40" fill="${C.mint}"/>
      ${person({ x: 90, y: 178, s: 0.85, skin: SKIN.b, hair: HAIR.brown, style: "short", pose: "wave", shirt: C.coral })}
      ${person({ x: 180, y: 182, s: 0.9, skin: SKIN.d, hair: HAIR.black, style: "curly", shirt: C.paper })}
      ${person({ x: 272, y: 178, s: 0.85, skin: SKIN.a, hair: HAIR.blond, style: "long", shirt: C.lilac, flip: true })}
      <rect x="20" y="170" width="320" height="22" rx="6" fill="${C.paper}" stroke="${C.ink}" stroke-width="2"/>
      <rect x="150" y="160" width="30" height="12" rx="2" fill="${C.ink}"/>
      ${squiggle(40, 206, 80, C.paper)}${play(300, 200, C.paper)}
    `, "Three people at a table"),
  };

  // The front-page scene: someone taps a badge at a kiosk, a dotted trail of green dots runs to two people at a
  // table (one waves), over colour blocks with scribble textures. Wider than the others (520 x 400).
  const K = { sun: "#f2b33d", mint: "#27b376", grass: "#6a9a55", sky: "#7aa3ec", coral: "#e5583c", cream: "#fbf6ec", denim: "#2f6fe0" };
  // bare: no background rectangle, so the art sits straight on the page and its edges can fade into it.
  scenes.kiosk = (o = {}) => `<svg viewBox="0 0 520 400" role="img" aria-label="Someone taps a badge at a station; a dotted trail leads to two people at a table, one waving" class="art art-wide" preserveAspectRatio="xMidYMid slice">
<defs>
  <pattern id="k-p-wave" width="40" height="22" patternUnits="userSpaceOnUse"><path d="M0 11q5-8 10 0t10 0 10 0 10 0" fill="none" stroke="#3f6fd8" stroke-width="2" opacity=".7"/></pattern>
  <pattern id="k-p-scrib" width="46" height="46" patternUnits="userSpaceOnUse"><path d="M4 30c6-18 10 14 16-4s8 16 14-2 6 10 10 4" fill="none" stroke="#ffffff" stroke-width="1.6" opacity=".55"/></pattern>
  <pattern id="k-p-grass" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M4 26l4-16 4 16 4-16 4 16" fill="none" stroke="#3e6f33" stroke-width="1.6" opacity=".6"/></pattern>
  <pattern id="k-p-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0v10" stroke="#e5583c" stroke-width="2" opacity=".8"/></pattern>
  <pattern id="k-p-loop" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M6 30c0-14 18-14 18 0s-18 6-10-8 22-4 20 6" fill="none" stroke="#ffffff" stroke-width="1.6" opacity=".5"/></pattern>
</defs>
${o.bare ? "" : `<rect width="520" height="400" fill="${K.cream}"/>`}
<!-- colour blocks -->
<rect x="40" y="40" width="160" height="150" fill="${K.sky}"/><rect x="40" y="40" width="160" height="150" fill="url(#k-p-wave)"/>
<circle cx="300" cy="40" r="66" fill="${K.sky}" opacity=".85"/><circle cx="300" cy="40" r="66" fill="url(#k-p-wave)"/>
<circle cx="430" cy="0" r="64" fill="${K.coral}"/>
<rect x="390" y="0" width="130" height="120" fill="${K.grass}"/><rect x="390" y="0" width="130" height="120" fill="url(#k-p-grass)"/>
<rect x="410" y="110" width="110" height="60" fill="${K.coral}"/><rect x="410" y="110" width="110" height="60" fill="url(#k-p-scrib)"/>
<rect x="420" y="170" width="100" height="150" fill="${K.sun}"/>
<rect x="0" y="150" width="70" height="160" fill="${K.coral}"/><rect x="0" y="150" width="70" height="160" fill="url(#k-p-loop)"/>
<rect x="190" y="300" width="190" height="100" fill="${K.grass}"/><rect x="190" y="300" width="190" height="100" fill="url(#k-p-loop)"/>
<rect x="80" y="350" width="130" height="50" fill="${K.sun}"/><rect x="80" y="350" width="130" height="50" fill="url(#k-p-hatch)"/>

<!-- doodles -->
<g fill="none" stroke="${C.ink}" stroke-width="2" stroke-linecap="round">
  <path d="M120 24c4-8 10 6 14-2s10 6 14-2"/><path d="M470 362c4-6 9 4 13-2s9 4 13-2"/>
  <path d="M26 118l8-10M22 128l12-6"/><path d="M500 210l10-6M502 222l12 0"/>
  <path d="M150 300c-8 6 6 14-2 20s6 14 0 18"/>
</g>

<!-- dotted trail from the kiosk to the table, with green dots -->
<path d="M226 186 C 250 210 270 160 276 132 C 282 98 250 92 252 120 C 254 150 300 170 330 150 C 356 132 372 140 392 128"
      fill="none" stroke="${C.ink}" stroke-width="2.2" stroke-dasharray="6 6" stroke-linecap="round"/>
<g fill="${K.mint}"><circle cx="232" cy="190" r="7"/><circle cx="258" cy="140" r="7"/><circle cx="314" cy="116" r="7"/><circle cx="348" cy="128" r="7"/></g>

<!-- kiosk -->
<g stroke="${C.ink}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none">
  <path d="M206 222v130M186 354h40"/>
  <g transform="rotate(-14 210 190)"><rect x="180" y="164" width="58" height="44" rx="5" fill="${C.paper}"/><rect x="186" y="170" width="46" height="32" rx="2" fill="${C.ink}"/></g>
  <path d="M206 140a12 12 0 0 1 16 4M200 132a22 22 0 0 1 28 8"/>
</g>

<!-- woman tapping her badge -->
<g stroke="${C.ink}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
  <path d="M78 74c-22 4-26 34-12 48 8 8 20 8 30 2 6 14 24 14 30 2 8-14-2-34-18-40-6-12-20-16-30-12z" fill="${C.ink}" stroke="none"/>
  <path d="M104 236l-6 118h24l14-96 6 96h22l-6-118z" fill="${K.denim}"/>
  <path d="M96 354h26l2 12h-32zM142 354h24l2 12h-30z" fill="${C.ink}"/>
  <path d="M100 134c-14 6-22 30-18 66s14 48 22 44h44c8-24 4-62-6-90-6-16-24-26-42-20z" fill="${C.paper}"/>
  <path d="M110 126h20v14h-20z" fill="${C.paper}"/>
  <ellipse cx="120" cy="104" rx="16" ry="19" fill="#9b6243" stroke="none"/>
  <path d="M104 96c4-14 26-18 32-4-10-4-22-2-32 4z" fill="${C.ink}" stroke="none"/>
  <path d="M120 112q5 3 9-1" fill="none" stroke-width="1.6"/>
  <path d="M138 162c18 16 36 22 52 24" fill="none" stroke-width="14" stroke="${C.ink}"/>
  <path d="M138 162c18 16 36 22 52 24" fill="none" stroke-width="10" stroke="${C.paper}"/>
  <ellipse cx="192" cy="186" rx="7" ry="6" fill="#9b6243" stroke="none"/>
  <rect x="190" y="172" width="22" height="15" rx="2" fill="${C.paper}" transform="rotate(-14 200 180)"/>
</g>

<!-- table, chairs -->
<g stroke="${C.ink}" stroke-width="2.2" stroke-linecap="round" fill="none">
  <path d="M330 266h150M342 266l-10 96M468 266l10 96"/>
  <path d="M470 248v80h40M470 290h40M510 248v120M440 290v78"/>
</g>
<!-- man, waving, green sweater -->
<g stroke="${C.ink}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
  <path d="M356 262l-8 70h18l10-50 34 0 4 50h18l-4-70z" fill="${C.ink}"/>
  <path d="M346 332h22l2 10h-26zM400 332h22l2 10h-26z" fill="${C.paper}"/>
  <path d="M350 192c-10 6-10 46-6 72h64c4-30 2-60-8-70-12-10-36-10-50-2z" fill="${K.mint}"/>
  <path d="M362 190l12 10 12-10" fill="${C.paper}"/>
  <ellipse cx="374" cy="170" rx="14" ry="17" fill="#d79a72" stroke="none"/>
  <path d="M360 164c0-16 28-18 30-2-8-6-20-6-30 2z" fill="${C.ink}" stroke="none"/>
  <path d="M370 178q5 3 9-1" fill="none" stroke-width="1.6"/>
  <path d="M350 200c-12-6-22-26-24-46" fill="none" stroke-width="14"/>
  <path d="M350 200c-12-6-22-26-24-46" fill="none" stroke-width="10" stroke="${K.mint}"/>
  <path d="M318 150c-4-12 0-24 4-26M324 150c0-14 4-24 8-24M330 152c2-12 6-20 10-18M334 156c4-8 10-10 12-6" fill="none" stroke-width="2"/>
  <path d="M316 154c4 6 14 8 22 2" fill="#d79a72" stroke="none"/>
  <path d="M306 128l-6-4M310 120l-4-8M318 116l0-8" fill="none" stroke-width="1.8"/>
</g>
<!-- woman with laptop, coral sweater -->
<g stroke="${C.ink}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
  <path d="M432 262l-6 70h18l8-50 30 0 2 50h18l-2-70z" fill="${K.sun}"/>
  <path d="M424 332h22l2 10h-26zM474 332h22l2 10h-26z" fill="${C.ink}"/>
  <path d="M430 192c-10 8-10 46-6 72h60c4-30 2-58-8-68-12-12-34-12-46-4z" fill="${K.coral}"/>
  <path d="M428 176c-6-26 10-40 26-38 18 2 26 18 20 40-2 10-6 18-6 26h-34c0-10-2-18-6-28z" fill="#8a4a2c" stroke="none"/>
  <ellipse cx="452" cy="170" rx="13" ry="16" fill="#f0c4a2" stroke="none"/>
  <path d="M440 160c6-10 20-10 26 2-8-6-18-6-26-2z" fill="#8a4a2c" stroke="none"/>
  <path d="M448 178q5 3 9-1" fill="none" stroke-width="1.6"/>
  <path d="M396 236h44l8 30h-60z" fill="${C.paper}"/>
</g>
</svg>`;

  // Logo layouts: the name is the logo, no icon.
  const logos = {
    classic: () => `<span class="lg lg-classic">Tap In</span>`,
    twotone: () => `<span class="lg lg-twotone">Tap<b>In</b></span>`,
    dot: () => `<span class="lg lg-dot">tap in<i></i></span>`,
    stacked: () => `<span class="lg lg-stacked">Tap<br>In<svg viewBox="0 0 80 12" aria-hidden="true"><path d="M2 8q5-8 10 0t10 0 10 0 10 0 10 0 10 0 10 0" fill="none" stroke="${C.coral}" stroke-width="3" stroke-linecap="round"/></svg></span>`,
    // the dot of the i is a little signal: the tap
    wifi: () => `<span class="lg lg-wifi">tap <span class="lg-i">ı<svg viewBox="0 0 24 20" aria-hidden="true"><path d="M3 8a13 13 0 0 1 18 0" stroke="${C.mint}"/><path d="M7 12a7.5 7.5 0 0 1 10 0" stroke="${C.mint}"/><circle cx="12" cy="16" r="2.6" fill="currentColor" stroke="none"/></svg></span>n</span>`,
    colours: () => `<span class="lg lg-colours"><span style="color:${C.sky}">T</span><span style="color:${C.coral}">a</span><span style="color:${C.sun}">p</span> <span style="color:${C.mint}">I</span><span style="color:${C.lilac}">n</span></span>`,
  };

  return { scenes, logos, C };
})();
