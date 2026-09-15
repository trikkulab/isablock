// Utilita' condivise dai tre generatori (pseudocodice/C/Python), cosi'
// che un costrutto tradotto in modo incoerente tra i tre output sia
// strutturalmente difficile da scrivere per errore: la precedenza degli
// operatori e il chaining delle istruzioni vivono in un solo posto.

// Ordini di precedenza (numero piu' basso = lega piu' stretto). Comuni
// alle tre grammatiche perche' i tre output devono restare equivalenti.
export const Order = {
  ATOMIC: 0,
  UNARY_NOT: 1,
  MULTIPLICATIVE: 2,
  ADDITIVE: 3,
  RELATIONAL: 4,
  LOGICAL_AND: 5,
  LOGICAL_OR: 6,
  NONE: 99,
};

// Left: ordine richiesto all'operando sinistro senza aggiungere parentesi
// superflue. Right: ordine richiesto all'operando destro - piu' stretto
// per gli operatori non associativi (- e /), cosi' "a - (b - c)" non
// perde le parentesi necessarie.
export const ARITH_OPS = {
  ADD: { order: Order.ADDITIVE, rightOrder: Order.ADDITIVE },
  SUB: { order: Order.ADDITIVE, rightOrder: Order.ATOMIC },
  MUL: { order: Order.MULTIPLICATIVE, rightOrder: Order.MULTIPLICATIVE },
  DIV: { order: Order.MULTIPLICATIVE, rightOrder: Order.ATOMIC },
  MOD: { order: Order.MULTIPLICATIVE, rightOrder: Order.ATOMIC },
};

export const COMPARE_SYMBOLS_ASCII = {
  EQ: '==',
  NEQ: '!=',
  LT: '<',
  LTE: '<=',
  GT: '>',
  GTE: '>=',
};

// Concatena il blocco successivo nella pila (previous/nextStatement).
// Identica per i tre generatori: la sequenza si comporta sempre allo
// stesso modo, indipendentemente da come viene resa testualmente.
export function chainNextBlock(generator, block, code) {
  const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
  const nextCode = nextBlock ? generator.blockToCode(nextBlock) : '';
  return code + nextCode;
}

const RESERVED_SUFFIX = '_var';

// Evita di generare identificatori che collidono con parole chiave del
// linguaggio di destinazione (es. una variabile chiamata "for" o "int").
// Lo pseudocodice non ne ha bisogno: non e' un linguaggio da compilare.
export function sanitizeIdentifier(name, reservedWords) {
  const safe = String(name).replace(/[^A-Za-z0-9_]/g, '_').replace(/^([0-9])/, '_$1') || '_';
  return reservedWords.has(safe.toLowerCase()) ? safe + RESERVED_SUFFIX : safe;
}
