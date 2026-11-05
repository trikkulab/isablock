// Regole di verifiche e tracce (emulatore Firestore).
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, updateDoc, query, where, serverTimestamp, Timestamp, setLogLevel } from 'firebase/firestore';
import { verificaConfig } from '../../src/cloud/verifica-config.js';

setLogLevel('silent');
const L = verificaConfig.regole;
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8186').split(':');
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-isablock-verifiche',
    firestore: { host, port: Number(port), rules: readFileSync(process.env.REGOLE_FILE || 'firestore.rules', 'utf8') },
  });
});
after(() => env.cleanup());

const fisso = Timestamp.fromMillis(1_700_000_000_000);
const tra = (ms) => Timestamp.fromMillis(Date.now() + ms);
const futuro = () => tra(3_600_000);
const passato = () => tra(-3_600_000);
const CORSO = { materia: 'Informatica', classe: '3AINF', annoScolastico: '2026/27', docenti: ['docente@isarome.it', 'codocente@isarome.it'], iscrizioniAperte: true, attivo: true };
const ANNA = 'anna@isarome.it';
const utente = (uid, email) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const docente = () => utente('d', 'docente@isarome.it');
const codocente = () => utente('c', 'codocente@isarome.it');
const collega = () => utente('x', 'collega@isarome.it');
const anna = () => utente('anna', ANNA);
const bruno = () => utente('bruno', 'bruno@isarome.it');
const anonimo = () => env.unauthenticatedContext().firestore();
const admin = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

const ver = (extra = {}) => ({
  corsoId: 'AB12CD', titolo: 'Verifica 1', stato: 'bozza', fine: null, tracciaDefault: null,
  creataDa: 'docente@isarome.it', creato: serverTimestamp(), apertaIl: null, chiusaIl: null, ...extra,
});
const tr = (extra = {}) => ({ titolo: 'Versione A', testoMd: '# Esercizio\n\nScrivi un programma.', rev: 0, modificato: serverTimestamp(), ...extra });

beforeEach(async () => {
  await env.clearFirestore();
  await admin(async (db) => {
    for (const e of ['docente@isarome.it', 'codocente@isarome.it', 'collega@isarome.it']) await setDoc(doc(db, `docenti/${e}`), { attivo: true });
    await setDoc(doc(db, 'corsi/AB12CD'), CORSO);
    await setDoc(doc(db, 'corsi/CH7Z9Q'), { ...CORSO, docenti: ['collega@isarome.it'] });
    await setDoc(doc(db, 'corsi/AR5T7K'), { ...CORSO, attivo: false });
    await setDoc(doc(db, `iscrizioni/AB12CD_${ANNA}`), { corsoId: 'AB12CD', email: ANNA });
  });
});

// Verifica già esistente (saltando le regole), con la traccia t0 e il lavoro di Anna che la richiama.
const semina = (stato = 'bozza', extra = {}) => admin(async (db) => {
  await setDoc(doc(db, 'verifiche/v1'), ver({ stato, creato: fisso, fine: stato === 'bozza' ? null : futuro(),
    tracciaDefault: 't0', apertaIl: stato === 'bozza' ? null : fisso, chiusaIl: stato === 'chiusa' ? fisso : null, ...extra }));
  await setDoc(doc(db, 'verifiche/v1/tracce/t0'), tr({ modificato: fisso }));
  await setDoc(doc(db, 'verifiche/v1/tracce/t1'), tr({ titolo: 'Versione B', modificato: fisso }));
  await setDoc(doc(db, `verifiche/v1/lavori/${ANNA}`), { tracciaId: 't0' });
});
const crea = (db, id, dati) => setDoc(doc(db, `verifiche/${id}`), dati);
const agg = (db, dati, id = 'v1') => updateDoc(doc(db, `verifiche/${id}`), dati);
const tracciaDoc = (db, tid) => doc(db, `verifiche/v1/tracce/${tid}`);

