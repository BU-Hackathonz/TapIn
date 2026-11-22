// Run: node wall/checks/group_join.cjs. No database, browser, or real RFID scans.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../wall.js'), 'utf8');
const events = source.slice(source.indexOf('  const on = {'), source.indexOf('  // Events run one at a time'));
async function check({ tableKnown, personKnown }) {
  const S = {
    people: new Map([[1, { id: 1, name: 'Member', here: true, group_id: 8 }]]),
    groups: new Map(tableKnown ? [[8, { id: 8, name: 'Table A', points: 0 }]] : []),
    links: new Map(),
  };
  if (personKnown) S.people.set(2, { id: 2, name: 'Newcomer', here: false, group_id: 3 });
  let refreshes = 0, rendered = false;
  const context = {
    S, Panels: { log() {} }, Hub: { note() {} }, Sound: { links() {} },
    lk: (a, b) => a < b ? `${a}-${b}` : `${b}-${a}`,
    freshen() {}, glow() {}, ripple() {},
    syncGraph: async () => {
      refreshes++;
      S.people.set(2, { id: 2, name: 'Newcomer', here: true, group_id: 8 });
      S.groups.set(8, { id: 8, name: 'Table A', points: 10 });
      rendered = true;
    },
  };
  vm.runInNewContext(events + '\nglobalThis.events = on;', context);
  await context.events.group_joined({ group_id: 8, new_member_ids: [2], new_links: [[1, 2]] });
  assert.equal(refreshes, 1, 'every join must refresh the authoritative membership snapshot');
  assert.equal(S.people.get(2)?.group_id, 8, 'new arrival must appear at the destination table');
  assert.equal(S.people.get(2)?.here, true);
  assert.equal(S.groups.get(8)?.points, 10, 'table snapshot must be current');
  assert.ok(S.links.has('1-2'));
  assert.ok(rendered, 'join must redraw nodes');
}
(async () => {
  await check({ tableKnown: true, personKnown: false });
  await check({ tableKnown: true, personKnown: true });
  await check({ tableKnown: false, personKnown: false });
  console.log('PASS new arrivals, moving attendees, and unknown tables refresh and redraw after group joins');
})().catch(error => { console.error(error); process.exitCode = 1; });
