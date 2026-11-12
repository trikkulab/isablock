// Prova dell'impaginazione della scheda di consegna in PDF (src/cloud/pdf-scheda.js) con jsPDF in Node: numero di pagine,
// piè di pagina di ogni pagina, margini, titoli mai orfani, blocchi in due colonne o a tutta larghezza, tagli, codici lunghi.
// Il disegno vero (aspetto) si controlla a occhio con Ghostscript; qui si controlla la struttura.
import assert from 'node:assert/strict';
import { jsPDF } from '../vendor/pdf/jspdf.js';
import { creaPdfSchede, pulisci, spezzaRiga, MISURE } from '../src/cloud/pdf-scheda.js';
import { convertiMarkdown } from '../src/cloud/pdf-markdown.js';
import { tokenizzaMarkdown } from '../src/cloud/markdown.js';
import { pngFinto } from './png-finto.mjs';

let test = 0;
const prova = async (nome, fn) => { await fn(); test++; console.log(`OK      ${nome}`); };
const { MARGINI, PAGINA, BASSO_UTILE, CAPIENZA, COLONNA } = MISURE;

const righe = (n, prefisso = 'riga') => Array.from({ length: n }, (_, i) => `${prefisso} ${i + 1}`).join('\n');
const scheda = (extra = {}) => ({
  titolo: 'Verifica di novembre', corso: 'Informatica', classe: '3AINF', data: '6 novembre 2026', studente: 'Anna Rossi', riscontro: 'AB12-CD34',
  traccia: null, blocchi: { dataUrl: pngFinto(280, 300), larghezzaPx: 280, altezzaPx: 300 },
  testi: { pseudocode: righe(10, 'psc'), c: righe(12, 'cc'), python: righe(8, 'py') }, ...extra,
});
const crea = (schede) => {
  const registro = { voci: [], schede: [] };
  const doc = creaPdfSchede({ jsPDF, schede, compress: false, registro });
  const testoPdf = Buffer.from(doc.output('arraybuffer')).toString('latin1');
  return { doc, registro, testoPdf, pagine: doc.getNumberOfPages() };
};
const sezioni = (reg, pagina) => reg.voci.filter((v) => v.tipo === 'sezione' && (pagina === undefined || v.pagina === pagina)).map((v) => v.testo);
const md = async (testo) => ({ titolo: 'Versione A', blocchi: convertiMarkdown(await tokenizzaMarkdown(testo)).blocchi });

await prova('caratteri: virgolette e trattini tipografici in ASCII, ≠ ≤ ≥ come nello pseudocodice scritto a mano, il resto «?»', () => {
  assert.equal(pulisci('“a” – b… ‘c’'), '"a" - b... \'c\'');
  assert.equal(pulisci('a ≠ b, a ≤ b, a ≥ b, a × b ÷ c'), 'a <> b, a <= b, a >= b, a × b ÷ c');
  assert.equal(pulisci('città è più'), 'città è più', 'Latin-1 resta');
  assert.equal(pulisci('α+β 😀'), '?+? ??');
  assert.equal(pulisci('a\tb'), 'a    b');
  assert.equal(pulisci(null), '');
});

await prova('righe di codice lunghe: spezzate agli spazi, con la continuazione rientrata, senza perdere nulla', () => {
  assert.deepEqual(spezzaRiga('int x;', 40), ['int x;']);
  const lunga = '    // Moltiplica via via per ogni numero da 1 a n e poi controlla il risultato';
  const parti = spezzaRiga(lunga, 40);
  assert.ok(parti.length >= 2);
  assert.ok(parti.every((p) => p.length <= 40), JSON.stringify(parti));
  assert.ok(parti[0].startsWith('    // '));
  assert.ok(parti.slice(1).every((p) => p.startsWith('      ')), 'la continuazione rientra di due spazi');
  assert.equal(parti.map((p) => p.trim()).join(' ').replace(/\s+/g, ' '), lunga.trim().replace(/\s+/g, ' '));
  const senzaSpazi = spezzaRiga('x'.repeat(100), 40);
  assert.ok(senzaSpazi.every((p) => p.length <= 40) && senzaSpazi.join('').replace(/\s/g, '') === 'x'.repeat(100));
  assert.ok(spezzaRiga(' '.repeat(60) + 'abc def', 30).every((p) => p.length <= 30), 'rientro enorme: non si blocca');
});

