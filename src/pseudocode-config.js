// Parole chiave e simboli usati dal generatore di pseudocodice.
// Modifica questi valori per adattare lo stile alla convenzione del libro
// di testo della classe: non serve toccare la logica dei generatori.
export const pseudocodeConfig = {
  PROGRAM_START: 'INIZIO',
  PROGRAM_END: 'FINE',
  // Sezione dichiarazioni: compare solo se il programma dichiara almeno un
  // array (vedi src/codegen/pseudocode.js), altrimenti resta invariato lo
  // stile INIZIO...FINE di sempre.
  DECLARATIONS: 'DICHIARAZIONI',
  DECLARE_ARRAY: 'DICHIARA ARRAY',
  OF: 'DI',
  ELEMENTS: 'ELEMENTI',

  READ: 'LEGGI',
  WRITE: 'SCRIVI',
  ASSIGN_TO: 'ASSEGNA A',
  ASSIGN_VALUE: 'IL VALORE',

  IF: 'SE',
  THEN: 'ALLORA',
  ELSE: 'ALTRIMENTI',
  END_IF: 'FINE SE',

  WHILE: 'MENTRE',
  DO: 'RIPETI',
  END_WHILE: 'FINE MENTRE',

  // Iterazione a condizione finale: ESEGUI ... MENTRE condizione.
  DO_WHILE_START: 'ESEGUI',
  DO_WHILE_END: 'MENTRE',

  FOR: 'PER',
  FROM: 'DA',
  TO: 'A',
  STEP: 'PASSO',
  END_FOR: 'FINE PER',

  REPEAT: 'RIPETI',
  TIMES: 'VOLTE',
  END_REPEAT: 'FINE RIPETI',

  AND: 'E',
  OR: 'O',
  NOT: 'NON',
  TRUE: 'vero',
  FALSE: 'falso',

  EQ: '=',
  NEQ: '≠',
  LT: '<',
  LTE: '≤',
  GT: '>',
  GTE: '≥',

  ADD: '+',
  SUB: '-',
  MUL: '×',
  DIV: '÷',
  MOD: 'mod',

  LENGTH_OF: 'LUNGHEZZA DI',

  COMMENT: '//',

  INDENT: '   ',

  // Segnaposto mostrati quando un blocco ha uno slot vuoto: rendono
  // visibile che il programma e' incompleto invece di generare codice
  // silenziosamente sbagliato (es. sostituire un valore mancante con 0).
  MISSING_VALUE: '⟨valore?⟩',
  MISSING_CONDITION: '⟨condizione?⟩',
};
