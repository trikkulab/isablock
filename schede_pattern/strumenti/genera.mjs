// Da pseudocodice (schede_pattern/pseudocodice-schede/*.txt) a tutto quello che serve
// per le schede: per ogni pattern, in schede_pattern/output/<nome>/
//   programma.json   si apre in IsaBlock con "Apri…"
//   blocchi.png      screenshot dei blocchi, come si vedono nell'app
//   pseudocodice.txt generato da IsaBlock (indentato, uguale a quello dell'app)
//   codice.c         generato da IsaBlock
//
// Uso (dalla radice del progetto):
//   node schede_pattern/strumenti/genera.mjs                 tutti i pattern
//   node schede_pattern/strumenti/genera.mjs 03 flag         solo quelli il cui nome contiene...
//   node schede_pattern/strumenti/genera.mjs --no-img        senza screenshot (solo testi e JSON)
//   node schede_pattern/strumenti/genera.mjs --scala=2        risoluzione dell'immagine (default 3 = nitida per la stampa)
//   node schede_pattern/strumenti/genera.mjs --da=altra-cartella   legge i .txt da un'altra cartella di schede_pattern/
//   node schede_pattern/strumenti/genera.mjs --py            scrive anche codice.py
//
// Il pseudocodice generato dall'app viene confrontato con quello scritto a
// mano: se differiscono (a parte indentazione e VERO/vero), lo script lo dice.
// È il controllo che il testo sia davvero "pseudocodice di IsaBlock".

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { parsePseudocode, PseudoError } from './pseudo2json.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const schedeDir = path.resolve(here, '..');
const root = path.resolve(schedeDir, '..');
const importFrom = (rel) => import(pathToFileURL(path.join(root, rel)).href);

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const filters = args.filter((a) => !a.startsWith('--'));
const noImg = flags.includes('--no-img');
const withPy = flags.includes('--py');
const scala = Number((flags.find((f) => f.startsWith('--scala=')) || '--scala=3').split('=')[1]);

// --- Blockly headless (come test/regression.mjs) -----------------------
const Blockly = require(path.join(root, 'vendor/blockly/blockly_compressed.js'));
Object.assign(Blockly.Msg, require(path.join(root, 'vendor/blockly/msg/it.js')));
const { registerBlocks } = await importFrom('src/blocks/blocks.js');
const { createPseudocodeGenerator } = await importFrom('src/codegen/pseudocode.js');
const { createCGenerator } = await importFrom('src/codegen/c.js');
const { createPythonGenerator } = await importFrom('src/codegen/python.js');
const { pseudocodeConfig } = await importFrom('src/pseudocode-config.js');
const { appConfig } = await importFrom('src/app-config.js');
registerBlocks(Blockly);
const pseudoGen = createPseudocodeGenerator(Blockly, pseudocodeConfig);
const cGen = createCGenerator(Blockly, pseudocodeConfig);
const pyGen = createPythonGenerator(Blockly, pseudocodeConfig);

// Confronto tollerante: ignora indentazione, righe vuote e maiuscole di VERO/FALSO.
const norm = (t) =>
  t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((l) => l.replace(/\b(VERO|FALSO)\b/g, (m) => m.toLowerCase())).join('\n');

// --- Elenco dei pattern ------------------------------------------------
const daFlag = flags.find((f) => f.startsWith('--da='));
const inDir = path.join(schedeDir, daFlag ? daFlag.split('=')[1] : 'pseudocodice-schede');
const outRoot = path.join(schedeDir, 'output');
const files = readdirSync(inDir)
  .filter((f) => f.endsWith('.txt'))
  .filter((f) => !filters.length || filters.some((x) => f.includes(x)))
  .sort();

const results = [];
for (const file of files) {
  const name = file.replace(/\.txt$/, '');
  const source = readFileSync(path.join(inDir, file), 'utf8');
  if (!source.trim().startsWith('INIZIO')) {
    results.push({ name, status: 'saltato', note: 'segnaposto (non comincia con INIZIO)' });
    continue;
  }

  let state;
  try {
    state = parsePseudocode(source);
  } catch (err) {
    if (!(err instanceof PseudoError)) throw err;
    results.push({ name, status: 'ERRORE', note: err.message });
    continue;
  }

  const ws = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(state, ws);
  } catch (err) {
    results.push({ name, status: 'ERRORE', note: `i blocchi non si collegano: ${err.message}` });
    ws.dispose();
    continue;
  }

  const pseudo = pseudoGen.workspaceToCode(ws);
  const c = cGen.workspaceToCode(ws);
  const py = withPy ? pyGen.workspaceToCode(ws) : null;
  // Stesso formato di persistence.js (serializeWorkspace): è quello che
  // l'app scrive con "Salva", quindi si riapre senza sorprese.
  const fileJson = JSON.stringify(
    { formatVersion: appConfig.fileFormatVersion, appVersion: appConfig.version, ...Blockly.serialization.workspaces.save(ws) },
    null, 2,
  );
  ws.dispose();

  const outDir = path.join(outRoot, name);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'programma.json'), fileJson);
  writeFileSync(path.join(outDir, 'pseudocodice.txt'), pseudo);
  writeFileSync(path.join(outDir, 'codice.c'), c);
  if (py !== null) writeFileSync(path.join(outDir, 'codice.py'), py);

  const same = norm(source) === norm(pseudo);
  results.push({
    name, status: same ? 'OK' : 'DIVERSO', outDir, json: fileJson,
    note: same ? '' : diffNote(norm(source), norm(pseudo)),
  });
}

