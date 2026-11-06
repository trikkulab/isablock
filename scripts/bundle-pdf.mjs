// Produce vendor/pdf/jspdf.js: bundle ESM di jsPDF (solo il nucleo: testo, linee, riquadri, immagini), da committare
// (come vendor/markdown). Serve alla scheda di consegna in PDF (src/cloud/pdf-scheda.js). Si rilancia solo per aggiornare
// la versione: npm run vendor:pdf
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
mkdirSync(`${root}vendor/pdf`, { recursive: true });
const r = await build({
  stdin: { contents: "export { jsPDF } from 'jspdf';", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', minify: true, platform: 'browser', write: false, legalComments: 'none', logLevel: 'info',
  // Funzioni che non usiamo (html(), addSvg(), sanificazione): le loro dipendenze non servono e non si includono.
  external: ['canvg', 'html2canvas', 'dompurify'],
});
const versione = JSON.parse(readFileSync(`${root}node_modules/jspdf/package.json`, 'utf8')).version;
writeFileSync(`${root}vendor/pdf/jspdf.js`, `// jsPDF ${versione} (MIT). Generato da scripts/bundle-pdf.mjs.\n` + r.outputFiles[0].text);
writeFileSync(`${root}vendor/pdf/package.json`, '{\n  "type": "module"\n}\n');
console.log(`vendor/pdf/jspdf.js (jsPDF ${versione})`);
