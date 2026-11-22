// The host screen's Boston T style across the client side (sign-in, room map, corner tab, table card, table server).
// Five mockups: ?mk=1 Platform (David's default), 2 Wayfinding (black sign), 3 Line colours, 4 Red line, 5 Quiet.
// The choice is kept in localStorage("wall.mk") so it carries from the sign-in to the room; pages shown inside a frame
// (the mockups gallery) don't save it. ?mk=0 turns the T look off. Loads before themes.js and login.js.
const TLook = (() => {
  const q = new URLSearchParams(location.search);
  const framed = window.top !== window;
  let mk = null;
  if (q.has("mk")) {
    mk = /^[1-5]$/.test(q.get("mk")) ? q.get("mk") : "0";
    if (!framed) { try { localStorage.setItem("wall.mk", mk); } catch { /* private mode */ } }
  } else {
    try { mk = localStorage.getItem("wall.mk"); } catch { /* private mode */ }
  }
  if (!/^[0-5]$/.test(mk || "")) mk = "1";              // David's look is the default
  if (mk !== "0") document.documentElement.dataset.mk = mk;
  return {
    get mk() { return mk === "0" ? null : mk; },
    theme: () => (mk === "0" ? null : `t${mk}`),
    names: { 1: "Platform", 2: "Wayfinding", 3: "Line colours", 4: "Red line", 5: "Quiet" },
  };
})();
