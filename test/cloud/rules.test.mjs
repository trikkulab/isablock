// Test delle regole Firestore sull'emulatore. Uso: npm run test:cloud
// (genera le regole per l'ambiente "test" e avvia l'emulatore). Il progetto è
// demo-isablock: nessun progetto reale è coinvolto.
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, deleteDoc, setLogLevel } from 'firebase/firestore';

setLogLevel('silent'); // i rifiuti attesi altrimenti riempiono l'output

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8186').split(':');
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-isablock',
    firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'docenti/docente@isarome.it'), { attivo: true });
    await setDoc(doc(db, 'config/istituto'), { dominio: 'isarome.it', nome: 'ISA' });
  });
});

const utente = (uid, email, verified = true) =>
  env.authenticatedContext(uid, { email, email_verified: verified }).firestore();

test('config/istituto è leggibile senza login ma non scrivibile', async () => {
  const anon = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(anon, 'config/istituto')));
  await assertFails(setDoc(doc(anon, 'config/istituto'), { dominio: 'x.it' }));
  await assertFails(setDoc(doc(utente('d', 'docente@isarome.it'), 'config/istituto'), { dominio: 'x.it' }));
});

test('il docente legge il proprio documento in docenti, case-insensitive sull\'email', async () => {
  await assertSucceeds(getDoc(doc(utente('d', 'docente@isarome.it'), 'docenti/docente@isarome.it')));
  await assertSucceeds(getDoc(doc(utente('d', 'Docente@IsaRome.it'), 'docenti/docente@isarome.it')));
});

test('lo studente non legge docenti altrui né elenca docenti', async () => {
  const s = utente('s', 'alunno@isarome.it');
  await assertFails(getDoc(doc(s, 'docenti/docente@isarome.it')));
  await assertFails(getDocs(collection(s, 'docenti')));
  await assertFails(getDocs(collection(utente('d', 'docente@isarome.it'), 'docenti')));
});

test('lo studente legge il proprio docenti/{email} (assente) senza errore di permessi', async () => {
  const s = utente('s', 'alunno@isarome.it');
  const snap = await assertSucceeds(getDoc(doc(s, 'docenti/alunno@isarome.it')));
  if (snap.exists()) throw new Error('non dovrebbe esistere');
});

test('nessuno scrive in docenti (auto-promozione impossibile)', async () => {
  const s = utente('s', 'alunno@isarome.it');
  await assertFails(setDoc(doc(s, 'docenti/alunno@isarome.it'), { attivo: true }));
  await assertFails(setDoc(doc(utente('d', 'docente@isarome.it'), 'docenti/altro@isarome.it'), { attivo: true }));
  await assertFails(deleteDoc(doc(utente('d', 'docente@isarome.it'), 'docenti/docente@isarome.it')));
});

test('account fuori dominio rifiutato', async () => {
  const f = utente('f', 'qualcuno@gmail.com');
  await assertFails(setDoc(doc(f, 'utenti/f'), { email: 'qualcuno@gmail.com', nome: 'Q', cognome: '' }));
  await assertFails(getDoc(doc(f, 'docenti/qualcuno@gmail.com')));
});

test('dominio simile (suffisso/prefisso) rifiutato', async () => {
  for (const [uid, email] of [['a', 'x@isarome.it.evil.com'], ['b', 'x@evilisarome.it'], ['c', 'x@sub.isarome.it']]) {
    await assertFails(setDoc(doc(utente(uid, email), `utenti/${uid}`), { email, nome: 'X', cognome: '' }));
  }
});

test('email non verificata rifiutata', async () => {
  const u = utente('u', 'alunno@isarome.it', false);
  await assertFails(setDoc(doc(u, 'utenti/u'), { email: 'alunno@isarome.it', nome: 'A', cognome: '' }));
});

test('senza login nulla è accessibile tranne config/istituto', async () => {
  const anon = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, 'utenti/x')));
  await assertFails(setDoc(doc(anon, 'utenti/x'), { email: 'a@isarome.it', nome: 'A', cognome: '' }));
});

test('profilo: si scrive solo il proprio, con la propria email', async () => {
  const s = utente('s', 'alunno@isarome.it');
  await assertSucceeds(setDoc(doc(s, 'utenti/s'), { email: 'alunno@isarome.it', nome: 'Anna', cognome: 'Rossi' }));
  await assertSucceeds(getDoc(doc(s, 'utenti/s')));
  await assertFails(setDoc(doc(s, 'utenti/altro'), { email: 'alunno@isarome.it', nome: 'A', cognome: '' }));
  await assertFails(setDoc(doc(s, 'utenti/s'), { email: 'altro@isarome.it', nome: 'A', cognome: '' }));
  await assertFails(getDoc(doc(utente('t', 'altro@isarome.it'), 'utenti/s')));
});

