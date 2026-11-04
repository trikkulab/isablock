// Regole delle consegne (copia immutabile del lavoro), emulatore Firestore.
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, updateDoc, writeBatch, query, where, serverTimestamp, Timestamp, setLogLevel } from 'firebase/firestore';
import { verificaConfig } from '../../src/cloud/verifica-config.js';

setLogLevel('silent');
const L = verificaConfig.regole;
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8186').split(':');
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-isablock-consegne',
    firestore: { host, port: Number(port), rules: readFileSync(process.env.REGOLE_FILE || 'firestore.rules', 'utf8') },
  });
});
after(() => env.cleanup());

const fisso = Timestamp.fromMillis(1_700_000_000_000);
const tra = (ms) => Timestamp.fromMillis(Date.now() + ms);
const CORSO = { materia: 'Informatica', classe: '3AINF', annoScolastico: '2026/27', docenti: ['docente@isarome.it', 'codocente@isarome.it'], iscrizioniAperte: true, attivo: true };
const ANNA = 'anna@isarome.it';
const BRUNO = 'bruno@isarome.it';
const MARIO = 'mario_rossi@isarome.it';             // un underscore nell'email non deve confondere l'id
const PROG = '{"formatVersion":6,"blocks":{"b":1}}';
const utente = (uid, email) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const docente = () => utente('d', 'docente@isarome.it');
const codocente = () => utente('c', 'codocente@isarome.it');
const collega = () => utente('x', 'collega@isarome.it');
const anna = () => utente('anna', ANNA);
const bruno = () => utente('bruno', BRUNO);
const mario = () => utente('mario', MARIO);
const anonimo = () => env.unauthenticatedContext().firestore();
const admin = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const lav = (db, email = ANNA) => doc(db, `verifiche/v1/lavori/${email}`);
const con = (db, id) => doc(db, `verifiche/v1/consegne/${id}`);

// Intestazione di una consegna dello studente
const cons = (email = ANNA, extra = {}) => ({
  studenteEmail: email, studenteNome: 'Anna Rossi', corsoId: 'AB12CD', titolo: 'V', versione: 1, origine: 'studente',
  tracciaId: 't0', programma: PROG, creato: serverTimestamp(), ...extra,
});
// Consegna del docente (raccolta)
const racc = (email = ANNA, extra = {}) => cons(email, { origine: 'raccolta', docenteEmail: 'docente@isarome.it', ...extra });
const file = (email = ANNA, extra = {}) => cons(email, {
  origine: 'file', docenteEmail: 'docente@isarome.it', impronta: 'a1b2c3', offlineDa: '10:42', nBlocchiSincronizzati: 14,
  nomeFile: 'rossi.anna_verifica-12nov_v2.isablock', programma: '{"formatVersion":6,"blocks":{"b":2}}', ...extra,
});
// Aggiornamento del lavoro che accompagna la consegna dello studente (entrato già fissato)
const aggLavoro = (extra = {}) => ({
  studenteNome: 'Anna Rossi', programma: PROG, programmaHash: 'abc', nBlocchi: 3, esecuzioni: { n: 0, esito: 'mai', quando: null },
  campioni: [], entrato: fisso, ultimoSegnale: serverTimestamp(), tracciaRevVista: 0, consegnato: true, ...extra,
});
// Batch dello studente: update del lavoro + consegna
const consegna = (db, { email = ANNA, id = `${email}_1`, lavoro = {}, consegna: c = {} } = {}) => {
  const b = writeBatch(db);
  b.update(lav(db, email), aggLavoro(lavoro));
  b.set(con(db, id), cons(email, c));
  return b.commit();
};

beforeEach(async () => {
  await env.clearFirestore();
  await admin(async (db) => {
    for (const e of ['docente@isarome.it', 'codocente@isarome.it', 'collega@isarome.it']) await setDoc(doc(db, `docenti/${e}`), { attivo: true });
    await setDoc(doc(db, 'corsi/AB12CD'), CORSO);
    await setDoc(doc(db, 'corsi/CH7Z9Q'), { ...CORSO, docenti: ['collega@isarome.it'] });
    for (const e of [ANNA, BRUNO, MARIO]) await setDoc(doc(db, `iscrizioni/AB12CD_${e}`), { corsoId: 'AB12CD', email: e });
  });
});

