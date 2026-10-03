import { registerBlocks } from './blocks/blocks.js';
import { toolbox } from './blocks/toolbox.js';
import { createPseudocodeGenerator } from './codegen/pseudocode.js';
import { createCGenerator } from './codegen/c.js';
import { createPythonGenerator } from './codegen/python.js';
import { extractSourceMap } from './codegen/common.js';
import { tokenizePseudocode, tokenizeC, tokenizePython } from './codegen/highlight.js';
import { pseudocodeConfig } from './pseudocode-config.js';
import { appConfig } from './app-config.js';
import { changelog, compareVersions } from './changelog.js';
import { saveWorkspaceToFile, saveWorkspaceWithPicker, hasNativeSavePicker, loadWorkspaceFromFile, FileFormatError } from './persistence.js';
import { examples } from './examples.js';
import { runProgram, ExecutionError } from './runtime/interpreter.js';
import { updateEditorWarnings } from './blocks/editor-checks.js';

const Blockly = window.Blockly;

registerBlocks(Blockly);

const workspace = Blockly.inject('blocklyDiv', {
  toolbox,
  trashcan: true,
  zoom: { controls: true, wheel: true, startScale: 1 },
  move: { scrollbars: true, drag: true, wheel: false },
});

const pseudocodeGen = createPseudocodeGenerator(Blockly, pseudocodeConfig);
const cGen = createCGenerator(Blockly, pseudocodeConfig);
const pythonGen = createPythonGenerator(Blockly, pseudocodeConfig);

// Attiva la source map blocco->testo (vedi src/codegen/common.js): serve a
// evidenziare la riga corrispondente al blocco in esecuzione, senza mai
// eseguire il testo generato.
pseudocodeGen.sourceMap = true;
cGen.sourceMap = true;
pythonGen.sourceMap = true;

const outputPseudocode = document.getElementById('outputPseudocode');
const outputC = document.getElementById('outputC');
const outputPython = document.getElementById('outputPython');

// Testo pulito e mappa blockId -> {start, end} per ciascun output,
// ricalcolati ad ogni modifica del workspace; usati sia per la
// visualizzazione normale sia per l'evidenziazione durante l'esecuzione.
let outputTexts = { pseudocode: '', c: '', python: '' };
let sourceMaps = { pseudocode: new Map(), c: new Map(), python: new Map() };

// Token di colorazione sintattica per ciascun output, ricalcolati insieme
// al testo (vedi updateOutputs): array di {start, end, type} nello stesso
// sistema di offset della source map, cosi' i due si possono fondere in
// renderCodePanel senza doversi rincorrere.
let tokenMaps = { pseudocode: [], c: [], python: [] };

// blockId attualmente in esecuzione (null quando non si sta eseguendo):
// e' lo stato condiviso che lega l'evidenziazione dei blocchi Blockly a
// quella dei tre pannelli di codice, indipendentemente da quale scheda e'
// aperta in un dato momento.
let currentBlockId = null;

// blockId del blocco selezionato nell'editor (null se nessuno): evidenzia
// nei pannelli il costrutto corrispondente, con uno stile piu' tenue di
// quello dell'esecuzione, che ha comunque la precedenza.
let selectedBlockId = null;

