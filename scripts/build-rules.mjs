// Genera firestore.rules dal modello firestore.rules.template per un ambiente
// di scripts/environments.json (più environments.local.json, vedi ambienti.mjs). Uso: node scripts/build-rules.mjs <dev|scuola|test>
// Esporta anche buildRules(env) per i test.
import { readFileSync, writeFileSync } from 'node:fs';
import { leggiAmbienti } from './ambienti.mjs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export function buildRules(env) {
  const envs = leggiAmbienti();
  if (!envs[env]) throw new Error(`Ambiente sconosciuto: ${env}`);
  const { dominio, emailProva } = envs[env];
  const lista = '[' + emailProva.map((e) => `'${e.toLowerCase()}'`).join(', ') + ']';
  return readFileSync(`${root}firestore.rules.template`, 'utf8')
    .replace(/@@DOMINIO@@/g, dominio)
    .replace(/return @@EMAIL_PROVA@@;/, `return ${lista};`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = process.argv[2];
  try {
    writeFileSync(`${root}firestore.rules`, buildRules(env));
    console.log(`firestore.rules generato per "${env}"`);
  } catch (e) {
    console.error(e.message);
    console.error('Uso: node scripts/build-rules.mjs <dev|scuola|test>');
    process.exit(1);
  }
}
