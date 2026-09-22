// Definizione dei blocchi custom per la Fase 1.
//
// Per aggiungere un nuovo blocco in futuro: aggiungere una voce a questo
// array (o un nuovo Blockly.Blocks[...] per logica non esprimibile in
// JSON) e una funzione generatore in ciascuno dei tre file in src/codegen/.
// Nient'altro nell'editor deve essere toccato.
//
// Convenzione colori: il colore comunica il "tipo" del blocco allo
// studente, oltre alle connessioni tipizzate (che impediscono comunque
// l'incastro sbagliato anche se lo studente ignora il colore).
export const COLOR_PROGRAM = '#5b6770';
export const COLOR_STATEMENT = '#4a6fa5';
export const COLOR_NUMBER = '#e0a458';
export const COLOR_BOOLEAN = '#c1666b';
export const COLOR_COMMENT = '#8a94a6';
export const COLOR_TEXT = '#4f9d8d';
export const COLOR_ARRAY = '#5f7a61';

const blockDefinitions = [
  // --- Struttura -----------------------------------------------------
  {
    type: 'program',
    message0: 'INIZIO',
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'BODY' }],
    message2: 'FINE',
    colour: COLOR_PROGRAM,
  },

  // --- Istruzioni ------------------------------------------------------
  // 'assign' non e' qui: il suo VALUE deve accettare Number o Boolean a
  // seconda del tipo della variabile scelta in VAR, cosa che una definizione
  // JSON statica non puo' esprimere. E' definito subito sotto con
  // Blockly.Blocks['assign'] = {...}.
  {
    type: 'read',
    message0: 'LEGGI %1',
    args0: [
      {
        type: 'field_variable',
        name: 'VAR',
        variable: 'variabile',
        variableTypes: [''],
        defaultType: '',
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_STATEMENT,
    tooltip: 'Legge un valore in input e lo salva in una variabile',
  },
  {
    type: 'write',
    message0: 'SCRIVI %1',
    args0: [{ type: 'input_value', name: 'VALUE', check: ['Number', 'Boolean', 'Text'] }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_STATEMENT,
    tooltip: 'Stampa in output il valore di un’espressione',
  },
  {
    type: 'controls_if_simple',
    message0: 'SE %1 ALLORA',
    args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }],
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'THEN' }],
    message2: 'FINE SE',
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_STATEMENT,
    tooltip: 'Selezione semplice',
  },
  {
    type: 'controls_if_else',
    message0: 'SE %1 ALLORA',
    args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }],
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'THEN' }],
    message2: 'ALTRIMENTI',
    message3: '%1',
    args3: [{ type: 'input_statement', name: 'ELSE' }],
    message4: 'FINE SE',
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_STATEMENT,
    tooltip: 'Selezione con alternativa',
  },
  {
    type: 'controls_while',
    message0: 'MENTRE %1 RIPETI',
    args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }],
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'BODY' }],
    message2: 'FINE MENTRE',
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_STATEMENT,
    tooltip: 'Iterazione a condizione iniziale (condizione valutata prima di ogni ripetizione)',
  },
  {
    type: 'controls_for_simple',
    message0: 'PER %1 DA %2 A %3',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'i', variableTypes: [''], defaultType: '' },
      { type: 'input_value', name: 'FROM', check: 'Number' },
      { type: 'input_value', name: 'TO', check: 'Number' },
    ],
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'BODY' }],
    message2: 'FINE PER',
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_STATEMENT,
    tooltip: 'Iterazione a contatore, da un valore iniziale a un valore finale incluso, passo 1',
  },
  {
    type: 'repeat_times',
    message0: 'RIPETI %1 VOLTE',
    args0: [{ type: 'input_value', name: 'TIMES', check: 'Number' }],
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'BODY' }],
    message2: 'FINE RIPETI',
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_STATEMENT,
    tooltip: 'Ripete le istruzioni un numero di volte fissato, senza bisogno di un contatore',
  },

  // --- Commenti ----------------------------------------------------------
  {
    type: 'comment_line',
    message0: '// %1',
    args0: [{ type: 'field_input', name: 'TEXT', text: 'commento' }],
    previousStatement: null,
    nextStatement: null,
    colour: COLOR_COMMENT,
    tooltip: 'Nota per chi legge il codice: non ha alcun effetto sull’esecuzione',
  },

  // --- Espressioni numeriche -------------------------------------------
  {
    type: 'number_literal',
    message0: '%1',
    args0: [{ type: 'field_number', name: 'VALUE', value: 0, precision: 1 }],
    output: 'Number',
    colour: COLOR_NUMBER,
  },
  {
    type: 'variable_get',
    message0: '%1',
    args0: [
      {
        type: 'field_variable',
        name: 'VAR',
        variable: 'variabile',
        variableTypes: [''],
        defaultType: '',
      },
    ],
    output: 'Number',
    colour: COLOR_NUMBER,
  },
  {
    type: 'arith_op',
    message0: '%1 %2 %3',
    args0: [
      { type: 'input_value', name: 'A', check: 'Number' },
      {
        type: 'field_dropdown',
        name: 'OP',
        options: [
          ['+', 'ADD'],
          ['−', 'SUB'],
          ['×', 'MUL'],
          ['÷', 'DIV'],
          ['mod', 'MOD'],
        ],
      },
      { type: 'input_value', name: 'B', check: 'Number' },
    ],
    inputsInline: true,
    output: 'Number',
    colour: COLOR_NUMBER,
  },

  // --- Espressioni booleane ---------------------------------------------
  {
    type: 'compare_op',
    message0: '%1 %2 %3',
    args0: [
      { type: 'input_value', name: 'A', check: 'Number' },
      {
        type: 'field_dropdown',
        name: 'OP',
        options: [
          ['=', 'EQ'],
          ['≠', 'NEQ'],
          ['<', 'LT'],
          ['≤', 'LTE'],
          ['>', 'GT'],
          ['≥', 'GTE'],
        ],
      },
      { type: 'input_value', name: 'B', check: 'Number' },
    ],
    inputsInline: true,
    output: 'Boolean',
    colour: COLOR_BOOLEAN,
  },
  {
    type: 'logic_op',
    message0: '%1 %2 %3',
    args0: [
      { type: 'input_value', name: 'A', check: 'Boolean' },
      {
        type: 'field_dropdown',
        name: 'OP',
        options: [
          ['E', 'AND'],
          ['O', 'OR'],
        ],
      },
      { type: 'input_value', name: 'B', check: 'Boolean' },
    ],
    inputsInline: true,
    output: 'Boolean',
    colour: COLOR_BOOLEAN,
  },
  {
    type: 'not_op',
    message0: 'NON %1',
    args0: [{ type: 'input_value', name: 'A', check: 'Boolean' }],
    inputsInline: true,
    output: 'Boolean',
    colour: COLOR_BOOLEAN,
  },
  {
    type: 'bool_literal',
    message0: '%1',
    args0: [
      {
        type: 'field_dropdown',
        name: 'VALUE',
        options: [
          ['vero', 'TRUE'],
          ['falso', 'FALSE'],
        ],
      },
    ],
    output: 'Boolean',
    colour: COLOR_BOOLEAN,
  },
  {
    type: 'variable_get_bool',
    message0: '%1',
    args0: [
      {
        type: 'field_variable',
        name: 'VAR',
        variable: 'flag',
        variableTypes: ['Boolean'],
        defaultType: 'Boolean',
      },
    ],
    output: 'Boolean',
    colour: COLOR_BOOLEAN,
  },

  // --- Espressioni testuali (solo livello A: testo letterale in SCRIVI,
  // nessuna variabile di testo, vedi docs/DECISIONI-ESTENSIONI.md) ---------
  {
    type: 'text_literal',
    message0: '%1',
    args0: [{ type: 'field_input', name: 'TEXT', text: 'testo' }],
    output: 'Text',
    colour: COLOR_TEXT,
    tooltip: 'Testo letterale, usabile solo dentro SCRIVI',
  },
];

