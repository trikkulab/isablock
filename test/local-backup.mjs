// Test della copia automatica locale (src/local-backup.js) e del ripristino
// attraverso il caricamento esistente (src/persistence.js). Nessuna libreria
// esterna: solo Node, con un localStorage finto.  Uso: node test/local-backup.mjs

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const importFrom = (rel) => import(pathToFileURL(path.join(root, rel)).href);

const { createLocalBackup, createDebouncedSaver, hashText } = await importFrom('src/local-backup.js');

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
  };
}

let clock = 1_000_000;
const now = () => clock;
const HOUR = 3600 * 1000;
const make = (storage, tabId = 'A', key = 'k') =>
  createLocalBackup({ key, maxAgeMs: 24 * HOUR, getStorage: () => storage, now, tabId });

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('niente copia: nulla da ripristinare', () => {
  assert.equal(make(fakeStorage()).inspect().status, 'none');
});

test('prima di enable() save non scrive (workspace appena aperta)', () => {
  const s = fakeStorage();
  const b = make(s);
  assert.equal(b.save('{"x":1}'), 'disabled');
  assert.equal(s.getItem('k'), null);
});

test('salva e propone il ripristino alla riapertura', () => {
  const s = fakeStorage();
  const a = make(s);
  a.enable();
  assert.equal(a.save('{"x":1}'), 'saved');
  assert.equal(a.save('{"x":1}'), 'unchanged');
  a.release(); // chiusura normale
  const b = make(s, 'B');
  const found = b.inspect();
  assert.equal(found.status, 'restorable');
  assert.equal(found.record.json, '{"x":1}');
});

test('un programma vuoto non sovrascrive una copia buona', () => {
  const s = fakeStorage();
  const a = make(s);
  a.enable();
  a.save('{"buono":1}');
  assert.equal(a.save('{"vuoto":1}', { isEmpty: true }), 'empty');
  assert.equal(JSON.parse(s.getItem('k')).json, '{"buono":1}');
});

test('rifiuto del ripristino: clear() cancella la copia', () => {
  const s = fakeStorage();
  const a = make(s);
  a.enable();
  a.save('{"x":1}');
  a.release();
  const b = make(s, 'B');
  b.inspect();
  b.clear();
  assert.equal(s.getItem('k'), null);
  assert.equal(make(s, 'C').inspect().status, 'none');
});

test('dopo il salvataggio su file la copia non va ripristinata', () => {
  const s = fakeStorage();
  const a = make(s);
  a.enable();
  a.save('{"x":1}');
  a.markFileSaved('{"x":1}');
  a.release();
  assert.equal(make(s, 'B').inspect().status, 'none');
  // ...ma una modifica successiva sì
  const c = make(s, 'C');
  c.enable();
  c.save('{"x":2}');
  c.release();
  assert.equal(make(s, 'D').inspect().status, 'restorable');
});

test('la copia scade', () => {
  const s = fakeStorage();
  const a = make(s);
  a.enable();
  a.save('{"x":1}');
  a.release();
  clock += 25 * HOUR;
  assert.equal(make(s, 'B').inspect().status, 'none');
  assert.equal(s.getItem('k'), null, 'la copia scaduta viene cancellata');
  clock -= 25 * HOUR;
});

test('due schede: la seconda non salva e non propone ripristini', () => {
  const s = fakeStorage();
  const a = make(s, 'A');
  a.enable();
  a.save('{"x":1}');
  const b = make(s, 'B');
  assert.equal(b.inspect().status, 'other-tab');
  b.enable();
  assert.equal(b.save('{"y":2}'), 'other-tab');
  assert.equal(JSON.parse(s.getItem('k')).json, '{"x":1}');
  a.release(); // la prima scheda si chiude
  assert.equal(b.save('{"y":2}'), 'saved');
});

test('scheda caduta senza release: dopo un po\' il posto si libera', () => {
  const s = fakeStorage();
  const a = make(s, 'A');
  a.enable();
  a.save('{"x":1}');
  clock += 30_000;
  assert.equal(make(s, 'B').inspect().status, 'restorable');
});

