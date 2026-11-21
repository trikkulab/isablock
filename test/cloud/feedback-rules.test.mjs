// Regole dei feedback del docente sulle consegne di una verifica (emulatore Firestore).
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, updateDoc, writeBatch, query, where, serverTimestamp, Timestamp, setLogLevel } from 'firebase/firestore';

setLogLevel('silent');
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8186').split(':');
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-isablock-feedback',
    firestore: { host, port: Number(port), rules: readFileSync(process.env.REGOLE_FILE || 'firestore.rules', 'utf8') },
  });
});
after(() => env.cleanup());

const fisso = Timestamp.fromMillis(1_700_000_000_000);
const CORSO = { materia: 'Informatica', classe: '3AINF', annoScolastico: '2026/27', docenti: ['docente@isarome.it', 'codocente@isarome.it'], iscrizioniAperte: true, attivo: true };
const ANNA = 'anna@isarome.it';
const MARIO = 'mario_rossi@isarome.it';             // un underscore nell'email non deve confondere l'id
const utente = (uid, email) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const docente = () => utente('d', 'docente@isarome.it');
const codocente = () => utente('c', 'codocente@isarome.it');
const collega = () => utente('x', 'collega@isarome.it');
const anna = () => utente('anna', ANNA);
const bruno = () => utente('bruno', 'bruno@isarome.it');
const anonimo = () => env.unauthenticatedContext().firestore();
const admin = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

const fb = (extra = {}) => ({
  verificaId: 'v1', studenteEmail: ANNA, versione: 1, corsoId: 'AB12CD',
  bloccoId: 'blk1', bloccoTesto: 'SE x > 3', testo: 'Controlla la condizione',
  autoreEmail: 'docente@isarome.it', autoreNome: 'Docente Prova',
  creato: serverTimestamp(), modificato: serverTimestamp(), pubblicato: false, pubblicatoIl: null, ...extra,
});
const scrivi = (db, id, dati) => setDoc(doc(db, `feedback/${id}`), dati);
// un feedback già scritto, saltando le regole
const esiste = (id = 'v1_anna@isarome.it_1_0', extra = {}) => admin((db) => setDoc(doc(db, `feedback/${id}`), { ...fb({ creato: fisso, modificato: fisso }), ...extra }));

const semina = (stato = 'chiusa', versioni = [1]) => admin(async (db) => {
  await setDoc(doc(db, 'verifiche/v1'), { corsoId: 'AB12CD', titolo: 'V', stato, tracciaDefault: 't0', creataDa: 'docente@isarome.it', creato: fisso });
  for (const email of [ANNA, MARIO]) {
    for (const v of versioni) {
      await setDoc(doc(db, `verifiche/v1/consegne/${email}_${v}`), { studenteEmail: email, corsoId: 'AB12CD', versione: v, programma: '{}', creato: fisso });
    }
  }
});

beforeEach(async () => {
  await env.clearFirestore();
  await admin(async (db) => {
    for (const e of ['docente@isarome.it', 'codocente@isarome.it', 'collega@isarome.it']) await setDoc(doc(db, `docenti/${e}`), { attivo: true });
    await setDoc(doc(db, 'corsi/AB12CD'), CORSO);
    await setDoc(doc(db, 'corsi/CH7Z9Q'), { ...CORSO, docenti: ['collega@isarome.it'] });
    for (const e of [ANNA, MARIO, 'bruno@isarome.it']) await setDoc(doc(db, `iscrizioni/AB12CD_${e}`), { corsoId: 'AB12CD', email: e });
  });
});

test('feedback: il docente del corso (anche codocente) commenta un blocco o l\'intera consegna, sempre come bozza', async () => {
  await semina();
  await assertSucceeds(scrivi(docente(), 'v1_anna@isarome.it_1_0', fb()));
  await assertSucceeds(scrivi(docente(), 'v1_anna@isarome.it_1_1', fb({ bloccoId: null, bloccoTesto: '' })));
  await assertSucceeds(scrivi(codocente(), 'v1_anna@isarome.it_1_2', fb({ autoreEmail: 'codocente@isarome.it', autoreNome: 'Co Docente' })));
  // non si crea già pubblicato
  await assertFails(scrivi(docente(), 'v1_anna@isarome.it_1_3', fb({ pubblicato: true, pubblicatoIl: serverTimestamp() })));
});

