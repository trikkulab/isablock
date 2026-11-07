// Prova di src/cloud/diff-righe.js (differenze riga per riga per il confronto affiancato).
import assert from 'node:assert/strict';
import { differenzeRighe } from '../src/cloud/diff-righe.js';

let test = 0;
const prova = (nome, fn) => { fn(); test++; console.log(`OK      ${nome}`); };
const ind = (s) => [...s].sort((x, y) => x - y);

prova('testi uguali: nessuna differenza', () => {
  const r = differenzeRighe('a\nb\nc', 'a\nb\nc');
  assert.deepEqual([ind(r.soloA), ind(r.soloB)], [[], []]);
});
prova('righe in più da una parte sola (un ciclo che manca sul server)', () => {
  const file = 'INIZIO\n  LEGGI n\n  PER i DA 1 A n\n    somma <- somma + i\n  FINE PER\n  SCRIVI somma\nFINE';
  const server = 'INIZIO\n  LEGGI n\n  SCRIVI somma\nFINE';
  const r = differenzeRighe(file, server);
  assert.deepEqual([ind(r.soloA), ind(r.soloB)], [[2, 3, 4], []]);
});
prova('una riga cambiata compare da entrambe le parti, le altre no', () => {
  const r = differenzeRighe('a\nx = 1\nc', 'a\nx = 2\nc');
  assert.deepEqual([ind(r.soloA), ind(r.soloB)], [[1], [1]]);
});
prova('una stringa scritta a mano diversa è una differenza; un rientro diverso pure (il motore genera sempre gli stessi)', () => {
  assert.deepEqual(ind(differenzeRighe('print("ciao")', 'print("ciaoo")').soloA), [0]);
  assert.deepEqual(ind(differenzeRighe('  a', 'a').soloA), [0]);
});
prova('uno dei due vuoto: tutte le righe dell\'altro sono differenze', () => {
  const r = differenzeRighe('', 'a\nb');
  assert.deepEqual([ind(r.soloA), ind(r.soloB)], [[0], [0, 1]]);   // '' è una riga vuota, diversa da 'a' e 'b'
});
prova('righe ripetute: si abbinano in ordine', () => {
  const r = differenzeRighe('x\ny\nx\ny', 'y\nx\ny');
  assert.deepEqual([ind(r.soloA), ind(r.soloB)], [[0], []]);
});
console.log(`\n${test} prove riuscite`);
