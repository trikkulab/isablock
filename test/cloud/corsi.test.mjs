// Prova src/cloud/corsi.js contro le regole vere (emulatore Firestore).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { creaCorsi, ErroreCorsi, normalizzaCodice, generaCodice, nomeCorso, ALFABETO_CODICE } from '../../src/cloud/corsi.js';

sdk.setLogLevel('silent');
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8186').split(':');
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-isablock-corsi',
    firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const e of ['docente@isarome.it']) await sdk.setDoc(sdk.doc(db, `docenti/${e}`), { attivo: true });
    const base = { materia: 'Informatica', classe: '3AINF', annoScolastico: '2026/27', docenti: ['docente@isarome.it'], iscrizioniAperte: true, attivo: true };
    await sdk.setDoc(sdk.doc(db, 'corsi/AB12CD'), base);
    await sdk.setDoc(sdk.doc(db, 'corsi/TP5B712'), { ...base, materia: 'TPSIT', classe: '3BINF', nome: 'Laboratorio TPSIT' });
    await sdk.setDoc(sdk.doc(db, 'corsi/CH7Z9Q'), { ...base, iscrizioniAperte: false, classe: '4AINF' });
    await sdk.setDoc(sdk.doc(db, 'corsi/ARCH123'), { ...base, attivo: false });
  });
});

const per = (email, ruolo) => creaCorsi({ sdk, db: env.authenticatedContext('u-' + email, { email, email_verified: true }).firestore() }, email, ruolo);

test('codice: alfabeto Crockford, lunghezza 6, normalizzazione perdonante', () => {
  for (let i = 0; i < 300; i++) {
    const c = generaCodice();
    assert.equal(c.length, 6);
    assert.ok([...c].every((x) => ALFABETO_CODICE.includes(x)), c);
  }
  assert.equal(normalizzaCodice('  ab-12 cd '), 'AB12CD');
  assert.equal(normalizzaCodice('abIlO0'), 'AB1100');   // I, L -> 1; O -> 0
  assert.equal(normalizzaCodice('../<script>'), 'SCR1PT'); // simboli via, I -> 1: sempre un id innocuo
  assert.equal(normalizzaCodice(null), '');
  assert.equal(normalizzaCodice('😀 ünï'), 'N');           // emoji e lettere accentate sono scartate
});

test('nome del corso: quello scritto, altrimenti materia – classe (anno)', () => {
  assert.equal(nomeCorso({ id: 'X', nome: 'Laboratorio TPSIT' }), 'Laboratorio TPSIT');
  assert.equal(nomeCorso({ id: 'X', materia: 'Informatica', classe: '3AINF', annoScolastico: '2026/27' }), 'Informatica – 3AINF (2026/27)');
  assert.equal(nomeCorso({ id: 'X' }), 'X');
});

test('iscriviti: col codice (anche scritto male) entra e restituisce il corso', async () => {
  const s = per('alunno@isarome.it');
  const c = await s.iscriviti(' ab12-cd ');
  assert.equal(c.id, 'AB12CD');
  assert.equal(c.nome, 'Informatica – 3AINF (2026/27)');
  assert.equal(c.ruolo, 'studente');
  const miei = await s.elenca();
  assert.deepEqual(miei.map((x) => x.id), ['AB12CD']);
});

test('iscriviti: errori comprensibili, senza rivelare quali codici esistono', async () => {
  const s = per('alunno@isarome.it');
  await assert.rejects(s.iscriviti(''), (e) => e instanceof ErroreCorsi && e.codice === 'codice');
  await assert.rejects(s.iscriviti('---'), (e) => e.codice === 'codice');
  const messaggi = new Set();
  for (const codice of ['ZZZZZZ', 'CH7Z9Q', 'ARCH123']) {
    await assert.rejects(s.iscriviti(codice), (e) => { messaggi.add(e.message); return e.codice === 'rifiutato'; });
  }
  assert.equal(messaggi.size, 1, 'inesistente, chiuso e archiviato rispondono allo stesso modo');
  assert.deepEqual(await s.elenca(), []);
});

