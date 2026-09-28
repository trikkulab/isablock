import { Order, ARITH_OPS, COMPARE_SYMBOLS_ASCII, chainNextBlock, sanitizeIdentifier, isBooleanExpr, isTextExpr, getForStep } from './common.js';

const C_KEYWORDS = new Set([
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
  'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'int',
  'long', 'register', 'return', 'short', 'signed', 'sizeof', 'static',
  'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile',
  'while', 'inline', 'restrict', 'main', 'printf', 'scanf',
]);

const LOGIC_SYMBOLS = { AND: '&&', OR: '||' };
const ARITH_SYMBOLS = { ADD: '+', SUB: '-', MUL: '*', DIV: '/', MOD: '%' };

// La dimensione di un array vive nel campo SIZE del suo blocco
// array_declare (vedi src/blocks/blocks.js), non altrove: per array_length,
// che in C deve tradursi nella costante numerica, cerchiamo nel workspace il
// blocco di dichiarazione con la stessa variabile. Se non c'e' (array usato
// senza mai dichiararlo) restituisce null, gestito dal chiamante come uno
// slot vuoto qualunque.
function findArrayDeclareBlock(workspace, variableId) {
  return workspace
    .getAllBlocks(false)
    .find((b) => b.type === 'array_declare' && b.getField('VAR').getVariable()?.getId() === variableId);
}

