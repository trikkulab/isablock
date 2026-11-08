// «Sala» del docente: tutti (o alcuni) gli studenti di una verifica in una griglia a tutto schermo, con un primo piano.
// Ogni tessera è il solo disegno dei blocchi (immagine, ridisegnata solo se il programma cambia) più il nome e una riga
// di stato. Non legge nulla dal database: i dati arrivano dalla tabella live (`tabella.ascolta`), quindi 0 letture in più.
// Il primo piano è la finestra «Guarda» (verifica-anteprima-ui.js) messa in un pannello a fianco della griglia: l'editor
// vero in sola lettura, i tre codici e la Storia; lo studente in primo piano è osservato (salva più spesso).
import { el } from './dom.js';
import { apriAnteprima } from './verifica-anteprima-ui.js';
import { testoDurata } from './verifica-tabella.js';

const PROPORZIONE = 1.25;      // larghezza/altezza di una tessera, per scegliere quante colonne
const ALTEZZA_MIN = 120;       // px: sotto questa altezza la griglia scorre invece di rimpicciolire le tessere
const INGRANDIMENTO_MAX = 1.5; // l'immagine non cresce oltre 1,5 volte la misura dei blocchi nell'editor (poi si sgrana)
const LAMPEGGIO_MS = 2500;     // quanto resta il segno «programma cambiato» sulla tessera
const MAX_IMMAGINI = 120;      // programmi già disegnati che si tengono a mente
const MODI = [['tutti', 'Tutti'], ['bisogno', 'Chi ha bisogno'], ['scelti', 'Scelti']];

// Chi merita un'occhiata: offline, salto di blocchi, ultimo programma in errore, tempo quasi finito.
export const haBisogno = (r) => !!(r.stato !== 'consegnato'
  && ((r.connessione && r.connessione.stato === 'offline') || r.salto > 0 || r.stato === 'errore' || (r.timer && r.timer.colore === 'rosso')));

// Quante colonne mettere perché le tessere riempiano al meglio uno spazio largo × alto.
export function colonneMigliori(n, larghezza, altezza, proporzione = PROPORZIONE) {
  if (n <= 1) return 1;
  let migliore = 1; let area = -1;
  for (let c = 1; c <= n; c++) {
    const righe = Math.ceil(n / c);
    const tw = larghezza / c; const th = altezza / righe;
    const w = Math.min(tw, th * proporzione); const h = w / proporzione;
    if (w * h > area + 1e-6) { area = w * h; migliore = c; }
  }
  return migliore;
}

export function iniziali(nome, email) {
  const parole = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (parole.length >= 2) return (parole[0][0] + parole[parole.length - 1][0]).toUpperCase();
  if (parole.length === 1) return parole[0].slice(0, 2).toUpperCase();
  return String(email || '?').slice(0, 2).toUpperCase();
}

