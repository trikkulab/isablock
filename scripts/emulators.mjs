// Avvia gli emulatori Auth + Firestore con le regole dev, CONSERVANDO i dati
// tra un avvio e l'altro (.emulator-data, ignorata da git) e ricreando i
// docenti di prova da scripts/environments.local.json (dev.docentiProva): così il
// ruolo docente c'è sempre, anche al primo avvio. Il seed è idempotente.
// Uso: npm run emulators        (Ctrl+C per fermare: i dati vengono salvati)
// Per ripartire da zero: cancellare la cartella .emulator-data.
//
// SALVATAGGIO AUTOMATICO: oltre che all'uscita (Ctrl+C), i dati si salvano ogni 5 minuti. Senza, un crash del computer o un kill del
// processo faceva perdere tutto il lavoro dall'ultimo Ctrl+C (è successo il 21 nov 2026: persi giorni di prove). Il salvataggio
// periodico scrive in una cartella a parte (.emulator-data.nuovo) e poi la sostituisce a .emulator-data, così un crash a metà
// salvataggio non rovina quello buono. Si regola con EMULATORI_AUTOSAVE_SECONDI (0 = spento).
// Per le prove dello script, senza toccare l'emulatore vero: EMULATORI_CONFIG (un altro firebase.json), EMULATORI_DATI (un'altra cartella)
// ed EMULATORI_PROGETTO (un altro id di progetto: gli emulatori si trovano tra loro per progetto).
import { readFileSync, existsSync, rmSync, renameSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildRules } from './build-rules.mjs';
import { leggiAmbienti } from './ambienti.mjs';
import { writeFileSync } from 'node:fs';

const root = fileURLToPath(new URL('..', import.meta.url));
const PROJECT = process.env.EMULATORI_PROGETTO || 'demo-isablock';
const { dev } = leggiAmbienti();

const CONFIG = process.env.EMULATORI_CONFIG || `${root}firebase.json`;
const DATI = process.env.EMULATORI_DATI || `${root}.emulator-data`;
const AUTOSAVE_MS = (process.env.EMULATORI_AUTOSAVE_SECONDI === undefined ? 300 : Number(process.env.EMULATORI_AUTOSAVE_SECONDI)) * 1000;
const firebaseJson = JSON.parse(readFileSync(CONFIG, 'utf8'));
const FIRESTORE = `http://127.0.0.1:${firebaseJson.emulators.firestore.port}`;

// Se un emulatore è già in esecuzione sulla stessa porta non se ne avvia un altro.
try {
  await fetch(FIRESTORE);
  console.error(`Un emulatore è già in esecuzione (${FIRESTORE}). Fermalo con Ctrl+C nel suo terminale, poi rilancia.`);
  process.exit(1);
} catch { /* porta libera: si procede */ }

writeFileSync(`${root}firestore.rules`, buildRules('dev'));

// Un salvataggio periodico interrotto a metà (crash mentre si sostituivano le cartelle): si rimette a posto quello buono.
const NUOVO = `${DATI}.nuovo`;
const VECCHIO = `${DATI}.vecchio`;
if (!existsSync(DATI) && existsSync(VECCHIO)) renameSync(VECCHIO, DATI);
rmSync(NUOVO, { recursive: true, force: true });
rmSync(VECCHIO, { recursive: true, force: true });

const args = ['emulators:start', '--only', 'auth,firestore', '--project', PROJECT, '--export-on-exit', DATI];
if (existsSync(DATI)) args.push('--import', DATI);
if (process.env.EMULATORI_CONFIG) args.push('--config', CONFIG);
const child = spawn('firebase', args, { cwd: root, stdio: 'inherit' });

// Ctrl+C arriva già al figlio (stesso gruppo di processi); qui si inoltra
// anche un eventuale kill diretto e si aspetta che finisca di salvare.
let uscendo = false;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { uscendo = true; child.kill(sig); });
child.on('exit', (code) => process.exit(code ?? 0));

// Salvataggio periodico: esporta in una cartella nuova e la mette al posto di quella buona (due rinomine: l'unico momento senza
// `DATI` è tra le due, e all'avvio successivo si rimedia). Non parte se un salvataggio è ancora in corso né se si sta uscendo.
let salvando = false;
function salvaOra() {
  if (salvando || uscendo) return;
  salvando = true;
  const argsExport = ['emulators:export', NUOVO, '--force', '--project', PROJECT];
  if (process.env.EMULATORI_CONFIG) argsExport.push('--config', CONFIG);
  const e = spawn('firebase', argsExport, { cwd: root, stdio: 'ignore' });
  e.on('exit', (code) => {
    salvando = false;
    if (code !== 0 || uscendo) { rmSync(NUOVO, { recursive: true, force: true }); if (code !== 0 && !uscendo) console.error('[autosave] salvataggio non riuscito: riprovo tra poco.'); return; }
    try {
      rmSync(VECCHIO, { recursive: true, force: true });
      if (existsSync(DATI)) renameSync(DATI, VECCHIO);
      renameSync(NUOVO, DATI);
      rmSync(VECCHIO, { recursive: true, force: true });
      console.log(`[autosave] dati salvati alle ${new Date().toLocaleTimeString('it-IT')}`);
    } catch (err) { console.error(`[autosave] non riesco a sostituire la cartella dei dati: ${err.message}`); }
  });
}

async function pronto() {
  for (let i = 0; i < 120; i++) {
    try { await fetch(FIRESTORE); return true; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  return false;
}

if (AUTOSAVE_MS > 0) setInterval(salvaOra, AUTOSAVE_MS).unref();
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