test('profilo: il client non può scrivere ruolo né altri campi', async () => {
  const s = utente('s', 'alunno@isarome.it');
  await assertFails(setDoc(doc(s, 'utenti/s'), { email: 'alunno@isarome.it', nome: 'A', cognome: '', ruolo: 'docente' }));
  await assertFails(setDoc(doc(s, 'utenti/s'), { email: 'alunno@isarome.it', nome: 'A', cognome: '', ruolo: 'admin' }));
});

test('collezioni non previste sono negate', async () => {
  const d = utente('d', 'docente@isarome.it');
  await assertFails(setDoc(doc(d, 'altro/1'), { x: 1 }));
  await assertFails(getDoc(doc(d, 'corsi/1')));
});

test('ambiente test: la email di prova è ammessa, un\'altra fuori dominio no', async () => {
  const p = utente('p', 'prova@example.com');
  await assertSucceeds(setDoc(doc(p, 'utenti/p'), { email: 'prova@example.com', nome: 'P', cognome: '' }));
  await assertFails(setDoc(doc(utente('q', 'altra@example.com'), 'utenti/q'), { email: 'altra@example.com', nome: 'Q', cognome: '' }));
});

// ── Sketch personali ──────────────────────────────────────────────────────
import { serverTimestamp, updateDoc, query, where, Timestamp } from 'firebase/firestore';

const sketch = (uid, extra = {}) => ({
  proprietarioUid: uid,
  nome: 'pangolino-ridente',
  creato: serverTimestamp(),
  modificato: serverTimestamp(),
  programma: '{"formatVersion":6,"blocks":{}}',
  ...extra,
});
const mio = (uid = 's', email = 'alunno@isarome.it') => utente(uid, email);

test('sketch: creazione valida sul proprio id <uid>_<n>', async () => {
  const db = mio();
  await assertSucceeds(setDoc(doc(db, 'sketch/s_0'), sketch('s')));
  await assertSucceeds(setDoc(doc(db, 'sketch/s_49'), sketch('s')));
});

test('sketch: tetto di 50 (id fuori da 0..49, o non del proprietario)', async () => {
  const db = mio();
  await assertFails(setDoc(doc(db, 'sketch/s_50'), sketch('s')));
  await assertFails(setDoc(doc(db, 'sketch/s_100'), sketch('s')));
  await assertFails(setDoc(doc(db, 'sketch/s_-1'), sketch('s')));
  await assertFails(setDoc(doc(db, 'sketch/s_05'), sketch('s')));
  await assertFails(setDoc(doc(db, 'sketch/qualsiasi'), sketch('s')));
  await assertFails(setDoc(doc(db, 'sketch/altro_0'), sketch('s')));
  await assertFails(setDoc(doc(db, 'sketch/s_0x'), sketch('s')));
});

test('sketch: proprietarioUid deve essere il proprio', async () => {
  await assertFails(setDoc(doc(mio(), 'sketch/s_0'), sketch('altro')));
  await assertFails(setDoc(doc(mio(), 'sketch/altro_0'), sketch('altro')));
});

test('sketch: forma e tetti (campi extra/mancanti, nome, programma)', async () => {
  const db = mio();
  await assertFails(setDoc(doc(db, 'sketch/s_0'), sketch('s', { extra: 1 })));
  const { nome, ...senzaNome } = sketch('s');
  await assertFails(setDoc(doc(db, 'sketch/s_0'), senzaNome));
  await assertFails(setDoc(doc(db, 'sketch/s_0'), sketch('s', { nome: '' })));
  await assertFails(setDoc(doc(db, 'sketch/s_0'), sketch('s', { nome: 'x'.repeat(61) })));
  await assertSucceeds(setDoc(doc(db, 'sketch/s_0'), sketch('s', { nome: 'x'.repeat(60) })));
  await assertFails(setDoc(doc(db, 'sketch/s_1'), sketch('s', { programma: '' })));
  await assertFails(setDoc(doc(db, 'sketch/s_1'), sketch('s', { programma: 'a'.repeat(200001) })));
  await assertFails(setDoc(doc(db, 'sketch/s_1'), sketch('s', { programma: { blocks: [] } })));
  await assertSucceeds(setDoc(doc(db, 'sketch/s_1'), sketch('s', { programma: 'a'.repeat(200000) })));
});