// Genera codice C compilabile (gcc, C99): #include/main/dichiarazioni
// int/scanf/printf, dallo stesso modello a blocchi usato dagli altri due
// generatori. Nota di dominio: divisione e modulo tra interi negativi
// seguono la semantica nativa di ciascun linguaggio (troncamento verso
// zero in C, arrotondamento verso il basso per // e resto con segno del
// divisore in Python) e possono differire per operandi negativi; non
// impatta i cinque algoritmi di riferimento della Fase 1, che usano solo
// interi non negativi.
export function createCGenerator(Blockly, cfg) {
  const gen = new Blockly.Generator('C');
  gen.INDENT = '    ';

  const name = (variableModel) => sanitizeIdentifier(variableModel.name, C_KEYWORDS);

  gen.init = function (workspace) {
    Blockly.Generator.prototype.init.call(this, workspace);
    this.workspace = workspace;
  };

  gen.scrub_ = function (block, code, opt_thisOnly) {
    return chainNextBlock(this, block, code);
  };

  gen.forBlock['program'] = function (block, generator) {
    const arrayDecl = generator.statementToCode(block, 'DECLARATIONS');
    const body = generator.statementToCode(block, 'BODY');
    // Solo le variabili davvero usate da almeno un blocco: evita di
    // dichiarare in C variabili "orfane" (es. il valore di default di un
    // campo variabile mai personalizzato, o rimasto tale dopo aver
    // cambiato blocco/variabile). int/bool restano raccolte scansionando le
    // variabili (restano implicite, nessun blocco le dichiara); gli array
    // arrivano invece dal blocco array_declare stesso (arrayDecl sopra).
    const usedVars = Blockly.Variables.allUsedVarModels(generator.workspace);
    const numberVars = [...new Set(usedVars.filter((v) => v.type === '').map(name))];
    const boolVars = [...new Set(usedVars.filter((v) => v.type === 'Boolean').map(name))];
    let decl = '';
    if (numberVars.length) decl += `${generator.INDENT}int ${numberVars.join(', ')};\n`;
    if (boolVars.length) decl += `${generator.INDENT}bool ${boolVars.join(', ')};\n`;
    decl += arrayDecl;
    const stdbool = boolVars.length ? '#include <stdbool.h>\n' : '';
    return `#include <stdio.h>\n${stdbool}\nint main(void) {\n${decl}${body}${generator.INDENT}return 0;\n}\n`;
  };

  gen.forBlock['assign'] = function (block, generator) {
    const variable = block.getField('VAR').getVariable();
    const value = generator.valueToCode(block, 'VALUE', Order.NONE) || cfg.MISSING_VALUE;
    return `${name(variable)} = ${value};\n`;
  };

  gen.forBlock['read'] = function (block) {
    const variable = block.getField('VAR').getVariable();
    return `scanf("%d", &${name(variable)});\n`;
  };

  gen.forBlock['write'] = function (block, generator) {
    const value = generator.valueToCode(block, 'VALUE', Order.NONE) || cfg.MISSING_VALUE;
    const valueBlock = block.getInputTargetBlock('VALUE');
    if (isTextExpr(valueBlock)) {
      return `printf("%s\\n", ${value});\n`;
    }
    if (isBooleanExpr(valueBlock)) {
      return `printf("%s\\n", (${value}) ? "vero" : "falso");\n`;
    }
    return `printf("%d\\n", ${value});\n`;
  };

  gen.forBlock['controls_if_simple'] = function (block, generator) {
    const cond = generator.valueToCode(block, 'COND', Order.NONE) || cfg.MISSING_CONDITION;
    const thenCode = generator.statementToCode(block, 'THEN');
    return `if (${cond}) {\n${thenCode}}\n`;
  };

  gen.forBlock['controls_if_else'] = function (block, generator) {
    const cond = generator.valueToCode(block, 'COND', Order.NONE) || cfg.MISSING_CONDITION;
    const thenCode = generator.statementToCode(block, 'THEN');
    const elseCode = generator.statementToCode(block, 'ELSE');
    return `if (${cond}) {\n${thenCode}} else {\n${elseCode}}\n`;
  };

  gen.forBlock['controls_while'] = function (block, generator) {
    const cond = generator.valueToCode(block, 'COND', Order.NONE) || cfg.MISSING_CONDITION;
    const body = generator.statementToCode(block, 'BODY');
    return `while (${cond}) {\n${body}}\n`;
  };

  gen.forBlock['controls_do_while'] = function (block, generator) {
    const body = generator.statementToCode(block, 'BODY');
    const cond = generator.valueToCode(block, 'COND', Order.NONE) || cfg.MISSING_CONDITION;
    return `do {\n${body}} while (${cond});\n`;
  };

  gen.forBlock['controls_for_simple'] = function (block, generator) {
    const variable = block.getField('VAR').getVariable();
    const v = name(variable);
    const from = generator.valueToCode(block, 'FROM', Order.NONE) || cfg.MISSING_VALUE;
    const to = generator.valueToCode(block, 'TO', Order.NONE) || cfg.MISSING_VALUE;
    const body = generator.statementToCode(block, 'BODY');
    // Il segno del passo decide la direzione: in avanti fino a "<= fine",
    // all'indietro fino a ">= fine" (valore finale sempre incluso).
    const step = getForStep(block);
    const cmp = step > 0 ? '<=' : '>=';
    let update;
    if (step === 1) update = `${v}++`;
    else if (step === -1) update = `${v}--`;
    else if (step > 0) update = `${v} += ${step}`;
    else update = `${v} -= ${-step}`;
    return `for (${v} = ${from}; ${v} ${cmp} ${to}; ${update}) {\n${body}}\n`;
  };

  gen.forBlock['repeat_times'] = function (block, generator) {
    const times = generator.valueToCode(block, 'TIMES', Order.NONE) || cfg.MISSING_VALUE;
    // Contatore anonimo, dichiarato dentro il ciclo stesso (non tra le
    // variabili dello studente in cima a main): "ripeti N volte" non
    // espone alcun indice, quindi il nome non deve comparire altrove.
    // Il numero di annidamento evita collisioni tra "ripeti" annidati.
    const depth = (generator.repeatDepth || 0) + 1;
    const counter = depth === 1 ? '_i' : `_i${depth}`;
    generator.repeatDepth = depth;
    const body = generator.statementToCode(block, 'BODY');
    generator.repeatDepth = depth - 1;
    return `for (int ${counter} = 0; ${counter} < ${times}; ${counter}++) {\n${body}}\n`;
  };

  gen.forBlock['comment_line'] = function (block) {
    // Un backslash a fine riga in un commento "//" unisce la riga
    // successiva al commento (line-splicing del preprocessore C): lo
    // rimuoviamo per evitare che una riga di codice sparisca in modo
    // silenzioso e sorprendente.
    const text = block.getFieldValue('TEXT').replace(/\\+$/, '');
    return `// ${text}\n`;
  };

  gen.forBlock['number_literal'] = function (block) {
    return [String(block.getFieldValue('VALUE')), Order.ATOMIC];
  };

  gen.forBlock['variable_get'] = function (block) {
    const variable = block.getField('VAR').getVariable();
    return [name(variable), Order.ATOMIC];
  };

  gen.forBlock['variable_get_bool'] = gen.forBlock['variable_get'];

  gen.forBlock['arith_op'] = function (block, generator) {
    const op = block.getFieldValue('OP');
    const info = ARITH_OPS[op];
    const a = generator.valueToCode(block, 'A', info.order) || cfg.MISSING_VALUE;
    const b = generator.valueToCode(block, 'B', info.rightOrder) || cfg.MISSING_VALUE;
    return [`${a} ${ARITH_SYMBOLS[op]} ${b}`, info.order];
  };

  gen.forBlock['compare_op'] = function (block, generator) {
    const op = block.getFieldValue('OP');
    const a = generator.valueToCode(block, 'A', Order.ADDITIVE) || cfg.MISSING_VALUE;
    const b = generator.valueToCode(block, 'B', Order.ADDITIVE) || cfg.MISSING_VALUE;
    return [`${a} ${COMPARE_SYMBOLS_ASCII[op]} ${b}`, Order.RELATIONAL];
  };

  gen.forBlock['logic_op'] = function (block, generator) {
    const op = block.getFieldValue('OP');
    const order = op === 'AND' ? Order.LOGICAL_AND : Order.LOGICAL_OR;
    const a = generator.valueToCode(block, 'A', order) || cfg.MISSING_CONDITION;
    const b = generator.valueToCode(block, 'B', order) || cfg.MISSING_CONDITION;
    return [`${a} ${LOGIC_SYMBOLS[op]} ${b}`, order];
  };

  gen.forBlock['not_op'] = function (block, generator) {
    const a = generator.valueToCode(block, 'A', Order.UNARY_NOT) || cfg.MISSING_CONDITION;
    return [`!${a}`, Order.UNARY_NOT];
  };

  gen.forBlock['bool_literal'] = function (block) {
    return [block.getFieldValue('VALUE') === 'TRUE' ? '1' : '0', Order.ATOMIC];
  };

  gen.forBlock['text_literal'] = function (block) {
    // Escaping di stringa C standard: basta backslash e virgolette, il
    // testo arriva da un field_input a riga singola (niente "a capo" da
    // gestire). Livello A: e' sempre un letterale, mai un valore a runtime,
    // quindi non serve altro (niente lunghezza, niente concatenazione).
    const escaped = block.getFieldValue('TEXT').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return [`"${escaped}"`, Order.ATOMIC];
  };

  gen.forBlock['array_declare'] = function (block) {
    const variable = block.getField('VAR').getVariable();
    const size = block.getFieldValue('SIZE');
    return `int ${name(variable)}[${size}] = {0};\n`;
  };

  gen.forBlock['array_get'] = function (block, generator) {
    const variable = block.getField('VAR').getVariable();
    const index = generator.valueToCode(block, 'INDEX', Order.NONE) || cfg.MISSING_VALUE;
    return [`${name(variable)}[${index}]`, Order.ATOMIC];
  };

  gen.forBlock['array_set'] = function (block, generator) {
    const variable = block.getField('VAR').getVariable();
    const index = generator.valueToCode(block, 'INDEX', Order.NONE) || cfg.MISSING_VALUE;
    const value = generator.valueToCode(block, 'VALUE', Order.NONE) || cfg.MISSING_VALUE;
    return `${name(variable)}[${index}] = ${value};\n`;
  };

  gen.forBlock['array_read'] = function (block, generator) {
    const variable = block.getField('VAR').getVariable();
    const index = generator.valueToCode(block, 'INDEX', Order.NONE) || cfg.MISSING_VALUE;
    return `scanf("%d", &${name(variable)}[${index}]);\n`;
  };

  gen.forBlock['array_length'] = function (block, generator) {
    const variable = block.getField('VAR').getVariable();
    const declareBlock = findArrayDeclareBlock(generator.workspace, variable.getId());
    const size = declareBlock ? declareBlock.getFieldValue('SIZE') : cfg.MISSING_VALUE;
    return [String(size), Order.ATOMIC];
  };

  return gen;
}
