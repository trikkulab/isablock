// Regole dei commenti del docente sugli sketch condivisi (emulatore Firestore).
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, deleteDoc, updateDoc, query, where, serverTimestamp, Timestamp, setLogLevel } from 'firebase/firestore';

setLogLevel('silent');
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8186').split(':');
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-isablock-commenti',
    firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(() => env.cleanup());

const fisso = Timestamp.fromMillis(1_700_000_000_000);
const CORSO = { materia: 'Informatica', classe: '3AINF', annoScolastico: '2026/27', docenti: ['docente@isarome.it', 'codocente@isarome.it'], iscrizioniAperte: true, attivo: true };
const ANNA = 'anna@isarome.it';
const utente = (uid, email) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const docente = () => utente('d', 'docente@isarome.it');
const codocente = () => utente('c', 'codocente@isarome.it');
const collega = () => utente('x', 'collega@isarome.it');
const anna = () => utente('anna', ANNA);
const bruno = () => utente('bruno', 'bruno@isarome.it');
const sketchCondiviso = (extra = {}) => ({
  proprietarioUid: 'anna', nome: 'drago', creato: fisso, modificato: fisso, programma: '{"formatVersion":6,"blocks":{}}',
  condivisoCon: 'AB12CD', proprietarioEmail: ANNA, proprietarioNome: 'Anna Rossi', ...extra,
});
const com = (extra = {}) => ({
  sketchId: 'anna_0', sketchCreato: fisso, proprietarioUid: 'anna', corsoId: 'AB12CD',
  bloccoId: 'blk1', bloccoTesto: 'SE x > 3', testo: 'Controlla la condizione',
  autoreEmail: 'docente@isarome.it', autoreNome: 'Docente Prova',
  creato: serverTimestamp(), modificato: serverTimestamp(), letto: false, ...extra,
});
const scrivi = (db, id, dati) => setDoc(doc(db, `commenti/${id}`), dati);
const admin = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

beforeEach(async () => {
  await env.clearFirestore();
  await admin(async (db) => {
    for (const e of ['docente@isarome.it', 'codocente@isarome.it', 'collega@isarome.it']) await setDoc(doc(db, `docenti/${e}`), { attivo: true });
    await setDoc(doc(db, 'corsi/AB12CD'), CORSO);
    await setDoc(doc(db, 'corsi/CH7Z9Q'), { ...CORSO, docenti: ['collega@isarome.it'] });
    await setDoc(doc(db, `iscrizioni/AB12CD_${ANNA}`), { corsoId: 'AB12CD', email: ANNA });
    await setDoc(doc(db, 'sketch/anna_0'), sketchCondiviso());
    await setDoc(doc(db, 'sketch/anna_1'), { ...sketchCondiviso(), condivisoCon: null });
  });
});
// un commento già scritto dal titolare, saltando le regole
const esiste = (id = 'anna_0_0', extra = {}) => admin((db) => setDoc(doc(db, `commenti/${id}`), { ...com({ creato: fisso, modificato: fisso }), ...extra }));

test('commenti: il docente del corso (anche codocente) commenta un blocco o l\'intero sketch', async () => {
  await assertSucceeds(scrivi(docente(), 'anna_0_0', com()));
  await assertSucceeds(scrivi(docente(), 'anna_0_1', com({ bloccoId: null, bloccoTesto: '' })));
  await assertSucceeds(scrivi(codocente(), 'anna_0_2', com({ autoreEmail: 'codocente@isarome.it', autoreNome: 'Co Docente' })));
});

test('commenti: tetto di 30 per sketch (id da 0 a 29) e forma dell\'id', async () => {
  await assertSucceeds(scrivi(docente(), 'anna_0_29', com()));
  await assertFails(scrivi(docente(), 'anna_0_30', com()));
  await assertFails(scrivi(docente(), 'anna_0_-1', com()));
  await assertFails(scrivi(docente(), 'anna_0_01x', com()));
  await assertFails(scrivi(docente(), 'qualsiasi', com()));
  await assertFails(scrivi(docente(), 'anna_1_0', com()));   // id di un altro sketch
  await assertFails(scrivi(docente(), 'anna_0', com()));     // manca _n
});