function diffNote(a, b) {
  const la = a.split('\n'); const lb = b.split('\n');
  const out = [];
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) out.push(`  riga ${i + 1}\n    scritto : ${la[i] ?? '(manca)'}\n    generato: ${lb[i] ?? '(manca)'}`);
    if (out.length >= 3) break;
  }
  return out.join('\n');
}

// --- Screenshot --------------------------------------------------------
const toShoot = results.filter((r) => r.json);
if (!noImg && toShoot.length) {
  const { chromium } = await import(pathToFileURL(path.join(root, 'node_modules/playwright/index.mjs')).href);
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const fp = path.join(root, rel);
    if (!fp.startsWith(root) || !existsSync(fp)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': mime[path.extname(fp)] || 'application/octet-stream' });
    res.end(readFileSync(fp));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 2800, height: 1800 }, deviceScaleFactor: scala });
    for (const r of toShoot) {
      const page = await context.newPage();
      // L'app (con cloud attivo) non deve parlare con servizi esterni.
      await page.route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort());
      // Niente benvenuto né finestra Novità: coprirebbero i blocchi.
      await page.addInitScript((ver) => {
        try {
          localStorage.setItem('isablock-welcome-seen', '1');
          localStorage.setItem('isablock-last-seen-version', ver);
        } catch { /* ignora */ }
      }, appConfig.version);
      await page.goto(`http://127.0.0.1:${port}/index.html`);
      await page.waitForSelector('.blocklyMainBackground');
      await page.setInputFiles('#fileInput', { name: 'programma.json', mimeType: 'application/json', buffer: Buffer.from(r.json) });
      await page.waitForSelector('.blocklyMainBackground ~ .blocklyBlockCanvas .blocklyDraggable');
      await page.addStyleTag({
        content: `
          .blocklyMainBackground { fill: #ffffff !important; stroke: none !important; }
          .blocklyGridPattern, .blocklyZoom, .blocklyScrollbarVertical, .blocklyScrollbarHorizontal,
          .blocklyTrash, .blocklyFlyout, .blocklyToolbox, .blocklyBubbleCanvas, .blocklyWidgetDiv, .blocklyTooltipDiv { display: none !important; }
        `,
      });
      // I blocchi partono sul bordo dell'area di lavoro: li sposto verso l'interno
      // (solo nel DOM, per lo screenshot) così il ritaglio con il margine resta
      // tutto sullo sfondo bianco, senza striscia del menu né barra in alto.
      await page.evaluate(() => {
        const bg = document.querySelector('.blocklyMainBackground');
        const canvas = bg.parentNode.querySelector('.blocklyBlockCanvas');
        const m = /scale\(([\d.]+)\)/.exec(canvas.getAttribute('transform') || '');
        canvas.setAttribute('transform', `translate(60,60) scale(${m ? m[1] : 1})`);
      });
      await page.waitForTimeout(200);
      const box = await page.evaluate(() => {
        const bg = document.querySelector('.blocklyMainBackground');
        const r = bg.parentNode.querySelector('.blocklyBlockCanvas').getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      const pad = 24;
      await page.screenshot({
        path: path.join(r.outDir, 'blocchi.png'),
        clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + 2 * pad, height: box.height + 2 * pad },
      });
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
}

// --- Riepilogo ---------------------------------------------------------
console.log('');
for (const r of results) {
  console.log(`${r.status.padEnd(8)} ${r.name}${r.status === 'OK' || r.status === 'saltato' ? '' : ''}`);
  if (r.note) console.log(r.note);
}
const bad = results.filter((r) => r.status === 'ERRORE' || r.status === 'DIVERSO');
console.log(`\n${results.filter((r) => r.status === 'OK').length}/${results.length} coerenti. Output in ${path.relative(root, outRoot)}/`);
process.exit(bad.length ? 1 : 0);
