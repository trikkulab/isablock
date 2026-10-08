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
    get length() { return data.size; },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
  };
}

let clock = 1_000_000;
const now = () => clock;
const HOUR = 3600 * 1000;
const make = (storage, tabId = 'A', opts = {}) =>
  createLocalBackup({ key: 'k', maxAgeMs: Infinity, getStorage: () => storage, now, tabId, ...opts });

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('niente copie: nulla da ripristinare', () => {
  assert.deepEqual(make(fakeStorage()).listCopies(), []);
});

test('prima di enable() save non scrive (workspace appena aperta)', () => {
  const s = fakeStorage();
  assert.equal(make(s).save('{"x":1}'), 'disabled');
  assert.equal(s.length, 0);
});

test('salva e propone la copia a una scheda successiva', () => {
  const s = fakeStorage();
  const a = make(s);
  a.enable();
  assert.equal(a.save('{"x":1}', { info: { blocks: 3 } }), 'saved');
  assert.equal(a.save('{"x":1}'), 'unchanged');
  assert.deepEqual(a.listCopies(), [], 'la propria copia non si propone a sé stessi');
  a.release();
  const copies = make(s, 'B').listCopies();
  assert.equal(copies.length, 1);
  assert.equal(copies[0].json, '{"x":1}');
  assert.equal(copies[0].info.blocks, 3);
});

test('un programma vuoto non sovrascrive una copia buona', () => {
  const s = fakeStorage();
  const a = make(s);
  a.enable();
  a.save('{"buono":1}');
  assert.equal(a.save('{"vuoto":1}', { isEmpty: true }), 'empty');
  a.release();
  assert.equal(make(s, 'B').listCopies()[0].json, '{"buono":1}');
});

test('più schede: ognuna ha la sua copia, nessuna sovrascrive le altre', () => {
  const s = fakeStorage();
  const a = make(s, 'A'); const b = make(s, 'B');
  a.enable(); b.enable();
  a.save('{"a":1}'); clock += 1000; b.save('{"b":1}');
  a.release(); b.release();
  const copies = make(s, 'C').listCopies();
  assert.deepEqual(copies.map((c) => c.json), ['{"b":1}', '{"a":1}'], 'dalla più recente');
});

test('le copie di schede ancora vive non si propongono', () => {
  const s = fakeStorage();
  const a = make(s, 'A'); const b = make(s, 'B');
  a.enable(); b.enable();
  a.save('{"a":1}');
  assert.deepEqual(b.listCopies(), []);
  clock += 30_000; // A non dà più segni di vita (PC spento)
  assert.equal(b.listCopies().length, 1);
});

test('riprendere una copia la sposta nella scheda corrente e la toglie dalla lista', () => {
  const s = fakeStorage();
  const a = make(s, 'A'); const b = make(s, 'B');
  a.enable(); b.enable();
  a.save('{"a":1}'); b.save('{"b":1}');
  a.release(); b.release();
  const c = make(s, 'C');
  const [first, second] = c.listCopies();
  c.enable();
  c.adopt(first);
  assert.deepEqual(c.listCopies().map((x) => x.json), [second.json], 'resta solo l\'altra');
  c.release();
  // la copia ripresa vive ora sotto la scheda C
  assert.deepEqual(make(s, 'D').listCopies().map((x) => x.json).sort(), ['{"a":1}', '{"b":1}']);
});

test('scartare una copia la cancella', () => {
  const s = fakeStorage();
  const a = make(s); a.enable(); a.save('{"x":1}'); a.release();
  const b = make(s, 'B');
  b.remove(b.listCopies()[0]);
  assert.deepEqual(make(s, 'C').listCopies(), []);
});

test('dopo il salvataggio su file la copia non va ripristinata', () => {
  const s = fakeStorage();
  const a = make(s);
  a.enable();
  a.save('{"x":1}');
  a.markFileSaved('{"x":1}');
  a.release();
  assert.deepEqual(make(s, 'B').listCopies(), []);
  const c = make(s, 'C');
  c.enable(); c.save('{"x":2}'); c.release();
  assert.equal(make(s, 'D').listCopies().length, 1);
});

test('la copia scade, se è impostata una scadenza', () => {
  const s = fakeStorage();
  const a = make(s, 'A', { maxAgeMs: 24 * HOUR });
  a.enable(); a.save('{"x":1}'); a.release();
  clock += 25 * HOUR;
  assert.deepEqual(make(s, 'B', { maxAgeMs: 24 * HOUR }).listCopies(), []);
  assert.equal(s.length, 0, 'la copia scaduta viene cancellata');
  clock -= 25 * HOUR;
});

test('senza scadenza (Infinity) la copia resta per sempre', () => {
  const s = fakeStorage();
  const a = make(s); a.enable(); a.save('{"x":1}'); a.release();
  clock += 1000 * 24 * HOUR;
  assert.equal(make(s, 'B').listCopies().length, 1);
  clock -= 1000 * 24 * HOUR;
});

test('al massimo maxCopies copie: restano le più recenti', () => {
  const s = fakeStorage();
  for (let i = 0; i < 7; i++) {
    const t = make(s, `T${i}`);
    t.enable(); t.save(`{"n":${i}}`); t.release();
    clock += 1000;
  }
  const copies = make(s, 'Z', { maxCopies: 5 }).listCopies();
  assert.deepEqual(copies.map((c) => c.json), ['{"n":6}', '{"n":5}', '{"n":4}', '{"n":3}', '{"n":2}']);
  assert.equal(s.length, 5 + 0, 'le altre sono state cancellate');
});

test('copia della versione 1.7.0 (chiave senza scheda) ancora riprendibile', () => {
  const s = fakeStorage();
  s.setItem('k', JSON.stringify({ v: 1, savedAt: clock, hash: 'a', fileHash: null, json: '{"vecchia":1}' }));
  assert.equal(make(s).listCopies()[0].json, '{"vecchia":1}');
});

test('storage assente o che lancia: nessuna eccezione', () => {
  const broken = createLocalBackup({ key: 'k', getStorage: () => { throw new Error('no'); }, now });
  assert.equal(broken.available(), false);
  assert.deepEqual(broken.listCopies(), []);
  broken.enable();
  assert.equal(broken.save('{}'), 'error');
  broken.remove(); broken.release();
  const full = { length: 0, key: () => null, getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem() {} };
  const b = createLocalBackup({ key: 'k', getStorage: () => full, now });
  b.enable();
  assert.equal(b.save('{}'), 'error');
});

test('chiavi distinte non si toccano (riuso per la verifica)', () => {
  const s = fakeStorage();
  const a = make(s, 'A'); const v = createLocalBackup({ key: 'verifica', getStorage: () => s, now, tabId: 'A' });
  a.enable(); v.enable();
  a.save('{"a":1}'); v.save('{"v":1}');
  a.release(); v.release();
  assert.deepEqual(make(s, 'B').listCopies().map((c) => c.json), ['{"a":1}']);
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
