// Le etichette dei pulsanti e delle voci del cloud che la Guida nomina. L'interfaccia e la guida le leggono da qui:
// se un'etichetta cambia, cambia in tutti e due i posti. (Le etichette della verifica dello studente stanno già in
// testi-verifica.js, in `testiStudente`.)

export const menuCloud = Object.freeze({
  salva: 'Salva nel cloud',
  sketch: 'I miei sketch',
  corsi: 'Corsi',
  consegne: 'Le mie consegne',
  esci: 'Esci',
  guida: 'Guida del cloud',
});

export const sketchEtichette = Object.freeze({
  condividi: 'Condividi…',
  smettiDiCondividere: 'Smetti di condividere',
  apri: 'Apri',
});

export const corsiEtichette = Object.freeze({
  unisciti: 'Unisciti',
  nuovoCorso: 'Nuovo corso',
  gestisci: 'Gestisci',
  sketchCondivisi: 'Sketch condivisi',
  verifiche: 'Verifiche',
  apriIscrizioni: 'Apri le iscrizioni',
  chiudiIscrizioni: 'Chiudi le iscrizioni',
  archivia: 'Archivia il corso',
  riattiva: 'Riattiva il corso',
});

export const commentiEtichette = Object.freeze({
  pannello: 'Commenti',
  aggiungi: 'Aggiungi commento',
  interoSketch: 'Sull\'intero sketch',
});

// Il docente, nella verifica
export const verificaDocenteEtichette = Object.freeze({
  nuova: 'Nuova verifica',
  creaInBozza: 'Crea in bozza',
  nuovaTraccia: '+ Nuova traccia',
  pubblicaModifica: 'Pubblica modifica',
  assegnazioni: 'Assegnazioni individuali (traccia e tempo)',
  applica: 'Applica ai selezionati',
  elimina: 'Elimina verifica',
  avvia: 'Avvia verifica…',
  termina: 'Termina verifica…',
  aggiungiIscritti: 'Aggiungi',
  raccogli: 'Raccogli i lavori',
  riapri: 'Riapri…',
  archivia: 'Archivia…',
  ripristina: 'Ripristina',
  situazione: 'Situazione',
  guarda: 'Guarda',
  sala: 'Sala',
  storia: 'Storia…',
  scaricaPdf: 'Scarica PDF',
  scaricaPdfTutti: 'Scarica PDF di tutti',
  partiPdfTitolo: 'Cosa vuoi nel PDF?',
  esportaJsonTutti: 'Esporta JSON di tutti',
  apriCopiaProva: 'Apri una copia per provarla',
  partiJsonTitolo: 'Cosa vuoi nel JSON?',
  caricaFile: 'Carica file…',
  riapriStudente: 'Riapri',
  mostraArchiviate: 'Mostra anche le verifiche archiviate',
  stella: '★',
});

// Lo studente, dopo la verifica
export const consegneEtichette = Object.freeze({
  guarda: 'Guarda',
  apriNellEditor: 'Apri nell\'editor',
  salvaSuFile: 'Salva su file',
});
