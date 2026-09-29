// Controlli nell'editor: avvisi che compaiono sui blocchi mentre lo
// studente compone, prima ancora di eseguire (icona standard di Blockly, il
// triangolo). Vanno qui solo gli errori certi, riconoscibili dalla sola
// forma del programma; quelli che dipendono dai valori (x / n con n che
// vale 0) li scopre solo l'esecuzione (src/runtime/interpreter.js). Un
// valore non valido in un campo (es. PASSO 0) non arriva nemmeno qui: lo
// rifiuta il validatore del campo (src/blocks/blocks.js).
//
// Ogni controllo ha un id suo, passato a setWarningText(): Blockly tiene gli
// avvisi con id diversi separati e li mostra insieme, quindi un controllo
// che toglie il proprio avviso non cancella quello di un altro.
//
// Per aggiungere un controllo: una voce in CHECKS, con i tipi di blocco che
// guarda e una funzione che restituisce il messaggio (o null).

// --- Contatore del PER modificato dentro il ciclo ----------------------
// Non e' solo buona pratica: e' l'unico caso in cui C e Python generati
// darebbero risultati diversi dallo stesso programma. In C l'incremento
// parte dal valore attuale del contatore (la modifica conta), in Python
// range() lo riassegna a ogni giro (la modifica si perde). Vale lo stesso
// per un PER annidato che riusa lo stesso contatore. Lo strumento quindi
// non sceglie uno dei due comportamenti: segnala il blocco qui e ferma
// l'esecuzione con un errore (vedi docs/DECISIONI-ESTENSIONI.md).
// I due messaggi sono condivisi con l'errore dell'interprete, cosi'
// editor ed esecuzione dicono la stessa cosa.

export function counterWriteMessage(name) {
  return `Non modificare il contatore ${name} dentro il suo PER: in C e in Python il ciclo si comporterebbe in modo diverso. Se ti serve cambiarlo, usa un MENTRE.`;
}

export function nestedCounterMessage(name) {
  return `Questo PER usa come contatore ${name}, che è già il contatore del PER che lo contiene: in C e in Python il ciclo si comporterebbe in modo diverso. Usa un'altra variabile (es. j).`;
}

// Il PER che contiene block (a qualunque livello) e usa variableId come
// contatore, oppure null.
function enclosingForWithCounter(block, variableId) {
  for (let parent = block.getSurroundParent(); parent; parent = parent.getSurroundParent()) {
    if (parent.type === 'controls_for_simple' && parent.getFieldValue('VAR') === variableId) {
      return parent;
    }
  }
  return null;
}

function checkForCounter(block) {
  const variable = block.getField('VAR').getVariable();
  if (!variable || !enclosingForWithCounter(block, variable.getId())) return null;
  return block.type === 'controls_for_simple'
    ? nestedCounterMessage(variable.name)
    : counterWriteMessage(variable.name);
}

// --- Divisione per zero scritta nel blocco ------------------------------
// Solo quando il divisore e' proprio il blocco numero 0: allora l'errore e'
// certo, qualunque cosa succeda durante l'esecuzione (anche gcc lo segnala
// gia' in compilazione). Niente calcolo di espressioni costanti come
// (2 - 2): casi rari, e l'avviso diventerebbe meno prevedibile.
function checkDivisionByZero(block) {
  const op = block.getFieldValue('OP');
  if (op !== 'DIV' && op !== 'MOD') return null;
  const divisor = block.getInputTargetBlock('B');
  if (!divisor || divisor.type !== 'number_literal' || divisor.getFieldValue('VALUE') !== 0) return null;
  const symbol = op === 'DIV' ? '÷' : 'mod';
  return `Divisione per zero (${symbol} 0): il risultato non esiste. In C e in Python il programma si fermerebbe con un errore.`;
}

// ------------------------------------------------------------------------

const CHECKS = [
  { id: 'for-counter', types: ['assign', 'read', 'controls_for_simple'], check: checkForCounter },
  { id: 'division-by-zero', types: ['arith_op'], check: checkDivisionByZero },
];

// Da chiamare dopo ogni modifica del workspace: ricalcola tutti gli avvisi,
// cosi' un avviso sparisce appena la causa viene corretta.
export function updateEditorWarnings(workspace) {
  for (const block of workspace.getAllBlocks(false)) {
    for (const { id, types, check } of CHECKS) {
      if (types.includes(block.type)) block.setWarningText(check(block), id);
    }
  }
}
