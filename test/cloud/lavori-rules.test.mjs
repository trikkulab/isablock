// Regole dei lavori (il documento personale dello studente in una verifica), emulatore Firestore.
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, updateDoc, writeBatch, serverTimestamp, Timestamp, setLogLevel } from 'firebase/firestore';
import { verificaConfig } from '../../src/cloud/verifica-config.js';

setLogLevel('silent');
const L = verificaConfig.regole;
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8186').split(':');
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-isablock-lavori',
    firestore: { host, port: Number(port), rules: readFileSync(process.env.REGOLE_FILE || 'firestore.rules', 'utf8') },
  });
});
after(() => env.cleanup());

const fisso = Timestamp.fromMillis(1_700_000_000_000);
const tra = (ms) => Timestamp.fromMillis(Date.now() + ms);
const CORSO = { materia: 'Informatica', classe: '3AINF', annoScolastico: '2026/27', docenti: ['docente@isarome.it', 'codocente@isarome.it'], iscrizioniAperte: true, attivo: true };
const ANNA = 'anna@isarome.it';
const BRUNO = 'bruno@isarome.it';
const utente = (uid, email) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const docente = () => utente('d', 'docente@isarome.it');
const codocente = () => utente('c', 'codocente@isarome.it');
const collega = () => utente('x', 'collega@isarome.it');
const anna = () => utente('anna', ANNA);
const bruno = () => utente('bruno', BRUNO);
const carla = () => utente('carla', 'carla@isarome.it');     // non iscritta
const anonimo = () => env.unauthenticatedContext().firestore();
const admin = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const lav = (db, email = ANNA, vid = 'v1') => doc(db, `verifiche/${vid}/lavori/${email}`);

// lavoro creato dal docente (scheletro)
const scheletro = (email = ANNA, extra = {}) => ({ studenteEmail: email, tracciaId: 't0', scadenza: tra(3_600_000), entrato: null, consegnato: false, ...extra });
// scrittura dello studente
const mio = (extra = {}) => ({
  studenteNome: 'Anna Rossi', programma: '{"formatVersion":6,"blocks":{}}', programmaHash: 'abc123', nBlocchi: 3,
  esecuzioni: { n: 0, esito: 'mai', quando: null }, campioni: [{ t: 1, n: 3 }],
  entrato: serverTimestamp(), ultimoSegnale: serverTimestamp(), tracciaRevVista: 0, ...extra,
});

beforeEach(async () => {
  await env.clearFirestore();
  await admin(async (db) => {
    for (const e of ['docente@isarome.it', 'codocente@isarome.it', 'collega@isarome.it']) await setDoc(doc(db, `docenti/${e}`), { attivo: true });
    await setDoc(doc(db, 'corsi/AB12CD'), CORSO);
    await setDoc(doc(db, 'corsi/CH7Z9Q'), { ...CORSO, docenti: ['collega@isarome.it'] });
    for (const e of [ANNA, BRUNO]) await setDoc(doc(db, `iscrizioni/AB12CD_${e}`), { corsoId: 'AB12CD', email: e });
  });
});

// Verifica già esistente (saltando le regole), con tracce t0 e t1 e il lavoro di Anna.
const semina = (stato = 'aperta', lavoro = {}) => admin(async (db) => {
  await setDoc(doc(db, 'verifiche/v1'), {
    corsoId: 'AB12CD', titolo: 'V', stato, fine: tra(3_600_000), tracciaDefault: 't0', creataDa: 'docente@isarome.it',
    creato: fisso, apertaIl: stato === 'bozza' ? null : fisso, chiusaIl: stato === 'chiusa' ? fisso : null,
  });
  for (const t of ['t0', 't1']) await setDoc(doc(db, `verifiche/v1/tracce/${t}`), { titolo: t, testoMd: 'x', rev: 0, modificato: fisso });
  await setDoc(lav(db), { ...scheletro(), ...lavoro });
});
// lavoro di Anna con un salvataggio già fatto
const entrata = (extra = {}) => ({ studenteNome: 'Anna Rossi', programma: '{}', entrato: fisso, ultimoSegnale: fisso, ...extra });

