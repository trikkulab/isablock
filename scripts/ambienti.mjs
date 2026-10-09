// Legge gli ambienti da scripts/environments.json (committato, senza dati
// personali) e li completa con scripts/environments.local.json (ignorato da
// git) se esiste: lì stanno l'account della CLI, le email di prova e i
// docenti di prova, che non vanno su un repository pubblico.
// Il file locale sovrascrive, ambiente per ambiente, i campi che contiene.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));

export function leggiAmbienti() {
  const base = JSON.parse(readFileSync(`${dir}environments.json`, 'utf8'));
  const locale = `${dir}environments.local.json`;
  if (!existsSync(locale)) return base;
  const extra = JSON.parse(readFileSync(locale, 'utf8'));
  for (const [nome, campi] of Object.entries(extra)) base[nome] = { ...base[nome], ...campi };
  return base;
}
