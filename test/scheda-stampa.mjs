// Prova di src/cloud/scheda-stampa.js (parti pure della scheda di consegna stampabile).
import assert from 'node:assert/strict';
import { codiceRiscontro, dividiNome, nomeVisualizzato, nomeFilePdf, nomeFilePdfTutte, ordinaSchede, dataLunga } from '../src/cloud/scheda-stampa.js';

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
prova('nome dello studente: «Nome Cognome»; senza nome, la parte dell\'email prima della chiocciola', () => {
  assert.deepEqual(dividiNome('Anna Rossi', 'a@x.it'), { nome: 'Anna', cognome: 'Rossi' });
  assert.deepEqual(dividiNome('  Maria   Rosa Bianchi ', 'a@x.it'), { nome: 'Maria', cognome: 'Rosa Bianchi' }, 'limite noto: il resto è il cognome');
  assert.deepEqual(dividiNome('', 'Mario.Rossi@isarome.it'), { nome: '', cognome: 'Mario.Rossi' });
  assert.deepEqual(dividiNome(null, 'mario@x.it'), { nome: '', cognome: 'mario' });
  assert.equal(nomeVisualizzato('Anna  Rossi', 'anna@x.it'), 'Anna Rossi');
  assert.equal(nomeVisualizzato(null, 'anna.rossi@x.it'), 'anna.rossi', 'mai l\'email intera');
  assert.equal(nomeVisualizzato('trikkulab@gmail.com', 'trikkulab@gmail.com'), 'trikkulab', 'un nome che è un\'email: solo la parte prima della chiocciola');
  assert.equal(nomeVisualizzato('Anna Rossi', 'a@x.it'), 'Anna Rossi');
  assert.deepEqual(dividiNome('trikkulab@gmail.com', 'trikkulab@gmail.com'), { nome: '', cognome: 'trikkulab' });
  assert.equal(nomeFilePdf({ nome: 'trikkulab@gmail.com', email: 'trikkulab@gmail.com', classe: '3A INF', titolo: 'Info', versione: 6 }), 'trikkulab_3a-inf_info_v6.pdf', 'nemmeno nel nome del file');
});
prova('nome del file PDF: cognome-nome, classe, verifica, versione; minuscolo, senza accenti', () => {
  assert.equal(nomeFilePdf({ nome: 'Anna Rossi', email: 'a@x.it', classe: '3AINF', titolo: 'Verifica di novembre', versione: 2 }), 'rossi-anna_3ainf_verifica-di-novembre_v2.pdf');
  assert.equal(nomeFilePdf({ nome: 'Maria Rosa Bianchi', email: 'm@x.it', classe: '3A INF', titolo: 'Città & più!', versione: 1 }), 'rosa-bianchi-maria_3a-inf_citta-piu_v1.pdf');
  assert.equal(nomeFilePdf({ nome: 'Òscar Nuñez', email: 'o@x.it', classe: '', titolo: '', versione: 3 }), 'nunez-oscar_verifica_v3.pdf', 'senza classe il pezzo manca');
  assert.equal(nomeFilePdf({ nome: null, email: 'Mario.Rossi@isarome.it', classe: '3AINF', titolo: 'T', versione: 1 }), 'mario.rossi_3ainf_t_v1.pdf');
  assert.ok(nomeFilePdf({ nome: 'x '.repeat(100), email: 'x@a.it', classe: 'C'.repeat(99), titolo: 'T'.repeat(200), versione: 1 }).length < 150);
  assert.equal(nomeFilePdfTutte({ classe: '3AINF', titolo: 'Verifica di novembre' }), '3ainf_verifica-di-novembre_tutte-le-consegne.pdf');
  assert.equal(nomeFilePdfTutte({ classe: '', titolo: '' }), 'verifica_tutte-le-consegne.pdf');
});
prova('ordine delle schede: per cognome, poi nome, senza badare a maiuscole e accenti, poi email', () => {
  const s = [
    { nome: 'Zoe Bianchi', email: 'z@x.it' }, { nome: null, email: 'bruno@x.it' }, { nome: 'Anna Rossi', email: 'a@x.it' },
    { nome: 'Luca Rossi', email: 'l@x.it' }, { nome: 'anna rossi', email: 'a2@x.it' }, { nome: 'Èva Bianchi', email: 'e@x.it' },
  ];
  assert.deepEqual(ordinaSchede(s).map((x) => x.email), ['e@x.it', 'z@x.it', 'bruno@x.it', 'a@x.it', 'a2@x.it', 'l@x.it']);
  assert.deepEqual(s.map((x) => x.email), ['z@x.it', 'bruno@x.it', 'a@x.it', 'l@x.it', 'a2@x.it', 'e@x.it'], 'non modifica l\'originale');
});
prova('data lunga: solo giorno, mese e anno, in italiano', () => {
  assert.equal(dataLunga(new Date(2026, 10, 6, 14, 35)), '6 novembre 2026');
  assert.equal(dataLunga(new Date(2026, 0, 1, 0, 0)), '1 gennaio 2026');
});
console.log(`\n${test} prove superate`);
