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

// ── Condivisione col docente ──────────────────────────────────────────────
import { creaCondivisi } from '../../src/cloud/condivisi.js';

const dbDi = (uid, email) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const studente = (uid, email, nome) => creaSketch({ sdk, db: dbDi(uid, email) }, uid, { email, nome });
const docenteVista = (email = 'docente@isarome.it') => creaCondivisi({ sdk, db: dbDi('doc', email) });
async function corsoConIscritti(iscritti) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await sdk.setDoc(sdk.doc(db, 'corsi/AB12CD'), { materia: 'Informatica', classe: '3AINF', annoScolastico: '2026/27', docenti: ['docente@isarome.it'], iscrizioniAperte: true, attivo: true });
    await sdk.setDoc(sdk.doc(db, 'corsi/ZZ99ZZ'), { materia: 'Altro', classe: '3BINF', annoScolastico: '2026/27', docenti: ['altro@isarome.it'], iscrizioniAperte: true, attivo: true });
    for (const e of iscritti) await sdk.setDoc(sdk.doc(db, `iscrizioni/AB12CD_${e}`), { corsoId: 'AB12CD', email: e });
  });
}

test('condividi: lo sketch porta autore e corso; il docente lo elenca con nome dell\'autore', async () => {
  await corsoConIscritti(['anna@isarome.it']);
  const anna = studente('anna', 'anna@isarome.it', 'Anna Rossi');
  const a = await anna.nuovo('drago-saggio', P);
  assert.equal((await anna.elenca())[0].condivisoCon, null);
  await anna.condividi(a.id, 'AB12CD');
  assert.equal((await anna.elenca())[0].condivisoCon, 'AB12CD');

  const { iscritti, sketch } = await docenteVista().elenca('AB12CD');
  assert.equal(iscritti, 1);
  assert.equal(sketch.length, 1);
  assert.equal(sketch[0].nome, 'drago-saggio');
  assert.equal(sketch[0].autoreNome, 'Anna Rossi');
  assert.equal(sketch[0].autoreEmail, 'anna@isarome.it');
  assert.equal(sketch[0].programma, P);
});

test('il docente vede la versione salvata più di recente, non una copia vecchia', async () => {
  await corsoConIscritti(['anna@isarome.it']);
  const anna = studente('anna', 'anna@isarome.it', 'Anna Rossi');
  const a = await anna.nuovo('s', P);
  await anna.condividi(a.id, 'AB12CD');
  await anna.aggiorna(a.id, { programma: '{"v":2}' });
  assert.equal((await docenteVista().elenca('AB12CD')).sketch[0].programma, '{"v":2}');
  // aggiornare non toglie la condivisione
  assert.equal((await anna.elenca())[0].condivisoCon, 'AB12CD');
});

test('solo gli sketch condivisi: quelli privati e quelli condivisi con altri non si vedono', async () => {
  await corsoConIscritti(['anna@isarome.it']);
  const anna = studente('anna', 'anna@isarome.it', 'Anna Rossi');
  const s1 = await anna.nuovo('condiviso', P);
  await anna.nuovo('privato', P);
  await anna.condividi(s1.id, 'AB12CD');
  const { sketch } = await docenteVista().elenca('AB12CD');
  assert.deepEqual(sketch.map((x) => x.nome), ['condiviso']);
});

test('ritirare la condivisione toglie lo sketch dalla vista del docente', async () => {
  await corsoConIscritti(['anna@isarome.it']);
  const anna = studente('anna', 'anna@isarome.it', 'Anna Rossi');
  const a = await anna.nuovo('s', P);
  await anna.condividi(a.id, 'AB12CD');
  await anna.condividi(a.id, null);
  assert.deepEqual((await docenteVista().elenca('AB12CD')).sketch, []);
});

