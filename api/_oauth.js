// Shared sign-in flow for Continue with Google / GitHub (Vercel functions on tapin.boston).
// GET /api/auth/<provider>?next=/landing/  -> sends you to the provider (a random state rides in a short-lived cookie)
// GET /api/auth/<provider>?code=..&state=.. -> the provider sends you back here: the code is traded for your profile
//   server-side (the client secret never reaches a browser), then a tiny page saves it as this browser's "wall.me"
//   (the same profile the join page's badge log-in writes) and goes on to `next`.
// Env (Vercel project settings): GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// optional PUBLIC_URL (default https://tapin.boston). Callback URLs to register: <PUBLIC_URL>/api/auth/github and /api/auth/google.
const crypto = require("crypto");

const BASE = (process.env.PUBLIC_URL || "https://tapin.boston").replace(/\/+$/, "");
const COOKIE = "tapin_oauth";

const PROVIDERS = {
  github: {
    label: "GitHub",
    id: () => process.env.GITHUB_CLIENT_ID, secret: () => process.env.GITHUB_CLIENT_SECRET,
    authorize: "https://github.com/login/oauth/authorize", scope: "read:user user:email",
    async profile(code, redirect) {
      const t = await post("https://github.com/login/oauth/access_token",
        { client_id: this.id(), client_secret: this.secret(), code, redirect_uri: redirect });
      if (!t.access_token) throw new Error(t.error_description || "no access token");
      const h = { authorization: `Bearer ${t.access_token}`, accept: "application/vnd.github+json", "user-agent": "tapin-login" };
      const u = await (await fetch("https://api.github.com/user", { headers: h })).json();
      let email = u.email;
      if (!email) {
        try { const list = await (await fetch("https://api.github.com/user/emails", { headers: h })).json(); email = (list.find((e) => e.primary && e.verified) || {}).email; } catch { /* email stays empty */ }
      }
      return { name: u.name || u.login, photo: u.avatar_url, email, oauth: `github:${u.id}`, links: u.login ? { github: `github.com/${u.login}` } : {} };
    },
  },
  google: {
    label: "Google",
    id: () => process.env.GOOGLE_CLIENT_ID, secret: () => process.env.GOOGLE_CLIENT_SECRET,
    authorize: "https://accounts.google.com/o/oauth2/v2/auth", scope: "openid email profile", extra: { prompt: "select_account" },
    async profile(code, redirect) {
      const t = await post("https://oauth2.googleapis.com/token",
        { client_id: this.id(), client_secret: this.secret(), code, redirect_uri: redirect, grant_type: "authorization_code" });
      if (!t.access_token) throw new Error(t.error_description || t.error || "no access token");
      const u = await (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${t.access_token}` } })).json();
      return { name: u.given_name || u.name, photo: u.picture, email: u.email_verified === false ? undefined : u.email, oauth: `google:${u.sub}`, links: {} };
    },
  },
};

async function post(url, body) {
  const r = await fetch(url, { method: "POST", headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  return r.json();
}
const safeNext = (n) => (typeof n === "string" && /^\/(?!\/)[\w\-./?=&%#]*$/.test(n) ? n : "/landing/");
const cookies = (req) => Object.fromEntries((req.headers.cookie || "").split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf("="); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function page(res, status, title, body) {
  res.statusCode = status;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#ecd9d2;font:16px/1.4 "Helvetica Neue",Arial,sans-serif;color:#2b1f23}
main{max-width:420px;margin:16px;padding:24px;background:#fff;border:2px solid #111;box-shadow:6px 6px 0 #111}h1{margin:0 0 8px;font-size:22px}
a{display:inline-block;margin-top:12px;padding:9px 14px;background:#111;color:#ffb000;text-decoration:none;text-transform:uppercase;letter-spacing:.05em;font-size:14px}</style>
</head><body><main>${body}</main></body></html>`);
}
const fail = (res, why) => page(res, 400, "Couldn't sign you in",
  `<h1>Couldn't sign you in</h1><p>${esc(why)}</p><a href="/wall/join.html?login">Try again</a>`);

module.exports = (key) => async (req, res) => {
  const P = PROVIDERS[key];
  const q = new URL(req.url, BASE).searchParams;
  const redirect = `${BASE}/api/auth/${key}`;
  if (!P.id() || !P.secret()) return page(res, 503, "Not set up yet", `<h1>${P.label} log-in isn't set up yet</h1><p>Use your badge to log in for now.</p><a href="/wall/join.html?login">Back</a>`);

  // 1) start: off to the provider. Start on the callback's own host (www.tapin.boston -> tapin.boston), or the state
  // cookie set here wouldn't come back with the provider's redirect.
  if (!q.get("code") && !q.get("error")) {
    const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toLowerCase();
    if (host && host !== new URL(BASE).host) { res.statusCode = 302; res.setHeader("location", BASE + req.url); return res.end(); }
    const state = crypto.randomBytes(16).toString("hex");
    const next = safeNext(q.get("next"));
    res.setHeader("set-cookie", `${COOKIE}=${encodeURIComponent(`${key}|${state}|${next}`)}; Path=/api/auth; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);
    const url = new URL(P.authorize);
    for (const [k, v] of Object.entries({ client_id: P.id(), redirect_uri: redirect, response_type: "code", scope: P.scope, state, ...(P.extra || {}) })) url.searchParams.set(k, v);
    res.statusCode = 302; res.setHeader("location", url.toString()); res.setHeader("cache-control", "no-store");
    return res.end();
  }

  // 2) back from the provider
  const [ck, cstate, cnext] = (cookies(req)[COOKIE] || "").split("|");
  res.setHeader("set-cookie", `${COOKIE}=; Path=/api/auth; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  if (q.get("error")) return fail(res, q.get("error") === "access_denied" ? "You cancelled the sign-in." : `${P.label} said: ${q.get("error")}`);
  if (ck !== key || !cstate || cstate !== q.get("state")) return fail(res, "This sign-in link expired or was opened in another browser. Start again from the log-in page.");
  let prof;
  try { prof = await P.profile(q.get("code"), redirect); } catch (e) { return fail(res, `${P.label} didn't confirm who you are (${e.message}).`); }
  const name = String(prof.name || "Guest").trim().split(/\s+/)[0].slice(0, 30) || "Guest";
  const me = { name, photo: prof.photo || undefined, email: prof.email || undefined, via: P.label, oauth: prof.oauth, links: prof.links };
  // JSON inside a <script>: escape "<" so nothing in a name can close the tag
  const json = JSON.stringify(me).replace(/</g, "\\u003c");
  return page(res, 200, "Signed in", `<h1>Signed in as ${esc(name)}</h1><p>Taking you back…</p><a href="${esc(safeNext(cnext))}">Continue</a>
<script>(function(){var m=${json},p={};try{p=JSON.parse(localStorage.getItem("wall.me")||"null")||{}}catch(e){}
var n=Object.assign({},p,m,{role:p.role||"student",face:p.face||("face-"+Date.now()),links:Object.assign({},p.links||{},m.links||{})});
if(p.person_id!=null&&p.oauth&&p.oauth!==m.oauth){delete n.person_id}
try{localStorage.setItem("wall.me",JSON.stringify(n))}catch(e){}location.replace(${JSON.stringify(safeNext(cnext))})})();</script>`);
};
