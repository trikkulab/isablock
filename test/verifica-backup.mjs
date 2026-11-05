// Prova di src/verifica-backup.js (copia locale del lavoro in verifica), con un localStorage finto.
import assert from 'node:assert/strict';
import { creaBackupVerifica, scegliPunto, pulisciBackup, elencaBackup, chiaveBackup, nonSincronizzata } from '../src/verifica-backup.js';

let test = 0;
const prova = (nome, fn) => { fn(); test++; console.log(`OK      ${nome}`); };
const nuovoStorage = () => {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i], get length() { return m.size; } };
};
const rec = (extra = {}) => ({ finoA: 1000, programma: 'P', hash: 'h1', hashBase: 'h1', ...extra });

prova('scegliPunto: uguali, locale (database fermo), database (cambiato altrove)', () => {
  assert.equal(scegliPunto({ hashLocale: 'a', hashBase: 'x', hashServer: 'a' }), 'uguali');
  assert.equal(scegliPunto({ hashLocale: 'b', hashBase: 'a', hashServer: 'a' }), 'locale');
  assert.equal(scegliPunto({ hashLocale: 'b', hashBase: 'a', hashServer: 'c' }), 'server');
  assert.equal(scegliPunto({ hashLocale: 'b', hashBase: null, hashServer: null }), 'locale');       // mai sincronizzata, database vuoto
  assert.equal(scegliPunto({ hashLocale: 'b', hashBase: null, hashServer: 'a' }), 'server');
  assert.equal(scegliPunto({ hashLocale: 'b', hashBase: undefined, hashServer: undefined }), 'locale');
});
prova('salva, legge, cancella; la chiave è per studente e verifica', () => {
  const st = nuovoStorage();
  const b = creaBackupVerifica({ uid: 'u1', vid: 'v1', getStorage: () => st });
  assert.equal(b.leggi(), null);
  assert.equal(b.salva(rec()), true);
  assert.equal(b.leggi().programma, 'P');
  assert.ok(st.m.has(chiaveBackup('u1', 'v1')));
  assert.equal(creaBackupVerifica({ uid: 'u2', vid: 'v1', getStorage: () => st }).leggi(), null);    // un altro studente non la vede
  assert.equal(creaBackupVerifica({ uid: 'u1', vid: 'v2', getStorage: () => st }).leggi(), null);    // un'altra verifica nemmeno
  b.cancella();
  assert.equal(b.leggi(), null);
});
prova('una copia che dichiara un altro studente (chiave manomessa) non si legge', () => {
  const st = nuovoStorage();
  st.setItem(chiaveBackup('u1', 'v1'), JSON.stringify({ uid: 'u2', vid: 'v1', programma: 'P' }));
  assert.equal(creaBackupVerifica({ uid: 'u1', vid: 'v1', getStorage: () => st }).leggi(), null);
});
prova('senza localStorage, o pieno, o illeggibile: nessun errore', () => {
  const rotto = { getStorage: () => { throw new Error('bloccato'); } };
  const b = creaBackupVerifica({ uid: 'u', vid: 'v', ...rotto });
  assert.equal(b.salva(rec()), false); assert.equal(b.leggi(), null); b.cancella();
  const st = nuovoStorage(); st.setItem = () => { throw new Error('pieno'); };
  assert.equal(creaBackupVerifica({ uid: 'u', vid: 'v', getStorage: () => st }).salva(rec()), false);
  const st2 = nuovoStorage(); st2.m.set(chiaveBackup('u', 'v'), '{rotto');
  assert.equal(creaBackupVerifica({ uid: 'u', vid: 'v', getStorage: () => st2 }).leggi(), null);
  assert.deepEqual(elencaBackup(rotto), []);
});
prova('nonSincronizzata: hash diverso dalla base', () => {
  assert.equal(nonSincronizzata(rec()), false);
  assert.equal(nonSincronizzata(rec({ hash: 'h2' })), true);
  assert.equal(nonSincronizzata(null), false);
});
prova('pulizia: toglie quelle di verifiche non più attive per questo studente, tiene quelle attive', () => {
  const st = nuovoStorage();
  const mio = (vid, extra) => creaBackupVerifica({ uid: 'u1', vid, getStorage: () => st }).salva(rec(extra));
  mio('attiva'); mio('finita');
  assert.deepEqual(pulisciBackup({ uid: 'u1', attive: ['attiva'], adesso: 0, getStorage: () => st }), []);
  assert.deepEqual([...st.m.keys()], [chiaveBackup('u1', 'attiva')]);
});
prova('pulizia: quelle di un altro studente solo se scadute; illeggibili sempre', () => {
  const st = nuovoStorage();
  creaBackupVerifica({ uid: 'u2', vid: 'v', getStorage: () => st }).salva(rec({ finoA: 5000 }));
  st.m.set('isablock.verifica.backup.x.y', '{rotto');
  pulisciBackup({ uid: 'u1', attive: [], adesso: 4000, getStorage: () => st });
  assert.deepEqual([...st.m.keys()], [chiaveBackup('u2', 'v')]);                                    // non ancora scaduta
  pulisciBackup({ uid: 'u1', attive: [], adesso: 6000, getStorage: () => st });
  assert.equal(st.m.size, 0);
});
prova('pulizia: con modifiche mai arrivate NON si elimina in silenzio (si restituisce), ma non resta oltre una settimana', () => {
  const st = nuovoStorage();
  creaBackupVerifica({ uid: 'u1', vid: 'v', getStorage: () => st }).salva(rec({ hash: 'nuovo', hashBase: 'vecchio', finoA: 1000 }));
  const da = pulisciBackup({ uid: 'u1', attive: [], adesso: 5000, getStorage: () => st });
  assert.equal(da.length, 1); assert.equal(da[0].vid, 'v'); assert.equal(st.m.size, 1);
  assert.deepEqual(pulisciBackup({ uid: 'u1', attive: [], adesso: 1000 + 8 * 24 * 3600 * 1000, getStorage: () => st }), []);
  assert.equal(st.m.size, 0);
});
prova('le chiavi di altre cose (copie automatiche normali) non si toccano', () => {
  const st = nuovoStorage();
  st.m.set('isablock-autosave:abc', '{}'); st.m.set('isablock.verifica.inCorso', '{}');
  pulisciBackup({ uid: 'u1', attive: [], adesso: 0, getStorage: () => st });
  assert.equal(st.m.size, 2);
});
console.log(`\n${test}/${test} test passati.`);
