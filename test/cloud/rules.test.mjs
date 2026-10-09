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

// ── Corsi e iscrizioni ────────────────────────────────────────────────────
const CORSO = {
  materia: 'Informatica', classe: '3AINF', annoScolastico: '2026/27',
  docenti: ['docente@isarome.it', 'codocente@isarome.it'], iscrizioniAperte: true, attivo: true,
};
async function creaCorsi(altri = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'corsi/AB12CD'), CORSO);
    await setDoc(doc(db, 'corsi/CH7Z9Q'), { ...CORSO, iscrizioniAperte: false });
    await setDoc(doc(db, 'corsi/ARCH123'), { ...CORSO, attivo: false });
    await setDoc(doc(db, 'corsi/BASSA12'), { ...CORSO, docenti: ['qualcuno@isarome.it'] });
    for (const [id, dati] of Object.entries(altri)) await setDoc(doc(db, id), dati);
  });
}
const iscr = (codice, email, extra = {}) => ({ corsoId: codice, email, creato: serverTimestamp(), ...extra });
const alunno = () => utente('s', 'Alunno@isarome.it'); // maiuscole: il token viene normalizzato

test('corsi: iscrizione col codice giusto, corso aperto', async () => {
  await creaCorsi();
  await assertSucceeds(setDoc(doc(alunno(), 'iscrizioni/AB12CD_alunno@isarome.it'), iscr('AB12CD', 'alunno@isarome.it')));
});

test('corsi: iscrizione rifiutata se il corso non esiste, è chiuso o archiviato', async () => {
  await creaCorsi();
  const e = 'alunno@isarome.it';
  await assertFails(setDoc(doc(alunno(), `iscrizioni/ZZZZZZ_${e}`), iscr('ZZZZZZ', e)));
  await assertFails(setDoc(doc(alunno(), `iscrizioni/CH7Z9Q_${e}`), iscr('CH7Z9Q', e)));
  await assertFails(setDoc(doc(alunno(), `iscrizioni/ARCH123_${e}`), iscr('ARCH123', e)));
});

test('corsi: iscrizione solo per sé, con id e forma corretti', async () => {
  await creaCorsi();
  const e = 'alunno@isarome.it';
  await assertFails(setDoc(doc(alunno(), 'iscrizioni/AB12CD_altro@isarome.it'), iscr('AB12CD', 'altro@isarome.it')));
  await assertFails(setDoc(doc(alunno(), 'iscrizioni/qualsiasi'), iscr('AB12CD', e)));
  await assertFails(setDoc(doc(alunno(), `iscrizioni/AB12CD_${e}`), iscr('AB12CD', e, { ruolo: 'docente' })));
  await assertFails(setDoc(doc(alunno(), `iscrizioni/AB12CD_${e}`), iscr('AB12CD', e, { creato: Timestamp.fromMillis(1) })));
  const { creato, ...senza } = iscr('AB12CD', e);
  await assertFails(setDoc(doc(alunno(), `iscrizioni/AB12CD_${e}`), senza));
  await assertFails(setDoc(doc(alunno(), `iscrizioni/AB12CD_${e}`), iscr('ab12cd', e))); // codice non canonico
});

test('corsi: il formato del codice è quello Crockford (niente I L O U, lunghezza 4-12)', async () => {
  const e = 'alunno@isarome.it';
  await creaCorsi({ 'corsi/ABILOU': CORSO, 'corsi/ABC': CORSO, 'corsi/ABCDEFGHJKMNP': CORSO });
  for (const c of ['ABILOU', 'ABC', 'ABCDEFGHJKMNP']) {
    await assertFails(setDoc(doc(alunno(), `iscrizioni/${c}_${e}`), iscr(c, e)));
  }
});

test('corsi: un docente non si iscrive come studente (né al proprio corso né a quello di un collega)', async () => {
  await creaCorsi({ 'docenti/collega@isarome.it': { attivo: true } });
  const d = utente('d', 'docente@isarome.it');
  await assertFails(setDoc(doc(d, 'iscrizioni/AB12CD_docente@isarome.it'), iscr('AB12CD', 'docente@isarome.it')));   // suo corso
  await assertFails(setDoc(doc(d, 'iscrizioni/BASSA12_docente@isarome.it'), iscr('BASSA12', 'docente@isarome.it'))); // corso di un altro
  const c = utente('c', 'Collega@isarome.it'); // anche un docente senza corsi
  await assertFails(setDoc(doc(c, 'iscrizioni/AB12CD_collega@isarome.it'), iscr('AB12CD', 'collega@isarome.it')));
  // lo studente normale continua a poterlo fare
  await assertSucceeds(setDoc(doc(alunno(), 'iscrizioni/AB12CD_alunno@isarome.it'), iscr('AB12CD', 'alunno@isarome.it')));
});

test('corsi: un account non ammesso non si iscrive', async () => {
  await creaCorsi();
  await assertFails(setDoc(doc(utente('f', 'x@gmail.com'), 'iscrizioni/AB12CD_x@gmail.com'), iscr('AB12CD', 'x@gmail.com')));
  await assertFails(setDoc(doc(utente('u', 'a@isarome.it', false), 'iscrizioni/AB12CD_a@isarome.it'), iscr('AB12CD', 'a@isarome.it')));
});

