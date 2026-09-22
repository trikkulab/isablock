import { Order, ARITH_OPS, COMPARE_SYMBOLS_ASCII, chainNextBlock, sanitizeIdentifier, isBooleanExpr, isTextExpr } from './common.js';

const C_KEYWORDS = new Set([
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
  'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'int',
  'long', 'register', 'return', 'short', 'signed', 'sizeof', 'static',
  'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile',
  'while', 'inline', 'restrict', 'main', 'printf', 'scanf',
]);

const LOGIC_SYMBOLS = { AND: '&&', OR: '||' };
const ARITH_SYMBOLS = { ADD: '+', SUB: '-', MUL: '*', DIV: '/', MOD: '%' };

// workspace.arraySizes (Map<variabileId, dimensione>) e' popolata dal
// validator dei blocchi vettore (src/blocks/blocks.js) o ripristinata da un
// file (src/persistence.js): qui la si legge soltanto, con lo stesso
// ripiego "creala se manca" per restare robusti anche in un workspace
// headless di test che non e' mai passato da main.js.
function getArraySizes(workspace) {
  if (!workspace.arraySizes) workspace.arraySizes = new Map();
  return workspace.arraySizes;
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
    const body = generator.statementToCode(block, 'BODY');
    // Solo le variabili davvero usate da almeno un blocco: evita di
    // dichiarare in C variabili "orfane" (es. il valore di default di un
    // campo variabile mai personalizzato, o rimasto tale dopo aver
    // cambiato blocco/variabile). Raggruppate per tipo: una riga "int ...",
    // una "bool ..." e una riga per vettore (dimensioni diverse, non
    // raggruppabili in una dichiarazione sola restando leggibili).
    const usedVars = Blockly.Variables.allUsedVarModels(generator.workspace);
    const numberVars = [...new Set(usedVars.filter((v) => v.type === '').map(name))];
    const boolVars = [...new Set(usedVars.filter((v) => v.type === 'Boolean').map(name))];
    const arrayVars = usedVars.filter((v) => v.type === 'Array');
    const arraySizes = getArraySizes(generator.workspace);
    let decl = '';
    if (numberVars.length) decl += `${generator.INDENT}int ${numberVars.join(', ')};\n`;
    if (boolVars.length) decl += `${generator.INDENT}bool ${boolVars.join(', ')};\n`;
    for (const variable of arrayVars) {
      decl += `${generator.INDENT}int ${name(variable)}[${arraySizes.get(variable.getId())}] = {0};\n`;
    }
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

  gen.forBlock['controls_for_simple'] = function (block, generator) {
    const variable = block.getField('VAR').getVariable();
    const v = name(variable);
    const from = generator.valueToCode(block, 'FROM', Order.NONE) || cfg.MISSING_VALUE;
    const to = generator.valueToCode(block, 'TO', Order.NONE) || cfg.MISSING_VALUE;
    const body = generator.statementToCode(block, 'BODY');
    return `for (${v} = ${from}; ${v} <= ${to}; ${v}++) {\n${body}}\n`;
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
    const size = getArraySizes(generator.workspace).get(variable.getId());
    return [String(size ?? 0), Order.ATOMIC];
  };

  return gen;
}