function escapeHtml(text) {
  return text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// Restituisce l'HTML di text.slice(from, to), con gli span di colorazione
// sintattica applicati (ritagliati sul segmento se un token ne straborda).
// Usata sia per il testo "a riposo" sia per le due meta' del pannello in
// esecuzione, ai due lati del <mark> — vedi renderCodePanel.
function renderSegment(text, tokens, from, to) {
  let html = '';
  let pos = from;
  for (const token of tokens) {
    const start = Math.max(token.start, from);
    const end = Math.min(token.end, to);
    if (start >= end) continue;
    if (start > pos) html += escapeHtml(text.slice(pos, start));
    html += `<span class="tok-${token.type}">${escapeHtml(text.slice(start, end))}</span>`;
    pos = end;
  }
  if (pos < to) html += escapeHtml(text.slice(pos, to));
  return html;
}

function renderCodePanel(el, text, tokens, range, className = 'exec-highlight') {
  if (!range) {
    el.innerHTML = renderSegment(text, tokens, 0, text.length);
    return;
  }
  el.innerHTML =
    renderSegment(text, tokens, 0, range.start) +
    `<mark class="${className}">${renderSegment(text, tokens, range.start, range.end)}</mark>` +
    renderSegment(text, tokens, range.end, text.length);
  // Solo per l'esecuzione: con la selezione il codice non deve "saltare"
  // sotto il dito di chi sta cliccando proprio su quel codice.
  if (className === 'exec-highlight') {
    el.querySelector('.exec-highlight').scrollIntoView({ block: 'nearest' });
  }
}

function renderAllPanels() {
  // L'esecuzione ha la precedenza sulla selezione.
  const blockId = currentBlockId || selectedBlockId;
  const className = currentBlockId ? 'exec-highlight' : 'select-highlight';
  renderCodePanel(outputPseudocode, outputTexts.pseudocode, tokenMaps.pseudocode, blockId && sourceMaps.pseudocode.get(blockId), className);
  renderCodePanel(outputC, outputTexts.c, tokenMaps.c, blockId && sourceMaps.c.get(blockId), className);
  renderCodePanel(outputPython, outputTexts.python, tokenMaps.python, blockId && sourceMaps.python.get(blockId), className);
}

// --- Selezione blocco <-> codice -----------------------------------------
// Blocco -> codice: la selezione nell'editor evidenzia nei tre pannelli
// l'intero costrutto (per un SE o un ciclo, anche il corpo).
// Codice -> blocco: un clic seleziona il blocco piu' interno il cui
// intervallo contiene il punto cliccato (per FINE SE o "}" e' il
// contenitore stesso, perche' nessun figlio le contiene).
function selectBlockFromCode(sourceMap, offset) {
  let best = null;
  let bestLength = Infinity;
  for (const [id, range] of sourceMap) {
    const length = range.end - range.start;
    if (range.start <= offset && offset <= range.end && length < bestLength) {
      const block = workspace.getBlockById(id);
      // Il contenitore INIZIO/FINE non si seleziona dal codice: copre
      // quasi tutto il testo e non aggiunge informazione (avrebbe senso
      // solo con le funzioni).
      if (block && block.type !== 'program') {
        best = id;
        bestLength = length;
      }
    }
  }
  if (!best) return false;
  Blockly.getFocusManager().focusNode(workspace.getBlockById(best));
  scrollBlockIntoViewIfNeeded(best);
  return true;
}

// Clic "nel vuoto" (oltre la fine di una riga, sotto il codice, su INIZIO/
// FINE): non seleziona nulla e toglie la selezione corrente.
function clearBlockSelection() {
  selectedBlockId = null;
  Blockly.getFocusManager().focusNode(workspace);
  renderAllPanels();
}

// Offset (nel testo del pannello) del punto cliccato, dalle coordinate del
// mouse: non dipende dalla selezione di testo del browser, che con una
// minima oscillazione o un doppio clic non e' piu' un semplice cursore.
// Tolleranza verticale: l'interlinea (line-height) lascia qualche pixel
// tra i rettangoli dei caratteri di due righe, che comunque appartengono
// alla riga.
const LINE_GAP_PX = 4;

function textOffsetAtPoint(el, x, y) {
  let node = null;
  let offset = 0;
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    if (pos) ({ offsetNode: node, offset } = pos);
  } else if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    if (r) ({ startContainer: node, startOffset: offset } = r);
  }
  if (!node || !el.contains(node)) return null;
  // Il browser porta il cursore al carattere piu' vicino anche cliccando
  // lontano dal testo: vale come clic sul codice solo se il punto cade
  // davvero sopra uno dei due caratteri accanto al cursore.
  if (node.nodeType !== Node.TEXT_NODE) return null;
  const len = node.length;
  const spans = [[offset, offset + 1], [offset - 1, offset]];
  const hit = spans.some(([from, to]) => {
    if (from < 0 || to > len) return false;
    const charRange = document.createRange();
    charRange.setStart(node, from);
    charRange.setEnd(node, to);
    return [...charRange.getClientRects()].some(
      (r) => r.width > 0 && x >= r.left && x <= r.right && y >= r.top - LINE_GAP_PX && y <= r.bottom + LINE_GAP_PX
    );
  });
  if (!hit) return null;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.setEnd(node, offset);
  return range.toString().length;
}

// Vero mentre il mouse e' premuto su un pannello di codice: premere li'
// toglie il focus a Blockly, che deseleziona il blocco; ridisegnare i
// pannelli in quel momento cancellerebbe la selezione di testo in corso
// (impossibile copiare a mano), quindi la deselezione si ignora.
let codePointerDown = false;
window.addEventListener('mouseup', () => {
  setTimeout(() => { codePointerDown = false; }, 0);
});

function wireCodeClick(el, mapKey) {
  let downX = 0;
  let downY = 0;
  el.addEventListener('mousedown', (event) => {
    downX = event.clientX;
    downY = event.clientY;
    codePointerDown = true;
  });
  el.addEventListener('click', (event) => {
    if (execGenerator !== null) return; // durante l'esecuzione l'editor e' bloccato
    // Un trascinamento serve a copiare il testo, non a selezionare blocchi.
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > 5) return;
    const offset = textOffsetAtPoint(el, event.clientX, event.clientY);
    if (offset === null || !selectBlockFromCode(sourceMaps[mapKey], offset)) clearBlockSelection();
  });
}

function updateOutputs() {
  const pseudo = extractSourceMap(pseudocodeGen.workspaceToCode(workspace));
  const c = extractSourceMap(cGen.workspaceToCode(workspace));
  const python = extractSourceMap(pythonGen.workspaceToCode(workspace));
  outputTexts = { pseudocode: pseudo.text, c: c.text, python: python.text };
  sourceMaps = { pseudocode: pseudo.ranges, c: c.ranges, python: python.ranges };
  tokenMaps = {
    pseudocode: tokenizePseudocode(pseudo.text, pseudocodeConfig),
    c: tokenizeC(c.text),
    python: tokenizePython(python.text),
  };
  renderAllPanels();
}

