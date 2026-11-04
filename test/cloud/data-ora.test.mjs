import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perCampo, daCampo, finePredefinita } from '../../src/cloud/data-ora.js';

test('perCampo e daCampo si corrispondono', () => {
  const d = new Date(2026, 10, 12, 9, 5);
  assert.equal(perCampo(d), '2026-11-12T09:05');
  assert.equal(daCampo('2026-11-12T09:05').getTime(), d.getTime());
  assert.equal(perCampo(daCampo('2026-01-02T23:59')), '2026-01-02T23:59');
});

test('daCampo rifiuta ciò che non è una data e ora valide', () => {
  for (const v of ['', null, undefined, 'domani', '2026-11-12', '2026-11-12T10', '2026-02-31T10:00', '2026-13-01T10:00', '2026-11-12T25:00', '2026-11-12T10:61', '2026-11-12 10:30']) {
    assert.equal(daCampo(v), null, String(v));
  }
});

test('la fine predefinita è tra due ore, arrotondata ai 5 minuti successivi', () => {
  const r = finePredefinita(new Date(2026, 10, 12, 8, 2, 30));
  assert.equal(perCampo(r), '2026-11-12T10:05');
  assert.equal(perCampo(finePredefinita(new Date(2026, 10, 12, 8, 0, 0))), '2026-11-12T10:00');   // già multiplo: resta
  assert.equal(perCampo(finePredefinita(new Date(2026, 10, 12, 23, 30, 0))), '2026-11-13T01:30');  // supera la mezzanotte
});