// ── Tempo in più dato a mano (minutiExtra) ────────────────────────────────
test('lavori: minutiExtra lo scrive il docente (intero, da 0 al tetto); lo studente no', async () => {
  const tetto = verificaConfig.regole.maxMinutiExtra;
  await semina('aperta');
  const d = docente();
  await assertSucceeds(updateDoc(lav(d), { minutiExtra: 15, scadenza: tra(4_000_000) }));
  await assertSucceeds(updateDoc(lav(d), { minutiExtra: 0 }));
  await assertSucceeds(updateDoc(lav(d), { minutiExtra: tetto }));
  for (const v of [-1, tetto + 1, 1.5, '15', null]) await assertFails(updateDoc(lav(d), { minutiExtra: v }));
  await assertFails(updateDoc(lav(collega()), { minutiExtra: 5 }));
  await assertFails(updateDoc(lav(anna()), { minutiExtra: 5 }));
  await assertFails(updateDoc(lav(anna()), mio({ minutiExtra: 5 })));
  await admin((db) => deleteDoc(lav(db)));
  await assertSucceeds(setDoc(lav(d), scheletro(ANNA, { minutiExtra: 20 })));
  await admin((db) => deleteDoc(lav(db)));
  await assertFails(setDoc(lav(d), scheletro(ANNA, { minutiExtra: -3 })));
});

// ── Creazione da parte del docente ────────────────────────────────────────
test('lavori: il docente (anche codocente) crea il lavoro di uno studente iscritto, in bozza e a verifica aperta', async () => {
  for (const stato of ['bozza', 'aperta']) {
    await semina(stato);
    await admin((db) => deleteDoc(lav(db)));
    await assertSucceeds(setDoc(lav(docente()), scheletro()));
    await assertSucceeds(setDoc(lav(codocente(), BRUNO), scheletro(BRUNO, { tracciaId: 't1' })));
    await admin((db) => deleteDoc(lav(db, BRUNO)));
  }
});

test('lavori: la creazione a verifica chiusa, o da chi non è docente del corso, è rifiutata', async () => {
  await semina('chiusa');
  await admin((db) => deleteDoc(lav(db)));
  await assertFails(setDoc(lav(docente()), scheletro()));
  await semina('aperta');
  await admin((db) => deleteDoc(lav(db)));
  await assertFails(setDoc(lav(anna()), scheletro()));              // lo studente non si crea il lavoro
  await assertFails(setDoc(lav(bruno()), scheletro()));
  await assertFails(setDoc(lav(collega()), scheletro()));           // docente di un altro corso
  await assertFails(setDoc(lav(anonimo()), scheletro()));
  await admin((db) => deleteDoc(doc(db, 'docenti/codocente@isarome.it')));
  await assertFails(setDoc(lav(codocente()), scheletro()));         // non è più docente
});

test('lavori: si crea solo per chi è iscritto al corso, con id uguale all\'email', async () => {
  await semina('aperta');
  const d = docente();
  await assertFails(setDoc(lav(d, 'carla@isarome.it'), scheletro('carla@isarome.it')));    // non iscritta
  await assertFails(setDoc(lav(d, 'Bruno@isarome.it'), scheletro('Bruno@isarome.it')));    // maiuscole: l'iscrizione è minuscola
  await assertFails(setDoc(lav(d, BRUNO), scheletro(ANNA)));                               // studenteEmail diversa dall'id
  await assertSucceeds(setDoc(lav(d, BRUNO), scheletro(BRUNO)));
});

test('lavori: forma del lavoro appena creato', async () => {
  await semina('aperta');
  await admin((db) => deleteDoc(lav(db)));
  const d = docente();
  const crea = (extra, togli) => {
    const dati = { ...scheletro(), ...extra };
    if (togli) delete dati[togli];
    return setDoc(lav(d), dati);
  };
  await assertFails(crea({ tracciaId: 't7' }));                     // traccia inesistente
  await assertFails(crea({ tracciaId: 'x' }));
  await assertFails(crea({ tracciaId: null }));
  await assertFails(crea({ scadenza: 'domani' }));
  await assertFails(crea({ entrato: fisso }));                      // nasce «non entrato»
  await assertFails(crea({ consegnato: true }));
  await assertFails(crea({ programma: '{}' }));                     // il programma è dello studente
  await assertFails(crea({}, 'consegnato'));
  await assertFails(crea({}, 'scadenza'));
  await assertSucceeds(crea({ scadenza: tra(-60_000) }));           // anche già scaduta (tempo da concordare dopo)
});