// Il blocco "program" e' il contenitore fisso (INIZIO/FINE) richiesto
// dalla specifica: ne esiste sempre esattamente una copia, non spostabile
// ne' cancellabile, e non compare nella tavolozza cosi' lo studente non
// puo' crearne altre copie. I flag deletable/movable non sopravvivono
// alla serializzazione, quindi vanno riapplicati dopo ogni caricamento.
function enforceProgramBlock() {
  const programBlocks = workspace.getTopBlocks(false).filter((b) => b.type === 'program');
  if (programBlocks.length === 0) {
    const block = workspace.newBlock('program');
    block.initSvg();
    block.render();
    block.moveBy(40, 40);
    programBlocks.push(block);
  }
  for (const block of programBlocks) {
    block.setDeletable(false);
    block.setMovable(false);
    block.contextMenu = false;
  }
}

let debounceTimer = null;
function scheduleUpdate() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    updateOutputs();
    updateEditorWarnings(Blockly, workspace);
  }, 250);
}

workspace.addChangeListener((event) => {
  if (event.type === Blockly.Events.SELECTED && !(codePointerDown && !event.newElementId)) {
    const selected = event.newElementId && workspace.getBlockById(event.newElementId);
    // Il blocco program (INIZIO/FINE) non si evidenzia: vedi selectBlockFromCode.
    selectedBlockId = selected && selected.type !== 'program' ? event.newElementId : null;
    renderAllPanels();
  }
  if (event.isUiEvent) return;
  scheduleUpdate();
});

enforceProgramBlock();
updateOutputs();
updateEditorWarnings(Blockly, workspace);
wireCodeClick(outputPseudocode, 'pseudocode');
wireCodeClick(outputC, 'c');
wireCodeClick(outputPython, 'python');

// --- Notifica toast ------------------------------------------------------
const toast = document.getElementById('toast');
let toastTimer = null;
function showToast(message, type = 'info') {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

// --- Modale di benvenuto (solo al primo utilizzo) -------------------------
const welcomeModal = document.getElementById('welcomeModal');
const WELCOME_SEEN_KEY = 'isablock-welcome-seen';
try {
  if (!window.localStorage.getItem(WELCOME_SEEN_KEY)) {
    welcomeModal.hidden = false;
  }
} catch {
  // Storage non disponibile (es. navigazione privata): non e' grave,
  // semplicemente la modale potrebbe ricomparire ad ogni visita.
}
document.getElementById('welcomeAcceptBtn').addEventListener('click', () => {
  welcomeModal.hidden = true;
  try {
    window.localStorage.setItem(WELCOME_SEEN_KEY, '1');
  } catch {
    // vedi sopra
  }
});

// --- Guida rapida (riapribile in qualsiasi momento, a differenza della
// modale di benvenuto che compare solo al primo utilizzo) --------------
const helpModal = document.getElementById('helpModal');
function openHelp() {
  helpModal.hidden = false;
}
function closeHelp() {
  helpModal.hidden = true;
}
document.getElementById('btnHelp').addEventListener('click', openHelp);
document.getElementById('helpCloseBtn').addEventListener('click', closeHelp);
document.getElementById('helpCloseBtn2').addEventListener('click', closeHelp);
helpModal.addEventListener('click', (event) => {
  if (event.target === helpModal) closeHelp();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !helpModal.hidden) closeHelp();
});

// --- Novità --------------------------------------------------------------
// Finestra a pagine, una per versione, dalla piu' recente. Si apre da sola
// una volta per ogni nuova versione (si ricorda in localStorage l'ultima
// vista) e si puo' riaprire a mano dal pulsante "Novita'".
const newsModal = document.getElementById('newsModal');
const NEWS_SEEN_KEY = 'isablock-last-seen-version';
const newsNewer = document.getElementById('newsNewer');
const newsOlder = document.getElementById('newsOlder');
let newsIndex = 0;
let newsLastSeen = null; // versione vista l'ultima volta (null se mai/ignota)

function renderNewsPage() {
  const entry = changelog[newsIndex];
  document.getElementById('newsVersion').textContent = `Versione ${entry.version} — ${entry.date}`;
  document.getElementById('newsTitle').textContent = entry.title;
  const list = document.getElementById('newsItems');
  list.replaceChildren(...entry.items.map((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }));
  document.getElementById('newsBadge').hidden = !isUnseenNews(entry);
  document.getElementById('newsDots').replaceChildren(...changelog.map((_, i) => {
    const dot = document.createElement('span');
    dot.className = i === newsIndex ? 'news-dot current' : 'news-dot';
    return dot;
  }));
  newsNewer.disabled = newsIndex === 0;
  newsOlder.disabled = newsIndex === changelog.length - 1;
}

// "Nuova" = piu' recente dell'ultima versione vista. Se non c'e' memoria
// di una versione vista (utente che aveva gia' usato lo strumento prima
// delle novita'), si considera nuova solo la piu' recente.
function isUnseenNews(entry) {
  if (newsLastSeen === null) return entry === changelog[0];
  return compareVersions(entry.version, newsLastSeen) > 0;
}