// Verifica con i lavori di Anna, Bruno e Mario: Anna e Mario sono già entrati con PROG, Bruno no.
const semina = (stato = 'aperta', lavoroAnna = {}) => admin(async (db) => {
  await setDoc(doc(db, 'verifiche/v1'), {
    corsoId: 'AB12CD', titolo: 'V', stato, fine: tra(3_600_000), tracciaDefault: 't0', creataDa: 'docente@isarome.it',
    creato: fisso, apertaIl: fisso, chiusaIl: stato === 'chiusa' ? fisso : null,
  });
  for (const t of ['t0', 't1']) await setDoc(doc(db, `verifiche/v1/tracce/${t}`), { titolo: t, testoMd: 'x', rev: 0, modificato: fisso });
  const base = { tracciaId: 't0', scadenza: tra(3_600_000), consegnato: false };
  await setDoc(lav(db, ANNA), { studenteEmail: ANNA, ...base, studenteNome: 'Anna Rossi', programma: PROG, programmaHash: 'abc', entrato: fisso, ultimoSegnale: fisso, ...lavoroAnna });
  await setDoc(lav(db, MARIO), { studenteEmail: MARIO, ...base, studenteNome: 'Mario Rossi', programma: PROG, entrato: fisso, ultimoSegnale: fisso });
  await setDoc(lav(db, BRUNO), { studenteEmail: BRUNO, ...base, entrato: null });
});

// ── Consegna dello studente ───────────────────────────────────────────────
test('consegne: lo studente consegna (manuale o automatica) con un batch: lavoro + consegna', async () => {
  await semina();
  await assertSucceeds(consegna(anna()));
  const l = (await getDoc(lav(docente()))).data();
  if (l.consegnato !== true) throw new Error('il lavoro non risulta consegnato');
  const c = await getDoc(con(docente(), `${ANNA}_1`));
  if (!c.exists() || c.data().origine !== 'studente') throw new Error('consegna mancante');
  await semina();
  await admin((db) => deleteDoc(con(db, `${ANNA}_1`)));
  await assertSucceeds(consegna(anna(), { consegna: { origine: 'automatica' } }));
});

test('consegne: la consegna può essere anche il primo salvataggio (ingresso); underscore nell\'email', async () => {
  await semina('aperta', { entrato: null });
  const db = anna();
  const b = writeBatch(db);
  b.update(lav(db), aggLavoro({ entrato: serverTimestamp() }));
  b.set(con(db, `${ANNA}_1`), cons());
  await assertSucceeds(b.commit());
  await semina();
  await assertSucceeds(consegna(mario(), { email: MARIO, lavoro: { studenteNome: 'Mario Rossi' }, consegna: { studenteNome: 'Mario Rossi' } }));
});

test('consegne: la consegna da sola, o il lavoro da solo, non bastano', async () => {
  await semina();
  await assertFails(setDoc(con(anna(), `${ANNA}_1`), cons()));                                    // senza aggiornare il lavoro
  await assertFails(updateDoc(lav(anna()), aggLavoro()));                                          // senza la consegna
  await assertFails(setDoc(con(anna(), `${ANNA}_1`), cons(ANNA, { programma: '{"altro":1}' })));
  const db = anna();
  const b = writeBatch(db);
  b.update(lav(db), aggLavoro({ consegnato: false }));                                             // il lavoro non risulta consegnato
  b.set(con(db, `${ANNA}_1`), cons());
  await assertFails(b.commit());
});

test('consegne: il contenuto deve essere quello del lavoro, la traccia quella assegnata', async () => {
  await semina();
  await assertFails(consegna(anna(), { consegna: { programma: '{"altro":1}' } }));                // diverso dal lavoro dopo il batch
  await assertFails(consegna(anna(), { consegna: { studenteNome: 'Un altro' } }));
  await assertFails(consegna(anna(), { consegna: { tracciaId: 't1' } }));                         // non è la sua
  await assertFails(consegna(anna(), { consegna: { corsoId: 'CH7Z9Q' } }));
  await assertFails(consegna(anna(), { consegna: { titolo: 'Altra verifica' } }));
  await assertFails(consegna(anna(), { consegna: { programma: '' }, lavoro: { programma: '' } }));
  await assertSucceeds(consegna(anna(), { lavoro: { programma: '{"ultima":"modifica"}' }, consegna: { programma: '{"ultima":"modifica"}' } })); // l'ultimo salvataggio fa parte del batch
});

