// Prova src/cloud/feedback.js contro le regole vere (emulatore Firestore): il docente commenta l'ultima versione di
// una consegna a verifica chiusa, la pubblica; lo studente legge solo i pubblicati.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { creaFeedback, ErroreFeedback, MAX_FEEDBACK_PER_CONSEGNA, riepilogoFeedback } from '../../src/cloud/feedback.js';

sdk.setLogLevel('silent');
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8186').split(':');
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-isablock-feedback-dati',
    firestore: { host, port: Number(port), rules: readFileSync(process.env.REGOLE_FILE || 'firestore.rules', 'utf8') },
  });
});
after(() => env.cleanup());

const fisso = sdk.Timestamp.fromMillis(1_700_000_000_000);
const ANNA = 'anna@isarome.it';
const dbDi = (uid, email) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const feedbackDi = (uid, email, nome = 'Prof') => creaFeedback({ sdk, db: dbDi(uid, email) }, { email, nome });
const docente = (email = 'docente@isarome.it') => feedbackDi('d-' + email, email, 'Docente Prova');
const studente = () => feedbackDi('anna', ANNA, 'Anna Rossi');
const consegna = (versione = 1) => ({ verificaId: 'v1', studenteEmail: ANNA, versione, corsoId: 'AB12CD' });

async function scenario({ stato = 'chiusa', versioni = [1] } = {}) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const e of ['docente@isarome.it', 'codocente@isarome.it', 'altro@isarome.it']) await sdk.setDoc(sdk.doc(db, `docenti/${e}`), { attivo: true });
    const base = { materia: 'Informatica', classe: '3AINF', annoScolastico: '2026/27', iscrizioniAperte: true, attivo: true };
    await sdk.setDoc(sdk.doc(db, 'corsi/AB12CD'), { ...base, docenti: ['docente@isarome.it', 'codocente@isarome.it'] });
    await sdk.setDoc(sdk.doc(db, 'corsi/ZZ99ZZ'), { ...base, docenti: ['altro@isarome.it'] });
    await sdk.setDoc(sdk.doc(db, `iscrizioni/AB12CD_${ANNA}`), { corsoId: 'AB12CD', email: ANNA });
    await sdk.setDoc(sdk.doc(db, 'verifiche/v1'), { corsoId: 'AB12CD', titolo: 'V', stato, tracciaDefault: 't0', creataDa: 'docente@isarome.it', creato: fisso });
    for (const v of versioni) await sdk.setDoc(sdk.doc(db, `verifiche/v1/consegne/${ANNA}_${v}`), { studenteEmail: ANNA, corsoId: 'AB12CD', versione: v, programma: '{}', creato: fisso });
  });
}

test('commenta: primo posto libero, blocco o intera consegna, come bozza e in ordine di scrittura', async () => {
  await scenario();
  const d = docente();
  const a = await d.commenta({ consegna: consegna(), bloccoId: 'blk1', bloccoTesto: 'SE x > 3', testo: '  Controlla la condizione ' });
  const b = await d.commenta({ consegna: consegna(), testo: 'Bel lavoro' });
  assert.equal(a, `v1_${ANNA}_1_0`);
  assert.equal(b, `v1_${ANNA}_1_1`);
  const lista = await d.perVerifica('v1');
  assert.deepEqual(lista.map((f) => f.testo), ['Controlla la condizione', 'Bel lavoro']);
  assert.equal(lista[0].bloccoId, 'blk1');
  assert.equal(lista[0].bloccoTesto, 'SE x > 3');
  assert.equal(lista[1].bloccoId, null);
  assert.ok(lista.every((f) => f.pubblicato === false && f.pubblicatoIl === null && f.modificatoDopo === false));
  assert.equal(lista[0].autoreNome, 'Docente Prova');
});

test('commenta: il posto di un commento cancellato si riusa; al tetto di 30 dà errore chiaro', async () => {
  await scenario();
  const d = docente();
  for (let k = 0; k < MAX_FEEDBACK_PER_CONSEGNA; k++) await d.commenta({ consegna: consegna(), testo: `c${k}` });
  await assert.rejects(d.commenta({ consegna: consegna(), testo: 'uno di troppo' }), (e) => e instanceof ErroreFeedback && e.codice === 'pieno');
  await d.elimina(`v1_${ANNA}_1_7`);
  assert.equal(await d.commenta({ consegna: consegna(), testo: 'nuovo' }), `v1_${ANNA}_1_7`);
});

test('commenta: testo vuoto o troppo lungo rifiutato prima di scrivere', async () => {
  await scenario();
  const d = docente();
  await assert.rejects(d.commenta({ consegna: consegna(), testo: '   ' }), (e) => e.codice === 'testo');
  await assert.rejects(d.commenta({ consegna: consegna(), testo: 'x'.repeat(501) }), (e) => e.codice === 'testo');
  assert.equal((await d.perVerifica('v1')).length, 0);
});

