// Prova di src/cloud/verifica-tabella.js (righe della tabella live del docente), con un orologio finto.
import assert from 'node:assert/strict';
import { contaBlocchi, creaStimaOra, incrementoBlocchi, saltoBlocchi, statoRiga, timerRiga, connessioneRiga, costruisciRighe, riepilogo, ordinaRighe, testoDurata, stimaConsumi } from '../src/cloud/verifica-tabella.js';

let test = 0;
const prova = (nome, fn) => { fn(); test++; console.log(`OK      ${nome}`); };
const MIN = 60000;
const ORA = Date.UTC(2026, 10, 6, 10, 0, 0);
const d = (ms) => new Date(ms);
const verifica = { stato: 'aperta', apertaIl: d(ORA - 30 * MIN) };
const lavoro = (extra = {}) => ({ email: 'a@x.it', studenteNome: 'A', entrato: d(ORA - 29 * MIN), consegnato: false, scadenza: d(ORA + 60 * MIN),
  ultimoSegnale: d(ORA - 10000), nBlocchi: 10, esecuzioni: null, campioni: [], ...extra });

prova('stima dell\'ora: PC in ritardo o in anticipo, vale lo scarto con la latenza minore', () => {
  let t = ORA;
  const s = creaStimaOra({ adesso: () => t });
  // scarto vero 5 min; il segnale arriva con latenza 300, 100, 500 ms
  s.osserva(t + 5 * MIN - 300);
  t += 1000; s.osserva(t + 5 * MIN - 100);
  t += 1000; s.osserva(t + 5 * MIN - 500);    // latenza peggiore: non peggiora la stima
  assert.equal(s.scarto(), 5 * MIN - 100);
  assert.equal(s.ora(), t + 5 * MIN - 100);
  const n = creaStimaOra({ adesso: () => 1000 });
  n.osserva(NaN); n.osserva(undefined);
  assert.equal(n.scarto(), 0);
  const a = creaStimaOra({ adesso: () => ORA });
  a.osserva(ORA - 3 * MIN);              // PC in anticipo di 3 min: la prima osservazione conta anche se negativa
  assert.equal(a.scarto(), -3 * MIN);
});
prova('incremento: rispetto al campione più vecchio nella finestra', () => {
  const campioni = [{ t: ORA - 20 * MIN, n: 2 }, { t: ORA - 4 * MIN, n: 8 }, { t: ORA - 1 * MIN, n: 9 }];
  assert.equal(incrementoBlocchi({ nBlocchi: 12, campioni, ora: ORA }), 4);
  assert.equal(incrementoBlocchi({ nBlocchi: 12, campioni: [{ t: ORA - 20 * MIN, n: 2 }], ora: ORA }), null);
  assert.equal(incrementoBlocchi({ nBlocchi: null, campioni, ora: ORA }), null);
  assert.equal(incrementoBlocchi({ nBlocchi: 7, campioni: [{ t: ORA - MIN, n: 10 }], ora: ORA }), -3);
});
prova('salto: solo gli aumenti improvvisi oltre la soglia', () => {
  assert.equal(saltoBlocchi({ nBlocchi: 12, campioni: [{ t: 1, n: 3 }, { t: 2, n: 8 }] }), 0);
  assert.equal(saltoBlocchi({ nBlocchi: 40, campioni: [{ t: 1, n: 3 }, { t: 2, n: 8 }] }), 32);
  assert.equal(saltoBlocchi({ nBlocchi: 5, campioni: [{ t: 2, n: 40 }, { t: 1, n: 5 }] }), 35);     // campioni in disordine
  assert.equal(saltoBlocchi({ nBlocchi: 5, campioni: [{ t: 1, n: 40 }, { t: 2, n: 5 }] }), 0);       // diminuire non è un salto
  assert.equal(saltoBlocchi({ nBlocchi: 15, campioni: [{ t: 1, n: 0 }] }), 0);                                // sotto la soglia di progetto (30)
  assert.equal(saltoBlocchi({ nBlocchi: 15, campioni: [{ t: 1, n: 0 }], soglia: 15 }), 15);            // esattamente la soglia
  assert.equal(saltoBlocchi({ nBlocchi: 14, campioni: [{ t: 1, n: 0 }], soglia: 15 }), 0);
});
prova('stato della riga', () => {
  assert.equal(statoRiga(lavoro({ entrato: null }), null), 'non-entrato');
  assert.equal(statoRiga(lavoro(), null), 'scrive');
  assert.equal(statoRiga(lavoro({ esecuzioni: { n: 2, esito: 'ok' } }), null), 'ha-eseguito');
  assert.equal(statoRiga(lavoro({ esecuzioni: { n: 2, esito: 'errore' } }), null), 'errore');
  assert.equal(statoRiga(lavoro({ esecuzioni: { n: 0 } }), null), 'scrive');
  assert.equal(statoRiga(lavoro({ consegnato: true }), null), 'consegnato');
  assert.equal(statoRiga(lavoro({ entrato: null }), { versione: 1 }), 'consegnato');      // raccolto, anche se mai entrato nel lavoro
});
prova('timer: verde, giallo sotto il 25%, rosso sotto 5 minuti; niente per consegnati o verifica non aperta', () => {
  const t = (scad, extra = {}) => timerRiga({ lavoro: lavoro({ scadenza: d(scad) }), verifica, ora: ORA, consegnato: false, ...extra });
  // apertura 30 min fa: il totale è scadenza − apertura (con scadenza fra 9 min: 39 min, 25% = 9,75 min)
  assert.deepEqual(t(ORA + 60 * MIN), { restante: 60 * MIN, colore: 'verde' });
  assert.equal(t(ORA + 9 * MIN).colore, 'giallo');
  assert.equal(t(ORA + 11 * MIN).colore, 'verde');
  assert.equal(t(ORA + 5 * MIN).colore, 'rosso');
  assert.equal(t(ORA + 5 * MIN + 1).colore, 'giallo');
  assert.equal(t(ORA - MIN).colore, 'rosso');
  assert.equal(t(ORA + MIN, { consegnato: true }), null);
  assert.equal(t(ORA + MIN, { verifica: { stato: 'chiusa' } }), null);
  assert.equal(timerRiga({ lavoro: lavoro({ scadenza: null }), verifica, ora: ORA, consegnato: false }), null);
});
prova('connessione: online, offline dopo 4 minuti, niente se non ha senso', () => {
  const c = (seg, extra = {}) => connessioneRiga({ lavoro: lavoro({ ultimoSegnale: d(seg) }), verifica, ora: ORA, consegnato: false, ...extra });
  assert.equal(c(ORA - 3 * MIN).stato, 'online');
  assert.equal(c(ORA - 4 * MIN).stato, 'online');
  assert.deepEqual(c(ORA - 4 * MIN - 1), { stato: 'offline', da: 4 * MIN + 1 });
  assert.equal(c(ORA + 2000).da, 0);                      // segnale «nel futuro» per l'errore di stima: mai negativo
  assert.equal(c(ORA, { consegnato: true }), null);
  assert.equal(connessioneRiga({ lavoro: lavoro({ entrato: null }), verifica, ora: ORA, consegnato: false }), null);
});
prova('righe e riepilogo', () => {
  const lavori = [
    lavoro({ email: 'c@x.it', entrato: null, ultimoSegnale: null, nBlocchi: null }),
    lavoro({ email: 'b@x.it', ultimoSegnale: d(ORA - 10 * MIN) }),
    lavoro({ email: 'a@x.it', consegnato: true, esecuzioni: { n: 1, esito: 'ok' } }),
    lavoro({ email: 'd@x.it', nBlocchi: 60, campioni: [{ t: ORA - 3 * MIN, n: 10 }] }),
  ];
  const righe = costruisciRighe({ verifica, lavori, ultime: { 'a@x.it': { versione: 1, origine: 'studente' } }, ora: ORA });
  assert.deepEqual(righe.map((r) => r.stato), ['non-entrato', 'scrive', 'consegnato', 'scrive']);
  assert.equal(righe[2].timer, null);
  assert.equal(righe[2].versioneConsegna, 1);
  assert.equal(righe[3].incremento, 50);
  assert.deepEqual(riepilogo(righe), { totale: 4, entrati: 3, consegnati: 1, offline: 1, conSalto: 1, doppie: 0 });
  assert.deepEqual(ordinaRighe(righe).map((r) => r.email), ['a@x.it', 'b@x.it', 'c@x.it', 'd@x.it']);
  assert.deepEqual(ordinaRighe(righe, 'attenzione').map((r) => r.email), ['b@x.it', 'd@x.it', 'a@x.it', 'c@x.it']);
});
prova('dopo una riapertura le consegne di prima non fanno «consegnato» chi sta lavorando', () => {
  const ultime = { 'a@x.it': { versione: 2, origine: 'studente' } };
  const [aperta] = costruisciRighe({ verifica, lavori: [lavoro()], ultime, ora: ORA });
  assert.equal(aperta.stato, 'scrive');
  assert.equal(aperta.versioneConsegna, null);
  assert.ok(aperta.timer && aperta.connessione);                      // timer e connessione tornano a vedersi
  const [chiusa] = costruisciRighe({ verifica: { ...verifica, stato: 'chiusa' }, lavori: [lavoro()], ultime, ora: ORA });
  assert.equal(chiusa.stato, 'consegnato');                           // da chiusa fa fede la consegna (anche raccolta)
  const [riconsegnata] = costruisciRighe({ verifica, lavori: [lavoro({ consegnato: true })], ultime, ora: ORA });
  assert.equal(riconsegnata.stato, 'consegnato');
  assert.equal(riconsegnata.versioneConsegna, 2);
});
const bl = (type, extra = {}) => ({ type, id: type + Math.random(), ...extra });
prova('contaBlocchi: conta ingressi e blocchi successivi, non il contenitore INIZIO/FINE', () => {
  const programma = { formatVersion: 6, blocks: { languageVersion: 0, blocks: [bl('program', { inputs: { BODY: { block: bl('read', {
    next: { block: bl('if_else', { inputs: { COND: { block: bl('compare', { inputs: { A: { block: bl('var') }, B: { block: bl('num') } } }) },
      THEN: { block: bl('write', { inputs: { V: { block: bl('var') } } }) } }, next: { block: bl('write') } }) } }) } } })] } };
  assert.equal(contaBlocchi(JSON.stringify(programma)), 8);                                  // read, if_else, compare, var, num, write, var, write
  assert.equal(contaBlocchi(JSON.stringify({ blocks: { blocks: [bl('program')] } })), 0);    // vuoto
  assert.equal(contaBlocchi(JSON.stringify({ blocks: { blocks: [bl('program'), bl('write'), bl('write', { next: { block: bl('write') } })] } })), 3);   // anche blocchi sciolti
  const conOmbra = { blocks: { blocks: [bl('write', { inputs: { V: { shadow: bl('num'), block: bl('var') } } })] } };
  assert.equal(contaBlocchi(JSON.stringify(conOmbra)), 3);                                   // `getAllBlocks` conta anche le ombre
});
prova('contaBlocchi: testo non leggibile, vuoto o senza blocchi', () => {
  for (const x of [null, undefined, '', 'non json', '{', 42]) assert.equal(contaBlocchi(x), null);
  assert.equal(contaBlocchi('{}'), 0);
  assert.equal(contaBlocchi('null'), 0);
  assert.equal(contaBlocchi('[1,2]'), 0);
});
prova('contaBlocchi: memorizzato (stesso testo, stesso risultato)', () => {
  const t = JSON.stringify({ blocks: { blocks: [bl('write'), bl('write')] } });
  assert.equal(contaBlocchi(t), 2);
  assert.equal(contaBlocchi(t), 2);
});
prova('a verifica chiusa i blocchi della riga sono quelli della consegna (anche da file), senza variazione', () => {
  const prog = JSON.stringify({ blocks: { blocks: [bl('program'), bl('write'), bl('write'), bl('write')] } });
  const chiusa = { ...verifica, stato: 'chiusa' };
  const l = lavoro({ nBlocchi: 99, campioni: [{ t: ORA - MIN, n: 10 }] });
  const [r] = costruisciRighe({ verifica: chiusa, lavori: [l], ultime: { 'a@x.it': { versione: 2, origine: 'file', programma: prog } }, ora: ORA });
  assert.deepEqual([r.nBlocchi, r.incremento], [3, null]);
  const [senza] = costruisciRighe({ verifica: chiusa, lavori: [l], ultime: {}, ora: ORA });
  assert.equal(senza.nBlocchi, 99);                                                           // senza consegna resta il lavoro
  const [illeggibile] = costruisciRighe({ verifica: chiusa, lavori: [l], ultime: { 'a@x.it': { versione: 1, programma: 'rotto' } }, ora: ORA });
  assert.equal(illeggibile.nBlocchi, 99);
  const [aperta] = costruisciRighe({ verifica, lavori: [lavoro({ nBlocchi: 12 })], ultime: { 'a@x.it': { versione: 1, programma: prog } }, ora: ORA });
  assert.equal(aperta.nBlocchi, 12);                                                          // a verifica aperta conta il lavoro in diretta
});
prova('testo della durata', () => {
  assert.equal(testoDurata(0), '0:00');
  assert.equal(testoDurata(65_000), '1:05');
  assert.equal(testoDurata(3_725_000), '1:02:05');
  assert.equal(testoDurata(-5000), '0:00');
});
const CFG = Object.freeze({ ingresso: 30, perIscritto: 35, perStudenteMinuto: 6, perDocenteStudenteMinuto: 2, scrittureStudenteMinuto: 1.5, scrittureIscritto: 3, docentiAperti: 1, quotaLetture: 10000, quotaScritture: 4000, sogliaGialla: 0.5, sogliaRossa: 0.8 });
prova('stima dei consumi: bozza niente; entrati e minuti di ognuno; consegnato si ferma al suo ultimo segnale', () => {
  assert.equal(stimaConsumi({ verifica: { stato: 'bozza' }, lavori: [lavoro()], ora: ORA, config: CFG }), null);
  const a = lavoro({ email: 'a@x.it', entrato: d(ORA - 10 * MIN) });
  const b = lavoro({ email: 'b@x.it', entrato: d(ORA - 20 * MIN), consegnato: true, ultimoSegnale: d(ORA - 10 * MIN) });   // ha lavorato 10 minuti
  const c = lavoro({ email: 'c@x.it', entrato: null });                                                                      // assente: conta solo come iscritto
  const s = stimaConsumi({ verifica, lavori: [a, b, c], ora: ORA, config: CFG });
  assert.equal(Math.round(s.minutiStudente), 20);
  assert.equal(s.letture, 30 * 2 + 35 * 3 + 20 * (6 + 2));          // 325
  assert.equal(s.scritture, 1.5 * 20 + 3 * 3 + 2);                   // 41
  assert.equal(s.livello, 'ok');
  assert.ok(Math.abs(s.frazioneLetture - 0.0325) < 1e-9);
});
prova('stima dei consumi: il tempo si ferma alla scadenza personale; soglie gialla e rossa; quota null senza percentuale', () => {
  const l = lavoro({ entrato: d(ORA - 100 * MIN), scadenza: d(ORA - 40 * MIN) });                                          // ha avuto 60 minuti
  const s = stimaConsumi({ verifica, lavori: [l], ora: ORA, config: CFG });
  assert.equal(Math.round(s.minutiStudente), 60);
  const molti = Array.from({ length: 60 }, (_, i) => lavoro({ email: `s${i}@x.it`, entrato: d(ORA - 30 * MIN) }));
  assert.equal(stimaConsumi({ verifica, lavori: molti, ora: ORA, config: { ...CFG, quotaLetture: 30000 } }).livello, 'giallo');      // 18.300 letture su 30.000 = 61%
  assert.equal(stimaConsumi({ verifica, lavori: molti, ora: ORA, config: { ...CFG, quotaLetture: 20000 } }).livello, 'rosso');       // 91%
  const senza = stimaConsumi({ verifica, lavori: [l], ora: ORA, config: { ...CFG, quotaLetture: null, quotaScritture: null } });
  assert.equal(senza.frazioneLetture, null);
  assert.equal(senza.livello, 'ok');
});
console.log(`\n${test} prove superate`);
