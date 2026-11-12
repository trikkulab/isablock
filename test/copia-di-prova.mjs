// Prova di apriCopiaDiProva (src/cloud/copia-di-prova.js) con un finto programma: conferma, blocchi in esecuzione,
// errori di caricamento, e che la copia scolleghi lo sketch aperto, chiuda le finestre e mostri la banda.
import assert from 'node:assert/strict';
import { apriCopiaDiProva } from '../src/cloud/copia-di-prova.js';

let test = 0;
const prova = (nome, fn) => { fn(); test++; console.log(`OK      ${nome}`); };
const finto = (extra = {}) => {
  const log = [];
  const programma = { occupato: () => false, isVuoto: () => true, carica: (j) => log.push(['carica', j]), ...extra };
  const toast = (m, tipo) => log.push(['toast', tipo, m]);
  return { log, programma, toast };
};
const comune = (f, extra = {}) => ({ programma: f.programma, json: '{"p":1}', chi: 'Anna Rossi · Verifica', toast: f.toast, confermaSostituzione: () => true, dopoCaricamento: () => f.log.push(['scollega']), chiudiFinestre: () => f.log.push(['chiudi']), mostraBanda: (c) => f.log.push(['banda', c]), ...extra });

prova('editor vuoto: carica la copia, scollega lo sketch, chiude le finestre, mostra la banda e avvisa', () => {
  const f = finto();
  assert.equal(apriCopiaDiProva(comune(f)), true);
  assert.deepEqual(f.log.map((x) => x[0]), ['carica', 'scollega', 'chiudi', 'banda', 'toast']);
  assert.deepEqual(f.log[0], ['carica', '{"p":1}']);
  assert.equal(f.log[3][1], 'Anna Rossi · Verifica');
});

prova('editor con un programma: chiede conferma, e se rifiuti non cambia niente', () => {
  const f = finto({ isVuoto: () => false });
  let chiesto = 0;
  assert.equal(apriCopiaDiProva(comune(f, { confermaSostituzione: () => { chiesto++; return false; } })), false);
  assert.equal(chiesto, 1);
  assert.deepEqual(f.log, [], 'né carica, né chiude, né banda');
  assert.equal(apriCopiaDiProva(comune(f)), true, 'con il sì si apre');
});

prova('esecuzione in corso o niente da aprire: non apre e lo dice', () => {
  const f1 = finto({ occupato: () => true });
  assert.equal(apriCopiaDiProva(comune(f1)), false);
  assert.deepEqual(f1.log.map((x) => x[0]), ['toast']);
  const f2 = finto();
  assert.equal(apriCopiaDiProva(comune(f2, { json: '' })), false);
  assert.equal(apriCopiaDiProva(comune(f2, { json: null })), false);
  assert.ok(f2.log.every((x) => x[0] === 'toast'));
});

prova('programma illeggibile: errore chiaro, nessuna finestra chiusa né banda', () => {
  const f = finto({ carica: () => { throw new Error('rotto'); } });
  assert.equal(apriCopiaDiProva(comune(f)), false);
  assert.deepEqual(f.log.map((x) => x[0]), ['toast']);
  assert.equal(f.log[0][1], 'error');
});

prova('con copiaDiProva: si apre con apri() (copia automatica ferma), non con carica()', () => {
  const log = [];
  const f = finto({ copiaDiProva: { attiva: () => false, modificata: () => false, apri: (j) => log.push(['apri', j]) } });
  assert.equal(apriCopiaDiProva(comune(f)), true);
  assert.deepEqual(log, [['apri', '{"p":1}']]);
  assert.ok(!f.log.some((x) => x[0] === 'carica'), 'niente carica() normale');
});

prova('da uno studente al successivo: nessuna conferma se la copia aperta non è stata modificata', () => {
  let chiesto = 0;
  const f = finto({ isVuoto: () => false, copiaDiProva: { attiva: () => true, modificata: () => false, apri: () => {} } });
  assert.equal(apriCopiaDiProva(comune(f, { confermaSostituzione: () => { chiesto++; return true; } })), true);
  assert.equal(chiesto, 0);
});

prova('se la copia è stata modificata chiede conferma (e dice che è la copia a perdersi); se rifiuti non cambia niente', () => {
  const messaggi = [];
  const f = finto({ isVuoto: () => false, copiaDiProva: { attiva: () => true, modificata: () => true, apri: () => f.log.push(['apri']) } });
  assert.equal(apriCopiaDiProva(comune(f, { confermaSostituzione: (m) => { messaggi.push(m); return false; } })), false);
  assert.match(messaggi[0], /copia di prova che hai modificato/);
  assert.deepEqual(f.log, []);
  assert.equal(apriCopiaDiProva(comune(f)), true);
});

prova('programma vero nell\'editor e nessuna copia aperta: conferma con il messaggio sul programma corrente', () => {
  const messaggi = [];
  const f = finto({ isVuoto: () => false, copiaDiProva: { attiva: () => false, modificata: () => false, apri: () => {} } });
  apriCopiaDiProva(comune(f, { confermaSostituzione: (m) => { messaggi.push(m); return true; } }));
  assert.match(messaggi[0], /Il programma corrente andrà perso/);
});

console.log(`\n${test} prove superate`);
