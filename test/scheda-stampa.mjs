// Prova di src/cloud/scheda-stampa.js (parti pure della scheda di consegna stampabile).
import assert from 'node:assert/strict';
import { codiceRiscontro, dividiNome, nomeVisualizzato, nomeFilePdf, nomeFilePdfTutte, ordinaSchede, dataLunga, preparaCommenti } from '../src/cloud/scheda-stampa.js';

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
prova('commenti per il PDF: solo i pubblicati di quello studente e di quella versione; generali in testa, poi nell\'ordine del programma; numerati', () => {
  const t = (min) => new Date(2026, 10, 21, 10, min);
  const f = (id, extra = {}) => ({ id, studenteEmail: 'anna@x.it', versione: 2, pubblicato: true, bloccoId: null, bloccoTesto: '', testo: `t${id}`, creato: t(id), ...extra });
  const righe = { pseudocode: { b1: [2, 2], b2: [4, 8] }, c: { b1: [5, 5], b2: [7, 11] }, python: { b1: [1, 1] } };
  const lista = [
    f(1, { bloccoId: 'b2', bloccoTesto: 'SE' }), f(2), f(3, { bloccoId: 'b1', bloccoTesto: 'LEGGI a' }),
    f(4, { pubblicato: false }),                                  // bozza: mai
    f(5, { versione: 1 }),                                         // un'altra versione
    f(6, { studenteEmail: 'bruno@x.it' }),                         // un altro studente
    f(7, { bloccoId: 'sparito', bloccoTesto: 'blocco tolto' }),    // senza righe: in fondo, con la sola descrizione
    f(8),
  ];
  const c = preparaCommenti({ feedback: lista, email: 'Anna@X.it', versione: 2, righe });
  assert.deepEqual(c.map((x) => [x.n, x.testo]), [[1, 't2'], [2, 't8'], [3, 't3'], [4, 't1'], [5, 't7']]);
  assert.deepEqual(c.map((x) => x.generale), [true, true, false, false, false]);
  assert.deepEqual(c[2].righe, { pseudocode: [2, 2], c: [5, 5], python: [1, 1] });
  assert.deepEqual(c[3].righe, { pseudocode: [4, 8], c: [7, 11] }, 'solo i codici in cui il blocco ha righe');
  assert.equal(c[4].righe, null);
  assert.equal(c[4].bloccoTesto, 'blocco tolto');
  assert.deepEqual(preparaCommenti({ feedback: [], email: 'a@x.it', versione: 1 }), []);
  assert.deepEqual(preparaCommenti({ feedback: null, email: 'a@x.it', versione: 1 }), []);
  assert.equal(preparaCommenti({ feedback: [f(1, { bloccoId: 'b1' })], email: 'anna@x.it', versione: 2, righe: null })[0].righe, null, 'programma illeggibile: nessuna riga');
});

console.log(`\n${test} prove superate`);
