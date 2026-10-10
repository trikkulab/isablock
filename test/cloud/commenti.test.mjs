// Prova src/cloud/commenti.js contro le regole vere (emulatore Firestore), insieme a
// sketch.js e condivisi.js: lo sketch lo salva lo studente, il docente lo trova
// nell'elenco dei condivisi e lo commenta.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { creaSketch } from '../../src/cloud/sketch.js';
import { creaCondivisi } from '../../src/cloud/condivisi.js';
import { creaCommenti, ErroreCommenti, MAX_COMMENTI_PER_SKETCH, nuoviPerSketch, dellaStessaCreazione } from '../../src/cloud/commenti.js';

sdk.setLogLevel('silent');
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8186').split(':');
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-isablock-commenti-dati',
    firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(() => env.cleanup());

const P = '{"formatVersion":6,"blocks":{}}';
const dbDi = (uid, email) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const studenteSketch = (uid, email) => creaSketch({ sdk, db: dbDi(uid, email) }, uid, { email, nome: 'Anna Rossi' });
const commentiDi = (uid, email, nome = 'Prof') => creaCommenti({ sdk, db: dbDi(uid, email) }, { uid, email, nome });
const docenteCommenti = (email = 'docente@isarome.it') => commentiDi('d-' + email, email, 'Docente Prova');
const ANNA = 'anna@isarome.it';

// Corso con un docente, Anna iscritta e uno sketch condiviso: ritorna lo sketch come lo vede il docente.
async function scenario() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const e of ['docente@isarome.it', 'codocente@isarome.it', 'altro@isarome.it']) await sdk.setDoc(sdk.doc(db, `docenti/${e}`), { attivo: true });
    const base = { materia: 'Informatica', classe: '3AINF', annoScolastico: '2026/27', iscrizioniAperte: true, attivo: true };
    await sdk.setDoc(sdk.doc(db, 'corsi/AB12CD'), { ...base, docenti: ['docente@isarome.it', 'codocente@isarome.it'] });
    await sdk.setDoc(sdk.doc(db, 'corsi/ZZ99ZZ'), { ...base, docenti: ['altro@isarome.it'] });
    await sdk.setDoc(sdk.doc(db, `iscrizioni/AB12CD_${ANNA}`), { corsoId: 'AB12CD', email: ANNA });
  });
  const s = studenteSketch('anna', ANNA);
  const { id } = await s.nuovo('drago', P);
  await s.condividi(id, 'AB12CD');
  const { sketch } = await creaCondivisi({ sdk, db: dbDi('d', 'docente@isarome.it') }).elenca('AB12CD');
  assert.equal(sketch.length, 1);
  return { s, id, sketch: sketch[0] };
}

test('commenta: primo posto libero, blocco o intero sketch, in ordine di scrittura', async () => {
  const { sketch, id } = await scenario();
  const d = docenteCommenti();
  const a = await d.commenta({ sketch, bloccoId: 'blk1', bloccoTesto: 'SE x > 3', testo: '  Controlla la condizione ' });
  const b = await d.commenta({ sketch, testo: 'Bel lavoro' });
  assert.equal(a, `${id}_0`);
  assert.equal(b, `${id}_1`);
  const lista = await d.perSketch({ sketchId: id, sketchCreato: sketch.creatoTs, corsoId: 'AB12CD' });
  assert.deepEqual(lista.map((c) => c.testo), ['Controlla la condizione', 'Bel lavoro']);
  assert.equal(lista[0].bloccoId, 'blk1');
  assert.equal(lista[0].bloccoTesto, 'SE x > 3');
  assert.equal(lista[1].bloccoId, null);
  assert.equal(lista[0].autoreNome, 'Docente Prova');
  assert.equal(lista[0].letto, false);
  // un codocente vede e aggiunge
  const c2 = await docenteCommenti('codocente@isarome.it').commenta({ sketch, testo: 'Anche io' });
  assert.equal(c2, `${id}_2`);
});

test('commenta: testo vuoto o troppo lungo, descrizione blocco tagliata, tetto di 30', async () => {
  const { sketch, id } = await scenario();
  const d = docenteCommenti();
  await assert.rejects(d.commenta({ sketch, testo: '  ' }), (e) => e instanceof ErroreCommenti && e.codice === 'testo');
  await assert.rejects(d.commenta({ sketch, testo: 'x'.repeat(501) }), (e) => e.codice === 'testo');
  await d.commenta({ sketch, bloccoId: 'b', bloccoTesto: 'y'.repeat(500), testo: 'ok' }); // taglia a 200
  assert.equal((await d.perSketch({ sketchId: id, sketchCreato: sketch.creatoTs, corsoId: 'AB12CD' }))[0].bloccoTesto.length, 200);
  for (let i = 1; i < MAX_COMMENTI_PER_SKETCH; i++) await d.commenta({ sketch, testo: `c${i}` });
  await assert.rejects(d.commenta({ sketch, testo: 'uno di troppo' }), (e) => e.codice === 'pieno');
  // cancellandone uno si libera il posto
  await d.elimina(`${id}_5`);
  assert.equal(await d.commenta({ sketch, testo: 'di nuovo' }), `${id}_5`);
});