test('lavori: la traccia assegnata non può essere un percorso (nemmeno verso un documento che esiste)', async () => {
  await semina('aperta');
  await admin(async (db) => {
    await deleteDoc(lav(db));
    await setDoc(doc(db, 'verifiche/v1/tracce/t0/sub/x'), { qualcosa: 1 });
  });
  await assertFails(setDoc(lav(docente()), scheletro(ANNA, { tracciaId: 't0/sub/x' })));
  await assertSucceeds(setDoc(lav(docente()), scheletro()));
  await assertFails(updateDoc(lav(docente()), { tracciaId: 't0/sub/x' }));
});

// ── Lettura ───────────────────────────────────────────────────────────────
test('lavori: il docente legge tutti i lavori del corso; lo studente solo il proprio e non in bozza', async () => {
  await semina('aperta');
  await admin((db) => setDoc(lav(db, BRUNO), scheletro(BRUNO)));
  await assertSucceeds(getDoc(lav(docente())));
  await assertSucceeds(getDoc(lav(codocente(), BRUNO)));
  await assertSucceeds(getDocs(collection(docente(), 'verifiche/v1/lavori')));
  await assertFails(getDocs(collection(collega(), 'verifiche/v1/lavori')));
  await assertFails(getDocs(collection(anna(), 'verifiche/v1/lavori')));        // lo studente non elenca
  await assertSucceeds(getDoc(lav(anna())));
  await assertFails(getDoc(lav(anna(), BRUNO)));                                // il lavoro di un compagno
  await assertFails(getDoc(lav(carla())));
  await assertFails(getDoc(lav(anonimo())));
  await admin((db) => setDoc(doc(db, 'verifiche/v1'), { corsoId: 'AB12CD', titolo: 'V', stato: 'bozza', fine: null, tracciaDefault: null, creataDa: 'docente@isarome.it', creato: fisso, apertaIl: null, chiusaIl: null }));
  await assertFails(getDoc(lav(anna())));                                       // in bozza lo studente non vede niente
  await assertSucceeds(getDoc(lav(docente())));
});

test('lavori: un account con l\'email giusta ma NON verificata non legge né scrive', async () => {
  await semina('aperta');
  const nv = env.authenticatedContext('anna2', { email: ANNA, email_verified: false }).firestore();
  await assertFails(getDoc(lav(nv)));
  await assertFails(updateDoc(lav(nv), mio()));
});

// ── Modifiche del docente ─────────────────────────────────────────────────
test('lavori: il docente cambia la scadenza in ogni stato, la traccia solo prima dell\'ingresso', async () => {
  for (const stato of ['bozza', 'aperta', 'chiusa']) {
    await semina(stato);
    await assertSucceeds(updateDoc(lav(docente()), { scadenza: tra(7_200_000) }));
    await assertSucceeds(updateDoc(lav(codocente()), { scadenza: tra(-60_000) }));
    await assertFails(updateDoc(lav(docente()), { scadenza: 'domani' }));
    await assertFails(updateDoc(lav(docente()), { scadenza: null }));
  }
  for (const stato of ['bozza', 'aperta']) {
    await semina(stato);
    await assertSucceeds(updateDoc(lav(docente()), { tracciaId: 't1' }));
    await assertFails(updateDoc(lav(docente()), { tracciaId: 't7' }));            // non esiste
    await assertFails(updateDoc(lav(docente()), { tracciaId: 5 }));
  }
  await semina('chiusa');
  await assertFails(updateDoc(lav(docente()), { tracciaId: 't1' }));
  await semina('aperta', entrata());
  await assertFails(updateDoc(lav(docente()), { tracciaId: 't1' }));              // lo studente è già entrato
  await assertSucceeds(updateDoc(lav(docente()), { scadenza: tra(7_200_000) }));  // ma il tempo sì
});

