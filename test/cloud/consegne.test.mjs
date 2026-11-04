// Prova src/cloud/consegne.js contro le regole vere (emulatore Firestore).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { creaLavoriDocente, creaLavoroStudente } from '../../src/cloud/lavori.js';
import { creaConsegneStudente, creaConsegneDocente, ErroreConsegna } from '../../src/cloud/consegne.js';
import { verificaConfig } from '../../src/cloud/verifica-config.js';

sdk.setLogLevel('silent');
const L = verificaConfig.regole;
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8186').split(':');
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-isablock-consegne-dati',
    firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(() => env.cleanup());

const DOC = 'docente@isarome.it';
const [ANNA, BRUNO, CARLA, DARIO] = ['anna', 'bruno', 'carla', 'dario'].map((n) => `${n}@isarome.it`);
const fine = () => new Date(Date.now() + 3_600_000);
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await sdk.setDoc(sdk.doc(db, `docenti/${DOC}`), { attivo: true });
    await sdk.setDoc(sdk.doc(db, 'corsi/AB12CD'), { materia: 'Informatica', classe: '3AINF', annoScolastico: '2026/27', docenti: [DOC], iscrizioniAperte: true, attivo: true });
    for (const e of [ANNA, BRUNO, CARLA, DARIO]) await sdk.setDoc(sdk.doc(db, `iscrizioni/AB12CD_${e}`), { corsoId: 'AB12CD', email: e });
    await sdk.setDoc(sdk.doc(db, 'verifiche/v1'), { corsoId: 'AB12CD', titolo: 'Verifica di novembre', stato: 'aperta', fine: sdk.Timestamp.fromDate(fine()), tracciaDefault: 't0',
      creataDa: DOC, creato: sdk.Timestamp.now(), apertaIl: sdk.Timestamp.now(), chiusaIl: null });
    await sdk.setDoc(sdk.doc(db, 'verifiche/v1/tracce/t0'), { titolo: 'Traccia 1', testoMd: 'x', rev: 0, modificato: sdk.Timestamp.now() });
  });
});

const dbDi = (email) => env.authenticatedContext('u-' + email, { email, email_verified: true }).firestore();
const lavoriDoc = () => creaLavoriDocente({ sdk, db: dbDi(DOC) });
const consDoc = () => creaConsegneDocente({ sdk, db: dbDi(DOC) }, DOC);
const nomeDi = (e) => e.split('@')[0][0].toUpperCase() + e.split('@')[0].slice(1);
const salvaDi = (e) => creaLavoroStudente({ sdk, db: dbDi(e) }, e, nomeDi(e));
const consDi = (e) => creaConsegneStudente({ sdk, db: dbDi(e) }, e, nomeDi(e));
const stato = (s) => env.withSecurityRulesDisabled((ctx) => sdk.updateDoc(sdk.doc(ctx.firestore(), 'verifiche/v1'),
  s === 'chiusa' ? { stato: 'chiusa', chiusaIl: sdk.Timestamp.now() } : { stato: 'aperta', apertaIl: sdk.Timestamp.now() }));
const prog = (n) => JSON.stringify({ formatVersion: 6, blocks: { n } });
const iscritti = [ANNA, BRUNO, CARLA, DARIO];

