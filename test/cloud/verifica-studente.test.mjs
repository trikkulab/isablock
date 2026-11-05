// Il motore dello studente (src/cloud/verifica-studente.js) contro le regole vere, con un TEMPO SIMULATO:
// pausa di salvataggio, battito, campioni, consegna automatica e tempo aggiuntivo si provano senza aspettare.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { creaSessione, creaVerificheStudente, hashProgramma } from '../../src/cloud/verifica-studente.js';
import { verificaConfig } from '../../src/cloud/verifica-config.js';
import { creaBackupVerifica } from '../../src/verifica-backup.js';

sdk.setLogLevel('silent');
const C = verificaConfig.client;
const L = verificaConfig.regole;
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8186').split(':');
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-isablock-studente',
    firestore: { host, port: Number(port), rules: readFileSync(process.env.REGOLE_FILE || 'firestore.rules', 'utf8') },
  });
});
after(() => env.cleanup());

const ANNA = 'anna@isarome.it';
const BRUNO = 'bruno@isarome.it';
const CARLA = 'carla@isarome.it';
const MIN = 60_000;
const ts = (ms) => sdk.Timestamp.fromMillis(ms);
const admin = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const dbDi = (email) => env.authenticatedContext('u-' + email, { email, email_verified: true }).firestore();

beforeEach(async () => {
  await env.clearFirestore();
  await admin(async (db) => {
    await sdk.setDoc(sdk.doc(db, 'docenti/docente@isarome.it'), { attivo: true });
    await sdk.setDoc(sdk.doc(db, 'corsi/AB12CD'), { materia: 'Informatica', classe: '3AINF', annoScolastico: '2026/27', docenti: ['docente@isarome.it'], iscrizioniAperte: true, attivo: true });
    for (const e of [ANNA, BRUNO, CARLA]) await sdk.setDoc(sdk.doc(db, `iscrizioni/AB12CD_${e}`), { corsoId: 'AB12CD', email: e });
    await verifica('aperta');
    await assegna(ANNA); await assegna(BRUNO);                                   // Carla non ha l'assegnazione
  });
});

// verifica e assegnazioni (saltando le regole, come farebbe il docente)
async function verifica(stato, db = null, id = 'v1') {
  const fai = async (d) => {
    await sdk.setDoc(sdk.doc(d, `verifiche/${id}`), { corsoId: 'AB12CD', titolo: `Verifica ${id}`, stato, fine: ts(Date.now() + 60 * MIN), tracciaDefault: 't0',
      creataDa: 'docente@isarome.it', creato: sdk.Timestamp.now(), apertaIl: sdk.Timestamp.now(), chiusaIl: stato === 'chiusa' ? sdk.Timestamp.now() : null });
    await sdk.setDoc(sdk.doc(d, `verifiche/${id}/tracce/t0`), { titolo: 'Traccia', testoMd: 'x', rev: 0, modificato: sdk.Timestamp.now() });
  };
  return db ? fai(db) : admin(fai);
}
const assegna = (email, extra = {}, db = null) => {
  const fai = (d) => sdk.setDoc(sdk.doc(d, `verifiche/v1/lavori/${email}`), { studenteEmail: email, tracciaId: 't0', scadenza: ts(Date.now() + 60 * MIN), entrato: null, consegnato: false, ...extra });
  return db ? fai(db) : admin(fai);
};
const leggiLavoro = async (email = ANNA) => { let d; await admin(async (db) => { d = (await sdk.getDoc(sdk.doc(db, `verifiche/v1/lavori/${email}`))).data(); }); return d; };
const leggiConsegne = async () => { let r = []; await admin(async (db) => { r = (await sdk.getDocs(sdk.collection(db, 'verifiche/v1/consegne'))).docs.map((x) => ({ id: x.id, ...x.data() })); }); return r; };
const modifica = (email, dati) => admin((db) => sdk.updateDoc(sdk.doc(db, `verifiche/v1/lavori/${email}`), dati));
const finche = async (cond, ms = 5000) => { const i = Date.now(); while (Date.now() - i < ms) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };

// Tempo simulato: `avanza` porta avanti l'orologio eseguendo i timer in ordine, e dopo ognuno aspetta che le scritture finiscano.
function tempoSimulato() {
  let t = Date.now();
  let prossimo = 1;
  const timer = new Map();
  return {
    adesso: () => t,
    timeout(fn, ms) { const id = prossimo++; timer.set(id, { fn, scade: t + ms }); return id; },
    annulla(id) { timer.delete(id); },
    async avanza(ms, sessione) {
      const fine = t + ms;
      for (let giri = 0; ; giri++) {
        if (giri > 5000) throw new Error('tempo simulato: troppi timer in un colpo solo (ciclo infinito?)');
        const dovuti = [...timer.entries()].filter(([, v]) => v.scade <= fine).sort((a, b) => a[1].scade - b[1].scade);
        if (!dovuti.length) break;
        const [id, v] = dovuti[0];
        timer.delete(id);
        t = Math.max(t, v.scade);
        v.fn();
        await sessione.fermo();
      }
      t = fine;
    },
    quanti: () => timer.size,
  };
}

