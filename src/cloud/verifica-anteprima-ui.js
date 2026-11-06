// Finestra «Guarda» del docente: il programma di UNO studente, in sola lettura, che si aggiorna da solo.
// A sinistra i blocchi, a destra pseudocodice/C/Python generati dagli stessi generatori dell'editor. Non legge nulla
// dal database: i dati arrivano dalla tabella live (`segui`), che ha già il programma di ogni studente.
// I blocchi e i codici li disegna main.js (`programma.anteprima`); qui c'è solo la finestra.
import { el } from './dom.js';
import { contaBlocchi } from './verifica-tabella.js';

const CODICI = [['pseudocode', 'Pseudocodice'], ['c', 'C'], ['python', 'Python']];
const ora = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// `apri(titolo, onChiudi, opzioni)`: la finestra del modulo chiamante. `segui(email, cb)` chiama cb(lavoro, consegna, verifica) subito (se noto)
// e a ogni aggiornamento, e restituisce la funzione per smettere. `caricaStoria()` (facoltativa) legge le istantanee dello
// studente (vedi lavori.storia): con quella la finestra ha il cursore per tornare indietro nel tempo.
// Restituisce la finestra, o null se mancano i mezzi.
export function apriAnteprima({ apri, programma, segui, caricaStoria = null, email, nome, titolo = null, nota = null }) {
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
  const f = apri(titolo ?? `Programma di ${nome || email}`, () => { annulla(); anteprima?.distruggi(); }, { larga: true });
  f.corpo.append(
    info,
    vuoto,
    el('div', { class: 'anteprima-corpo' }, blocchi, el('div', { class: 'anteprima-lato' }, barra, ...CODICI.map(([k]) => pre[k]))),
    el('p', { class: 'sketch-nota' }, nota ?? 'Sola lettura. Il programma si aggiorna da solo quando lo studente salva (di solito entro 25 secondi).'));
  scegli('pseudocode');
  anteprima = programma.anteprima({ blocchi, codici: pre });
  requestAnimationFrame(() => anteprima?.ridimensiona());

  // ── Storia: il cursore va dalla prima istantanea a «in diretta» (l'ultimo posto) ─────────────────────────────────
  let punti = null;         // istantanee lette, dalla più vecchia; null finché non si apre la storia
  let posizione = null;     // indice in `punti`, o null = in diretta
  let ultimoLavoro = null;  // l'ultimo stato in diretta ricevuto: { lavoro, consegna, verifica }
  const bStoria = el('button', { type: 'button', class: 'modal-btn secondary' }, 'Storia…');
  const cursore = el('input', { type: 'range', min: '0', max: '0', step: '1', class: 'anteprima-cursore', 'aria-label': 'Momento del programma' });
  const eticCursore = el('span', { class: 'anteprima-etichetta', 'aria-live': 'polite' });
  const bIndietro = el('button', { type: 'button', class: 'modal-btn secondary', title: 'Istantanea precedente', 'aria-label': 'Istantanea precedente' }, '◀');
  const bAvanti = el('button', { type: 'button', class: 'modal-btn secondary', title: 'Istantanea successiva', 'aria-label': 'Istantanea successiva' }, '▶');
  const bDiretta = el('button', { type: 'button', class: 'modal-btn secondary' }, 'In diretta');
  const saltiEl = el('div', { class: 'anteprima-salti' });
  const barraStoria = el('div', { class: 'anteprima-storia', hidden: '' },
    el('div', { class: 'sketch-riga' }, bIndietro, cursore, bAvanti, bDiretta), eticCursore, saltiEl);
  const ore = (d) => ora.format(d);
  const nomiTipo = { prima: 'prima del salto', dopo: 'dopo il salto', periodica: '' };
  const segno = (p) => (p.tipo === 'periodica' ? '' : ' ⚠');

  function mostraPosizione() {
    cursore.max = String(punti.length);
    cursore.value = String(posizione === null ? punti.length : posizione);
    bIndietro.disabled = posizione === 0 || punti.length === 0;
    bAvanti.disabled = posizione === null;
    bDiretta.disabled = posizione === null;
    if (posizione === null) {
      eticCursore.textContent = punti.length ? `In diretta · ${punti.length} istantanee salvate (una ogni 5 minuti circa, più i salti di blocchi)` : 'Nessuna istantanea salvata finora.';
      if (ultimoLavoro) disegna(ultimoLavoro);
    } else {
      const p = punti[posizione];
      eticCursore.textContent = `Com'era alle ${ore(p.t)} · ${p.nBlocchi} blocchi${nomiTipo[p.tipo] ? ` · ${nomiTipo[p.tipo]}` : ''} — non è il programma attuale`;
      vuoto.hidden = true; blocchi.hidden = false;
      if (anteprima.mostra(p.programma)) ultimo = p.programma;
      info.textContent = `${nome || email} · istantanea delle ${ore(p.t)}`;
    }
  }
  const vai = (i) => { posizione = i; mostraPosizione(); };
  cursore.addEventListener('input', () => vai(Number(cursore.value) >= punti.length ? null : Number(cursore.value)));
  bIndietro.addEventListener('click', () => vai(posizione === null ? punti.length - 1 : Math.max(0, posizione - 1)));
  bAvanti.addEventListener('click', () => vai(posizione !== null && posizione + 1 < punti.length ? posizione + 1 : null));
  bDiretta.addEventListener('click', () => vai(null));

  async function apriStoria() {
    bStoria.disabled = true;
    try { punti = await caricaStoria(); } catch (err) { bStoria.disabled = false; info.textContent = (err && err.message) || 'Non riesco a leggere la storia.'; return; }
    bStoria.disabled = false;
    bStoria.textContent = 'Aggiorna la storia';
    barraStoria.hidden = false;
    saltiEl.textContent = '';
    const salti = punti.map((p, i) => [p, i]).filter(([p]) => p.tipo === 'prima');
    if (salti.length) {
      saltiEl.append(el('span', { class: 'sketch-nota' }, 'Salti di blocchi: '),
        ...salti.map(([p, i]) => el('button', { type: 'button', class: 'avviso-link', title: 'Mostra il programma subito prima del salto', onclick: () => vai(i) }, `⚠ ${ore(p.t)}`)));
    }
    if (posizione !== null && posizione >= punti.length) posizione = null;
    mostraPosizione();
  }
  if (caricaStoria) { bStoria.addEventListener('click', apriStoria); info.after(bStoria, barraStoria); }

  let ultimo = null;   // l'ultimo programma mostrato (testo del JSON)
  annulla = segui(email, (lavoro, consegna = null, verifica = null) => {
    if (!lavoro) return;
    ultimoLavoro = { lavoro, consegna, verifica };
    if (posizione !== null) return;     // sta guardando il passato: la diretta si aggiorna sotto, ma non si mostra
    disegna(ultimoLavoro);
  });

  // Cosa mostrare: a verifica CHIUSA fa fede la consegna (l'ultima versione, anche raccolta o caricata da file); a verifica
  // aperta il lavoro in diretta, e solo se è vuoto (per esempio chi non è mai entrato) la consegna, se c'è.
  function sorgente({ lavoro, consegna, verifica }) {
    const dallaConsegna = consegna && consegna.programma && (verifica?.stato === 'chiusa' || !lavoro.programma);
    if (!dallaConsegna) return lavoro;
    const come = consegna.origine === 'file' ? ' (da file)' : consegna.origine === 'raccolta' ? ' (raccolta)' : '';
    return { programma: consegna.programma, nBlocchi: contaBlocchi(consegna.programma), consegnato: false, ultimoSegnale: null, etichetta: ` · consegna v${consegna.versione}${come}` };
  }

  function disegna(stato) {
    const lavoro = sorgente(stato);
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
      info.textContent = `${nome || email}${lavoro.etichetta ?? ''}${n}${lavoro.consegnato ? ' · consegnato' : ''}${lavoro.ultimoSegnale ? ` · ultimo segnale alle ${ora.format(lavoro.ultimoSegnale)}` : ''}`;
    }
  }
  return f;
}
