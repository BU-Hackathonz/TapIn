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

  // Logo layouts: the name is the logo, no icon.
  const logos = {
    classic: () => `<span class="lg lg-classic">Tap In</span>`,
    twotone: () => `<span class="lg lg-twotone">Tap<b>In</b></span>`,
    dot: () => `<span class="lg lg-dot">tap in<i></i></span>`,
    stacked: () => `<span class="lg lg-stacked">Tap<br>In<svg viewBox="0 0 80 12" aria-hidden="true"><path d="M2 8q5-8 10 0t10 0 10 0 10 0 10 0 10 0 10 0" fill="none" stroke="${C.coral}" stroke-width="3" stroke-linecap="round"/></svg></span>`,
    colours: () => `<span class="lg lg-colours"><span style="color:${C.sky}">T</span><span style="color:${C.coral}">a</span><span style="color:${C.sun}">p</span> <span style="color:${C.mint}">I</span><span style="color:${C.lilac}">n</span></span>`,
  };

  return { scenes, logos, C };
})();