// ── Verifiche: creazione ──────────────────────────────────────────────────
test('verifiche: il docente (anche codocente) crea una verifica in bozza', async () => {
  await assertSucceeds(crea(docente(), 'nuova', ver()));
  await assertSucceeds(crea(codocente(), 'nuova2', ver({ creataDa: 'codocente@isarome.it' })));
  await assertSucceeds(crea(docente(), 'conFine', ver({ fine: futuro(), tracciaDefault: 't0' })));
});

test('verifiche: chi non può creare', async () => {
  await assertFails(crea(anna(), 'n', ver({ creataDa: ANNA })));
  await assertFails(crea(bruno(), 'n', ver({ creataDa: 'bruno@isarome.it' })));
  await assertFails(crea(collega(), 'n', ver({ creataDa: 'collega@isarome.it' })));       // docente, ma non di questo corso
  await assertFails(crea(anonimo(), 'n', ver()));
  await admin((db) => deleteDoc(doc(db, 'docenti/codocente@isarome.it')));
  await assertFails(crea(codocente(), 'n', ver({ creataDa: 'codocente@isarome.it' }))); // non è più docente
});

test('verifiche: forma della bozza', async () => {
  const d = docente();
  await assertFails(crea(d, 'n', ver({ stato: 'aperta', apertaIl: serverTimestamp(), fine: futuro() })));
  await assertFails(crea(d, 'n', ver({ stato: 'chiusa' })));
  await assertFails(crea(d, 'n', ver({ stato: 'inventato' })));
  await assertFails(crea(d, 'n', ver({ creataDa: 'altro@isarome.it' })));
  await assertFails(crea(d, 'n', ver({ creato: fisso })));
  await assertFails(crea(d, 'n', ver({ apertaIl: serverTimestamp() })));
  await assertFails(crea(d, 'n', ver({ chiusaIl: serverTimestamp() })));
  await assertFails(crea(d, 'n', ver({ extra: 1 })));
  await assertFails(crea(d, 'n', (({ chiusaIl, ...r }) => r)(ver())));                    // manca un campo
  await assertFails(crea(d, 'n', ver({ titolo: '' })));
  await assertFails(crea(d, 'n', ver({ titolo: 42 })));
  await assertFails(crea(d, 'n', ver({ fine: 'domani' })));
  for (const t of ['x', 't01', `t${L.maxTracce}`, 't-1', 7]) await assertFails(crea(d, 'n', ver({ tracciaDefault: t })));
  await assertSucceeds(crea(d, 'ok', ver({ tracciaDefault: `t${L.maxTracce - 1}` })));
});

test('verifiche: limite del titolo come da configurazione', async () => {
  await assertSucceeds(crea(docente(), 'a', ver({ titolo: 'x'.repeat(L.maxTitoloVerifica) })));
  await assertFails(crea(docente(), 'b', ver({ titolo: 'x'.repeat(L.maxTitoloVerifica + 1) })));
});

test('verifiche: corso inesistente, archiviato o con codice malformato', async () => {
  await assertFails(crea(docente(), 'n', ver({ corsoId: 'ZZ9999' })));
  await admin((db) => setDoc(doc(db, 'corsi/AR5T7K'), { ...CORSO, attivo: false }));
  await assertFails(crea(docente(), 'n', ver({ corsoId: 'AR5T7K' })));
  await assertFails(crea(docente(), 'n', ver({ corsoId: 'ab12cd' })));
});

// ── Verifiche: lettura ────────────────────────────────────────────────────
test('verifiche: la bozza la legge solo il docente del corso', async () => {
  await semina('bozza');
  await assertSucceeds(getDoc(doc(docente(), 'verifiche/v1')));
  await assertSucceeds(getDoc(doc(codocente(), 'verifiche/v1')));
  await assertFails(getDoc(doc(anna(), 'verifiche/v1')));      // iscritta, ma è una bozza
  await assertFails(getDoc(doc(bruno(), 'verifiche/v1')));
  await assertFails(getDoc(doc(collega(), 'verifiche/v1')));
  await assertFails(getDoc(doc(anonimo(), 'verifiche/v1')));
});

