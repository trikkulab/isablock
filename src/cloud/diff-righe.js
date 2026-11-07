// Differenze tra due testi, riga per riga (nessuna interfaccia). Serve al confronto affiancato del docente: i due testi
// sono codice generato dallo STESSO motore, quindi le righe uguali sono identiche carattere per carattere (rientri
// compresi) e basta confrontarle così; fanno differenza solo le stringhe scritte a mano dallo studente.
// Algoritmo: sottosequenza comune più lunga delle righe. Per programmi di qualche decina di righe è istantaneo.

// Restituisce { soloA, soloB }: gli indici (da 0) delle righe che ci sono solo nel primo / solo nel secondo testo.
export function differenzeRighe(a, b) {
  const A = String(a ?? '').split('\n');
  const B = String(b ?? '').split('\n');
  const n = A.length;
  const m = B.length;
  // lunghezza della sottosequenza comune dei suffissi: l[i][j] per A[i..] e B[j..]
  const l = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      l[i][j] = A[i] === B[j] ? l[i + 1][j + 1] + 1 : Math.max(l[i + 1][j], l[i][j + 1]);
    }
  }
  const soloA = new Set();
  const soloB = new Set();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { i++; j++; } else if (l[i + 1][j] >= l[i][j + 1]) soloA.add(i++); else soloB.add(j++);
  }
  while (i < n) soloA.add(i++);
  while (j < m) soloB.add(j++);
  return { soloA, soloB };
}