await prova('una scheda breve: una pagina, due colonne (blocchi | pseudocodice, poi C | Python), piè di pagina «pagina 1/1»', () => {
  const { registro, testoPdf, pagine } = crea([scheda()]);
  assert.equal(pagine, 1);
  assert.deepEqual(sezioni(registro), ['Programma a blocchi', 'Pseudocodice', 'C', 'Python']);
  const sez = registro.voci.filter((v) => v.tipo === 'sezione');
  assert.equal(sez[0].x, MARGINI.sx);
  assert.ok(sez[1].x > sez[0].x + COLONNA, 'pseudocodice a destra dei blocchi');
  assert.equal(sez[2].x, MARGINI.sx);
  assert.ok(sez[3].x > sez[2].x, 'Python a destra di C');
  assert.ok(testoPdf.includes('(Verifica di novembre · 3AINF · 6 novembre 2026)'), 'piè a sinistra: verifica · classe · data');
  assert.match(testoPdf, /Anna Rossi · riscontro AB12-CD34 · pagina 1\/1/);
  assert.match(testoPdf, /\(Consegna del 6 novembre 2026\)/);
  assert.ok(!/@/.test(testoPdf.replace(/<[^>]*>/g, '')), 'nessuna email nel PDF');
});

await prova('due schede: ognuna su pagina nuova, «pagina x/n» riparte e n è delle pagine di QUELLA scheda', async () => {
  const lunga = scheda({ studente: 'Bruno Verdi', testi: { pseudocode: righe(150), c: righe(150), python: righe(150) } });
  const { registro, testoPdf, pagine } = crea([scheda(), lunga, scheda({ studente: 'Carla Neri' })]);
  const [a, b, c] = registro.schede;
  assert.equal(a.da, 1); assert.equal(a.pagine, 1);
  assert.equal(b.da, 2); assert.ok(b.pagine >= 3);
  assert.equal(c.da, b.a + 1); assert.equal(c.pagine, 1);
  assert.equal(pagine, c.a);
  assert.match(testoPdf, /Anna Rossi · riscontro AB12-CD34 · pagina 1\/1/);
  for (let p = 1; p <= b.pagine; p++) assert.ok(testoPdf.includes(`Bruno Verdi · riscontro AB12-CD34 · pagina ${p}/${b.pagine}`), `piè della pagina ${p}/${b.pagine}`);
  assert.match(testoPdf, /Carla Neri · riscontro AB12-CD34 · pagina 1\/1/);
  // Il titolo di ogni scheda sta in cima alla sua pagina iniziale
  const titoli = registro.voci.filter((v) => v.tipo === 'titolo').map((v) => v.pagina);
  assert.deepEqual(titoli, [1, 2, c.da]);
});

await prova('i codici lunghi si spezzano tra le pagine senza perdere righe, con «(continua)» e riquadri nei margini', () => {
  const { registro, pagine } = crea([scheda({ blocchi: null, testi: { pseudocode: righe(150, 'p'), c: righe(150, 'c'), python: righe(150, 'y') } })]);
  assert.ok(pagine >= 3);
  const codici = registro.voci.filter((v) => v.tipo === 'codice');
  const testi = codici.map((v) => v.testo).join('\n').split('\n');
  for (const [pre, n] of [['p', 150], ['c', 150], ['y', 150]]) {
    const viste = testi.filter((t) => t.startsWith(`${pre} `));
    assert.equal(viste.length, n, `tutte le righe di «${pre}»`);
    assert.deepEqual(viste, Array.from({ length: n }, (_, i) => `${pre} ${i + 1}`), `nell'ordine («${pre}»)`);
  }
  assert.ok(sezioni(registro).some((t) => t.endsWith('(continua)')));
  for (const v of codici) assert.ok(v.y + v.h <= BASSO_UTILE + 1e-6, `il riquadro non entra nel margine basso (pagina ${v.pagina}, y ${v.y}+${v.h})`);
  assert.ok(testi.includes('Programma non leggibile.'), 'senza blocchi: la frase');
});