test('commenti: chi non può commentare', async () => {
  await assertFails(scrivi(anna(), 'anna_0_0', com({ autoreEmail: ANNA, autoreNome: 'Anna' })));            // lo studente
  await assertFails(scrivi(bruno(), 'anna_0_0', com({ autoreEmail: 'bruno@isarome.it' })));
  await assertFails(scrivi(collega(), 'anna_0_0', com({ autoreEmail: 'collega@isarome.it' })));              // docente di un altro corso, corsoId AB12CD
  await assertFails(scrivi(collega(), 'anna_0_0', com({ autoreEmail: 'collega@isarome.it', corsoId: 'CH7Z9Q' }))); // suo corso, ma lo sketch non è condiviso con lui
  await assertFails(scrivi(env.unauthenticatedContext().firestore(), 'anna_0_0', com()));
  await admin((db) => deleteDoc(doc(db, 'docenti/codocente@isarome.it')));
  await assertFails(scrivi(codocente(), 'anna_0_0', com({ autoreEmail: 'codocente@isarome.it' }))); // non è più docente
});

test('commenti: lo sketch deve essere condiviso con quel corso, dello studente iscritto, corso attivo', async () => {
  await assertFails(scrivi(docente(), 'anna_1_0', com({ sketchId: 'anna_1' })));          // sketch non condiviso
  await admin((db) => deleteDoc(doc(db, `iscrizioni/AB12CD_${ANNA}`)));
  await assertFails(scrivi(docente(), 'anna_0_0', com()));                                 // studente tolto dal corso
  await admin((db) => setDoc(doc(db, `iscrizioni/AB12CD_${ANNA}`), { corsoId: 'AB12CD', email: ANNA }));
  await assertSucceeds(scrivi(docente(), 'anna_0_0', com()));
  await admin((db) => setDoc(doc(db, 'corsi/AB12CD'), { ...CORSO, attivo: false }));
  await assertFails(scrivi(docente(), 'anna_0_1', com()));                                 // corso archiviato
  await assertFails(scrivi(docente(), 'anna_9_0', com({ sketchId: 'anna_9' })));           // sketch inesistente
});

test('commenti: la creazione rifiuta forme sbagliate o abusive', async () => {
  const prova = (extra, id = 'anna_0_0') => assertFails(scrivi(docente(), id, com(extra)));
  await prova({ extra: 1 });
  await prova({ testo: '' });
  await prova({ testo: 'x'.repeat(501) });
  await prova({ testo: 5 });
  await prova({ letto: true });
  await prova({ creato: fisso });
  await prova({ modificato: fisso });
  await prova({ sketchCreato: Timestamp.fromMillis(1) });          // non è la creazione dello sketch
  await prova({ proprietarioUid: 'bruno' });                       // non è il proprietario
  await prova({ autoreEmail: 'codocente@isarome.it' });            // firma di un altro
  await prova({ autoreNome: '' });
  await prova({ autoreNome: 'x'.repeat(81) });
  await prova({ bloccoId: '' });
  await prova({ bloccoId: 'x'.repeat(101) });
  await prova({ bloccoId: 5 });
  await prova({ bloccoTesto: 'x'.repeat(201) });
  await prova({ corsoId: 'ab12cd' });
  const { letto, ...senza } = com();
  await assertFails(scrivi(docente(), 'anna_0_0', senza));
  await assertSucceeds(scrivi(docente(), 'anna_0_0', com({ testo: 'x'.repeat(500), bloccoTesto: 'x'.repeat(200), bloccoId: 'x'.repeat(100) })));
});

test('commenti: legge lo studente autore e i docenti del corso, nessun altro', async () => {
  await esiste('anna_0_0');
  const perStudente = (db, uid) => getDocs(query(collection(db, 'commenti'), where('proprietarioUid', '==', uid)));
  const perSketch = (db, corso = 'AB12CD') => getDocs(query(collection(db, 'commenti'), where('sketchId', '==', 'anna_0'), where('corsoId', '==', corso), where('sketchCreato', '==', fisso)));
  const s1 = await assertSucceeds(perStudente(anna(), 'anna'));
  if (s1.size !== 1) throw new Error('lo studente deve vedere 1 commento');
  await assertFails(perStudente(bruno(), 'anna'));                       // non i commenti di un altro
  await assertFails(getDoc(doc(bruno(), 'commenti/anna_0_0')));
  await assertFails(getDocs(collection(anna(), 'commenti')));            // senza filtro
  for (const chi of [docente(), codocente()]) {
    const s = await assertSucceeds(perSketch(chi));
    if (s.size !== 1) throw new Error('il docente deve vedere 1 commento');
  }
  await assertSucceeds(getDoc(doc(docente(), 'commenti/anna_0_0')));
  await assertFails(perSketch(collega()));
  await assertFails(perSketch(collega(), 'CH7Z9Q'));
  await assertFails(getDocs(query(collection(docente(), 'commenti'), where('sketchId', '==', 'anna_0')))); // senza corsoId
  await assertFails(getDocs(query(collection(docente(), 'commenti'), where('sketchId', '==', 'anna_0'), where('corsoId', '==', 'AB12CD')))); // senza sketchCreato
  await assertFails(getDocs(collection(docente(), 'commenti')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'commenti/anna_0_0')));
});

