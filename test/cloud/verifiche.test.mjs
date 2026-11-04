// Prova src/cloud/verifiche.js contro le regole vere (emulatore Firestore).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { creaVerifiche, ErroreVerifica } from '../../src/cloud/verifiche.js';
import { verificaConfig } from '../../src/cloud/verifica-config.js';

sdk.setLogLevel('silent');
const L = verificaConfig.regole;
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8186').split(':');
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-isablock-verifiche-dati',
    firestore: { host, port: Number(port), rules: readFileSync(process.env.REGOLE_FILE || 'firestore.rules', 'utf8') },
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const e of ['docente@isarome.it', 'collega@isarome.it']) await sdk.setDoc(sdk.doc(db, `docenti/${e}`), { attivo: true });
    await sdk.setDoc(sdk.doc(db, 'corsi/AB12CD'), { materia: 'Informatica', classe: '3AINF', annoScolastico: '2026/27', docenti: ['docente@isarome.it'], iscrizioniAperte: true, attivo: true });
    await sdk.setDoc(sdk.doc(db, 'iscrizioni/AB12CD_anna@isarome.it'), { corsoId: 'AB12CD', email: 'anna@isarome.it' });
  });
});

const dbDi = (email) => env.authenticatedContext('u-' + email, { email, email_verified: true }).firestore();
const per = (email = 'docente@isarome.it') => creaVerifiche({ sdk, db: dbDi(email) }, email);
const TR = { titolo: 'Traccia 1', testoMd: '# Esercizio\n\nScrivi un programma.' };
const tra = (ms) => new Date(Date.now() + ms);

test('crea una verifica in bozza e la rilegge', async () => {
  const v = await per().crea('AB12CD', { titolo: '  Verifica di novembre ' });
  assert.equal(v.titolo, 'Verifica di novembre');
  assert.equal(v.stato, 'bozza');
  assert.equal(v.corsoId, 'AB12CD');
  assert.equal(v.creataDa, 'docente@isarome.it');
  assert.equal(v.fine, null);
  assert.ok(v.creato instanceof Date);
  assert.deepEqual(await per().leggi(v.id), v);
});

test('controlli locali e permessi: titolo vuoto o lungo, corso non mio', async () => {
  await assert.rejects(per().crea('AB12CD', { titolo: '  ' }), (e) => e instanceof ErroreVerifica && e.codice === 'dati');
  await assert.rejects(per().crea('AB12CD', { titolo: 'x'.repeat(L.maxTitoloVerifica + 1) }), (e) => e.codice === 'dati');
  await assert.rejects(per('collega@isarome.it').crea('AB12CD', { titolo: 'ok' }), (e) => e.codice === 'negato');
  await assert.rejects(per().leggi('inesistente'), (e) => e.codice === 'negato');
});

test('tracce: si aggiungono nel primo posto libero, in ordine; rev sale a ogni modifica', async () => {
  const p = per();
  const v = await p.crea('AB12CD', { titolo: 'V' });
  const a = await p.nuovaTraccia(v.id, TR);
  const b = await p.nuovaTraccia(v.id, { ...TR, titolo: 'Traccia 2' });
  assert.deepEqual([a.id, b.id, a.rev], ['t0', 't1', 0]);
  await p.eliminaTraccia(v.id, 't0');
  assert.equal((await p.nuovaTraccia(v.id, { ...TR, titolo: 'Traccia 3' })).id, 't0');     // riusa il buco
  const m = await p.modificaTraccia(v.id, 't1', { titolo: 'Traccia 2', testoMd: 'corretto' });
  assert.deepEqual([m.rev, m.testoMd], [1, 'corretto']);
  assert.equal((await p.modificaTraccia(v.id, 't1', { titolo: 'Traccia 2', testoMd: 'ancora' })).rev, 2);
  assert.deepEqual((await p.tracce(v.id)).map((t) => t.id), ['t0', 't1']);
});

