// Passa la CLI Firebase a uno dei due ambienti (dev = account personale,
// scuola = account della scuola): `firebase login:use <account>` e poi
// `firebase use <alias>`. A differenza di isaorario NON copia nessuna config:
// il sito è pubblicato via git su GitHub Pages, un config.js ignorato da git
// non arriverebbe online, quindi l'app sceglie la config per hostname
// (src/cloud/env.js). Qui si cambia solo ciò che riguarda la CLI.
// Uso: npm run use:dev | npm run use:scuola     Vedi docs/CLOUD.md.
import { leggiAmbienti } from './ambienti.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const env = process.argv[2];
const envs = leggiAmbienti();

if (!env || !envs[env] || !envs[env].alias) {
  console.error('Uso: node scripts/use_env.mjs <dev|scuola>');
  process.exit(1);
}
const { alias, account } = envs[env];

if (account) {
  // Non fatale: la CLI dà errore se l'account richiesto è già quello attivo.
  spawnSync('firebase', ['login:use', account], { stdio: 'inherit', cwd: root });
} else {
  console.log(`Nessun account per "${env}" in scripts/environments.local.json: resta quello attivo (firebase login:list).`);
}
// L'account va cambiato PRIMA del progetto: `firebase use` verifica l'accesso.
const r = spawnSync('firebase', ['use', alias], { stdio: 'inherit', cwd: root });
if (r.status !== 0) {
  console.error(`Alias "${alias}" non ancora collegato: firebase use --add (vedi docs/CLOUD.md).`);
  process.exit(r.status ?? 1);
}
