// Prova di src/cloud/pdf-markdown.js: dal Markdown della traccia alla struttura che disegna il PDF.
// Contiene anche il PROMEMORIA: se la configurazione del Markdown (src/cloud/markdown.js) cambia, questa prova fallisce
// finché non si aggiorna anche il convertitore del PDF (pdf-markdown.js + pdf-scheda.js).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tokenizzaMarkdown } from '../src/cloud/markdown.js';
import { convertiMarkdown, testoSemplice, TOKEN_BLOCCO, TOKEN_IN_LINEA } from '../src/cloud/pdf-markdown.js';

let test = 0;
const prova = async (nome, fn) => { await fn(); test++; console.log(`OK      ${nome}`); };
const conv = async (md) => convertiMarkdown(await tokenizzaMarkdown(md));

// ── Promemoria: la configurazione di markdown.js è quella che il PDF conosce ───────────────────────────────────────────
// Le righe che configurano la libreria (opzioni, plugin, regole abilitate/disabilitate, regole di resa personalizzate).
const ISTANTANEA = [
  "const { MarkdownIt, sub, sup } = await import('../../vendor/markdown/markdown-it.js');",
  'const md = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false });',
  'md.use(sub).use(sup);',
  'md.renderer.rules.link_open = (tokens, i, opzioni, env) => {',
  'md.renderer.rules.link_close = (tokens, i, opzioni, env) => {',
  'md.renderer.rules.image = (tokens, i) => {',
];
await prova('PROMEMORIA: la configurazione del Markdown non è cambiata senza aggiornare il PDF', () => {
  const sorgente = readFileSync(new URL('../src/cloud/markdown.js', import.meta.url), 'utf8');
  const righe = sorgente.split('\n').map((r) => r.trim())
    .filter((r) => /\.use\(|\.enable\(|\.disable\(|\.renderer\.rules\.|new MarkdownIt|import\(.*markdown-it/.test(r) && !r.startsWith('//'));
  assert.deepEqual(righe, ISTANTANEA,
    'La configurazione del Markdown (src/cloud/markdown.js) è cambiata: aggiorna anche il PDF (src/cloud/pdf-markdown.js e pdf-scheda.js, '
    + 'con una prova qui sotto) e poi aggiorna ISTANTANEA in questo file.');
});

const DOCUMENTO_COMPLETO = `# Titolo uno
## Titolo due
### Titolo tre

Testo con **grassetto**, *corsivo*, ~~barrato~~, x^2^, H~2~O e \`codice in riga\`, un [link](https://esempio.it/a) e ![una foto](x.png).
Seconda riga della stessa frase.  
Dopo un a capo forzato.

- primo
- secondo
  - annidato
    1. numero uno
    2. numero due
- terzo

3. tre
4. quattro

> citazione con **grassetto**
> > citazione annidata

\`\`\`c
int x = 0;
  printf("%d", x);
\`\`\`

    blocco rientrato

---

| A | B |
|---|---|
| uno | **due** |
| tre | \`quattro\` |
`;

await prova('copertura: ogni funzionalità del Markdown abilitata è riconosciuta e nessun token è sconosciuto', async () => {
  const tokens = await tokenizzaMarkdown(DOCUMENTO_COMPLETO);
  const noti = new Set([...TOKEN_BLOCCO, ...TOKEN_IN_LINEA]);
  const visti = new Set();
  for (const t of tokens) {
    visti.add(t.type.replace(/_(open|close)$/, ''));
    for (const f of t.children ?? []) visti.add(f.type.replace(/_(open|close)$/, ''));
  }
  const sconosciuti = [...visti].filter((x) => !noti.has(x));
  assert.deepEqual(sconosciuti, [], `Token del Markdown che il PDF non conosce: ${sconosciuti.join(', ')}. Aggiorna pdf-markdown.js e pdf-scheda.js.`);
  const { blocchi, nonSupportati } = convertiMarkdown(tokens);
  assert.deepEqual(nonSupportati, []);
  const tipi = new Set();
  const visita = (nodi) => { for (const n of nodi) { tipi.add(n.t); if (n.blocchi) visita(n.blocchi); if (n.voci) n.voci.forEach(visita); } };
  visita(blocchi);
  for (const t of ['titolo', 'paragrafo', 'elenco', 'citazione', 'codice', 'tabella', 'linea']) assert.ok(tipi.has(t), `manca il nodo «${t}»`);
  const stili = new Set(blocchi.flatMap((b) => (b.righe ?? []).flatMap((r) => Object.keys(r))));
  for (const s of ['grassetto', 'corsivo', 'barrato', 'apice', 'pedice', 'codice', 'aCapo']) assert.ok(stili.has(s), `manca lo stile «${s}»`);
});

await prova('titoli, paragrafo con stili, link come «testo (indirizzo)», immagine come «[immagine: alt]»', async () => {
  const { blocchi } = await conv(DOCUMENTO_COMPLETO);
  assert.deepEqual(blocchi.slice(0, 3).map((b) => [b.t, b.livello]), [['titolo', 1], ['titolo', 2], ['titolo', 3]]);
  const p = blocchi[3];
  assert.equal(p.t, 'paragrafo');
  const testo = p.righe.map((r) => r.testo ?? '\n').join('');
  assert.match(testo, /grassetto, corsivo, barrato, x2, H2O e codice in riga, un link \(https:\/\/esempio\.it\/a\) e \[immagine: una foto\]\./);
  assert.ok(p.righe.find((r) => r.testo === 'grassetto').grassetto);
  assert.ok(p.righe.find((r) => r.testo === 'corsivo').corsivo);
  assert.ok(p.righe.find((r) => r.testo === 'barrato').barrato);
  assert.ok(p.righe.find((r) => r.testo === '2' && r.apice));
  assert.ok(p.righe.find((r) => r.testo === '2' && r.pedice));
  assert.ok(p.righe.find((r) => r.testo === 'codice in riga').codice);
  assert.ok(p.righe.some((r) => r.aCapo), 'l\'a capo forzato resta');
});

await prova('elenchi puntati e numerati, anche annidati, con il numero di partenza', async () => {
  const { blocchi } = await conv(DOCUMENTO_COMPLETO);
  const [puntato, numerato] = blocchi.filter((b) => b.t === 'elenco');
  assert.equal(puntato.ordinato, false);
  assert.equal(puntato.voci.length, 3);
  const annidato = puntato.voci[1].find((b) => b.t === 'elenco');
  assert.equal(annidato.voci.length, 1);
  const numeri = annidato.voci[0].find((b) => b.t === 'elenco');
  assert.equal(numeri.ordinato, true);
  assert.equal(numeri.voci.length, 2);
  assert.equal(numerato.inizio, 3);
  assert.equal(numerato.voci.length, 2);
});

await prova('citazione (anche annidata), codice a blocco, riga orizzontale, tabella', async () => {
  const { blocchi } = await conv(DOCUMENTO_COMPLETO);
  const cit = blocchi.find((b) => b.t === 'citazione');
  assert.ok(cit.blocchi.some((b) => b.t === 'citazione'));
  const codici = blocchi.filter((b) => b.t === 'codice');
  assert.equal(codici.length, 2);
  assert.equal(codici[0].testo, 'int x = 0;\n  printf("%d", x);');
  assert.equal(codici[1].testo, 'blocco rientrato');
  assert.ok(blocchi.some((b) => b.t === 'linea'));
  const tab = blocchi.find((b) => b.t === 'tabella');
  assert.deepEqual(tab.intestazione.map((c) => c.map((r) => r.testo).join('')), ['A', 'B']);
  assert.equal(tab.righe.length, 2);
  assert.ok(tab.righe[0][1][0].grassetto);
  assert.ok(tab.righe[1][1][0].codice);
});

await prova('ripiego: token sconosciuti diventano testo semplice, mai un errore', () => {
  const finti = [
    { type: 'paragraph_open', nesting: 1, tag: 'p' },
    { type: 'inline', nesting: 0, children: [{ type: 'text', content: 'ciao ' }, { type: 'emoji_strano', content: 'XY' }] },
    { type: 'paragraph_close', nesting: -1 },
    { type: 'definition_open', nesting: 1 },
    { type: 'paragraph_open', nesting: 1, tag: 'p' },
    { type: 'inline', nesting: 0, children: [{ type: 'text', content: 'dentro' }] },
    { type: 'paragraph_close', nesting: -1 },
    { type: 'definition_close', nesting: -1 },
    { type: 'html_block', nesting: 0, content: '<b>x</b>' },
  ];
  const { blocchi, nonSupportati } = convertiMarkdown(finti);
  assert.deepEqual(nonSupportati.sort(), ['definition_open', 'emoji_strano', 'html_block']);
  assert.equal(blocchi[0].righe.map((r) => r.testo).join(''), 'ciao XY');
  assert.equal(blocchi[1].righe[0].testo, 'dentro');
  assert.equal(blocchi[2].righe[0].testo, '<b>x</b>');
  assert.deepEqual(convertiMarkdown(null).blocchi, []);
  assert.deepEqual(convertiMarkdown([{ type: 'qualcosa' }]).blocchi, []);
  assert.deepEqual(testoSemplice('a\nb\n\nc').blocchi.map((b) => b.righe[0].testo), ['a b', 'c']);
});

await prova('testo vuoto o solo spazi: nessun blocco', async () => {
  assert.deepEqual((await conv('')).blocchi, []);
  assert.deepEqual((await conv('   \n ')).blocchi, []);
});

console.log(`\n${test} prove superate`);