test('lo studente consegna: lavoro e consegna insieme; non si riconsegna', async () => {
  await lavoriDoc().creaMancanti('v1', iscritti, { tracciaDefault: 't0', scadenza: fine() });
  await salvaDi(ANNA).salva('v1', { programma: prog(1), nBlocchi: 2 });
  const c = consDi(ANNA);
  assert.equal(await c.miaUltima('v1'), null);
  const fatta = await c.consegna('v1', { programma: prog(2), nBlocchi: 3 });
  assert.deepEqual([fatta.versione, fatta.origine, fatta.programma, fatta.tracciaId, fatta.titolo, fatta.corsoId],
    [1, 'studente', prog(2), 't0', 'Verifica di novembre', 'AB12CD']);
  const l = await salvaDi(ANNA).mio('v1');
  assert.deepEqual([l.consegnato, l.programma, l.nBlocchi], [true, prog(2), 3]);
  await assert.rejects(c.consegna('v1', {}), (e) => e instanceof ErroreConsegna && e.codice === 'gia');
  await assert.rejects(salvaDi(ANNA).salva('v1', { nBlocchi: 9 }), (e) => e.codice === 'negato');   // dopo la consegna non si scrive più
  // l'automatica a tempo scaduto vale come consegna
  await salvaDi(BRUNO).salva('v1', { programma: prog(5) });
  assert.equal((await consDi(BRUNO).consegna('v1', {}, { origine: 'automatica' })).origine, 'automatica');
});

test('consegna: nessun contenuto, tempo scaduto, studente non assegnato', async () => {
  await lavoriDoc().creaMancanti('v1', [ANNA, BRUNO], { tracciaDefault: 't0', scadenza: fine(), perStudente: { [BRUNO]: { scadenza: new Date(Date.now() - 120_000) } } });
  await assert.rejects(consDi(ANNA).consegna('v1', {}), (e) => e.codice === 'vuoto');            // mai entrata e senza programma
  await assert.rejects(consDi(BRUNO).consegna('v1', { programma: prog(1) }), (e) => e.codice === 'negato' && /scaduto|chiusa/.test(e.message));
  await assert.rejects(consDi(CARLA).consegna('v1', { programma: prog(1) }), (e) => e.codice === 'assente');
  await assert.rejects(consDi(ANNA).consegna('v1', { programma: 'x'.repeat(L.maxProgramma + 1) }), (e) => e.codice === 'programma');
  await assert.rejects(consDi(ANNA).consegna('v1', {}, { origine: 'raccolta' }), (e) => e.codice === 'dati');
  // la prima scrittura può essere la consegna stessa
  assert.equal((await consDi(ANNA).consegna('v1', { programma: prog(1) })).versione, 1);
});

test('lo studente vede solo le proprie consegne', async () => {
  await lavoriDoc().creaMancanti('v1', iscritti, { tracciaDefault: 't0', scadenza: fine() });
  await salvaDi(ANNA).salva('v1', { programma: prog(1) });
  await salvaDi(BRUNO).salva('v1', { programma: prog(2) });
  await consDi(ANNA).consegna('v1', {});
  await consDi(BRUNO).consegna('v1', {});
  assert.deepEqual((await consDi(ANNA).mie('v1')).map((c) => c.studenteEmail), [ANNA]);
  assert.deepEqual((await consDi(CARLA).mie('v1')), []);
});

test('raccolta: chi è entrato e non ha consegnato; rilanciandola non si duplica; dopo una modifica nasce la versione successiva', async () => {
  const ld = lavoriDoc();
  await ld.creaMancanti('v1', iscritti, { tracciaDefault: 't0', scadenza: fine() });
  await salvaDi(ANNA).salva('v1', { programma: prog(1) });
  await consDi(ANNA).consegna('v1', {});                          // consegna sua
  await salvaDi(DARIO).salva('v1', { programma: prog(7), nBlocchi: 4 });   // entrato, non consegna
  await salvaDi(BRUNO).salva('v1', { programma: prog(3) });
  await consDi(BRUNO).consegna('v1', {});
  await stato('chiusa');
  const cd = consDoc();
  const lavori = await ld.elenca('v1');
  const r = await cd.raccogli('v1', lavori);
  assert.deepEqual(r.create, [DARIO]);
  assert.deepEqual(r.giaAggiornati.sort(), [ANNA, BRUNO]);
  assert.deepEqual(r.nonEntrati, [CARLA]);
  assert.deepEqual(r.rifiutate, []);
  const ult = cd.ultimePerStudente(await cd.elenca('v1'));
  assert.deepEqual([ult[DARIO].origine, ult[DARIO].versione, ult[DARIO].programma, ult[DARIO].docenteEmail], ['raccolta', 1, prog(7), DOC]);
  const r2 = await cd.raccogli('v1', lavori);                      // rilanciata: niente di nuovo
  assert.deepEqual([r2.create, r2.giaAggiornati.length], [[], 3]);
  // riapertura per Dario: scrive ancora, poi la verifica si richiude e si raccoglie di nuovo
  await stato('aperta');
  await salvaDi(DARIO).salva('v1', { programma: prog(8) });
  await stato('chiusa');
  const r3 = await cd.raccogli('v1', await ld.elenca('v1'));
  assert.deepEqual(r3.create, [DARIO]);
  assert.deepEqual([cd.ultimePerStudente(await cd.elenca('v1'))[DARIO].versione, (await cd.elenca('v1')).filter((c) => c.studenteEmail === DARIO).length], [2, 2]);
});