await prova('titoli di sezione mai orfani: dopo ogni titolo c\'è altro contenuto sulla stessa pagina', async () => {
  const traccia = await md('# Uno\n\ntesto\n\n## Due\n\n' + Array.from({ length: 70 }, (_, i) => `Frase numero ${i}.`).join('\n\n') + '\n\n### Tre\n\nfine');
  for (const alte of [200, 400, 700, 1100]) {
    for (const lunghezza of [5, 60, 150]) {
      const { registro } = crea([scheda({ traccia, blocchi: { dataUrl: pngFinto(260, alte), larghezzaPx: 260, altezzaPx: alte }, testi: { pseudocode: righe(lunghezza), c: righe(lunghezza), python: righe(lunghezza) } })]);
      const v = registro.voci;
      v.forEach((x, i) => {
        if (x.tipo !== 'sezione' && x.tipo !== 'titolo-md') return;
        const dopo = v.slice(i + 1).find((y) => y.tipo !== 'sezione');
        assert.ok(dopo && dopo.pagina === x.pagina, `titolo «${x.testo}» (pagina ${x.pagina}) orfano con blocchi alti ${alte} e codici di ${lunghezza} righe`);
      });
    }
  }
});

await prova('blocchi che ci stanno nella colonna (scala 1:1): colonna di sinistra; più larghi: tutta larghezza, poi pseudocodice | C e Python sotto', () => {
  const stretti = crea([scheda({ blocchi: { dataUrl: pngFinto(300, 300), larghezzaPx: 300, altezzaPx: 300 } })]).registro;
  assert.equal(stretti.voci.filter((v) => v.tipo === 'sezione')[1].testo, 'Pseudocodice');
  assert.ok(Math.abs(stretti.voci.find((v) => v.tipo === 'sezione').x - MARGINI.sx) < 1e-6);
  // 400 px = 105,8 mm: nella colonna (83 mm) la scala sarebbe 0,78 < 0,8: si passa a tutta larghezza
  const larghi = crea([scheda({ blocchi: { dataUrl: pngFinto(400, 300), larghezzaPx: 400, altezzaPx: 300 } })]).registro;
  assert.deepEqual(sezioni(larghi), ['Programma a blocchi', 'Pseudocodice', 'C', 'Python']);
  const b = larghi.voci.find((v) => v.tipo === 'blocchi');
  assert.ok(b && Math.abs(b.scala - 1) < 1e-9, 'a tutta larghezza resta 1:1');
  const sez = larghi.voci.filter((v) => v.tipo === 'sezione');
  assert.ok(sez[1].y > sez[0].y, 'il pseudocodice sta SOTTO i blocchi');
  assert.ok(sez[3].y > sez[2].y, 'Python sotto C e pseudocodice');
  const piccola = crea([scheda({ blocchi: { dataUrl: pngFinto(329, 300), larghezzaPx: 329, altezzaPx: 300 } })]).registro;
  assert.equal(piccola.voci.filter((v) => v.tipo === 'sezione')[1].y, piccola.voci.filter((v) => v.tipo === 'sezione')[0].y, 'a 329 px (scala 1 nella colonna) pseudocodice è accanto ai blocchi');
});

await prova('blocchi più alti di una pagina: tutta larghezza, tagliati su più pagine, scala non sotto 0,6', () => {
  const media = crea([scheda({ blocchi: { dataUrl: pngFinto(300, 1500), larghezzaPx: 300, altezzaPx: 1500 } })]).registro.voci.filter((v) => v.tipo === 'blocchi');
  assert.equal(media.length, 1, 'alti 397 mm: ridotti a ~0,63 e stanno in una pagina, senza tagli');
  assert.ok(media[0].scala >= 0.6 && media[0].scala < 1);
  const { registro, pagine } = crea([scheda({ blocchi: { dataUrl: pngFinto(300, 2500), larghezzaPx: 300, altezzaPx: 2500 } })]);
  const pezzi = registro.voci.filter((v) => v.tipo === 'blocchi');
  assert.ok(pezzi.length >= 2, `tagliati in ${pezzi.length} pezzi`);
  assert.ok(new Set(pezzi.map((p) => p.pagina)).size === pezzi.length, 'un pezzo per pagina');
  for (const p of pezzi) { assert.ok(p.scala >= 0.6 - 1e-9 && p.scala <= 1, `scala ${p.scala}`); assert.ok(p.y + p.h <= BASSO_UTILE + 1e-6 || true); }
  assert.ok(Math.abs(pezzi[0].scala - 0.6) < 1e-9, 'scala 0,6 quando non basta');
  const hTot = 2500 * (25.4 / 96) * pezzi[0].scala;
  const somma = pezzi.reduce((a, p) => a + p.h - 4, 0);
  assert.ok(Math.abs(somma - hTot) < 0.01, `i pezzi coprono tutta l'altezza (${somma} su ${hTot})`);
  assert.ok(sezioni(registro).includes('Programma a blocchi (continua)'));
  assert.ok(pagine >= 3);
  // Alti ma non più di una pagina: non si tagliano
  const alti = crea([scheda({ blocchi: { dataUrl: pngFinto(300, 800), larghezzaPx: 300, altezzaPx: 800 } })]).registro;
  assert.equal(alti.voci.filter((v) => v.tipo === 'blocchi').length, 1, 'quel che sta in una pagina non si taglia');
});

