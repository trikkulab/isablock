// Prova src/cloud/verifica-docente.js (le operazioni composte del docente) contro le regole vere.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { creaVerificaDocente } from '../../src/cloud/verifica-docente.js';
import { creaLavoroStudente } from '../../src/cloud/lavori.js';
import { creaConsegneStudente } from '../../src/cloud/consegne.js';
import { ErroreVerifica } from '../../src/cloud/verifiche.js';

sdk.setLogLevel('silent');
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8186').split(':');
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-isablock-verifica-docente',
    firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(() => env.cleanup());

const DOC = 'docente@isarome.it';
const [ANNA, BRUNO, CARLA, DARIO] = ['anna', 'bruno', 'carla', 'dario'].map((n) => `${n}@isarome.it`);
const ORA = 3_600_000;
const tra = (ms) => new Date(Date.now() + ms);
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const e of [DOC, 'collega@isarome.it']) await sdk.setDoc(sdk.doc(db, `docenti/${e}`), { attivo: true });
    await sdk.setDoc(sdk.doc(db, 'corsi/AB12CD'), { materia: 'Informatica', classe: '3AINF', annoScolastico: '2026/27', docenti: [DOC], iscrizioniAperte: true, attivo: true });
    for (const e of [ANNA, BRUNO, CARLA]) await sdk.setDoc(sdk.doc(db, `iscrizioni/AB12CD_${e}`), { corsoId: 'AB12CD', email: e });
  });
});

const dbDi = (email) => env.authenticatedContext('u-' + email, { email, email_verified: true }).firestore();
const docente = () => creaVerificaDocente({ sdk, db: dbDi(DOC) }, DOC);
const nomeDi = (e) => e.split('@')[0][0].toUpperCase() + e.split('@')[0].slice(1);
const lavoroDi = (e) => creaLavoroStudente({ sdk, db: dbDi(e) }, e, nomeDi(e));
const consDi = (e) => creaConsegneStudente({ sdk, db: dbDi(e) }, e, nomeDi(e));
const iscrivi = (e) => env.withSecurityRulesDisabled((ctx) => sdk.setDoc(sdk.doc(ctx.firestore(), `iscrizioni/AB12CD_${e}`), { corsoId: 'AB12CD', email: e }));
const prog = (n) => JSON.stringify({ formatVersion: 6, blocks: { n } });
const scadenze = async (d, vid) => Object.fromEntries((await d.lavori.elenca(vid)).map((l) => [l.email, l.scadenza.getTime()]));
const vicino = (a, b) => Math.abs(a - b) < 1000;     // i Timestamp hanno la precisione del millisecondo/secondo
const TR = (t) => ({ titolo: t, testoMd: `# ${t}\n\nScrivi un programma.` });

// Una bozza pronta: due tracce, fine tra 2 ore.
async function bozza(d, fine = tra(2 * ORA)) {
  const v = await d.crea('AB12CD', { titolo: 'Verifica di novembre', fine });
  await d.verifiche.nuovaTraccia(v.id, TR('Traccia 1'));
  await d.verifiche.nuovaTraccia(v.id, TR('Traccia 2'));
  return { vid: v.id, fine };
}

test('crea: la verifica nasce in bozza con la fine prevista', async () => {
  const d = docente();
  const v = await d.crea('AB12CD', { titolo: 'V', fine: tra(ORA) });
  assert.equal(v.stato, 'bozza');
  assert.ok(vicino(v.fine.getTime(), Date.now() + ORA));
  await assert.rejects(d.crea('AB12CD', { titolo: 'V', fine: new Date('boh') }), (e) => e.codice === 'fine');
  assert.equal((await d.crea('AB12CD', { titolo: 'Senza fine' })).fine, null);
});