function openNews() {
  newsIndex = 0;
  renderNewsPage();
  newsModal.hidden = false;
}
function closeNews() {
  newsModal.hidden = true;
  try {
    window.localStorage.setItem(NEWS_SEEN_KEY, appConfig.version);
  } catch {
    // Storage non disponibile: la finestra non si riapre da sola, resta
    // il pulsante.
  }
  newsLastSeen = appConfig.version;
}
function showNewsPage(delta) {
  const next = newsIndex + delta;
  if (next < 0 || next >= changelog.length) return;
  newsIndex = next;
  renderNewsPage();
}
document.getElementById('btnNews').addEventListener('click', openNews);
document.getElementById('newsCloseBtn').addEventListener('click', closeNews);
document.getElementById('newsCloseBtn2').addEventListener('click', closeNews);
newsNewer.addEventListener('click', () => showNewsPage(-1));
newsOlder.addEventListener('click', () => showNewsPage(1));
newsModal.addEventListener('click', (event) => {
  if (event.target === newsModal) closeNews();
});
document.addEventListener('keydown', (event) => {
  if (newsModal.hidden) return;
  if (event.key === 'Escape') closeNews();
  else if (event.key === 'ArrowLeft') showNewsPage(-1);
  else if (event.key === 'ArrowRight') showNewsPage(1);
});

// All'avvio: chi usa lo strumento per la prima volta vede solo il benvenuto
// (e parte gia' "aggiornato"); gli altri vedono le novita' se la versione e'
// cambiata, a meno che la voce sia marcata silent. Con lo storage non
// disponibile non si apre mai da sole: meglio niente che ad ogni visita.
try {
  const stored = window.localStorage.getItem(NEWS_SEEN_KEY);
  newsLastSeen = stored;
  if (!welcomeModal.hidden) {
    window.localStorage.setItem(NEWS_SEEN_KEY, appConfig.version);
    newsLastSeen = appConfig.version;
  } else if (stored !== appConfig.version) {
    const hasLoudNews = changelog.some((e) => !e.silent && isUnseenNews(e));
    if (hasLoudNews) openNews();
    else window.localStorage.setItem(NEWS_SEEN_KEY, appConfig.version);
  }
} catch {
  // vedi sopra
}

// La versione ha una sola fonte (app-config.js): il piè di pagina la legge da lì.
document.getElementById('appVersion').textContent = appConfig.version;

// --- Barra dei comandi ------------------------------------------------
document.getElementById('btnNew').addEventListener('click', () => {
  if (!window.confirm('Cancellare il programma corrente e ricominciare da zero?')) return;
  workspace.clear();
  enforceProgramBlock();
  updateOutputs();
  resetRunStrip();
  showToast('Nuovo programma creato', 'success');
});

// Nome proposto per il file: lo stesso per selettore nativo e per il ripiego.
const DEFAULT_FILE_NAME = 'programma-a-blocchi';

function saveWithPrompt() {
  // prompt() funziona in tutti i browser: è il ripiego dove manca il
  // selettore nativo, ed è coerente con i confirm() degli altri comandi.
  const answer = window.prompt('Con che nome vuoi salvare il programma?', DEFAULT_FILE_NAME);
  if (answer === null) return; // Annulla: nessun salvataggio
  // Via i caratteri non ammessi nei nomi di file e l'eventuale .json già digitato.
  const name = answer.trim().replace(/\.json$/i, '').replace(/[\\/:*?"<>|]/g, '-');
  saveWorkspaceToFile(Blockly, workspace, `${name || DEFAULT_FILE_NAME}.json`);
  showToast('Programma salvato', 'success');
}

document.getElementById('btnSave').addEventListener('click', async () => {
  if (hasNativeSavePicker) {
    try {
      const saved = await saveWorkspaceWithPicker(Blockly, workspace, `${DEFAULT_FILE_NAME}.json`);
      if (saved) showToast('Programma salvato', 'success');
      return;
    } catch {
      // Selettore non utilizzabile (es. contesto non sicuro): ripiego sul nome.
    }
  }
  saveWithPrompt();
});

const fileInput = document.getElementById('fileInput');
document.getElementById('btnLoad').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  loadWorkspaceFromFile(Blockly, workspace, file)
    .then(() => {
      enforceProgramBlock();
      updateOutputs();
      resetRunStrip();
      showToast('Programma caricato', 'success');
    })
    .catch((err) => {
      showToast(err instanceof FileFormatError ? err.message : 'Il file scelto non è un programma valido', 'error');
    });
});

// --- Tab di output e pulsanti "Copia" ----------------------------------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.code-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    document.querySelector(`.code-panel[data-tab="${btn.dataset.tab}"]`).classList.add('active');
  });
});

document.querySelectorAll('.copy-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const text = document.getElementById(btn.dataset.copyTarget).textContent;
    navigator.clipboard.writeText(text).then(() => {
      const original = btn.textContent;
      btn.textContent = 'Copiato!';
      setTimeout(() => {
        btn.textContent = original;
      }, 1200);
    });
  });
});

