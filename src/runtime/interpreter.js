// Interprete diretto sui blocchi Blockly: stesso modello dati letto dai tre
// generatori di codice (src/codegen/*.js), ma invece di produrre testo
// esegue realmente l'algoritmo, un'istruzione alla volta. Nessuno dei tre
// output testuali viene mai eseguito - eseguire il C o il Python generati
// richiederebbe rispettivamente un compilatore o un runtime pesante in
// browser (vedi docs/ROADMAP.md, Fase 3). I tre pannelli di codice si
// limitano a "seguire" evidenziando, tramite la source map prodotta da
// src/codegen/common.js: e' l'unico motore che gira davvero.
//
// E' una funzione generatore JS: ogni istruzione fa yield del proprio
// blockId, cosi' il chiamante puo' evidenziare il blocco (e la riga
// corrispondente nei tre output) sia in modalita' "Passo" sia in
// esecuzione continua. Regola: un passo esegue il blocco evidenziato e ne
// mostra subito l'effetto, quindi le istruzioni semplici fanno yield DOPO
// aver agito (il valore assegnato, la riga stampata sono gia' visibili
// quando il blocco si illumina). I blocchi di controllo (SE, MENTRE, PER...)
// fanno yield sul controllo della condizione, prima di entrare nel corpo.
// Il blocco LEGGI fa yield di un evento distinto e riprende con il valore
// fornito dallo studente tramite generator.next(valore); poi fa un secondo
// yield, sempre su se stesso, per mostrare il valore letto.

import { getForStep } from '../codegen/common.js';
import { counterWriteMessage, nestedCounterMessage } from '../blocks/for-counter.js';

const MAX_STEPS = 200000;

// blockId: il blocco che ha causato l'errore, che l'app seleziona e porta
// in vista quando l'esecuzione si ferma. Chi lancia l'errore indica il
// blocco piu' preciso che conosce (es. la divisione, non l'ASSEGNA che la
// contiene); se non lo indica, lo aggiunge tagError() risalendo: prima
// l'espressione piu' interna, poi l'istruzione che la contiene.
export class ExecutionError extends Error {
  constructor(message, blockId) {
    super(message);
    this.blockId = blockId;
  }
}

function tagError(err, block) {
  if (err instanceof ExecutionError && !err.blockId) err.blockId = block.id;
}

// Il contatore di un PER in corso non si puo' modificare dal corpo (ne'
// riusare in un PER annidato): C e Python si comporterebbero in modo
// diverso. Vedi src/blocks/for-counter.js, che segnala lo stesso caso
// nell'editor prima ancora di eseguire. io.activeCounters: gli id delle
// variabili contatore dei PER in esecuzione.
function checkNotActiveCounter(block, variable, io, message) {
  if (io.activeCounters.has(variable.getId())) {
    throw new ExecutionError(message(variable.name), block.id);
  }
}

// Il blocco indicato e' il ciclo piu' interno in corso (io.loopStack), non
// l'istruzione su cui capita di finire i passi: e' il ciclo che
// probabilmente non termina.
function checkStepBudget(io) {
  io.stepCount += 1;
  if (io.stepCount > MAX_STEPS) {
    throw new ExecutionError(
      'Esecuzione interrotta: troppi passi (probabile ciclo infinito).',
      io.loopStack.at(-1)
    );
  }
}

// L'array JS vero e proprio vive in vars, messo lì dall'esecuzione del
// blocco array_declare corrispondente (vedi il case 'array_declare' più
// sotto): la sua lunghezza reale è quindi già la dimensione dichiarata, non
// serve consultare di nuovo il campo SIZE qui. Se l'array non è mai stato
// dichiarato (programma incompleto, non un caso da C/Python) l'errore è
// leggibile invece di un TypeError grezzo su un valore undefined.
function getArray(block, vars) {
  const variable = block.getField('VAR').getVariable();
  const array = vars.get(variable.getId());
  if (!array) {
    throw new ExecutionError(
      `L'array "${variable.name}" non è stato dichiarato (manca un blocco DICHIARA ARRAY).`,
      block.id
    );
  }
  return array;
}

