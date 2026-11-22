// Shared sign-in flow for Continue with Google / GitHub (Vercel functions on tapin.boston).
// GET /api/auth/<provider>?next=/landing/  -> sends you to the provider (a random state rides in a short-lived cookie)
// GET /api/auth/<provider>?code=..&state=.. -> the provider sends you back here: the code is traded for your profile
//   server-side (the client secret never reaches a browser), then a tiny page saves it as this browser's "wall.me"
//   (the same profile the join page's badge log-in writes) and goes on to `next`.
// Env (Vercel project settings): GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// optional PUBLIC_URL (default https://www.tapin.boston: the bare domain redirects there). Callback URLs to register: <PUBLIC_URL>/api/auth/github and /api/auth/google.
const crypto = require("crypto");
const DB = require("./_db");

const BASE = (process.env.PUBLIC_URL || "https://www.tapin.boston").replace(/\/+$/, "");
const COOKIE = "tapin_oauth";
// keys pasted into Vercel can carry a stray newline or space (GitHub then answers 404): trim them
const env = (k) => (process.env[k] || "").trim();

const PROVIDERS = {
  github: {
    label: "GitHub",
    id: () => env("GITHUB_CLIENT_ID"), secret: () => env("GITHUB_CLIENT_SECRET"),
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
    id: () => env("GOOGLE_CLIENT_ID"), secret: () => env("GOOGLE_CLIENT_SECRET"),
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

  // 1) start: off to the provider. Start on the callback's own host (tapin.boston -> www.tapin.boston), or the state
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
  const next = safeNext(cnext);

  // Is this login already linked to a Tap In person? Then you're signed in as them.
  let person = null, dbDown = false;
  try { person = await DB.personFor(prof.oauth); } catch (e) { dbDown = true; console.error("oauth lookup", e.message); }
  if (person) {
    Object.assign(me, { person_id: person.id, name: person.name, role: person.role, skills: person.skills || [], looking_for: person.looking_for || [], working_on: person.working_on || "" });
    return finish(res, me, next, `Signed in as ${person.name}`);
  }
  // Not linked yet (and accounts are on): remember who signed in (a signed cookie only the link endpoint reads), then
  // sign up. The phone's claim page links the new person to this login once the badge is claimed. If this browser
  // already has a Tap In person, link to them straight away instead.
  if (DB.enabled() && !dbDown) {
    res.setHeader("set-cookie", [res.getHeader("set-cookie"), `${PENDING}=${sign({ oauth: prof.oauth, email: prof.email || null, exp: Date.now() + 3600e3 })}; Path=/api/auth; Max-Age=3600; HttpOnly; Secure; SameSite=Lax`].flat().filter(Boolean));
    return finish(res, me, next, `Hi ${name}, let's set up your Tap In`, true);
  }
  return finish(res, me, next, `Signed in as ${name}`);
};

// The landing page for a finished sign-in: save the profile as this browser's "wall.me" and go on.
// signup: no Tap In person yet. With one already on this browser (localStorage tapin_person), link to it now;
// otherwise open the sign-up with your name and email filled in (sessionStorage tapin_form, as the sign-up page keeps it).
function finish(res, me, next, title, signup = false) {
  const json = JSON.stringify(me).replace(/</g, "\\u003c");          // JSON inside a <script>: "<" can't close the tag
  return page(res, 200, title, `<h1>${esc(title)}</h1><p>${signup ? "No Tap In account for this login yet. Taking you to sign up…" : "Taking you back…"}</p>
<script>(function(){var m=${json},next=${JSON.stringify(next)},signup=${signup},p={};
try{p=JSON.parse(localStorage.getItem("wall.me")||"null")||{}}catch(e){}
var n=Object.assign({},p,m,{role:m.role||p.role||"student",face:p.face||("face-"+(m.person_id||Date.now())),links:Object.assign({},p.links||{},m.links||{})});
if(m.person_id==null&&p.person_id!=null&&p.oauth&&p.oauth!==m.oauth){delete n.person_id}
var save=function(){try{localStorage.setItem("wall.me",JSON.stringify(n))}catch(e){}};save();
if(!signup){location.replace(next);return}
var known=null;try{known=JSON.parse(localStorage.getItem("tapin_person"))}catch(e){}
var toSignup=function(){try{sessionStorage.setItem("tapin_oauth_pending","1");var f=JSON.parse(sessionStorage.getItem("tapin_form")||"null")||{};
f.name=f.name||m.name;f.contact=f.contact||m.email||"";sessionStorage.setItem("tapin_form",JSON.stringify(f))}catch(e){}location.replace("/phone/")};
if(known==null){toSignup();return}
fetch("/api/auth/link",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({person_id:known})})
.then(function(r){return r.ok?r.json():null}).then(function(d){if(!d||!d.person){toSignup();return}
n=Object.assign(n,{person_id:d.person.id,name:d.person.name});save();location.replace(next)}).catch(toSignup)})();</script>`);
}

const PENDING = "tapin_link";
const KEY = () => crypto.createHash("sha256").update("tapin-link|" + env("GITHUB_CLIENT_SECRET") + "|" + env("GOOGLE_CLIENT_SECRET")).digest();
function sign(obj) {
  const body = Buffer.from(JSON.stringify(obj)).toString("base64url");
  return body + "." + crypto.createHmac("sha256", KEY()).update(body).digest("base64url");
}
function unsign(v) {
  const [body, mac] = String(v || "").split(".");
  if (!body || !mac) return null;
  const want = crypto.createHmac("sha256", KEY()).update(body).digest("base64url");
  if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try { const o = JSON.parse(Buffer.from(body, "base64url").toString()); return o.exp > Date.now() ? o : null; } catch { return null; }
}

// POST /api/auth/link {person_id}: links the login waiting in the signed cookie to that person, then forgets the cookie.
module.exports.link = async (req, res) => {
  const json = (status, o) => { res.statusCode = status; res.setHeader("content-type", "application/json"); res.setHeader("cache-control", "no-store"); res.end(JSON.stringify(o)); };
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const pending = unsign(cookies(req)[PENDING]);
  if (!pending) return json(401, { error: "No sign-in waiting to be linked" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== "object") {
    const chunks = []; for await (const c of req) chunks.push(c);
    try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch { body = {}; }
  }
  const pid = Number(body.person_id);
  if (!Number.isInteger(pid) || pid <= 0) return json(400, { error: "person_id must be a number" });
  let person;
  try { person = await DB.link(pending.oauth, pid, pending.email); } catch (e) { console.error("oauth link", e.message); return json(503, { error: "Couldn't reach the database" }); }
  if (!person) return json(404, { error: "No such person" });
  res.setHeader("set-cookie", `${PENDING}=; Path=/api/auth; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  return json(200, { person: { id: person.id, name: person.name, role: person.role } });
};