const exampleSelect = document.getElementById('exampleSelect');
for (const example of examples) {
  const option = document.createElement('option');
  option.value = example.id;
  option.textContent = example.title;
  exampleSelect.appendChild(option);
}
exampleSelect.addEventListener('change', () => {
  const example = examples.find((e) => e.id === exampleSelect.value);
  exampleSelect.value = '';
  if (!example) return;
  if (!window.confirm(`Caricare l’esempio "${example.title}"? Il programma corrente andrà perso.`)) return;
  workspace.clear();
  Blockly.serialization.workspaces.load(example.workspaceState, workspace);
  enforceProgramBlock();
  updateOutputs();
  resetRunStrip();
  showToast(`Esempio "${example.title}" caricato`, 'success');
});

// --- Esecuzione a blocchi -------------------------------------------------
// L'unico "motore" che gira davvero e' l'interprete (src/runtime/interpreter.js),
// che cammina l'albero di blocchi. I tre pannelli di codice non vengono mai
// eseguiti: si limitano a evidenziare, tramite la source map, la porzione di
// testo che corrisponde al blockId corrente - lo stesso stato condiviso da
// cui dipende anche l'evidenziazione del blocco nel canvas Blockly.
const btnRun = document.getElementById('btnRun');
const btnStep = document.getElementById('btnStep');
const btnStop = document.getElementById('btnStop');
const execStatus = document.getElementById('execStatus');
const blocklyDiv = document.getElementById('blocklyDiv');
const runStrip = document.getElementById('runStrip');
const runSplitter = document.getElementById('runSplitter');
const runStripClose = document.getElementById('runStripClose');
const runConsole = document.getElementById('runConsole');
const runInputForm = document.getElementById('runInputForm');
const runInputField = document.getElementById('runInputField');
const execSpeedSelect = document.getElementById('execSpeed');
const runVars = document.getElementById('runVars');

let runStepDelayMs = Number(execSpeedSelect.value);
execSpeedSelect.addEventListener('change', () => {
  runStepDelayMs = Number(execSpeedSelect.value);
});

let execGenerator = null;
let execIo = null; // l'oggetto io passato all'interprete (vedi runProgram): contiene io.vars
let execRunning = false; // true = esecuzione continua ("Esegui"), false = passo singolo o in pausa
let execTimer = null;
let resumeRunningAfterInput = false; // execRunning da ripristinare dopo un LEGGI in attesa
let awaitingInput = false; // in attesa di un valore per un blocco LEGGI

function appendConsoleLine(text, className) {
  const line = document.createElement('div');
  line.className = className ? `run-line ${className}` : 'run-line';
  line.textContent = text;
  runConsole.appendChild(line);
  runConsole.scrollTop = runConsole.scrollHeight;
}

function setWorkspaceLocked(locked) {
  blocklyDiv.classList.toggle('exec-locked', locked);
  document.getElementById('btnNew').disabled = locked;
  document.getElementById('btnLoad').disabled = locked;
  exampleSelect.disabled = locked;
}

function updateExecButtons() {
  const active = execGenerator !== null;
  btnStop.disabled = !active;
  // In esecuzione continua, o mentre si aspetta un valore da LEGGI, i due
  // comandi "manuali" restano disabilitati: durante l'attesa di un LEGGI
  // l'unico modo per proseguire e' fornire il valore (altrimenti
  // generator.next() riprenderebbe con un valore mancante).
  btnRun.disabled = active && (execRunning || awaitingInput);
  btnStep.disabled = active && (execRunning || awaitingInput);
  // Il pannello si chiude solo a esecuzione ferma (terminata/interrotta):
  // mentre gira, specialmente in attesa di un LEGGI, non ha senso poterlo
  // nascondere.
  runStripClose.disabled = active;
}

function stopExecution(statusText) {
  clearTimeout(execTimer);
  execGenerator = null;
  execRunning = false;
  awaitingInput = false;
  currentBlockId = null;
  workspace.highlightBlock(null);
  renderAllPanels();
  runInputForm.hidden = true;
  setWorkspaceLocked(false);
  execStatus.textContent = statusText || 'Pronto';
  updateExecButtons();
}

// Stessa convenzione "vero"/"falso" scelta per SCRIVI in C e Python (vedi
// src/codegen/c.js e src/codegen/python.js): un booleano JS si stamperebbe
// altrimenti come "true"/"false", disallineando la console di esecuzione dai
// due pannelli di codice che mostrano lo stesso identico programma.
function formatOutputValue(value) {
  if (typeof value === 'boolean') return value ? 'vero' : 'falso';
  return String(value);
}

// --- Pannello Variabili --------------------------------------------------
// Mostra i valori della mappa io.vars dell'interprete dopo ogni passo. Il
// blocco evidenziato e' quello appena eseguito (vedi l'intestazione di
// src/runtime/interpreter.js), quindi in ambra c'e' proprio cio' che ha
// cambiato il blocco illuminato: mai l'effetto di un blocco precedente.
// Solo lettura: il pannello non scrive mai nella mappa dell'interprete.