test('feedback: solo a verifica chiusa e solo sull\'ultima versione della consegna', async () => {
  await semina('aperta');
  await assertFails(scrivi(docente(), 'v1_anna@isarome.it_1_0', fb()));
  await env.clearFirestore();
  await admin(async (db) => { await setDoc(doc(db, 'docenti/docente@isarome.it'), { attivo: true }); await setDoc(doc(db, 'corsi/AB12CD'), CORSO); });
  await semina('chiusa', [1, 2]);
  await assertFails(scrivi(docente(), 'v1_anna@isarome.it_1_0', fb({ versione: 1 })));      // la v1 non è più l'ultima
  await assertSucceeds(scrivi(docente(), 'v1_anna@isarome.it_2_0', fb({ versione: 2 })));
  await assertFails(scrivi(docente(), 'v1_anna@isarome.it_3_0', fb({ versione: 3 })));      // la v3 non esiste
});

test('feedback: chi non è docente del corso non scrive; nemmeno lo studente', async () => {
  await semina();
  await assertFails(scrivi(collega(), 'v1_anna@isarome.it_1_0', fb({ autoreEmail: 'collega@isarome.it' })));
  await assertFails(scrivi(anna(), 'v1_anna@isarome.it_1_0', fb({ autoreEmail: ANNA })));
  await assertFails(scrivi(anonimo(), 'v1_anna@isarome.it_1_0', fb()));
});

test('feedback: forma, tetti e id (30 per consegna, email con underscore)', async () => {
  await semina();
  const d = docente();
  await assertSucceeds(scrivi(d, 'v1_anna@isarome.it_1_29', fb()));
  await assertFails(scrivi(d, 'v1_anna@isarome.it_1_30', fb()));
  await assertFails(scrivi(d, 'v1_anna@isarome.it_1_01', fb()));
  await assertFails(scrivi(d, 'v1_anna@isarome.it_1_5', fb({ versione: 2 })));              // id e versione devono coincidere
  await assertFails(scrivi(d, 'v1_bruno@isarome.it_1_0', fb()));                            // id di un altro studente
  await assertFails(scrivi(d, 'v1_anna@isarome.it_1_4', fb({ testo: 'x'.repeat(501) })));
  await assertFails(scrivi(d, 'v1_anna@isarome.it_1_4', fb({ testo: '' })));
  await assertFails(scrivi(d, 'v1_anna@isarome.it_1_4', fb({ bloccoTesto: 'x'.repeat(201) })));
  await assertFails(scrivi(d, 'v1_anna@isarome.it_1_4', fb({ autoreEmail: 'altro@isarome.it' })));
  await assertFails(scrivi(d, 'v1_anna@isarome.it_1_4', fb({ creato: fisso })));
  await assertFails(scrivi(d, 'v1_anna@isarome.it_1_4', fb({ corsoId: 'CH7Z9Q' })));
  await assertFails(scrivi(d, 'v1_anna@isarome.it_1_4', { ...fb(), extra: 1 }));
  await assertSucceeds(scrivi(d, 'v1_mario_rossi@isarome.it_1_0', fb({ studenteEmail: MARIO })));
});

test('feedback: il testo lo modifica solo l\'autore, anche dopo la pubblicazione; chiunque del corso cancella', async () => {
  await semina();
  await esiste('v1_anna@isarome.it_1_0', { pubblicato: true, pubblicatoIl: fisso });
  await assertSucceeds(updateDoc(doc(docente(), 'feedback/v1_anna@isarome.it_1_0'), { testo: 'Meglio così', modificato: serverTimestamp() }));
  await assertFails(updateDoc(doc(codocente(), 'feedback/v1_anna@isarome.it_1_0'), { testo: 'Di un altro', modificato: serverTimestamp() }));
  await assertFails(updateDoc(doc(docente(), 'feedback/v1_anna@isarome.it_1_0'), { testo: 'x'.repeat(501), modificato: serverTimestamp() }));
  await assertFails(updateDoc(doc(docente(), 'feedback/v1_anna@isarome.it_1_0'), { bloccoId: 'altro', modificato: serverTimestamp() }));
  await assertFails(updateDoc(doc(anna(), 'feedback/v1_anna@isarome.it_1_0'), { testo: 'Ho cambiato io', modificato: serverTimestamp() }));
  await assertFails(deleteDoc(doc(anna(), 'feedback/v1_anna@isarome.it_1_0')));
  await assertFails(deleteDoc(doc(collega(), 'feedback/v1_anna@isarome.it_1_0')));
  await assertSucceeds(deleteDoc(doc(codocente(), 'feedback/v1_anna@isarome.it_1_0')));
});