// Sessione di uno studente: conta le scritture del lavoro (le consegne passano da un batch, non da updateDoc).
function nuovaSessione(email = ANNA, extra = {}) {
  const tempo = tempoSimulato();
  const scritture = [];
  const sdkContato = { ...sdk, updateDoc: (rif, dati) => { if (rif.path.includes('/lavori/')) scritture.push(dati); return sdk.updateDoc(rif, dati); } };
  const cambi = [];
  const notifiche = [];
  // calibra: false: con l'orologio finto che salta, l'eco dal server non permette di stimare lo scarto (c'è un test a parte)
  const s = creaSessione({ sdk: sdkContato, db: dbDi(email) }, email, email.split('@')[0], 'v1', { tempo, onCambio: (c) => { cambi.push(c.stato); notifiche.push(c); }, calibra: false, ...extra });
  return { s, tempo, scritture, cambi, notifiche };
}
const P = (n) => JSON.stringify({ formatVersion: 6, blocks: { n } });

test('ingresso: la prima scrittura segna entrato e il primo campione; il timer parte dalla scadenza', async () => {
  const { s, scritture } = nuovaSessione();
  assert.equal(await s.avvia(), 'in-corso');
  assert.ok('entrato' in scritture[0], '`entrato` si manda solo nell\'ingresso');
  const d = await leggiLavoro();
  assert.ok(d.entrato && d.ultimoSegnale && d.studenteNome === 'anna');
  assert.equal(d.campioni.length, 1);
  assert.equal(scritture.length, 1);
  assert.ok(Math.abs(s.restanteMs() - 60 * MIN) < 5000, `restano ${s.restanteMs()} ms`);
  assert.equal(s.tracciaId(), 't0');
  s.termina();
});

test('senza modifiche non si scrive, tranne il battito: nessuna scrittura per un minuto', async () => {
  const { s, tempo, scritture } = nuovaSessione();
  await s.avvia();
  await tempo.avanza(C.battitoMs - 1000, s);
  assert.equal(scritture.length, 1);                                                           // solo l'ingresso
  s.termina();
});

test('pausa di salvataggio: la scrittura parte dopo debounce, con una sola scrittura per tante modifiche', async () => {
  const { s, tempo, scritture } = nuovaSessione();
  await s.avvia();
  s.aggiorna({ programma: P(1), nBlocchi: 3 });
  await tempo.avanza(C.debounceSalvataggioMs - 1000, s);
  assert.equal(scritture.length, 1);                                                           // ancora niente
  s.aggiorna({ programma: P(2), nBlocchi: 4 });                                                // altre modifiche nella stessa finestra
  s.aggiorna({ programma: P(3), nBlocchi: 5 });
  await tempo.avanza(2000, s);
  assert.equal(scritture.length, 2);
  const d = await leggiLavoro();
  assert.deepEqual([d.programma, d.programmaHash, d.nBlocchi], [P(3), hashProgramma(P(3)), 5]);   // l'ultima versione
  s.termina();
});

test('un programma uguale a quello già salvato non si riscrive', async () => {
  const { s, tempo, scritture } = nuovaSessione();
  await s.avvia();
  s.aggiorna({ programma: P(1), nBlocchi: 3 });
  await tempo.avanza(C.debounceSalvataggioMs + 100, s);
  const prima = scritture.length;
  s.aggiorna({ programma: P(1), nBlocchi: 3 });                                                 // nessun cambiamento vero
  await tempo.avanza(C.debounceSalvataggioMs * 2, s);
  assert.equal(scritture.length, prima);
  s.aggiorna({ programma: P(2), nBlocchi: 3 });                                                 // questo sì
  await tempo.avanza(C.debounceSalvataggioMs + 100, s);
  assert.equal(scritture.length, prima + 1);
  s.termina();
});