test('storage assente o che lancia: nessuna eccezione', () => {
  const broken = createLocalBackup({ key: 'k', maxAgeMs: HOUR, getStorage: () => { throw new Error('no'); }, now });
  assert.equal(broken.inspect().status, 'unavailable');
  broken.enable();
  assert.equal(broken.save('{}'), 'error');
  broken.clear();
  broken.release();
  const full = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem() {} };
  const b = createLocalBackup({ key: 'k', maxAgeMs: HOUR, getStorage: () => full, now });
  b.enable();
  assert.equal(b.save('{}'), 'error');
});

test('chiavi distinte non si toccano (riuso per la verifica)', () => {
  const s = fakeStorage();
  const a = make(s, 'A', 'lavoro');
  const v = make(s, 'A', 'verifica');
  a.enable(); v.enable();
  a.save('{"a":1}'); v.save('{"v":1}');
  a.clear();
  assert.equal(JSON.parse(s.getItem('verifica')).json, '{"v":1}');
});

test('debounce: una sola esecuzione, flush solo se in attesa', async () => {
  let n = 0;
  const d = createDebouncedSaver(() => n++, 20);
  d.flush(); assert.equal(n, 0);
  d.schedule(); d.schedule(); d.schedule();
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(n, 1);
  d.schedule(); d.flush(); assert.equal(n, 2);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(n, 2);
  d.schedule(); d.cancel();
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(n, 2);
});

test('hashText è stabile e distingue', () => {
  assert.equal(hashText('abc'), hashText('abc'));
  assert.notEqual(hashText('abc'), hashText('abd'));
});

// --- Ripristino attraverso il caricamento esistente (con migrazione) -------
const Blockly = require(path.join(root, 'vendor/blockly/blockly_compressed.js'));
Object.assign(Blockly.Msg, require(path.join(root, 'vendor/blockly/msg/it.js')));
const { registerBlocks } = await importFrom('src/blocks/blocks.js');
const { serializeWorkspace, loadWorkspaceState, isWorkspaceBlank, FileFormatError } = await importFrom('src/persistence.js');
const { examples } = await importFrom('src/examples.js');
registerBlocks(Blockly);

test('roundtrip: copia compatta → ripristino identico, e vuoto riconosciuto', () => {
  const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(examples[0].workspaceState, ws);
  assert.equal(isWorkspaceBlank(ws), false);
  const json = serializeWorkspace(Blockly, ws, 0);
  const ws2 = new Blockly.Workspace();
  loadWorkspaceState(Blockly, ws2, JSON.parse(json));
  assert.equal(serializeWorkspace(Blockly, ws2, 0), json);
  const empty = new Blockly.Workspace();
  Blockly.serialization.workspaces.load({ blocks: { blocks: [{ type: 'program' }] } }, empty);
  assert.equal(isWorkspaceBlank(empty), true);
});

test('ripristino passa dalle migrazioni e rifiuta formati futuri', () => {
  const ws = new Blockly.Workspace();
  const old = {
    formatVersion: 4,
    arraySizes: { v1: 5 },
    variables: [{ name: 'v', id: 'v1', type: '' }],
    blocks: { languageVersion: 0, blocks: [{ type: 'program', id: 'p' }] },
  };
  loadWorkspaceState(Blockly, ws, old);
  assert.ok(ws.getAllBlocks(false).some((b) => b.type === 'array_declare'));
  assert.throws(() => loadWorkspaceState(Blockly, ws, { formatVersion: 999 }), FileFormatError);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`OK       ${name}`);
  } catch (err) {
    failed++;
    console.log(`FALLITO  ${name}\n${err.stack}`);
  }
}
console.log(failed ? `\n${failed} test falliti.` : `\n${tests.length}/${tests.length} test passati.`);
process.exit(failed ? 1 : 0);