test('feedback: «Pubblica» mette pubblicato a true una volta sola, mai il contrario, e non tocca altro', async () => {
  await semina();
  await esiste('v1_anna@isarome.it_1_0');
  await esiste('v1_anna@isarome.it_1_1', { autoreEmail: 'codocente@isarome.it' });
  const d = docente();
  await assertFails(updateDoc(doc(d, 'feedback/v1_anna@isarome.it_1_0'), { pubblicato: true }));                                    // manca pubblicatoIl
  await assertFails(updateDoc(doc(d, 'feedback/v1_anna@isarome.it_1_0'), { pubblicato: true, pubblicatoIl: fisso }));               // non è l'ora del server
  await assertFails(updateDoc(doc(d, 'feedback/v1_anna@isarome.it_1_0'), { pubblicato: true, pubblicatoIl: serverTimestamp(), testo: 'altro' }));
  // in un batch si pubblicano anche le bozze di un altro docente del corso
  const b = writeBatch(d);
  for (const k of [0, 1]) b.update(doc(d, `feedback/v1_anna@isarome.it_1_${k}`), { pubblicato: true, pubblicatoIl: serverTimestamp() });
  await assertSucceeds(b.commit());
  await assertFails(updateDoc(doc(d, 'feedback/v1_anna@isarome.it_1_0'), { pubblicato: false, pubblicatoIl: null }));
  await assertFails(updateDoc(doc(collega(), 'feedback/v1_anna@isarome.it_1_0'), { pubblicato: true, pubblicatoIl: serverTimestamp() }));
  await assertFails(updateDoc(doc(anna(), 'feedback/v1_anna@isarome.it_1_0'), { pubblicato: true, pubblicatoIl: serverTimestamp() }));
});

test('feedback: il docente legge tutto (bozze comprese), un docente di un altro corso niente', async () => {
  await semina();
  await esiste('v1_anna@isarome.it_1_0');
  await assertSucceeds(getDoc(doc(docente(), 'feedback/v1_anna@isarome.it_1_0')));
  await assertSucceeds(getDoc(doc(codocente(), 'feedback/v1_anna@isarome.it_1_0')));
  await assertSucceeds(getDocs(query(collection(docente(), 'feedback'), where('verificaId', '==', 'v1'))));
  await assertFails(getDoc(doc(collega(), 'feedback/v1_anna@isarome.it_1_0')));
  await assertFails(getDoc(doc(anonimo(), 'feedback/v1_anna@isarome.it_1_0')));
});

test('feedback: lo studente legge solo i propri, già pubblicati e a verifica chiusa (tutte le versioni)', async () => {
  await semina('chiusa', [1, 2]);
  await esiste('v1_anna@isarome.it_1_0', { pubblicato: true, pubblicatoIl: fisso });
  await esiste('v1_anna@isarome.it_1_1');                                                                  // bozza
  await esiste('v1_anna@isarome.it_2_0', { versione: 2, pubblicato: true, pubblicatoIl: fisso });
  await esiste('v1_mario_rossi@isarome.it_1_0', { studenteEmail: MARIO, pubblicato: true, pubblicatoIl: fisso });
  const sue = (db) => getDocs(query(collection(db, 'feedback'),
    where('verificaId', '==', 'v1'), where('studenteEmail', '==', ANNA), where('pubblicato', '==', true)));
  const snap = await assertSucceeds(sue(anna()));
  if (snap.size !== 2) throw new Error(`attesi 2 feedback pubblicati (v1 e v2), trovati ${snap.size}`);
  await assertSucceeds(getDoc(doc(anna(), 'feedback/v1_anna@isarome.it_2_0')));
  await assertFails(getDoc(doc(anna(), 'feedback/v1_anna@isarome.it_1_1')));                               // bozza
  await assertFails(getDoc(doc(anna(), 'feedback/v1_mario_rossi@isarome.it_1_0')));                        // di un altro
  await assertFails(getDoc(doc(bruno(), 'feedback/v1_anna@isarome.it_1_0')));
  // la query senza pubblicato == true non è provabile dalle regole
  await assertFails(getDocs(query(collection(anna(), 'feedback'), where('verificaId', '==', 'v1'), where('studenteEmail', '==', ANNA))));
  // verifica riaperta: i feedback tornano invisibili allo studente
  await admin((db) => updateDoc(doc(db, 'verifiche/v1'), { stato: 'aperta' }));
  await assertFails(getDoc(doc(anna(), 'feedback/v1_anna@isarome.it_1_0')));
});