test('consegne: forma, id e versione della consegna dello studente', async () => {
  await semina();
  const prova = (c, id) => consegna(anna(), { consegna: c, id });
  await assertFails(prova({ versione: 2 }, `${ANNA}_2`));                                         // lo studente fa solo v1
  await assertFails(prova({}, `${ANNA}_2`));                                                       // id e versione non coincidono
  await assertFails(prova({}, 'altro_1'));
  await assertFails(prova({ origine: 'raccolta', docenteEmail: 'docente@isarome.it' }));
  await assertFails(prova({ origine: 'file' }));
  await assertFails(prova({ origine: 'inventata' }));
  await assertFails(prova({ extra: 1 }));
  await assertFails(prova({ docenteEmail: 'docente@isarome.it' }));
  await assertFails(prova({ creato: fisso }));
  await assertFails(prova({ versione: '1' }));
  const db = anna();
  const b = writeBatch(db);                                                                         // senza il campo programma
  b.update(lav(db), aggLavoro());
  b.set(con(db, `${ANNA}_1`), (({ programma, ...r }) => r)(cons()));
  await assertFails(b.commit());
});

test('consegne: solo la propria, solo a verifica aperta, solo una volta', async () => {
  await semina();
  await assertFails(consegna(bruno(), { email: ANNA }));                                           // il lavoro di un altro
  await assertFails(consegna(anna(), { consegna: { studenteEmail: BRUNO }, id: `${BRUNO}_1` }));
  await assertFails(consegna(docente(), { email: ANNA }));
  await assertFails(consegna(anonimo(), { email: ANNA }));
  const nv = env.authenticatedContext('anna2', { email: ANNA, email_verified: false }).firestore();
  await assertFails(consegna(nv));
  for (const stato of ['bozza', 'chiusa']) {
    await semina(stato);
    await assertFails(consegna(anna()));
  }
  await semina('aperta', { consegnato: true });                                                    // già consegnato
  await assertFails(consegna(anna()));
  await semina();
  await assertSucceeds(consegna(anna()));
});

test('consegne: la consegna deve far passare il lavoro a «consegnato»: uno stato già incoerente non basta', async () => {
  await semina('aperta', { consegnato: true });                       // lavoro «consegnato» ma senza consegna (non succede con le regole: solo per forza)
  await assertFails(setDoc(con(anna(), `${ANNA}_1`), cons()));         // la consegna da sola, senza batch
});

test('consegne: il tempo conta: dentro la grazia sì, oltre no, con tempo aggiuntivo di nuovo sì', async () => {
  await semina('aperta', { scadenza: tra(-5_000) });
  await assertSucceeds(consegna(anna()));
  await admin((db) => deleteDoc(con(db, `${ANNA}_1`)));
  await semina('aperta', { scadenza: tra(-(L.graziaSecondi + 30) * 1000) });
  await assertFails(consegna(anna()));
  await admin((db) => updateDoc(lav(db), { scadenza: tra(600_000) }));
  await assertSucceeds(consegna(anna()));
});

test('consegne: una consegna esistente non si sovrascrive (lo studente non riconsegna)', async () => {
  await semina();
  await assertSucceeds(consegna(anna()));
  await admin((db) => updateDoc(lav(db), { consegnato: false }));                                  // anche forzando il lavoro
  await assertFails(consegna(anna(), { lavoro: { programma: '{"v2":1}' }, consegna: { programma: '{"v2":1}' } }));
  await assertFails(consegna(anna(), { consegna: { versione: 2 }, id: `${ANNA}_2` }));
});

// ── Raccolta del docente ──────────────────────────────────────────────────
test('consegne: il docente raccoglie a verifica chiusa, dal lavoro com\'è', async () => {
  await semina('chiusa');
  await assertSucceeds(setDoc(con(docente(), `${ANNA}_1`), racc()));
  await assertSucceeds(setDoc(con(codocente(), `${MARIO}_1`), racc(MARIO, { studenteNome: 'Mario Rossi', docenteEmail: 'codocente@isarome.it' })));
});