test('apri: crea i lavori di tutti gli iscritti, con la traccia di default e la fine; poi la verifica è aperta', async () => {
  const d = docente();
  const { vid, fine } = await bozza(d);
  const r = await d.apri(vid, { tracciaDefault: 't0' });
  assert.deepEqual([r.iscritti, r.create.valueOf(), r.rifiutate], [3, 3, []]);
  const v = await d.verifiche.leggi(vid);
  assert.deepEqual([v.stato, v.tracciaDefault], ['aperta', 't0']);
  assert.ok(v.apertaIl instanceof Date);
  const lavori = await d.lavori.elenca(vid);
  assert.deepEqual(lavori.map((l) => [l.email, l.tracciaId, l.entrato, l.consegnato]), [[ANNA, 't0', null, false], [BRUNO, 't0', null, false], [CARLA, 't0', null, false]]);
  for (const l of lavori) assert.ok(vicino(l.scadenza.getTime(), fine.getTime()));
});

test('assegna in bozza: traccia diversa e tempo extra per uno studente, prima dell\'apertura', async () => {
  const d = docente();
  const { vid, fine } = await bozza(d);
  await d.assegna(vid, BRUNO, { tracciaId: 't1', minutiExtra: 15 });          // crea il lavoro
  await d.assegna(vid, ANNA, { tracciaId: 't1' });
  await d.assegna(vid, ANNA, { minutiExtra: 30 });                              // lo aggiorna
  await d.assegna(vid, ANNA, { minutiExtra: 0 });                               // torna alla fine prevista
  await assert.rejects(d.assegna(vid, DARIO, { tracciaId: 't0' }), (e) => e.codice === 'negato');   // non iscritto
  await assert.rejects(d.assegna(vid, CARLA, { minutiExtra: -5 }), (e) => e.codice === 'dati');
  await assert.rejects(d.assegna(vid, CARLA), (e) => e.codice === 'traccia');                       // niente traccia di default ancora
  await d.apri(vid, { tracciaDefault: 't0' });
  const per = Object.fromEntries((await d.lavori.elenca(vid)).map((l) => [l.email, l]));
  assert.deepEqual([per[ANNA].tracciaId, per[BRUNO].tracciaId, per[CARLA].tracciaId], ['t1', 't1', 't0']);   // l'apertura non azzera le assegnazioni
  assert.ok(vicino(per[BRUNO].scadenza.getTime(), fine.getTime() + 15 * 60000));
  assert.ok(vicino(per[ANNA].scadenza.getTime(), fine.getTime()));
  assert.ok(vicino(per[CARLA].scadenza.getTime(), fine.getTime()));
});

test('assegna richiede la fine prevista', async () => {
  const d = docente();
  const v = await d.crea('AB12CD', { titolo: 'Senza fine' });
  await d.verifiche.nuovaTraccia(v.id, TR('T'));
  await assert.rejects(d.assegna(v.id, ANNA, { tracciaId: 't0' }), (e) => e instanceof ErroreVerifica && e.codice === 'fine');
});

test('cambiaFine in bozza sposta tutte le scadenze, extra compresi', async () => {
  const d = docente();
  const { vid, fine } = await bozza(d);
  await d.assegna(vid, ANNA, { tracciaId: 't0' });
  await d.assegna(vid, BRUNO, { tracciaId: 't1', minutiExtra: 10 });
  const nuova = new Date(fine.getTime() + 90 * 60000);
  await d.cambiaFine(vid, nuova);
  const s = await scadenze(d, vid);
  assert.ok(vicino(s[ANNA], nuova.getTime()));
  assert.ok(vicino(s[BRUNO], nuova.getTime() + 10 * 60000));
  assert.ok(vicino((await d.verifiche.leggi(vid)).fine.getTime(), nuova.getTime()));
  await assert.rejects(d.cambiaFine(vid, new Date('boh')), (e) => e.codice === 'fine');
});

