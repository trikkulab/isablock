// Editor del testo di una traccia: barra dei formati, campo di testo e anteprima accanto, contatore dei
// caratteri. Non sa niente di Firebase né di verifiche: riceve il testo e avvisa quando cambia.
// I formati veri (grassetto, elenchi, tabella...) sono funzioni pure in formato-testo.js; la resa
// dell'anteprima è quella di markdown.js, la stessa che vedrà lo studente.
//
//   const editor = creaEditorMarkdown({ testo, max: 6000, onCambio, onSalva });
//   contenitore.append(editor.elemento);
//   editor.leggi() / editor.imposta(testo) / editor.valido() / editor.focus() / editor.distruggi()
import { el } from './dom.js';
import { rendiMarkdown } from './markdown.js';
import { FORMATI, invio } from './formato-testo.js';

const RITARDO_ANTEPRIMA_MS = 150;

// [formato, etichetta, suggerimento] oppure '|' per un separatore
const BARRA = [
  ['grassetto', 'B', 'Grassetto (Ctrl+B)', 'md-b'],
  ['corsivo', 'I', 'Corsivo (Ctrl+I)', 'md-i'],
  ['barrato', 'S', 'Barrato', 'md-s'],
  ['apice', 'x²', 'Apice, per esempio x^2^'],
  ['pedice', 'x₂', 'Pedice, per esempio H~2~O'],
  '|',
  ['titolo', 'Titolo', 'Titolo (premi ancora per cambiare livello)'],
  ['elencoPuntato', '• Elenco', 'Elenco puntato'],
  ['elencoNumerato', '1. Elenco', 'Elenco numerato'],
  ['citazione', '“ ” Citazione', 'Citazione'],
  '|',
  ['codice', '</>', 'Codice nella riga'],
  ['bloccoCodice', '{ }', 'Blocco di codice'],
  ['tabella', 'Tabella', 'Inserisce una tabella da compilare'],
];