// `apri`: la finestra del modulo chiamante (con `{ piena: true }`). `tabella`: la tabella live. `programma`: main.js.
// `caricaStoria(email)` e `osserva(email)` come in apriAnteprima. Restituisce la finestra, o null se mancano i mezzi.
export function apriSala({ apri, tabella, programma, caricaStoria = null, osserva = null, titolo = 'Sala' }) {
  if (!programma || !programma.renderBlocchi || !programma.anteprima) return null;
  const f = apri(titolo, () => { chiuso = true; clearInterval(giro); smetti(); for (const t of tessere.values()) clearTimeout(t.timerCambio); chiudiPrimo(); osservaLarghezza.disconnect(); document.removeEventListener('fullscreenchange', aggiornaIntero); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); coda.length = 0; renderer?.then((r) => r && r.distruggi()); }, { piena: true });
  let chiuso = false;
  let modo = 'tutti';
  let conIniziali = false;
  let primo = null;                    // email dello studente in primo piano
  let finestraPrimo = null;
  const scelti = new Set();
  const tessere = new Map();           // email → { el, img, nome, riga, chk, programma, riga: dati }
  const cache = new Map();             // testo del programma → dataUrl
  const coda = [];                     // email in attesa di un disegno
  let renderer = null;                 // promessa del renderer di blocchi (uno solo, creato quando serve)
  let inLavoro = false;

  // ── Barra in alto ─────────────────────────────────────────────────────────
  const bottoniModo = new Map();
  const barra = el('div', { class: 'sala-barra', role: 'toolbar', 'aria-label': 'Sala' });
  barra.append(el('strong', { class: 'sala-titolo' }, titolo));
  const gruppoModi = el('div', { class: 'sala-gruppo', role: 'group', 'aria-label': 'Chi mostrare' });
  for (const [k, testo] of MODI) {
    const b = el('button', { type: 'button', class: 'sala-btn', 'aria-pressed': 'false', onclick: () => { modo = k; aggiorna(); } }, testo);
    bottoniModo.set(k, b); gruppoModi.append(b);
  }
  const bNomi = el('button', { type: 'button', class: 'sala-btn', 'aria-pressed': 'false', title: 'Mostra solo le iniziali (utile se la finestra è proiettata)', onclick: () => { conIniziali = !conIniziali; aggiorna(); } }, 'Iniziali');
  const bIntero = el('button', { type: 'button', class: 'sala-btn', 'aria-pressed': 'false', onclick: () => {
    const box = corpo.closest('.modal-box');
    if (document.fullscreenElement) document.exitFullscreen?.(); else box?.requestFullscreen?.().catch(() => {});
  } });
  // Interruttore: il testo dice cosa succede al prossimo clic (anche se si esce con Esc o F11)
  const aggiornaIntero = () => {
    const dentro = !!document.fullscreenElement;
    bIntero.textContent = dentro ? 'Esci da schermo intero' : 'Schermo intero';
    bIntero.title = dentro ? 'Torna alla finestra normale' : 'Schermo intero';
    bIntero.setAttribute('aria-pressed', String(dentro)); bIntero.classList.toggle('attiva', dentro);
  };
  document.addEventListener('fullscreenchange', aggiornaIntero);
  aggiornaIntero();
  const conteggio = el('span', { class: 'sala-conteggio', 'aria-live': 'polite' });
  barra.append(gruppoModi, bNomi, bIntero, conteggio);

  // ── Griglia, divisore, primo piano ────────────────────────────────────────
  const griglia = el('div', { class: 'sala-griglia' });
  const vuota = el('p', { class: 'sala-vuota', hidden: '' });
  const areaGriglia = el('div', { class: 'sala-area' }, griglia, vuota);
  const divisore = el('div', { class: 'sala-divisore', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Trascina per cambiare la larghezza del primo piano', tabindex: '0', hidden: '' });
  const pannelloPrimo = el('div', { class: 'sala-primo', hidden: '' });
  const corpo = el('div', { class: 'sala-corpo' }, areaGriglia, divisore, pannelloPrimo);
  f.corpo.classList.add('sala');
  f.corpo.append(barra, corpo);

  let larghezzaPrimo = null;           // px, null = metà
  const impostaPrimo = (px) => {
    const tot = corpo.clientWidth;
    larghezzaPrimo = Math.max(tot * 0.25, Math.min(tot * 0.75, px));
    pannelloPrimo.style.width = `${Math.round(larghezzaPrimo)}px`;
    window.dispatchEvent(new Event('resize'));   // Blockly ridisegna l'editor del primo piano
  };
  divisore.addEventListener('pointerdown', (ev) => {
    divisore.setPointerCapture(ev.pointerId);
    const muovi = (e) => impostaPrimo(corpo.getBoundingClientRect().right - e.clientX);
    const fine = () => { divisore.removeEventListener('pointermove', muovi); divisore.removeEventListener('pointerup', fine); divisore.removeEventListener('pointercancel', fine); sistemaColonne(); };
    divisore.addEventListener('pointermove', muovi); divisore.addEventListener('pointerup', fine); divisore.addEventListener('pointercancel', fine);
  });
  divisore.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    impostaPrimo((larghezzaPrimo ?? corpo.clientWidth / 2) + (ev.key === 'ArrowLeft' ? 40 : -40));
    sistemaColonne();
  });

  // ── Primo piano: la finestra «Guarda» dentro il pannello ──────────────────
  function chiudiPrimo() {
    if (finestraPrimo) { const g = finestraPrimo; finestraPrimo = null; g.chiudi(); }
    primo = null;
    pannelloPrimo.hidden = true; divisore.hidden = true;
    pannelloPrimo.textContent = '';
  }
  function apriPrimo(email) {
    if (primo === email) { chiudiPrimo(); aggiorna(); return; }
    chiudiPrimo();
    const r = tabella.righe().find((x) => x.email === email);
    const nome = r?.nome || email;
    primo = email;
    pannelloPrimo.hidden = false; divisore.hidden = false;
    if (larghezzaPrimo === null) impostaPrimo(corpo.clientWidth / 2); else impostaPrimo(larghezzaPrimo);
    const intestazione = el('div', { class: 'sala-primo-testa' },
      el('strong', {}, conIniziali ? iniziali(r?.nome, email) : nome),
      el('button', { type: 'button', class: 'sala-btn', 'aria-label': 'Chiudi il primo piano', onclick: () => { chiudiPrimo(); aggiorna(); } }, '✕'));
    const contenuto = el('div', { class: 'sala-primo-corpo' });
    pannelloPrimo.append(intestazione, contenuto);
    let quando = null;
    const g = apriAnteprima({
      apri: (_titolo, onChiudi) => { quando = onChiudi; return { corpo: contenuto, chiudi: () => { quando?.(); } }; },
      programma, segui: (e, cb) => tabella.segui(e, cb),
      caricaStoria: caricaStoria ? () => caricaStoria(email) : null,
      osserva: osserva ? () => osserva(email) : null,
      email, nome: conIniziali ? iniziali(r?.nome, email) : nome,
      nota: 'Sola lettura. Il programma si aggiorna da solo.',
    });
    if (!g) { chiudiPrimo(); return; }
    finestraPrimo = { chiudi: () => { quando?.(); quando = null; } };
    aggiorna();
    sistemaColonne();
  }

  // ── Tessere ───────────────────────────────────────────────────────────────
  const nomeVisto = (r) => (conIniziali ? iniziali(r.nome, r.email) : (r.nome || r.email));
  function creaTessera(email) {
    const img = el('img', { class: 'sala-img', alt: '', draggable: 'false', hidden: '' });
    const vuotoImg = el('span', { class: 'sala-img-vuoto' }, '');
    const nome = el('span', { class: 'sala-nome' });
    const info = el('span', { class: 'sala-info' });
    const chk = el('input', { type: 'checkbox', class: 'sala-chk', title: 'Tieni d\'occhio' });
    chk.addEventListener('click', (ev) => ev.stopPropagation());
    chk.addEventListener('change', () => { if (chk.checked) scelti.add(email); else scelti.delete(email); aggiorna(); });
    const t = el('div', { class: 'sala-tessera', role: 'button', tabindex: '0', 'data-email': email },
      el('div', { class: 'sala-testa' }, chk, nome),
      el('div', { class: 'sala-disegno' }, img, vuotoImg),
      info);
    t.addEventListener('click', () => apriPrimo(email));
    t.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); apriPrimo(email); return; }
      const mosse = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!(ev.key in mosse)) return;
      ev.preventDefault();
      const tutte = [...griglia.children];
      const prossima = tutte[tutte.indexOf(t) + mosse[ev.key]];
      prossima?.focus();
    });
    const dati = { el: t, img, vuotoImg, nome, info, chk, programma: null };
    tessere.set(email, dati);
    return dati;
  }

  function riempiInfo(t, r) {
    const pezzi = [];
    const sp = (testo, attrs = {}) => el('span', attrs, testo);
    if (r.stato === 'consegnato') pezzi.push(sp('consegnato', { class: 'sala-ok' }));
    else if (r.stato === 'non-entrato') pezzi.push(sp('non entrato', { class: 'sala-muto' }));
    if (r.timer) pezzi.push(sp(r.timer.restante > 0 ? testoDurata(r.timer.restante) : 'scaduto', { class: 'sala-timer', 'data-colore': r.timer.colore }));
    if (r.nBlocchi !== null && r.nBlocchi !== undefined) pezzi.push(sp(`${r.nBlocchi}${r.incremento ? ` (${r.incremento > 0 ? '+' : ''}${r.incremento})` : ''} bl.`));
    if (r.connessione && r.connessione.stato === 'offline') pezzi.push(sp('offline', { class: 'sala-offline' }));
    if (r.stato === 'errore') pezzi.push(sp('errore', { class: 'sala-offline' }));
    if (r.salto > 0) pezzi.push(sp('⚠', { class: 'sala-salto', title: `Salto di ${r.salto} blocchi`, role: 'img', 'aria-label': `Salto di ${r.salto} blocchi` }));
    const chiave = pezzi.map((p) => `${p.className}|${p.dataset.colore ?? ''}|${p.textContent}`).join('~');
    if (chiave === t.chiaveInfo) return;       // niente da cambiare: non si tocca il DOM
    t.chiaveInfo = chiave;
    t.info.replaceChildren(...pezzi.flatMap((p, i) => (i ? [' · ', p] : [p])));
  }

  // ── Disegno dei blocchi: uno alla volta, solo se il programma è cambiato ───
  const programmaDi = (x, chiusa) => (chiusa && x.ultimaConsegna?.programma) || x.lavoro?.programma || x.ultimaConsegna?.programma || '';
  // `img`: { dataUrl, larghezzaPx } o null. La larghezza è quella dei blocchi a scala 1: con il tetto, un programma piccolo
  // non diventa gigante; uno grande resta rimpicciolito (max-width/max-height 100%) e si vede intero.
  function mostraImmagine(t, img) {
    if (img) {
      t.img.src = img.dataUrl;
      t.img.style.width = `${Math.round(img.larghezzaPx * INGRANDIMENTO_MAX)}px`;
      t.img.hidden = false; t.vuotoImg.hidden = true;
    } else { t.img.hidden = true; t.vuotoImg.hidden = false; }
  }
  // Segno breve sulla tessera: il programma è cambiato (si riavvia l'animazione anche se già in corso).
  function segnaCambiato(t) {
    clearTimeout(t.timerCambio);
    t.el.classList.remove('cambiato');
    void t.el.offsetWidth;
    t.el.classList.add('cambiato');
    t.timerCambio = setTimeout(() => t.el.classList.remove('cambiato'), LAMPEGGIO_MS);
  }
  async function lavora() {
    if (inLavoro) return;
    inLavoro = true;
    try {
      while (coda.length && !chiuso) {
        const email = coda.shift();
        const t = tessere.get(email);
        if (!t || !t.voluto || t.programma === t.voluto) continue;
        const testo = t.voluto;
        let url = cache.get(testo);   // { dataUrl, larghezzaPx } | null
        if (url === undefined) {
          renderer ??= programma.renderBlocchi().catch(() => null);
          const r = await renderer;
          if (chiuso || !r) break;
          const out = await r.rendi(testo);
          url = out && out.immagine ? { dataUrl: out.immagine.dataUrl, larghezzaPx: out.immagine.larghezzaPx } : null;
          if (cache.size >= MAX_IMMAGINI) cache.delete(cache.keys().next().value);
          cache.set(testo, url);
        }
        const eraDisegnato = !!t.programma;
        t.programma = testo;
        mostraImmagine(t, url);
        if (eraDisegnato) segnaCambiato(t);
        await new Promise((ok) => setTimeout(ok, 0));   // lascia respirare la pagina tra un disegno e l'altro
      }
    } finally { inLavoro = false; }
  }

  // ── Aggiornamento: ad ogni novità dal server e ogni secondo (timer) ────────
  function visibili(righe) {
    if (modo === 'bisogno') return righe.filter(haBisogno);
    if (modo === 'scelti') return righe.filter((r) => scelti.has(r.email));
    return righe;
  }
  function aggiorna() {
    if (chiuso) return;
    const righe = tabella.righe();
    const chiusa = tabella.statoVerifica() === 'chiusa';
    const dati = new Map(tabella.tutti().map((x) => [x.email, x]));
    const mostrate = visibili(righe);
    const insieme = new Set(mostrate.map((r) => r.email));
    // tessere non più visibili: tolte dalla griglia (restano in memoria con la loro immagine)
    for (const [email, t] of tessere) if (!insieme.has(email) && t.el.isConnected) t.el.remove();
    // l'ordine è quello delle righe (per nome); si tocca il DOM solo se serve
    mostrate.forEach((r, i) => {
      const t = tessere.get(r.email) ?? creaTessera(r.email);
      if (griglia.children[i] !== t.el) griglia.insertBefore(t.el, griglia.children[i] ?? null);
      const nomeTesto = nomeVisto(r);
      if (t.nome.textContent !== nomeTesto) {
        t.nome.textContent = nomeTesto;
        t.el.setAttribute('aria-label', `${r.nome || r.email}`);
        t.chk.setAttribute('aria-label', `Tieni d'occhio ${r.nome || r.email}`);
      }
      t.chk.checked = scelti.has(r.email);
      t.el.classList.toggle('in-primo', r.email === primo);
      t.el.classList.toggle('bisogno', haBisogno(r));
      t.el.dataset.stato = r.stato;
      riempiInfo(t, r);
      const x = dati.get(r.email);
      t.voluto = x ? programmaDi(x, chiusa) : '';
      if (!t.voluto) { t.programma = ''; mostraImmagine(t, null); }
      else if (t.programma !== t.voluto && !coda.includes(r.email)) {
        // in primo piano e chi ha cambiato per ultimo passano avanti
        if (r.email === primo) coda.unshift(r.email); else coda.push(r.email);
      }
    });
    for (const [k, b] of bottoniModo) { b.setAttribute('aria-pressed', String(k === modo)); b.classList.toggle('attiva', k === modo); }
    const nBisogno = righe.filter(haBisogno).length;
    bottoniModo.get('bisogno').textContent = `Chi ha bisogno${nBisogno ? ` (${nBisogno})` : ''}`;
    bottoniModo.get('scelti').textContent = `Scelti${scelti.size ? ` (${scelti.size})` : ''}`;
    bNomi.setAttribute('aria-pressed', String(conIniziali)); bNomi.classList.toggle('attiva', conIniziali);
    conteggio.textContent = `${mostrate.length} di ${righe.length}`;
    vuota.hidden = mostrate.length > 0;
    if (mostrate.length === 0) {
      vuota.textContent = righe.length === 0 ? 'Carico la situazione…'
        : modo === 'bisogno' ? 'Nessuno ha bisogno di attenzione, per ora.'
          : 'Nessuno scelto: metti la spunta sulle tessere che vuoi tenere d\'occhio.';
    }
    sistemaColonne(mostrate.length);
    lavora();
  }

  function sistemaColonne(n = griglia.children.length) {
    const w = areaGriglia.clientWidth; const h = areaGriglia.clientHeight;
    if (!w || !h || n === 0) return;
    const c = colonneMigliori(n, w, h);
    const righe = Math.ceil(n / c);
    griglia.style.gridTemplateColumns = `repeat(${c}, minmax(0, 1fr))`;
    griglia.style.gridTemplateRows = `repeat(${righe}, minmax(${ALTEZZA_MIN}px, 1fr))`;
  }
  const osservaLarghezza = new ResizeObserver(() => sistemaColonne());
  osservaLarghezza.observe(areaGriglia);

  const smetti = tabella.ascolta(aggiorna);
  const giro = setInterval(aggiorna, 1000);
  aggiorna();
  return f;
}
