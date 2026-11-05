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
    firestore: { host, port: Number(port), rules: readFileSync(process.env.REGOLE_FILE || 'firestore.rules', 'utf8') },
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
  await d.assegna(vid, CARLA, { minutiExtra: 5 });                              // solo tempo: traccia «di tutti» (vuota)
  const prima = Object.fromEntries((await d.lavori.elenca(vid)).map((l) => [l.email, l]));
  assert.deepEqual([prima[ANNA].tracciaId, prima[BRUNO].tracciaId, prima[CARLA].tracciaId], ['t1', 't1', null]);
  await d.apri(vid, { tracciaDefault: 't0' });
  const per = Object.fromEntries((await d.lavori.elenca(vid)).map((l) => [l.email, l]));
  assert.deepEqual([per[ANNA].tracciaId, per[BRUNO].tracciaId, per[CARLA].tracciaId], ['t1', 't1', 't0']);   // l'apertura risolve i vuoti e non azzera le assegnazioni
  assert.ok(vicino(per[BRUNO].scadenza.getTime(), fine.getTime() + 15 * 60000));
  assert.ok(vicino(per[ANNA].scadenza.getTime(), fine.getTime()));
  assert.ok(vicino(per[CARLA].scadenza.getTime(), fine.getTime() + 5 * 60000));
});

test('«di tutti» segue la traccia predefinita fino all\'apertura; una traccia scelta a mano resta, anche se coincide', async () => {
  const d = docente();
  const { vid } = await bozza(d);
  await d.verifiche.modifica(vid, { tracciaDefault: 't0' });
  await d.assegna(vid, ANNA, { tracciaId: 't0' });                              // scelta a mano, uguale a quella di tutti
  await d.assegna(vid, BRUNO, { minutiExtra: 10 });                             // solo tempo: «di tutti»
  await d.impostaTracciaDefault(vid, 't1');                                      // la traccia di tutti cambia
  await d.apri(vid);
  const per = Object.fromEntries((await d.lavori.elenca(vid)).map((l) => [l.email, l.tracciaId]));
  assert.deepEqual([per[ANNA], per[BRUNO], per[CARLA]], ['t0', 't1', 't1']);   // Anna tiene la sua; Bruno e Carla la nuova
});

