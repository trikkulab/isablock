// Prova di src/cloud/scheda-stampa.js (parti pure della scheda di consegna stampabile).
import assert from 'node:assert/strict';
import { codiceRiscontro, nomeDocumento, nomeDocumentoTutte, ordinaSchede, ORIGINE_SCHEDA } from '../src/cloud/scheda-stampa.js';

let test = 0;
const prova = (nome, fn) => { fn(); test++; console.log(`OK      ${nome}`); };

prova('codice di riscontro: stabile, a 8 cifre in due gruppi, diverso se cambia il programma', () => {
  const a = codiceRiscontro('{"blocks":1}');
  assert.match(a, /^[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.equal(a, codiceRiscontro('{"blocks":1}'));
  assert.notEqual(a, codiceRiscontro('{"blocks":2}'));
  assert.equal(codiceRiscontro(''), null);
  assert.equal(codiceRiscontro(null), null);
  assert.equal(codiceRiscontro(undefined), null);
});
prova('nome del documento: studente, verifica, versione; senza accenti né spazi', () => {
  assert.equal(nomeDocumento({ email: 'Mario.Rossi@isarome.it', titolo: 'Verifica di novembre', versione: 2 }), 'mario.rossi_verifica-di-novembre_v2');
  assert.equal(nomeDocumento({ email: 'à@x.it', titolo: 'Città & più!', versione: 1 }), 'a_citta-piu_v1');
  assert.equal(nomeDocumento({ email: '', titolo: '', versione: 3 }), 'studente_verifica_v3');
  assert.ok(nomeDocumento({ email: 'x'.repeat(200) + '@a.it', titolo: 'T'.repeat(200), versione: 1 }).length < 100);
  assert.equal(nomeDocumentoTutte({ titolo: 'Verifica di novembre' }), 'verifica-di-novembre_tutte-le-consegne');
});
prova('ordine delle schede: per nome, senza badare alle maiuscole, poi per email', () => {
  const s = [{ nome: 'zoe', email: 'z@x.it' }, { nome: null, email: 'bruno@x.it' }, { nome: 'Anna', email: 'a@x.it' }, { nome: 'anna', email: 'a2@x.it' }];
  assert.deepEqual(ordinaSchede(s).map((x) => x.email), ['a@x.it', 'a2@x.it', 'bruno@x.it', 'z@x.it']);
  assert.deepEqual(s.map((x) => x.email), ['z@x.it', 'bruno@x.it', 'a@x.it', 'a2@x.it'], 'non modifica l\'originale');
});
prova('ogni origine di consegna ha una frase', () => {
  for (const o of ['studente', 'automatica', 'raccolta', 'file']) assert.ok(ORIGINE_SCHEDA[o]);
});
console.log(`\n${test} prove superate`);
