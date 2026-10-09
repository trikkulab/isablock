// Pubblica le regole Firestore per un ambiente, solo se la CLI è già sul
// progetto di quell'ambiente: evita di mandare le regole dev (con le email di
// prova) sul progetto della scuola. Uso: node scripts/deploy-rules.mjs <dev|scuola>
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const env = process.argv[2];
if (env !== 'dev' && env !== 'scuola') {
  console.error('Uso: node scripts/deploy-rules.mjs <dev|scuola>');
  process.exit(1);
}
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts });

// `firebase use` stampa l'ID del progetto attivo (o l'alias): si confronta con
// l'ID che l'alias dell'ambiente ha in .firebaserc.
let idAtteso;
try {
  idAtteso = JSON.parse(readFileSync(`${root}.firebaserc`, 'utf8')).projects?.[env];
} catch { /* .firebaserc assente */ }
if (!idAtteso) {
  console.error(`Alias "${env}" non collegato: firebase use --add (vedi docs/CLOUD.md).`);
  process.exit(1);
}
const attivo = run('firebase', ['use']).stdout.trim().split('\n').pop().trim();
if (attivo !== idAtteso && attivo !== env) {
  console.error(`Progetto attivo: "${attivo}", atteso "${idAtteso}". Lancia prima: npm run use:${env}`);
  process.exit(1);
}
let r = run('node', ['scripts/build-rules.mjs', env], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
r = run('firebase', ['deploy', '--only', 'firestore:rules'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
