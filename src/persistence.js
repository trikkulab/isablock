import { appConfig } from './app-config.js';

// Errore con un messaggio già pronto per lo studente, da distinguere da un
// file semplicemente corrotto (JSON non valido), che ha un messaggio generico.
export class FileFormatError extends Error {}

// Salvataggio/caricamento locale (nessun account, nessun server): il
// lavoro dello studente diventa un file .json scaricabile e ricaricabile,
// come richiesto dalla sezione "Persistenza" di docs/SPEC.md.
function serializeWorkspace(Blockly, workspace) {
  // formatVersion e appVersion stanno accanto alle chiavi di Blockly: load()
  // legge solo le chiavi dei propri serializzatori e ignora le altre.
  // appVersion è solo informativa (da quale app arriva il file): non si usa
  // mai per decidere se il file è leggibile, lo decide formatVersion.
  const state = {
    formatVersion: appConfig.fileFormatVersion,
    appVersion: appConfig.version,
    ...Blockly.serialization.workspaces.save(workspace),
  };
  return JSON.stringify(state, null, 2);
}

export function saveWorkspaceToFile(Blockly, workspace, filename = 'programma-a-blocchi.json') {
  const blob = new Blob([serializeWorkspace(Blockly, workspace)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Il selettore nativo "Salva con nome" esiste solo in alcuni browser
// (Chrome/Edge): dove manca, il chiamante ripiega su saveWorkspaceToFile.
export const hasNativeSavePicker = typeof window !== 'undefined' && 'showSaveFilePicker' in window;

// Restituisce true se il file è stato scritto, false se lo studente ha
// annullato la finestra (non è un errore).
export async function saveWorkspaceWithPicker(Blockly, workspace, suggestedName) {
  let handle;
  try {
    handle = await window.showSaveFilePicker({
      suggestedName,
      types: [{ description: 'Programma IsaBlock', accept: { 'application/json': ['.json'] } }],
    });
  } catch (err) {
    if (err.name === 'AbortError') return false;
    throw err;
  }
  const writable = await handle.createWritable();
  await writable.write(serializeWorkspace(Blockly, workspace));
  await writable.close();
  return true;
}

export function loadWorkspaceFromFile(Blockly, workspace, file) {
  return file.text().then((text) => {
    const state = JSON.parse(text);
    // I file salvati prima dell'introduzione della versione non hanno il campo:
    // sono il formato 1.
    const formatVersion = state.formatVersion ?? 1;
    // Controllo prima di workspace.clear(): un file non leggibile non deve
    // far perdere il lavoro in corso.
    if (formatVersion > appConfig.fileFormatVersion) {
      throw new FileFormatError('Il file è stato creato con una versione più recente di IsaBlock e non può essere aperto.');
    }
    // Fino al formato 4 gli array (allora chiamati vettori) salvavano la
    // dimensione in una mappa a parte (arraySizes), fuori dai blocchi:
    // rappresentazione sostituita dal blocco DICHIARA ARRAY, che la porta
    // come campo normale del blocco. Un file di quel formato che dichiara
    // almeno un array non è più compatibile: aperto senza questo controllo,
    // l'array esisterebbe come variabile ma senza alcuna dichiarazione, e
    // genererebbe C non compilabile in modo silenzioso. Un file dello
    // stesso formato ma senza array (es. solo booleani/testo) si apre
    // normalmente: il controllo guarda il contenuto, non solo il numero di
    // versione.
    if (formatVersion <= 4 && state.arraySizes && Object.keys(state.arraySizes).length > 0) {
      throw new FileFormatError(
        'Questo file usa i vettori nel formato precedente all\'introduzione del blocco "DICHIARA ARRAY" e non può essere aperto con questa versione di IsaBlock. Conserva una copia e riaprilo con IsaBlock 1.1.0, oppure ricrea gli array con il nuovo blocco.'
      );
    }
    workspace.clear();
    Blockly.serialization.workspaces.load(state, workspace);
  });
}
