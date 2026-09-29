// Regola "il contatore di un PER non si modifica dentro il ciclo".
//
// Non e' solo buona pratica: e' l'unico caso in cui C e Python generati
// darebbero risultati diversi dallo stesso programma. In C l'incremento
// parte dal valore attuale del contatore (la modifica conta), in Python
// range() lo riassegna a ogni giro (la modifica si perde). Vale lo stesso
// per un PER annidato che riusa lo stesso contatore. Lo strumento quindi
// non sceglie uno dei due comportamenti: segnala il blocco nell'editor e
// ferma l'esecuzione con un errore (vedi docs/DECISIONI-ESTENSIONI.md).
//
// Messaggi condivisi tra l'avviso sul blocco (qui sotto) e l'errore
// dell'interprete (src/runtime/interpreter.js), cosi' dicono la stessa cosa.

export function counterWriteMessage(name) {
  return `Non modificare il contatore ${name} dentro il suo PER: in C e in Python il ciclo si comporterebbe in modo diverso. Se ti serve cambiarlo, usa un MENTRE.`;
}

export function nestedCounterMessage(name) {
  return `Questo PER usa come contatore ${name}, che è già il contatore del PER che lo contiene: in C e in Python il ciclo si comporterebbe in modo diverso. Usa un'altra variabile (es. j).`;
}

// Blocchi che scrivono la variabile del proprio campo VAR.
const WRITING_TYPES = new Set(['assign', 'read', 'controls_for_simple']);

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

// Aggiorna l'icona di avviso standard di Blockly (triangolo) su ogni blocco
// che scrive il contatore di un PER che lo contiene. Da chiamare dopo ogni
// modifica del workspace: l'avviso sparisce appena il blocco viene
// spostato fuori dal ciclo o cambia variabile.
export function updateCounterWarnings(workspace) {
  for (const block of workspace.getAllBlocks(false)) {
    if (!WRITING_TYPES.has(block.type)) continue;
    const variable = block.getField('VAR').getVariable();
    let message = null;
    if (variable && enclosingForWithCounter(block, variable.getId())) {
      message = block.type === 'controls_for_simple'
        ? nestedCounterMessage(variable.name)
        : counterWriteMessage(variable.name);
    }
    block.setWarningText(message);
  }
}
