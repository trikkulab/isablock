// Il piccolo «?» accanto ai punti delicati: un clic apre una nota di una-due frasi sotto il pulsante, che galleggia sopra la
// pagina senza spostare niente. Si richiude con un secondo clic, con Esc, con un clic fuori o scorrendo la pagina.
// Non apre finestre (può stare anche sopra l'editor). I testi stanno in testi-guida.js (`aiuti`).
import { el } from './dom.js';
import { aiuti, aiutiAttivi } from './testi-guida.js';

let contatore = 0;
let aperto = null;            // { nota, bottone } della nota aperta (una sola alla volta)

function chiudiAperto() {
  if (!aperto) return;
  aperto.nota.hidden = true;
  aperto.bottone.setAttribute('aria-expanded', 'false');
  aperto = null;
}

// Sotto il pulsante, tenendo la nota dentro lo schermo (a destra e in basso si sposta, in basso passa sopra il pulsante).
function posiziona(nota, bottone) {
  const margine = 8;
  const b = bottone.getBoundingClientRect();
  const larghezza = nota.offsetWidth;
  const altezza = nota.offsetHeight;
  const left = Math.min(Math.max(margine, b.left), window.innerWidth - larghezza - margine);
  let top = b.bottom + 6;
  if (top + altezza > window.innerHeight - margine) top = Math.max(margine, b.top - altezza - 6);
  nota.style.left = `${left}px`;
  nota.style.top = `${top}px`;
  // La freccina sta sotto il centro del «?» (ma dentro gli angoli arrotondati); in alto se la nota è sotto, in basso se è sopra.
  const freccia = Math.min(Math.max(14, b.left + b.width / 2 - left - 5), larghezza - 24);
  nota.style.setProperty('--freccia-x', `${freccia}px`);
  nota.classList.toggle('sopra', top < b.top);
}

let ascoltoGlobale = false;
function ascoltaGlobale() {
  if (ascoltoGlobale) return;
  ascoltoGlobale = true;
  // In fase di cattura: Blockly ferma la propagazione dei clic nell'area di lavoro.
  document.addEventListener('pointerdown', (ev) => { if (aperto && !aperto.nota.parentElement.contains(ev.target)) chiudiAperto(); }, true);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && aperto) { ev.stopPropagation(); chiudiAperto(); } }, true);
  window.addEventListener('resize', chiudiAperto);
  document.addEventListener('scroll', chiudiAperto, true);
}

// `chiave` è una voce di `aiuti`. Restituisce un elemento da inserire accanto al punto delicato.
export function puntoDomanda(chiave) {
  const aiuto = aiuti[chiave];
  if (!aiuto) throw new Error(`Aiuto sconosciuto: ${chiave}`);
  if (!aiutiAttivi.has(chiave)) return '';             // spento: non compare niente
  ascoltaGlobale();
  const id = `aiuto-${chiave}-${contatore++}`;
  const nota = el('span', { class: 'nota-aiuto', id, role: 'note', hidden: '' }, el('strong', { class: 'nota-aiuto-titolo' }, aiuto.titolo), aiuto.testo);
  const b = el('button', { type: 'button', class: 'punto-domanda', 'aria-label': 'Spiegazione', 'aria-expanded': 'false', 'aria-controls': id }, '?');
  b.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (aperto && aperto.nota === nota) { chiudiAperto(); return; }
    chiudiAperto();
    nota.hidden = false;
    posiziona(nota, b);
    b.setAttribute('aria-expanded', 'true');
    aperto = { nota, bottone: b };
  });
  return el('span', { class: 'aiuto' }, b, nota);
}