test('battito: dopo battitoMs senza altre scritture esce un segnale di vita, senza campi del programma', async () => {
  const { s, tempo, scritture } = nuovaSessione();
  await s.avvia();
  const prima = (await leggiLavoro()).ultimoSegnale.toMillis();
  await tempo.avanza(C.battitoMs + 100, s);
  assert.equal(scritture.length, 2);
  assert.deepEqual(Object.keys(scritture[1]).sort(), ['studenteNome', 'ultimoSegnale']);                // solo il segnale: niente programma, e `entrato` non si rimanda
  assert.ok((await leggiLavoro()).ultimoSegnale.toMillis() > prima);
  assert.equal(s.statistiche().battiti, 1);
  // una scrittura vera sposta il battito in avanti: non ne esce uno a ridosso
  s.aggiorna({ programma: P(1), nBlocchi: 1 });
  await tempo.avanza(C.debounceSalvataggioMs + 100, s);
  const dopoProgramma = scritture.length;
  await tempo.avanza(C.battitoMs - 5000, s);
  assert.equal(scritture.length, dopoProgramma);
  s.termina();
});

test('campioni: uno ogni campioneOgniMs dentro la scrittura che capita, in un anello di maxCampioni voci', async () => {
  await modifica(ANNA, { scadenza: ts(Date.now() + 240 * MIN) });                              // tempo abbondante: niente consegna automatica nel mezzo
  const { s, tempo } = nuovaSessione();
  await s.avvia();
  s.aggiorna({ programma: P(1), nBlocchi: 7 });
  await tempo.avanza(C.campioneOgniMs + C.battitoMs, s);
  let d = await leggiLavoro();
  assert.ok(d.campioni.length >= 2, `campioni: ${d.campioni.length}`);
  assert.equal(d.campioni.at(-1).n, 7);                                                         // il numero di blocchi di quel momento
  assert.ok(d.campioni.every((c, i) => i === 0 || c.t > d.campioni[i - 1].t));
  await tempo.avanza(C.campioneOgniMs * (L.maxCampioni + 4), s);
  d = await leggiLavoro();
  assert.equal(d.campioni.length, L.maxCampioni);                                              // l'anello non cresce
  s.termina();
});

test('consegna a mano: porta con sé anche l\'ultima versione non ancora salvata', async () => {
  const { s, cambi } = nuovaSessione();
  await s.avvia();
  s.aggiorna({ programma: P(9), nBlocchi: 6 });                                                 // ancora dentro la pausa di salvataggio
  const fatta = await s.consegna();
  assert.equal(s.stato(), 'consegnato');
  assert.deepEqual([fatta.versione, fatta.origine, fatta.programma], [1, 'studente', P(9)]);
  assert.equal((await leggiLavoro()).consegnato, true);
  assert.equal((await leggiLavoro()).programma, P(9));
  assert.deepEqual(cambi.filter((c) => c !== 'in-corso'), ['consegnato']);
  assert.equal(await s.consegna(), null);                                                       // una seconda volta non fa niente
  s.termina();
});

test('consegna automatica allo scadere del tempo, con ciò che c\'è', async () => {
  await modifica(ANNA, { scadenza: ts(Date.now() + 90_000) });
  const { s, tempo } = nuovaSessione();
  await s.avvia();
  s.aggiorna({ programma: P(4), nBlocchi: 2 });
  await tempo.avanza(60_000, s);
  assert.equal(s.stato(), 'in-corso');
  await tempo.avanza(35_000, s);
  assert.equal(s.stato(), 'consegnato');
  const c = (await leggiConsegne())[0];
  assert.deepEqual([c.origine, c.versione, c.programma], ['automatica', 1, P(4)]);
  s.termina();
});

test('tempo aggiuntivo dato dal docente durante la verifica: la consegna automatica slitta', async () => {
  await modifica(ANNA, { scadenza: ts(Date.now() + 90_000) });
  const { s, tempo } = nuovaSessione();
  await s.avvia();
  s.aggiorna({ programma: P(1), nBlocchi: 1 });                                                 // l'interfaccia comunica sempre il programma
  const prima = s.scadenza().getTime();
  await modifica(ANNA, { scadenza: ts(prima + 10 * MIN) });                                    // il docente dà 10 minuti
  assert.ok(await finche(() => s.scadenza().getTime() === prima + 10 * MIN), 'la sessione deve accorgersi del nuovo tempo');
  await tempo.avanza(100_000, s);                                                               // oltre la vecchia scadenza
  assert.equal(s.stato(), 'in-corso');
  assert.ok(s.restanteMs() > 8 * MIN);
  await tempo.avanza(10 * MIN, s);
  assert.equal(s.stato(), 'consegnato');
  s.termina();
});

test('il docente chiude la verifica: la sessione si ferma, senza altre scritture né timer', async () => {
  const { s, tempo, scritture } = nuovaSessione();
  await s.avvia();
  await admin((db) => sdk.updateDoc(sdk.doc(db, 'verifiche/v1'), { stato: 'chiusa', chiusaIl: sdk.Timestamp.now() }));
  assert.ok(await finche(() => s.stato() === 'terminata'), 'deve accorgersi della chiusura');
  assert.equal(tempo.quanti(), 0);
  const prima = scritture.length;
  s.aggiorna({ programma: P(5), nBlocchi: 1 });
  await tempo.avanza(C.battitoMs * 3, s);
  assert.equal(scritture.length, prima);
  s.termina();
});

