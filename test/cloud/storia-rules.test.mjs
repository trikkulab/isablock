// Regole della storia del lavoro (istantanee del programma, sottocollezione `storia` del lavoro), emulatore Firestore.
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, serverTimestamp, Timestamp, setLogLevel } from 'firebase/firestore';
import { verificaConfig } from '../../src/cloud/verifica-config.js';

setLogLevel('silent');
const L = verificaConfig.regole;
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8186').split(':');
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-isablock-storia',
    firestore: { host, port: Number(port), rules: readFileSync(process.env.REGOLE_FILE || 'firestore.rules', 'utf8') },
  });
});
after(() => env.cleanup());

const fisso = Timestamp.fromMillis(1_700_000_000_000);
const tra = (ms) => Timestamp.fromMillis(Date.now() + ms);
const CORSO = { materia: 'Informatica', classe: '3AINF', annoScolastico: '2026/27', docenti: ['docente@isarome.it'], iscrizioniAperte: true, attivo: true };
const ANNA = 'anna@isarome.it';
const BRUNO = 'bruno@isarome.it';
const utente = (uid, email) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const docente = () => utente('d', 'docente@isarome.it');
const collega = () => utente('x', 'collega@isarome.it');
const anna = () => utente('anna', ANNA);
const bruno = () => utente('bruno', BRUNO);
const admin = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const ist = (db, sid, email = ANNA) => doc(db, `verifiche/v1/lavori/${email}/storia/${sid}`);
const dati = (extra = {}) => ({ programma: '{"formatVersion":6}', nBlocchi: 4, t: serverTimestamp(), tipo: 'periodica', ...extra });

beforeEach(async () => {
  await env.clearFirestore();
  await admin(async (db) => {
    await setDoc(doc(db, 'docenti/docente@isarome.it'), { attivo: true });
    await setDoc(doc(db, 'docenti/collega@isarome.it'), { attivo: true });
    await setDoc(doc(db, 'corsi/AB12CD'), CORSO);
    await setDoc(doc(db, 'corsi/CH7Z9Q'), { ...CORSO, docenti: ['collega@isarome.it'] });
    for (const e of [ANNA, BRUNO]) await setDoc(doc(db, `iscrizioni/AB12CD_${e}`), { corsoId: 'AB12CD', email: e });
  });
});

const semina = (stato = 'aperta', lavoro = {}) => admin(async (db) => {
  await setDoc(doc(db, 'verifiche/v1'), { corsoId: 'AB12CD', titolo: 'V', stato, fine: tra(3_600_000), tracciaDefault: 't0', creataDa: 'docente@isarome.it',
    creato: fisso, apertaIl: fisso, chiusaIl: stato === 'chiusa' ? fisso : null });
  await setDoc(doc(db, 'verifiche/v1/tracce/t0'), { titolo: 't0', testoMd: 'x', rev: 0, modificato: fisso });
  for (const e of [ANNA, BRUNO]) {
    await setDoc(doc(db, `verifiche/v1/lavori/${e}`), { studenteEmail: e, tracciaId: 't0', scadenza: tra(3_600_000), entrato: fisso, consegnato: false,
      studenteNome: 'X', programma: '{}', ultimoSegnale: fisso, ...lavoro });
  }
});

test('storia: lo studente scrive la propria istantanea periodica, anche rimpiazzando lo stesso posto', async () => {
  await semina();
  await assertSucceeds(setDoc(ist(anna(), 'p0'), dati()));
  await assertSucceeds(setDoc(ist(anna(), 'p0'), dati({ nBlocchi: 9 })));          // l'anello: stesso posto, la nuova rimpiazza
  await assertSucceeds(setDoc(ist(anna(), `p${L.maxIstantanee - 1}`), dati()));
});

test('storia: prima e dopo un salto, ciascuno col proprio prefisso', async () => {
  await semina();
  await assertSucceeds(setDoc(ist(anna(), 'a0'), dati({ tipo: 'prima' })));
  await assertSucceeds(setDoc(ist(anna(), 'd0'), dati({ tipo: 'dopo' })));
  await assertFails(setDoc(ist(anna(), 'a0'), dati({ tipo: 'dopo' })));
  await assertFails(setDoc(ist(anna(), 'd0'), dati({ tipo: 'prima' })));
  await assertFails(setDoc(ist(anna(), 'p0'), dati({ tipo: 'prima' })));
  await assertFails(setDoc(ist(anna(), 'a0'), dati({ tipo: 'periodica' })));
});

