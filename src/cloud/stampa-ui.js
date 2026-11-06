// Stampa delle schede di consegna (docente, a verifica chiusa): una pagina per studente, con intestazione, traccia, blocchi
// disegnati, pseudocodice, C e Python, e un codice breve di riscontro. Si stampa dal browser (anche «Salva come PDF»): la
// scheda è un'area nascosta della pagina, che con la stampa diventa l'unica cosa visibile (css/style.css, @media print).
// Il titolo della pagina diventa il nome del PDF suggerito. Niente di tutto questo passa dal server.
import { el } from './dom.js';
import { rendiMarkdown } from './markdown.js';
import { formatoDataOra } from './data-ora.js';
import { codiceRiscontro, ORIGINE_SCHEDA } from './scheda-stampa.js';

const LARGHEZZA_BLOCCHI = 680;       // px: A4 meno i margini di 15 mm, a 96 dpi

let inCorso = null;                 // la stampa in corso, se c'è (una alla volta)

// `schede`: [{ nome, email, consegna, lavoro, traccia }] già in ordine. `verifica` ha titolo; `corso` è l'etichetta («Informatica (3AINF)»).
// `programma.foglio` viene da main.js. Restituisce quante schede ha preparato (0 se non c'era niente da stampare).
export async function stampaSchede({ schede, verifica, corso, programma, nomeDocumento, toast }) {
  if (inCorso) { toast('Una stampa è già in preparazione.', 'error'); return 0; }
  if (!programma || !programma.foglio) { toast('La stampa non è disponibile in questa versione.', 'error'); return 0; }
  if (schede.length === 0) { toast('Non ci sono consegne da stampare.', 'error'); return 0; }
  const area = el('div', { id: 'areaStampa', class: 'in-preparazione' });
  document.body.append(area);
  const fogli = [];
  const titoloPrima = document.title;
  const pulisci = () => {
    window.removeEventListener('afterprint', pulisci);
    fogli.forEach((f) => f.distruggi());
    area.remove();
    document.body.classList.remove('stampa-attiva');
    document.title = titoloPrima;
    inCorso = null;
  };
  inCorso = pulisci;
  try {
    if (schede.length > 3) toast(`Preparo ${schede.length} schede…`, 'success');
    const quando = formatoDataOra.format(new Date());
    for (const s of schede) {
      const host = el('div', { class: 'scheda-blocchi' });
      const codici = { pseudocode: el('pre', { class: 'scheda-codice' }), c: el('pre', { class: 'scheda-codice' }), python: el('pre', { class: 'scheda-codice' }) };
      const pagina = el('section', { class: 'scheda' },
        el('header', { class: 'scheda-testata' },
          el('h1', {}, verifica.titolo),
          el('p', { class: 'scheda-corso' }, corso),
          el('table', { class: 'scheda-dati' }, el('tbody', {},
            riga('Studente', `${s.nome || s.email} · ${s.email}`),
            riga('Consegna', `v${s.consegna.versione} · ${ORIGINE_SCHEDA[s.consegna.origine] ?? s.consegna.origine}`),
            s.consegna.creato ? riga('Registrata il', formatoDataOra.format(s.consegna.creato)) : '',
            s.lavoro && s.lavoro.scadenza ? riga('Scadenza personale', formatoDataOra.format(s.lavoro.scadenza)) : '',
            s.consegna.origine === 'file' && s.consegna.nomeFile ? riga('File', s.consegna.nomeFile) : ''))),
        s.traccia ? await sezioneTraccia(s.traccia) : '',
        el('h2', {}, 'Programma a blocchi'), host,
        el('h2', {}, 'Pseudocodice'), codici.pseudocode,
        el('h2', {}, 'C'), codici.c,
        el('h2', {}, 'Python'), codici.python,
        el('footer', { class: 'scheda-piede' },
          `Codice di riscontro: ${codiceRiscontro(s.consegna.programma)} · stampata il ${quando}`));
      area.append(pagina);
      // I blocchi si disegnano ora, con l'area ancora «in preparazione» (visibile ma fuori dallo schermo): il testo si misura solo con il layout.
      const foglio = programma.foglio({ blocchi: host, larghezza: LARGHEZZA_BLOCCHI });
      fogli.push(foglio);
      const testi = foglio.mostra(s.consegna.programma);
      if (testi) { codici.pseudocode.textContent = testi.pseudocode; codici.c.textContent = testi.c; codici.python.textContent = testi.python; }
      else { host.replaceChildren(el('p', {}, 'Programma non leggibile.')); for (const k of Object.keys(codici)) codici[k].textContent = '—'; }
    }
  } catch (err) {
    pulisci();
    toast((err && err.message) || 'Non riesco a preparare la stampa.', 'error');
    return 0;
  }
  area.classList.remove('in-preparazione');
  document.body.classList.add('stampa-attiva');
  document.title = nomeDocumento;
  window.addEventListener('afterprint', pulisci);
  setTimeout(() => { if (inCorso === pulisci) pulisci(); }, 10 * 60 * 1000);     // rete di sicurezza: se `afterprint` non arriva mai
  window.print();
  return schede.length;
}

function riga(etichetta, valore) {
  return el('tr', {}, el('th', { scope: 'row' }, etichetta), el('td', {}, valore));
}

async function sezioneTraccia(traccia) {
  let html = '';
  try { html = await rendiMarkdown(traccia.testoMd); } catch { html = ''; }
  const corpo = el('div', { class: 'traccia-md scheda-traccia-testo' });
  if (html) corpo.innerHTML = html;                          // output sicuro di markdown.js (niente script, link né immagini)
  else corpo.textContent = traccia.testoMd;
  return el('div', { class: 'scheda-traccia' }, el('h2', {}, `Traccia: ${traccia.titolo}`), corpo);
}
