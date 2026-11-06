// Prova di src/verifica-file.js (file di emergenza della verifica).
import assert from 'node:assert/strict';
import { creaFileEmergenza, leggiFileEmergenza, calcolaImpronta, nomeFileEmergenza, nomeCoerente, eFileEmergenza } from '../src/verifica-file.js';
import { verificaConfig } from '../src/cloud/verifica-config.js';
import { readFileSync } from 'node:fs';

const L = verificaConfig.regole;
let test = 0;
const prova = (nome, fn) => { fn(); test++; console.log(`OK      ${nome}`); };
const PROG = JSON.stringify({ formatVersion: 6, blocks: { languageVersion: 0, blocks: [{ type: 'program', id: 'p' }] } });
const base = { verifica: 'v1', titolo: 'Verifica di novembre', studente: 'Mario.Rossi@isarome.it', studenteNome: 'Mario Rossi', programma: PROG, nBlocchi: 37, nBlocchiSincronizzati: 14, offlineDa: '10:42', creatoIl: new Date(2026, 10, 12, 10, 42) };
const leggi = (testo, atteso = { verifica: 'v1', studente: 'mario.rossi@isarome.it' }) => leggiFileEmergenza(testo, atteso);
const modificato = (cambia) => { const o = JSON.parse(creaFileEmergenza(base).testo); cambia(o); return JSON.stringify(o); };

