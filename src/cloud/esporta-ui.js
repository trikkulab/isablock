// «Esporta JSON di tutti» (docente, a verifica chiusa): prepara i testi di ogni consegna valida, costruisce l'esportazione
// anonima (esporta-json.js) e fa scaricare due file: il JSON con i codici e il CSV con le corrispondenze codice → studente.
import { costruisciEsportazione } from './esporta-json.js';
import { nomiFileJson } from './scheda-stampa.js';
import { scarica } from './pdf-ui.js';

let inCorso = false;
const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

// `schede`: [{ nome, email, consegna, traccia }] (come per il PDF). `tracce`: le tracce della verifica [{ id, titolo, testoMd }].
// `parti`: { pseudocodice, c, python }. Restituisce quante consegne ha esportato (0 se nessuna).
export async function esportaJsonSchede({ schede, tracce, verifica, corso, programma, parti, toast }) {
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
    scarica(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }), nomi.json);
    await attesa(400);                                              // due download di fila: il browser li accetta meglio se distanziati
    scarica(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), nomi.csv);
    toast(`Esportate ${consegne.length} consegne: «${nomi.json}» e «${nomi.csv}» (quest'ultimo contiene i nomi).`, 'success');
    if (avvisi.length) {
      toast(`Attenzione: in ${avvisi.length} consegne il testo contiene un nome o un'email (codici ${avvisi.map((a) => a.codice).join(', ')}): il file non li ripulisce.`, 'error');
    }
    return consegne.length;
  } catch (err) {
    toast((err && err.message) || 'Non riesco a preparare l\'esportazione.', 'error');
    return 0;
  } finally {
    render?.distruggi();
    inCorso = false;
  }
}