test('storia: il posto deve essere dentro l\'anello (numero e forma dell\'id)', async () => {
  await semina();
  await assertFails(setDoc(ist(anna(), `p${L.maxIstantanee}`), dati()));
  await assertFails(setDoc(ist(anna(), `a${L.maxIstantaneeSalto}`), dati({ tipo: 'prima' })));
  await assertFails(setDoc(ist(anna(), `d${L.maxIstantaneeSalto}`), dati({ tipo: 'dopo' })));
  for (const sid of ['p', 'p-1', 'p00', 'p01', 'p100', 'x1', 'P1', 'pp1', 'p1a']) await assertFails(setDoc(ist(anna(), sid), dati()));
});

test('storia: forma dei dati (campi esatti, t = ora del server, tetti)', async () => {
  await semina();
  await assertFails(setDoc(ist(anna(), 'p0'), dati({ extra: 1 })));
  await assertFails(setDoc(ist(anna(), 'p0'), dati({ t: Timestamp.fromMillis(Date.now() - 60_000) })));       // ora falsa
  await assertFails(setDoc(ist(anna(), 'p0'), dati({ programma: '' })));
  await assertFails(setDoc(ist(anna(), 'p0'), dati({ programma: 'x'.repeat(L.maxProgramma + 1) })));
  await assertFails(setDoc(ist(anna(), 'p0'), dati({ nBlocchi: -1 })));
  await assertFails(setDoc(ist(anna(), 'p0'), dati({ nBlocchi: L.maxBlocchi + 1 })));
  await assertFails(setDoc(ist(anna(), 'p0'), dati({ nBlocchi: 1.5 })));
  await assertFails(setDoc(ist(anna(), 'p0'), dati({ tipo: 'altro' })));
  const { programma, ...senza } = dati();
  await assertFails(setDoc(ist(anna(), 'p0'), senza));
});

test('storia: solo il proprio lavoro; né altri studenti né il docente scrivono', async () => {
  await semina();
  await assertFails(setDoc(ist(bruno(), 'p0', ANNA), dati()));
  await assertFails(setDoc(ist(docente(), 'p0', ANNA), dati()));
  await assertFails(setDoc(ist(env.unauthenticatedContext().firestore(), 'p0', ANNA), dati()));
  await assertSucceeds(setDoc(ist(bruno(), 'p0', BRUNO), dati()));
});

test('storia: solo a verifica aperta, entrato, non consegnato e entro la scadenza (più la grazia)', async () => {
  await semina('bozza');
  await assertFails(setDoc(ist(anna(), 'p0'), dati()));
  await semina('chiusa');
  await assertFails(setDoc(ist(anna(), 'p0'), dati()));
  await semina('aperta', { consegnato: true });
  await assertFails(setDoc(ist(anna(), 'p0'), dati()));
  await semina('aperta', { entrato: null });
  await assertFails(setDoc(ist(anna(), 'p0'), dati()));
  await semina('aperta', { scadenza: tra(-(L.graziaSecondi + 30) * 1000) });
  await assertFails(setDoc(ist(anna(), 'p0'), dati()));
  await semina('aperta', { scadenza: tra(-5000) });                                  // dentro la grazia
  await assertSucceeds(setDoc(ist(anna(), 'p0'), dati()));
});

test('storia: la legge il docente del corso, non lo studente né un docente di altro corso; nessuno cancella', async () => {
  await semina();
  await assertSucceeds(setDoc(ist(anna(), 'p0'), dati()));
  await assertSucceeds(getDoc(ist(docente(), 'p0')));
  await assertSucceeds(getDocs(collection(docente(), `verifiche/v1/lavori/${ANNA}/storia`)));
  await assertFails(getDoc(ist(anna(), 'p0')));
  await assertFails(getDoc(ist(bruno(), 'p0')));
  await assertFails(getDoc(ist(collega(), 'p0')));
  await assertFails(deleteDoc(ist(anna(), 'p0')));
  await assertFails(deleteDoc(ist(docente(), 'p0')));
});
