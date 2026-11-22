import { spawn } from "node:child_process"; import fs from "node:fs";
const [out, w = "1920", h = "1080", pick = ""] = process.argv.slice(2), url = "file:///D:/Projects/TapIn/reference/room-map-mocks/restyle/index.html?demo&silent";
const port = 9700 + Math.floor(Math.random() * 90), dir = process.env.TEMP + "/rs-" + Date.now();
const p = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new","--disable-gpu","--hide-scrollbars","--remote-debugging-port="+port,"--user-data-dir="+dir,"--window-size="+w+","+h,"about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let t;
for (let i = 0; i < 40; i++) { try { t = (await (await fetch("http://127.0.0.1:"+port+"/json")).json()).find((x) => x.type === "page"); if (t) break; } catch {} await sleep(250); }
const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Page.enable"); await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: 1, mobile: w < 600 });
await send("Page.navigate", { url }); await sleep(9000);
if (pick) { let ok = false; for (let y = 160; y < +h - 100 && !ok; y += 34) for (let x = 120; x < +w - 420 && !ok; x += 34) {
  for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  const r = await send("Runtime.evaluate", { returnByValue: true, expression: "!document.getElementById('profile').hidden" }); ok = r.result.result.value; }
  await sleep(1500); }
const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(out, Buffer.from(s.result.data, "base64")); ws.close(); p.kill(); process.exit(0);