test('scrittura rifiutata (tempo finito oltre la grazia): la verifica per lo studente è terminata', async () => {
  const { s, tempo } = nuovaSessione();
  await s.avvia();
  await modifica(ANNA, { scadenza: ts(Date.now() - (L.graziaSecondi + 60) * 1000) });
  assert.ok(await finche(() => s.scadenza().getTime() < Date.now() - L.graziaSecondi * 1000));
  s.aggiorna({ programma: P(6), nBlocchi: 1 });
  await tempo.avanza(C.debounceSalvataggioMs + 100, s);
  await s.fermo();
  assert.equal(s.stato(), 'terminata');
  s.termina();
});

test('consegnato da un\'altra scheda: questa se ne accorge e si ferma', async () => {
  const a = nuovaSessione();
  await a.s.avvia();
  const b = nuovaSessione();
  await b.s.avvia();
  a.s.aggiorna({ programma: P(7), nBlocchi: 1 });
  await a.s.consegna();
  assert.ok(await finche(() => b.s.stato() === 'consegnato'), 'l\'altra scheda deve accorgersene');
  a.s.termina(); b.s.termina();
});

test('ripresa dopo un ricaricamento: si riparte dal lavoro salvato e dalla stessa scadenza', async () => {
  const a = nuovaSessione();
  await a.s.avvia();
  a.s.aggiorna({ programma: P(8), nBlocchi: 4, esecuzioni: { n: 2, esito: 'ok', quando: Date.now() } });
  await a.tempo.avanza(C.debounceSalvataggioMs + 100, a.s);
  a.s.termina();
  const b = nuovaSessione();                                                                    // nuova pagina, stato in memoria perso
  await b.s.avvia();
  const d = await leggiLavoro();
  assert.deepEqual([d.programma, d.esecuzioni.n, d.esecuzioni.esito], [P(8), 2, 'ok']);
  assert.equal(b.scritture.length, 1);                                                          // all'ingresso scrive solo il segnale: il programma è già lì
  assert.deepEqual(Object.keys(b.scritture[0]).sort().includes('programma'), false);
  // e sa cosa c'è già nel database: lo stesso programma, comunicato dall'interfaccia, non si riscrive
  b.s.aggiorna({ programma: P(8), nBlocchi: 4, esecuzioni: { n: 2, esito: 'ok', quando: d.esecuzioni.quando } });
  await b.tempo.avanza(C.debounceSalvataggioMs * 2, b.s);
  assert.equal(b.scritture.length, 1);
  b.s.termina();
});

test('verificheDaFare: solo le aperte con assegnazione, non consegnate e con il tempo non finito', async () => {
  await admin(async (db) => {
    await assegna(BRUNO, { consegnato: true }, db);                                             // già consegnata
    await verifica('aperta', db, 'v2');
    await sdk.setDoc(sdk.doc(db, `verifiche/v2/lavori/${ANNA}`), { studenteEmail: ANNA, tracciaId: 't0', scadenza: ts(Date.now() - 10 * MIN), entrato: null, consegnato: false });   // tempo finito
    await verifica('chiusa', db, 'v3');
    await sdk.setDoc(sdk.doc(db, `verifiche/v3/lavori/${ANNA}`), { studenteEmail: ANNA, tracciaId: 't0', scadenza: ts(Date.now() + 10 * MIN), entrato: null, consegnato: false });  // chiusa
    await verifica('bozza', db, 'v4');                                                          // in bozza: non si vede nemmeno
  });
  const per = (email) => creaVerificheStudente({ sdk, db: dbDi(email) }, email, email.split('@')[0]);
  assert.deepEqual((await per(ANNA).daFare(['AB12CD'])).map((x) => x.verifica.id), ['v1']);
  assert.deepEqual(await per(BRUNO).daFare(['AB12CD']), []);                                    // consegnata
  assert.deepEqual(await per(CARLA).daFare(['AB12CD']), []);                                    // nessuna assegnazione
  await assert.rejects(per(ANNA).daFare(['CH7Z9Q']), (e) => e.codice === 'negato');             // un corso che non vede: è un errore, non «nessuna» (l'interfaccia riprova, poi rinuncia)
});

