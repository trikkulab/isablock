// Prova dell'esportazione anonima (src/cloud/esporta-json.js): codici distinti e casuali, nessun dato personale nel JSON,
// CSV delle corrispondenze, tracce una volta sola, parti scelte, avvisi sul nome dentro i testi.
import assert from 'node:assert/strict';
import { generaCodici, costruisciEsportazione } from '../src/cloud/esporta-json.js';
import { nomiFileJson } from '../src/cloud/scheda-stampa.js';

let test = 0;
const prova = (nome, fn) => { fn(); test++; console.log(`OK      ${nome}`); };
const testi = (extra = '') => ({ pseudocode: `INIZIO\n  SCRIVI 1 ≠ 2 ${extra}\nFINE`, c: 'int main(void) {\n}', python: 'print(1)' });
const consegna = (email, nome, tracciaId, extra) => ({ email, nome, versione: 2, tracciaId, programma: `{"p":"${email}"}`, testi: testi(extra) });
const tracce = [{ id: 'x1', titolo: 'Versione A', testoMd: 'Somma **N** numeri' }, { id: 'x2', titolo: 'Versione B', testoMd: 'Fattoriale' }, { id: 'x3', titolo: 'Mai usata', testoMd: '-' }];
const base = () => [consegna('anna@x.it', 'Anna Rossi', 'x2'), consegna('bruno@x.it', 'Bruno Verdi', 'x1'), consegna('carla@x.it', 'Carla Neri', 'x2')];

prova('codici: distinti, di 4 caratteri leggibili, in ordine casuale', () => {
  const c = generaCodici(500);
  assert.equal(new Set(c).size, 500);
  assert.ok(c.every((x) => /^[2-9A-HJKMNP-Z]{4}$/.test(x)), 'niente 0 O 1 I L');
  let n = 0; const rng = () => ((n++ * 7919) % 1000) / 1000;
  assert.deepEqual(generaCodici(3, rng), generaCodici(3, (() => { let k = 0; return () => ((k++ * 7919) % 1000) / 1000; })()), 'con lo stesso generatore, gli stessi codici');
});

prova('JSON: titolo, tracce usate (A, B…) una volta sola, consegne con codice e riferimento alla traccia', () => {
  const { json } = costruisciEsportazione({ titolo: 'INFO-02-26/27-3A', tracce, consegne: base() });
  assert.equal(json.verifica, 'INFO-02-26/27-3A');
  assert.deepEqual(Object.keys(json.tracce), ['A', 'B'], 'solo le tracce usate, nell\'ordine della verifica');
  assert.deepEqual(json.tracce.A, { titolo: 'Versione A', testo: 'Somma **N** numeri' });
  assert.deepEqual(json.tracce.B, { titolo: 'Versione B', testo: 'Fattoriale' });
  assert.equal(json.consegne.length, 3);
  assert.ok(json.consegne.every((c) => /^[A-Z0-9]{4}$/.test(c.codice) && ['A', 'B'].includes(c.traccia) && /^[0-9A-F]{4}-[0-9A-F]{4}$/.test(c.riscontro)));
  assert.deepEqual(json.consegne.map((c) => c.codice), [...json.consegne.map((c) => c.codice)].sort(), 'ordinate per codice, non per studente');
  assert.ok(json.consegne[0].pseudocodice.includes('≠'), 'lo pseudocodice è il testo vero, con ≠');
});

prova('anonimato: nel JSON non compaiono né nomi né email degli studenti', () => {
  const { json } = costruisciEsportazione({ titolo: 'V', tracce, consegne: base() });
  const t = JSON.stringify(json);
  for (const x of ['anna', 'rossi', 'bruno', 'verdi', 'carla', 'neri', '@x.it']) assert.ok(!t.toLowerCase().includes(x), x);
});

prova('CSV: codice, cognome, nome, email, versione, traccia; virgolette e virgole protette', () => {
  const c = base(); c[0].nome = 'Anna "Annie" Rossi, jr';
  const { json, csv } = costruisciEsportazione({ titolo: 'V', tracce, consegne: c });
  const righe = csv.trim().split('\r\n');
  assert.equal(righe[0], 'codice,cognome,nome,email,versione,traccia');
  assert.equal(righe.length, 4);
  const codiceBruno = righe.find((r) => r.includes('bruno@x.it')).split(',')[0];
  assert.ok(json.consegne.some((x) => x.codice === codiceBruno && x.traccia === 'A'));
  assert.ok(righe.find((r) => r.includes('anna@x.it')).includes(',"""Annie"" Rossi, jr",Anna,'), 'cognome con virgola e virgolette: tra virgolette, raddoppiate dentro');
  assert.equal(righe.filter((r) => r.includes('@x.it')).length, 3);
});

