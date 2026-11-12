// Esportazione anonima delle consegne (docente, a verifica chiusa): un JSON con i codici dei programmi e un CSV con le
// corrispondenze codice → studente. Parti pure, senza DOM né Blockly: la preparazione dei testi e il download stanno in
// esporta-ui.js. Il JSON non contiene nome né email di nessuno: solo un codice casuale per consegna, il titolo della
// verifica, le tracce (una volta sola) e i testi delle parti scelte.
import { codiceRiscontro } from './scheda-stampa.js';

// Niente 0/O, 1/I/L: si leggono e si ricopiano senza dubbi.
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const LUNGHEZZA_CODICE = 4;

function casuale() {
  const c = globalThis.crypto;
  if (c && c.getRandomValues) { const a = new Uint32Array(1); c.getRandomValues(a); return a[0] / 2 ** 32; }
  return Math.random();
}

// `n` codici distinti di 4 caratteri, in ordine casuale (nessun legame con l'ordine degli studenti). `rng`: per le prove.
export function generaCodici(n, rng = casuale) {
  const usati = new Set();
  while (usati.size < n) {
    let codice = '';
    for (let i = 0; i < LUNGHEZZA_CODICE; i++) codice += ALFABETO[Math.floor(rng() * ALFABETO.length)];
    usati.add(codice);
  }
  return [...usati];
}

// La riga del CSV: campi tra virgolette solo se serve (virgola, virgolette, a capo).
const campoCsv = (v) => { const t = String(v ?? ''); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

// Le parole del nome e dell'email che, se compaiono nei testi, possono tradire lo studente (almeno 3 lettere).
function paroleSensibili(nome, email) {
  const da = [...String(nome ?? '').split(/\s+/), String(email ?? '').split('@')[0]];
  return [...new Set(da.flatMap((t) => t.toLowerCase().split(/[^a-zà-öø-ÿ0-9]+/)).filter((p) => p.length >= 3))];
}

// `consegne`: [{ email, nome, versione, tracciaId, programma (stringa), testi: { pseudocode, c, python } | null }]
//   (la consegna valida di ogni studente). `tracce`: [{ id, titolo, testoMd }]. `parti`: { pseudocodice, c, python } (booleani;
//   mancante = tutte). Restituisce { json, csv, avvisi: [{ codice, parole }] }: gli avvisi dicono dove un testo contiene il
//   nome o l'email dello studente (commenti, nomi di variabili), cosa che l'esportazione non può ripulire.
export function costruisciEsportazione({ titolo, tracce, consegne, parti = {}, rng }) {
  const scelte = { pseudocodice: true, c: true, python: true, ...parti };
  const codici = generaCodici(consegne.length, rng);
  // Le tracce si chiamano A, B, C… nell'ordine della verifica; solo quelle usate da almeno una consegna.
  const sigle = new Map();
  const perId = new Map((tracce ?? []).map((t) => [t.id, t]));
  const usate = new Set(consegne.map((c) => c.tracciaId));
  for (const t of tracce ?? []) if (usate.has(t.id)) sigle.set(t.id, String.fromCharCode(65 + sigle.size));
  const tracceJson = {};
  for (const [id, sigla] of sigle) tracceJson[sigla] = { titolo: perId.get(id).titolo ?? '', testo: perId.get(id).testoMd ?? '' };

  const avvisi = [];
  const righe = consegne.map((c, i) => {
    const codice = codici[i];
    const voce = { codice, traccia: sigle.get(c.tracciaId) ?? null, riscontro: codiceRiscontro(c.programma) };
    if (!c.testi) voce.illeggibile = true;
    else {
      if (scelte.pseudocodice) voce.pseudocodice = c.testi.pseudocode;
      if (scelte.c) voce.c = c.testi.c;
      if (scelte.python) voce.python = c.testi.python;
      const tutto = [voce.pseudocodice, voce.c, voce.python].filter(Boolean).join('\n').toLowerCase();
      const trovate = paroleSensibili(c.nome, c.email).filter((p) => tutto.includes(p));
      if (trovate.length) avvisi.push({ codice, parole: trovate });
    }
    return { voce, c };
  }).sort((a, b) => a.voce.codice.localeCompare(b.voce.codice));

  const json = { verifica: titolo ?? '', tracce: tracceJson, consegne: righe.map((r) => r.voce) };
  const csv = ['codice,cognome,nome,email,versione,traccia', ...righe.map(({ voce, c }) => {
    const parti = String(c.nome ?? '').trim().split(/\s+/).filter(Boolean);
    return [voce.codice, parti.slice(1).join(' '), parti[0] ?? '', c.email, c.versione, voce.traccia ?? ''].map(campoCsv).join(',');
  })].join('\r\n') + '\r\n';
  return { json, csv, avvisi };
}
