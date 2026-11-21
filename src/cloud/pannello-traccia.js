// Il pannello con il testo di una traccia: titolo, Markdown reso, zoom A−/A+ (ricordato dal browser). Lo usano il docente nella
// finestra «Guarda» e nella scheda «Traccia» dell'editor (copia di prova), e lo studente sia quando rivede una consegna sia
// DURANTE la verifica (verifica-studente-ui.js, che ci aggiunge solo l'avviso «traccia aggiornata»).
import { el } from './dom.js';
import { rendiMarkdown } from './markdown.js';

const ZOOM_KEY = 'isablock.traccia.zoom';
const NON_DISPONIBILE = 'La traccia non è disponibile.';

// `traccia`: { titolo, testoMd } o null (non letta). `contesto`: riga facoltativa sopra il titolo («Consegna v2 · …»). `nonDisponibile` e
// `titoloVuoto`: i testi quando la traccia non si legge (di default quelli sotto; lo studente in verifica usa i suoi).
// Restituisce l'elemento da mettere nel riquadro (che deve avere la classe `traccia-pannello`).
export async function creaPannelloTraccia({ traccia, contesto = null, nonDisponibile = NON_DISPONIBILE, titoloVuoto = 'Traccia' }) {
  let html = '';
  if (traccia && traccia.testoMd) { try { html = await rendiMarkdown(traccia.testoMd); } catch { html = ''; } }
  const corpo = el('div', { class: 'traccia-md' });
  if (html) corpo.innerHTML = html;                       // output sicuro di markdown.js: niente script, link o immagini
  else corpo.append(el('p', {}, nonDisponibile));
  let zoom = 100;
  try { zoom = Math.min(200, Math.max(80, Number(window.localStorage.getItem(ZOOM_KEY)) || 100)); } catch { /* storage non disponibile */ }
  const applica = () => {
    corpo.style.fontSize = `${zoom / 100}rem`;
    try { window.localStorage.setItem(ZOOM_KEY, String(zoom)); } catch { /* idem */ }
  };
  applica();
  return el('div', { class: 'traccia-pannello-contenuto' },
    contesto ? el('p', { class: 'sketch-nota' }, contesto) : '',
    el('div', { class: 'traccia-pannello-testa' },
      el('h3', { class: 'traccia-pannello-titolo' }, traccia ? traccia.titolo : titoloVuoto),
      el('span', { class: 'traccia-zoom' },
        el('button', { type: 'button', 'aria-label': 'Testo più piccolo', onclick: () => { zoom = Math.max(80, zoom - 10); applica(); } }, 'A−'), ' ',
        el('button', { type: 'button', 'aria-label': 'Testo più grande', onclick: () => { zoom = Math.min(200, zoom + 10); applica(); } }, 'A+'))),
    corpo);
}