// Copia dei valori al passo precedente, per capire cosa e' cambiato. Gli
// array vanno copiati, perche' l'interprete li modifica sul posto.
let prevVarsSnapshot = new Map();

function snapshotVars(vars) {
  const snapshot = new Map();
  for (const [id, value] of vars) {
    snapshot.set(id, Array.isArray(value) ? value.slice() : value);
  }
  return snapshot;
}

// Le stesse variabili che il generatore C dichiara (quelle usate da almeno
// un blocco), nell'ordine in cui compaiono, con gli array in fondo: sono le
// righe piu' alte e disturbano meno lì. L'elenco e' completo fin dal primo
// passo, cosi' le righe non si spostano durante l'esecuzione.
function variablesForPanel() {
  const seen = new Set();
  const variables = Blockly.Variables.allUsedVarModels(workspace).filter((v) => {
    if (seen.has(v.getId())) return false;
    seen.add(v.getId());
    return true;
  });
  return [
    ...variables.filter((v) => v.type !== 'Array'),
    ...variables.filter((v) => v.type === 'Array'),
  ];
}

function renderVars() {
  const vars = (execIo && execIo.vars) || new Map();
  const variables = variablesForPanel();
  runVars.innerHTML = '';
  if (variables.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'run-vars-empty';
    empty.textContent = 'Nessuna variabile';
    runVars.appendChild(empty);
  }

  let firstChanged = null;
  for (const variable of variables) {
    const id = variable.getId();
    const row = document.createElement('div');
    row.className = 'var-row';
    const nameEl = document.createElement('div');
    nameEl.className = 'var-name';
    nameEl.textContent = variable.name;
    row.appendChild(nameEl);
    runVars.appendChild(row);

    const hasValue = vars.has(id);
    const value = vars.get(id);
    const hadValue = prevVarsSnapshot.has(id);
    const prevValue = prevVarsSnapshot.get(id);

    if (variable.type === 'Array' && hasValue) {
      const arrayEl = document.createElement('div');
      arrayEl.className = 'var-array';
      // Larghezza uguale per tutte le celle: il testo piu' lungo tra valori
      // e indici, piu' un po' di margine.
      const texts = value.map(formatOutputValue);
      const longest = Math.max(String(value.length - 1).length + 2, ...texts.map((t) => t.length));
      arrayEl.style.setProperty('--cell-w', `${longest + 1.5}ch`);
      value.forEach((cellValue, index) => {
        const cell = document.createElement('div');
        cell.className = 'var-cell';
        const indexEl = document.createElement('span');
        indexEl.className = 'var-cell-index';
        indexEl.textContent = `[${index}]`;
        const valueEl = document.createElement('span');
        valueEl.textContent = texts[index];
        cell.append(indexEl, valueEl);
        if (!hadValue || prevValue[index] !== cellValue) {
          cell.classList.add('var-changed');
          firstChanged = firstChanged || cell;
        }
        arrayEl.appendChild(cell);
      });
      row.appendChild(arrayEl);
      continue;
    }

    // "?" e non 0: in C una variabile mai assegnata contiene un valore
    // casuale e in Python non esiste ancora. L'interprete la legge come 0
    // (vedi evalExpression), ma mostrarla come 0 nasconderebbe proprio
    // l'errore di dimenticare l'inizializzazione.
    const valueEl = document.createElement('div');
    valueEl.className = 'var-value';
    if (hasValue) {
      valueEl.textContent = formatOutputValue(value);
      if (!hadValue || prevValue !== value) {
        valueEl.classList.add('var-changed');
        firstChanged = firstChanged || valueEl;
      }
    } else {
      valueEl.textContent = '?';
      valueEl.classList.add('var-unset');
      valueEl.title = variable.type === 'Array' ? 'Array non ancora dichiarato' : 'Variabile non ancora assegnata';
    }
    row.appendChild(valueEl);
  }

  prevVarsSnapshot = snapshotVars(vars);
  // Scorre solo se quello che e' cambiato non si vede gia' ('nearest').
  if (firstChanged) firstChanged.scrollIntoView({ block: 'nearest' });
}

// Porta in vista il blocco in esecuzione solo quando serve, senza
// centrarlo a ogni passo (l'area dei blocchi resterebbe sempre in
// movimento). Si considera solo la riga d'intestazione del blocco: un SE o
// un ciclo con molte istruzioni dentro e' spesso piu' alto dell'area
// visibile, e basta vederne l'inizio.
function scrollBlockIntoViewIfNeeded(blockId) {
  const block = workspace.getBlockById(blockId);
  if (!block) return;
  const xy = block.getRelativeToSurfaceXY();
  const bounds = new Blockly.utils.Rect(
    xy.y,
    xy.y + Math.min(block.height, 48),
    xy.x,
    xy.x + Math.min(block.width, 320)
  );
  workspace.scrollBoundsIntoView(bounds);
}

