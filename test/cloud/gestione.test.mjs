// Prova src/cloud/gestione-corsi.js contro le regole vere (emulatore Firestore).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { creaGestione, ErroreGestione, analizzaElencoEmail, annoCorrente } from '../../src/cloud/gestione-corsi.js';
import { creaCorsi } from '../../src/cloud/corsi.js';

sdk.setLogLevel('silent');
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8186').split(':');
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-isablock-gestione',
    firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const e of ['docente@isarome.it', 'codocente@isarome.it', 'collega@isarome.it']) {
      await sdk.setDoc(sdk.doc(db, `docenti/${e}`), { attivo: true });
    }
  });
});

const dbDi = (email) => env.authenticatedContext('u-' + email, { email, email_verified: true }).firestore();
const gestione = (email = 'docente@isarome.it') => creaGestione({ sdk, db: dbDi(email) }, email);
const DATI = { materia: 'Informatica', classe: '3AINF', annoScolastico: '2026/27' };

test('anno scolastico corrente: da settembre in poi è quello che inizia', () => {
  assert.equal(annoCorrente(new Date(2026, 9, 10)), '2026/27');
  assert.equal(annoCorrente(new Date(2026, 8, 1)), '2026/27');
  assert.equal(annoCorrente(new Date(2027, 5, 15)), '2026/27');
  assert.equal(annoCorrente(new Date(2099, 11, 31)), '2099/00');
});

test('elenco email incollato: righe, virgole, "Nome <email>", maiuscole e doppioni', () => {
  const r = analizzaElencoEmail('Mario Rossi <Mario.Rossi@isarome.it>, anna@isarome.it;\nANNA@isarome.it\n  senza chiocciola\n"Bruno" <bruno@isarome.it>.\n');
  assert.deepEqual(r.valide, ['mario.rossi@isarome.it', 'anna@isarome.it', 'bruno@isarome.it']);
  assert.equal(r.doppie, 1);
  assert.deepEqual(analizzaElencoEmail('').valide, []);
  assert.deepEqual(analizzaElencoEmail(null).valide, []);
  assert.deepEqual(analizzaElencoEmail('a/b@isarome.it x@y').valide, []); // barra e dominio senza punto: scartate
});

test('crea: codice generato dal browser, titolare = chi crea, iscrizioni aperte, attivo', async () => {
  const g = gestione();
  const c = await g.crea({ ...DATI, nome: '  Lab  ' });
  assert.match(c.id, /^[0-9A-HJKMNP-TV-Z]{6}$/);
  assert.deepEqual(c.docenti, ['docente@isarome.it']);
  assert.equal(c.iscrizioniAperte, true);
  assert.equal(c.attivo, true);
  assert.equal(c.nome, 'Lab');
  assert.equal(c.ruolo, 'docente');
  // lo vede nell'elenco dei propri corsi
  const miei = await creaCorsi({ sdk, db: dbDi('docente@isarome.it') }, 'docente@isarome.it', 'docente').elenca();
  assert.deepEqual(miei.map((x) => x.id), [c.id]);
});

test('crea: senza nome mostra materia – classe (anno); dati sbagliati rifiutati prima di scrivere', async () => {
  const g = gestione();
  assert.equal((await g.crea(DATI)).nome, 'Informatica – 3AINF (2026/27)');
  await assert.rejects(g.crea({ ...DATI, materia: ' ' }), (e) => e instanceof ErroreGestione && e.codice === 'dati');
  await assert.rejects(g.crea({ ...DATI, classe: 'x'.repeat(21) }), (e) => e.codice === 'dati');
  await assert.rejects(g.crea({ ...DATI, annoScolastico: '2026-27' }), (e) => e.codice === 'dati');
  await assert.rejects(g.crea({ materia: 'x', classe: 'y' }), (e) => e.codice === 'dati');
});

test('crea: codice già preso → riprova con un altro; sempre preso → errore', async () => {
  await env.withSecurityRulesDisabled((ctx) => sdk.setDoc(sdk.doc(ctx.firestore(), 'corsi/AAAAAA'), { ...DATI, docenti: ['collega@isarome.it'], iscrizioniAperte: true, attivo: true }));
  const sequenza = ['AAAAAA', 'AAAAAA', 'BBBBBB'];
  const c = await gestione().crea(DATI, { genera: () => sequenza.shift() });
  assert.equal(c.id, 'BBBBBB');
  // il corso del collega non è stato toccato
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await sdk.getDoc(sdk.doc(ctx.firestore(), 'corsi/AAAAAA'));
    assert.deepEqual(snap.data().docenti, ['collega@isarome.it']);
  });
  await assert.rejects(gestione().crea(DATI, { genera: () => 'AAAAAA' }), (e) => e instanceof ErroreGestione);
});

test('crea: uno studente (non in docenti) non può', async () => {
  await assert.rejects(gestione('alunno@isarome.it').crea(DATI), (e) => e.codice === 'negato');
});

