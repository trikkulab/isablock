// Converte lo pseudocodice di IsaBlock (quello scritto negli appunti) nello
// stato serializzato di un workspace Blockly, cioè lo stesso JSON che l'app
// salva con "Salva" e riapre con "Apri".
//
// L'indentazione del testo viene ignorata: la struttura si ricava solo dalle
// parole chiave (INIZIO/FINE, FINE SE, FINE RIPETI...). Se una riga non si
// capisce, l'errore dice quale (numero di riga compreso): niente viene
// corretto o indovinato in silenzio.

export class PseudoError extends Error {}

// --- Espressioni -------------------------------------------------------

const RESERVED = new Set(['E', 'O', 'NON', 'VERO', 'FALSO', 'mod']);
const COMPARE = { '=': 'EQ', '≠': 'NEQ', '<': 'LT', '≤': 'LTE', '>': 'GT', '≥': 'GTE' };
const ARITH = { '+': 'ADD', '-': 'SUB', '×': 'MUL', '÷': 'DIV', mod: 'MOD' };

function tokenize(src, lineNo) {
  const text = src.replace(/−/g, '-').replace(/<=/g, '≤').replace(/>=/g, '≥').replace(/!=|<>/g, '≠');
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '"') {
      const end = text.indexOf('"', i + 1);
      if (end < 0) throw new PseudoError(`riga ${lineNo}: virgolette non chiuse`);
      tokens.push({ t: 'str', v: text.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const num = /^\d+/.exec(text.slice(i));
    if (num) { tokens.push({ t: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
    const word = /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ_0-9]*/.exec(text.slice(i));
    if (word) { tokens.push({ t: 'word', v: word[0] }); i += word[0].length; continue; }
    if ('+-×÷=≠<≤>≥()'.includes(ch)) { tokens.push({ t: 'op', v: ch }); i++; continue; }
    if (ch === '*') { tokens.push({ t: 'op', v: '×' }); i++; continue; }
    if (ch === '/') { tokens.push({ t: 'op', v: '÷' }); i++; continue; }
    throw new PseudoError(`riga ${lineNo}: carattere non riconosciuto «${ch}»`);
  }
  return tokens;
}

// Precedenza (dalla più debole): O, E, NON, confronto, + -, × ÷ mod.
// Restituisce un albero {k:'num'|'var'|'bool'|'str'|'arith'|'cmp'|'and'|'or'|'not'}.
function parseExpression(src, lineNo, boolVars) {
  const tokens = tokenize(src, lineNo);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
  const isWord = (v) => peek() && peek().t === 'word' && peek().v === v;
  const fail = (msg) => { throw new PseudoError(`riga ${lineNo}: ${msg} in «${src.trim()}»`); };

  function parseOr() {
    let left = parseAnd();
    while (isWord('O')) { pos++; left = { k: 'or', a: left, b: parseAnd() }; }
    return left;
  }
  function parseAnd() {
    let left = parseNot();
    while (isWord('E')) { pos++; left = { k: 'and', a: left, b: parseNot() }; }
    return left;
  }
  function parseNot() {
    if (isWord('NON')) { pos++; return { k: 'not', a: parseNot() }; }
    return parseCompare();
  }
  function parseCompare() {
    const left = parseSum();
    const tk = peek();
    if (tk && tk.t === 'op' && COMPARE[tk.v]) {
      pos++;
      return { k: 'cmp', op: COMPARE[tk.v], a: left, b: parseSum() };
    }
    return left;
  }
  function parseSum() {
    let left = parseProduct();
    while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = ARITH[tokens[pos++].v];
      left = { k: 'arith', op, a: left, b: parseProduct() };
    }
    return left;
  }
  function parseProduct() {
    let left = parseAtom();
    while (peek() && ((peek().t === 'op' && (peek().v === '×' || peek().v === '÷')) || isWord('mod'))) {
      const op = ARITH[tokens[pos++].v];
      left = { k: 'arith', op, a: left, b: parseAtom() };
    }
    return left;
  }
  function parseAtom() {
    const tk = peek();
    if (!tk) fail('espressione incompleta');
    if (tk.t === 'num') { pos++; return { k: 'num', v: tk.v }; }
    if (tk.t === 'str') { pos++; return { k: 'str', v: tk.v }; }
    if (tk.t === 'op' && tk.v === '-') {
      // meno unario: solo davanti a un numero (-1), come scrive il libro
      const next = tokens[pos + 1];
      if (next && next.t === 'num') { pos += 2; return { k: 'num', v: -next.v }; }
      fail('meno davanti a qualcosa che non è un numero');
    }
    if (tk.t === 'op' && tk.v === '(') {
      pos++;
      const inner = parseOr();
      if (!isOp(')')) fail('parentesi non chiusa');
      pos++;
      return inner;
    }
    if (tk.t === 'word') {
      pos++;
      if (tk.v === 'VERO' || tk.v === 'FALSO') return { k: 'bool', v: tk.v === 'VERO' };
      if (RESERVED.has(tk.v)) fail(`parola riservata «${tk.v}» usata come variabile`);
      return { k: 'var', name: tk.v, bool: boolVars.has(tk.v) };
    }
    return fail(`simbolo inatteso «${tk.v}»`);
  }

  const tree = parseOr();
  if (pos < tokens.length) fail(`resta del testo non capito («${tokens[pos].v}»)`);
  return tree;
}

// --- Istruzioni --------------------------------------------------------

// Una riga = una istruzione semplice o l'apertura/chiusura di una struttura.
export function parsePseudocode(text) {
  const lines = text
    .split(/\r?\n/)
    .map((raw, i) => ({ no: i + 1, s: raw.trim() }))
    .filter((l) => l.s !== '');

  // Variabili booleane: quelle a cui si assegna VERO/FALSO. Servono prima
  // di leggere le espressioni, per scegliere il blocco giusto (un flag è un
  // blocco diverso da una variabile numerica).
  const boolVars = new Set();
  for (const l of lines) {
    const m = /^ASSEGNA A ([A-Za-zÀ-ÿ_][\w]*) IL VALORE (VERO|FALSO)\s*$/.exec(l.s);
    if (m) boolVars.add(m[1]);
  }

  const variables = new Map(); // nome -> bool?
  const noteVar = (name) => { if (!variables.has(name)) variables.set(name, boolVars.has(name)); };

  let idx = 0;
  const cur = () => lines[idx];
  const fail = (l, msg) => { throw new PseudoError(`riga ${l ? l.no : '?'}: ${msg}${l ? ` («${l.s}»)` : ''}`); };
  const expr = (src, l) => parseExpression(src, l.no, boolVars);

  // Legge istruzioni finché trova una riga che chiude il blocco corrente.
  function parseBlock(isEnd) {
    const out = [];
    while (idx < lines.length && !isEnd(cur())) out.push(parseStatement());
    return out;
  }

  function parseStatement() {
    const l = cur();
    const s = l.s;
    let m;

    if (s.startsWith('//')) {
      idx++;
      return { k: 'comment', text: s.slice(2).trim() };
    }
    if ((m = /^LEGGI ([A-Za-zÀ-ÿ_]\w*)$/.exec(s))) {
      idx++; noteVar(m[1]);
      return { k: 'read', name: m[1] };
    }
    if ((m = /^SCRIVI (.+)$/.exec(s))) {
      idx++;
      const e = expr(m[1], l);
      collectVars(e);
      return { k: 'write', e };
    }
    if ((m = /^ASSEGNA A ([A-Za-zÀ-ÿ_]\w*) IL VALORE (.+)$/.exec(s))) {
      idx++; noteVar(m[1]);
      const e = expr(m[2], l);
      collectVars(e);
      return { k: 'assign', name: m[1], e };
    }
    if ((m = /^RIPETI (.+) VOLTE$/.exec(s))) {
      idx++;
      const times = expr(m[1], l); collectVars(times);
      const body = parseBlock((x) => x.s === 'FINE RIPETI');
      closeWith('FINE RIPETI', l);
      return { k: 'repeat', times, body };
    }
    if ((m = /^PER ([A-Za-zÀ-ÿ_]\w*) DA (.+) A (.+?)(?: PASSO (-?\d+))?$/.exec(s))) {
      idx++; noteVar(m[1]);
      const from = expr(m[2], l); const to = expr(m[3], l);
      collectVars(from); collectVars(to);
      const body = parseBlock((x) => x.s === 'FINE PER');
      closeWith('FINE PER', l);
      return { k: 'for', name: m[1], from, to, step: m[4] ? Number(m[4]) : 1, body };
    }
    if ((m = /^SE (.+) ALLORA$/.exec(s))) {
      idx++;
      const cond = expr(m[1], l); collectVars(cond);
      const thenBody = parseBlock((x) => x.s === 'ALTRIMENTI' || x.s === 'FINE SE');
      let elseBody = null;
      if (cur() && cur().s === 'ALTRIMENTI') {
        idx++;
        elseBody = parseBlock((x) => x.s === 'FINE SE');
      }
      closeWith('FINE SE', l);
      return { k: 'if', cond, thenBody, elseBody };
    }
    if ((m = /^MENTRE (.+) ESEGUI$/.exec(s))) {
      idx++;
      const cond = expr(m[1], l); collectVars(cond);
      const body = parseBlock((x) => x.s === 'FINE MENTRE');
      closeWith('FINE MENTRE', l);
      return { k: 'while', cond, body };
    }
    if (s === 'ESEGUI') {
      idx++;
      // ESEGUI ... MENTRE condizione (la riga di chiusura non finisce con ESEGUI)
      const body = parseBlock((x) => /^MENTRE /.test(x.s) && !/ ESEGUI$/.test(x.s));
      const endLine = cur();
      if (!endLine) fail(l, 'ESEGUI senza il MENTRE finale');
      idx++;
      const cond = expr(endLine.s.slice('MENTRE '.length), endLine); collectVars(cond);
      return { k: 'dowhile', cond, body };
    }
    return fail(l, 'istruzione non riconosciuta');
  }

  function closeWith(keyword, openLine) {
    if (!cur() || cur().s !== keyword) fail(openLine, `manca «${keyword}» per chiudere questa riga`);
    idx++;
  }

  function collectVars(e) {
    if (!e) return;
    if (e.k === 'var') noteVar(e.name);
    collectVars(e.a); collectVars(e.b);
  }

  // Programma: INIZIO ... FINE
  if (!lines.length || lines[0].s !== 'INIZIO') fail(lines[0], 'il programma deve cominciare con INIZIO');
  idx = 1;
  const program = parseBlock((l) => l.s === 'FINE');
  if (!cur() || cur().s !== 'FINE') fail(lines[lines.length - 1], 'il programma deve finire con FINE');
  if (idx + 1 < lines.length) fail(lines[idx + 1], 'testo dopo FINE');

  return toWorkspaceState(program, variables);
}

// --- Albero -> stato Blockly ------------------------------------------

const varId = (name) => `var_${name}`;

function toWorkspaceState(program, variables) {
  let counter = 0;
  const nid = (prefix) => `${prefix}_${++counter}`;

  const exprBlock = (e) => {
    switch (e.k) {
      case 'num': return { type: 'number_literal', id: nid('n'), fields: { VALUE: e.v } };
      case 'str': return { type: 'text_literal', id: nid('t'), fields: { TEXT: e.v } };
      case 'bool': return { type: 'bool_literal', id: nid('b'), fields: { VALUE: e.v ? 'TRUE' : 'FALSE' } };
      case 'var':
        return { type: e.bool ? 'variable_get_bool' : 'variable_get', id: nid('g'), fields: { VAR: { id: varId(e.name) } } };
      case 'arith':
        return { type: 'arith_op', id: nid('ar'), fields: { OP: e.op }, inputs: { A: { block: exprBlock(e.a) }, B: { block: exprBlock(e.b) } } };
      case 'cmp':
        return { type: 'compare_op', id: nid('cmp'), fields: { OP: e.op }, inputs: { A: { block: exprBlock(e.a) }, B: { block: exprBlock(e.b) } } };
      case 'and':
      case 'or':
        return { type: 'logic_op', id: nid('lg'), fields: { OP: e.k === 'and' ? 'AND' : 'OR' }, inputs: { A: { block: exprBlock(e.a) }, B: { block: exprBlock(e.b) } } };
      case 'not':
        return { type: 'not_op', id: nid('not'), inputs: { A: { block: exprBlock(e.a) } } };
      default: throw new PseudoError(`espressione sconosciuta ${e.k}`);
    }
  };

  const chain = (stmts) => {
    let head = null;
    for (let i = stmts.length - 1; i >= 0; i--) {
      const b = stmtBlock(stmts[i]);
      if (head) b.next = { block: head };
      head = b;
    }
    return head;
  };

  const body = (stmts) => (stmts.length ? { block: chain(stmts) } : undefined);

  const stmtBlock = (s) => {
    const inputs = {};
    const set = (name, v) => { if (v) inputs[name] = v; };
    switch (s.k) {
      case 'comment': return { type: 'comment_line', id: nid('c'), fields: { TEXT: s.text } };
      case 'read': return { type: 'read', id: nid('r'), fields: { VAR: { id: varId(s.name) } } };
      case 'write': return { type: 'write', id: nid('w'), inputs: { VALUE: { block: exprBlock(s.e) } } };
      case 'assign':
        return { type: 'assign', id: nid('a'), fields: { VAR: { id: varId(s.name) } }, inputs: { VALUE: { block: exprBlock(s.e) } } };
      case 'repeat':
        set('TIMES', { block: exprBlock(s.times) }); set('BODY', body(s.body));
        return { type: 'repeat_times', id: nid('rep'), inputs };
      case 'for':
        set('FROM', { block: exprBlock(s.from) }); set('TO', { block: exprBlock(s.to) }); set('BODY', body(s.body));
        return { type: 'controls_for_simple', id: nid('for'), fields: { VAR: { id: varId(s.name) }, STEP: s.step }, inputs };
      case 'if':
        set('COND', { block: exprBlock(s.cond) }); set('THEN', body(s.thenBody));
        if (s.elseBody) {
          set('ELSE', body(s.elseBody));
          return { type: 'controls_if_else', id: nid('if'), inputs };
        }
        return { type: 'controls_if_simple', id: nid('if'), inputs };
      case 'while':
        set('COND', { block: exprBlock(s.cond) }); set('BODY', body(s.body));
        return { type: 'controls_while', id: nid('wh'), inputs };
      case 'dowhile':
        set('BODY', body(s.body)); set('COND', { block: exprBlock(s.cond) });
        return { type: 'controls_do_while', id: nid('dw'), inputs };
      default: throw new PseudoError(`istruzione sconosciuta ${s.k}`);
    }
  };

  const programBlock = { type: 'program', id: 'program', x: 0, y: 0 };
  const first = chain(program);
  if (first) programBlock.inputs = { BODY: { block: first } };

  return {
    blocks: { languageVersion: 0, blocks: [programBlock] },
    variables: [...variables].map(([name, isBool]) => (isBool
      ? { name, id: varId(name), type: 'Boolean' }
      : { name, id: varId(name) })),
  };
}