test('iscriviti: due volte allo stesso corso dà "già iscritto"', async () => {
  const s = per('alunno@isarome.it');
  await s.iscriviti('AB12CD');
  await assert.rejects(s.iscriviti('AB12CD'), (e) => e.codice === 'gia');
  assert.equal((await s.elenca()).length, 1);
});

test('più corsi per uno studente, in ordine alfabetico; archiviati nascosti', async () => {
  const s = per('alunno@isarome.it');
  await s.iscriviti('TP5B712');
  await s.iscriviti('AB12CD');
  await env.withSecurityRulesDisabled((ctx) => sdk.setDoc(sdk.doc(ctx.firestore(), 'iscrizioni/ARCH123_alunno@isarome.it'), { corsoId: 'ARCH123', email: 'alunno@isarome.it' }));
  assert.deepEqual((await s.elenca()).map((x) => x.nome), ['Informatica – 3AINF (2026/27)', 'Laboratorio TPSIT']);
});

test('corso chiuso: entra solo se il docente iscrive a mano (console)', async () => {
  const s = per('alunno@isarome.it');
  await assert.rejects(s.iscriviti('CH7Z9Q'), (e) => e.codice === 'rifiutato');
  await env.withSecurityRulesDisabled((ctx) => sdk.setDoc(sdk.doc(ctx.firestore(), 'iscrizioni/CH7Z9Q_alunno@isarome.it'), { corsoId: 'CH7Z9Q', email: 'alunno@isarome.it' }));
  assert.deepEqual((await s.elenca()).map((x) => x.id), ['CH7Z9Q']);
  assert.equal((await s.elenca())[0].iscrizioniAperte, false);
});

test('il docente vede i propri corsi con ruolo docente; uno studente non vede quelli altrui', async () => {
  const d = await per('docente@isarome.it', 'docente').elenca();
  assert.deepEqual(d.map((x) => x.id).sort(), ['AB12CD', 'CH7Z9Q', 'TP5B712'].sort());
  assert.ok(d.every((x) => x.ruolo === 'docente'));
  assert.deepEqual(await per('altro@isarome.it').elenca(), []);
});

test('uno studente tolto da console non vede più il corso', async () => {
  const s = per('alunno@isarome.it');
  await s.iscriviti('AB12CD');
  await env.withSecurityRulesDisabled((ctx) => sdk.deleteDoc(sdk.doc(ctx.firestore(), 'iscrizioni/AB12CD_alunno@isarome.it')));
  assert.deepEqual(await s.elenca(), []);
});

test('email con maiuscole: iscrizione e elenco funzionano lo stesso', async () => {
  const s = per('Alunno@IsaRome.it');
  await s.iscriviti('AB12CD');
  assert.equal((await s.elenca()).length, 1);
});

test('un docente non si iscrive: messaggio chiaro, e anche senza il controllo del client le regole rifiutano', async () => {
  await env.withSecurityRulesDisabled((ctx) => sdk.setDoc(sdk.doc(ctx.firestore(), 'docenti/docente@isarome.it'), { attivo: true }));
  // client avvisato del ruolo
  await assert.rejects(per('docente@isarome.it', 'docente').iscriviti('AB12CD'), (e) => e.codice === 'docente');
  // client "ingannato" (ruolo studente): le regole lo fermano comunque
  await assert.rejects(per('docente@isarome.it', 'studente').iscriviti('AB12CD'), (e) => e.codice === 'rifiutato');
  // nessuna iscrizione è stata creata
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await sdk.getDocs(sdk.collection(ctx.firestore(), 'iscrizioni'));
    assert.equal(snap.size, 0);
  });
  // e il docente vede ancora i propri corsi come docente
  assert.ok((await per('docente@isarome.it', 'docente').elenca()).every((x) => x.ruolo === 'docente'));
});