test('apri con una fine diversa: scadenze spostate e verifica aperta in un solo batch', async () => {
  const d = docente();
  const { vid, fine } = await bozza(d);
  await d.assegna(vid, BRUNO, { tracciaId: 't1', minutiExtra: 10 });
  const nuova = new Date(fine.getTime() + 2 * ORA);
  await d.apri(vid, { fine: nuova, tracciaDefault: 't0' });
  const s = await scadenze(d, vid);
  assert.ok(vicino(s[ANNA], nuova.getTime()));
  assert.ok(vicino(s[CARLA], nuova.getTime()));
  assert.ok(vicino(s[BRUNO], nuova.getTime() + 10 * 60000));
  const v = await d.verifiche.leggi(vid);
  assert.deepEqual([v.stato, v.fine.getTime() === nuova.getTime() || vicino(v.fine.getTime(), nuova.getTime())], ['aperta', true]);
});

test('apri con dati sbagliati non cambia niente; una volta aperta non si riapre; riprovando non si sposta due volte', async () => {
  const d = docente();
  const { vid } = await bozza(d);
  await d.assegna(vid, BRUNO, { tracciaId: 't1', minutiExtra: 10 });
  const prima = await scadenze(d, vid);
  await assert.rejects(d.apri(vid, { fine: tra(5 * ORA), tracciaDefault: 't9' }), (e) => e.codice === 'traccia');   // la traccia non esiste
  await assert.rejects(d.apri(vid, { fine: tra(-ORA), tracciaDefault: 't0' }), (e) => e.codice === 'fine');
  await assert.rejects(d.apri(vid, { fine: new Date('boh'), tracciaDefault: 't0' }), (e) => e.codice === 'fine');
  await assert.rejects(d.apri(vid, {}), (e) => e.codice === 'traccia');                                              // nessuna traccia di default
  assert.equal((await d.verifiche.leggi(vid)).stato, 'bozza');
  assert.deepEqual(await scadenze(d, vid), prima);
  const nuova = tra(5 * ORA);
  await d.apri(vid, { fine: nuova, tracciaDefault: 't0' });
  await assert.rejects(d.apri(vid, { fine: tra(6 * ORA), tracciaDefault: 't0' }), (e) => e.codice === 'stato');
  const s = await scadenze(d, vid);
  assert.ok(vicino(s[BRUNO], nuova.getTime() + 10 * 60000));
  assert.ok(vicino(s[ANNA], nuova.getTime()));
});

test('iscritti arrivati dopo l\'apertura: aggiungiIscritti crea solo i lavori che mancano', async () => {
  const d = docente();
  const { vid, fine } = await bozza(d);
  await d.apri(vid, { tracciaDefault: 't0' });
  await d.tempoAggiuntivo(vid, ANNA, 20);
  await iscrivi(DARIO);
  const r = await d.aggiungiIscritti(vid);
  assert.deepEqual(r.create, [DARIO]);
  const s = await scadenze(d, vid);
  assert.ok(vicino(s[DARIO], fine.getTime()));
  assert.ok(vicino(s[ANNA], fine.getTime() + 20 * 60000));           // chi c'era non viene toccato
  assert.deepEqual((await d.aggiungiIscritti(vid)).create, []);
});

test('durante la verifica: gli studenti lavorano, il docente dà tempo; poi chiude e raccoglie', async () => {
  const d = docente();
  const { vid } = await bozza(d);
  await d.apri(vid, { tracciaDefault: 't0' });
  await lavoroDi(ANNA).salva(vid, { programma: prog(1), nBlocchi: 3 });
  await consDi(ANNA).consegna(vid, { programma: prog(2) });                    // consegna di sua iniziativa
  await lavoroDi(BRUNO).salva(vid, { programma: prog(3), nBlocchi: 5 });         // lavora, non consegna
  const sit = await d.situazione(vid);                                          // Carla non entra
  assert.deepEqual(sit.lavori.map((l) => [l.email, !!l.entrato, l.consegnato]), [[ANNA, true, true], [BRUNO, true, false], [CARLA, false, false]]);
  assert.deepEqual(Object.keys(sit.ultime), [ANNA]);
  await assert.rejects(d.raccogli(vid), (e) => e.codice === 'stato');            // a verifica aperta non si raccoglie
  const esito = await d.chiudi(vid, { raccogli: true });
  assert.deepEqual([esito.create, esito.giaAggiornati, esito.nonEntrati], [[BRUNO], [ANNA], [CARLA]]);
  const dopo = await d.situazione(vid);
  assert.equal(dopo.verifica.stato, 'chiusa');
  assert.deepEqual(Object.entries(dopo.ultime).map(([e, c]) => [e, c.origine, c.versione]).sort(), [[ANNA, 'studente', 1], [BRUNO, 'raccolta', 1]]);
  assert.deepEqual((await d.raccogli(vid)).create, []);                          // rilanciata: niente di nuovo
});

