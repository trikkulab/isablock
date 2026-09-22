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
}
