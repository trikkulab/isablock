// Prova src/cloud/lavori.js contro le regole vere (emulatore Firestore).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { creaLavoriDocente, creaLavoroStudente, ErroreLavoro } from '../../src/cloud/lavori.js';
import { verificaConfig } from '../../src/cloud/verifica-config.js';

sdk.setLogLevel('silent');
const L = verificaConfig.regole;
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8186').split(':');
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-isablock-lavori-dati',
    firestore: { host, port: Number(port), rules: readFileSync(process.env.REGOLE_FILE || 'firestore.rules', 'utf8') },
  });
});
after(() => env.cleanup());

const ANNA = 'anna@isarome.it';
const BRUNO = 'bruno@isarome.it';
const fine = () => new Date(Date.now() + 3_600_000);
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await sdk.setDoc(sdk.doc(db, 'docenti/docente@isarome.it'), { attivo: true });
    await sdk.setDoc(sdk.doc(db, 'corsi/AB12CD'), { materia: 'Informatica', classe: '3AINF', annoScolastico: '2026/27', docenti: ['docente@isarome.it'], iscrizioniAperte: true, attivo: true });
    for (const e of [ANNA, BRUNO, 'carla@isarome.it']) await sdk.setDoc(sdk.doc(db, `iscrizioni/AB12CD_${e}`), { corsoId: 'AB12CD', email: e });
    await sdk.setDoc(sdk.doc(db, 'verifiche/v1'), { corsoId: 'AB12CD', titolo: 'V', stato: 'aperta', fine: sdk.Timestamp.fromDate(fine()), tracciaDefault: 't0',
      creataDa: 'docente@isarome.it', creato: sdk.Timestamp.now(), apertaIl: sdk.Timestamp.now(), chiusaIl: null });
    for (const t of ['t0', 't1']) await sdk.setDoc(sdk.doc(db, `verifiche/v1/tracce/${t}`), { titolo: t, testoMd: 'x', rev: 0, modificato: sdk.Timestamp.now() });
  });
});

const dbDi = (email) => env.authenticatedContext('u-' + email, { email, email_verified: true }).firestore();
const docente = () => creaLavoriDocente({ sdk, db: dbDi('docente@isarome.it') });
const studente = (email = ANNA, nome = 'Anna Rossi') => creaLavoroStudente({ sdk, db: dbDi(email) }, email, nome);
const ISCRITTI = [ANNA, BRUNO, 'carla@isarome.it'];

test('il docente crea i lavori mancanti con traccia e scadenza; rilanciando non tocca quelli esistenti', async () => {
  const d = docente();
  const f = fine();
  const r = await d.creaMancanti('v1', ISCRITTI, { tracciaDefault: 't0', scadenza: f, perStudente: { [BRUNO]: { tracciaId: 't1', scadenza: new Date(f.getTime() + 600_000) } } });
  assert.deepEqual(r.create.sort(), [ANNA, BRUNO, 'carla@isarome.it'].sort());
  const elenco = await d.elenca('v1');
  assert.deepEqual(elenco.map((l) => [l.email, l.tracciaId, l.entrato, l.consegnato]),
    [[ANNA, 't0', null, false], [BRUNO, 't1', null, false], ['carla@isarome.it', 't0', null, false]]);
  assert.equal(elenco[1].scadenza.getTime() - elenco[0].scadenza.getTime(), 600_000);
  // si dà a Anna un'altra traccia, poi si rilancia con il default: Anna non viene azzerata
  await d.impostaTraccia('v1', ANNA, 't1');
  const r2 = await d.creaMancanti('v1', [...ISCRITTI, 'dario@isarome.it'], { tracciaDefault: 't0', scadenza: f });
  assert.deepEqual(r2.create, []);                                                       // Dario non è iscritto
  assert.deepEqual(r2.rifiutate, ['dario@isarome.it']);
  assert.equal((await d.elenca('v1'))[0].tracciaId, 't1');
});

test('tempo aggiuntivo: la scadenza si sposta in avanti, senza alcun motivo scritto', async () => {
  const d = docente();
  const f = fine();
  await d.creaMancanti('v1', [ANNA], { tracciaDefault: 't0', scadenza: f });
  const nuova = await d.aggiungiMinuti('v1', ANNA, 15);
  assert.ok(Math.abs(nuova.getTime() - (f.getTime() + 900_000)) < 1000);
  const l = (await d.elenca('v1'))[0];
  assert.ok(Math.abs(l.scadenza.getTime() - (f.getTime() + 900_000)) < 1000);
  await assert.rejects(d.aggiungiMinuti('v1', ANNA, 0), (e) => e instanceof ErroreLavoro && e.codice === 'dati');
  await assert.rejects(d.aggiungiMinuti('v1', BRUNO, 5), (e) => e.codice === 'assente');
  assert.equal(l.minutiExtra, 15, 'il tempo in più è un dato a sé');
  assert.deepEqual(Object.keys(await readCampi('v1', ANNA)).sort(), ['consegnato', 'entrato', 'minutiExtra', 'scadenza', 'studenteEmail', 'tracciaId']);
  await d.aggiungiMinuti('v1', ANNA, -40);                                                  // più indietro di quanto aveva: il tempo in più non scende sotto zero
  assert.equal((await d.elenca('v1'))[0].minutiExtra, 0);
});
async function readCampi(vid, email) {
  let dati;
  await env.withSecurityRulesDisabled(async (ctx) => { dati = (await sdk.getDoc(sdk.doc(ctx.firestore(), `verifiche/${vid}/lavori/${email}`))).data(); });
  return dati;
}