function startExecution() {
  const programBlock = workspace.getTopBlocks(false).find((b) => b.type === 'program');
  if (!programBlock) return;
  runStrip.hidden = false;
  runSplitter.hidden = false;
  runConsole.innerHTML = '';
  runInputForm.hidden = true;
  execIo = {
    stepCount: 0,
    onOutput: (value) => appendConsoleLine(formatOutputValue(value), 'run-output'),
    onWarning: (message) => appendConsoleLine(message, 'run-warning'),
  };
  execGenerator = runProgram(programBlock, execIo);
  prevVarsSnapshot = new Map();
  setWorkspaceLocked(true);
}

// Fa avanzare l'interprete di un passo (un solo yield). inputValue viene
// passato a generator.next(...) per sbloccare un LEGGI in attesa.
function advance(inputValue) {
  let result;
  try {
    result = execGenerator.next(inputValue);
  } catch (err) {
    if (!(err instanceof ExecutionError)) throw err;
    renderVars();
    appendConsoleLine(err.message, 'run-error');
    showToast(err.message, 'error');
    stopExecution('Interrotto');
    // Selezionato (non evidenziato come passo): resta visibile mentre lo
    // studente corregge, e sparisce da solo al primo clic altrove. In
    // Blockly 13 la selezione segue il focus: block.select() da solo non
    // basta (verificato), serve il FocusManager.
    const culprit = err.blockId && workspace.getBlockById(err.blockId);
    if (culprit) {
      Blockly.getFocusManager().focusNode(culprit);
      scrollBlockIntoViewIfNeeded(err.blockId);
    }
    return;
  }

  // Anche a fine programma e dopo un LEGGI: i valori finali restano
  // visibili a esecuzione terminata.
  renderVars();

  if (result.done) {
    stopExecution('Esecuzione terminata');
    return;
  }

  const event = result.value;
  currentBlockId = event.blockId;
  workspace.highlightBlock(event.blockId);
  scrollBlockIntoViewIfNeeded(event.blockId);
  renderAllPanels();

  if (event.awaitingInput) {
    resumeRunningAfterInput = execRunning;
    execRunning = false;
    awaitingInput = true;
    execStatus.textContent = 'In attesa di un valore da LEGGI…';
    runInputForm.hidden = false;
    runInputField.value = '';
    runInputField.focus();
    updateExecButtons();
    return;
  }

  runInputForm.hidden = true;
  if (execRunning) {
    execStatus.textContent = 'In esecuzione…';
    execTimer = setTimeout(() => advance(), runStepDelayMs);
  } else {
    execStatus.textContent = 'In pausa — Passo per continuare';
  }
  updateExecButtons();
}

btnRun.addEventListener('click', () => {
  execRunning = true;
  if (!execGenerator) startExecution();
  advance();
});

btnStep.addEventListener('click', () => {
  execRunning = false;
  if (!execGenerator) startExecution();
  advance();
});

btnStop.addEventListener('click', () => stopExecution());

runStripClose.addEventListener('click', () => {
  runStrip.hidden = true;
  runSplitter.hidden = true;
});

// Con un programma nuovo (Nuovo, Apri, Esempio) console e variabili
// dell'esecuzione precedente non hanno piu' senso: si svuotano e la
// striscia si richiude, come prima di qualsiasi esecuzione. Quei tre
// comandi sono disabilitati mentre si esegue, quindi qui l'esecuzione e'
// sempre gia' ferma.
function resetRunStrip() {
  execIo = null;
  prevVarsSnapshot = new Map();
  runConsole.innerHTML = '';
  runVars.innerHTML = '';
  runStrip.hidden = true;
  runSplitter.hidden = true;
}

runInputForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const raw = runInputField.value.trim();
  if (!/^-?\d+$/.test(raw)) {
    showToast('Inserisci un numero intero', 'error');
    return;
  }
  appendConsoleLine(`LEGGI → ${raw}`, 'run-input');
  runInputForm.hidden = true;
  awaitingInput = false;
  execRunning = resumeRunningAfterInput;
  advance(parseInt(raw, 10));
});

// --- Scorciatoie da tastiera per l'esecuzione ---------------------------
// Invio/Spazio/Esc richiamano semplicemente il click dei bottoni
// corrispondenti: rispettano quindi automaticamente lo stato "disabled"
// (un click su un bottone disabilitato non genera l'evento 'click').
// Vanno pero' ignorate mentre si sta scrivendo da qualche parte (campo
// LEGGI, rinominare una variabile, modificare un commento, un altro
// bottone con il focus) o mentre e' aperto un modale. Esc fa eccezione:
// e' una convenzione universale di "annulla" che non confligge mai con la
// digitazione (a differenza di Spazio/Invio), quindi resta attiva anche
// dentro al campo LEGGI.
function shouldIgnoreShortcut(target) {
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return true;
  // Un bottone diverso dai tre di esecuzione: rispetta la sua attivazione
  // nativa con Invio/Spazio invece di dirottarla su Esegui (es. il focus
  // resta su "Guida" dopo un Tab, Invio deve attivare "Guida", non Esegui).
  // I tre bottoni dell'esecuzione restano invece sempre attivi: dopo un
  // click su "Passo" il focus vi resta sopra, e le scorciatoie devono
  // continuare a funzionare.
  if (tag === 'BUTTON' && target !== btnRun && target !== btnStep && target !== btnStop) return true;
  return false;
}