test('verifiche: aperta o chiusa la legge anche lo studente iscritto, non gli altri', async () => {
  for (const stato of ['aperta', 'chiusa']) {
    await semina(stato);
    await assertSucceeds(getDoc(doc(anna(), 'verifiche/v1')));
    await assertFails(getDoc(doc(bruno(), 'verifiche/v1')));     // non iscritto
    await assertFails(getDoc(doc(collega(), 'verifiche/v1')));   // docente di un altro corso
    await assertFails(getDoc(doc(anonimo(), 'verifiche/v1')));
  }
});

test('verifiche: le query accettate dalle regole', async () => {
  await semina('aperta');
  await admin((db) => setDoc(doc(db, 'verifiche/v2'), ver({ creato: fisso })));   // una bozza dello stesso corso
  const col = (db) => collection(db, 'verifiche');
  // studente: solo con un filtro che esclude le bozze
  await assertSucceeds(getDocs(query(col(anna()), where('corsoId', '==', 'AB12CD'), where('stato', '==', 'aperta'))));
  await assertSucceeds(getDocs(query(col(anna()), where('corsoId', '==', 'AB12CD'), where('stato', 'in', ['aperta', 'chiusa']))));
  await assertFails(getDocs(query(col(anna()), where('corsoId', '==', 'AB12CD'))));
  await assertFails(getDocs(query(col(anna()), where('corsoId', '==', 'AB12CD'), where('stato', '==', 'bozza'))));
  await assertFails(getDocs(query(col(anna()), where('stato', '==', 'aperta'))));                      // senza corso
  await assertFails(getDocs(query(col(bruno()), where('corsoId', '==', 'AB12CD'), where('stato', '==', 'aperta'))));
  // docente: tutte le verifiche del proprio corso
  await assertSucceeds(getDocs(query(col(docente()), where('corsoId', '==', 'AB12CD'))));
  await assertFails(getDocs(query(col(collega()), where('corsoId', '==', 'AB12CD'))));
  await assertFails(getDocs(col(docente())));                                                         // elenco di tutto
});

// ── Verifiche: transizioni ────────────────────────────────────────────────
test('verifiche: bozza, si cambiano titolo, fine e traccia di default; il resto è fisso', async () => {
  await semina('bozza');
  const d = docente();
  await assertSucceeds(agg(d, { titolo: 'Nuovo titolo' }));
  await assertSucceeds(agg(d, { fine: futuro() }));
  await assertSucceeds(agg(d, { fine: null }));
  await assertSucceeds(agg(d, { tracciaDefault: 't1' }));
  await assertFails(agg(d, { corsoId: 'CH7Z9Q' }));
  await assertFails(agg(d, { creataDa: 'altro@isarome.it' }));
  await assertFails(agg(d, { creato: serverTimestamp() }));
  await assertFails(agg(d, { apertaIl: serverTimestamp() }));
  await assertFails(agg(d, { chiusaIl: serverTimestamp() }));
  await assertFails(agg(d, { titolo: '' }));
  await assertFails(agg(anna(), { titolo: 'rubato' }));
  await assertFails(agg(collega(), { titolo: 'rubato' }));
});