test('corsi: la iscrizione non si modifica né si cancella dal client', async () => {
  await creaCorsi();
  const e = 'alunno@isarome.it';
  await setDoc(doc(alunno(), `iscrizioni/AB12CD_${e}`), iscr('AB12CD', e));
  await assertFails(updateDoc(doc(alunno(), `iscrizioni/AB12CD_${e}`), { corsoId: 'AB12CD' }));
  await assertFails(deleteDoc(doc(alunno(), `iscrizioni/AB12CD_${e}`)));
  await assertFails(setDoc(doc(alunno(), `iscrizioni/AB12CD_${e}`), iscr('AB12CD', e))); // riscrittura
  await assertFails(deleteDoc(doc(utente('d', 'docente@isarome.it'), `iscrizioni/AB12CD_${e}`)));
});

test('corsi: lettura di un corso solo per iscritti e docenti', async () => {
  await creaCorsi();
  const e = 'alunno@isarome.it';
  await assertFails(getDoc(doc(alunno(), 'corsi/AB12CD'))); // non ancora iscritto
  await setDoc(doc(alunno(), `iscrizioni/AB12CD_${e}`), iscr('AB12CD', e));
  await assertSucceeds(getDoc(doc(alunno(), 'corsi/AB12CD')));
  await assertFails(getDoc(doc(alunno(), 'corsi/BASSA12'))); // altro corso
  await assertFails(getDoc(doc(utente('t', 'terzo@isarome.it'), 'corsi/AB12CD')));
  await assertSucceeds(getDoc(doc(utente('d', 'docente@isarome.it'), 'corsi/AB12CD')));
  await assertSucceeds(getDoc(doc(utente('c', 'Codocente@isarome.it'), 'corsi/AB12CD'))); // codocente
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'corsi/AB12CD')));
});

test('corsi: iscrizione fatta a mano dal docente (console) vale come quella col codice', async () => {
  await creaCorsi();
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'iscrizioni/CH7Z9Q_alunno@isarome.it'),
    { corsoId: 'CH7Z9Q', email: 'alunno@isarome.it' }));
  await assertSucceeds(getDoc(doc(alunno(), 'corsi/CH7Z9Q'))); // anche a iscrizioni chiuse
  // tolta da console: l'accesso sparisce
  await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'iscrizioni/CH7Z9Q_alunno@isarome.it')));
  await assertFails(getDoc(doc(alunno(), 'corsi/CH7Z9Q')));
});

test('corsi: elenco dei propri corsi da docente (array-contains) sì, da studente o senza filtro no', async () => {
  await creaCorsi();
  const d = utente('d', 'docente@isarome.it');
  const snap = await assertSucceeds(getDocs(query(collection(d, 'corsi'), where('docenti', 'array-contains', 'docente@isarome.it'))));
  if (snap.size !== 3) throw new Error(`attesi 3 corsi, trovati ${snap.size}`);
  await assertFails(getDocs(collection(d, 'corsi')));
  await assertFails(getDocs(query(collection(d, 'corsi'), where('docenti', 'array-contains', 'qualcuno@isarome.it'))));
  await assertFails(getDocs(query(collection(alunno(), 'corsi'), where('docenti', 'array-contains', 'docente@isarome.it'))));
});

test('corsi: le iscrizioni si leggono solo le proprie', async () => {
  await creaCorsi();
  const e = 'alunno@isarome.it';
  await setDoc(doc(alunno(), `iscrizioni/AB12CD_${e}`), iscr('AB12CD', e));
  await assertSucceeds(getDoc(doc(alunno(), `iscrizioni/AB12CD_${e}`)));
  const mie = await assertSucceeds(getDocs(query(collection(alunno(), 'iscrizioni'), where('email', '==', e))));
  if (mie.size !== 1) throw new Error('attesa 1 iscrizione');
  await assertFails(getDocs(collection(alunno(), 'iscrizioni')));
  await assertFails(getDocs(query(collection(alunno(), 'iscrizioni'), where('email', '==', 'altro@isarome.it'))));
  await assertFails(getDoc(doc(utente('t', 'terzo@isarome.it'), `iscrizioni/AB12CD_${e}`)));
  await assertFails(getDoc(doc(utente('d', 'docente@isarome.it'), `iscrizioni/AB12CD_${e}`))); // il docente le gestisce da console
});

test('corsi: si può chiedere la propria iscrizione anche se non esiste; quella di altri no', async () => {
  await creaCorsi();
  const e = 'alunno@isarome.it';
  const vuoto = await assertSucceeds(getDoc(doc(alunno(), `iscrizioni/AB12CD_${e}`)));
  if (vuoto.exists()) throw new Error('non dovrebbe esistere');
  await assertFails(getDoc(doc(alunno(), 'iscrizioni/AB12CD_altro@isarome.it')));
  await assertFails(getDoc(doc(alunno(), `iscrizioni/AB12CD_x${e}`)));       // email più lunga con lo stesso finale
  await assertFails(getDoc(doc(alunno(), `iscrizioni/AB12CD${e}`)));          // senza underscore
  await assertFails(getDoc(doc(utente('f', 'x@gmail.com'), 'iscrizioni/AB12CD_x@gmail.com')));
});

test('corsi: nessuno scrive corsi dal client, nemmeno un docente del corso', async () => {
  await creaCorsi();
  const d = utente('d', 'docente@isarome.it');
  await assertFails(setDoc(doc(d, 'corsi/NUOVO12'), CORSO));
  await assertFails(updateDoc(doc(d, 'corsi/AB12CD'), { iscrizioniAperte: false }));
  await assertFails(deleteDoc(doc(d, 'corsi/AB12CD')));
  await assertFails(updateDoc(doc(alunno(), 'corsi/AB12CD'), { docenti: ['alunno@isarome.it'] }));
});
