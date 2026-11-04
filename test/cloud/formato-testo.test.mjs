// Formattazione del Markdown dell'editor (src/cloud/formato-testo.js): funzioni pure sul testo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../../src/cloud/formato-testo.js';

// Scrive la selezione con [ ] dentro il testo per leggere meglio i casi.
const sel = (s) => ({ t: s.replace('[', '').replace(']', ''), i: s.indexOf('['), f: s.indexOf(']') - 1 });
const mostra = (r) => r.testo.slice(0, r.inizio) + '[' + r.testo.slice(r.inizio, r.fine) + ']' + r.testo.slice(r.fine);
const prova = (formato, da, a) => { const { t, i, f } = sel(da); assert.equal(mostra(F[formato](t, i, f)), a, `${formato}: ${da}`); };

test('grassetto, corsivo, barrato, codice: avvolgono e, premuti di nuovo, tolgono', () => {
  prova('grassetto', 'una [parola] qui', 'una **[parola]** qui');
  prova('grassetto', 'una **[parola]** qui', 'una [parola] qui');
  prova('grassetto', 'una [**parola**] qui', 'una [parola] qui');
  prova('corsivo', 'una [parola] qui', 'una *[parola]* qui');
  prova('corsivo', 'una *[parola]* qui', 'una [parola] qui');
  prova('barrato', 'una [parola] qui', 'una ~~[parola]~~ qui');
  prova('barrato', 'una ~~[parola]~~ qui', 'una [parola] qui');
  prova('codice', 'usa [x = 1] qui', 'usa `[x = 1]` qui');
  prova('codice', 'usa `[x = 1]` qui', 'usa [x = 1] qui');
});

test('senza selezione si inserisce un segnaposto già selezionato', () => {
  prova('grassetto', 'ciao []', 'ciao **[testo]**');
  prova('corsivo', '[]', '*[testo]*');
  prova('codice', 'a [] b', 'a `[codice]` b');
});

test('grassetto e corsivo non si scambiano: il corsivo sul grassetto aggiunge, non rompe', () => {
  prova('corsivo', 'una **[parola]** qui', 'una ***[parola]*** qui');
  prova('grassetto', 'una *[parola]* qui', 'una ***[parola]*** qui');
  prova('grassetto', 'una ***[parola]*** qui', 'una *[parola]* qui');
  // un grassetto selezionato per intero non viene "scartato" dal corsivo (si aggiunge un livello)
  prova('corsivo', 'una [**parola**] qui', 'una *[**parola**]* qui');
  prova('grassetto', 'una [*parola*] qui', 'una **[*parola*]** qui');
});

test('apice e pedice: gli spazi diventano «\\ » e tornano spazi', () => {
  prova('apice', 'x[2]', 'x^[2]^');
  prova('apice', 'x^[2]^', 'x[2]');
  prova('pedice', 'H[2]O', 'H~[2]~O');
  prova('pedice', 'H~[2]~O', 'H[2]O');
  prova('apice', 'a[ n + 1 ]b', 'a^[\\ n\\ +\\ 1\\ ]^b');
  prova('apice', 'a^[\\ n\\ +\\ 1\\ ]^b', 'a[ n + 1 ]b');
  prova('apice', '[]', '^[2]^');
});

test('pedice e barrato non si confondono (~ e ~~): una pressione non ne spezza l\'altro', () => {
  // il pedice non "toglie" una tilde dal barrato (e viceversa): aggiunge il proprio segno
  prova('barrato', 'una ~[parola]~ qui', 'una ~~~[parola]~~~ qui');
  prova('pedice', 'una ~~[parola]~~ qui', 'una ~~~[parola]~~~ qui');
});

test('elenco puntato: su una o più righe, e si toglie premendo di nuovo', () => {
  prova('elencoPuntato', '[uno]', '[- uno]');
  prova('elencoPuntato', '[uno\ndue\ntre]', '[- uno\n- due\n- tre]');
  prova('elencoPuntato', '[- uno\n- due]', '[uno\ndue]');
  prova('elencoPuntato', 'prima\n[uno\ndue]\ndopo', 'prima\n[- uno\n- due]\ndopo');
  prova('elencoPuntato', '[uno\n\ndue]', '[- uno\n\n- due]');                // le righe vuote restano
  prova('elencoPuntato', '[]', '- []');                                    // senza selezione: cursore dopo il simbolo
});

test('elenco numerato: numera, ricomincia da 1, si toglie', () => {
  prova('elencoNumerato', '[uno\ndue\ntre]', '[1. uno\n2. due\n3. tre]');
  prova('elencoNumerato', '[1. uno\n2. due]', '[uno\ndue]');
  prova('elencoNumerato', '[uno\n\ndue]', '[1. uno\n\n2. due]');
});

