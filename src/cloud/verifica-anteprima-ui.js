// Finestra «Guarda» del docente: il programma di UNO studente, in sola lettura, che si aggiorna da solo.
// A sinistra i blocchi, a destra pseudocodice/C/Python generati dagli stessi generatori dell'editor. Non legge nulla
// dal database: i dati arrivano dalla tabella live (`segui`), che ha già il programma di ogni studente.
// I blocchi e i codici li disegna main.js (`programma.anteprima`); qui c'è solo la finestra.
import { el } from './dom.js';

const CODICI = [['pseudocode', 'Pseudocodice'], ['c', 'C'], ['python', 'Python']];
const ora = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// `apri(titolo, onChiudi, opzioni)`: la finestra del modulo chiamante. `segui(email, cb)` chiama cb(lavoro) subito (se noto)
// e a ogni aggiornamento, e restituisce la funzione per smettere. Restituisce la finestra, o null se mancano i mezzi.
export function apriAnteprima({ apri, programma, segui, email, nome }) {
  if (!programma || !programma.anteprima) return null;
  const blocchi = el('div', { class: 'anteprima-blocchi' });
  const pre = Object.fromEntries(CODICI.map(([k]) => [k, el('pre', { class: 'code-body anteprima-codice' })]));
  const bottoni = new Map();
  const scegli = (k) => {
    for (const [c] of CODICI) { pre[c].hidden = c !== k; bottoni.get(c).classList.toggle('attiva', c === k); bottoni.get(c).setAttribute('aria-selected', String(c === k)); }
  };
  const barra = el('div', { class: 'verifica-schede', role: 'tablist' });
  for (const [k, testo] of CODICI) {
    const b = el('button', { type: 'button', role: 'tab', class: 'verifica-scheda', onclick: () => scegli(k) }, testo);
    bottoni.set(k, b); barra.append(b);
  }
  const info = el('p', { class: 'sketch-nota anteprima-info', 'aria-live': 'off' });
  const vuoto = el('p', { class: 'sketch-nota anteprima-vuoto', hidden: '' }, 'Questo studente non ha ancora scritto niente.');
  let anteprima = null;
  let annulla = () => {};
  const f = apri(`Programma di ${nome || email}`, () => { annulla(); anteprima?.distruggi(); }, { larga: true });
  f.corpo.append(
    info,
    vuoto,
    el('div', { class: 'anteprima-corpo' }, blocchi, el('div', { class: 'anteprima-lato' }, barra, ...CODICI.map(([k]) => pre[k]))),
    el('p', { class: 'sketch-nota' }, 'Sola lettura. Il programma si aggiorna da solo quando lo studente salva (di solito entro 25 secondi).'));
  scegli('pseudocode');
  anteprima = programma.anteprima({ blocchi, codici: pre });
  requestAnimationFrame(() => anteprima?.ridimensiona());

  let ultimo = null;   // l'ultimo programma mostrato (testo del JSON)
  annulla = segui(email, (lavoro) => {
    if (!lavoro) return;
    if (!lavoro.programma) {
      if (ultimo !== '') { anteprima.vuota(); ultimo = ''; }
      vuoto.hidden = false; blocchi.hidden = true;
    } else {
      vuoto.hidden = true; blocchi.hidden = false;
      if (lavoro.programma !== ultimo) {
        const ok = anteprima.mostra(lavoro.programma);
        ultimo = ok ? lavoro.programma : null;
        if (!ok) info.textContent = 'Non riesco a leggere questo programma.';
      }
      anteprima.ridimensiona();
    }
    if (vuoto.hidden === false || ultimo !== null) {
      const n = lavoro.nBlocchi === null || lavoro.nBlocchi === undefined ? '' : ` · ${lavoro.nBlocchi} blocchi`;
      info.textContent = `${nome || email}${n}${lavoro.consegnato ? ' · consegnato' : ''}${lavoro.ultimoSegnale ? ` · ultimo segnale alle ${ora.format(lavoro.ultimoSegnale)}` : ''}`;
    }
  });
  return f;
}