test('lavori: in bozza la traccia può essere vuota («di tutti»), da aperta mai', async () => {
  // creazione
  await semina('bozza');
  await admin((db) => deleteDoc(lav(db)));
  await assertSucceeds(setDoc(lav(docente()), scheletro(ANNA, { tracciaId: null })));
  await semina('aperta');
  await admin((db) => deleteDoc(lav(db)));
  await assertFails(setDoc(lav(docente()), scheletro(ANNA, { tracciaId: null })));
  // modifica: un'assegnazione esplicita torna «di tutti» solo in bozza
  await semina('bozza');
  await assertSucceeds(updateDoc(lav(docente()), { tracciaId: null }));
  await assertSucceeds(updateDoc(lav(docente()), { tracciaId: 't1' }));
  await semina('aperta');
  await assertFails(updateDoc(lav(docente()), { tracciaId: null }));
  // e una traccia vuota si risolve in un id vero, in bozza (come fa l'apertura) e anche dopo
  for (const stato of ['bozza', 'aperta']) {
    await semina(stato, { tracciaId: null });
    await assertSucceeds(updateDoc(lav(docente()), { tracciaId: 't0' }));
  }
  await semina('chiusa', { tracciaId: null });
  await assertFails(updateDoc(lav(docente()), { tracciaId: 't0' }));
  // un lavoro già entrato non cambia traccia nemmeno verso «di tutti»
  await semina('bozza', entrata());
  await assertFails(updateDoc(lav(docente()), { tracciaId: null }));
});

test('lavori: lo studente non scrive se la sua traccia non è stata risolta (ancora «di tutti») a verifica aperta', async () => {
  await semina('aperta', { tracciaId: null });                         // stato che l'apertura corretta non produce
  await assertFails(updateDoc(lav(anna()), mio()));
  await assertFails(getDoc(doc(anna(), 'verifiche/v1/tracce/t0')));    // e non legge nessuna traccia
  await admin((db) => updateDoc(lav(db), { tracciaId: 't0' }));
  await assertSucceeds(updateDoc(lav(anna()), mio()));
});

test('lavori: il docente non tocca i campi dello studente né l\'identità', async () => {
  await semina('aperta', entrata());
  const d = docente();
  for (const dati of [{ programma: 'rubato' }, { entrato: null }, { consegnato: true }, { ultimoSegnale: serverTimestamp() },
                      { studenteEmail: BRUNO }, { nBlocchi: 99 }, { tracciaRevVista: 5 }, { studenteNome: 'X' }]) {
    await assertFails(updateDoc(lav(d), dati));
  }
  await assertFails(updateDoc(lav(collega()), { scadenza: tra(7_200_000) }));
});

test('lavori: il docente toglie solo il lavoro di chi non è entrato', async () => {
  await semina('aperta');
  await assertFails(deleteDoc(lav(anna())));
  await assertFails(deleteDoc(lav(collega())));
  await assertSucceeds(deleteDoc(lav(docente())));
  await semina('aperta', entrata());
  await assertFails(deleteDoc(lav(docente())));
  await assertFails(deleteDoc(lav(anna())));
});

// ── Scritture dello studente ──────────────────────────────────────────────
test('lavori: lo studente scrive il proprio lavoro; il primo salvataggio è l\'ingresso', async () => {
  await semina('aperta');
  await assertSucceeds(updateDoc(lav(anna()), mio()));
  const dopo = (await getDoc(lav(docente()))).data();
  if (!dopo.entrato || !dopo.ultimoSegnale || dopo.programma !== mio().programma) throw new Error('scrittura non registrata');
  // dalla seconda in poi `entrato` resta quello di prima
  await assertSucceeds(updateDoc(lav(anna()), { programma: '{"v":2}', entrato: dopo.entrato, ultimoSegnale: serverTimestamp() }));
  await assertSucceeds(updateDoc(lav(anna()), { entrato: dopo.entrato, ultimoSegnale: serverTimestamp() }));   // solo battito
  await assertFails(updateDoc(lav(anna()), { programma: '{"v":3}', entrato: fisso, ultimoSegnale: serverTimestamp() }));   // entrato cambiato
  await assertFails(updateDoc(lav(anna()), { programma: '{"v":3}', entrato: serverTimestamp(), ultimoSegnale: serverTimestamp() }));
});