test('verifiche: bozza -> aperta, con fine nel futuro e traccia di default esistente', async () => {
  await semina('bozza', { tracciaDefault: null });
  const apri = (extra = {}) => ({ stato: 'aperta', apertaIl: serverTimestamp(), fine: futuro(), tracciaDefault: 't0', ...extra });
  await assertFails(agg(anna(), apri()));
  await assertFails(agg(collega(), apri()));
  await assertFails(agg(docente(), apri({ fine: passato() })));
  await assertFails(agg(docente(), apri({ fine: null })));
  await assertFails(agg(docente(), apri({ tracciaDefault: null })));
  await assertFails(agg(docente(), apri({ tracciaDefault: 't7' })));                 // non esiste
  await assertFails(agg(docente(), apri({ apertaIl: fisso })));
  await assertFails(agg(docente(), apri({ chiusaIl: serverTimestamp() })));
  await assertFails(agg(docente(), apri({ corsoId: 'CH7Z9Q' })));
  await assertSucceeds(agg(codocente(), apri({ titolo: 'Verifica di novembre' })));
});

test('verifiche: transizioni vietate', async () => {
  await semina('bozza');
  await assertFails(agg(docente(), { stato: 'chiusa', chiusaIl: serverTimestamp() }));                // bozza -> chiusa
  await semina('aperta');
  await assertFails(agg(docente(), { stato: 'bozza' }));                                              // aperta -> bozza
  await semina('chiusa');
  await assertFails(agg(docente(), { stato: 'bozza', apertaIl: null, chiusaIl: null }));              // chiusa -> bozza
});

test('verifiche: ogni transizione vuole i SUOI campi, non quelli di un\'altra', async () => {
  const d = docente();
  await semina('bozza');
  await assertFails(agg(d, { stato: 'aperta', fine: futuro(), tracciaDefault: 't0' }));                   // manca apertaIl
  await assertFails(agg(d, { stato: 'chiusa', apertaIl: serverTimestamp(), fine: futuro(), tracciaDefault: 't0' })); // apertura "travestita"
  await assertFails(agg(d, { stato: 'chiusa', apertaIl: serverTimestamp() }));
  await assertFails(agg(d, { stato: 'inventato' }));
  await semina('aperta');
  await assertFails(agg(d, { stato: 'bozza', chiusaIl: serverTimestamp() }));                              // chiusura "travestita"
  await assertFails(agg(d, { stato: 'bozza', apertaIl: null }));
  await semina('chiusa');
  await assertFails(agg(d, { stato: 'bozza', apertaIl: serverTimestamp() }));                              // riapertura "travestita"
  await assertFails(agg(d, { stato: 'bozza', chiusaIl: null }));
});

test('verifiche: un account con l\'email giusta ma NON verificata non legge niente', async () => {
  await semina('aperta');
  const nonVerificata = env.authenticatedContext('anna2', { email: ANNA, email_verified: false }).firestore();
  await assertFails(getDoc(doc(nonVerificata, 'verifiche/v1')));
  await assertFails(getDoc(tracciaDoc(nonVerificata, 't0')));
  await assertFails(getDocs(query(collection(nonVerificata, 'verifiche'), where('corsoId', '==', 'AB12CD'), where('stato', '==', 'aperta'))));
  const docenteNonVerificato = env.authenticatedContext('d2', { email: 'docente@isarome.it', email_verified: false }).firestore();
  await assertFails(getDoc(doc(docenteNonVerificato, 'verifiche/v1')));
});

test('verifiche: aperta -> chiusa', async () => {
  await semina('aperta');
  await assertFails(agg(anna(), { stato: 'chiusa', chiusaIl: serverTimestamp() }));
  await assertFails(agg(collega(), { stato: 'chiusa', chiusaIl: serverTimestamp() }));
  await assertFails(agg(docente(), { stato: 'chiusa' }));                                             // manca chiusaIl
  await assertFails(agg(docente(), { stato: 'chiusa', chiusaIl: fisso }));
  await assertFails(agg(docente(), { stato: 'chiusa', chiusaIl: serverTimestamp(), titolo: 'furbata' }));
  await assertSucceeds(agg(docente(), { stato: 'chiusa', chiusaIl: serverTimestamp() }));
});