test('ascoltaAperte: avvisa quando una verifica si apre o si chiude', async () => {
  const per = creaVerificheStudente({ sdk, db: dbDi(ANNA) }, ANNA, 'anna');
  const viste = [];
  const smetti = per.ascoltaAperte(['AB12CD'], (ids) => viste.push([...ids].sort()));
  assert.ok(await finche(() => viste.length > 0));
  assert.deepEqual(viste.at(-1), ['v1']);
  await verifica('aperta', null, 'v2');
  assert.ok(await finche(() => JSON.stringify(viste.at(-1)) === '["v1","v2"]'), 'deve vedere anche la nuova');
  await admin((db) => sdk.updateDoc(sdk.doc(db, 'verifiche/v1'), { stato: 'chiusa', chiusaIl: sdk.Timestamp.now() }));
  assert.ok(await finche(() => JSON.stringify(viste.at(-1)) === '["v2"]'), 'e non più quella chiusa');
  smetti();
});

test('l\'orologio del PC è sbagliato di 5 minuti: il timer segue comunque l\'ora del server', async () => {
  const SBAGLIO = 5 * MIN;
  const tempo = { adesso: () => Date.now() + SBAGLIO, timeout: (fn, ms) => setTimeout(fn, ms), annulla: (id) => clearTimeout(id) };   // PC avanti di 5 minuti
  const s = creaSessione({ sdk, db: dbDi(ANNA) }, ANNA, 'anna', 'v1', { tempo });
  try {                                                                                         // i timer sono veri: si spengono comunque, anche se un controllo fallisce
    await s.avvia();
    assert.ok(await finche(() => Math.abs(s.offset() + SBAGLIO) < 3000), `scarto stimato: ${Math.round(s.offset())} ms (atteso circa ${-SBAGLIO})`);
    const realeRimasto = 60 * MIN;                                                              // la scadenza è tra un'ora, sull'ora del server
    assert.ok(Math.abs(s.restanteMs() - realeRimasto) < 8000, `restano ${Math.round(s.restanteMs() / 1000)} s`);
    const ingenuo = s.scadenza().getTime() - tempo.adesso();                                    // senza correzione si sbaglierebbe di 5 minuti
    assert.ok(Math.abs(ingenuo - (realeRimasto - SBAGLIO)) < 8000);
  } finally {
    s.termina();
  }
});

test('consegna automatica che non riesce al primo colpo (rete): si riprova e poi riesce', async () => {
  await modifica(ANNA, { scadenza: ts(Date.now() + 90_000) });
  let tentativi = 0;
  const sdkRete = { ...sdk, writeBatch: (db) => { const b = sdk.writeBatch(db); return { update: (...a) => b.update(...a), set: (...a) => b.set(...a),
    commit: async () => { if (++tentativi === 1) throw Object.assign(new Error('rete'), { code: 'unavailable' }); return b.commit(); } }; } };
  const tempo = tempoSimulato();
  const s = creaSessione({ sdk: sdkRete, db: dbDi(ANNA) }, ANNA, 'anna', 'v1', { tempo, calibra: false });
  await s.avvia();
  s.aggiorna({ programma: P(1), nBlocchi: 1 });
  await tempo.avanza(91_000, s);
  assert.equal(s.stato(), 'in-corso');                                                          // il primo tentativo è fallito
  assert.equal(tentativi, 1);
  await tempo.avanza(C.riprovaConsegnaMs + 100, s);
  assert.equal(s.stato(), 'consegnato');
  assert.equal(tentativi, 2);
  assert.equal((await leggiConsegne())[0].origine, 'automatica');
  s.termina();
});

test('senza niente da consegnare e con il tempo finito: si riprova fino alla grazia, poi la verifica è terminata', async () => {
  await modifica(ANNA, { scadenza: ts(Date.now() + 90_000) });
  const { s, tempo } = nuovaSessione();                                                         // nessun programma comunicato e nessuno salvato
  await s.avvia();
  await tempo.avanza(91_000, s);
  assert.equal(s.stato(), 'in-corso');                                                          // ci prova, ma «non c'è niente da consegnare»
  await assert.rejects(s.consegna(), (e) => e.codice === 'vuoto');
  await tempo.avanza((L.graziaSecondi + 10) * 1000, s);
  assert.equal(s.stato(), 'terminata');                                                         // passata la grazia le regole non accetterebbero più
  assert.equal(tempo.quanti(), 0);
  s.termina();
});

