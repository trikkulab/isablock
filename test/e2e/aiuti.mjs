// Aiuti per le prove nel browser: Chromium (Playwright), accesso con un account finto dell'emulatore,
// dati di prova via REST sull'emulatore Firestore.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

export const PROGETTO = 'demo-isablock';
const HOST_FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8186';   // lo imposta emulators:exec
const REST = `http://${HOST_FIRESTORE}/v1/projects/${PROGETTO}/databases/(default)/documents`;
const intestazioni = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
export const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';   // tasto dei comandi (Cmd/Ctrl)

// Con E2E_SCHERMATE=<cartella> salva le schermate (utili per guardarle a occhio).
const cartellaSchermate = process.env.E2E_SCHERMATE || null;
if (cartellaSchermate) mkdirSync(cartellaSchermate, { recursive: true });
export const schermata = async (page, nome) => { if (cartellaSchermate) await page.screenshot({ path: `${cartellaSchermate}/${nome}.png` }); };

let esiti = { ok: 0, ko: 0 };
export function verifica(condizione, messaggio) {
  if (condizione) esiti.ok++; else esiti.ko++;
  console.log(`${condizione ? 'ok      ' : 'FALLITO '} ${messaggio}`);
}
export const riepilogo = () => { console.log(`\n${esiti.ok} controlli riusciti, ${esiti.ko} falliti`); return esiti.ko === 0; };

export const leggi = async (percorso) => (await fetch(`${REST}/${percorso}`, { headers: intestazioni })).json();
export const scrivi = (percorso, campi) => fetch(`${REST}/${percorso}`, { method: 'PATCH', headers: intestazioni, body: JSON.stringify({ fields: campi }) });
// Cambia solo i campi indicati (gli altri restano), come un update.
export const aggiorna = (percorso, campi) => fetch(`${REST}/${percorso}?${Object.keys(campi).map((c) => `updateMask.fieldPaths=${c}`).join('&')}`, { method: 'PATCH', headers: intestazioni, body: JSON.stringify({ fields: campi }) });
export const abilitaDocente = (email) => scrivi(`docenti/${email}`, { attivo: { booleanValue: true } });

// Valori tipizzati per scrivere nel database dalla prova (formato REST di Firestore)
export const S = (x) => ({ stringValue: x });
export const B = (x) => ({ booleanValue: x });
export const T = (ms) => ({ timestampValue: new Date(ms).toISOString() });
export const N = () => ({ nullValue: null });
export const A = (...x) => ({ arrayValue: { values: x.map(S) } });
export const campi = (o) => o;
export const valoreTesto = (doc, campo) => doc?.fields?.[campo]?.stringValue;

export const avviaBrowser = () => chromium.launch();

// Entra con un account finto dell'emulatore. L'accesso passa dall'SDK con una credenziale Google finta
// (l'emulatore accetta un id_token scritto come JSON): è deterministico. La finestra a due clic con il
// popup dell'emulatore l'ho provata a mano, ma in Chromium senza interfaccia il clic su «Sign in»
// a volte non ha effetto, e per una prova ripetibile non serve.
// Restituisce { page, errori } (gli errori della pagina raccolti finora).
// `prima(page)` (facoltativo) gira dopo aver aperto l'app e PRIMA dell'accesso: serve a preparare lo stato dell'editor.
export async function accedi(browser, email, { nome = 'Utente Prova', larghezza = 1280, altezza = 860, prima = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: larghezza, height: altezza } });
  const page = await ctx.newPage();
  const errori = [];
  page.on('pageerror', (e) => errori.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errori.push(`console: ${m.text()}`); });
  await page.goto('http://localhost:8123/');
  await page.click('text=Ho capito, iniziamo', { timeout: 5000 }).catch(() => {});      // finestra di benvenuto
  if (prima) await prima(page);
  await page.click('.cloud-accedi');                                                      // l'app carica il cloud
  await page.waitForSelector('.modal-btn:has-text("Continua con Google")', { timeout: 20000 });
  await page.evaluate(async ({ email, nome }) => {
    const { avviaFirebase } = await import('/src/cloud/firebase-client.js');
    const { sdk, auth } = avviaFirebase();               // già avviato dall'app: restituisce la stessa istanza
    const token = JSON.stringify({ sub: `utente-${email}`, email, email_verified: true, name: nome });
    await sdk.signInWithCredential(auth, sdk.GoogleAuthProvider.credential(token));
  }, { email, nome });
  try {
    await page.waitForSelector('.cloud-menu:not([hidden])', { timeout: 20000 });
  } catch {
    await schermata(page, 'accesso-fallito');
    throw new Error(`accesso non riuscito per ${email}. Errori della pagina: ${JSON.stringify(errori)}`);
  }
  return { page, errori };
}