test('commenti: il docente li vede finché lo sketch è condiviso con il suo corso, lo studente sempre', async () => {
  await esiste('anna_0_0');
  const perSketch = () => getDocs(query(collection(docente(), 'commenti'), where('sketchId', '==', 'anna_0'), where('corsoId', '==', 'AB12CD'), where('sketchCreato', '==', fisso)));
  const perStudente = () => getDocs(query(collection(anna(), 'commenti'), where('proprietarioUid', '==', 'anna')));
  // ritirata la condivisione
  await admin((db) => setDoc(doc(db, 'sketch/anna_0'), sketchCondiviso({ condivisoCon: null })));
  await assertFails(perSketch());
  await assertSucceeds(perStudente());
  // condiviso con un altro corso: i docenti di AB12CD non lo vedono; quelli dell'altro corso nemmeno i commenti di AB12CD
  await admin(async (db) => {
    await setDoc(doc(db, 'iscrizioni/CH7Z9Q_anna@isarome.it'), { corsoId: 'CH7Z9Q', email: ANNA });
    await setDoc(doc(db, 'sketch/anna_0'), sketchCondiviso({ condivisoCon: 'CH7Z9Q' }));
  });
  await assertFails(perSketch());
  await assertFails(getDocs(query(collection(collega(), 'commenti'), where('sketchId', '==', 'anna_0'), where('corsoId', '==', 'AB12CD'), where('sketchCreato', '==', fisso))));
  await assertSucceeds(perStudente());
  // di nuovo condiviso con AB12CD
  await admin((db) => setDoc(doc(db, 'sketch/anna_0'), sketchCondiviso()));
  await assertSucceeds(perSketch());
  // studente tolto dal corso / corso archiviato
  await admin((db) => deleteDoc(doc(db, `iscrizioni/AB12CD_${ANNA}`)));
  await assertFails(perSketch());
  await assertSucceeds(perStudente());
  await admin((db) => setDoc(doc(db, `iscrizioni/AB12CD_${ANNA}`), { corsoId: 'AB12CD', email: ANNA }));
  await assertSucceeds(perSketch());
  await admin((db) => setDoc(doc(db, 'corsi/AB12CD'), { ...CORSO, attivo: false }));
  await assertFails(perSketch());
  await assertSucceeds(perStudente());
  await admin((db) => setDoc(doc(db, 'corsi/AB12CD'), CORSO));
  // sketch ricreato con lo stesso id (altra creazione): i vecchi commenti non si leggono
  await admin((db) => setDoc(doc(db, 'sketch/anna_0'), sketchCondiviso({ creato: Timestamp.fromMillis(1_800_000_000_000) })));
  await assertFails(perSketch());
  // docente tolto dall'elenco docenti ma ancora nell'array del corso
  await admin((db) => setDoc(doc(db, 'sketch/anna_0'), sketchCondiviso()));
  await admin((db) => deleteDoc(doc(db, 'docenti/codocente@isarome.it')));
  await assertFails(getDocs(query(collection(codocente(), 'commenti'), where('sketchId', '==', 'anna_0'), where('corsoId', '==', 'AB12CD'), where('sketchCreato', '==', fisso))));
});