// Sostituisce il testo del campo mantenendo la cronologia di annulla/ripeti (Ctrl+Z), se il browser lo
// consente: seleziona solo la parte che cambia e la riscrive. Poi imposta la selezione richiesta.
function scrivi(area, nuovo, inizio, fine) {
  const vecchio = area.value;
  if (nuovo !== vecchio) {
    const max = Math.min(vecchio.length, nuovo.length);
    let p = 0;
    while (p < max && vecchio[p] === nuovo[p]) p++;
    let q = 0;
    while (q < max - p && vecchio[vecchio.length - 1 - q] === nuovo[nuovo.length - 1 - q]) q++;
    area.focus();
    area.setSelectionRange(p, vecchio.length - q);
    const inserito = nuovo.slice(p, nuovo.length - q);
    let ok = false;
    try { ok = inserito ? document.execCommand('insertText', false, inserito) : document.execCommand('delete'); } catch { ok = false; }
    if (!ok || area.value !== nuovo) {       // senza execCommand: si perde l'annulla, ma il testo è giusto
      area.value = nuovo;
      area.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  area.setSelectionRange(inizio, fine);
}

export function creaEditorMarkdown({ testo = '', max = Infinity, onCambio, onSalva, segnaposto = 'Scrivi qui il testo della traccia…' } = {}) {
  let timer = null;
  let versione = 0;      // scarta le rese arrivate in ritardo

  const area = el('textarea', {
    class: 'editor-md-testo', spellcheck: 'true', 'aria-label': 'Testo della traccia in Markdown', placeholder: segnaposto,
  });
  area.value = testo;
  const anteprima = el('div', { class: 'traccia-md editor-md-anteprima', 'aria-label': 'Anteprima della traccia', 'aria-live': 'polite' });
  const contatore = el('span', { class: 'editor-md-contatore' });

  function aggiornaContatore() {
    const n = area.value.length;
    contatore.textContent = Number.isFinite(max) ? `${n} / ${max} caratteri` : `${n} caratteri`;
    contatore.classList.toggle('troppo', n > max);
  }

  async function aggiornaAnteprima() {
    const mia = ++versione;
    const html = await rendiMarkdown(area.value);
    if (mia !== versione) return;
    // UNICO uso di innerHTML: l'output di rendiMarkdown(), che non produce mai script, link o immagini.
    anteprima.innerHTML = html;
    anteprima.classList.toggle('vuota', html === '');
  }

  function cambiato() {
    aggiornaContatore();
    clearTimeout(timer);
    timer = setTimeout(aggiornaAnteprima, RITARDO_ANTEPRIMA_MS);
    onCambio?.(area.value);
  }
  area.addEventListener('input', cambiato);

  // --- barra ---
  const applica = (nome) => {
    const r = FORMATI[nome](area.value, area.selectionStart, area.selectionEnd);
    scrivi(area, r.testo, r.inizio, r.fine);
  };
  const barra = el('div', { class: 'editor-md-barra', role: 'toolbar', 'aria-label': 'Formattazione' });
  for (const voce of BARRA) {
    if (voce === '|') { barra.append(el('span', { class: 'editor-md-sep', 'aria-hidden': 'true' })); continue; }
    const [nome, etichetta, titolo, classe] = voce;
    barra.append(el('button', {
      type: 'button', class: `editor-md-btn${classe ? ` ${classe}` : ''}`, title: titolo, 'aria-label': titolo,
      // il clic non deve togliere il fuoco (e la selezione) al campo di testo
      onmousedown: (ev) => ev.preventDefault(),
      onclick: () => applica(nome),
    }, etichetta));
  }

  // --- tastiera ---
  area.addEventListener('keydown', (ev) => {
    const comando = ev.metaKey || ev.ctrlKey;
    if (comando && !ev.altKey && !ev.shiftKey) {
      const k = ev.key.toLowerCase();
      if (k === 'b') { ev.preventDefault(); applica('grassetto'); return; }
      if (k === 'i') { ev.preventDefault(); applica('corsivo'); return; }
      if (k === 's' && onSalva) { ev.preventDefault(); onSalva(); return; }
    }
    if (ev.key === 'Enter' && !ev.shiftKey && !comando && !ev.altKey && !ev.isComposing
        && area.selectionStart === area.selectionEnd) {
      const r = invio(area.value, area.selectionStart);
      if (r) { ev.preventDefault(); scrivi(area, r.testo, r.pos, r.pos); }
    }
  });

  // --- schede Scrivi / Anteprima (visibili solo su schermo stretto, vedi il CSS) ---
  const corpo = el('div', { class: 'editor-md-corpo' }, area, anteprima);
  const schedaScrivi = el('button', { type: 'button', class: 'editor-md-scheda attiva', onclick: () => mostra(false) }, 'Scrivi');
  const schedaAnteprima = el('button', { type: 'button', class: 'editor-md-scheda', onclick: () => mostra(true) }, 'Anteprima');
  function mostra(vediAnteprima) {
    elemento.classList.toggle('mostra-anteprima', vediAnteprima);
    schedaScrivi.classList.toggle('attiva', !vediAnteprima);
    schedaAnteprima.classList.toggle('attiva', vediAnteprima);
  }
  const schede = el('div', { class: 'editor-md-schede' }, schedaScrivi, schedaAnteprima);

  const elemento = el('div', { class: 'editor-md' }, schede, barra, corpo, el('div', { class: 'editor-md-pie' }, contatore));

  aggiornaContatore();
  aggiornaAnteprima();

  return {
    elemento,
    leggi: () => area.value,
    imposta(nuovo) { area.value = nuovo ?? ''; cambiato(); },
    valido: () => area.value.length <= max,
    focus: () => area.focus(),
    distruggi() { clearTimeout(timer); versione++; },
  };
}
