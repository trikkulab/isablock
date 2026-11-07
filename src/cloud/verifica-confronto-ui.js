// Confronto affiancato di due programmi (il docente sceglie tra il file di emergenza e il lavoro sul server).
// Una finestra sola, due colonne; un SOLO selettore (Blocchi / Pseudocodice / C / Python) che cambia entrambe le colonne,
// così si guarda sempre la stessa vista dei due programmi. Nelle viste di testo le righe che ci sono solo da una parte
// sono evidenziate (diff-righe.js); nella vista a blocchi non c'è evidenziazione. Sola lettura, nessun dato letto da qui.
import { el } from './dom.js';
import { differenzeRighe } from './diff-righe.js';

const VISTE = [['blocchi', 'Blocchi'], ['pseudocode', 'Pseudocodice'], ['c', 'C'], ['python', 'Python']];

// `apri(titolo, onChiudi, opzioni)`: la finestra del modulo chiamante. `sinistra`/`destra`: { titolo, dettaglio, programma }
// (programma = JSON del file). Restituisce la finestra, o null se mancano i mezzi.
export function apriConfronto({ apri, programma, titolo, sinistra, destra }) {
  if (!programma || !programma.anteprima) return null;
  const colonne = [sinistra, destra].map((lato) => {
    const blocchi = el('div', { class: 'anteprima-blocchi confronto-blocchi' });
    const pre = Object.fromEntries(VISTE.slice(1).map(([k]) => [k, el('pre', { class: 'code-body anteprima-codice confronto-codice', hidden: '' })]));
    const radice = el('div', { class: 'confronto-colonna' },
      el('div', { class: 'confronto-testata' }, el('strong', {}, lato.titolo), el('span', { class: 'sketch-nota' }, lato.dettaglio)),
      blocchi, ...Object.values(pre));
    return { lato, blocchi, pre, radice, anteprima: null };
  });

  let vista = 'blocchi';
  const bottoni = new Map();
  const barra = el('div', { class: 'verifica-schede', role: 'tablist' });
  const legenda = el('p', { class: 'sketch-nota confronto-legenda', hidden: '' }, 'Le righe evidenziate ci sono solo in una delle due versioni.');
  const scegli = (k) => {
    vista = k;
    for (const [c, b] of bottoni) { b.classList.toggle('attiva', c === k); b.setAttribute('aria-selected', String(c === k)); }
    for (const c of colonne) {
      c.blocchi.hidden = k !== 'blocchi';
      for (const [kk, p] of Object.entries(c.pre)) p.hidden = kk !== k;
    }
    legenda.hidden = k === 'blocchi';
    if (k === 'blocchi') requestAnimationFrame(() => colonne.forEach((c) => c.anteprima?.ridimensiona()));
  };
  for (const [k, testo] of VISTE) {
    const b = el('button', { type: 'button', role: 'tab', class: 'verifica-scheda', onclick: () => scegli(k) }, testo);
    bottoni.set(k, b); barra.append(b);
  }

  const f = apri(titolo, () => colonne.forEach((c) => c.anteprima?.distruggi()), { larga: true });
  f.corpo.append(barra, el('div', { class: 'confronto-colonne' }, ...colonne.map((c) => c.radice)), legenda,
    el('p', { class: 'sketch-nota' }, 'Sola lettura. Il selettore cambia le due colonne insieme.'));

  // I programmi si mostrano dopo che la finestra è nel documento (Blockly misura lo spazio)
  for (const c of colonne) {
    c.anteprima = programma.anteprima({ blocchi: c.blocchi, codici: c.pre });
    if (!c.anteprima.mostra(c.lato.programma)) c.blocchi.append(el('p', { class: 'sketch-nota' }, 'Non riesco a leggere questo programma.'));
  }
  const [s, d] = colonne.map((c) => c.anteprima.testi());
  if (s && d) {
    const righe = { soloS: {}, soloD: {} };
    for (const k of Object.keys(s)) { const r = differenzeRighe(s[k], d[k]); righe.soloS[k] = r.soloA; righe.soloD[k] = r.soloB; }
    colonne[0].anteprima.evidenzia(righe.soloS);
    colonne[1].anteprima.evidenzia(righe.soloD);
  }
  scegli('blocchi');
  return f;
}