test('tracce: tetto sul numero e controlli locali', async () => {
  const p = per();
  const v = await p.crea('AB12CD', { titolo: 'V' });
  await assert.rejects(p.nuovaTraccia(v.id, { titolo: '', testoMd: 'x' }), (e) => e.codice === 'dati');
  await assert.rejects(p.nuovaTraccia(v.id, { titolo: 'x', testoMd: 'y'.repeat(L.maxTestoTraccia + 1) }), (e) => e.codice === 'dati');
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (let i = 0; i < L.maxTracce; i++) {
      await sdk.setDoc(sdk.doc(ctx.firestore(), `verifiche/${v.id}/tracce/t${i}`), { ...TR, rev: 0, modificato: sdk.Timestamp.now() });
    }
  });
  await assert.rejects(p.nuovaTraccia(v.id, TR), (e) => e.codice === 'pieno');
});

test('ciclo di vita: apri (fine e traccia obbligatorie), chiudi, riapri', async () => {
  const p = per();
  const v = await p.crea('AB12CD', { titolo: 'V' });
  await assert.rejects(p.apri(v.id, { fine: tra(-1000), tracciaDefault: 't0' }), (e) => e.codice === 'fine');
  await assert.rejects(p.apri(v.id, { tracciaDefault: 't0' }), (e) => e.codice === 'fine');
  await assert.rejects(p.apri(v.id, { fine: tra(3_600_000), tracciaDefault: 't0' }), (e) => e.codice === 'negato');   // t0 non esiste
  await p.nuovaTraccia(v.id, TR);
  await p.apri(v.id, { fine: tra(3_600_000), tracciaDefault: 't0' });
  const aperta = await p.leggi(v.id);
  assert.equal(aperta.stato, 'aperta');
  assert.ok(aperta.apertaIl instanceof Date && aperta.fine > new Date());
  await p.modifica(v.id, { titolo: 'V corretta', fine: tra(7_200_000) });
  await p.modificaTraccia(v.id, 't0', { titolo: 'Traccia 1', testoMd: 'refuso corretto' });             // a verifica aperta
  await p.chiudi(v.id);
  assert.equal((await p.leggi(v.id)).stato, 'chiusa');
  await assert.rejects(p.nuovaTraccia(v.id, TR), (e) => e.codice === 'negato');
  await p.riapri(v.id, { fine: tra(600_000) });
  assert.equal((await p.leggi(v.id)).stato, 'aperta');
});

test('studente: vede solo le verifiche aperte del suo corso e la traccia assegnata', async () => {
  const p = per();
  const v = await p.crea('AB12CD', { titolo: 'V' });
  await p.nuovaTraccia(v.id, TR);
  await p.nuovaTraccia(v.id, { ...TR, titolo: 'Traccia 2' });
  const anna = per('anna@isarome.it');
  assert.equal((await anna.elenca('AB12CD', { soloAperte: true })).length, 0);                             // la bozza non si vede
  await p.apri(v.id, { fine: tra(3_600_000), tracciaDefault: 't0' });
  await env.withSecurityRulesDisabled((ctx) => sdk.setDoc(sdk.doc(ctx.firestore(), `verifiche/${v.id}/lavori/anna@isarome.it`), { tracciaId: 't1' }));
  assert.deepEqual((await anna.elenca('AB12CD', { soloAperte: true })).map((x) => x.id), [v.id]);
  assert.equal((await anna.leggiTraccia(v.id, 't1')).titolo, 'Traccia 2');
  await assert.rejects(anna.leggiTraccia(v.id, 't0'), (e) => e.codice === 'negato');
  await assert.rejects(anna.tracce(v.id), (e) => e.codice === 'negato');   // l'elenco delle tracce no
});

test('si butta via solo una bozza, con le sue tracce', async () => {
  const p = per();
  const v = await p.crea('AB12CD', { titolo: 'V' });
  await p.nuovaTraccia(v.id, TR);
  await p.elimina(v.id);
  await assert.rejects(p.leggi(v.id), (e) => e.codice === 'negato');
  const w = await p.crea('AB12CD', { titolo: 'W' });
  await p.nuovaTraccia(w.id, TR);
  await p.apri(w.id, { fine: tra(3_600_000), tracciaDefault: 't0' });
  await assert.rejects(p.elimina(w.id), (e) => e.codice === 'negato');
  assert.equal((await p.tracce(w.id)).length, 1);
});