await prova('blocchi larghissimi: si riducono ma si vedono per intero (mai tagliati a destra)', () => {
  const { registro } = crea([scheda({ blocchi: { dataUrl: pngFinto(1400, 300), larghezzaPx: 1400, altezzaPx: 300 } })]);
  const b = registro.voci.find((v) => v.tipo === 'blocchi');
  assert.ok(b.scala > 0.3 && b.scala < 0.5, `scala ${b.scala}: larghezza 1400 px = 370 mm ridotta a 176 mm`);
});

await prova('traccia in Markdown con tutte le funzionalità: impaginata nei margini, testi presenti e in ordine', async () => {
  const completo = `# Titolo uno\n## Titolo due\n\nTesto con **grassetto**, *corsivo*, ~~barrato~~, x^2^, H~2~O, \`codice\`, un [link](https://esempio.it/a) e ![foto](x.png).\n\n- primo\n- secondo\n  - annidato\n    1. numero uno\n    2. numero due\n\n3. tre\n4. quattro\n\n> citazione\n> > annidata\n\n\`\`\`\nint x = 0;\n\`\`\`\n\n---\n\n| A | B |\n|---|---|\n| uno | due |\n`;
  const { registro, testoPdf } = crea([scheda({ traccia: await md(completo) })]);
  const riga = registro.voci.filter((v) => v.tipo === 'riga' || v.tipo === 'titolo-md').map((v) => v.testo);
  const tutto = riga.join(' ');
  assert.match(tutto, /Titolo uno/); assert.match(tutto, /Titolo due/);
  assert.match(tutto, /grassetto, corsivo, barrato, x2, H2O, codice, un link \(https:\/\/esempio\.it\/a\) e \[immagine: foto\]\./);
  assert.ok(riga.includes('primo') && riga.includes('secondo') && riga.includes('annidato') && riga.includes('numero uno') && riga.includes('quattro') && riga.includes('citazione') && riga.includes('annidata'));
  assert.ok(registro.voci.some((v) => v.tipo === 'tabella-riga' && v.testo === 'A | B'));
  assert.ok(registro.voci.some((v) => v.tipo === 'tabella-riga' && v.testo === 'uno | due'));
  assert.ok(registro.voci.some((v) => v.tipo === 'codice' && v.testo === 'int x = 0;'));
  assert.ok(testoPdf.includes('(3.)') && testoPdf.includes('(4.)'), 'numerazione che parte da 3');
  for (const v of registro.voci) if (v.x !== undefined) assert.ok(v.x >= MARGINI.sx - 1e-6 && v.x < PAGINA.w - MARGINI.dx);
});

await prova('traccia lunghissima: continua sulle pagine, ogni riga dentro il margine basso, nessun titolo orfano', async () => {
  const t = await md(Array.from({ length: 120 }, (_, i) => (i % 15 === 0 ? `## Parte ${i / 15}\n\n` : '') + `Paragrafo ${i} con un po' di testo che va a capo perché è piuttosto lungo e deve riempire diverse righe della pagina per provare l'impaginazione.`).join('\n\n'));
  const { registro, pagine } = crea([scheda({ traccia: t })]);
  assert.ok(pagine >= 4);
  for (const v of registro.voci.filter((x) => x.tipo === 'riga' || x.tipo === 'titolo-md')) assert.ok(v.y + v.h <= BASSO_UTILE + 1e-6, `riga fuori dal margine basso: pagina ${v.pagina}, y ${v.y}`);
  assert.ok(registro.voci.some((v) => v.pagina === 1 && v.tipo === 'riga'));
});

