// Finestra «Guarda» del docente: il programma di UNO studente, in sola lettura, che si aggiorna da solo.
// A sinistra i blocchi, a destra pseudocodice/C/Python generati dagli stessi generatori dell'editor. Non legge nulla
// dal database: i dati arrivano dalla tabella live (`segui`), che ha già il programma di ogni studente.
// I blocchi e i codici li disegna main.js (`programma.anteprima`); qui c'è solo la finestra.
import { el } from './dom.js';
import { contaBlocchi } from './verifica-tabella.js';
import { codiceRiscontro } from './scheda-stampa.js';
import { verificaDocenteEtichette as E } from './etichette.js';

const CODICI = [['pseudocode', 'Pseudocodice'], ['c', 'C'], ['python', 'Python']];
const ora = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// `apri(titolo, onChiudi, opzioni)`: la finestra del modulo chiamante. `segui(email, cb)` chiama cb(lavoro, consegna, verifica) subito (se noto)
// e a ogni aggiornamento, e restituisce la funzione per smettere. `caricaStoria()` (facoltativa) legge le istantanee dello
// studente (vedi lavori.storia): con quella la finestra ha il cursore per tornare indietro nel tempo. `osserva()` (facoltativa)
// avvia la vista dal vivo (lo studente salva più spesso finché la finestra è aperta) e restituisce la funzione per fermarla,
// oppure null se non si può (verifica non aperta, studente non entrato).
// Restituisce la finestra, o null se mancano i mezzi.
// `apriCopia({ programma, chi })`: se c'è, in fondo compare «Apri una copia per provarla» (carica nell'editor ciò che si sta guardando).
export function apriAnteprima({ apri, programma, segui, caricaStoria = null, osserva = null, email, nome, titolo = null, nota = null, apriCopia = null }) {
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
  let fermaOsserva = () => {};
  const f = apri(titolo ?? `Programma di ${nome || email}`, () => { annulla(); fermaOsserva(); anteprima?.distruggi(); }, { larga: true });
  const stopOsserva = osserva ? osserva() : null;
  fermaOsserva = stopOsserva || (() => {});
  f.corpo.append(
    info,
    vuoto,
    el('div', { class: 'anteprima-corpo' }, blocchi, el('div', { class: 'anteprima-lato' }, barra, ...CODICI.map(([k]) => pre[k]))),
    el('p', { class: 'sketch-nota' }, nota ?? (stopOsserva
      ? 'Sola lettura. Finché questa finestra è aperta lo studente salva più spesso: il programma si aggiorna da solo, di solito entro pochi secondi.'
      : 'Sola lettura. Il programma si aggiorna da solo quando lo studente salva (di solito entro 25 secondi).')));
  scegli('pseudocode');
  anteprima = programma.anteprima({ blocchi, codici: pre });
  requestAnimationFrame(() => anteprima?.ridimensiona());

  // ── Storia: il cursore va dal punto più vecchio a «in diretta» (l'ultimo posto) ─────────────────────────────────
  // I punti sono istantanee del lavoro e consegne (tipo 'consegna'), tutti in ordine di tempo del server. A verifica chiusa
  // il posto di partenza non è l'ultimo ma l'ULTIMA CONSEGNA, nel suo punto del tempo: quello che viene dopo (per esempio
  // il lavoro fatto in una riapertura) sta dopo di lei e si vede, ma è dichiarato «successivo, non è una consegna».
  let punti = null;         // punti letti, dal più vecchio; null finché non si apre la storia
  let posizione = null;     // indice in `punti`, o null = il posto di partenza (in diretta, oppure l'ultima consegna)
  let ultimoLavoro = null;  // l'ultimo stato in diretta ricevuto: { lavoro, consegna, verifica }
  const bStoria = el('button', { type: 'button', class: 'modal-btn secondary' }, E.storia);
  const cursore = el('input', { type: 'range', min: '0', max: '0', step: '1', class: 'anteprima-cursore', 'aria-label': 'Momento del programma' });
  const eticCursore = el('span', { class: 'anteprima-etichetta', 'aria-live': 'polite' });
  const bIndietro = el('button', { type: 'button', class: 'modal-btn secondary', title: 'Istantanea precedente', 'aria-label': 'Istantanea precedente' }, '◀');
  const bAvanti = el('button', { type: 'button', class: 'modal-btn secondary', title: 'Istantanea successiva', 'aria-label': 'Istantanea successiva' }, '▶');
  const bDiretta = el('button', { type: 'button', class: 'modal-btn secondary' }, 'In diretta');
  const avvisoConsegna = el('p', { class: 'verifica-avviso', role: 'note', hidden: '' });
  const saltiEl = el('div', { class: 'anteprima-salti' });
  // Cosa contiene la Storia (non cambia con la posizione). Nascosta per ora: la finestra ha già molte righe in alto e lo
  // spazio per i blocchi serve; per riaverla basta togliere `hidden`.
  const riepilogo = el('p', { class: 'sketch-nota anteprima-riepilogo', hidden: '' });
  const barraStoria = el('div', { class: 'anteprima-storia', hidden: '' },
    el('div', { class: 'sketch-riga' }, bIndietro, cursore, bAvanti, bDiretta), eticCursore, saltiEl, riepilogo);
  const ore = (d) => ora.format(d);
  const nomiTipo = { prima: 'prima del salto', dopo: 'dopo il salto', periodica: '' };
  const segno = (p) => (p.tipo === 'periodica' || p.tipo === 'consegna' ? '' : ' ⚠');
  const dalla = (o) => (o === 'file' ? ' (da file)' : o === 'raccolta' ? ' (raccolta)' : o === 'studente' ? ' (dello studente)' : '');
  const quando = (o) => (o === 'file' ? 'caricata alle' : o === 'raccolta' ? 'raccolta alle' : 'consegnata alle');

  // A verifica chiusa si parte dall'ultima consegna; altrimenti dal lavoro in diretta.
  const modoConsegna = () => !!(ultimoLavoro && sorgente(ultimoLavoro).etichetta);
  // Indice, in `punti`, dell'ultima consegna (versione più alta), o -1.
  function indiceUltima() {
    let k = -1;
    punti.forEach((p, i) => { if (p.tipo === 'consegna' && (k < 0 || p.versione > punti[k].versione)) k = i; });
    return k;
  }
  // Il posto di partenza: l'indice dell'ultima consegna in modo consegna, altrimenti dopo l'ultimo punto (in diretta).
  const partenza = () => { const k = modoConsegna() ? indiceUltima() : -1; return k >= 0 ? k : punti.length; };
  const ultimoPosto = () => (partenza() === punti.length ? punti.length : punti.length - 1);
  const posizioneEffettiva = () => (posizione === null ? partenza() : posizione);
  const normalizza = (i) => (i === partenza() ? null : i);

  function mostraPosizione() {
    const attuale = posizioneEffettiva();
    const consegnaTesto = modoConsegna();
    bDiretta.textContent = consegnaTesto ? 'Ultima consegna' : 'In diretta';
    cursore.max = String(ultimoPosto());
    cursore.value = String(attuale);
    bIndietro.disabled = attuale === 0 || punti.length === 0;
    bAvanti.disabled = attuale >= ultimoPosto();
    bDiretta.disabled = posizione === null;
    if (posizione === null) {
      // L'etichetta descrive sempre ciò che si sta guardando, come negli altri posti
      const c = ultimoLavoro && ultimoLavoro.consegna;
      const n = ultimoLavoro ? sorgente(ultimoLavoro).nBlocchi : null;
      const blocchiTesto = n === null || n === undefined ? '' : ` · ${n} blocchi`;
      eticCursore.textContent = consegnaTesto && c
        ? `Ultima consegna: v${c.versione}${dalla(c.origine)}${c.creato ? ` · ${quando(c.origine)} ${ore(c.creato)}` : ''}${blocchiTesto}`
        : `In diretta${blocchiTesto}`;
      if (ultimoLavoro) disegna(ultimoLavoro);
    } else {
      const p = punti[posizione];
      const u = consegnaTesto ? punti[indiceUltima()] : null;
      if (p.tipo === 'consegna') {
        eticCursore.textContent = consegnaTesto
          ? `Consegna precedente (v${p.versione}${dalla(p.origine)}) · ${quando(p.origine)} ${ore(p.t)} · ${p.nBlocchi} blocchi — non è l'ultima consegna`
          : `Consegna v${p.versione}${dalla(p.origine)} · ${quando(p.origine)} ${ore(p.t)} · ${p.nBlocchi} blocchi`;
        info.textContent = `${nome || email} · consegna v${p.versione}${dalla(p.origine)}`;
      } else {
        const dopo = u && p.t > u.t ? ` · successiva all'ultima consegna (v${u.versione})` : '';
        eticCursore.textContent = `Istantanea del lavoro alle ${ore(p.t)} · ${p.nBlocchi} blocchi${nomiTipo[p.tipo] ? ` · ${nomiTipo[p.tipo]}` : ''}${dopo} — ${consegnaTesto ? 'non è una consegna' : 'non è il programma attuale'}`;
        info.textContent = `${nome || email} · istantanea delle ${ore(p.t)}`;
      }
      vuoto.hidden = true; blocchi.hidden = false;
      if (anteprima.mostra(p.programma)) ultimo = p.programma;
    }
  }
  const vai = (i) => { posizione = i === null ? null : normalizza(i); mostraPosizione(); };
  cursore.addEventListener('input', () => vai(Number(cursore.value)));
  bIndietro.addEventListener('click', () => vai(Math.max(0, posizioneEffettiva() - 1)));
  bAvanti.addEventListener('click', () => vai(Math.min(ultimoPosto(), posizioneEffettiva() + 1)));
  bDiretta.addEventListener('click', () => vai(null));

  async function apriStoria() {
    bStoria.disabled = true;
    try { punti = await caricaStoria(); } catch (err) { bStoria.disabled = false; info.textContent = (err && err.message) || 'Non riesco a leggere la storia.'; return; }
    bStoria.disabled = false;
    bStoria.textContent = 'Aggiorna la storia';
    barraStoria.hidden = false;
    saltiEl.textContent = '';
    const nCons = punti.filter((p) => p.tipo === 'consegna').length;
    const nIst = punti.length - nCons;
    riepilogo.textContent = `Nella Storia: ${nCons === 0 ? 'nessuna consegna' : nCons === 1 ? '1 consegna' : `${nCons} consegne`} e ${nIst === 0 ? 'nessuna istantanea' : nIst === 1 ? '1 istantanea' : `${nIst} istantanee`} del lavoro (una ogni 5 minuti circa, più i salti di blocchi).`;
    const salti = punti.map((p, i) => [p, i]).filter(([p]) => p.tipo === 'prima');
    if (salti.length) {
      saltiEl.append(el('span', { class: 'sketch-nota' }, 'Salti di blocchi: '),
        ...salti.map(([p, i]) => el('button', { type: 'button', class: 'avviso-link', title: 'Mostra il programma subito prima del salto', onclick: () => vai(i) }, `⚠ ${ore(p.t)}`)));
    }
    if (posizione !== null && posizione > ultimoPosto()) posizione = null;
    mostraPosizione();
  }
  if (caricaStoria) { bStoria.addEventListener('click', apriStoria); info.after(bStoria, barraStoria); }
  info.after(avvisoConsegna);

  let ultimo = null;   // l'ultimo programma mostrato (testo del JSON)
  if (apriCopia) {
    f.corpo.append(el('div', { class: 'modal-actions' },
      el('button', { type: 'button', class: 'modal-btn secondary', title: 'Carica nell\'editor una copia di ciò che stai guardando, per eseguirla e provarla: la consegna non cambia',
        onclick: () => apriCopia({ programma: ultimo, chi: `${nome || email}` }) }, E.apriCopiaProva)));
  }
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
    return { programma: consegna.programma, nBlocchi: contaBlocchi(consegna.programma), consegnato: false, ultimoSegnale: null, etichetta: ` · ultima consegna: v${consegna.versione}${come}`, riscontro: codiceRiscontro(consegna.programma) };
  }

  // Il lavoro sul server è più recente di una consegna da file di emergenza: lo dice, perché la raccolta è da decidere.
  function segnalaConflitto({ lavoro, consegna }, daConsegna) {
    const c = daConsegna && consegna && consegna.origine === 'file' && lavoro.programma && lavoro.programma !== consegna.programma
      && lavoro.ultimoSegnale && consegna.creato && lavoro.ultimoSegnale.getTime() > consegna.creato.getTime();
    avvisoConsegna.hidden = !c;
    if (c) avvisoConsegna.textContent = 'Sul server c\'è un lavoro più recente dell\'ultima consegna: la raccolta è da decidere. Lo vedi nella Storia, dopo la consegna.';
  }

  function disegna(stato) {
    const lavoro = sorgente(stato);
    segnalaConflitto(stato, !!lavoro.etichetta);
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
      info.textContent = `${nome || email}${lavoro.etichetta ?? ''}${n}${lavoro.consegnato ? ' · consegnato' : ''}${lavoro.riscontro ? ` · riscontro ${lavoro.riscontro}` : ''}${lavoro.ultimoSegnale ? ` · ultimo segnale alle ${ora.format(lavoro.ultimoSegnale)}` : ''}`;
    }
  }
  return f;
}