test('consegne: la raccolta ha le sue condizioni', async () => {
  await semina('chiusa');
  const d = docente();
  const prova = (extra, id = `${ANNA}_1`) => setDoc(con(d, id), racc(ANNA, extra));
  await assertFails(prova({ programma: '{"altro":1}' }));                                          // non è il lavoro
  await assertFails(prova({ studenteNome: 'Un altro' }));
  await assertFails(prova({ tracciaId: 't1' }));
  await assertFails(prova({ docenteEmail: 'codocente@isarome.it' }));                              // non è chi scrive
  await assertFails(prova({ corsoId: 'CH7Z9Q' }));
  await assertFails(prova({ titolo: 'Altra' }));
  await assertFails(prova({ creato: fisso }));
  await assertFails(prova({ extra: 1 }));
  await assertFails(prova({ impronta: 'x' }));
  await assertFails(prova({ origine: 'studente' }));
  await assertFails(prova({ versione: 2 }, `${ANNA}_2`));                                         // manca la v1
  await assertFails(prova({}, `${ANNA}_2`));
  await assertFails(setDoc(con(d, `${BRUNO}_1`), racc(BRUNO, { studenteNome: 'Bruno' })));          // Bruno non è mai entrato: niente da raccogliere
  await assertFails(setDoc(con(d, 'nessuno@isarome.it_1'), racc('nessuno@isarome.it')));           // nessun lavoro
  await assertSucceeds(prova({}));
  await assertFails(prova({}));                                                                    // già esiste: create-only
  await assertSucceeds(prova({ versione: 2 }, `${ANNA}_2`));                                       // ora la v2 ha la sua v1
});

test('consegne: la raccolta solo a verifica chiusa e solo dal docente del corso', async () => {
  await semina('aperta');
  await assertFails(setDoc(con(docente(), `${ANNA}_1`), racc()));
  await semina('bozza');
  await assertFails(setDoc(con(docente(), `${ANNA}_1`), racc()));
  await semina('chiusa');
  await assertFails(setDoc(con(anna(), `${ANNA}_1`), racc()));
  await assertFails(setDoc(con(bruno(), `${ANNA}_1`), racc()));
  await assertFails(setDoc(con(collega(), `${ANNA}_1`), racc(ANNA, { docenteEmail: 'collega@isarome.it' })));
  await assertFails(setDoc(con(anonimo(), `${ANNA}_1`), racc()));
  await admin((db) => deleteDoc(doc(db, 'docenti/codocente@isarome.it')));
  await assertFails(setDoc(con(codocente(), `${ANNA}_1`), racc(ANNA, { docenteEmail: 'codocente@isarome.it' })));
});

// ── Caricamento del file di emergenza ─────────────────────────────────────
test('consegne: il docente carica il file di emergenza, anche per chi non ha consegnato né è entrato', async () => {
  await semina('chiusa');
  await assertSucceeds(setDoc(con(docente(), `${ANNA}_1`), file()));
  await assertSucceeds(setDoc(con(docente(), `${BRUNO}_1`), file(BRUNO, { studenteNome: 'Bruno Verdi' })));   // mai entrato
  await assertSucceeds(setDoc(con(docente(), `${ANNA}_2`), file(ANNA, { versione: 2, offlineDa: null, nBlocchiSincronizzati: null })));
});

test('consegne: il file ha la sua forma e le sue condizioni', async () => {
  await semina('chiusa');
  const d = docente();
  const prova = (extra, id = `${ANNA}_1`) => setDoc(con(d, id), file(ANNA, extra));
  await assertFails(prova({ impronta: '' }));
  await assertFails(prova({ impronta: 'x'.repeat(65) }));
  await assertFails(prova({ nomeFile: '' }));
  await assertFails(prova({ nomeFile: 'x'.repeat(121) }));
  await assertFails(prova({ offlineDa: 'x'.repeat(41) }));
  await assertFails(prova({ offlineDa: 1042 }));
  await assertFails(prova({ nBlocchiSincronizzati: -1 }));
  await assertFails(prova({ nBlocchiSincronizzati: L.maxBlocchi + 1 }));
  await assertFails(prova({ nBlocchiSincronizzati: '14' }));
  await assertFails(prova({ studenteNome: '' }));
  await assertFails(prova({ studenteNome: 'x'.repeat(81) }));
  await assertFails(prova({ programma: '' }));
  await assertFails(prova({ programma: 'x'.repeat(L.maxProgramma + 1) }));
  await assertFails(prova({ docenteEmail: 'codocente@isarome.it' }));
  await assertFails(prova({ tracciaId: 't1' }));                                                   // la traccia è quella assegnata
  await assertFails(prova({ corsoId: 'CH7Z9Q' }));
  await assertFails(prova({ titolo: 'Altra' }));
  await assertFails(prova({ creato: fisso }));
  await assertFails(prova({ extra: 1 }));
  await assertFails(setDoc(con(d, `${ANNA}_1`), (({ impronta, ...r }) => r)(file())));
  await assertFails(prova({ versione: 3 }, `${ANNA}_3`));                                          // salta la v2
  await assertFails(setDoc(con(d, 'nessuno@isarome.it_1'), file('nessuno@isarome.it')));           // nessun lavoro assegnato
  await assertSucceeds(prova({ programma: 'x'.repeat(L.maxProgramma), nomeFile: 'x'.repeat(120), impronta: 'x'.repeat(64) }));
});

