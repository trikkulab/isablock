// Banda sotto la barra degli strumenti che ricorda che nell'editor c'è una COPIA DI PROVA di un programma di uno studente
// (vedi copia-di-prova.js). Ha il link per tornare alla verifica e le frecce ◀ ▶ per passare allo studente precedente o
// successivo. Non si può nascondere: sparisce da sola quando il programma viene sostituito (Nuovo, file, esempio).
import { el } from './dom.js';

let banda = null;

export function nascondiBandaCopia() {
  banda?.remove();
  banda = null;
}

// `chi`: «Anna Rossi». `titolo`: titolo della verifica. `posizione`: { n, tot } (o null). `tornaAllaVerifica`, `precedente`,
// `successivo`: funzioni (o null: il pulsante resta, spento).
export function mostraBandaCopia({ chi, titolo, posizione = null, tornaAllaVerifica = null, precedente = null, successivo = null }) {
  nascondiBandaCopia();
  const freccia = (simbolo, nome, fn) => {
    const b = el('button', { type: 'button', class: 'modal-btn secondary banda-copia-freccia', title: nome, 'aria-label': nome }, simbolo);
    b.disabled = !fn;
    if (fn) b.addEventListener('click', fn);
    return b;
  };
  const testo = `${chi}${posizione ? ` (${posizione.n} di ${posizione.tot})` : ''} — copia di una consegna: non modifica l'originale, non si salva sul cloud né da sola.`;
  const torna = el('button', { type: 'button', class: 'modal-btn secondary banda-copia-torna', title: 'Riapre la verifica con l\'elenco degli studenti' }, `← ${titolo}`);
  torna.disabled = !tornaAllaVerifica;
  if (tornaAllaVerifica) torna.addEventListener('click', tornaAllaVerifica);
  banda = el('div', { class: 'banda-verifica banda-copia', role: 'status', 'aria-label': 'Copia di prova' },
    el('span', { class: 'banda-verifica-etichetta' }, 'COPIA DI PROVA'),
    freccia('◀', 'Studente precedente', precedente), freccia('▶', 'Studente successivo', successivo),
    el('span', { class: 'banda-verifica-titolo', title: testo }, testo),
    torna);
  document.querySelector('header.toolbar')?.after(banda);
}