test('modifica, apri/chiudi iscrizioni, archivia e riattiva', async () => {
  const g = gestione();
  const c = await g.crea(DATI);
  await g.modifica(c.id, { classe: '4AINF', nome: 'Altro' });
  await g.impostaIscrizioniAperte(c.id, false);
  let l = await g.leggi(c.id);
  assert.equal(l.classe, '4AINF'); assert.equal(l.nome, 'Altro'); assert.equal(l.iscrizioniAperte, false);
  await g.modifica(c.id, { nome: '' }); // toglie il nome scritto
  assert.equal((await g.leggi(c.id)).nome, 'Informatica – 4AINF (2026/27)');
  await g.impostaAttivo(c.id, false);
  const corsi = creaCorsi({ sdk, db: dbDi('docente@isarome.it') }, 'docente@isarome.it', 'docente');
  assert.deepEqual(await corsi.elenca(), []);
  assert.deepEqual((await corsi.elenca({ archiviati: true })).map((x) => x.id), [c.id]);
  await g.impostaAttivo(c.id, true);
  assert.equal((await corsi.elenca()).length, 1);
  await assert.rejects(g.modifica(c.id, { annoScolastico: 'boh' }), (e) => e.codice === 'dati');
  // un altro docente non lo modifica
  await assert.rejects(gestione('collega@isarome.it').impostaAttivo(c.id, false), (e) => e.codice === 'negato');
});

test('iscritti: aggiunge per email (anche a corso chiuso), segnala già iscritti e rifiutate; togli', async () => {
  const g = gestione();
  const c = await g.crea(DATI);
  await g.impostaIscrizioniAperte(c.id, false);
  const r1 = await g.aggiungiIscritti(c.id, ['anna@isarome.it', 'bruno@isarome.it', 'esterno@gmail.com', 'collega@isarome.it']);
  assert.deepEqual(r1.aggiunte.sort(), ['anna@isarome.it', 'bruno@isarome.it']);
  assert.deepEqual(r1.rifiutate.sort(), ['collega@isarome.it', 'esterno@gmail.com']); // fuori dominio; un docente non è studente
  const r2 = await g.aggiungiIscritti(c.id, ['anna@isarome.it', 'carla@isarome.it']);
  assert.deepEqual(r2.gia, ['anna@isarome.it']);
  assert.deepEqual(r2.aggiunte, ['carla@isarome.it']);
  assert.deepEqual(await g.iscritti(c.id), ['anna@isarome.it', 'bruno@isarome.it', 'carla@isarome.it']);
  // l'iscritta vede il corso
  assert.deepEqual((await creaCorsi({ sdk, db: dbDi('anna@isarome.it') }, 'anna@isarome.it').elenca()).map((x) => x.id), [c.id]);
  await g.togli(c.id, 'Anna@isarome.it');
  assert.deepEqual(await g.iscritti(c.id), ['bruno@isarome.it', 'carla@isarome.it']);
  assert.deepEqual(await creaCorsi({ sdk, db: dbDi('anna@isarome.it') }, 'anna@isarome.it').elenca(), []);
});

test('iscritti: corso archiviato non accetta aggiunte; uno studente non gestisce', async () => {
  const g = gestione();
  const c = await g.crea(DATI);
  await g.impostaAttivo(c.id, false);
  const r = await g.aggiungiIscritti(c.id, ['anna@isarome.it']);
  assert.deepEqual(r.rifiutate, ['anna@isarome.it']);
  await g.impostaAttivo(c.id, true);
  await g.aggiungiIscritti(c.id, ['anna@isarome.it']);
  await assert.rejects(gestione('anna@isarome.it').togli(c.id, 'anna@isarome.it'), (e) => e.codice === 'negato');
  await assert.rejects(gestione('collega@isarome.it').togli(c.id, 'anna@isarome.it'), (e) => e.codice === 'negato');
  assert.deepEqual(await g.iscritti(c.id), ['anna@isarome.it']);
});

test('codocenti: si aggiunge un docente abilitato, non uno studente; il titolare non si toglie', async () => {
  const g = gestione();
  const c = await g.crea(DATI);
  await assert.rejects(g.aggiungiCodocente(c.id, 'anna@isarome.it'), (e) => e.codice === 'negato'); // non è in docenti
  await assert.rejects(g.aggiungiCodocente(c.id, 'non-una-email'), (e) => e.codice === 'email');
  await g.aggiungiCodocente(c.id, ' Codocente@isarome.it ');
  await assert.rejects(g.aggiungiCodocente(c.id, 'codocente@isarome.it'), (e) => e.codice === 'gia');
  assert.deepEqual((await g.leggi(c.id)).docenti, ['docente@isarome.it', 'codocente@isarome.it']);
  // il codocente gestisce il corso e lo vede tra i suoi
  const g2 = gestione('codocente@isarome.it');
  await g2.impostaIscrizioniAperte(c.id, false);
  await assert.rejects(g2.togliCodocente(c.id, 'docente@isarome.it'), (e) => e.codice === 'titolare');
  await g2.togliCodocente(c.id, 'codocente@isarome.it'); // si toglie da solo
  await assert.rejects(g2.leggi(c.id), (e) => e instanceof ErroreGestione);
  await assert.rejects(g.togliCodocente(c.id, 'docente@isarome.it'), (e) => e.codice === 'titolare');
});
