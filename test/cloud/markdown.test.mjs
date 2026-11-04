// Resa del Markdown delle tracce (src/cloud/markdown.js): cosa rende e, soprattutto, cosa NON deve
// mai produrre (script, link cliccabili, immagini remote, attributi iniettati).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rendiMarkdown } from '../../src/cloud/markdown.js';

const ha = (html, ...pezzi) => { for (const p of pezzi) assert.ok(html.includes(p), `manca «${p}» in: ${html}`); };

test('rende tutto ciò che serve a una traccia', async () => {
  const h = await rendiMarkdown([
    '# Titolo', '', 'Testo con **grassetto**, *corsivo* e ~~barrato~~; H~2~O e x^2^.', '',
    '- uno', '- due', '', '1. primo', '2. secondo', '', '> citazione', '',
    '| a | b |', '|---|---|', '| 1 | 2 |', '', 'Codice `x = 1` e:', '', '```c', 'int x = 0;', '```', '', '---',
  ].join('\n'));
  ha(h, '<h1>Titolo</h1>', '<strong>grassetto</strong>', '<em>corsivo</em>', '<s>barrato</s>', 'H<sub>2</sub>O', 'x<sup>2</sup>',
    '<ul>', '<ol>', '<blockquote>', '<table>', '<th>a</th>', '<td>2</td>', '<code>x = 1</code>', '<pre><code class="language-c">', '<hr>');
});

test('stringa vuota o non testo: nessuna resa', async () => {
  for (const v of ['', '   \n  ', null, undefined, 42, {}]) assert.equal(await rendiMarkdown(v), '');
});

test('l\'HTML scritto a mano è mostrato come testo, mai eseguito', async () => {
  const h = await rendiMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<b onclick="x()">grassetto</b> e <iframe src="https://evil"></iframe>');
  for (const vietato of ['<script', '<img', '<iframe', '<b ', 'onclick="']) assert.ok(!h.includes(vietato), `non doveva esserci «${vietato}» in: ${h}`);
  ha(h, '&lt;script&gt;', '&lt;img', '&lt;iframe');
});

test('i link non sono cliccabili: testo e indirizzo scritto tra parentesi', async () => {
  const h = await rendiMarkdown('Vedi [la pagina](https://example.com/x?a=1&b=2) e <https://auto.example>.');
  assert.ok(!/<a[\s>]/.test(h) && !h.includes('href='), h);
  ha(h, '<span class="md-link">la pagina (https://example.com/x?a=1&amp;b=2)</span>', 'https://auto.example');
});

test('link pericolosi, di riferimento o con virgolette: mai un <a>, mai un attributo', async () => {
  const casi = [
    '[x](javascript:alert(1))', '[x][r]\n\n[r]: javascript:alert(1)', '[x](" onmouseover="alert(1))',
    '[x](https://a.b "titolo\\" onclick=\\"x")', '[x](data:text/html;base64,PHNjcmlwdD4=)', '<javascript:alert(1)>',
  ];
  for (const c of casi) {
    const h = await rendiMarkdown(c);
    // nessun <a>, nessun href, nessun attributo on... dentro un tag (come testo, tra virgolette escapate, può comparire)
    assert.ok(!/<a[\s>]/.test(h) && !h.includes('href=') && !/<[^>]*\son\w+\s*=/.test(h), `${c} -> ${h}`);
  }
});

test('le immagini non si caricano: resta il testo alternativo', async () => {
  const h = await rendiMarkdown('![schema del circuito](https://evil.example/pixel.png) ![](data:image/png;base64,AAAA)');
  assert.ok(!h.includes('<img') && !h.includes('src=') && !h.includes('evil.example'), h);
  ha(h, '[immagine: schema del circuito]', '[immagine]');
});

test('il testo alternativo di un\'immagine non può iniettare HTML', async () => {
  const h = await rendiMarkdown('![<img src=x onerror=alert(1)> e <script>x</script>](a.png)');
  assert.ok(!h.includes('<img') && !h.includes('<script'), h);
  ha(h, '&lt;img', '&lt;script&gt;');
});

test('nome del linguaggio del blocco di codice: non può uscire dall\'attributo', async () => {
  const h = await rendiMarkdown('```"><script>alert(1)</script>\nx\n```');
  assert.ok(!h.includes('<script'), h);
});

test('un testo enorme viene troncato invece di bloccare la pagina', async () => {
  const h = await rendiMarkdown('a'.repeat(200000));
  assert.ok(h.length < 60000);
});

test('più rese di fila (due schede, stato dei link non condiviso)', async () => {
  const [a, b] = await Promise.all([rendiMarkdown('[uno](https://uno.it)'), rendiMarkdown('[due](https://due.it)')]);
  ha(a, 'uno (https://uno.it)'); ha(b, 'due (https://due.it)');
  assert.ok(!a.includes('due.it') && !b.includes('uno.it'));
});