// Sia in C (comportamento indefinito) sia in Python (eccezione) un indice
// fuori dai limiti è un errore da segnalare, non da eseguire in silenzio
// (vedi docs/DECISIONI-ESTENSIONI.md, sezione Array): qui lo trattiamo
// allo stesso modo per entrambe le direzioni (troppo piccolo o troppo
// grande), a differenza di Python dove v[-1] sarebbe valido.
function checkIndex(block, index, array) {
  if (!Number.isInteger(index) || index < 0 || index >= array.length) {
    const variableName = block.getField('VAR').getVariable().name;
    throw new ExecutionError(
      `Indice fuori dai limiti: ${variableName}[${index}] (dimensione ${array.length}).`,
      block.id
    );
  }
}

// Il contatore di un PER, dopo l'uscita dal ciclo, non vale lo stesso nei
// due linguaggi: in C vale il primo valore che ha reso falsa la condizione
// (5 dopo PER i DA 1 A 4), in Python l'ultimo valore dato da range() (4),
// oppure quello che aveva prima del ciclo se non ci sono state ripetizioni.
// L'interprete segue il C (vedi controls_for_simple), cosi' si vede il
// valore che fa uscire; ma se il programma legge il contatore prima di
// riassegnarlo, i due output darebbero risultati diversi, e lo si segnala.
// io.exitedCounters: variableId -> messaggio, svuotato a ogni scrittura.
function warnIfExitedCounter(variable, io) {
  const message = io.exitedCounters.get(variable.getId());
  if (message === undefined) return;
  io.exitedCounters.delete(variable.getId());
  io.onWarning(message);
}

function exitedCounterMessage(name, cValue, pythonValue) {
  const python = pythonValue === undefined
    ? 'in Python non avrebbe ancora un valore'
    : `in Python varrebbe ${pythonValue}`;
  return `Attenzione: dopo il PER, ${name} vale ${cValue} in C ma ${python}. Meglio non usare il contatore fuori dal ciclo.`;
}

// Stessa identica semantica di divisione/modulo gia' scelta e documentata
// nei tre generatori (vedi src/codegen/c.js e src/codegen/python.js): non e'
// una nuova convenzione, e' quella che i tre output dichiarano di produrre.
// Uno slot vuoto (block null) non ha un blocco proprio: l'errore viene
// attribuito da tagError() al blocco che contiene lo slot.
function evalExpression(block, vars, io) {
  if (!block) {
    throw new ExecutionError('Espressione mancante in un blocco.');
  }
  try {
    return evalExpressionBlock(block, vars, io);
  } catch (err) {
    tagError(err, block);
    throw err;
  }
}

function evalExpressionBlock(block, vars, io) {
  switch (block.type) {
    case 'number_literal':
      return block.getFieldValue('VALUE');
    case 'bool_literal':
      return block.getFieldValue('VALUE') === 'TRUE';
    case 'text_literal':
      return block.getFieldValue('TEXT');
    case 'variable_get': {
      const variable = block.getField('VAR').getVariable();
      warnIfExitedCounter(variable, io);
      return vars.has(variable.getId()) ? vars.get(variable.getId()) : 0;
    }
    case 'variable_get_bool': {
      const variable = block.getField('VAR').getVariable();
      return vars.has(variable.getId()) ? vars.get(variable.getId()) : false;
    }
    case 'array_get': {
      const array = getArray(block, vars);
      const index = evalExpression(block.getInputTargetBlock('INDEX'), vars, io);
      checkIndex(block, index, array);
      return array[index];
    }
    case 'array_length':
      return getArray(block, vars).length;
    case 'arith_op': {
      const a = evalExpression(block.getInputTargetBlock('A'), vars, io);
      const b = evalExpression(block.getInputTargetBlock('B'), vars, io);
      switch (block.getFieldValue('OP')) {
        case 'ADD':
          return a + b;
        case 'SUB':
          return a - b;
        case 'MUL':
          return a * b;
        case 'DIV':
          if (b === 0) throw new ExecutionError('Divisione per zero.');
          return Math.trunc(a / b);
        case 'MOD':
          if (b === 0) throw new ExecutionError('Divisione per zero (mod).');
          return a % b;
        default:
          throw new ExecutionError('Operatore aritmetico sconosciuto.');
      }
    }
    case 'compare_op': {
      const a = evalExpression(block.getInputTargetBlock('A'), vars, io);
      const b = evalExpression(block.getInputTargetBlock('B'), vars, io);
      switch (block.getFieldValue('OP')) {
        case 'EQ':
          return a === b;
        case 'NEQ':
          return a !== b;
        case 'LT':
          return a < b;
        case 'LTE':
          return a <= b;
        case 'GT':
          return a > b;
        case 'GTE':
          return a >= b;
        default:
          throw new ExecutionError('Operatore di confronto sconosciuto.');
      }
    }
    case 'logic_op': {
      // Corto circuito, come negli output generati (&&/|| in C, and/or in
      // Python): B non viene valutato se non serve.
      const a = evalExpression(block.getInputTargetBlock('A'), vars, io);
      if (block.getFieldValue('OP') === 'AND') {
        return a && evalExpression(block.getInputTargetBlock('B'), vars, io);
      }
      return a || evalExpression(block.getInputTargetBlock('B'), vars, io);
    }
    case 'not_op':
      return !evalExpression(block.getInputTargetBlock('A'), vars, io);
    default:
      throw new ExecutionError(`Blocco espressione sconosciuto: ${block.type}`);
  }
}

