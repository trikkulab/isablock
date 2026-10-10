// Pubblica il SITO DI PROVA su Firebase Hosting (progetto dev, sito isablock-test:
// https://isablock-test.web.app), da far provare ai colleghi. Non tocca il repository:
//   1. copia solo i file dell'app (niente docs, test, scripts, node_modules) in
//      .deploy-test/ (ignorata da git);
//   2. nella COPIA accende l'interruttore del cloud (nel repository resta false) e
//      aggiunge un nastro «AMBIENTE DI PROVA» in cima alla pagina;
//   3. controlla che la CLI sia sul progetto dev e pubblica solo l'hosting.
// Le regole Firestore si pubblicano a parte: npm run deploy:rules:dev.
// Uso: npm run deploy:test            prepara e pubblica
//      npm run deploy:test -- --stage-only   prepara soltanto .deploy-test/ (per guardare)
import { cpSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}.deploy-test`;
const soloPreparazione = process.argv.includes('--stage-only');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const voce of ['index.html', 'css', 'src', 'vendor']) cpSync(`${root}${voce}`, `${out}/${voce}`, { recursive: true });
// Il sito di prova usa sempre il progetto dev: la config della scuola non serve
// (e non ci sarebbe niente da proteggere, ma meglio non portarsela dietro).
rmSync(`${out}/src/cloud/config.scuola.js`, { force: true });

// 2a. interruttore del cloud acceso, solo nella copia
const fileConfig = `${out}/src/app-config.js`;
const config = readFileSync(fileConfig, 'utf8');
const acceso = config.replace(/(cloud:\s*Object\.freeze\(\{\s*enabled:\s*)(?:true|false)/, '$1true');
if (!/cloud:\s*Object\.freeze\(\{\s*enabled:\s*true/.test(acceso)) {
  console.error('Non trovo l\'interruttore cloud in src/app-config.js: lo script va aggiornato.');
  process.exit(1);
}
writeFileSync(fileConfig, acceso);

// 2b. nastro «ambiente di prova» (e titolo della scheda) nella copia
// Il nastro è un elemento NORMALE in cima alla pagina (non fisso): la pagina è una
// colonna a tutta altezza, quindi restringe l'editor invece di coprire il piè di
// pagina, dove stanno i comandi delle copie automatiche.
const nastro = `
  <div class="nastro-prova" style="flex:none;padding:0.2rem 0.75rem;background:#fde68a;color:#78350f;font:600 0.75rem system-ui,sans-serif;text-align:center">
    AMBIENTE DI PROVA &mdash; dati finti: non metterci lavori veri. Si cancella tutto a fine prova.
  </div>`;
const fileHtml = `${out}/index.html`;
let html = readFileSync(fileHtml, 'utf8');
if (!/<body[^>]*>/.test(html)) { console.error('index.html senza <body>: lo script va aggiornato.'); process.exit(1); }
html = html.replace(/<body[^>]*>/, (m) => `${m}${nastro}`).replace('<title>IsaBlock</title>', '<title>IsaBlock (prova)</title>');
writeFileSync(fileHtml, html);
console.log('Preparato .deploy-test/ (cloud acceso solo nella copia, nastro di prova aggiunto).');
if (soloPreparazione) process.exit(0);

// 3. la CLI deve essere sul progetto dev
const { projects } = JSON.parse(existsSync(`${root}.firebaserc`) ? readFileSync(`${root}.firebaserc`, 'utf8') : '{"projects":{}}');
if (!projects.dev) { console.error('Alias dev non collegato: firebase use --add (vedi docs/CLOUD.md).'); process.exit(1); }
const attivo = spawnSync('firebase', ['use'], { cwd: root, encoding: 'utf8' }).stdout.trim().split('\n').pop().trim();
if (attivo !== projects.dev && attivo !== 'dev') {
  console.error(`Progetto attivo: "${attivo}", atteso "${projects.dev}". Lancia prima: npm run use:dev`);
  process.exit(1);
}
const r = spawnSync('firebase', ['deploy', '--only', 'hosting'], { cwd: root, stdio: 'inherit' });
process.exit(r.status ?? 1);