test('una scrittura rifiutata dalle regole (verifica chiusa) ferma la sessione, anche se nessun ascolto se ne è accorto', async () => {
  const sdkSenzaAscolti = { ...sdk, onSnapshot: () => () => {} };                                // la sessione non vede le modifiche del docente
  const tempo = tempoSimulato();
  const s = creaSessione({ sdk: sdkSenzaAscolti, db: dbDi(ANNA) }, ANNA, 'anna', 'v1', { tempo, calibra: false });
  await s.avvia();
  await admin((db) => sdk.updateDoc(sdk.doc(db, 'verifiche/v1'), { stato: 'chiusa', chiusaIl: sdk.Timestamp.now() }));
  s.aggiorna({ programma: P(1), nBlocchi: 1 });
  await tempo.avanza(C.debounceSalvataggioMs + 100, s);
  assert.equal(s.stato(), 'terminata');                                                         // la scrittura è stata rifiutata
  assert.equal(tempo.quanti(), 0);                                                              // e non resta niente in programma
  s.termina();
});

test('«consegnato» conta solo se confermato dal server: una scrittura locale ancora in attesa non basta', async () => {
  const ascolti = [];
  const sdkFinto = { ...sdk, onSnapshot: (rif, cb) => { ascolti.push({ percorso: rif.path, cb }); return () => {}; } };
  const tempo = tempoSimulato();
  const s = creaSessione({ sdk: sdkFinto, db: dbDi(ANNA) }, ANNA, 'anna', 'v1', { tempo, calibra: false });
  await s.avvia();
  const lavoroListener = ascolti.find((a) => a.percorso.endsWith(`/lavori/${ANNA}`)).cb;
  const snap = (inAttesa) => ({ exists: () => true, metadata: { hasPendingWrites: inAttesa },
    data: () => ({ consegnato: true, tracciaId: 't0', scadenza: ts(Date.now() + 60 * MIN), ultimoSegnale: null }) });
  lavoroListener(snap(true));                                       // la nostra scrittura, ancora non confermata dal server
  assert.equal(s.stato(), 'in-corso');
  lavoroListener(snap(false));                                      // ora confermata
  assert.equal(s.stato(), 'consegnato');
  s.termina();
});

test('verificheDaFare: un errore nel controllo non diventa «nessuna verifica»', async () => {
  const sdkRotto = { ...sdk, getDocs: () => Promise.reject(Object.assign(new Error('rete'), { code: 'unavailable' })) };
  const per = creaVerificheStudente({ sdk: sdkRotto, db: dbDi(ANNA) }, ANNA, 'anna');
  await assert.rejects(per.daFare(['AB12CD']), (e) => e.codice === 'rete');                    // non risponde [] come se non ci fosse niente
});

test('alla consegna automatica chi ascolta vede subito l\'origine «automatica» (anche se il server conferma prima)', async () => {
  await modifica(ANNA, { scadenza: ts(Date.now() + 90_000) });
  const { s, tempo, notifiche } = nuovaSessione();
  await s.avvia();
  s.aggiorna({ programma: P(1), nBlocchi: 1 });
  await tempo.avanza(95_000, s);
  const finale = notifiche.find((c) => c.stato === 'consegnato');
  assert.ok(finale, 'deve esserci la notifica «consegnato»');
  assert.equal(finale.origine, 'automatica');                                                   // non null: l'interfaccia dice «Tempo scaduto», non «Lavoro consegnato»
  s.termina();
});

test('una consegna che fallisce non lascia un\'origine finta', async () => {
  const sdkRotto = { ...sdk, writeBatch: () => ({ update() {}, set() {}, commit: async () => { throw Object.assign(new Error('rete'), { code: 'unavailable' }); } }) };
  const tempo = tempoSimulato();
  const s = creaSessione({ sdk: sdkRotto, db: dbDi(ANNA) }, ANNA, 'anna', 'v1', { tempo, calibra: false });
  await s.avvia();
  s.aggiorna({ programma: P(1), nBlocchi: 1 });
  await assert.rejects(s.consegna({ origine: 'studente' }), (e) => e.codice === 'rete');
  assert.equal(s.stato(), 'in-corso');
  assert.equal(s.origine(), null);
  s.termina();
});

// ── Copia locale e traccia ──────────────────────────────────────────────────
function storageFinto() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i], get length() { return m.size; } };
}
const copiaDi = (st, email = ANNA) => creaBackupVerifica({ uid: 'u-' + email, vid: 'v1', email, getStorage: () => st });
const modificaTraccia = (dati) => admin((db) => sdk.updateDoc(sdk.doc(db, 'verifiche/v1/tracce/t0'), { modificato: sdk.Timestamp.now(), ...dati }));

