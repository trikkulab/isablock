// Prova src/cloud/sketch.js contro le regole vere (emulatore Firestore).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { creaSketch, ErroreSketch, MAX_SKETCH, MAX_PROGRAMMA } from '../../src/cloud/sketch.js';

sdk.setLogLevel('silent');
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8186').split(':');
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-isablock-sketch',
    firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const per = (uid, email = `${uid}@isarome.it`) =>
  creaSketch({ sdk, db: env.authenticatedContext(uid, { email, email_verified: true }).firestore() }, uid);
const P = '{"formatVersion":6,"blocks":{}}';

test('nuovo, elenco, aggiorna, rinomina, elimina', async () => {
  const s = per('anna');
  const a = await s.nuovo('  pangolino-ridente ', P);
  assert.equal(a.id, 'anna_0');
  assert.equal(a.nome, 'pangolino-ridente');
  const b = await s.nuovo('pangolino-ridente', P + ' '); // omonimo ammesso
  assert.equal(b.id, 'anna_1');

  let el = await s.elenca();
  assert.equal(el.length, 2);
  assert.ok(el.every((x) => x.creato instanceof Date && x.modificato instanceof Date));
  assert.ok(el[0].modificato >= el[1].modificato);

  await s.aggiorna('anna_0', { programma: '{"a":1}' });
  await s.rinomina('anna_1', 'nuovo nome');
  el = await s.elenca();
  assert.equal(el.find((x) => x.id === 'anna_0').programma, '{"a":1}');
  assert.equal(el.find((x) => x.id === 'anna_1').nome, 'nuovo nome');

  await s.elimina('anna_0');
  assert.deepEqual((await s.elenca()).map((x) => x.id), ['anna_1']);
  // lo slot liberato si riusa
  assert.equal((await s.nuovo('x', P)).id, 'anna_0');
});

test('ognuno vede solo i propri', async () => {
  await per('anna').nuovo('di anna', P);
  await per('bruno').nuovo('di bruno', P);
  assert.deepEqual((await per('anna').elenca()).map((x) => x.nome), ['di anna']);
  assert.deepEqual((await per('bruno').elenca()).map((x) => x.nome), ['di bruno']);
});

test('tetto di 50 sketch: il 51° dà un errore comprensibile', async () => {
  const s = per('anna');
  for (let i = 0; i < MAX_SKETCH; i++) await s.nuovo(`s${i}`, P);
  await assert.rejects(s.nuovo('uno di troppo', P), (e) => e instanceof ErroreSketch && e.codice === 'pieno');
  assert.equal((await s.elenca()).length, MAX_SKETCH);
});

test('controlli locali: nome vuoto o lungo, programma vuoto o troppo grande', async () => {
  const s = per('anna');
  await assert.rejects(s.nuovo('   ', P), (e) => e.codice === 'nome');
  await assert.rejects(s.nuovo('x'.repeat(61), P), (e) => e.codice === 'nome');
  await assert.rejects(s.nuovo('ok', ''), (e) => e.codice === 'programma');
  await assert.rejects(s.nuovo('ok', 'a'.repeat(MAX_PROGRAMMA + 1)), (e) => e.codice === 'programma');
  assert.equal((await s.elenca()).length, 0);
});

test('due schede che salvano insieme non si sovrascrivono', async () => {
  const [s1, s2] = [per('anna'), per('anna')];
  const [a, b] = await Promise.all([s1.nuovo('scheda uno', P), s2.nuovo('scheda due', P)]);
  assert.notEqual(a.id, b.id);
  assert.equal((await s1.elenca()).length, 2);
});

test('operazioni sullo sketch altrui vengono rifiutate con messaggio', async () => {
  await per('anna').nuovo('di anna', P);
  await assert.rejects(per('bruno').aggiorna('anna_0', { nome: 'rubato' }), (e) => e.codice === 'negato');
  await assert.rejects(per('bruno').elimina('anna_0'), (e) => e.codice === 'negato');
  assert.equal((await per('anna').elenca())[0].nome, 'di anna');
});