export function registerBlocks(Blockly) {
  Blockly.common.defineBlocksWithJsonArray(blockDefinitions);

  // 'assign' e' definito a mano, non nell'array JSON sopra: il check del suo
  // input VALUE deve seguire il tipo della variabile scelta in VAR (Number o
  // Boolean), cosa che una definizione JSON statica non puo' esprimere.
  //
  // Il check si aggiorna in DUE punti, non in un 'onchange' del blocco:
  // onchange e' un ascoltatore di eventi Blockly, consegnati in modo
  // ASINCRONO (in coda a un giro di event loop) - troppo tardi quando un
  // file viene ricaricato, perche' Blockly ricollega subito, nello stesso
  // giro sincrono, il blocco figlio salvato (es. un confronto o
  // vero/falso) prima che l'evento asincrono abbia potuto aggiornare il
  // check (verificato: il caricamento falliva con "expected Boolean,
  // found Number" perche' il check era ancora quello di default).
  // - Il VALIDATOR del campo VAR gira sincronamente dentro setValue(),
  //   quando lo studente sceglie la variabile a mano nell'editor.
  // - Blockly.serialization.workspaces.load(), pero', ripristina il campo
  //   con field.loadState(), che NON passa dal validator (verificato):
  //   va quindi intercettato a parte, avvolgendo loadState() cosi' da
  //   aggiornare il check subito dopo, ancora prima che Blockly provi a
  //   ricollegare il valore salvato.
  Blockly.Blocks['assign'] = {
    init: function () {
      this.jsonInit({
        message0: 'ASSEGNA A %1 IL VALORE %2',
        args0: [
          {
            type: 'field_variable',
            name: 'VAR',
            variable: 'variabile',
            variableTypes: ['', 'Boolean'],
            defaultType: '',
          },
          { type: 'input_value', name: 'VALUE', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        colour: COLOR_STATEMENT,
        tooltip: 'Assegna il valore di un’espressione a una variabile',
      });
      const block = this;
      const field = this.getField('VAR');
      function updateValueCheck(variableId) {
        const variable = block.workspace.getVariableMap().getVariableById(variableId);
        const check = variable && variable.type === 'Boolean' ? 'Boolean' : 'Number';
        block.getInput('VALUE').connection.setCheck(check);
      }
      field.setValidator(function (newVariableId) {
        updateValueCheck(newVariableId);
        return newVariableId;
      });
      const originalLoadState = field.loadState.bind(field);
      field.loadState = function (state) {
        originalLoadState(state);
        updateValueCheck(field.getValue());
      };
    },
  };

  // --- Vettori (solo interi, dimensione fissa scelta alla creazione) -----
  // I quattro blocchi condividono lo stesso campo VAR (variableTypes:
  // ['Array']) e lo stesso meccanismo di creazione: quando si sceglie
  // "Crea variabile..." dal menu del campo, il validator (sincrono, gira
  // dentro field.setValue()) chiede subito anche la dimensione con un
  // secondo prompt e la registra in workspace.arraySizes - una Map
  // <variabileId, dimensione> attaccata al workspace (stesso stile ad-hoc
  // gia' usato da generator.repeatDepth in src/codegen/c.js), perche'
  // Blockly non serializza dati extra sulle variabili di suo.
  //
  // A differenza di 'assign' con i booleani, qui NON serve intercettare
  // anche field.loadState(): nessuno dei quattro blocchi ha un check di
  // connessione che dipende dalla dimensione (INDEX e VALUE sono sempre
  // 'Number', fissi), quindi non c'e' rischio che Blockly rifiuti di
  // ricollegare un figlio salvato durante il caricamento di un file.
  // workspace.arraySizes viene ripristinato da src/persistence.js subito
  // dopo il caricamento, in tempo per quando generatori e interprete ne
  // avranno bisogno (loro sì, a differenza di Blockly stesso, lo leggono
  // solo dopo che il workspace è stato ricostruito per intero).
  //
  // Verificato empiricamente un altro caso non ovvio: quando un blocco
  // vettore viene creato per la prima volta (anche solo trascinandolo dalla
  // tavolozza, senza che lo studente tocchi il menu VAR), Blockly assegna da
  // solo una variabile Array di default per riempire il campo - un percorso
  // interno che, come loadState, NON passa dal validator. Senza contromisura
  // il primissimo vettore di un programma resterebbe senza dimensione
  // registrata. Per questo ensureArraySize() viene richiamata sia dal
  // validator sia una volta subito dopo jsonInit, sul valore iniziale del
  // campo. Per lo stesso motivo "Annulla" sul prompt non cancella la
  // variabile (si era provato: Blockly ne ricrea subito un'altra di
  // default, altrettanto priva di dimensione, in un ciclo senza uscita) ma
  // assegna una dimensione predefinita (10), che lo studente puo' comunque
  // correggere ricreando la variabile con un altro nome.
  const DEFAULT_ARRAY_SIZE = 10;

  function getArraySizes(workspace) {
    if (!workspace.arraySizes) workspace.arraySizes = new Map();
    return workspace.arraySizes;
  }

  function promptArraySize(variableName) {
    for (;;) {
      const answer = window.prompt(
        `Quanti elementi ha il vettore "${variableName}"? (numero fisso, per esempio 10)`,
        String(DEFAULT_ARRAY_SIZE)
      );
      if (answer === null) return DEFAULT_ARRAY_SIZE; // Annulla: dimensione predefinita
      const trimmed = answer.trim();
      if (/^[1-9]\d*$/.test(trimmed)) {
        return parseInt(trimmed, 10);
      }
      window.alert('Inserisci un numero intero maggiore di zero.');
    }
  }

  function ensureArraySize(workspace, variableId) {
    const arraySizes = getArraySizes(workspace);
    if (arraySizes.has(variableId)) return;
    const variable = workspace.getVariableMap().getVariableById(variableId);
    if (!variable) {
      // Verificato su un workspace renderizzato (non nell'equivalente
      // headless): initModel() puo' scattare per un istante prima che la
      // variabile sia gia' registrata nella variable map (es. durante
      // initSvg()/render() chiamati subito dopo la creazione del blocco).
      // Si riprova al giro successivo invece di fallire: e' un caso limite
      // dell'ordine interno di Blockly, non qualcosa su cui possiamo contare.
      setTimeout(() => ensureArraySize(workspace, variableId), 0);
      return;
    }
    arraySizes.set(variableId, promptArraySize(variable.name));
  }

  function attachArraySizeValidator(block) {
    const field = block.getField('VAR');
    field.setValidator(function (newVariableId) {
      ensureArraySize(block.workspace, newVariableId);
      return newVariableId;
    });
    // Il valore iniziale del campo (creato da Blockly stesso a partire da
    // 'variable'/'defaultType' nel JSON) non esiste ancora subito dopo
    // jsonInit: il campo risolve/crea la variabile vera e propria solo in
    // initModel() (verificato: leggerla prima restituisce un id senza
    // variabile corrispondente). Il validator da solo non la vedrebbe mai,
    // quindi va intercettato anche questo, sullo stesso modello di
    // field.loadState per 'assign'.
    const originalInitModel = field.initModel.bind(field);
    field.initModel = function () {
      originalInitModel();
      ensureArraySize(block.workspace, field.getValue());
    };
  }

  // Ripetuta identica in ciascun blocco (non condivisa come oggetto: alcuni
  // percorsi interni di Blockly possono annotare l'oggetto args passato a
  // jsonInit, quindi condividere lo stesso riferimento tra piu' blocchi
  // rischierebbe un'interferenza tra loro).
  const arrayVarFieldSpec = () => ({
    type: 'field_variable',
    name: 'VAR',
    variable: 'v',
    variableTypes: ['Array'],
    defaultType: 'Array',
  });

  Blockly.Blocks['array_get'] = {
    init: function () {
      this.jsonInit({
        message0: '%1[%2]',
        args0: [arrayVarFieldSpec(), { type: 'input_value', name: 'INDEX', check: 'Number' }],
        inputsInline: true,
        output: 'Number',
        colour: COLOR_ARRAY,
        tooltip: 'Elemento del vettore in posizione INDICE (indice da 0)',
      });
      attachArraySizeValidator(this);
    },
  };

  Blockly.Blocks['array_set'] = {
    init: function () {
      this.jsonInit({
        message0: 'ASSEGNA A %1[%2] IL VALORE %3',
        args0: [
          arrayVarFieldSpec(),
          { type: 'input_value', name: 'INDEX', check: 'Number' },
          { type: 'input_value', name: 'VALUE', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        colour: COLOR_STATEMENT,
        tooltip: 'Assegna un valore a un elemento del vettore',
      });
      attachArraySizeValidator(this);
    },
  };

  Blockly.Blocks['array_read'] = {
    init: function () {
      this.jsonInit({
        message0: 'LEGGI %1[%2]',
        args0: [arrayVarFieldSpec(), { type: 'input_value', name: 'INDEX', check: 'Number' }],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        colour: COLOR_STATEMENT,
        tooltip: 'Legge un valore in input e lo salva in un elemento del vettore',
      });
      attachArraySizeValidator(this);
    },
  };

  Blockly.Blocks['array_length'] = {
    init: function () {
      this.jsonInit({
        message0: 'LUNGHEZZA DI %1',
        args0: [arrayVarFieldSpec()],
        output: 'Number',
        colour: COLOR_ARRAY,
        tooltip: 'Numero di elementi del vettore',
      });
      attachArraySizeValidator(this);
    },
  };
}