test('chi non è docente del corso non commenta; sketch non più condiviso: né commenta né legge', async () => {
  const { sketch, id, s } = await scenario();
  await assert.rejects(docenteCommenti('altro@isarome.it').commenta({ sketch, testo: 'intruso' }), (e) => e.codice === 'negato');
  await assert.rejects(commentiDi('anna', ANNA).commenta({ sketch, testo: 'me lo scrivo' }), (e) => e.codice === 'negato');
  const d = docenteCommenti();
  await d.commenta({ sketch, testo: 'primo' });
  await s.condividi(id, null);
  await assert.rejects(d.commenta({ sketch, testo: 'dopo' }), (e) => e.codice === 'negato');
  await assert.rejects(d.perSketch({ sketchId: id, sketchCreato: sketch.creatoTs, corsoId: 'AB12CD' }), (e) => e instanceof ErroreCommenti);
  // lo studente invece continua a leggerli
  assert.equal((await commentiDi('anna', ANNA).mieiCommenti()).length, 1);
});

test('modifica ed elimina: solo i propri (modifica), anche di un collega (elimina)', async () => {
  const { sketch, id } = await scenario();
  const d = docenteCommenti();
  const cid = await d.commenta({ sketch, testo: 'prima' });
  await d.modifica(cid, ' dopo ');
  const q = { sketchId: id, sketchCreato: sketch.creatoTs, corsoId: 'AB12CD' };
  assert.equal((await d.perSketch(q))[0].testo, 'dopo');
  await assert.rejects(d.modifica(cid, ''), (e) => e.codice === 'testo');
  await assert.rejects(docenteCommenti('codocente@isarome.it').modifica(cid, 'riscritto'), (e) => e.codice === 'negato');
  await docenteCommenti('codocente@isarome.it').elimina(cid);
  assert.deepEqual(await d.perSketch(q), []);
});

test('studente: legge i propri commenti, li segna letti, non li cancella né li modifica', async () => {
  const { sketch, id } = await scenario();
  const d = docenteCommenti();
  await d.commenta({ sketch, bloccoId: 'b1', testo: 'uno' });
  await d.commenta({ sketch, testo: 'due' });
  const st = commentiDi('anna', ANNA);
  let mie = await st.mieiCommenti();
  assert.deepEqual(mie.map((c) => c.testo), ['uno', 'due']);
  assert.equal(nuoviPerSketch(mie).get(id), 2);
  await st.segnaLetti([mie[0].id]);
  mie = await st.mieiCommenti();
  assert.equal(nuoviPerSketch(mie).get(id), 1);
  assert.ok(dellaStessaCreazione(mie[0], sketch.creatoTs));
  await assert.rejects(st.elimina(mie[0].id), (e) => e.codice === 'negato');
  await assert.rejects(st.modifica(mie[0].id, 'riscritto'), (e) => e.codice === 'negato');
  // un altro studente non ne vede
  assert.deepEqual(await commentiDi('bruno', 'bruno@isarome.it').mieiCommenti(), []);
});

test('studente: eliminando lo sketch ripulisce i commenti orfani; con lo stesso id ricreato pure', async () => {
  const { sketch, id, s } = await scenario();
  const d = docenteCommenti();
  await d.commenta({ sketch, testo: 'uno' });
  await d.commenta({ sketch, testo: 'due' });
  const st = commentiDi('anna', ANNA);
  // con lo sketch al suo posto non c'è nulla da ripulire
  let sketchAttuali = await s.elenca();
  assert.equal(await st.ripulisciOrfani(await st.mieiCommenti(), sketchAttuali), 0);
  assert.equal((await st.mieiCommenti()).length, 2);
  // sketch eliminato e ricreato: stesso id, altra creazione
  await s.elimina(id);
  const { id: nuovoId } = await s.nuovo('altro', P);
  assert.equal(nuovoId, id);
  sketchAttuali = await s.elenca();
  const mie = await st.mieiCommenti();
  assert.equal(dellaStessaCreazione(mie[0], sketchAttuali[0].creatoTs), false);
  assert.equal(await st.ripulisciOrfani(mie, sketchAttuali), 2);
  assert.deepEqual(await st.mieiCommenti(), []);
});

test('studente: i commenti di uno sketch eliminato si cancellano, quelli di uno vivo no', async () => {
  const { sketch, id, s } = await scenario();
  await docenteCommenti().commenta({ sketch, testo: 'uno' });
  const st = commentiDi('anna', ANNA);
  const mie = await st.mieiCommenti();
  // finto elenco senza lo sketch: le regole rifiutano, perché lo sketch esiste ancora
  assert.equal(await st.ripulisciOrfani(mie, []), 0);
  assert.equal((await st.mieiCommenti()).length, 1);
  await s.elimina(id);
  assert.equal(await st.ripulisciOrfani(mie, []), 1);
});