test('verifiche: chiusa -> aperta, anche con la fine ormai passata', async () => {
  await semina('chiusa', { fine: passato() });
  await assertFails(agg(anna(), { stato: 'aperta', apertaIl: serverTimestamp() }));
  await assertFails(agg(docente(), { stato: 'aperta' }));                                             // manca apertaIl
  await assertFails(agg(docente(), { stato: 'aperta', apertaIl: fisso }));
  await assertFails(agg(docente(), { stato: 'aperta', apertaIl: serverTimestamp(), titolo: 'furbata' }));
  await assertFails(agg(docente(), { stato: 'aperta', apertaIl: serverTimestamp(), fine: null }));
  await assertSucceeds(agg(docente(), { stato: 'aperta', apertaIl: serverTimestamp() }));
  await semina('chiusa', { fine: passato() });
  await assertSucceeds(agg(docente(), { stato: 'aperta', apertaIl: serverTimestamp(), fine: futuro() }));
});

test('verifiche: aperta, si cambiano titolo e fine (se cambia, nel futuro); chiusa, solo il titolo', async () => {
  await semina('aperta');
  const d = docente();
  await assertSucceeds(agg(d, { titolo: 'Corretto' }));
  await assertSucceeds(agg(d, { fine: futuro() }));
  await assertFails(agg(d, { fine: passato() }));
  await assertFails(agg(d, { fine: null }));
  await assertFails(agg(d, { tracciaDefault: 't1' }));
  await assertFails(agg(d, { corsoId: 'CH7Z9Q' }));
  await assertFails(agg(d, { apertaIl: serverTimestamp() }));
  await semina('aperta', { fine: passato() });      // verifica dimenticata: il titolo si corregge ugualmente
  await assertSucceeds(agg(d, { titolo: 'Corretto' }));
  await semina('chiusa');
  await assertSucceeds(agg(d, { titolo: 'Archiviata' }));
  await assertFails(agg(d, { fine: futuro() }));
  await assertFails(agg(d, { tracciaDefault: 't1' }));
});

test('verifiche: archiviare e ripristinare, solo per le verifiche chiuse', async () => {
  const d = docente();
  await semina('chiusa');
  await assertSucceeds(agg(d, { archiviata: true }));
  await assertSucceeds(agg(codocente(), { archiviata: false }));
  await assertSucceeds(agg(d, { archiviata: true, titolo: 'Vecchia verifica' }));          // titolo e archiviata insieme
  await assertFails(agg(d, { archiviata: 'si' }));
  await assertFails(agg(d, { archiviata: null }));
  await assertFails(agg(d, { archiviata: true, fine: futuro() }));                          // altri campi no
  await assertFails(agg(d, { archiviata: true, tracciaDefault: 't1' }));
  await assertFails(agg(anna(), { archiviata: true }));
  await assertFails(agg(collega(), { archiviata: true }));
  for (const stato of ['bozza', 'aperta']) {
    await semina(stato);
    await assertFails(agg(d, { archiviata: true }));                                        // solo le chiuse
  }
});

test('verifiche: una verifica archiviata non si riapre finché non si ripristina', async () => {
  const d = docente();
  await semina('chiusa', { archiviata: true });
  await assertFails(agg(d, { stato: 'aperta', apertaIl: serverTimestamp() }));
  await assertFails(agg(d, { stato: 'aperta', apertaIl: serverTimestamp(), archiviata: false }));   // due cambi insieme: il ripristino va prima
  await assertSucceeds(agg(d, { archiviata: false }));
  await assertSucceeds(agg(d, { stato: 'aperta', apertaIl: serverTimestamp() }));
  await semina('chiusa', { archiviata: true });
  await assertSucceeds(agg(d, { titolo: 'Ancora archiviata' }));                             // si può rinominare
  await assertFails(deleteDoc(doc(d, 'verifiche/v1')));                                      // e non si elimina
});

