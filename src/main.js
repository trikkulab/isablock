import { registerBlocks } from './blocks/blocks.js';
import { toolbox } from './blocks/toolbox.js';
import { createPseudocodeGenerator } from './codegen/pseudocode.js';
import { createCGenerator } from './codegen/c.js';
import { createPythonGenerator } from './codegen/python.js';
import { extractSourceMap } from './codegen/common.js';
import { pseudocodeConfig } from './pseudocode-config.js';
import { saveWorkspaceToFile, loadWorkspaceFromFile } from './persistence.js';
import { examples } from './examples.js';
import { runProgram, ExecutionError } from './runtime/interpreter.js';

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

// blockId attualmente in esecuzione (null quando non si sta eseguendo):
// e' lo stato condiviso che lega l'evidenziazione dei blocchi Blockly a
// quella dei tre pannelli di codice, indipendentemente da quale scheda e'
// aperta in un dato momento.
let currentBlockId = null;

function escapeHtml(text) {
  return text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function renderCodePanel(el, text, range) {
  if (!range) {
    el.textContent = text;
    return;
  }
  el.innerHTML =
    escapeHtml(text.slice(0, range.start)) +
    `<mark class="exec-highlight">${escapeHtml(text.slice(range.start, range.end))}</mark>` +
    escapeHtml(text.slice(range.end));
  el.querySelector('.exec-highlight').scrollIntoView({ block: 'nearest' });
}

function renderAllPanels() {
  renderCodePanel(outputPseudocode, outputTexts.pseudocode, currentBlockId && sourceMaps.pseudocode.get(currentBlockId));
  renderCodePanel(outputC, outputTexts.c, currentBlockId && sourceMaps.c.get(currentBlockId));
  renderCodePanel(outputPython, outputTexts.python, currentBlockId && sourceMaps.python.get(currentBlockId));
}

function updateOutputs() {
  const pseudo = extractSourceMap(pseudocodeGen.workspaceToCode(workspace));
  const c = extractSourceMap(cGen.workspaceToCode(workspace));
  const python = extractSourceMap(pythonGen.workspaceToCode(workspace));
  outputTexts = { pseudocode: pseudo.text, c: c.text, python: python.text };
  sourceMaps = { pseudocode: pseudo.ranges, c: c.ranges, python: python.ranges };
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
  debounceTimer = setTimeout(updateOutputs, 250);
}

workspace.addChangeListener((event) => {
  if (event.isUiEvent) return;
  scheduleUpdate();
});

enforceProgramBlock();
updateOutputs();

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

// --- Barra dei comandi ------------------------------------------------
document.getElementById('btnNew').addEventListener('click', () => {
  if (!window.confirm('Cancellare il programma corrente e ricominciare da zero?')) return;
  workspace.clear();
  enforceProgramBlock();
  updateOutputs();
  showToast('Nuovo programma creato', 'success');
});

document.getElementById('btnSave').addEventListener('click', () => {
  saveWorkspaceToFile(Blockly, workspace);
  showToast('Programma salvato', 'success');
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
      showToast('Programma caricato', 'success');
    })
    .catch(() => {
      showToast('Il file scelto non è un programma valido', 'error');
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
const runConsole = document.getElementById('runConsole');
const runInputForm = document.getElementById('runInputForm');
const runInputField = document.getElementById('runInputField');

const RUN_STEP_DELAY_MS = 350;

let execGenerator = null;
let execRunning = false; // true = esecuzione continua ("Esegui"), false = passo singolo o in pausa
let execTimer = null;
let resumeRunningAfterInput = false; // execRunning da ripristinare dopo un LEGGI in attesa

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
  // In esecuzione continua i due comandi "manuali" restano disabilitati
  // finche' non arriva una pausa (fine ciclo di setTimeout o attesa LEGGI).
  btnRun.disabled = active && execRunning;
  btnStep.disabled = active && execRunning;
}

function stopExecution(statusText) {
  clearTimeout(execTimer);
  execGenerator = null;
  execRunning = false;
  currentBlockId = null;
  workspace.highlightBlock(null);
  renderAllPanels();
  runInputForm.hidden = true;
  setWorkspaceLocked(false);
  execStatus.textContent = statusText || 'Pronto';
  updateExecButtons();
}

function startExecution() {
  const programBlock = workspace.getTopBlocks(false).find((b) => b.type === 'program');
  if (!programBlock) return;
  runConsole.innerHTML = '';
  runInputForm.hidden = true;
  const io = {
    stepCount: 0,
    onOutput: (value) => appendConsoleLine(String(value), 'run-output'),
  };
  execGenerator = runProgram(programBlock, io);
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
    appendConsoleLine(err.message, 'run-error');
    showToast(err.message, 'error');
    stopExecution('Interrotto');
    return;
  }

  if (result.done) {
    stopExecution('Esecuzione terminata');
    return;
  }

  const event = result.value;
  currentBlockId = event.blockId;
  workspace.highlightBlock(event.blockId);
  renderAllPanels();

  if (event.awaitingInput) {
    resumeRunningAfterInput = execRunning;
    execRunning = false;
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
    execTimer = setTimeout(() => advance(), RUN_STEP_DELAY_MS);
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

runInputForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const raw = runInputField.value.trim();
  if (!/^-?\d+$/.test(raw)) {
    showToast('Inserisci un numero intero', 'error');
    return;
  }
  appendConsoleLine(`LEGGI → ${raw}`, 'run-input');
  runInputForm.hidden = true;
  execRunning = resumeRunningAfterInput;
  advance(parseInt(raw, 10));
});