test('commenti: il docente modifica solo il testo dei propri', async () => {
  await esiste('anna_0_0');
  const nuovo = (extra = {}) => ({ testo: 'Testo corretto', modificato: serverTimestamp(), ...extra });
  await assertSucceeds(updateDoc(doc(docente(), 'commenti/anna_0_0'), nuovo()));
  await assertFails(updateDoc(doc(codocente(), 'commenti/anna_0_0'), nuovo()));       // l'autore è un altro
  await assertFails(updateDoc(doc(collega(), 'commenti/anna_0_0'), nuovo()));
  await assertFails(updateDoc(doc(anna(), 'commenti/anna_0_0'), nuovo()));            // lo studente non modifica il testo
  for (const extra of [{ bloccoId: 'altro' }, { autoreEmail: 'codocente@isarome.it' }, { corsoId: 'CH7Z9Q' }, { letto: true }, { sketchId: 'anna_1' }, { proprietarioUid: 'bruno' }, { creato: serverTimestamp() }, { bloccoTesto: 'x' }]) {
    await assertFails(updateDoc(doc(docente(), 'commenti/anna_0_0'), nuovo(extra)));
  }
  await assertFails(updateDoc(doc(docente(), 'commenti/anna_0_0'), nuovo({ testo: '' })));
  await assertFails(updateDoc(doc(docente(), 'commenti/anna_0_0'), nuovo({ testo: 'x'.repeat(501) })));
  await assertFails(updateDoc(doc(docente(), 'commenti/anna_0_0'), { testo: 'senza data' }));
  await assertFails(updateDoc(doc(docente(), 'commenti/anna_0_0'), nuovo({ modificato: fisso })));
  // se lo sketch non è più condiviso, nemmeno l'autore lo modifica
  await admin((db) => setDoc(doc(db, 'sketch/anna_0'), sketchCondiviso({ condivisoCon: null })));
  await assertFails(updateDoc(doc(docente(), 'commenti/anna_0_0'), nuovo()));
});

test('commenti: lo studente segna come letto e non cambia altro', async () => {
  await esiste('anna_0_0');
  await assertSucceeds(updateDoc(doc(anna(), 'commenti/anna_0_0'), { letto: true }));
  await assertSucceeds(updateDoc(doc(anna(), 'commenti/anna_0_0'), { letto: false }));
  await assertFails(updateDoc(doc(anna(), 'commenti/anna_0_0'), { letto: 'si' }));
  await assertFails(updateDoc(doc(anna(), 'commenti/anna_0_0'), { letto: true, testo: 'riscritto' }));
  await assertFails(updateDoc(doc(anna(), 'commenti/anna_0_0'), { testo: 'riscritto' }));
  await assertFails(updateDoc(doc(bruno(), 'commenti/anna_0_0'), { letto: true }));          // non è il suo
  await assertFails(updateDoc(doc(docente(), 'commenti/anna_0_0'), { letto: true, modificato: serverTimestamp() })); // il docente non lo segna
  await assertFails(updateDoc(doc(docente(), 'commenti/anna_0_0'), { letto: true }));
});

test('commenti: li cancella l\'autore o un docente del corso; lo studente solo se lo sketch non esiste più', async () => {
  await esiste('anna_0_0'); await esiste('anna_0_1'); await esiste('anna_0_2'); await esiste('anna_0_3');
  await assertFails(deleteDoc(doc(anna(), 'commenti/anna_0_0')));                    // sketch esistente: non può
  await assertFails(deleteDoc(doc(bruno(), 'commenti/anna_0_0')));
  await assertFails(deleteDoc(doc(collega(), 'commenti/anna_0_0')));
  await assertSucceeds(deleteDoc(doc(docente(), 'commenti/anna_0_0')));              // autore
  await assertSucceeds(deleteDoc(doc(codocente(), 'commenti/anna_0_1')));            // altro docente del corso
  // sketch eliminato: lo studente ripulisce
  await admin((db) => deleteDoc(doc(db, 'sketch/anna_0')));
  await assertFails(deleteDoc(doc(bruno(), 'commenti/anna_0_2')));                   // non è suo
  await assertSucceeds(deleteDoc(doc(anna(), 'commenti/anna_0_2')));
  // sketch ricreato con lo stesso id: i commenti vecchi sono orfani anche se l'id esiste
  await admin((db) => setDoc(doc(db, 'sketch/anna_0'), sketchCondiviso({ creato: Timestamp.fromMillis(1_800_000_000_000) })));
  await assertSucceeds(deleteDoc(doc(anna(), 'commenti/anna_0_3')));
});

test('commenti: chi non è più nell\'elenco docenti non cancella nemmeno i propri commenti', async () => {
  await esiste('anna_0_0');
  await admin((db) => deleteDoc(doc(db, 'docenti/docente@isarome.it')));
  await assertFails(deleteDoc(doc(docente(), 'commenti/anna_0_0')));                 // isDocente() fallisce: serve ancora il ruolo
});
