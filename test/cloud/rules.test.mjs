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
  await assertFails(setDoc(doc(d, 'sketch/1'), { x: 1 }));
  await assertFails(getDoc(doc(d, 'corsi/1')));
});

test('ambiente test: la email di prova è ammessa, un\'altra fuori dominio no', async () => {
  const p = utente('p', 'prova@example.com');
  await assertSucceeds(setDoc(doc(p, 'utenti/p'), { email: 'prova@example.com', nome: 'P', cognome: '' }));
  await assertFails(setDoc(doc(utente('q', 'altra@example.com'), 'utenti/q'), { email: 'altra@example.com', nome: 'Q', cognome: '' }));
});