test('sketch: creato e modificato devono essere l\'ora del server', async () => {
  const db = mio();
  const ieri = Timestamp.fromMillis(Date.now() - 86400000);
  await assertFails(setDoc(doc(db, 'sketch/s_0'), sketch('s', { creato: ieri })));
  await assertFails(setDoc(doc(db, 'sketch/s_0'), sketch('s', { modificato: ieri })));
});

test('sketch: solo il proprietario legge, anche un docente non vede quelli altrui', async () => {
  await setDoc(doc(mio(), 'sketch/s_0'), sketch('s'));
  await assertSucceeds(getDoc(doc(mio(), 'sketch/s_0')));
  await assertFails(getDoc(doc(utente('t', 'altro@isarome.it'), 'sketch/s_0')));
  await assertFails(getDoc(doc(utente('d', 'docente@isarome.it'), 'sketch/s_0')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'sketch/s_0')));
});

test('sketch: elenco dei propri sì, di tutti o di un altro no', async () => {
  await setDoc(doc(mio(), 'sketch/s_0'), sketch('s'));
  await setDoc(doc(utente('t', 'altro@isarome.it'), 'sketch/t_0'), sketch('t'));
  const snap = await assertSucceeds(getDocs(query(collection(mio(), 'sketch'), where('proprietarioUid', '==', 's'))));
  if (snap.size !== 1) throw new Error(`attesi 1 sketch, trovati ${snap.size}`);
  await assertFails(getDocs(collection(mio(), 'sketch')));
  await assertFails(getDocs(query(collection(mio(), 'sketch'), where('proprietarioUid', '==', 't'))));
});

test('sketch: modifica solo del proprietario, creato fisso, modificato = ora server', async () => {
  const db = mio();
  await setDoc(doc(db, 'sketch/s_0'), sketch('s'));
  await assertSucceeds(updateDoc(doc(db, 'sketch/s_0'), { nome: 'nuovo nome', modificato: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(db, 'sketch/s_0'), { programma: '{"a":1}', modificato: serverTimestamp() }));
  // senza aggiornare modificato -> rifiutato
  await assertFails(updateDoc(doc(db, 'sketch/s_0'), { nome: 'senza data' }));
  await assertFails(updateDoc(doc(db, 'sketch/s_0'), { modificato: Timestamp.fromMillis(1) }));
  await assertFails(updateDoc(doc(db, 'sketch/s_0'), { creato: serverTimestamp(), modificato: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'sketch/s_0'), { proprietarioUid: 'altro', modificato: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'sketch/s_0'), { extra: 1, modificato: serverTimestamp() }));
  // altri: no
  await assertFails(updateDoc(doc(utente('t', 'altro@isarome.it'), 'sketch/s_0'), { nome: 'rubato', modificato: serverTimestamp() }));
  await assertFails(updateDoc(doc(utente('d', 'docente@isarome.it'), 'sketch/s_0'), { nome: 'rubato', modificato: serverTimestamp() }));
});

test('sketch: una "creazione" su un id occupato non sovrascrive (due schede)', async () => {
  const db = mio();
  await setDoc(doc(db, 'sketch/s_0'), sketch('s', { nome: 'originale' }));
  await assertFails(setDoc(doc(db, 'sketch/s_0'), sketch('s', { nome: 'sovrascritto' })));
  const snap = await getDoc(doc(db, 'sketch/s_0'));
  if (snap.data().nome !== 'originale') throw new Error('sovrascritto');
});

test('sketch: eliminazione solo del proprietario; poi lo slot si riusa', async () => {
  const db = mio();
  await setDoc(doc(db, 'sketch/s_0'), sketch('s'));
  await assertFails(deleteDoc(doc(utente('t', 'altro@isarome.it'), 'sketch/s_0')));
  await assertFails(deleteDoc(doc(utente('d', 'docente@isarome.it'), 'sketch/s_0')));
  await assertSucceeds(deleteDoc(doc(db, 'sketch/s_0')));
  await assertSucceeds(setDoc(doc(db, 'sketch/s_0'), sketch('s')));
});

test('sketch: account non ammesso (dominio, email non verificata) rifiutato', async () => {
  await assertFails(setDoc(doc(utente('f', 'x@gmail.com'), 'sketch/f_0'), sketch('f')));
  await assertFails(setDoc(doc(utente('u', 'alunno@isarome.it', false), 'sketch/u_0'), sketch('u')));
});

test('sketch: anche un docente salva i propri con le stesse regole', async () => {
  const d = utente('d', 'docente@isarome.it');
  await assertSucceeds(setDoc(doc(d, 'sketch/d_0'), sketch('d')));
  await assertSucceeds(getDoc(doc(d, 'sketch/d_0')));
});