function* runStatements(firstBlock, vars, io) {
  let current = firstBlock;
  while (current) {
    yield* runStatement(current, vars, io);
    current = current.nextConnection && current.nextConnection.targetBlock();
  }
}

function* runStatement(block, vars, io) {
  try {
    yield* runStatementBlock(block, vars, io);
  } catch (err) {
    tagError(err, block);
    throw err;
  }
}

function* runStatementBlock(block, vars, io) {
  checkStepBudget(io);
  switch (block.type) {
    case 'assign': {
      const variable = block.getField('VAR').getVariable();
      checkNotActiveCounter(block, variable, io, counterWriteMessage);
      vars.set(variable.getId(), evalExpression(block.getInputTargetBlock('VALUE'), vars, io));
      io.exitedCounters.delete(variable.getId());
      yield { blockId: block.id };
      return;
    }
    case 'read': {
      const variable = block.getField('VAR').getVariable();
      checkNotActiveCounter(block, variable, io, counterWriteMessage);
      const value = yield { blockId: block.id, awaitingInput: true };
      vars.set(variable.getId(), value);
      io.exitedCounters.delete(variable.getId());
      yield { blockId: block.id };
      return;
    }
    case 'write': {
      io.onOutput(evalExpression(block.getInputTargetBlock('VALUE'), vars, io));
      yield { blockId: block.id };
      return;
    }
    case 'array_declare': {
      const variable = block.getField('VAR').getVariable();
      const size = block.getFieldValue('SIZE');
      vars.set(variable.getId(), new Array(size).fill(0));
      yield { blockId: block.id };
      return;
    }
    case 'array_set': {
      const array = getArray(block, vars);
      const index = evalExpression(block.getInputTargetBlock('INDEX'), vars, io);
      checkIndex(block, index, array);
      array[index] = evalExpression(block.getInputTargetBlock('VALUE'), vars, io);
      yield { blockId: block.id };
      return;
    }
    case 'array_read': {
      const array = getArray(block, vars);
      const index = evalExpression(block.getInputTargetBlock('INDEX'), vars, io);
      checkIndex(block, index, array);
      const value = yield { blockId: block.id, awaitingInput: true };
      array[index] = value;
      yield { blockId: block.id };
      return;
    }
    case 'comment_line': {
      // Nessun effetto (per definizione), ma resta un passo visibile: la
      // spec lo descrive come una riga reale della sequenza, non solo
      // un'annotazione dell'editor.
      yield { blockId: block.id };
      return;
    }
    case 'controls_if_simple': {
      yield { blockId: block.id };
      if (evalExpression(block.getInputTargetBlock('COND'), vars, io)) {
        yield* runStatements(block.getInputTargetBlock('THEN'), vars, io);
      }
      return;
    }
    case 'controls_if_else': {
      yield { blockId: block.id };
      const branch = evalExpression(block.getInputTargetBlock('COND'), vars, io) ? 'THEN' : 'ELSE';
      yield* runStatements(block.getInputTargetBlock(branch), vars, io);
      return;
    }
    case 'controls_while': {
      io.loopStack.push(block.id);
      for (;;) {
        yield { blockId: block.id };
        if (!evalExpression(block.getInputTargetBlock('COND'), vars, io)) break;
        yield* runStatements(block.getInputTargetBlock('BODY'), vars, io);
        checkStepBudget(io);
      }
      io.loopStack.pop();
      return;
    }
    case 'controls_do_while': {
      // Il corpo prima, la condizione dopo: il passo evidenziato sul blocco
      // stesso e' il controllo della condizione, come per MENTRE.
      io.loopStack.push(block.id);
      for (;;) {
        yield* runStatements(block.getInputTargetBlock('BODY'), vars, io);
        yield { blockId: block.id };
        if (!evalExpression(block.getInputTargetBlock('COND'), vars, io)) break;
        checkStepBudget(io);
      }
      io.loopStack.pop();
      return;
    }
    case 'controls_for_simple': {
      // Stessa sequenza del for del C: assegna il valore iniziale, controlla
      // la condizione, esegue il corpo, incrementa, ricontrolla. Anche il
      // controllo che fallisce e' un passo visibile (come per MENTRE): il
      // contatore ha gia' il valore che fa uscire dal ciclo.
      const variable = block.getField('VAR').getVariable();
      checkNotActiveCounter(block, variable, io, nestedCounterMessage);
      const id = variable.getId();
      const from = evalExpression(block.getInputTargetBlock('FROM'), vars, io);
      const to = evalExpression(block.getInputTargetBlock('TO'), vars, io);
      const step = getForStep(block);
      // Valore che il contatore avrebbe in Python a fine ciclo: range() non
      // lo tocca se non ci sono ripetizioni.
      let pythonValue = vars.get(id);
      io.exitedCounters.delete(id);
      io.activeCounters.add(id);
      io.loopStack.push(block.id);
      for (let i = from; ; i += step) {
        vars.set(id, i);
        yield { blockId: block.id };
        if (!(step > 0 ? i <= to : i >= to)) break;
        pythonValue = i;
        yield* runStatements(block.getInputTargetBlock('BODY'), vars, io);
        checkStepBudget(io);
      }
      io.loopStack.pop();
      io.activeCounters.delete(id);
      if (pythonValue !== vars.get(id)) {
        io.exitedCounters.set(id, exitedCounterMessage(variable.name, vars.get(id), pythonValue));
      }
      return;
    }
    case 'repeat_times': {
      const times = evalExpression(block.getInputTargetBlock('TIMES'), vars, io);
      io.loopStack.push(block.id);
      for (let i = 0; i < times; i++) {
        yield { blockId: block.id };
        yield* runStatements(block.getInputTargetBlock('BODY'), vars, io);
        checkStepBudget(io);
      }
      io.loopStack.pop();
      return;
    }
    default:
      throw new ExecutionError(`Blocco istruzione sconosciuto: ${block.type}`);
  }
}

// io = { onOutput(value), onWarning(message), stepCount: 0 } - stepCount va
// inizializzato dal chiamante e viene aggiornato qui dentro per il tetto
// anti-ciclo-infinito.
// io.vars viene impostato qui: e' la stessa mappa variableId -> valore usata
// dall'esecuzione, esposta in sola lettura al pannello Variabili. Un id
// assente significa "mai assegnata" (in lettura vale 0, vedi evalExpression).
export function* runProgram(programBlock, io) {
  const vars = new Map();
  io.vars = vars;
  io.exitedCounters = new Map();
  io.activeCounters = new Set();
  io.loopStack = [];
  // Le dichiarazioni (blocchi array_declare) vengono eseguite per prime,
  // come istruzioni vere e proprie (yield compreso: visibili durante
  // "Passo"), esattamente come C dichiara/azzera gli array in cima a main
  // e Python li inizializza in cima al modulo.
  const declarations = programBlock.getInputTargetBlock('DECLARATIONS');
  if (declarations) {
    yield* runStatements(declarations, vars, io);
  }
  const body = programBlock.getInputTargetBlock('BODY');
  if (body) {
    yield* runStatements(body, vars, io);
  }
}