test('riapertura: chi ha tempo aggiuntivo riprende, gli altri no; poi nuova raccolta', async () => {
  const d = docente();
  const { vid } = await bozza(d);
  await d.apri(vid, { tracciaDefault: 't0' });
  await lavoroDi(BRUNO).salva(vid, { programma: prog(1) });
  await lavoroDi(CARLA).salva(vid, { programma: prog(1) });
  await d.chiudi(vid, { raccogli: true });
  // Bruno e Carla avevano ancora tempo: dopo la riapertura riprendono tutti e due. Per dare tempo a Bruno
  // la scadenza personale si sposta all'indietro per Carla e in avanti per lui.
  await d.tempoAggiuntivo(vid, CARLA, -(3 * 60));                                // Carla: scadenza nel passato
  await d.riapri(vid, { fine: tra(ORA) });
  await d.tempoAggiuntivo(vid, BRUNO, 15);
  await lavoroDi(BRUNO).salva(vid, { programma: prog(2) });
  await assert.rejects(lavoroDi(CARLA).salva(vid, { programma: prog(2) }), (e) => e.codice === 'negato');
  await d.chiudi(vid);
  const esito = await d.raccogli(vid);
  assert.deepEqual([esito.create, esito.giaAggiornati], [[BRUNO], [CARLA]]);
  assert.equal((await d.situazione(vid)).ultime[BRUNO].versione, 2);
});

test('file di emergenza: nuova versione dopo la consegna, e per chi non è entrato', async () => {
  const d = docente();
  const { vid } = await bozza(d);
  await d.apri(vid, { tracciaDefault: 't0' });
  await lavoroDi(ANNA).salva(vid, { programma: prog(1) });
  await consDi(ANNA).consegna(vid, {});
  const file = { programma: prog(99), impronta: 'f00d', offlineDa: '10:42', nBlocchiSincronizzati: 14, nomeFile: 'a.isablock' };
  await assert.rejects(d.caricaFile(vid, ANNA, file), (e) => e.codice === 'negato');   // a verifica aperta no
  await d.chiudi(vid);
  assert.equal(await d.caricaFile(vid, ANNA, file), 2);
  assert.equal(await d.caricaFile(vid, CARLA, { ...file, studenteNome: 'Carla Neri' }), 1);
  await assert.rejects(d.caricaFile(vid, DARIO, file), (e) => e.codice === 'assente');   // nessun lavoro
});

test('errori di stato e permessi', async () => {
  const d = docente();
  const { vid } = await bozza(d);
  await assert.rejects(d.chiudi(vid), (e) => e.codice === 'negato');              // una bozza non si chiude
  await assert.rejects(d.raccogli(vid), (e) => e.codice === 'stato');
  await d.apri(vid, { tracciaDefault: 't0' });
  await assert.rejects(d.cambiaFine(vid, tra(-ORA)), (e) => e.codice === 'fine');
  await d.cambiaFine(vid, tra(4 * ORA));                                          // da aperta: solo il default
  await d.chiudi(vid);
  await assert.rejects(d.cambiaFine(vid, tra(4 * ORA)), (e) => e.codice === 'stato');
  await assert.rejects(d.assegna(vid, ANNA, { tracciaId: 't1' }), (e) => e.codice === 'stato');
  await assert.rejects(d.aggiungiIscritti(vid), (e) => e.codice === 'stato');
  const collega = creaVerificaDocente({ sdk, db: dbDi('collega@isarome.it') }, 'collega@isarome.it');
  await assert.rejects(collega.riapri(vid), (e) => e.codice === 'negato');         // docente di un altro corso
});