test('lo studente salva: il primo salvataggio è l\'ingresso, poi entrato resta', async () => {
  await docente().creaMancanti('v1', [ANNA], { tracciaDefault: 't0', scadenza: fine() });
  const s = studente();
  const prima = await s.mio('v1');
  assert.equal(prima.entrato, null);
  assert.equal(prima.tracciaId, 't0');
  await s.salva('v1', { programma: '{"formatVersion":6}', programmaHash: 'ab12', nBlocchi: 4, campioni: [{ t: 1, n: 4 }] });
  const dopo = await s.mio('v1');
  assert.ok(dopo.entrato instanceof Date && dopo.ultimoSegnale instanceof Date);
  assert.equal(dopo.programma, '{"formatVersion":6}');
  assert.equal(dopo.studenteNome, 'Anna Rossi');
  await s.salva('v1', { programma: '{"formatVersion":6,"b":1}', nBlocchi: 5 });
  await s.salva('v1', {});                                                                // solo battito
  const fin = await s.mio('v1');
  assert.equal(fin.entrato.getTime(), dopo.entrato.getTime());
  assert.equal(fin.nBlocchi, 5);
  assert.equal(fin.tracciaId, 't0');
  // una scheda nuova (cache vuota) riparte dall'entrato già scritto
  await studente().salva('v1', { nBlocchi: 6 });
  assert.equal((await s.mio('v1')).nBlocchi, 6);
});

test('lo studente: controlli locali e messaggi', async () => {
  await docente().creaMancanti('v1', [ANNA], { tracciaDefault: 't0', scadenza: fine() });
  const s = studente();
  await assert.rejects(s.salva('v1', { programma: 'x'.repeat(L.maxProgramma + 1) }), (e) => e.codice === 'programma');
  await s.salva('v1', { campioni: Array.from({ length: L.maxCampioni + 5 }, (_, i) => ({ t: i, n: i })) });   // si tengono gli ultimi
  const campioni = (await s.mio('v1')).campioni;
  assert.equal(campioni.length, L.maxCampioni);
  assert.equal(campioni.at(-1).t, L.maxCampioni + 4);
  await assert.rejects(studente(BRUNO).mio('v1'), (e) => e.codice === 'assente');          // nessun lavoro assegnato
});

test('traccia assegnata dopo l\'ingresso: non si cambia più, il tempo sì', async () => {
  const d = docente();
  await d.creaMancanti('v1', [ANNA], { tracciaDefault: 't0', scadenza: fine() });
  await studente().salva('v1', { nBlocchi: 1 });
  await assert.rejects(d.impostaTraccia('v1', ANNA, 't1'), (e) => e.codice === 'negato');
  await d.aggiungiMinuti('v1', ANNA, 10);
  await assert.rejects(d.togli('v1', ANNA), (e) => e.codice === 'negato');                 // è entrata
  await d.creaMancanti('v1', [BRUNO], { tracciaDefault: 't0', scadenza: fine() });
  await d.togli('v1', BRUNO);
  assert.deepEqual((await d.elenca('v1')).map((l) => l.email), [ANNA]);
});

test('scritture dopo la chiusura o a tempo scaduto: rifiutate con messaggio', async () => {
  const d = docente();
  await d.creaMancanti('v1', [ANNA, BRUNO], { tracciaDefault: 't0', scadenza: fine(), perStudente: { [BRUNO]: { scadenza: new Date(Date.now() - 120_000) } } });
  await assert.rejects(studente(BRUNO, 'Bruno').salva('v1', { nBlocchi: 1 }), (e) => e.codice === 'negato' && /scaduto|chiusa/.test(e.message));
  await d.aggiungiMinuti('v1', BRUNO, 10);
  await studente(BRUNO, 'Bruno').salva('v1', { nBlocchi: 1 });
  await env.withSecurityRulesDisabled((ctx) => sdk.updateDoc(sdk.doc(ctx.firestore(), 'verifiche/v1'), { stato: 'chiusa', chiusaIl: sdk.Timestamp.now() }));
  await assert.rejects(studente().salva('v1', { nBlocchi: 2 }), (e) => e.codice === 'negato');
});

test('salvataggi ravvicinati: `entrato` si manda solo nell\'ingresso, anche se una rilettura lo mostra ancora «vuoto»', async () => {
  await docente().creaMancanti('v1', [ANNA], { tracciaDefault: 't0', scadenza: fine() });
  // Una rilettura subito dopo una scrittura può dare la copia locale con la scrittura «in attesa»: entrato appare vuoto.
  const sdkVecchio = { ...sdk, getDoc: async (rif) => { const snap = await sdk.getDoc(rif); return { id: snap.id, metadata: snap.metadata, exists: () => snap.exists(), data: () => ({ ...snap.data(), entrato: null }) }; } };
  const s = creaLavoroStudente({ sdk: sdkVecchio, db: dbDi(ANNA) }, ANNA, 'Anna Rossi');
  await s.salva('v1', { nBlocchi: 1 });                                   // ingresso
  await s.mio('v1');                                                      // rilettura «vecchia»: entrato appare vuoto
  assert.equal(s.giaEntrato('v1'), true);                                  // ma lo studente risulta comunque entrato
  await s.salva('v1', { nBlocchi: 2 });                                   // senza la correzione rimanderebbe entrato e le regole rifiuterebbero
  await s.salva('v1', { nBlocchi: 3 });
  const l = await creaLavoroStudente({ sdk, db: dbDi(ANNA) }, ANNA, 'Anna').mio('v1');
  assert.equal(l.nBlocchi, 3);
  assert.ok(l.entrato instanceof Date);
});