test('copia locale: si scrive poco dopo la modifica (prima del database) e dopo la scrittura sul database ne ricorda l\'hash', async () => {
  const st = storageFinto();
  const { s, tempo } = nuovaSessione(ANNA, { backup: copiaDi(st) });
  await s.avvia();
  s.aggiorna({ programma: P(1), nBlocchi: 1 });
  await tempo.avanza(C.backupLocaleMs + 100, s);
  const b = copiaDi(st).leggi();
  assert.equal(b.programma, P(1));
  assert.equal(b.hash, hashProgramma(P(1)));
  assert.notEqual(b.hashBase, b.hash, 'il database non ha ancora questo programma');
  assert.equal((await leggiLavoro()).programma ?? null, null);
  await tempo.avanza(C.debounceSalvataggioMs + 100, s);
  assert.equal(copiaDi(st).leggi().hashBase, hashProgramma(P(1)), 'scritto sul database: la base si allinea');
  s.termina();
});

test('ripresa: la copia ha modifiche che il database non ha e il database è fermo → si riparte dalla copia e si scrive', async () => {
  const st = storageFinto();
  const a = nuovaSessione(ANNA, { backup: copiaDi(st) });
  await a.s.avvia();
  a.s.aggiorna({ programma: P(1), nBlocchi: 1 });
  await a.tempo.avanza(C.debounceSalvataggioMs + 100, a.s);          // sul database c'è P(1)
  a.s.aggiorna({ programma: P(2), nBlocchi: 2 });
  await a.tempo.avanza(C.backupLocaleMs + 100, a.s);                  // la copia ha P(2), il database no
  a.s.termina();                                                      // la rete cade / si ricarica: P(2) non è partito
  assert.equal((await leggiLavoro()).programma, P(1));
  const b = nuovaSessione(ANNA, { backup: copiaDi(st) });
  await b.s.avvia();
  assert.equal(b.s.ripresa(), 'locale');
  assert.equal(b.s.programmaSalvato(), P(2));
  assert.equal((await leggiLavoro()).programma, P(2), 'l\'ingresso scrive il programma della copia');
  b.s.termina();
});

test('ripresa: il database è cambiato dopo la copia (altra scheda o PC) → vince il database', async () => {
  const st = storageFinto();
  copiaDi(st).salva({ finoA: Date.now() + 3600_000, programma: P(5), hash: hashProgramma(P(5)), hashBase: hashProgramma(P(0)), nBlocchi: 5 });
  await modifica(ANNA, { programma: P(1), programmaHash: hashProgramma(P(1)), nBlocchi: 1, entrato: sdk.Timestamp.now() });
  const { s } = nuovaSessione(ANNA, { backup: copiaDi(st) });
  await s.avvia();
  assert.equal(s.ripresa(), 'server');
  assert.equal(s.programmaSalvato(), P(1));
  assert.equal((await leggiLavoro()).programma, P(1));
  s.termina();
});

test('ripresa: copia uguale al database → nessuna scrittura del programma', async () => {
  const st = storageFinto();
  const h = hashProgramma(P(3));
  copiaDi(st).salva({ finoA: Date.now() + 3600_000, programma: P(3), hash: h, hashBase: h, nBlocchi: 3 });
  await modifica(ANNA, { programma: P(3), programmaHash: h, nBlocchi: 3, entrato: sdk.Timestamp.now() });
  const { s, scritture } = nuovaSessione(ANNA, { backup: copiaDi(st) });
  await s.avvia();
  assert.equal(s.ripresa(), 'uguali');
  assert.equal('programma' in scritture[0], false);
  s.termina();
});

test('ripresa: primo ingresso con una copia mai sincronizzata e il database vuoto → si usa la copia', async () => {
  const st = storageFinto();
  copiaDi(st).salva({ finoA: Date.now() + 3600_000, programma: P(4), hash: hashProgramma(P(4)), hashBase: null, nBlocchi: 4 });
  const { s } = nuovaSessione(ANNA, { backup: copiaDi(st) });
  await s.avvia();
  assert.equal(s.ripresa(), 'locale');
  assert.equal((await leggiLavoro()).programma, P(4));
  s.termina();
});

test('la copia di un altro studente non viene usata', async () => {
  const st = storageFinto();
  copiaDi(st, BRUNO).salva({ finoA: Date.now() + 3600_000, programma: P(9), hash: 'x', hashBase: null });
  const { s } = nuovaSessione(ANNA, { backup: copiaDi(st, ANNA) });
  await s.avvia();
  assert.equal(s.ripresa(), null);
  s.termina();
});

test('consegna: la copia locale si elimina', async () => {
  const st = storageFinto();
  const { s, tempo } = nuovaSessione(ANNA, { backup: copiaDi(st) });
  await s.avvia();
  s.aggiorna({ programma: P(1), nBlocchi: 1 });
  await tempo.avanza(C.backupLocaleMs + 100, s);
  assert.ok(copiaDi(st).leggi());
  await s.consegna();
  assert.equal(copiaDi(st).leggi(), null);
  s.termina();
});

