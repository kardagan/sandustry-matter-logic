// Harness: runs main.js against a stubbed Sandkit and checks the channel /
// condition logic end to end. Not shipped with the mod.
const fs = require('fs');
const vm = require('vm');

const ElementType = { Sand: 1, Water: 2, Sandium: 3, Petalium: 4, Gold: 5 };
const idByType = { 1: 'sand', 2: 'water', 3: 'sandium', 4: 'petalium', 5: 'gold' };
const typeById = Object.fromEntries(Object.entries(idByType).map(([t, id]) => [id, Number(t)]));

// --- fake world -------------------------------------------------------------
const world = new Map();                       // "x,y" -> elementType
const setCell = (x, y, type) => world.set(x + ',' + y, type);
const clearCell = (x, y) => world.delete(x + ',' + y);

// --- fake structure store ---------------------------------------------------
const structures = [];
function addStructure(id, x, y, data) {
  const s = { id, type: id, x, y, data: data || {} };
  structures.push(s);
  return s;
}

// --- signal link table, exactly as the game's signal module stores it --------
// { "senderX,senderY": [{x, y, on}, ...] }  where the entries are receivers.
const signalLinks = {};
function wire(from, to) {
  const key = from.x + ',' + from.y;
  (signalLinks[key] = signalLinks[key] || []).push({ x: to.x, y: to.y, on: false });
}
function unwire(from, to) {
  const key = from.x + ',' + from.y;
  const list = signalLinks[key] || [];
  const i = list.findIndex((e) => e.x === to.x && e.y === to.y);
  if (i >= 0) list.splice(i, 1);
}

// --- captured registrations -------------------------------------------------
const processors = {};
const senders = {};
const outputs = new Map();                     // "x,y" -> boolean
const events = {};
let tick = 0;

const api = {
  i18n: {
    register() {},
    t: (k, p) => k + (p ? JSON.stringify(p) : ''),
    getName: (d) => (d && d.name) || null,
  },
  sprites: { loadFromMod: async () => {} },
  settings: { get: () => undefined },
  time: { getTick: () => tick },
  elements: {
    getIdByType: (t) => idByType[t],
    getTypeById: (id) => typeById[id],
    getDefinitionByType: (t) => ({ name: idByType[t] }),
  },
  storage: { ensure: (id) => (id === 'signals' ? { links: signalLinks } : {}) },
  structures: {
    register() {},
    updateDefinition() {},
    updateData() {},
    setSpritesheetIndexAtCell() {},
    isType: (s, id) => s.id === id,
    isTypeAtCell: (x, y, id) => {
      const s = structures.find((st) => st.x === x && st.y === y);
      return !!s && s.id === id;
    },
    getTypeById: (id) => id,
    getAtCell: (x, y) => structures.find((s) => s.x === x && s.y === y),
    forEachOfType: (id, cb) => structures.filter((s) => s.id === id).forEach(cb),
    processing: { register: (key, def) => { processors[def.structureType] = def; } },
  },
  signals: {
    registerSenderType: (id, fn) => { senders[id] = fn; },
    targets: { register() {} },
    interactables: { register() {} },
    setOutputAtCell: (x, y, on) => outputs.set(x + ',' + y, !!on),
  },
  tech: { conservatory: { appendUnlock() {} } },
  events: { on: (name, cb) => { (events[name] = events[name] || []).push(cb); } },
  ui: { regions: { mount() {} }, toast() {} },
};

const React = {
  createElement: (...a) => ({ a }),
  useState: (v) => [v, () => {}],
  useEffect: () => {},
};

const sandbox = {
  sandkit: { api, react: React, enums: { ElementType, Tech: { LogicGates: 99 } }, apiVersion: 1 },
  console,
  setInterval,
  clearInterval,
  setTimeout,
  Promise,
  Boolean,
  Number,
  Math,
  Object,
  Array,
  String,
  Map,
  Set,
  JSON,
  parseInt,
};
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
new vm.Script(fs.readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8'), {
  filename: 'main.js',
}).runInContext(sandbox);

