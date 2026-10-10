// Test della finestra "Novità": quale pagina si apre da sola all'avvio.
// Nessuna libreria esterna: solo Node.  Uso: node test/changelog.mjs
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { indiceNovitaDaMostrare, isUnseenNews, compareVersions, changelog } =
  await import(pathToFileURL(path.join(root, 'src/changelog.js')).href);

// dalla più recente alla più vecchia, come nel file vero
const v = (version, silent = false) => ({ version, silent, title: version, date: '2026-01-01', items: ['x'] });
const lista = [v('1.8.2', true), v('1.8.1', true), v('1.8.0'), v('1.7.0'), v('1.6.0')];

let n = 0;
const prova = (nome, fn) => { fn(); n += 1; console.log('OK      ' + nome); };

prova('chi ha visto la 1.6.0 e salta 1.8.0 + due rilasci minori: si apre la 1.8.0, non la 1.8.2', () => {
  assert.equal(lista[indiceNovitaDaMostrare(lista, '1.6.0')].version, '1.8.0');
});
prova('chi ha visto la 1.7.0: si apre la 1.8.0', () => {
  assert.equal(lista[indiceNovitaDaMostrare(lista, '1.7.0')].version, '1.8.0');
});
prova('chi ha già visto la 1.8.0: i due rilasci minori non aprono niente', () => {
  assert.equal(indiceNovitaDaMostrare(lista, '1.8.0'), -1);
  assert.equal(indiceNovitaDaMostrare(lista, '1.8.1'), -1);
  assert.equal(indiceNovitaDaMostrare(lista, '1.8.2'), -1);
});
prova('più novità importanti non viste: si apre la più recente (le altre sono a una freccia)', () => {
  const l = [v('2.0.0'), v('1.9.1', true), v('1.9.0'), v('1.8.0')];
  assert.equal(l[indiceNovitaDaMostrare(l, '1.8.0')].version, '2.0.0');
  assert.equal(l[indiceNovitaDaMostrare(l, '1.9.0')].version, '2.0.0');
  assert.equal(l[indiceNovitaDaMostrare(l, '2.0.0')] ?? null, null);
});
prova('novità importante, poi minore, poi importante: dopo aver visto la prima si apre la seconda', () => {
  const l = [v('1.2.0'), v('1.1.1', true), v('1.1.0')];
  assert.equal(l[indiceNovitaDaMostrare(l, '1.1.0')].version, '1.2.0');
  assert.equal(l[indiceNovitaDaMostrare(l, '1.1.1')].version, '1.2.0');
});
prova('senza memoria della versione vista: si apre la più recente voce importante, mai una silent', () => {
  assert.equal(lista[indiceNovitaDaMostrare(lista, null)].version, '1.8.0');
  assert.equal(lista[indiceNovitaDaMostrare(lista, undefined)].version, '1.8.0');
});
prova('solo voci minori: non si apre mai', () => {
  const l = [v('1.0.2', true), v('1.0.1', true)];
  assert.equal(indiceNovitaDaMostrare(l, '1.0.0'), -1);
  assert.equal(indiceNovitaDaMostrare(l, null), -1);
});
prova('il segno «nuova» sulle pagine: tutte le più recenti della vista, anche le minori', () => {
  assert.deepEqual(lista.map((e) => isUnseenNews(lista, e, '1.7.0')), [true, true, true, false, false]);
  // senza memoria: solo la voce importante più recente
  assert.deepEqual(lista.map((e) => isUnseenNews(lista, e, null)), [false, false, true, false, false]);
});
prova('confronto di versioni numerico (1.10.0 > 1.9.0)', () => {
  assert.ok(compareVersions('1.10.0', '1.9.0') > 0);
  assert.ok(compareVersions('1.8.0', '1.8.0') === 0);
  assert.ok(compareVersions('1.2', '1.2.0') === 0);
});
prova('il changelog vero: versioni in ordine decrescente e senza doppioni', () => {
  for (let i = 1; i < changelog.length; i++) {
    assert.ok(compareVersions(changelog[i - 1].version, changelog[i].version) > 0, `${changelog[i - 1].version} deve venire dopo ${changelog[i].version}`);
  }
});
console.log(`\n${n}/${n} test passati.`);
