// Tabella live del docente: una riga per studente, aggiornata in tempo reale mentre la verifica è aperta.
// Non conosce Firebase: riceve l'oggetto di verifica-docente.js. Le righe le calcola verifica-tabella.js; qui si disegnano
// soltanto (niente innerHTML: i nomi vengono dagli utenti). Il tempo rimasto scorre con un orologio locale ogni secondo,
// senza leggere nulla dal database: il database si legge solo quando uno studente scrive.
import { el } from './dom.js';
import { verificaConfig } from './verifica-config.js';
import { costruisciRighe, riepilogo, ordinaRighe, testoDurata, STATI_RIGA } from './verifica-tabella.js';

const C = verificaConfig.client;

function testoOffline(ms) {
  const m = Math.floor(ms / 60000);
  return m < 1 ? 'offline da meno di 1 min' : `offline da ${m} min`;
}

// `vd`: oggetto di verifica-docente.js. Restituisce { elemento, distruggi }.
export function creaTabellaLive({ vd, vid, toast }) {
  let ultimo = null;                // ultimo { verifica, lavori, ultime, ora } ricevuto
  let modo = 'email';
  const sommario = el('p', { class: 'tabella-sommario', 'aria-live': 'polite' });
  const corpo = el('tbody');
  const vuota = el('p', { class: 'sketch-nota' }, 'Carico la situazione…');
  const ordine = el('select', { class: 'tabella-ordine', 'aria-label': 'Ordine delle righe' },
    el('option', { value: 'email' }, 'Ordina per nome'), el('option', { value: 'attenzione' }, 'Prima chi richiede attenzione'));
  ordine.addEventListener('change', () => { modo = ordine.value; disegna(); });
  const intestazione = (testo, titolo) => el('th', titolo ? { title: titolo } : {}, testo);
  const tabella = el('table', { class: 'tabella-live' },
    el('thead', {}, el('tr', {},
      intestazione('Studente'), intestazione('Stato'),
      intestazione('Blocchi', `Blocchi adesso e variazione negli ultimi ${C.finestraIncrementoMin} minuti`),
      intestazione('Esecuzioni', 'Numero di esecuzioni e esito dell\'ultima'),
      intestazione('Connessione'), intestazione('Tempo'))),
    corpo);
  tabella.hidden = true;
  const elemento = el('div', { class: 'tabella-corpo' },
    el('div', { class: 'tabella-testata' }, sommario, ordine), vuota, tabella);

  function cella(riga, ...figli) { return el('td', {}, ...figli); }

  function disegna() {
    if (!ultimo) return;
    const ora = ultimo.ora();
    const righe = ordinaRighe(costruisciRighe({ verifica: ultimo.verifica, lavori: ultimo.lavori, ultime: ultimo.ultime, ora }), modo);
    const r = riepilogo(righe);
    sommario.textContent = righe.length === 0 ? '' : [
      `Entrati ${r.entrati} su ${r.totale}`, `consegnati ${r.consegnati}`,
      r.offline ? `${r.offline} offline` : null, r.conSalto ? `${r.conSalto} con un salto di blocchi` : null,
    ].filter(Boolean).join(' · ');
    vuota.hidden = righe.length > 0;
    tabella.hidden = righe.length === 0;
    if (righe.length === 0) { vuota.textContent = 'Nessuno studente assegnato a questa verifica.'; return; }
    corpo.textContent = '';
    for (const x of righe) {
      const blocchi = x.nBlocchi === null || x.nBlocchi === undefined ? '–'
        : `${x.nBlocchi}${x.incremento ? ` (${x.incremento > 0 ? '+' : ''}${x.incremento})` : ''}`;
      const esec = x.esecuzioni ? `${x.esecuzioni.n}${x.esecuzioni.esito ? ` · ${x.esecuzioni.esito === 'ok' ? 'ok' : 'errore'}` : ''}` : '–';
      const stato = STATI_RIGA[x.stato] + (x.stato === 'consegnato' && x.versioneConsegna > 1 ? ` (v${x.versioneConsegna})` : '');
      corpo.append(el('tr', { 'data-stato': x.stato },
        el('th', { scope: 'row', title: x.email }, x.nome || x.email),
        cella(x, el('span', { class: 'tabella-stato', 'data-stato': x.stato }, stato)),
        cella(x, blocchi, x.salto ? el('span', { class: 'tabella-salto', title: `Salto di ${x.salto} blocchi tra due controlli`, role: 'img', 'aria-label': `Salto di ${x.salto} blocchi` }, ' ⚠') : ''),
        cella(x, esec),
        cella(x, x.connessione ? el('span', { class: 'tabella-conn', 'data-conn': x.connessione.stato }, x.connessione.stato === 'offline' ? testoOffline(x.connessione.da) : 'online') : '–'),
        cella(x, x.timer ? el('span', { class: 'tabella-timer', 'data-colore': x.timer.colore }, x.timer.restante > 0 ? testoDurata(x.timer.restante) : 'scaduto') : '–')));
    }
  }

  const annulla = vd.ascoltaSituazione(vid, (s) => { ultimo = s; disegna(); },
    () => { if (elemento.isConnected) toast('Non riesco a seguire la verifica in tempo reale: controlla la rete.', 'error'); });
  // Il tempo scorre da solo; si ferma quando la tabella esce dalla pagina.
  const giro = setInterval(() => { if (!elemento.isConnected) distruggi(); else disegna(); }, 1000);
  function distruggi() { clearInterval(giro); annulla(); }
  return { elemento, distruggi };
}