test('elenchi, citazione e titolo si sostituiscono tra loro invece di sommarsi', () => {
  prova('elencoNumerato', '[- uno\n- due]', '[1. uno\n2. due]');
  prova('elencoPuntato', '[1. uno\n2. due]', '[- uno\n- due]');
  prova('citazione', '[- uno]', '[> uno]');
  prova('elencoPuntato', '[## Titolo]', '[- Titolo]');
  prova('citazione', '[uno\ndue]', '[> uno\n> due]');
  prova('citazione', '[> uno\n> due]', '[uno\ndue]');
});

test('senza selezione il cursore va a fine riga, così si scrive subito dopo il simbolo', () => {
  prova('elencoPuntato', 'ab[]cd', '- abcd[]');
  prova('elencoNumerato', 'x\n[]', 'x\n1. []');
  prova('citazione', 'frase[]', '> frase[]');
  prova('titolo', 'Esercizio[]', '## Esercizio[]');
  prova('titolo', '## Esercizio[]', '### Esercizio[]');
});

test('rientro conservato', () => {
  prova('elencoPuntato', '[  uno\n  due]', '[  - uno\n  - due]');
});

test('titolo: ## → ### → nessuno → ##', () => {
  prova('titolo', '[Esercizio 1]', '[## Esercizio 1]');
  prova('titolo', '[## Esercizio 1]', '[### Esercizio 1]');
  prova('titolo', '[### Esercizio 1]', '[Esercizio 1]');
  prova('titolo', '[# Esercizio 1]', '[## Esercizio 1]');
  prova('titolo', 'a\n[b]\nc', 'a\n[## b]\nc');
});

test('la selezione che finisce a inizio riga non tocca la riga dopo', () => {
  const t = 'uno\ndue\ntre';
  const r = F.elencoPuntato(t, 0, 'uno\n'.length);                   // seleziona «uno\n»
  assert.equal(r.testo, '- uno\ndue\ntre');
});

test('blocco di codice: avvolge le righe, si toglie, e inserisce un esempio se vuoto', () => {
  prova('bloccoCodice', '[int x = 0;\nx++;]', '```\n[int x = 0;\nx++;]\n```');
  const r1 = F.bloccoCodice('int x = 0;', 0, 10);
  const r2 = F.bloccoCodice(r1.testo, 0, r1.testo.length);
  assert.equal(r2.testo, 'int x = 0;');
  prova('bloccoCodice', '[]', '```\n[codice]\n```');
});

test('tabella: schema da compilare, con righe vuote attorno e «Colonna 1» selezionata', () => {
  const r = F.tabella('Prima.', 6, 6);
  assert.equal(r.testo, 'Prima.\n\n| Colonna 1 | Colonna 2 |\n|-----------|-----------|\n| dato      | dato      |\n');
  assert.equal(r.testo.slice(r.inizio, r.fine), 'Colonna 1');
  const v = F.tabella('', 0, 0);
  assert.ok(v.testo.startsWith('| Colonna 1') && v.testo.endsWith('|\n'));
  const m = F.tabella('A\nB', 1, 1);
  assert.equal(m.testo, 'A\n\n| Colonna 1 | Colonna 2 |\n|-----------|-----------|\n| dato      | dato      |\n\nB');
});

test('invio dentro un elenco: continua la voce, numera, chiude se vuota', () => {
  assert.deepEqual(F.invio('- uno', 5), { testo: '- uno\n- ', pos: 8 });
  assert.deepEqual(F.invio('1. uno', 6), { testo: '1. uno\n2. ', pos: 10 });
  assert.deepEqual(F.invio('9. nove', 7), { testo: '9. nove\n10. ', pos: 12 });
  assert.deepEqual(F.invio('> frase', 7), { testo: '> frase\n> ', pos: 10 });
  assert.deepEqual(F.invio('  - rientrato', 13), { testo: '  - rientrato\n  - ', pos: 18 });
  // voce vuota: toglie il simbolo e lascia una riga vuota sopra, perché il testo dopo non si attacchi all'elenco
  assert.deepEqual(F.invio('- uno\n- ', 8), { testo: '- uno\n\n', pos: 7 });
  assert.deepEqual(F.invio('Testo\n\n- ', 9), { testo: 'Testo\n\n', pos: 7 });              // voce unica dopo una riga vuota: niente in più
  assert.deepEqual(F.invio('- ', 2), { testo: '', pos: 0 });
  assert.equal(F.invio('testo normale', 13), null);
  assert.equal(F.invio('## Titolo', 9), null);
  assert.deepEqual(F.invio('- uno due', 5), { testo: '- uno\n-  due', pos: 8 });     // a metà riga: spezza
});