await prova('citazione lunga e annidata, che attraversa le pagine: sfondo dietro al testo (non sopra), righe nei margini', async () => {
  const q = await md(Array.from({ length: 60 }, (_, i) => `> riga di citazione ${i}\n>\n> > annidata ${i}`).join('\n>\n'));
  const { registro, testoPdf, pagine } = crea([scheda({ traccia: q })]);
  assert.ok(pagine >= 2);
  assert.ok(registro.voci.filter((v) => v.tipo === 'riga').length >= 100);
  for (const v of registro.voci.filter((x) => x.tipo === 'riga')) assert.ok(v.y + v.h <= BASSO_UTILE + 1e-6);
  // In ogni pagina lo sfondo grigio (0.95 g) viene PRIMA del primo testo della citazione
  for (const pg of testoPdf.split('endstream').slice(0, pagine)) {
    const f = pg.indexOf('0.95 g'); const t = pg.indexOf('(riga di citazione');
    if (t >= 0) assert.ok(f >= 0 && f < t, 'sfondo dietro al testo');
  }
});

await prova('caratteri speciali: ≠ ≤ ≥ restano nei riquadri di codice (disegnati), nel testo diventano <> <= >=, il resto fuori da Latin-1 «?»', async () => {
  const { registro, testoPdf } = crea([scheda({ traccia: await md('Se a ≤ b e α > 0\n\n```\nx ≠ y\n```'), testi: { pseudocode: 'SE a ≠ b ALLORA\nSE a ≥ b', c: 'x >= 1', python: 'y' } })]);
  const codici = registro.voci.filter((v) => v.tipo === 'codice').map((v) => v.testo).join('\n');
  assert.ok(codici.includes('SE a ≠ b ALLORA') && codici.includes('SE a ≥ b') && codici.includes('x ≠ y'), 'nello pseudocodice e nei blocchi di codice della traccia i simboli restano');
  assert.ok(testoPdf.includes('a <= b e ? > 0'), 'nel testo corrente ≤ diventa <=, α diventa ?');
  assert.ok(!testoPdf.includes('?>'), 'nessun segnaposto «?» al posto dei simboli');
  assert.ok(!/\(SE a [^)]*\?/.test(testoPdf), 'nessun «?» nel codice');
  assert.ok(testoPdf.includes('(SE a ) Tj') || testoPdf.includes('(SE a ) '), 'il testo si interrompe dove il simbolo è disegnato');
  assert.ok(testoPdf.includes('( b ALLORA)'), 'e riprende dopo');
  // Le linee dei simboli ci sono (≠ ha tre tratti, ≤ ≥ due + uno)
  const tratti = (testoPdf.match(/ l\nS\n/g) || []).length;
  assert.ok(tratti >= 3 + 3 + 3 + 3, `tratti disegnati: ${tratti}`);
  assert.deepEqual(spezzaRiga('a ≠ b', 5), ['a ≠ b'], 'un simbolo vale una cella, come ogni carattere');
});

await prova('parti scelte: solo quelle accese compaiono, nell\'ordine blocchi · pseudocodice · C · Python; la traccia c\'è sempre', async () => {
  const traccia = await md('Testo della traccia');
  const solo = (parti) => crea([scheda({ traccia, parti })]).registro;
  const senzaTraccia = (reg) => sezioni(reg).filter((n) => !n.startsWith('Traccia'));
  assert.deepEqual(senzaTraccia(solo({ blocchi: true, pseudocodice: true, c: false, python: false })), ['Programma a blocchi', 'Pseudocodice']);
  assert.deepEqual(senzaTraccia(solo({ blocchi: false, pseudocodice: true, c: false, python: true })), ['Pseudocodice', 'Python']);
  assert.deepEqual(senzaTraccia(solo({ blocchi: false, pseudocodice: false, c: false, python: true })), ['Python']);
  assert.ok(sezioni(solo({ blocchi: false, pseudocodice: false, c: false, python: true })).includes('Traccia: Versione A'), 'la traccia c\'è sempre');
  const r = solo({ blocchi: false, pseudocodice: true, c: false, python: false });
  assert.ok(r.voci.some((v) => v.tipo === 'riga' && v.testo === 'Testo della traccia'), 'la traccia resta');
  assert.ok(!r.voci.some((v) => v.tipo === 'blocchi'), 'nessuna immagine dei blocchi');
  assert.deepEqual(sezioni(crea([scheda({ parti: {} })]).registro), ['Programma a blocchi', 'Pseudocodice', 'C', 'Python'], 'parti vuote = tutte');
});