document.addEventListener('keydown', (event) => {
  if (!welcomeModal.hidden || !helpModal.hidden || !newsModal.hidden) return;
  if (event.key === 'Escape') {
    btnStop.click();
    return;
  }
  if (shouldIgnoreShortcut(event.target)) return;
  switch (event.key) {
    case ' ':
      event.preventDefault(); // altrimenti Spazio scorre la pagina
      btnStep.click();
      break;
    case 'Enter':
      event.preventDefault();
      btnRun.click();
      break;
    default:
      break;
  }
});

// --- Ridimensionamento manuale dei pannelli ------------------------------
// Due separatori trascinabili, attivi solo in vista desktop: la vista
// mobile (sotto i 900px, vedi style.css) impila i pannelli con altezze
// fisse pensate per lo schermo piccolo, dove trascinare col dito e' piu'
// scomodo che utile (vedi .splitter { display: none } nella media query).
const workspaceArea = document.querySelector('.workspace-area');
const outputsPanel = document.querySelector('.outputs');
const blocksSplitter = document.getElementById('blocksSplitter');
const desktopLayout = window.matchMedia('(min-width: 901px)');

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setBlocksWidth(px) {
  const min = 260;
  const max = workspaceArea.getBoundingClientRect().width - 260 - blocksSplitter.getBoundingClientRect().width;
  blocklyDiv.style.flex = `0 0 ${clamp(px, min, max)}px`;
  Blockly.svgResize(workspace);
}

function setRunStripHeight(px) {
  const min = 120;
  const max = outputsPanel.getBoundingClientRect().height - 160;
  runStrip.style.height = `${clamp(px, min, max)}px`;
}

// Blockly si ridisegna da solo al resize della window, non del suo div:
// senza la chiamata esplicita a svgResize() dentro setBlocksWidth() l'area
// blocchi resterebbe congelata con viewport/scrollbar vecchi dopo un
// trascinamento.

// Gestisce il ciclo di vita del trascinamento (pointer capture cosi' il
// movimento resta tracciato anche fuori dai bordi sottili del separatore,
// classe .dragging per il feedback visivo, doppio click per tornare alle
// proporzioni di default).
function enableSplitterDrag(splitter, getStart, onMove, onReset) {
  splitter.addEventListener('pointerdown', (event) => {
    if (!desktopLayout.matches) return;
    event.preventDefault();
    splitter.setPointerCapture(event.pointerId);
    splitter.classList.add('dragging');
    document.body.style.userSelect = 'none';
    const start = getStart(event);
    function move(moveEvent) {
      onMove(moveEvent, start);
    }
    function end() {
      splitter.classList.remove('dragging');
      document.body.style.userSelect = '';
      splitter.removeEventListener('pointermove', move);
      splitter.removeEventListener('pointerup', end);
      splitter.removeEventListener('pointercancel', end);
    }
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', end);
    splitter.addEventListener('pointercancel', end);
  });
  splitter.addEventListener('dblclick', onReset);
}

enableSplitterDrag(
  blocksSplitter,
  (event) => ({ x: event.clientX, width: blocklyDiv.getBoundingClientRect().width }),
  (event, start) => setBlocksWidth(start.width + (event.clientX - start.x)),
  () => {
    blocklyDiv.style.flex = '';
    Blockly.svgResize(workspace);
  },
);

enableSplitterDrag(
  runSplitter,
  (event) => ({ y: event.clientY, height: runStrip.getBoundingClientRect().height }),
  (event, start) => setRunStripHeight(start.height - (event.clientY - start.y)),
  () => {
    runStrip.style.height = '';
  },
);

// Frecce per chi naviga da tastiera (i separatori sono role="separator"
// focusabili), Home riporta alle proporzioni di default.
blocksSplitter.addEventListener('keydown', (event) => {
  if (!desktopLayout.matches) return;
  const step = 24;
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    setBlocksWidth(blocklyDiv.getBoundingClientRect().width - step);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    setBlocksWidth(blocklyDiv.getBoundingClientRect().width + step);
  } else if (event.key === 'Home') {
    event.preventDefault();
    blocklyDiv.style.flex = '';
    Blockly.svgResize(workspace);
  }
});

runSplitter.addEventListener('keydown', (event) => {
  if (!desktopLayout.matches) return;
  const step = 24;
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    setRunStripHeight(runStrip.getBoundingClientRect().height + step);
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    setRunStripHeight(runStrip.getBoundingClientRect().height - step);
  } else if (event.key === 'Home') {
    event.preventDefault();
    runStrip.style.height = '';
  }
});

// Un ridimensionamento fatto in vista desktop lascerebbe uno stile inline
// stantio se la finestra si restringe sotto i 900px: in colonna il "flex"
// usato per la larghezza dell'area blocchi diventerebbe un'altezza,
// scavalcando i 55vh pensati per il layout mobile. Si azzera quindi ogni
// override al passaggio sotto la soglia, cosi' tornano i valori da CSS.
desktopLayout.addEventListener('change', (event) => {
  if (!event.matches) {
    blocklyDiv.style.flex = '';
    runStrip.style.height = '';
  }
});
