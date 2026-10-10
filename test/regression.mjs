// Test di regressione sul "profilo base": genera i tre output
// (pseudocodice/C/Python) per i 5 esempi precaricati (più i programmi di
// test in test/programs/) usando i generatori
// veri (src/codegen/*.js), e li confronta con lo snapshot congelato in
// test/fixtures/. Serve a intercettare subito un cambio involontario di
// comportamento per i programmi che non usano nessuna estensione, mentre si
// aggiungono booleani/testo/vettori (vedi docs/DECISIONI-ESTENSIONI.md,
// sezione "Test").
//
// Nessuna libreria esterna: solo Node. Uso:
//   node test/regression.mjs            confronta con lo snapshot
//   node test/regression.mjs --update   riscrive lo snapshot (dopo averlo
//                                        controllato a mano)
//
// Non è collegato all'app servita agli studenti (nessun bundler, nessun
// package.json letto dal browser): serve solo allo sviluppo.

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const importFrom = (relPath) => import(pathToFileURL(path.join(root, relPath)).href);

// blockly_compressed.js e msg/it.js sono UMD: sotto Node imboccano il ramo
// "module.exports = factory()" invece del ramo browser (root.Blockly = ...),
// quindi vanno presi dal valore di ritorno di require(), non da un globale.
// vendor/package.json forza questi file a essere letti come CommonJS
// (require classico) anche se il resto del progetto è "type": "module".
const Blockly = require(path.join(root, 'vendor/blockly/blockly_compressed.js'));
const itMessages = require(path.join(root, 'vendor/blockly/msg/it.js'));
Object.assign(Blockly.Msg, itMessages);

const { registerBlocks } = await importFrom('src/blocks/blocks.js');
const { createPseudocodeGenerator } = await importFrom('src/codegen/pseudocode.js');
const { createCGenerator } = await importFrom('src/codegen/c.js');
const { createPythonGenerator } = await importFrom('src/codegen/python.js');
const { pseudocodeConfig } = await importFrom('src/pseudocode-config.js');
const { examples } = await importFrom('src/examples.js');

registerBlocks(Blockly);

const pseudocodeGen = createPseudocodeGenerator(Blockly, pseudocodeConfig);
const cGen = createCGenerator(Blockly, pseudocodeConfig);
const pythonGen = createPythonGenerator(Blockly, pseudocodeConfig);

const fixturesDir = path.join(root, 'test/fixtures');
if (!existsSync(fixturesDir)) mkdirSync(fixturesDir, { recursive: true });

// Oltre ai 5 esempi precaricati, programmi usati solo dai test
// (test/programs/*.json, stesso formato di un file salvato): coprono i
// costrutti che nessun esempio usa, come ESEGUI...MENTRE, senza dover
// aggiungere esempi al menu dell'app.
const programsDir = path.join(root, 'test/programs');
const testPrograms = existsSync(programsDir)
  ? readdirSync(programsDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => ({ id: f.replace(/\.json$/, ''), workspaceState: JSON.parse(readFileSync(path.join(programsDir, f), 'utf8')) }))
  : [];
const programs = [...examples, ...testPrograms];

const update = process.argv.includes('--update');
let failed = false;

for (const example of programs) {
  // Workspace headless (senza SVG/inject): basta per caricare lo stato e
  // generare codice, come già verificato a mano prima di scrivere questo
  // script.
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(example.workspaceState, workspace);

  const outputs = {
    pseudo: pseudocodeGen.workspaceToCode(workspace),
    c: cGen.workspaceToCode(workspace),
    py: pythonGen.workspaceToCode(workspace),
  };

  for (const [ext, text] of Object.entries(outputs)) {
    const fixturePath = path.join(fixturesDir, `${example.id}.${ext}.txt`);
    if (update || !existsSync(fixturePath)) {
      writeFileSync(fixturePath, text);
      console.log(`AGGIORNATO  ${example.id}.${ext}.txt`);
      continue;
    }
    const expected = readFileSync(fixturePath, 'utf8');
    if (expected === text) {
      console.log(`OK          ${example.id}.${ext}.txt`);
    } else {
      failed = true;
      console.log(`DIVERSO     ${example.id}.${ext}.txt`);
      console.log('--- atteso ---');
      console.log(expected);
      console.log('--- ottenuto ---');
      console.log(text);
    }
  }

  workspace.dispose();
}

// Ogni rilascio deve avere la sua voce nelle "Novità" (src/changelog.js).
const { appConfig } = await importFrom('src/app-config.js');
const { changelog } = await importFrom('src/changelog.js');
if (!changelog.some((e) => e.version === appConfig.version)) {
  console.log(`\nFALLITO: manca la voce ${appConfig.version} in src/changelog.js.`);
  process.exit(1);
}

// Le icone dell'editor stanno in locale (main.js: media: 'vendor/blockly/media/'):
// senza il file l'editor tornerebbe a chiederle a un sito esterno, e offline mancherebbero.
if (!existsSync(path.join(root, 'vendor/blockly/media/sprites.svg'))) {
  console.log('\nFALLITO: manca vendor/blockly/media/sprites.svg (le icone di Blockly in locale).');
  process.exit(1);
}

if (failed) {
  console.log('\nFALLITO: uno o più output sono cambiati rispetto allo snapshot.');
  process.exit(1);
}
console.log(`\n${programs.length}/${programs.length} programmi invariati.`);
