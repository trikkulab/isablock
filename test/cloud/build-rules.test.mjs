// L'ambiente scuola non deve mai contenere email di prova; il dev deve
// contenere esattamente quelle configurate (anche nel file locale, se c'è).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRules } from '../../scripts/build-rules.mjs';
import { leggiAmbienti } from '../../scripts/ambienti.mjs';

test('scuola: lista email di prova vuota, nessun segnaposto rimasto', () => {
  const r = buildRules('scuola');
  assert.match(r, /return \[\];/);
  assert.doesNotMatch(r.replace(/\/\/.*$/gm, ''), /@@/);
  assert.doesNotMatch(r, /gmail\.com|example\.com/);
});

test('dev: contiene il dominio e le email di prova configurate', () => {
  const r = buildRules('dev');
  assert.match(r, /return 'isarome\.it';/);
  for (const email of leggiAmbienti().dev.emailProva) {
    assert.ok(r.includes(`'${email.toLowerCase()}'`), `manca ${email}`);
  }
});

test('il file committato non contiene email personali', async () => {
  const { readFileSync } = await import('node:fs');
  const testo = readFileSync(new URL('../../scripts/environments.json', import.meta.url), 'utf8');
  const email = testo.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
  assert.deepEqual(email.filter((e) => !e.endsWith('@example.com')), []);
});