test('commenta: solo a verifica chiusa e solo sull\'ultima versione (errore «negato»)', async () => {
  await scenario({ stato: 'aperta' });
  await assert.rejects(docente().commenta({ consegna: consegna(), testo: 'x' }), (e) => e.codice === 'negato');
  await scenario({ versioni: [1, 2] });
  await assert.rejects(docente().commenta({ consegna: consegna(1), testo: 'x' }), (e) => e.codice === 'negato');
  await docente().commenta({ consegna: consegna(2), testo: 'ok' });
  await assert.rejects(studente().commenta({ consegna: consegna(2), testo: 'x' }), (e) => e.codice === 'negato');
  await assert.rejects(docente('altro@isarome.it').commenta({ consegna: consegna(2), testo: 'x' }), (e) => e.codice === 'negato');
});

test('pubblica: lo studente vede solo i pubblicati, di tutte le versioni; le bozze nuove restano bozze', async () => {
  await scenario({ versioni: [1, 2] });
  const d = docente();
  // v1 commentata e pubblicata quando era l'ultima: la scrivo senza regole, perché ora la v2 esiste già
  await env.withSecurityRulesDisabled((ctx) => sdk.setDoc(sdk.doc(ctx.firestore(), `feedback/v1_${ANNA}_1_0`), {
    verificaId: 'v1', studenteEmail: ANNA, versione: 1, corsoId: 'AB12CD', bloccoId: null, bloccoTesto: '', testo: 'vecchio',
    autoreEmail: 'docente@isarome.it', autoreNome: 'Docente Prova', creato: fisso, modificato: fisso, pubblicato: true, pubblicatoIl: fisso,
  }));
  await d.commenta({ consegna: consegna(2), testo: 'prima bozza' });
  await d.commenta({ consegna: consegna(2), testo: 'seconda bozza' });
  assert.deepEqual((await studente().mieiPubblicati('v1')).map((f) => f.testo), ['vecchio']);
  assert.equal(await d.pubblica(consegna(2)), 2);
  assert.equal(await d.pubblica(consegna(2)), 0);                         // niente da pubblicare
  await d.commenta({ consegna: consegna(2), testo: 'dopo la pubblicazione' });
  const viste = await studente().mieiPubblicati('v1');
  assert.deepEqual(viste.map((f) => f.testo).sort(), ['prima bozza', 'seconda bozza', 'vecchio']);
  assert.ok(viste.every((f) => f.pubblicato));
  assert.equal((await d.perVerifica('v1')).filter((f) => !f.pubblicato).length, 1);   // la bozza nuova resta bozza
  assert.equal(await d.pubblica(consegna(2)), 1);
});

test('modifica: dopo la pubblicazione compare «modificatoDopo»; solo l\'autore modifica, chi è del corso cancella', async () => {
  await scenario();
  const d = docente();
  const id = await d.commenta({ consegna: consegna(), testo: 'versione 1' });
  await d.modifica(id, 'versione 1 corretta');                            // ancora bozza: lo studente non l'ha vista
  await d.pubblica(consegna());
  assert.equal((await d.perVerifica('v1'))[0].modificatoDopo, false);
  await d.modifica(id, 'versione 2');
  const dopo = (await studente().mieiPubblicati('v1'))[0];
  assert.equal(dopo.testo, 'versione 2');
  assert.equal(dopo.modificatoDopo, true);
  await assert.rejects(docente('codocente@isarome.it').modifica(id, 'di un altro'), (e) => e.codice === 'negato');
  await assert.rejects(studente().elimina(id), (e) => e.codice === 'negato');
  await docente('codocente@isarome.it').elimina(id);
  assert.equal((await d.perVerifica('v1')).length, 0);
});

test('studente: a verifica riaperta non legge più niente; il docente di un altro corso nemmeno', async () => {
  await scenario();
  const d = docente();
  await d.commenta({ consegna: consegna(), testo: 'x' });
  await d.pubblica(consegna());
  assert.equal((await studente().mieiPubblicati('v1')).length, 1);
  await assert.rejects(docente('altro@isarome.it').perVerifica('v1'), (e) => e.codice === 'negato');
  await env.withSecurityRulesDisabled((ctx) => sdk.updateDoc(sdk.doc(ctx.firestore(), 'verifiche/v1'), { stato: 'aperta' }));
  await assert.rejects(studente().mieiPubblicati('v1'), (e) => e.codice === 'negato');
});

test('riepilogoFeedback: bozze, pubblicati e «versione nuova senza commenti»', () => {
  const f = (versione, pubblicato) => ({ versione, pubblicato });
  assert.deepEqual(riepilogoFeedback([], 1), { bozze: 0, pubblicati: 0, versioneSenzaCommenti: false });
  assert.deepEqual(riepilogoFeedback([f(1, true), f(1, false), f(1, false)], 1), { bozze: 2, pubblicati: 1, versioneSenzaCommenti: false });
  assert.deepEqual(riepilogoFeedback([f(1, true)], 2), { bozze: 0, pubblicati: 0, versioneSenzaCommenti: true });
  assert.deepEqual(riepilogoFeedback([f(1, true), f(2, false)], 2), { bozze: 1, pubblicati: 0, versioneSenzaCommenti: false });
  assert.deepEqual(riepilogoFeedback([f(1, true)], null), { bozze: 0, pubblicati: 0, versioneSenzaCommenti: false });
});