prova('parti scelte: le spente non compaiono; consegna illeggibile segnalata', () => {
  const c = base(); c[1].testi = null;
  const { json } = costruisciEsportazione({ titolo: 'V', tracce, consegne: c, parti: { pseudocodice: true, c: false, python: false } });
  assert.ok(json.consegne.every((x) => !('c' in x) && !('python' in x)));
  assert.ok(json.consegne.filter((x) => x.pseudocodice).length === 2);
  assert.equal(json.consegne.filter((x) => x.illeggibile).length, 1);
});

prova('avvisi: un testo che contiene nome o email dello studente (commenti, variabili) si segnala', () => {
  const c = base(); c[0] = consegna('anna@x.it', 'Anna Rossi', 'x2', '// fatto da Rossi');
  const r = costruisciEsportazione({ titolo: 'V', tracce, consegne: c });
  assert.equal(r.avvisi.length, 1);
  const cod = r.json.consegne.find((x) => x.pseudocodice.includes('Rossi')).codice;
  assert.equal(r.avvisi[0].codice, cod); assert.deepEqual(r.avvisi[0].parole, ['rossi']);
  assert.equal(costruisciEsportazione({ titolo: 'V', tracce, consegne: base() }).avvisi.length, 0);
});

prova('avvisi: solo parole intere, e un\'email nel campo nome vale solo la parte prima della chiocciola (niente «com» in «commento»)', () => {
  const c = [{ ...consegna('trikkulab@gmail.com', 'trikkulab@gmail.com', 'x1'), testi: { pseudocode: '// il commento col comando commenta', c: 'x', python: 'y' } }];
  assert.equal(costruisciEsportazione({ titolo: 'V', tracce, consegne: c }).avvisi.length, 0, 'né «com» né «gmail» in un commento');
  const d = [{ ...consegna('trikkulab@gmail.com', 'trikkulab@gmail.com', 'x1'), testi: { pseudocode: '// opera di trikkulab', c: 'x', python: 'y' } }];
  assert.deepEqual(costruisciEsportazione({ titolo: 'V', tracce, consegne: d }).avvisi.map((a) => a.parole), [['trikkulab']], 'la parte prima della chiocciola sì');
  const e = [consegna('anna@x.it', 'Anna Rossi', 'x1', '// rossino')];
  assert.equal(costruisciEsportazione({ titolo: 'V', tracce, consegne: e }).avvisi.length, 0, '«rossino» non è «rossi»');
});

prova('CSV: senza un nome vero (email nel campo nome o niente) il cognome è la parte dell\'email prima della chiocciola', () => {
  const c = [consegna('mai.entrato@x.it', 'mai.entrato@x.it', 'x1'), consegna('senza@x.it', null, 'x1')];
  const { csv } = costruisciEsportazione({ titolo: 'V', tracce, consegne: c });
  const righe = csv.trim().split('\r\n').slice(1).map((r) => r.split(','));
  assert.ok(righe.some((r) => r[1] === 'mai.entrato' && r[2] === '' && r[3] === 'mai.entrato@x.it'));
  assert.ok(righe.some((r) => r[1] === 'senza' && r[2] === '' && r[3] === 'senza@x.it'));
});

prova('senza traccia o con traccia mancante: riferimento nullo; nessuno studente: JSON vuoto valido', () => {
  const c = base(); c[0].tracciaId = null; c[1].tracciaId = 'inesistente';
  const { json } = costruisciEsportazione({ titolo: 'V', tracce, consegne: c });
  assert.equal(json.consegne.filter((x) => x.traccia === null).length, 2);
  const vuoto = costruisciEsportazione({ titolo: 'V', tracce, consegne: [] });
  assert.deepEqual(vuoto.json, { verifica: 'V', tracce: {}, consegne: [] });
  assert.equal(vuoto.csv, 'codice,cognome,nome,email,versione,traccia\r\n');
});

prova('nomi dei file: stesso prefisso, il CSV dice «corrispondenze»', () => {
  assert.deepEqual(nomiFileJson({ classe: '3A INF', titolo: 'INFO-02-26/27-3A' }), { json: '3a-inf_info-02-26-27-3a_consegne.json', csv: '3a-inf_info-02-26-27-3a_corrispondenze.csv' });
});

console.log(`\n${test} prove superate`);