test('consegne: il file solo a verifica chiusa e solo dal docente del corso', async () => {
  for (const stato of ['bozza', 'aperta']) {
    await semina(stato);
    await assertFails(setDoc(con(docente(), `${ANNA}_1`), file()));
  }
  await semina('chiusa');
  await assertFails(setDoc(con(anna(), `${ANNA}_1`), file()));
  await assertFails(setDoc(con(collega(), `${ANNA}_1`), file(ANNA, { docenteEmail: 'collega@isarome.it' })));
  await assertFails(setDoc(con(anonimo(), `${ANNA}_1`), file()));
});

test('consegne: il tetto di versioni segue la configurazione', async () => {
  await semina('chiusa');
  await admin(async (db) => {
    for (let n = 1; n < L.maxVersioniConsegna; n++) await setDoc(con(db, `${ANNA}_${n}`), cons(ANNA, { versione: n, creato: fisso }));
  });
  await assertSucceeds(setDoc(con(docente(), `${ANNA}_${L.maxVersioniConsegna}`), file(ANNA, { versione: L.maxVersioniConsegna })));
  await assertFails(setDoc(con(docente(), `${ANNA}_${L.maxVersioniConsegna + 1}`), file(ANNA, { versione: L.maxVersioniConsegna + 1 })));
  await assertFails(setDoc(con(docente(), `${ANNA}_0`), file(ANNA, { versione: 0 })));
});

// ── Immutabilità e lettura ────────────────────────────────────────────────
test('consegne: nessuno modifica o cancella una consegna', async () => {
  await semina('chiusa');
  await admin((db) => setDoc(con(db, `${ANNA}_1`), cons(ANNA, { creato: fisso })));
  for (const db of [docente(), codocente(), anna(), bruno(), collega(), anonimo()]) {
    await assertFails(updateDoc(con(db, `${ANNA}_1`), { programma: 'cambiato' }));
    await assertFails(deleteDoc(con(db, `${ANNA}_1`)));
    await assertFails(setDoc(con(db, `${ANNA}_1`), cons(ANNA, { programma: 'sovrascritto' })));
  }
});

test('consegne: legge lo studente le proprie (query per email), il docente del corso tutte', async () => {
  await semina('chiusa');
  await admin(async (db) => {
    await setDoc(con(db, `${ANNA}_1`), cons(ANNA, { creato: fisso }));
    await setDoc(con(db, `${ANNA}_2`), cons(ANNA, { versione: 2, creato: fisso, origine: 'raccolta', docenteEmail: 'docente@isarome.it' }));
    await setDoc(con(db, `${BRUNO}_1`), cons(BRUNO, { creato: fisso, studenteNome: 'Bruno' }));
  });
  const proprie = (db, email) => getDocs(query(collection(db, 'verifiche/v1/consegne'), where('studenteEmail', '==', email)));
  await assertSucceeds(proprie(anna(), ANNA));
  await assertSucceeds(proprie(bruno(), BRUNO));
  await assertFails(proprie(anna(), BRUNO));                                                       // le consegne di un compagno
  await assertFails(getDocs(collection(anna(), 'verifiche/v1/consegne')));                          // l'elenco intero
  await assertFails(getDocs(collection(anonimo(), 'verifiche/v1/consegne')));
  await assertSucceeds(getDocs(collection(docente(), 'verifiche/v1/consegne')));
  await assertSucceeds(getDocs(collection(codocente(), 'verifiche/v1/consegne')));
  await assertFails(getDocs(collection(collega(), 'verifiche/v1/consegne')));
  await assertSucceeds(getDoc(con(docente(), `${BRUNO}_1`)));
  await assertFails(getDoc(con(anna(), `${BRUNO}_1`)));
  const nv = env.authenticatedContext('anna2', { email: ANNA, email_verified: false }).firestore();
  await assertFails(proprie(nv, ANNA));
});