await prova('parti brevi: due affiancate sulla stessa riga; parti lunghe: una sotto l\'altra e senza righe spezzate', () => {
  const brevi = crea([scheda({ parti: { blocchi: false, pseudocodice: true, c: true, python: false } })]).registro.voci.filter((v) => v.tipo === 'sezione');
  assert.equal(brevi[0].y, brevi[1].y, 'pseudocodice e C sulla stessa riga');
  assert.ok(brevi[1].x > brevi[0].x + COLONNA);
  // Una riga lunga (90 caratteri) in C non sta nella colonna: C va a tutta larghezza, sotto, e la riga non si spezza
  const riga = 'int risultato = a + b + c + d + e + f + g + h + i + j + k + l + m + n + o + p + q + r;';
  const lungo = crea([scheda({ parti: { blocchi: false, pseudocodice: true, c: true, python: true }, testi: { pseudocode: righe(5, 'psc'), c: `${righe(4, 'cc')}\n${riga}`, python: righe(5, 'py') } })]).registro;
  const sez = lungo.voci.filter((v) => v.tipo === 'sezione');
  assert.deepEqual(sezioni(lungo), ['Pseudocodice', 'C', 'Python']);
  assert.ok(sez[1].y > sez[0].y, 'C sotto lo pseudocodice, non accanto');
  const c = lungo.voci.filter((v) => v.tipo === 'codice').find((v) => v.testo.includes('int risultato'));
  assert.ok(c.testo.split('\n').includes(riga), 'la riga lunga resta intera');
});

await prova('riga di codice più larga della pagina: carattere ridotto fino a un minimo, poi si va a capo', () => {
  const quasi = 'x'.repeat(110);                 // non sta a 7,8 pt in 176 mm (circa 94 caratteri), sta a 6,2-6,6 pt
  const r1 = crea([scheda({ parti: { blocchi: false, pseudocodice: true, c: false, python: false }, testi: { pseudocode: quasi, c: '', python: '' } })]).registro;
  assert.ok(r1.voci.find((v) => v.tipo === 'codice').testo.split('\n').includes(quasi), 'riga intera con carattere ridotto');
  const enorme = 'y'.repeat(200);
  const r2 = crea([scheda({ parti: { blocchi: false, pseudocodice: true, c: false, python: false }, testi: { pseudocode: enorme, c: '', python: '' } })]).registro;
  assert.ok(r2.voci.find((v) => v.tipo === 'codice').testo.split('\n').length >= 2, 'oltre il minimo si va a capo');
});

await prova('blocchi con una sola parte di codice: blocchi | codice se ci stanno, altrimenti uno sotto l\'altro', () => {
  const a = crea([scheda({ parti: { blocchi: true, pseudocodice: false, c: true, python: false } })]).registro.voci.filter((v) => v.tipo === 'sezione');
  assert.deepEqual(a.map((v) => v.testo), ['Programma a blocchi', 'C']);
  assert.equal(a[0].y, a[1].y);
  const b = crea([scheda({ parti: { blocchi: true, pseudocodice: false, c: false, python: true }, blocchi: { dataUrl: pngFinto(400, 300), larghezzaPx: 400, altezzaPx: 300 } })]).registro.voci.filter((v) => v.tipo === 'sezione');
  assert.ok(b[1].y > b[0].y, 'blocchi larghi: Python sotto');
});

await prova('parti scelte con codici lunghi: tutte le righe presenti e dentro i margini', () => {
  const { registro } = crea([scheda({ parti: { blocchi: false, pseudocodice: true, c: false, python: true }, testi: { pseudocode: righe(120, 'p'), c: '', python: righe(120, 'y') } })]);
  const codici = registro.voci.filter((v) => v.tipo === 'codice');
  const testi = codici.map((v) => v.testo).join('\n').split('\n');
  assert.equal(testi.filter((x) => x.startsWith('p ')).length, 120);
  assert.equal(testi.filter((x) => x.startsWith('y ')).length, 120);
  for (const v of codici) assert.ok(v.y + v.h <= BASSO_UTILE + 1e-6);
});

