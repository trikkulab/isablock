// Valori dell'applicazione (non dello pseudocodice: quelli stanno in
// pseudocode-config.js). Congelato per evitare modifiche accidentali a runtime.
export const appConfig = Object.freeze({
  // Versione dell'applicazione mostrata nel piè di pagina e scritta nei file
  // salvati come sola informazione di provenienza.
  version: '1.8.1',

  // Versione del formato dei file salvati (vedi persistence.js). Va aumentata
  // solo quando un cambio di formato rende illeggibili i file vecchi per il
  // codice nuovo (o viceversa), non a ogni rilascio dell'app.
  fileFormatVersion: 6,

  // Per quanto tempo si conserva la copia automatica locale (vedi
  // local-backup.js). Con un numero, oltre quel limite la copia viene
  // cancellata all'apertura senza chiedere nulla (utile sui PC condivisi, dove
  // il lavoro di ieri di un altro non deve riapparire). Con null la copia non
  // scade mai: resta finché non si cancella ("Nuovo", "Cancella copia" o
  // rifiuto del ripristino). Scelta organizzativa: si cambia qui.
  autosaveMaxAgeHours: null,

  // Strato cloud OPZIONALE (accesso con l'account della scuola; vedi
  // docs/CLOUD.md). Con enabled: false l'app è identica a prima: non compare
  // il pulsante "Accedi" e non si carica nulla da src/cloud/ né da
  // vendor/firebase/.
  cloud: Object.freeze({ enabled: false }),
});
