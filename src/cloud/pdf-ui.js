// Scarica la scheda di consegna in PDF (docente, a verifica chiusa): prepara i dati di ogni scheda (blocchi disegnati,
// tre codici, traccia), li impagina con pdf-scheda.js e fa scaricare il file. Tutto nel browser: jsPDF (vendor/pdf) si
// carica solo alla prima generazione e funziona anche offline.
import { tokenizzaMarkdown } from './markdown.js';
import { convertiMarkdown, testoSemplice } from './pdf-markdown.js';
import { codiceRiscontro, nomeVisualizzato, dataLunga } from './scheda-stampa.js';
import { el } from './dom.js';

let inCorso = false;

async function traccia(t) {
  if (!t) return null;
  let blocchi;
  try { blocchi = convertiMarkdown(await tokenizzaMarkdown(t.testoMd)).blocchi; } catch { blocchi = testoSemplice(t.testoMd).blocchi; }
  return { titolo: t.titolo, blocchi };
}

function scarica(blob, nomeFile) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: nomeFile, hidden: '' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// `schede`: [{ nome, email, consegna, traccia }] già in ordine (vedi ordinaSchede). `verifica`: { titolo }. `corso`: { nome, classe }.
// `programma.renderBlocchi()` viene da main.js. Restituisce quante schede ha messo nel PDF (0 se non ne ha fatto nessuna).
export async function scaricaPdfSchede({ schede, verifica, corso, programma, nomeFile, toast }) {
  if (inCorso) { toast('Un PDF è già in preparazione.', 'error'); return 0; }
  if (!programma || !programma.renderBlocchi) { toast('Il PDF non è disponibile in questa versione.', 'error'); return 0; }
  if (schede.length === 0) { toast('Non ci sono consegne da scaricare.', 'error'); return 0; }
  inCorso = true;
  let render = null;
  try {
    toast(schede.length > 1 ? `Preparo il PDF di ${schede.length} consegne…` : 'Preparo il PDF…', 'success');
    const { jsPDF } = await import('../../vendor/pdf/jspdf.js');
    const { creaPdfSchede } = await import('./pdf-scheda.js');
    render = await programma.renderBlocchi();
    const pronte = [];
    for (const s of schede) {
      const r = await render.rendi(s.consegna.programma);
      pronte.push({
        titolo: verifica.titolo, corso: corso.nome, classe: corso.classe ?? '',
        data: s.consegna.creato ? dataLunga(s.consegna.creato) : '',
        studente: nomeVisualizzato(s.nome, s.email), riscontro: codiceRiscontro(s.consegna.programma),
        traccia: await traccia(s.traccia),
        blocchi: r ? r.immagine : null, testi: r ? r.testi : null,
      });
    }
    const doc = creaPdfSchede({ jsPDF, schede: pronte });
    scarica(new Blob([doc.output('arraybuffer')], { type: 'application/pdf' }), nomeFile);
    return pronte.length;
  } catch (err) {
    toast((err && err.message) || 'Non riesco a preparare il PDF.', 'error');
    return 0;
  } finally {
    render?.distruggi();
    inCorso = false;
  }
}