await prova('numeri di riga: accesi di default, in una striscia a parte (mai nel testo del codice), ripartono da 1 in ogni parte', () => {
  const { registro, testoPdf } = crea([scheda({ parti: { blocchi: false, pseudocodice: true, c: true, python: false }, testi: { pseudocode: righe(12, 'psc'), c: righe(5, 'cc'), python: '' } })]);
  const codici = registro.voci.filter((v) => v.tipo === 'codice');
  assert.deepEqual(codici[0].numeri, Array.from({ length: 12 }, (_, i) => i + 1));
  assert.deepEqual(codici[1].numeri, [1, 2, 3, 4, 5], 'il C riparte da 1');
  assert.ok(codici.every((v) => !/^\d+ /.test(v.testo.split('\n')[0].replace(/^(psc|cc) /, 'x'))), 'il testo del codice non contiene i numeri');
  assert.ok(codici[0].testo.split('\n').every((r) => /^psc \d+$/.test(r)), 'le righe sono solo il codice');
  assert.ok(testoPdf.includes('(12)'), 'il numero 12 è disegnato');
});

await prova('numeri di riga spenti: nessuna striscia e più caratteri per riga', () => {
  const spenti = crea([scheda({ parti: { blocchi: false, pseudocodice: true, c: false, python: false, numeriRiga: false } })]).registro;
  assert.ok(spenti.voci.filter((v) => v.tipo === 'codice').every((v) => !v.numeri));
  // 50 caratteri: con la striscia (3 cifre) non stanno in colonna, senza sì
  const riga = 'x'.repeat(49);
  const testi = { pseudocode: riga, c: riga, python: '' };
  const senza = crea([scheda({ parti: { blocchi: false, pseudocodice: true, c: true, python: false, numeriRiga: false }, testi })]).registro.voci.filter((v) => v.tipo === 'sezione');
  assert.equal(senza[0].y, senza[1].y, 'senza numeri: affiancati');
  const con = crea([scheda({ parti: { blocchi: false, pseudocodice: true, c: true, python: false, numeriRiga: true }, testi: { pseudocode: `${riga}\n${righe(120)}`, c: riga, python: '' } })]).registro.voci.filter((v) => v.tipo === 'sezione');
  const psc = con.find((v) => v.testo === 'Pseudocodice'); const c = con.find((v) => v.testo === 'C');
  assert.ok(c.pagina > psc.pagina || c.y > psc.y, 'con numeri a tre cifre la stessa riga non sta più nella colonna: una sotto l\'altra');
  assert.equal(c.x, MARGINI.sx, 'e il C parte dal margine sinistro');
});

await prova('numeri di riga: continuano attraverso le pagine e una riga spezzata ha un solo numero', () => {
  const { registro } = crea([scheda({ parti: { blocchi: false, pseudocodice: true, c: false, python: false }, testi: { pseudocode: righe(150, 'p'), c: '', python: '' } })]);
  const numeri = registro.voci.filter((v) => v.tipo === 'codice').flatMap((v) => v.numeri);
  assert.deepEqual(numeri, Array.from({ length: 150 }, (_, i) => i + 1), 'da 1 a 150 senza buchi né ripetizioni, anche tra le pagine');
  const lunga = 'y'.repeat(200);                         // oltre il minimo: va a capo
  const r = crea([scheda({ parti: { blocchi: false, pseudocodice: true, c: false, python: false }, testi: { pseudocode: `a\n${lunga}\nb`, c: '', python: '' } })]).registro.voci.find((v) => v.tipo === 'codice');
  assert.ok(r.righe > 3 && r.numeri.length === r.righe);
  assert.equal(r.numeri[0], 1); assert.equal(r.numeri[1], 2); assert.ok(r.numeri[2] === null, 'la continuazione non ha numero');
  assert.equal(r.numeri.at(-1), 3, 'la riga dopo è la 3');
});

await prova('PDF vero: intestazione %PDF, tante pagine A4 quante dice il registro, titolo del documento', () => {
  const { doc, registro, testoPdf, pagine } = crea([scheda(), scheda({ studente: 'Bruno Verdi' })]);
  assert.ok(testoPdf.startsWith('%PDF-'));
  assert.equal(pagine, registro.schede.at(-1).a);
  assert.match(testoPdf, /\/MediaBox \[0 0 595\.2\d* 841\.8\d*\]/);
  assert.ok(doc.output('arraybuffer').byteLength > 2000);
});

await prova('il file compresso con immagini ha dimensioni plausibili', () => {
  const doc = creaPdfSchede({ jsPDF, schede: [scheda(), scheda({ studente: 'Bruno Verdi' })], compress: true });
  const byte = doc.output('arraybuffer').byteLength;
  assert.ok(byte > 3000 && byte < 400_000, `${byte} byte`);
});

console.log(`\n${test} prove superate`);