test('verifica terminata con modifiche mai arrivate al database: la copia NON si elimina in silenzio', async () => {
  const st = storageFinto();
  const { s, tempo } = nuovaSessione(ANNA, { backup: copiaDi(st) });
  await s.avvia();
  s.aggiorna({ programma: P(1), nBlocchi: 1 });
  await tempo.avanza(C.backupLocaleMs + 100, s);
  await admin((db) => sdk.updateDoc(sdk.doc(db, 'verifiche/v1'), { stato: 'chiusa', chiusaIl: sdk.Timestamp.now() }));
  assert.ok(await finche(() => s.stato() === 'terminata'));
  assert.equal(s.senzaSalvare(), true);
  assert.equal(copiaDi(st).leggi().programma, P(1));
  s.termina();
});

test('verifica terminata con tutto già sul database: la copia si elimina', async () => {
  const st = storageFinto();
  const { s, tempo } = nuovaSessione(ANNA, { backup: copiaDi(st) });
  await s.avvia();
  s.aggiorna({ programma: P(1), nBlocchi: 1 });
  await tempo.avanza(C.debounceSalvataggioMs + 100, s);
  await admin((db) => sdk.updateDoc(sdk.doc(db, 'verifiche/v1'), { stato: 'chiusa', chiusaIl: sdk.Timestamp.now() }));
  assert.ok(await finche(() => s.stato() === 'terminata'));
  assert.equal(copiaDi(st).leggi(), null);
  s.termina();
});

test('traccia: al primo ingresso arriva senza avviso e la revisione vista viaggia con l\'ingresso (nessuna scrittura in più)', async () => {
  await modificaTraccia({ rev: 3 });
  const viste = [];
  const { s, scritture } = nuovaSessione(ANNA, { onTraccia: (x) => viste.push(x) });
  await s.avvia();
  assert.equal(viste.length, 1);
  assert.equal(viste[0].aggiornata, false);
  assert.equal(viste[0].traccia.rev, 3);
  assert.equal(scritture.length, 1);
  assert.equal(scritture[0].tracciaRevVista, 3);
  assert.equal((await leggiLavoro()).tracciaRevVista, 3);
  s.termina();
});

test('traccia modificata dal docente durante la verifica: avviso con l\'ora e revisione vista scritta nel lavoro', async () => {
  const viste = [];
  const { s } = nuovaSessione(ANNA, { onTraccia: (x) => viste.push(x) });
  await s.avvia();
  await modificaTraccia({ rev: 1, testoMd: 'testo corretto' });
  assert.ok(await finche(() => viste.length === 2));
  assert.equal(viste[1].aggiornata, true);
  assert.equal(viste[1].traccia.testoMd, 'testo corretto');
  assert.ok(viste[1].modificata instanceof Date);
  assert.ok(await finche(async () => (await leggiLavoro()).tracciaRevVista === 1));
  s.termina();
});

test('traccia modificata mentre lo studente era fuori: alla ripresa c\'è l\'avviso', async () => {
  const a = nuovaSessione(ANNA);
  await a.s.avvia();
  a.s.termina();                                                      // ha visto la revisione 0
  await modificaTraccia({ rev: 2 });
  const viste = [];
  const b = nuovaSessione(ANNA, { onTraccia: (x) => viste.push(x) });
  await b.s.avvia();
  assert.equal(viste[0].aggiornata, true);
  assert.equal(viste[0].traccia.rev, 2);
  b.s.termina();
});

test('traccia: senza rete (non si legge) si usa quella della copia locale', async () => {
  const st = storageFinto();
  copiaDi(st).salva({ finoA: Date.now() + 3600_000, programma: P(1), hash: hashProgramma(P(1)), hashBase: hashProgramma(P(1)),
    traccia: { id: 't0', titolo: 'Dalla copia', testoMd: 'copia', rev: 0 } });
  await modifica(ANNA, { programma: P(1), programmaHash: hashProgramma(P(1)), entrato: sdk.Timestamp.now() });
  const sdkSenzaTraccia = { ...sdk, onSnapshot: (rif, ok, ko) => (rif.path.includes('/tracce/') ? (ko(new Error('rete')), () => {}) : sdk.onSnapshot(rif, ok, ko)) };
  const viste = [];
  const tempo = tempoSimulato();
  const s = creaSessione({ sdk: sdkSenzaTraccia, db: dbDi(ANNA) }, ANNA, 'anna', 'v1', { tempo, calibra: false, backup: copiaDi(st), onTraccia: (x) => viste.push(x) });
  await s.avvia();
  assert.equal(viste.length, 1);
  assert.equal(viste[0].daCopia, true);
  assert.equal(viste[0].traccia.titolo, 'Dalla copia');
  s.termina();
});