test('lavori: entrato e ultimoSegnale sono sempre l\'ora del server', async () => {
  await semina('aperta');
  await assertFails(updateDoc(lav(anna()), mio({ entrato: fisso })));
  await assertFails(updateDoc(lav(anna()), mio({ entrato: null })));
  await assertFails(updateDoc(lav(anna()), mio({ ultimoSegnale: fisso })));
  await assertFails(updateDoc(lav(anna()), (({ ultimoSegnale, ...r }) => r)(mio())));
  await assertFails(updateDoc(lav(anna()), (({ entrato, ...r }) => r)(mio())));     // senza entrato resterebbe null
  await assertFails(updateDoc(lav(anna()), (({ studenteNome, ...r }) => r)(mio()))); // il nome serve al docente
});

test('lavori: chi può scrivere il lavoro di uno studente', async () => {
  await semina('aperta');
  await assertFails(updateDoc(lav(bruno()), mio()));                       // il lavoro di un compagno
  await assertFails(updateDoc(lav(carla()), mio()));
  await assertFails(updateDoc(lav(anonimo()), mio()));
  await assertFails(updateDoc(lav(docente()), mio()));
  await assertFails(updateDoc(lav(anna(), BRUNO), mio()));
  await assertSucceeds(updateDoc(lav(anna()), mio()));
});

test('lavori: lo studente non scrive a verifica in bozza o chiusa', async () => {
  await semina('bozza');
  await assertFails(updateDoc(lav(anna()), mio()));
  await semina('chiusa');
  await assertFails(updateDoc(lav(anna()), mio()));
  await semina('aperta');
  await assertSucceeds(updateDoc(lav(anna()), mio()));
});

test('lavori: la scadenza personale più la grazia chiude le scritture', async () => {
  await semina('aperta', { scadenza: tra(-5_000) });                       // scaduta da 5 s: dentro la grazia
  await assertSucceeds(updateDoc(lav(anna()), mio()));
  await semina('aperta', { scadenza: tra(-(L.graziaSecondi + 30) * 1000) }); // scaduta da molto
  await assertFails(updateDoc(lav(anna()), mio()));
  await semina('aperta', { scadenza: tra(-(L.graziaSecondi + 30) * 1000) });
  await updateDoc(lav(docente()), { scadenza: tra(600_000) });             // tempo aggiuntivo del docente
  await assertSucceeds(updateDoc(lav(anna()), mio()));
});

test('lavori: lo studente non cambia traccia, scadenza, identità; né toglie campi', async () => {
  await semina('aperta');
  for (const dati of [{ scadenza: tra(9_999_999) }, { tracciaId: 't1' }, { studenteEmail: BRUNO }, { extra: 1 }]) {
    await assertFails(updateDoc(lav(anna()), mio(dati)));
  }
});

test('lavori: dopo la consegna lo studente non scrive più, e consegnato:true da solo non basta', async () => {
  await semina('aperta');
  await assertFails(updateDoc(lav(anna()), mio({ consegnato: true })));    // senza la consegna (existsAfter)
  await assertFails(updateDoc(lav(anna()), { consegnato: true }));
  await semina('aperta', entrata({ consegnato: true }));
  await assertFails(updateDoc(lav(anna()), { entrato: fisso, ultimoSegnale: serverTimestamp(), programma: '{"dopo":1}' }));
  // con la consegna già creata, `consegnato` resta comunque una porta chiusa per le scritture dello studente
  await admin((db) => setDoc(doc(db, `verifiche/v1/consegne/${ANNA}_1`), { programma: '{}' }));
  await assertFails(updateDoc(lav(anna()), { entrato: fisso, ultimoSegnale: serverTimestamp(), programma: '{"dopo":2}' }));
  const db = anna();
  const b = writeBatch(db);
  b.update(lav(db), mio({ consegnato: true }));
  await assertFails(b.commit());
});