// The mod bootstraps behind an await, so let its microtasks settle first.
async function main() {
// --- drive the simulation ----------------------------------------------------
await new Promise((resolve) => setTimeout(resolve, 0));

const context = {
  getResolvedTypeAtCell: (x, y) => world.get(x + ',' + y) ?? null,
};

function runTick() {
  tick++;
  structures.forEach((s) => {
    const proc = processors[s.id];
    if (proc) proc.process(s, context);
  });
}

// Two scanners, one combinator. Nothing is wired yet.
const scannerA = addStructure('matterScanner', 0, 0, {});
const scannerB = addStructure('matterScanner', 8, 0, {});
const comb = addStructure('conditionCombinator', 0, 8, {
  mode: 'all',
  conditions: [
    { element: 'sandium', operator: 'ge', value: 4 },
    { element: 'petalium', operator: 'ge', value: 4 },
  ],
});

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${actual}, want ${expected})`);
}
const combOut = () => comb.data.output === true;

// 1. Empty world -> off.
runTick();
check('empty world: combinator off', combOut(), false);

// 2. Fill both zones but wire nothing: an unwired combinator sees no matter.
for (let i = 0; i < 4; i++) setCell(i, 0, ElementType.Sandium);
for (let i = 0; i < 4; i++) setCell(8 + i, 0, ElementType.Petalium);
runTick();
runTick();
check('matter present but no wire: off', combOut(), false);
check('scanner A reports active', senders.matterScanner(scannerA), true);

// 3. Wire scanner A only: sandium is satisfied, petalium is not.
wire(scannerA, comb);
runTick();
runTick();
check('only scanner A wired, ALL: off', combOut(), false);

// 4. Wire scanner B too: both conditions are met.
wire(scannerB, comb);
runTick();
runTick();
check('both scanners wired, ALL: on', combOut(), true);

// 5. Drop one petalium -> the >= 4 condition fails.
clearCell(11, 0);
runTick();
runTick();
check('3 petalium, ALL: off', combOut(), false);

// 6. Same state, ANY mode -> the sandium condition alone carries it.
comb.data.mode = 'any';
runTick();
check('3 petalium, ANY: on', combOut(), true);

// 7. Unwiring scanner B removes petalium from the combinator's view entirely.
comb.data.mode = 'all';
for (let i = 0; i < 4; i++) setCell(8 + i, 0, ElementType.Petalium);
runTick();
runTick();
check('rewired and refilled, ALL: on', combOut(), true);
unwire(scannerB, comb);
runTick();
runTick();
check('scanner B unwired, ALL: off', combOut(), false);

// 8. Two scanners wired into one combinator add up: 4 + 4 sandium >= 8.
for (let i = 0; i < 4; i++) setCell(8 + i, 0, ElementType.Sandium);
wire(scannerB, comb);
comb.data.conditions = [{ element: 'sandium', operator: 'ge', value: 8 }];
runTick();
runTick();
check('two wired scanners sum: on', combOut(), true);

// 9. Exact equality, and the empty-config guard.
comb.data.conditions = [{ element: 'sandium', operator: 'eq', value: 8 }];
runTick();
runTick();
check('equality operator: on', combOut(), true);
comb.data.conditions = [];
runTick();
check('no conditions: off', combOut(), false);

// 10. A wire pointing at some other structure must not feed this combinator.
const other = addStructure('conditionCombinator', 20, 20, {
  mode: 'all',
  conditions: [{ element: 'sandium', operator: 'ge', value: 1 }],
});
runTick();
runTick();
check('unwired second combinator: off', other.data.output === true, false);

// 11. A removed scanner must stop feeding its combinator.
comb.data.conditions = [{ element: 'sandium', operator: 'ge', value: 8 }];
runTick();
runTick();
check('before removal: on', combOut(), true);
structures.splice(structures.indexOf(scannerB), 1);
events['building:removed'].forEach((cb) => cb({ x: 8, y: 0 }));
runTick();
runTick();
check('after removing scanner B: off', combOut(), false);

// The wire mirror must agree with the structure state.
check('wire output mirrors structure', outputs.get('0,8'), comb.data.output);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
}

main();
