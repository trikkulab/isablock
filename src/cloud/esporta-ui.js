// «Esporta JSON di tutti» (docente, a verifica chiusa): prepara i testi di ogni consegna valida, costruisce l'esportazione
// anonima (esporta-json.js) e apre una finestra con DUE pulsanti, uno per il JSON con i codici e uno per il CSV con le
// corrispondenze codice → studente. Due download avviati dal codice uno dietro l'altro vengono bloccati o rifiutati dai
// browser (che li permettono solo dopo un clic): ogni file parte quindi da un clic.
import { el } from './dom.js';
import { costruisciEsportazione } from './esporta-json.js';
import { nomiFileJson } from './scheda-stampa.js';
import { scarica } from './pdf-ui.js';

let inCorso = false;

// `apri(titolo, onChiudi, opzioni)`: apre una finestra (quella di verifiche-ui). `schede`: [{ nome, email, consegna, traccia }] come per
// il PDF. `tracce`: le tracce della verifica [{ id, titolo, testoMd }]. `parti`: { pseudocodice, c, python }.
// Restituisce quante consegne ha preparato (0 se nessuna).
export async function esportaJsonSchede({ apri, schede, tracce, verifica, corso, programma, parti, toast }) {
  if (inCorso) { toast('Un\'esportazione è già in preparazione.', 'error'); return 0; }
  if (!programma || !programma.renderBlocchi) { toast('L\'esportazione non è disponibile in questa versione.', 'error'); return 0; }
  if (schede.length === 0) { toast('Non ci sono consegne da esportare.', 'error'); return 0; }
  inCorso = true;
  let render = null;
  try {
    toast(`Preparo l'esportazione di ${schede.length} consegne…`, 'success');
    render = await programma.renderBlocchi();
    const consegne = [];
    for (const s of schede) {
      const r = await render.rendi(s.consegna.programma, { senzaImmagine: true });
      consegne.push({ email: s.email, nome: s.nome, versione: s.consegna.versione, tracciaId: s.consegna.tracciaId ?? null, programma: s.consegna.programma, testi: r ? r.testi : null });
    }
    const { json, csv, avvisi } = costruisciEsportazione({ titolo: verifica.titolo, tracce, consegne, parti });
    const nomi = nomiFileJson({ classe: corso.classe, titolo: verifica.titolo });
    finestraPronta({ apri, nomi, n: consegne.length, avvisi, blobJson: new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }), blobCsv: new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }) });
    return consegne.length;
  } catch (err) {
    toast((err && err.message) || 'Non riesco a preparare l\'esportazione.', 'error');
    return 0;
  } finally {
    render?.distruggi();
    inCorso = false;
  }
}

function finestraPronta({ apri, nomi, n, avvisi, blobJson, blobCsv }) {
  const f = apri('Esportazione pronta');
  const pulsante = (testo, nome, blob, classe) => {
    const b = el('button', { type: 'button', class: classe }, testo);
    b.addEventListener('click', () => { scarica(blob, nome); b.textContent = `✔ ${testo}`; });
    return b;
  };
  f.corpo.append(
    el('p', {}, `${n} consegne pronte. Scarica i due file, uno alla volta:`),
    el('p', {}, pulsante('Scarica il JSON dei programmi', nomi.json, blobJson, 'modal-btn')),
    el('p', { class: 'sketch-nota' }, `${nomi.json}: senza nomi né email, solo un codice per consegna. È il file da usare.`),
    el('p', {}, pulsante('Scarica le corrispondenze', nomi.csv, blobCsv, 'modal-btn secondary')),
    el('p', { class: 'sketch-nota' }, `${nomi.csv}: lega ogni codice allo studente. Contiene i nomi: tienilo per te.`),
    avvisi.length
      ? el('p', { class: 'verifica-avviso', role: 'note' }, `Da controllare: in ${avvisi.length === 1 ? '1 consegna' : `${avvisi.length} consegne`} il testo contiene parole del nome o dell'email dello studente (${avvisi.map((a) => `${a.codice}: ${a.parole.join(', ')}`).join(' · ')}). L'esportazione non le ripulisce.`)
      : '',
    el('div', { class: 'modal-actions' }, el('button', { type: 'button', class: 'modal-btn secondary', onclick: () => f.chiudi() }, 'Chiudi')));
}