test('lavori: forma e limiti dei campi dello studente', async () => {
  await semina('aperta');
  const prova = (extra) => updateDoc(lav(anna()), mio(extra));
  await assertFails(prova({ studenteNome: '' }));
  await assertFails(prova({ studenteNome: 'x'.repeat(81) }));
  await assertFails(prova({ studenteNome: 5 }));
  await assertFails(prova({ programma: '' }));
  await assertFails(prova({ programma: 'x'.repeat(L.maxProgramma + 1) }));
  await assertFails(prova({ programma: { a: 1 } }));
  await assertFails(prova({ programmaHash: 'x'.repeat(17) }));
  await assertFails(prova({ programmaHash: 7 }));
  await assertFails(prova({ nBlocchi: -1 }));
  await assertFails(prova({ nBlocchi: L.maxBlocchi + 1 }));
  await assertFails(prova({ nBlocchi: 2.5 }));
  await assertFails(prova({ nBlocchi: '3' }));
  await assertFails(prova({ esecuzioni: { n: -1, esito: 'mai', quando: null } }));
  await assertFails(prova({ esecuzioni: { n: 1, esito: 'forse', quando: null } }));
  await assertFails(prova({ esecuzioni: { n: 1, esito: 'ok', quando: 'ieri' } }));
  await assertFails(prova({ esecuzioni: { n: 1, esito: 'ok', quando: null, riga: 4 } }));   // niente riga raggiunta né valori
  await assertFails(prova({ esecuzioni: { n: 1, esito: 'ok' } }));
  await assertFails(prova({ esecuzioni: 'ok' }));
  await assertFails(prova({ campioni: Array.from({ length: L.maxCampioni + 1 }, (_, i) => ({ t: i, n: i })) }));
  await assertFails(prova({ campioni: 'molti' }));
  await assertFails(prova({ tracciaRevVista: -1 }));
  await assertFails(prova({ tracciaRevVista: 'uno' }));
  await assertSucceeds(prova({
    programma: 'x'.repeat(L.maxProgramma), nBlocchi: L.maxBlocchi,
    campioni: Array.from({ length: L.maxCampioni }, (_, i) => ({ t: i, n: i })),
    esecuzioni: { n: 100000, esito: 'errore', quando: 1_700_000_000_000 }, tracciaRevVista: 4,
  }));
});

// ── Vista dal vivo (osservato) ────────────────────────────────────────────
test('lavori: osservato = ora del server, solo il docente del corso, verifica aperta, studente già entrato', async () => {
  await semina('aperta', entrata());
  const d = docente();
  await assertSucceeds(updateDoc(lav(d), { osservato: serverTimestamp() }));
  await assertSucceeds(updateDoc(lav(codocente()), { osservato: serverTimestamp() }));               // rinnovo: stesso campo, nuovo valore
  await assertFails(updateDoc(lav(d), { osservato: tra(0) }));                                     // un'ora scelta dal PC non vale
  await assertFails(updateDoc(lav(d), { osservato: tra(3_600_000) }));
  await assertFails(updateDoc(lav(d), { osservato: null }));
  await assertFails(updateDoc(lav(d), { osservato: true }));
  await assertFails(updateDoc(lav(collega()), { osservato: serverTimestamp() }));                  // docente di un altro corso
  await assertFails(updateDoc(lav(anna()), { osservato: serverTimestamp() }));                     // lo studente no
  await assertFails(updateDoc(lav(anna()), mio({ osservato: serverTimestamp() })));
  await assertFails(updateDoc(lav(bruno()), { osservato: serverTimestamp() }));
  await assertFails(updateDoc(lav(anonimo()), { osservato: serverTimestamp() }));
  await assertSucceeds(updateDoc(lav(d), { osservato: serverTimestamp(), minutiExtra: 5, scadenza: tra(4_000_000) }));   // insieme ad altro del docente
  await assertFails(updateDoc(lav(d), { osservato: serverTimestamp(), studenteNome: 'X' }));      // ma non ai campi dello studente
});

test('lavori: osservato non si scrive su bozza, chiusa o per chi non è ancora entrato', async () => {
  await semina('bozza');
  await assertFails(updateDoc(lav(docente()), { osservato: serverTimestamp() }));
  await semina('chiusa', entrata());
  await assertFails(updateDoc(lav(docente()), { osservato: serverTimestamp() }));
  await semina('aperta');                                                                          // aperta ma Anna non è entrata
  await assertFails(updateDoc(lav(docente()), { osservato: serverTimestamp() }));
});

test('lavori: osservato non ostacola il salvataggio dello studente e non lo cambia', async () => {
  await semina('aperta', entrata());
  await assertSucceeds(updateDoc(lav(docente()), { osservato: serverTimestamp() }));
  await assertSucceeds(updateDoc(lav(anna()), { programma: '{"a":1}', programmaHash: 'h2', nBlocchi: 4, ultimoSegnale: serverTimestamp() }));
});