test('assegna null: in bozza torna «di tutti», da aperta diventa la traccia predefinita', async () => {
  const d = docente();
  const { vid } = await bozza(d);
  await d.verifiche.modifica(vid, { tracciaDefault: 't0' });
  await d.assegna(vid, ANNA, { tracciaId: 't1' });
  await d.assegna(vid, ANNA, { tracciaId: null });
  assert.equal((await d.lavori.elenca(vid))[0].tracciaId, null);
  await d.apri(vid);
  await d.assegna(vid, ANNA, { tracciaId: 't1' });
  await d.assegna(vid, ANNA, { tracciaId: null });                              // da aperta non esiste «vuoto»
  assert.equal((await d.lavori.elenca(vid)).find((l) => l.email === ANNA).tracciaId, 't0');
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

test('riapertura: riprendono tutti, anche con la scadenza già passata; il tempo in più si conserva; poi nuova raccolta', async () => {
  const d = docente();
  const { vid } = await bozza(d);
  await d.apri(vid, { tracciaDefault: 't0' });
  await lavoroDi(BRUNO).salva(vid, { programma: prog(1) });
  await lavoroDi(CARLA).salva(vid, { programma: prog(1) });
  await d.tempoAggiuntivo(vid, BRUNO, 15);
  await d.tempoAggiuntivo(vid, CARLA, -(3 * 60));                                // Carla: scadenza nel passato
  await d.chiudi(vid, { raccogli: true });
  await assert.rejects(lavoroDi(CARLA).salva(vid, { programma: prog(2) }), (e) => e.codice === 'negato');   // chiusa
  const fine = tra(ORA);
  assert.equal((await d.riapri(vid, { fine })).sbloccati, 0);                    // nessuno aveva consegnato da sé: solo raccolti
  const lav = Object.fromEntries((await d.situazione(vid)).lavori.map((l) => [l.email, l]));
  assert.ok(vicino(lav[BRUNO].scadenza.getTime(), fine.getTime() + 15 * 60_000), 'Bruno conserva i suoi 15 minuti in più');
  assert.ok(vicino(lav[CARLA].scadenza.getTime(), fine.getTime()), 'Carla (tempo in meno) riparte dalla nuova fine, non prima');
  await lavoroDi(BRUNO).salva(vid, { programma: prog(2) });
  await lavoroDi(CARLA).salva(vid, { programma: prog(2) });
  await d.chiudi(vid);
  const esito = await d.raccogli(vid);
  assert.deepEqual([esito.create.sort(), esito.giaAggiornati], [[BRUNO, CARLA].sort(), []]);
  assert.equal((await d.situazione(vid)).ultime[BRUNO].versione, 2);
});

test('riapertura: chi aveva consegnato da solo viene sbloccato e riconsegna (v2); la v1 resta', async () => {
  const d = docente();
  const { vid } = await bozza(d);
  await d.apri(vid, { tracciaDefault: 't0' });
  await lavoroDi(ANNA).salva(vid, { programma: prog(1) });
  await consDi(ANNA).consegna(vid, {});
  await lavoroDi(BRUNO).salva(vid, { programma: prog(1) });
  await d.chiudi(vid);
  await assert.rejects(consDi(ANNA).consegna(vid, {}), (e) => e.codice === 'gia' || e.codice === 'negato');
  assert.equal((await d.riapri(vid, { fine: tra(ORA) })).sbloccati, 1);
  assert.equal((await d.situazione(vid)).lavori.find((l) => l.email === ANNA).consegnato, false);
  await lavoroDi(ANNA).salva(vid, { programma: prog(7) });
  await consDi(ANNA).consegna(vid, {});
  const mie = (await d.situazione(vid)).consegne.filter((c) => c.studenteEmail === ANNA);
  assert.deepEqual(mie.map((c) => [c.versione, c.origine]).sort(), [[1, 'studente'], [2, 'studente']]);
  assert.equal(mie.find((c) => c.versione === 2).programma, prog(7));
  assert.equal(mie.find((c) => c.versione === 1).programma, prog(1));
  assert.equal((await d.situazione(vid)).ultime[ANNA].versione, 2);
});

test('riapertura: solo una verifica chiusa e non archiviata', async () => {
  const d = docente();
  const { vid } = await bozza(d);
  await assert.rejects(d.riapri(vid, { fine: tra(ORA) }), (e) => e.codice === 'stato');   // bozza
  await d.apri(vid, { tracciaDefault: 't0' });
  await assert.rejects(d.riapri(vid, { fine: tra(ORA) }), (e) => e.codice === 'stato');   // aperta
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

test('eliminaTraccia: non si elimina se è assegnata a mano (il messaggio dice quanti); la traccia di tutti passa alla prima rimasta', async () => {
  const d = docente();
  const { vid } = await bozza(d);                                                 // t0, t1
  await d.verifiche.nuovaTraccia(vid, TR('Traccia 3'));                            // t2
  await d.verifiche.modifica(vid, { tracciaDefault: 't1' });
  await d.assegna(vid, ANNA, { tracciaId: 't2' });
  assert.deepEqual(await d.studentiConTraccia(vid, 't2'), [ANNA]);
  assert.deepEqual(await d.studentiConTraccia(vid, 't0'), []);
  await assert.rejects(d.eliminaTraccia(vid, 't2'), (e) => e.codice === 'assegnata' && e.message === '1 studente ha questa traccia: riassegnalo prima.' && e.studenti.join() === ANNA);
  await d.assegna(vid, BRUNO, { tracciaId: 't2' });
  await assert.rejects(d.eliminaTraccia(vid, 't2'), (e) => e.message === '2 studenti hanno questa traccia: riassegnali prima.');
  assert.equal((await d.verifiche.tracce(vid)).length, 3);                          // niente è stato toccato
  // chi ha «di tutti» (vuoto) non blocca: eliminando la traccia di tutti si riassegna da sola
  await d.assegna(vid, CARLA, { minutiExtra: 1 });
  await d.eliminaTraccia(vid, 't1');
  assert.equal((await d.verifiche.leggi(vid)).tracciaDefault, 't0');
  // riassegnati, la traccia si elimina; l'ultima traccia lascia la verifica senza traccia di tutti
  await d.assegna(vid, ANNA, { tracciaId: null }); await d.assegna(vid, BRUNO, { tracciaId: null });
  await d.eliminaTraccia(vid, 't2');
  await d.eliminaTraccia(vid, 't0');
  assert.equal((await d.verifiche.leggi(vid)).tracciaDefault, null);
  assert.equal((await d.verifiche.tracce(vid)).length, 0);
  await assert.rejects(d.apri(vid), (e) => e.codice === 'traccia');                 // senza traccia non si apre, anche con studenti assegnati
});

test('impattoUsaPerTutti: quanti l\'hanno a mano e quanti la riceverebbero', async () => {
  const d = docente();
  const { vid } = await bozza(d);
  await d.verifiche.modifica(vid, { tracciaDefault: 't0' });
  assert.deepEqual(await d.impattoUsaPerTutti(vid, 't1'), { amano: 0, riceveranno: 3 });   // nessuno ha assegnazioni: i 3 iscritti seguono «di tutti»
  await d.assegna(vid, ANNA, { tracciaId: 't1' });
  assert.deepEqual(await d.impattoUsaPerTutti(vid, 't1'), { amano: 1, riceveranno: 2 });   // Anna la tiene, la riceverebbero Bruno e Carla
  await d.assegna(vid, BRUNO, { tracciaId: 't0' });                                           // Bruno ha a mano la traccia che oggi è di tutti
  assert.deepEqual(await d.impattoUsaPerTutti(vid, 't1'), { amano: 1, riceveranno: 1 });
  assert.deepEqual(await d.impattoUsaPerTutti(vid, 't0'), { amano: 1, riceveranno: 1 });
});

test('apri si ferma se una traccia assegnata a mano non esiste più, senza cambiare niente', async () => {
  const d = docente();
  const { vid, fine } = await bozza(d);
  await d.assegna(vid, ANNA, { tracciaId: 't1' });
  await env.withSecurityRulesDisabled((ctx) => sdk.deleteDoc(sdk.doc(ctx.firestore(), `verifiche/${vid}/tracce/t1`)));   // sparita (per forza)
  await assert.rejects(d.apri(vid, { tracciaDefault: 't0', fine: new Date(fine.getTime() + ORA) }),
    (e) => e.codice === 'traccia' && e.message === 'La traccia assegnata a 1 studente non esiste più: riassegnala prima di aprire.');
  assert.equal((await d.verifiche.leggi(vid)).stato, 'bozza');
  assert.ok(vicino((await scadenze(d, vid))[ANNA], fine.getTime()));                // nemmeno le scadenze si sono mosse
});

test('eliminaVerifica: solo una bozza, con assegnazioni e tracce (niente orfani)', async () => {
  const d = docente();
  const { vid } = await bozza(d);
  await d.assegna(vid, ANNA, { tracciaId: 't1', minutiExtra: 10 });
  await d.assegna(vid, BRUNO, { minutiExtra: 5 });
  assert.deepEqual(await d.riepilogoEliminazione(vid), { tracce: 2, assegnazioni: 2 });
  // cosa c'è davvero nel database (saltando le regole), per accorgersi di eventuali orfani
  async function resti() {
    let n;
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      n = { lavori: (await sdk.getDocs(sdk.collection(db, `verifiche/${vid}/lavori`))).size, tracce: (await sdk.getDocs(sdk.collection(db, `verifiche/${vid}/tracce`))).size,
        verifica: (await sdk.getDoc(sdk.doc(db, `verifiche/${vid}`))).exists() ? 1 : 0 };
    });
    return n;
  }
  assert.deepEqual(await resti(), { lavori: 2, tracce: 2, verifica: 1 });
  await d.eliminaVerifica(vid);
  assert.deepEqual(await resti(), { lavori: 0, tracce: 0, verifica: 0 });
  // una aperta non si elimina
  const w = await bozza(d);
  await d.apri(w.vid, { tracciaDefault: 't0' });
  await assert.rejects(d.eliminaVerifica(w.vid), (e) => e.codice === 'stato');
  await d.chiudi(w.vid);
  await assert.rejects(d.eliminaVerifica(w.vid), (e) => e.codice === 'stato');
  assert.equal((await d.verifiche.leggi(w.vid)).stato, 'chiusa');
});

test('assegnazioni: una riga per iscritto, con traccia, minuti in più e stato', async () => {
  const d = docente();
  const { vid } = await bozza(d);
  await d.verifiche.modifica(vid, { tracciaDefault: 't0' });
  await d.assegna(vid, BRUNO, { tracciaId: 't1', minutiExtra: 15 });
  await d.assegna(vid, CARLA, { minutiExtra: 0 });
  const { righe, tracce, verifica } = await d.assegnazioni(vid);
  assert.deepEqual(tracce.map((t) => t.id), ['t0', 't1']);
  assert.equal(verifica.stato, 'bozza');
  assert.deepEqual(righe.map((r) => [r.email, r.assegnato, r.tracciaId, r.extraMinuti, r.entrato]),
    [[ANNA, false, null, 0, false], [BRUNO, true, 't1', 15, false], [CARLA, true, null, 0, false]]);
});

test('iscritti arrivati prima dell\'apertura seguono «di tutti»; dopo l\'apertura hanno la traccia predefinita esplicita', async () => {
  const d = docente();
  const { vid } = await bozza(d);
  await d.verifiche.modifica(vid, { tracciaDefault: 't0' });
  await d.aggiungiIscritti(vid);
  assert.deepEqual((await d.lavori.elenca(vid)).map((l) => l.tracciaId), [null, null, null]);
  await d.apri(vid);
  assert.deepEqual((await d.lavori.elenca(vid)).map((l) => l.tracciaId), ['t0', 't0', 't0']);
  await iscrivi(DARIO);
  await d.aggiungiIscritti(vid);
  assert.equal((await d.lavori.elenca(vid)).find((l) => l.email === DARIO).tracciaId, 't0');
});

test('un\'apertura interrotta a metà lascia i lavori «di tutti»: cambiando poi la traccia di tutti, seguono la nuova', async () => {
  const d = docente();
  const { vid } = await bozza(d);
  await d.verifiche.modifica(vid, { tracciaDefault: 't0' });
  // stessa operazione, ma con un batch che non riesce a confermare (rete caduta)
  const sdkRotto = { ...sdk, writeBatch: (db) => { const b = sdk.writeBatch(db); return { update: (...a) => b.update(...a), commit: async () => { throw Object.assign(new Error('rete'), { code: 'unavailable' }); } }; } };
  const rotto = creaVerificaDocente({ sdk: sdkRotto, db: dbDi(DOC) }, DOC);
  await assert.rejects(rotto.apri(vid), (e) => e.codice === 'rete');
  assert.equal((await d.verifiche.leggi(vid)).stato, 'bozza');
  assert.deepEqual((await d.lavori.elenca(vid)).map((l) => l.tracciaId), [null, null, null]);   // creati, ma non fissati su t0
  await d.impostaTracciaDefault(vid, 't1');
  await d.apri(vid);
  assert.deepEqual((await d.lavori.elenca(vid)).map((l) => l.tracciaId), ['t1', 't1', 't1']);
});

test('archivia: solo una verifica chiusa; una archiviata non si riapre finché non si ripristina', async () => {
  const d = docente();
  const { vid } = await bozza(d);
  await assert.rejects(d.archivia(vid), (e) => e.codice === 'stato');              // bozza
  await d.apri(vid, { tracciaDefault: 't0' });
  await assert.rejects(d.archivia(vid), (e) => e.codice === 'stato');              // aperta
  await d.chiudi(vid);
  assert.equal((await d.verifiche.leggi(vid)).archiviata, false);
  await d.archivia(vid);
  assert.equal((await d.verifiche.leggi(vid)).archiviata, true);
  await assert.rejects(d.riapri(vid, { fine: tra(ORA) }), (e) => e.codice === 'stato');   // archiviata: prima si ripristina
  await d.archivia(vid, false);
  assert.equal((await d.verifiche.leggi(vid)).archiviata, false);
  await d.riapri(vid, { fine: tra(ORA) });
  assert.equal((await d.verifiche.leggi(vid)).stato, 'aperta');
});

test('riepilogoApertura: studenti, tracce e quanti hanno una traccia o un tempo diversi', async () => {
  const d = docente();
  const { vid } = await bozza(d);
  await d.verifiche.modifica(vid, { tracciaDefault: 't0' });
  assert.deepEqual(await d.riepilogoApertura(vid), { titolo: 'Verifica di novembre', iscritti: 3, tracce: 2, tracciaPredefinita: 'Traccia 1', diversi: 0 });
  await d.assegna(vid, ANNA, { tracciaId: 't1' });                                 // traccia diversa
  await d.assegna(vid, BRUNO, { minutiExtra: 15 });                                // tempo diverso
  await d.assegna(vid, CARLA, { tracciaId: 't0' });                                // uguale a quella di tutti: non conta
  assert.equal((await d.riepilogoApertura(vid)).diversi, 2);
  await d.assegna(vid, ANNA, { minutiExtra: 10 });                                 // traccia E tempo diversi: conta una volta
  assert.equal((await d.riepilogoApertura(vid)).diversi, 2);
});