test('verifiche: nasce sempre non archiviata', async () => {
  const d = docente();
  await assertSucceeds(crea(d, 'a', ver({ archiviata: false })));
  await assertFails(crea(d, 'b', ver({ archiviata: true })));                                // una bozza non può essere archiviata
  await assertFails(crea(d, 'c', ver({ archiviata: 1 })));
});

test('verifiche: si butta via solo una bozza', async () => {
  await semina('bozza');
  await assertFails(deleteDoc(doc(anna(), 'verifiche/v1')));
  await assertFails(deleteDoc(doc(collega(), 'verifiche/v1')));
  await assertSucceeds(deleteDoc(doc(docente(), 'verifiche/v1')));
  for (const stato of ['aperta', 'chiusa']) {
    await semina(stato);
    await assertFails(deleteDoc(doc(docente(), 'verifiche/v1')));
  }
});

// ── Tracce: scrittura ─────────────────────────────────────────────────────
test('tracce: il docente le crea in bozza e a verifica aperta, non a chiusa', async () => {
  for (const [i, stato] of ['bozza', 'aperta'].entries()) {
    await semina(stato);
    await assertSucceeds(setDoc(tracciaDoc(docente(), `t${2 + 2 * i}`), tr()));
    await assertSucceeds(setDoc(tracciaDoc(codocente(), `t${3 + 2 * i}`), tr()));
  }
  await semina('chiusa');
  await assertFails(setDoc(tracciaDoc(docente(), 't4'), tr()));
});

test('tracce: chi non può scriverle', async () => {
  await semina('bozza');
  await assertFails(setDoc(tracciaDoc(anna(), 't2'), tr()));
  await assertFails(setDoc(tracciaDoc(bruno(), 't2'), tr()));
  await assertFails(setDoc(tracciaDoc(collega(), 't2'), tr()));
  await assertFails(setDoc(tracciaDoc(anonimo(), 't2'), tr()));
  await assertFails(updateDoc(tracciaDoc(anna(), 't0'), { titolo: 'x', rev: 1, modificato: serverTimestamp() }));
});

test('tracce: id t0…t(max-1) senza zeri iniziali', async () => {
  await semina('bozza');
  const d = docente();
  await assertSucceeds(setDoc(tracciaDoc(d, 't5'), tr()));
  await assertSucceeds(setDoc(tracciaDoc(d, `t${L.maxTracce - 1}`), tr()));
  for (const id of [`t${L.maxTracce}`, 't00', 't01', 't', 'x1', 'traccia1', 't-1', 't1a']) {
    await assertFails(setDoc(tracciaDoc(d, id), tr()));
  }
});

test('tracce: forma, rev e limiti come da configurazione', async () => {
  await semina('bozza');
  const d = docente();
  await assertFails(setDoc(tracciaDoc(d, 't2'), tr({ rev: 1 })));                 // si crea con rev 0
  await assertFails(setDoc(tracciaDoc(d, 't2'), tr({ rev: '0' })));
  await assertFails(setDoc(tracciaDoc(d, 't2'), tr({ modificato: fisso })));
  await assertFails(setDoc(tracciaDoc(d, 't2'), tr({ extra: 1 })));
  await assertFails(setDoc(tracciaDoc(d, 't2'), tr({ titolo: '' })));
  await assertFails(setDoc(tracciaDoc(d, 't2'), tr({ testoMd: '' })));
  await assertFails(setDoc(tracciaDoc(d, 't2'), (({ rev, ...r }) => r)(tr())));
  await assertSucceeds(setDoc(tracciaDoc(d, 't2'), tr({ titolo: 'x'.repeat(L.maxTitoloTraccia), testoMd: 'y'.repeat(L.maxTestoTraccia) })));
  await assertFails(setDoc(tracciaDoc(d, 't3'), tr({ titolo: 'x'.repeat(L.maxTitoloTraccia + 1) })));
  await assertFails(setDoc(tracciaDoc(d, 't3'), tr({ testoMd: 'y'.repeat(L.maxTestoTraccia + 1) })));
});

