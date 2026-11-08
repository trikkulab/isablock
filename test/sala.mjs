import test from 'node:test';
import assert from 'node:assert/strict';
import { colonneMigliori, iniziali, haBisogno } from '../src/cloud/sala-ui.js';

test('colonne: una sola tessera, una colonna', () => assert.equal(colonneMigliori(1, 1000, 600), 1));
test('colonne: schermo largo e 30 tessere → più colonne che righe', () => {
  const c = colonneMigliori(30, 1600, 800);
  assert.ok(c >= 6 && c <= 8, `colonne: ${c}`);
});
test('colonne: schermo stretto e alto → poche colonne', () => assert.ok(colonneMigliori(6, 400, 1200) <= 2));
test('colonne: copre sempre tutte le tessere', () => {
  for (let n = 1; n <= 40; n++) { const c = colonneMigliori(n, 1300, 700); assert.ok(c >= 1 && c <= n); }
});
test('iniziali: nome e cognome, un nome, solo email', () => {
  assert.equal(iniziali('Mario Rossi', 'a@b.it'), 'MR');
  assert.equal(iniziali('Anna Maria De Luca', 'a@b.it'), 'AL');
  assert.equal(iniziali('Giulia', 'a@b.it'), 'GI');
  assert.equal(iniziali(null, 'zeta@b.it'), 'ZE');
});
test('chi ha bisogno: offline, salto, errore, timer rosso; non chi ha consegnato', () => {
  const base = { stato: 'scrive', connessione: { stato: 'online' }, salto: 0, timer: { colore: 'verde' } };
  assert.equal(haBisogno(base), false);
  assert.equal(haBisogno({ ...base, connessione: { stato: 'offline' } }), true);
  assert.equal(haBisogno({ ...base, salto: 12 }), true);
  assert.equal(haBisogno({ ...base, stato: 'errore' }), true);
  assert.equal(haBisogno({ ...base, timer: { colore: 'rosso' } }), true);
  assert.equal(haBisogno({ ...base, stato: 'consegnato', salto: 12 }), false);
});