test('raccolta: solo a verifica chiusa', async () => {
  const ld = lavoriDoc();
  await ld.creaMancanti('v1', [ANNA], { tracciaDefault: 't0', scadenza: fine() });
  await salvaDi(ANNA).salva('v1', { programma: prog(1) });
  const r = await consDoc().raccogli('v1', await ld.elenca('v1'));
  assert.deepEqual([r.create, r.rifiutate], [[], [ANNA]]);
});

test('file di emergenza: nuova versione, anche per chi non è mai entrato', async () => {
  const ld = lavoriDoc();
  await ld.creaMancanti('v1', iscritti, { tracciaDefault: 't0', scadenza: fine() });
  await salvaDi(ANNA).salva('v1', { programma: prog(1) });
  await consDi(ANNA).consegna('v1', {});
  await stato('chiusa');
  const cd = consDoc();
  const lavori = Object.fromEntries((await ld.elenca('v1')).map((l) => [l.email, l]));
  const file = { programma: prog(99), impronta: 'f00d', offlineDa: '10:42', nBlocchiSincronizzati: 14, nomeFile: 'rossi.anna_verifica_v2.isablock' };
  assert.equal(await cd.caricaFile('v1', lavori[ANNA], file), 2);                               // sopra la v1 dello studente
  assert.equal(await cd.caricaFile('v1', lavori[CARLA], { ...file, studenteNome: 'Carla Neri' }), 1);   // mai entrata
  const ult = cd.ultimePerStudente(await cd.elenca('v1'));
  assert.deepEqual([ult[ANNA].origine, ult[ANNA].programma, ult[ANNA].impronta, ult[ANNA].offlineDa, ult[ANNA].nBlocchiSincronizzati], ['file', prog(99), 'f00d', '10:42', 14]);
  assert.equal(ult[CARLA].studenteNome, 'Carla Neri');
  // la v1 dello studente è ancora lì, intatta
  assert.equal((await consDi(ANNA).mie('v1')).map((c) => c.origine).join(), 'studente,file');
  assert.equal((await consDi(ANNA).mie('v1'))[0].programma, prog(1));
});

test('file di emergenza: a verifica aperta è rifiutato, e il tetto di versioni c\'è', async () => {
  const ld = lavoriDoc();
  await ld.creaMancanti('v1', [ANNA], { tracciaDefault: 't0', scadenza: fine() });
  const lavoro = (await ld.elenca('v1'))[0];
  const file = { programma: prog(1), impronta: 'f00d', nomeFile: 'a.isablock' };
  await assert.rejects(consDoc().caricaFile('v1', lavoro, file), (e) => e instanceof ErroreConsegna && e.codice === 'negato');
  await stato('chiusa');
  for (let i = 1; i <= L.maxVersioniConsegna; i++) await consDoc().caricaFile('v1', lavoro, { ...file, programma: prog(i) });
  await assert.rejects(consDoc().caricaFile('v1', lavoro, file), (e) => e.codice === 'pieno');
});
