// Prova di src/verifica-locale.js (l'indizio «verifica in corso» nel localStorage), con un localStorage finto.
import assert from 'node:assert/strict';

let test = 0;
const store = new Map();
globalThis.window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
const { segnaVerificaInCorso, cancellaVerificaInCorso, leggiVerificaInCorso } = await import('../src/verifica-locale.js');
const prova = (nome, fn) => { fn(); test++; console.log(`OK      ${nome}`); };

prova('senza indizio: null', () => assert.equal(leggiVerificaInCorso(), null));
prova('segnata: si legge, con l\'id', () => { segnaVerificaInCorso({ vid: 'v1', scadenzaMs: Date.now() + 60_000 }); assert.equal(leggiVerificaInCorso().vid, 'v1'); });
prova('cancellata: non c\'è più', () => { cancellaVerificaInCorso(); assert.equal(leggiVerificaInCorso(), null); });
prova('vale fino alla scadenza più un margine, poi scade da sola (e si toglie)', () => {
  const ora = Date.now();
  segnaVerificaInCorso({ vid: 'v2', scadenzaMs: ora });
  assert.equal(leggiVerificaInCorso(ora + 60 * 60 * 1000).vid, 'v2');          // un'ora dopo la scadenza: vale ancora
  assert.equal(leggiVerificaInCorso(ora + 3 * 60 * 60 * 1000), null);          // tre ore dopo: scaduto
  assert.equal(store.size, 0);                                                  // e l'indizio vecchio è stato tolto
});
prova('un indizio illeggibile non rompe niente', () => { store.set('isablock.verifica.inCorso', '{rotto'); assert.equal(leggiVerificaInCorso(), null); store.set('isablock.verifica.inCorso', '{"vid":"x"}'); assert.equal(leggiVerificaInCorso(), null); });
prova('senza localStorage funziona lo stesso (navigazione privata)', () => {
  const vecchio = globalThis.window;
  globalThis.window = { get localStorage() { throw new Error('bloccato'); } };
  segnaVerificaInCorso({ vid: 'v3' }); cancellaVerificaInCorso();
  assert.equal(leggiVerificaInCorso(), null);
  globalThis.window = vecchio;
});
console.log(`\n${test}/${test} test passati.`);
