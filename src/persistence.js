import { appConfig } from './app-config.js';

// Errore con un messaggio già pronto per lo studente, da distinguere da un
// file semplicemente corrotto (JSON non valido), che ha un messaggio generico.
export class FileFormatError extends Error {}

// Salvataggio/caricamento locale (nessun account, nessun server): il
// lavoro dello studente diventa un file .json scaricabile e ricaricabile,
// come richiesto dalla sezione "Persistenza" di docs/SPEC.md.
export function serializeWorkspace(Blockly, workspace, space = 2) {
  // formatVersion e appVersion stanno accanto alle chiavi di Blockly: load()
  // legge solo le chiavi dei propri serializzatori e ignora le altre.
  // appVersion è solo informativa (da quale app arriva il file): non si usa
  // mai per decidere se il file è leggibile, lo decide formatVersion.
  const state = {
    formatVersion: appConfig.fileFormatVersion,
    appVersion: appConfig.version,
    ...Blockly.serialization.workspaces.save(workspace),
  };
  return JSON.stringify(state, null, space);
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

// Restituisce il nome del file scritto, false se lo studente ha annullato
// la finestra (non è un errore).
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
  return handle.name || true;
}

export function loadWorkspaceFromFile(Blockly, workspace, file) {
  return file.text().then((text) => loadWorkspaceState(Blockly, workspace, JSON.parse(text)));
}

// Un programma "vuoto" ha solo il blocco INIZIO/FINE, senza istruzioni.
export function isWorkspaceBlank(workspace) {
  return workspace.getAllBlocks(false).every((b) => b.type === 'program');
}

// Carica uno stato già letto da JSON nel workspace. È la strada unica per
// file e copia automatica locale: i controlli di versione e le migrazioni
// valgono quindi per entrambi.
export function loadWorkspaceState(Blockly, workspace, state) {
  // I file salvati prima dell'introduzione della versione non hanno il campo:
  // sono il formato 1.
  const formatVersion = state.formatVersion ?? 1;
  // Controllo prima di workspace.clear(): un file non leggibile non deve
  // far perdere il lavoro in corso.
  if (formatVersion > appConfig.fileFormatVersion) {
    throw new FileFormatError('Il file è stato creato con una versione più recente di IsaBlock e non può essere aperto.');
  }
  // Fino al formato 4 gli array (allora chiamati vettori) salvavano la
  // dimensione in una mappa a parte (arraySizes), fuori dai blocchi: la
  // rappresenta ora un blocco vero e proprio, DICHIARA ARRAY, con la
  // dimensione come suo campo SIZE. Il file vecchio contiene comunque
  // tutta l'informazione necessaria (quale variabile, quale dimensione):
  // si ricostruisce il blocco mancante invece di rifiutare il file (visto
  // che alcuni studenti avevano già lavori salvati con il vecchio
  // sistema). Un file dello stesso formato ma senza array (es. solo
  // booleani/testo) non ha niente da migrare: la funzione lo lascia
  // invariato.
  migrateOldArrayFormat(state);
  workspace.clear();
  Blockly.serialization.workspaces.load(state, workspace);
}

// Ricostruisce, per ogni array del vecchio formato, un blocco array_declare
// con la stessa variabile e la stessa dimensione, e lo inserisce in cima
// alla zona DECLARATIONS del blocco program (introdotta insieme al blocco
// DICHIARA: un file vecchio non l'ha mai avuta, quindi non c'è nulla da
// sovrascrivere). Se il file non usa array (arraySizes assente o vuoto) non
// fa nulla: la stessa funzione gestisce sia i file da migrare sia quelli
// che non ne hanno bisogno.
function migrateOldArrayFormat(state) {
  const arraySizes = state.arraySizes;
  if (!arraySizes || Object.keys(arraySizes).length === 0) return;
  const declareBlocks = Object.entries(arraySizes).map(([variableId, size]) => ({
    type: 'array_declare',
    id: `migrato_${variableId}`,
    fields: { VAR: { id: variableId }, SIZE: size },
  }));
  for (let i = 0; i < declareBlocks.length - 1; i++) {
    declareBlocks[i].next = { block: declareBlocks[i + 1] };
  }
  const programBlockState = state.blocks?.blocks?.find((b) => b.type === 'program');
  if (!programBlockState) return; // file corrotto/inatteso: niente su cui agganciarsi
  programBlockState.inputs = programBlockState.inputs || {};
  programBlockState.inputs.DECLARATIONS = { block: declareBlocks[0] };
}