prova('crea e rilegge: i dati tornano e lo studente è in minuscolo', () => {
  const { testo, nomeFile, oggetto } = creaFileEmergenza(base);
  assert.equal(oggetto.studente, 'mario.rossi@isarome.it');
  const r = leggi(testo);
  assert.equal(r.ok, true, r.messaggio);
  assert.deepEqual([r.file.programma, r.file.nBlocchi, r.file.nBlocchiSincronizzati, r.file.offlineDa, r.file.studenteNome], [PROG, 37, 14, '10:42', 'Mario Rossi']);
  assert.equal(r.file.impronta, oggetto.impronta);
  assert.equal(nomeFile, 'mario.rossi_verifica-di-novembre_emergenza-1042.isablock');
});
prova('il file non si riapre nell\'editor: ha un marcatore e niente di un file di lavoro', () => {
  const o = JSON.parse(creaFileEmergenza(base).testo);
  assert.equal(eFileEmergenza(o), true);
  assert.equal(eFileEmergenza(JSON.parse(PROG)), false);
  assert.equal(o.blocks, undefined);
  assert.match(readFileSync(new URL('../src/persistence.js', import.meta.url), 'utf8'), /isablockEmergenza !== undefined/);   // `Apri` lo rifiuta
});
prova('file ritoccato a mano: programma, studente o verifica cambiati → l\'impronta non torna', () => {
  const nuovo = JSON.stringify({ formatVersion: 6, blocks: { blocks: [] } });
  assert.equal(leggi(modificato((o) => { o.programma = nuovo; })).errore, 'impronta');
  assert.equal(leggi(modificato((o) => { o.studente = 'bruno@isarome.it'; }), { verifica: 'v1', studente: 'bruno@isarome.it' }).errore, 'impronta');
  assert.equal(leggi(modificato((o) => { o.verifica = 'v2'; }), { verifica: 'v2', studente: 'mario.rossi@isarome.it' }).errore, 'impronta');
  assert.equal(leggi(modificato((o) => { o.impronta = 'abc'; })).errore, 'impronta');
});
prova('file di un\'altra verifica o di un altro studente (anche se genuino)', () => {
  const { testo } = creaFileEmergenza(base);
  assert.equal(leggi(testo, { verifica: 'v2', studente: 'mario.rossi@isarome.it' }).errore, 'verifica');
  const r = leggi(testo, { verifica: 'v1', studente: 'bruno@isarome.it' });
  assert.equal(r.errore, 'studente');
  assert.match(r.messaggio, /Mario Rossi/);
  assert.equal(leggi(testo, { verifica: 'v1', studente: 'MARIO.ROSSI@isarome.it' }).ok, true);   // le maiuscole non contano
});
prova('formati sbagliati: non JSON, un normale file di lavoro, versione nuova, campi rotti', () => {
  assert.equal(leggi('non json').errore, 'formato');
  assert.equal(leggi(PROG).errore, 'formato');
  assert.equal(leggi('null').errore, 'formato');
  assert.equal(leggi(modificato((o) => { o.isablockEmergenza = 2; })).errore, 'versione');
  for (const campo of ['verifica', 'studente', 'studenteNome', 'programma', 'impronta', 'nBlocchi', 'creatoIl']) {
    assert.equal(leggi(modificato((o) => { delete o[campo]; })).errore, 'dati', `senza ${campo}`);
  }
  assert.equal(leggi(modificato((o) => { o.nBlocchi = -1; })).errore, 'dati');
  assert.equal(leggi(modificato((o) => { o.nBlocchi = L.maxBlocchi + 1; })).errore, 'dati');
  assert.equal(leggi(modificato((o) => { o.nBlocchi = 1.5; })).errore, 'dati');
  assert.equal(leggi(modificato((o) => { o.nBlocchiSincronizzati = 'x'; })).errore, 'dati');
  assert.equal(leggi(modificato((o) => { o.offlineDa = 'x'.repeat(41); })).errore, 'dati');
  assert.equal(leggi(modificato((o) => { o.studenteNome = ''; })).errore, 'dati');
  assert.equal(leggi(modificato((o) => { o.creatoIl = 'ieri'; })).errore, 'dati');
  assert.equal(leggi(modificato((o) => { o.programma = 'x'.repeat(L.maxProgramma + 1); })).errore, 'dati');
  assert.equal(leggi(modificato((o) => { o.programma = 'non json'; o.impronta = calcolaImpronta({ verifica: 'v1', studente: o.studente, programma: 'non json' }); })).errore, 'dati');
});
prova('offlineDa e nBlocchiSincronizzati possono mancare (null)', () => {
  const { testo } = creaFileEmergenza({ ...base, offlineDa: null, nBlocchiSincronizzati: null });
  const r = leggi(testo);
  assert.equal(r.ok, true);
  assert.deepEqual([r.file.offlineDa, r.file.nBlocchiSincronizzati], [null, null]);
});
prova('impronta: dipende da tutti e tre gli ingressi, ed è lunga quanto serve alle regole (≤ 64)', () => {
  const a = calcolaImpronta({ verifica: 'v1', studente: 'a@x.it', programma: 'P' });
  assert.notEqual(a, calcolaImpronta({ verifica: 'v2', studente: 'a@x.it', programma: 'P' }));
  assert.notEqual(a, calcolaImpronta({ verifica: 'v1', studente: 'b@x.it', programma: 'P' }));
  assert.notEqual(a, calcolaImpronta({ verifica: 'v1', studente: 'a@x.it', programma: 'Q' }));
  assert.equal(a, calcolaImpronta({ verifica: 'v1', studente: 'A@X.it', programma: 'P' }));
  assert.ok(a.length > 0 && a.length <= 64);
});
prova('nome del file: automatico, breve, senza accenti; avviso se non ricorda lo studente', () => {
  assert.equal(nomeFileEmergenza({ studente: 'à.è@x.it', titolo: 'Verifica: città & più!', creatoIl: new Date(2026, 0, 1, 9, 5) }), 'a.e_verifica-citta-piu_emergenza-0905.isablock');
  assert.ok(nomeFileEmergenza({ studente: 'x@x.it', titolo: 'T'.repeat(200), creatoIl: new Date() }).length < 90);
  assert.equal(nomeFileEmergenza({ studente: 'x@x.it', titolo: '', creatoIl: new Date(2026, 0, 1, 9, 5) }), 'x_verifica_emergenza-0905.isablock');
  assert.equal(nomeCoerente('mario.rossi_verifica_emergenza-1042.isablock', 'mario.rossi@isarome.it'), true);
  assert.equal(nomeCoerente('bruno.verdi_verifica.isablock', 'mario.rossi@isarome.it'), false);
  assert.equal(nomeCoerente('lavoro.isablock', 'mario.rossi@isarome.it'), false);
});
console.log(`\n${test} prove superate`);
