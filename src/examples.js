// Esempi precaricati. Ogni voce e' lo stato serializzato di un workspace
// Blockly (lo stesso formato salvato da persistence.js), cosi' caricarli
// usa esattamente lo stesso percorso di codice del caricamento di un file
// salvato dallo studente. Generato con uno script headless a partire
// dalle stesse definizioni di blocco in src/blocks/blocks.js, cosi' non
// puo' desincronizzarsi dai blocchi reali.
export const examples = [
  {
    id: 'massimo-due-numeri',
    title: 'Massimo tra due numeri',
    description: 'Legge due numeri e stampa il maggiore.',
    workspaceState: {
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'program',
            id: 'p_program',
            x: 0,
            y: 0,
            inputs: {
              BODY: {
                block: {
                  type: 'read',
                  id: 'p_read_a',
                  fields: { VAR: { id: 'var_a' } },
                  next: {
                    block: {
                      type: 'read',
                      id: 'p_read_b',
                      fields: { VAR: { id: 'var_b' } },
                      next: {
                        block: {
                          type: 'controls_if_else',
                          id: 'p_if',
                          inputs: {
                            COND: {
                              block: {
                                type: 'compare_op',
                                id: 'p_cmp',
                                fields: { OP: 'GT' },
                                inputs: {
                                  A: { block: { type: 'variable_get', id: 'p_get_a1', fields: { VAR: { id: 'var_a' } } } },
                                  B: { block: { type: 'variable_get', id: 'p_get_b1', fields: { VAR: { id: 'var_b' } } } },
                                },
                              },
                            },
                            THEN: {
                              block: {
                                type: 'write',
                                id: 'p_write_a',
                                inputs: { VALUE: { block: { type: 'variable_get', id: 'p_get_a2', fields: { VAR: { id: 'var_a' } } } } },
                              },
                            },
                            ELSE: {
                              block: {
                                type: 'write',
                                id: 'p_write_b',
                                inputs: { VALUE: { block: { type: 'variable_get', id: 'p_get_b2', fields: { VAR: { id: 'var_b' } } } } },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
      variables: [
        { name: 'a', id: 'var_a' },
        { name: 'b', id: 'var_b' },
      ],
    },
  },
];
