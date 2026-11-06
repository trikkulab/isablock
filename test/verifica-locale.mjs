// Prova di src/verifica-locale.js (l'indizio «verifica in corso» nel localStorage), con un localStorage finto.
import assert from 'node:assert/strict';

let test = 0;
const store = new Map();
globalThis.window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
const { segnaVerificaInCorso, aggiornaVerificaInCorso, cancellaVerificaInCorso, leggiVerificaInCorso } = await import('../src/verifica-locale.js');
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
prova('per rientrare senza rete: titolo, email (minuscola), scadenza e scarto dell\'orologio', () => {
  const scad = Date.now() + 30 * 60_000;
  segnaVerificaInCorso({ vid: 'v4', scadenzaMs: scad, titolo: 'Verifica di novembre', email: 'Anna@Isarome.it', scartoMs: -4000 });
  const v = leggiVerificaInCorso();
  assert.deepEqual([v.vid, v.titolo, v.email, v.scadenzaMs, v.scartoMs], ['v4', 'Verifica di novembre', 'anna@isarome.it', scad, -4000]);
  aggiornaVerificaInCorso({ scadenzaMs: scad + 600_000, scartoMs: 1500 });                          // il docente ha dato 10 minuti; lo scarto si è calibrato
  const w = leggiVerificaInCorso();
  assert.deepEqual([w.scadenzaMs, w.scartoMs, w.finoA > v.finoA], [scad + 600_000, 1500, true]);
  aggiornaVerificaInCorso({ scartoMs: 0 });                                                          // cambiando solo lo scarto la scadenza resta
  assert.equal(leggiVerificaInCorso().scadenzaMs, scad + 600_000);
  cancellaVerificaInCorso();
  aggiornaVerificaInCorso({ scartoMs: 9 });                                                          // senza indizio non crea nulla
  assert.equal(leggiVerificaInCorso(), null);
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
