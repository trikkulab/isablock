// Avvia gli emulatori Auth + Firestore con le regole dev, CONSERVANDO i dati
// tra un avvio e l'altro (.emulator-data, ignorata da git) e ricreando i
// docenti di prova da scripts/environments.local.json (dev.docentiProva): così il
// ruolo docente c'è sempre, anche al primo avvio. Il seed è idempotente.
// Uso: npm run emulators        (Ctrl+C per fermare: i dati vengono salvati)
// Per ripartire da zero: cancellare la cartella .emulator-data.
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildRules } from './build-rules.mjs';
import { leggiAmbienti } from './ambienti.mjs';
import { writeFileSync } from 'node:fs';

const root = fileURLToPath(new URL('..', import.meta.url));
const PROJECT = 'demo-isablock';
const { dev } = leggiAmbienti();

const firebaseJson = JSON.parse(readFileSync(`${root}firebase.json`, 'utf8'));
const FIRESTORE = `http://127.0.0.1:${firebaseJson.emulators.firestore.port}`;

// Se un emulatore è già in esecuzione sulla stessa porta non se ne avvia un altro.
try {
  await fetch(FIRESTORE);
  console.error(`Un emulatore è già in esecuzione (${FIRESTORE}). Fermalo con Ctrl+C nel suo terminale, poi rilancia.`);
  process.exit(1);
} catch { /* porta libera: si procede */ }

writeFileSync(`${root}firestore.rules`, buildRules('dev'));

const args = ['emulators:start', '--only', 'auth,firestore', '--project', PROJECT, '--export-on-exit', '.emulator-data'];
if (existsSync(`${root}.emulator-data`)) args.push('--import', '.emulator-data');
const child = spawn('firebase', args, { cwd: root, stdio: 'inherit' });

// Ctrl+C arriva già al figlio (stesso gruppo di processi); qui si inoltra
// anche un eventuale kill diretto e si aspetta che finisca di salvare.
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 0));

async function pronto() {
  for (let i = 0; i < 120; i++) {
    try { await fetch(FIRESTORE); return true; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  return false;
}

if (await pronto()) {
  const base = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/docenti`;
  for (const email of dev.docentiProva ?? []) {
    const r = await fetch(`${base}/${encodeURIComponent(email.toLowerCase())}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { attivo: { booleanValue: true } } }),
    });
    console.log(r.ok ? `seed: docente ${email}` : `seed FALLITO per ${email}: ${r.status}`);
  }
} else {
  console.error('Firestore non risponde: seed non eseguito.');
}
