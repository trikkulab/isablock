import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomeCasuale, NUMERO_COMBINAZIONI, _liste } from '../../src/cloud/nomi.js';

test('formato animale-aggettivo, minuscolo, entro il limite del nome (60)', () => {
  for (let i = 0; i < 500; i++) {
    const n = nomeCasuale();
    assert.match(n, /^[a-z]+-[a-z]+$/);
    assert.ok(n.length <= 60);
  }
});

test('ogni combinazione è possibile e il genere concorda', () => {
  const visti = new Set();
  for (const [nome, genere] of _liste.NOMI) {
    for (const [m, f] of _liste.AGGETTIVI) {
      const attesi = genere === 'm' ? m : f;
      // il generatore finto sceglie esattamente (nome, aggettivo)
      const iN = _liste.NOMI.findIndex(([x]) => x === nome);
      const iA = _liste.AGGETTIVI.findIndex(([x]) => x === m);
      const valori = [(iN + 0.5) / _liste.NOMI.length, (iA + 0.5) / _liste.AGGETTIVI.length];
      let k = 0;
      const n = nomeCasuale(() => valori[k++]);
      assert.equal(n, `${nome}-${attesi}`);
      visti.add(n);
    }
  }
  assert.equal(visti.size, NUMERO_COMBINAZIONI);
});

test('caso estremo 0.999… non esce dalle liste', () => {
  assert.match(nomeCasuale(() => 0.9999999), /^[a-z]+-[a-z]+$/);
  assert.match(nomeCasuale(() => 0), /^[a-z]+-[a-z]+$/);
});