test('più studenti: ordinati per autore, poi dal più recente; chi non è iscritto non compare', async () => {
  await corsoConIscritti(['anna@isarome.it', 'bruno@isarome.it', 'carla@isarome.it']); // carla non condivide
  const bruno = studente('bruno', 'bruno@isarome.it', 'Bruno Bianchi');
  const anna = studente('anna', 'anna@isarome.it', 'Anna Rossi');
  for (const [s, n] of [[bruno, 'b1'], [anna, 'a1'], [anna, 'a2']]) {
    const x = await s.nuovo(n, P);
    await s.condividi(x.id, 'AB12CD');
  }
  const { iscritti, sketch } = await docenteVista().elenca('AB12CD');
  assert.equal(iscritti, 3);
  assert.deepEqual(sketch.map((x) => `${x.autoreNome}:${x.nome}`), ['Anna Rossi:a2', 'Anna Rossi:a1', 'Bruno Bianchi:b1']);
  // uno studente tolto dal corso (console) sparisce
  await env.withSecurityRulesDisabled((ctx) => sdk.deleteDoc(sdk.doc(ctx.firestore(), 'iscrizioni/AB12CD_anna@isarome.it')));
  assert.deepEqual((await docenteVista().elenca('AB12CD')).sketch.map((x) => x.autoreNome), ['Bruno Bianchi']);
});

test('un docente di un altro corso non legge; uno studente non usa la vista docente', async () => {
  await corsoConIscritti(['anna@isarome.it']);
  const anna = studente('anna', 'anna@isarome.it', 'Anna Rossi');
  await anna.condividi((await anna.nuovo('s', P)).id, 'AB12CD');
  await assert.rejects(docenteVista('altro@isarome.it').elenca('AB12CD'));
  await assert.rejects(creaCondivisi({ sdk, db: dbDi('anna', 'anna@isarome.it') }).elenca('AB12CD'));
});

test('condividere con un corso a cui non si è iscritti dà un errore comprensibile', async () => {
  await corsoConIscritti(['anna@isarome.it']);
  const anna = studente('anna', 'anna@isarome.it', 'Anna Rossi');
  const a = await anna.nuovo('s', P);
  await assert.rejects(anna.condividi(a.id, 'ZZ99ZZ'), (e) => e.codice === 'negato');
});

test('uno sketch vecchio (senza autore) si completa al primo salvataggio e poi si può condividere', async () => {
  await corsoConIscritti(['anna@isarome.it']);
  await env.withSecurityRulesDisabled((ctx) => sdk.setDoc(sdk.doc(ctx.firestore(), 'sketch/anna_0'), {
    proprietarioUid: 'anna', nome: 'vecchio', creato: sdk.Timestamp.now(), modificato: sdk.Timestamp.now(), programma: P }));
  const anna = studente('anna', 'anna@isarome.it', 'Anna Rossi');
  assert.equal((await anna.elenca())[0].condivisoCon, null);
  await anna.rinomina('anna_0', 'rinominato');                     // completa l'autore
  await anna.condividi('anna_0', 'AB12CD');
  assert.equal((await docenteVista().elenca('AB12CD')).sketch[0].autoreNome, 'Anna Rossi');
});

test('rinominare uno sketch condiviso dopo essere stati tolti dal corso funziona ancora', async () => {
  await corsoConIscritti(['anna@isarome.it']);
  const anna = studente('anna', 'anna@isarome.it', 'Anna Rossi');
  const a = await anna.nuovo('s', P);
  await anna.condividi(a.id, 'AB12CD');
  await env.withSecurityRulesDisabled((ctx) => sdk.deleteDoc(sdk.doc(ctx.firestore(), 'iscrizioni/AB12CD_anna@isarome.it')));
  await anna.rinomina(a.id, 'nuovo nome');
  assert.equal((await anna.elenca())[0].nome, 'nuovo nome');
  await anna.condividi(a.id, null);                                                   // si può ritirare
  await assert.rejects(anna.condividi(a.id, 'AB12CD'), (e) => e.codice === 'negato'); // ma non ri-condividere
});
