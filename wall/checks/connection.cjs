// Run: node wall/checks/connection.cjs (no server or browser required).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../wall.js'), 'utf8');
const boot = source.slice(source.lastIndexOf('  if (qs.has("demo"))'), source.lastIndexOf('})();'));
const flush = () => new Promise(resolve => setImmediate(resolve));
async function run(failures) {
  let attempts = 0, connected = 0;
  const timers = [], notes = [], classes = new Set();
  const context = {
    qs: new URLSearchParams(), HTTP: 'https://room.test',
    localStorage: { getItem: () => null },
    document: {
      body: { classList: { add: c => classes.add(c), remove: c => classes.delete(c) }, append: n => notes.push(n) },
      createElement: () => ({ append() {}, setAttribute() {}, remove() { notes.splice(notes.indexOf(this), 1); } }),
    },
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); },
    connect: () => connected++, startDemo: () => assert.fail('unexpected demo fallback'),
    fetch: async () => {
      const outcome = attempts++ < failures.length ? failures[attempts - 1] : 'ok';
      if (outcome === 'network') throw new Error('offline');
      return { ok: outcome !== 'http', headers: { get: () => outcome === 'html' ? 'text/html' : 'application/json' } };
    },
  };
  vm.runInNewContext(boot, context);
  for (let i = 0; i < failures.length; i++) {
    await flush();
    assert.equal(connected, 0);
    assert.equal(notes.length, 1, 'retries must reuse the offline notice');
    assert.equal(classes.has('no-room'), true);
    assert.equal(timers.length, 1, 'a failed probe must schedule exactly one retry');
    const retry = timers.shift();
    assert.ok(retry.delay >= 1000, 'retry must leave a gap between requests');
    retry.fn();
  }
  await flush();
  assert.equal(connected, 1, 'recovery must connect without reloading');
  assert.equal(notes.length, 0, 'recovery must remove the offline notice');
  assert.equal(classes.has('no-room'), false);
  assert.equal(timers.length, 0);
}
(async () => {
  await run([]);
  await run(['network', 'network']);
  await run(['http', 'html', 'network']);
  console.log('PASS initial success, network/HTTP/HTML failures, retries, recovery, and notice cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; });
