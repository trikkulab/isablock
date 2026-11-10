// Prova del contatore di letture (src/cloud/contatore-letture.js) con un sdk finto: niente rete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contatoreAttivo, creaContatore, avvolgi, etichettaPercorso } from '../src/cloud/contatore-letture.js';

const memoria = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const doc = (path) => ({ type: 'document', path });
const raccolta = (path) => ({ type: 'collection', path });
const snapDoc = (extra = {}) => ({ exists: () => true, metadata: { fromCache: false, hasPendingWrites: false }, ...extra });
const snapRacc = (n, extra = {}) => ({ docChanges: () => new Array(n).fill(0), size: n, metadata: { fromCache: false, hasPendingWrites: false }, ...extra });

test('attivazione: solo con ?contatore=1, resta acceso nel browser, ?contatore=0 lo spegne', () => {
  const st = memoria();
  assert.equal(contatoreAttivo({ ricerca: '', storage: st }), false);
  assert.equal(contatoreAttivo({ ricerca: '?contatore=1', storage: st }), true);
  assert.equal(contatoreAttivo({ ricerca: '', storage: st }), true);
  assert.equal(contatoreAttivo({ ricerca: '?contatore=0', storage: st }), false);
  assert.equal(contatoreAttivo({ ricerca: '', storage: st }), false);
});

test('etichetta: i nomi delle collezioni restano, gli id no', () => {
  assert.equal(etichettaPercorso(doc('verifiche/ABC/lavori/anna@x.it')), 'verifiche/*/lavori/*');
  assert.equal(etichettaPercorso(raccolta('verifiche/ABC/lavori')), 'verifiche/*/lavori');
  assert.equal(etichettaPercorso({}), '?');
});

test('onSnapshot: conta ascolti aperti, eventi e documenti; non la cache né le scritture locali in attesa', () => {
  const c = creaContatore({ ora: () => new Date(2026, 10, 10, 9, 5).getTime() });
  let cb;
  const sdk = { onSnapshot: (rif, ...r) => { cb = r.find((x) => typeof x === 'function'); return () => {}; }, getDoc: async () => snapDoc(), getDocs: async () => snapRacc(0) };
  const w = avvolgi(sdk, c);
  const visti = [];
  w.onSnapshot(raccolta('verifiche/V/lavori'), (s) => visti.push(s));
  cb(snapRacc(3)); cb(snapRacc(2)); cb(snapRacc(5, { metadata: { fromCache: true } }));
  w.onSnapshot(doc('verifiche/V/lavori/a@x.it'), { includeMetadataChanges: true }, (s) => visti.push(s));
  cb(snapDoc()); cb(snapDoc({ metadata: { fromCache: false, hasPendingWrites: true } }));
  assert.equal(visti.length, 5, 'le callback originali vengono chiamate sempre');
  const t = c.totali();
  assert.equal(t['raccolta:verifiche/*/lavori · ascolti_aperti'], 1);
  assert.equal(t['raccolta:verifiche/*/lavori · documenti'], 5);
  assert.equal(t['raccolta:verifiche/*/lavori · eventi'], 2);
  assert.equal(t['doc:verifiche/*/lavori/* · documenti'], 1);
  assert.equal(c.documenti(), 6);
});

test('getDoc e getDocs: si conta ciò che torna, e il risultato passa invariato', async () => {
  const c = creaContatore({ ora: () => 0 });
  const sdk = { onSnapshot() {}, getDoc: async () => 'D', getDocs: async () => ({ size: 4 }) };
  const w = avvolgi(sdk, c);
  assert.equal(await w.getDoc(doc('corsi/AB')), 'D');
  assert.deepEqual(await w.getDocs(raccolta('verifiche/V/consegne')), { size: 4 });
  assert.equal(c.totali()['doc:corsi/* · get'], 1);
  assert.equal(c.totali()['raccolta:verifiche/*/consegne · get'], 4);
});

test('csv e copia in storage: i conteggi sopravvivono a un ricaricamento', () => {
  const st = memoria();
  const a = creaContatore({ ora: () => new Date(2026, 10, 10, 14, 30).getTime(), storage: st });
  a.conta('doc:x', 'documenti', 2); a.salva();
  const b = creaContatore({ ora: () => new Date(2026, 10, 10, 14, 31).getTime(), storage: st });
  b.conta('doc:x', 'documenti');
  assert.equal(b.documenti(), 3);
  assert.equal(b.csv(), 'minuto,sorgente,tipo,n\n14:30,doc:x,documenti,2\n14:31,doc:x,documenti,1\n');
});
