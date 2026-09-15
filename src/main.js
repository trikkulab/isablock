import { registerBlocks } from './blocks/blocks.js';
import { toolbox } from './blocks/toolbox.js';
import { createPseudocodeGenerator } from './codegen/pseudocode.js';
import { createCGenerator } from './codegen/c.js';
import { createPythonGenerator } from './codegen/python.js';
import { pseudocodeConfig } from './pseudocode-config.js';
import { saveWorkspaceToFile, loadWorkspaceFromFile } from './persistence.js';
import { examples } from './examples.js';

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

const outputPseudocode = document.getElementById('outputPseudocode');
const outputC = document.getElementById('outputC');
const outputPython = document.getElementById('outputPython');

function updateOutputs() {
  outputPseudocode.textContent = pseudocodeGen.workspaceToCode(workspace);
  outputC.textContent = cGen.workspaceToCode(workspace);
  outputPython.textContent = pythonGen.workspaceToCode(workspace);
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
