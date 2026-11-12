// Tabella live del docente: una riga per studente, aggiornata in tempo reale mentre la verifica è aperta.
// Non conosce Firebase: riceve l'oggetto di verifica-docente.js. Le righe le calcola verifica-tabella.js; qui si disegnano
// soltanto (niente innerHTML: i nomi vengono dagli utenti). Il tempo rimasto scorre con un orologio locale ogni secondo,
// senza leggere nulla dal database: il database si legge solo quando uno studente scrive.
import { el } from './dom.js';
import { verificaConfig } from './verifica-config.js';
import { costruisciRighe, riepilogo, ordinaRighe, testoDurata, stimaConsumi, STATI_RIGA } from './verifica-tabella.js';
import { verificaDocenteEtichette as E } from './etichette.js';
import { puntoDomanda } from './aiuto-ui.js';

const C = verificaConfig.client;

function testoOffline(ms) {
  const m = Math.floor(ms / 60000);
  return m < 1 ? 'offline da meno di 1 min' : `offline da ${m} min`;
}

// `vd`: oggetto di verifica-docente.js. Restituisce { elemento, distruggi }.
export function creaTabellaLive({ vd, vid, toast, guarda = null, caricaFile = null, scaricaPdf = null, scaricaTutti = null, esportaJson = null, sala = null }) {
  let ultimo = null;                // ultimo { verifica, lavori, ultime, ora } ricevuto
  let modo = 'email';
  const seguaci = new Set();        // chi vuole il lavoro di uno studente a ogni aggiornamento: { email, cb }
  const ascoltatori = new Set();    // chi vuole tutta la situazione a ogni aggiornamento (la Sala): cb()
  const sommario = el('p', { class: 'tabella-sommario', 'aria-live': 'polite' });
  const stima = el('p', { class: 'tabella-stima sketch-nota', hidden: '' });
  const corpo = el('tbody');
  const vuota = el('p', { class: 'sketch-nota' }, 'Carico la situazione…');
  const ordine = el('select', { class: 'tabella-ordine', 'aria-label': 'Ordine delle righe' },
    el('option', { value: 'email' }, 'Ordina per nome'), el('option', { value: 'attenzione' }, 'Prima chi richiede attenzione'));
  ordine.addEventListener('change', () => { modo = ordine.value; disegna(); });
  const intestazione = (testo, titolo, aiuto) => el('th', titolo ? { title: titolo } : {}, testo, aiuto ? puntoDomanda(aiuto) : '');
  const tabella = el('table', { class: 'tabella-live' },
    el('thead', {}, el('tr', {},
      intestazione('Studente'), intestazione('Stato'),
      intestazione('Blocchi', `Blocchi adesso e variazione negli ultimi ${C.finestraIncrementoMin} minuti`),
      intestazione('Esecuzioni', 'Numero di esecuzioni e esito dell\'ultima'),
      intestazione('Connessione'), intestazione('Tempo'), intestazione('Programma', null, 'caricaFile'))),
    corpo);
  tabella.hidden = true;
  // «Scarica PDF di tutti»: solo a verifica chiusa (si mostra quando arriva lo stato), un solo PDF con una scheda per ogni consegna.
  const btnPdfTutti = el('button', { type: 'button', class: 'modal-btn secondary', hidden: '', title: 'Un solo PDF (A4) con la scheda di ogni consegna, in ordine alfabetico per cognome', onclick: () => scaricaTutti?.() }, E.scaricaPdfTutti);
  const btnJsonTutti = el('button', { type: 'button', class: 'modal-btn secondary', hidden: '', title: 'Un file JSON con i programmi senza nomi (solo un codice per consegna) e un file con le corrispondenze codice-studente', onclick: () => esportaJson?.() }, E.esportaJsonTutti);
  const btnSala = sala ? el('button', { type: 'button', class: 'modal-btn secondary', title: 'Tutti i programmi insieme, a tutto schermo', onclick: () => sala() }, E.sala) : '';
  const elemento = el('div', { class: 'tabella-corpo' },
    el('div', { class: 'tabella-testata' }, sommario, el('span', { class: 'tabella-azioni' }, btnPdfTutti, btnJsonTutti, btnSala, ordine)), stima, vuota, tabella);

  function cella(riga, ...figli) { return el('td', {}, ...figli); }

  // Promemoria del consumo di questa verifica sulle quote giornaliere (solo una stima: vedi `stimaConsumi` in verifica-config.js).
  const numero = new Intl.NumberFormat('it-IT');
  function disegnaStima(ora) {
    const s = stimaConsumi({ verifica: ultimo.verifica, lavori: ultimo.lavori, ora });
    stima.hidden = !s || (s.minutiStudente <= 0 && s.letture <= 0);
    if (stima.hidden) return;
    const pc = (f) => (f === null ? '' : ` (${f < 0.01 ? '<1' : Math.round(f * 100)}%)`);
    stima.dataset.livello = s.livello;
    stima.textContent = `Consumo stimato di questa verifica: ~${numero.format(s.letture)} letture${pc(s.frazioneLetture)} · ~${numero.format(s.scritture)} scritture${pc(s.frazioneScritture)}${s.frazioneLetture === null ? '' : ' della quota giornaliera'}`;
    stima.title = 'Stima dai dati delle prove di novembre 2026 (±20%), solo di questa verifica: altre classi e prove dello stesso giorno si sommano. I parametri sono in verifica-config.js.';
  }

  function disegna() {
    if (!ultimo) return;
    const ora = ultimo.ora();
    const righe = ordinaRighe(costruisciRighe({ verifica: ultimo.verifica, lavori: ultimo.lavori, ultime: ultimo.ultime, ora }), modo);
    disegnaStima(ora);
    const r = riepilogo(righe);
    sommario.textContent = righe.length === 0 ? '' : [
      `Entrati ${r.entrati} su ${r.totale}`, `consegnati ${r.consegnati}`,
      r.offline ? `${r.offline} offline` : null, r.conSalto ? `${r.conSalto} con un salto di blocchi` : null,
      r.doppie ? `${r.doppie} su due dispositivi` : null,
    ].filter(Boolean).join(' · ');
    btnPdfTutti.hidden = !(scaricaTutti && ultimo.verifica.stato === 'chiusa' && righe.some((x) => x.versioneConsegna !== null));
    btnJsonTutti.hidden = !(esportaJson && ultimo.verifica.stato === 'chiusa' && righe.some((x) => x.versioneConsegna !== null));
    vuota.hidden = righe.length > 0;
    tabella.hidden = righe.length === 0;
    if (righe.length === 0) { vuota.textContent = 'Nessuno studente assegnato a questa verifica.'; return; }
    corpo.textContent = '';
    for (const x of righe) {
      const blocchi = x.nBlocchi === null || x.nBlocchi === undefined ? '–'
        : `${x.nBlocchi}${x.incremento ? ` (${x.incremento > 0 ? '+' : ''}${x.incremento})` : ''}`;
      const esec = x.esecuzioni ? `${x.esecuzioni.n}${x.esecuzioni.esito ? ` · ${x.esecuzioni.esito === 'ok' ? 'ok' : 'errore'}` : ''}` : '–';
      const stato = STATI_RIGA[x.stato] + (x.stato === 'consegnato' && x.versioneConsegna > 1 ? ` (v${x.versioneConsegna})` : '') + (x.stato === 'consegnato' && x.origineConsegna === 'file' ? ' · da file' : '');
      corpo.append(el('tr', { 'data-stato': x.stato },
        el('th', { scope: 'row', title: x.email }, x.nome || x.email),
        cella(x, el('span', { class: 'tabella-stato', 'data-stato': x.stato }, stato),
          x.doppiaSessione ? el('span', { class: 'tabella-doppia', title: 'Questo lavoro è stato scritto da due sessioni insieme (due computer o due schede): controlla', role: 'img', 'aria-label': 'Due sessioni attive' }, ' ⚠ due dispositivi') : ''),
        cella(x, blocchi, x.salto ? el('span', { class: 'tabella-salto', title: `Salto di ${x.salto} blocchi tra due controlli`, role: 'img', 'aria-label': `Salto di ${x.salto} blocchi` }, ' ⚠') : ''),
        cella(x, esec),
        cella(x, x.connessione ? el('span', { class: 'tabella-conn', 'data-conn': x.connessione.stato }, x.connessione.stato === 'offline' ? testoOffline(x.connessione.da) : 'online') : '–'),
        cella(x, x.timer ? el('span', { class: 'tabella-timer', 'data-colore': x.timer.colore }, x.timer.restante > 0 ? testoDurata(x.timer.restante) : 'scaduto') : '–'),
        cella(x,
          guarda ? el('button', { type: 'button', class: 'modal-btn secondary tabella-guarda', title: 'Guarda il programma (sola lettura)', onclick: () => guarda(x.email, x.nome) }, E.guarda) : '',
          scaricaPdf && ultimo.verifica.stato === 'chiusa' && x.versioneConsegna !== null ? el('button', { type: 'button', class: 'modal-btn secondary tabella-guarda', title: 'Scarica la scheda di consegna di questo studente in PDF (A4)', onclick: () => scaricaPdf(x.email) }, E.scaricaPdf) : '',
          caricaFile && ultimo.verifica.stato === 'chiusa' ? el('button', { type: 'button', class: 'modal-btn secondary tabella-guarda', title: 'Carica il file di emergenza di questo studente come nuova consegna', onclick: () => caricaFile(x.email, x.nome) }, E.caricaFile) : '')));
    }
  }

  const annulla = vd.ascoltaSituazione(vid, (s) => { ultimo = s; disegna(); for (const g of seguaci) g.cb(s.lavori.find((l) => l.email === g.email) ?? null, s.ultime[g.email] ?? null, s.verifica); for (const cb of ascoltatori) cb(); },
    () => { if (elemento.isConnected) toast('Non riesco a seguire la verifica in tempo reale: controlla la rete.', 'error'); });
  // Il tempo scorre da solo; si ferma quando la tabella esce dalla pagina.
  const giro = setInterval(() => { if (!elemento.isConnected) distruggi(); else disegna(); }, 1000);
  function distruggi() { clearInterval(giro); annulla(); }
  // Il lavoro di uno studente (con la sua ultima consegna e la verifica), subito (se già arrivato) e a ogni aggiornamento. Restituisce la funzione per smettere.
  function segui(email, cb) {
    const g = { email, cb };
    seguaci.add(g);
    if (ultimo) cb(ultimo.lavori.find((l) => l.email === email) ?? null, ultimo.ultime[email] ?? null, ultimo.verifica);
    return () => seguaci.delete(g);
  }
  // Lo stato attuale di uno studente (lavoro e ultima consegna), per chi apre una finestra a partire da una riga.
  const stato = (email) => (ultimo ? { lavoro: ultimo.lavori.find((l) => l.email === email) ?? null, ultimaConsegna: ultimo.ultime[email] ?? null } : { lavoro: null, ultimaConsegna: null });
  // Tutti gli studenti con la loro ultima consegna (per il PDF), nell'ordine in cui arrivano.
  const tutti = () => (ultimo ? ultimo.lavori.map((l) => ({ email: l.email, lavoro: l, ultimaConsegna: ultimo.ultime[l.email] ?? null })) : []);
  // Le righe di adesso (le stesse della tabella, in ordine per nome) e la verifica: per la Sala, che le ridisegna da sé.
  const righe = () => (ultimo ? ordinaRighe(costruisciRighe({ verifica: ultimo.verifica, lavori: ultimo.lavori, ultime: ultimo.ultime, ora: ultimo.ora() }), 'email') : []);
  const statoVerifica = () => (ultimo ? ultimo.verifica.stato : null);
  // `cb()` ogni volta che arriva qualcosa dal server (nessuna lettura in più). Restituisce la funzione per smettere.
  function ascolta(cb) { ascoltatori.add(cb); return () => ascoltatori.delete(cb); }
  return { elemento, distruggi, segui, stato, tutti, righe, statoVerifica, ascolta };
}