test('tracce: ogni modifica fa salire rev di uno, in bozza e a verifica aperta, non a chiusa', async () => {
  for (const stato of ['bozza', 'aperta']) {
    await semina(stato);
    const mod = (rev, extra = {}) => updateDoc(tracciaDoc(docente(), 't0'), { testoMd: 'corretto', rev, modificato: serverTimestamp(), ...extra });
    await assertFails(mod(0));                                                     // rev uguale
    await assertFails(mod(2));                                                     // salta
    await assertFails(mod(1, { modificato: fisso }));
    await assertFails(mod(1, { titolo: '' }));
    await assertFails(mod(1, { extra: 1 }));
    await assertSucceeds(mod(1));
    await assertSucceeds(mod(2));
  }
  await semina('chiusa');
  await assertFails(updateDoc(tracciaDoc(docente(), 't0'), { testoMd: 'corretto', rev: 1, modificato: serverTimestamp() }));
});

test('tracce: si cancellano solo in bozza', async () => {
  await semina('bozza');
  await assertFails(deleteDoc(tracciaDoc(anna(), 't0')));
  await assertFails(deleteDoc(tracciaDoc(collega(), 't0')));
  await assertSucceeds(deleteDoc(tracciaDoc(docente(), 't0')));
  for (const stato of ['aperta', 'chiusa']) {
    await semina(stato);
    await assertFails(deleteDoc(tracciaDoc(docente(), 't0')));
  }
});

// ── Tracce: lettura ───────────────────────────────────────────────────────
test('tracce: il docente del corso le legge sempre, tutte', async () => {
  for (const stato of ['bozza', 'aperta', 'chiusa']) {
    await semina(stato);
    await assertSucceeds(getDoc(tracciaDoc(docente(), 't0')));
    await assertSucceeds(getDoc(tracciaDoc(codocente(), 't1')));
    await assertSucceeds(getDocs(collection(docente(), 'verifiche/v1/tracce')));
    await assertFails(getDoc(tracciaDoc(collega(), 't0')));
    await assertFails(getDocs(collection(collega(), 'verifiche/v1/tracce')));
  }
});

test('tracce: lo studente legge solo la propria, e mai prima dell\'apertura', async () => {
  await semina('bozza');
  await assertFails(getDoc(tracciaDoc(anna(), 't0')));           // assegnata, ma la verifica è in bozza
  for (const stato of ['aperta', 'chiusa']) {
    await semina(stato);
    await assertSucceeds(getDoc(tracciaDoc(anna(), 't0')));
    await assertFails(getDoc(tracciaDoc(anna(), 't1')));         // un'altra traccia
    await assertFails(getDocs(collection(anna(), 'verifiche/v1/tracce')));
    await assertFails(getDoc(tracciaDoc(bruno(), 't0')));        // nessun lavoro
    await assertFails(getDoc(tracciaDoc(anonimo(), 't0')));
  }
});

test('tracce: lo studente senza traccia assegnata non legge niente', async () => {
  await semina('aperta');
  await admin((db) => setDoc(doc(db, `verifiche/v1/lavori/${ANNA}`), { scadenza: futuro() }));    // lavoro senza tracciaId
  await assertFails(getDoc(tracciaDoc(anna(), 't0')));
  await admin((db) => setDoc(doc(db, `verifiche/v1/lavori/${ANNA}`), { tracciaId: null }));
  await assertFails(getDoc(tracciaDoc(anna(), 't0')));
});

test('tracce: cambiando traccia assegnata, lo studente legge la nuova e non più la vecchia', async () => {
  await semina('aperta');
  await admin((db) => setDoc(doc(db, `verifiche/v1/lavori/${ANNA}`), { tracciaId: 't1' }));
  await assertSucceeds(getDoc(tracciaDoc(anna(), 't1')));
  await assertFails(getDoc(tracciaDoc(anna(), 't0')));
});
