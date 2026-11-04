// Formattazione del Markdown nell'editor delle tracce, come funzioni PURE sul testo: ogni formato
// riceve (testo, inizio, fine) — la selezione — e restituisce { testo, inizio, fine } con il testo
// nuovo e la nuova selezione. Non sa niente del DOM (la barra e il campo di testo stanno in
// editor-markdown.js), così si prova senza browser.
//
// Comportamento comune: premere due volte lo stesso pulsante toglie la formattazione («interruttore»);
// senza testo selezionato si inserisce un segnaposto già selezionato, da sovrascrivere scrivendo.

const SEGNAPOSTO = 'testo';

// ── Marcatori attorno al testo (grassetto, corsivo, ...) ──────────────────
// `marcatore` può essere lungo uno o due caratteri. Con `spazi: true` (apice e pedice) gli spazi
// dentro la selezione diventano «\ », perché in Markdown apice e pedice non possono contenere spazi.
function avvolgi(testo, inizio, fine, marcatore, { segnaposto = SEGNAPOSTO, spazi = false } = {}) {
  const lm = marcatore.length;
  const c = marcatore[0];
  const prima = testo.slice(0, inizio);
  const sel = testo.slice(inizio, fine);
  const dopo = testo.slice(fine);
  const togli = (interno) => ({
    testo: prima + interno + dopo, inizio, fine: inizio + interno.length,
  });
  const senzaEscape = (s) => (spazi ? s.replace(/\\ /g, ' ') : s);
  // Un marcatore di un carattere accanto a un altro uguale è parte di uno doppio (** o ~~): non è nostro.
  const solitario = (s, k) => lm > 1 || (s[k - 1] !== c && s[k + 1] !== c);

  // 1) la selezione comprende già i marcatori: *testo* selezionato per intero
  if (sel.length > 2 * lm && sel.startsWith(marcatore) && sel.endsWith(marcatore)
      && solitario(sel, 0) && solitario(sel, sel.length - 1)) {
    return togli(senzaEscape(sel.slice(lm, sel.length - lm)));
  }
  // 2) i marcatori stanno subito fuori dalla selezione: *[testo]*
  if (prima.endsWith(marcatore) && dopo.startsWith(marcatore)
      && (lm > 1 || (prima[prima.length - 2] !== c && dopo[1] !== c))) {
    const interno = senzaEscape(sel);
    return {
      testo: prima.slice(0, prima.length - lm) + interno + dopo.slice(lm),
      inizio: inizio - lm, fine: inizio - lm + interno.length,
    };
  }
  // 3) altrimenti si avvolge (con un segnaposto se non c'è niente di selezionato)
  let corpo = sel || segnaposto;
  if (spazi) corpo = corpo.replace(/ /g, '\\ ');
  return { testo: prima + marcatore + corpo + marcatore + dopo, inizio: inizio + lm, fine: inizio + lm + corpo.length };
}

export const grassetto = (t, i, f) => avvolgi(t, i, f, '**');
export const corsivo = (t, i, f) => avvolgi(t, i, f, '*');
export const barrato = (t, i, f) => avvolgi(t, i, f, '~~');
export const apice = (t, i, f) => avvolgi(t, i, f, '^', { segnaposto: '2', spazi: true });
export const pedice = (t, i, f) => avvolgi(t, i, f, '~', { segnaposto: '2', spazi: true });
export const codice = (t, i, f) => avvolgi(t, i, f, '`', { segnaposto: 'codice' });

// ── Prefissi di riga (titolo, elenchi, citazione) ─────────────────────────
// Le righe toccate sono quelle della selezione, per intero; la nuova selezione le comprende tutte.
function righeSelezionate(testo, inizio, fine) {
  const s = testo.lastIndexOf('\n', inizio - 1) + 1;
  let limite = fine;
  if (fine > inizio && testo[fine - 1] === '\n') limite = fine - 1;   // la selezione finisce a inizio riga: quella non conta
  const idx = testo.indexOf('\n', limite);
  const e = idx === -1 ? testo.length : idx;
  return { s, e, righe: testo.slice(s, e).split('\n') };
}

// Se non c'era niente di selezionato (`collassa`), il cursore va a fine blocco, così si può scrivere
// subito dopo il simbolo inserito; altrimenti la nuova selezione comprende tutte le righe toccate.
function sostituisciRighe(testo, s, e, nuove, collassa) {
  const blocco = nuove.join('\n');
  const fine = s + blocco.length;
  return { testo: testo.slice(0, s) + blocco + testo.slice(e), inizio: collassa ? fine : s, fine };
}

// Prefissi che si sostituiscono tra loro: elenco puntato, numerato, citazione, titolo.
const PREFISSO_QUALSIASI = /^(\s*)([-*+] |\d+[.)] |> ?|#{1,6} )/;
const togliPrefisso = (riga) => riga.replace(PREFISSO_QUALSIASI, '$1');

function conPrefisso(testo, inizio, fine, presente, prefisso) {
  const { s, e, righe } = righeSelezionate(testo, inizio, fine);
  const piene = righe.filter((r) => r.trim() !== '');
  const tuttePrefissate = piene.length > 0 && piene.every((r) => presente.test(r));
  let n = 0;
  const nuove = righe.map((r) => {
    if (r.trim() === '' && piene.length > 0) return r;                 // le righe vuote restano vuote
    if (tuttePrefissate) return r.replace(presente, '$1');             // seconda pressione: si toglie
    return `${/^\s*/.exec(r)[0]}${prefisso(++n)}${togliPrefisso(r).trimStart()}`;
  });
  return sostituisciRighe(testo, s, e, nuove, inizio === fine);
}

export const elencoPuntato = (t, i, f) => conPrefisso(t, i, f, /^(\s*)[-*+] /, () => '- ');
export const elencoNumerato = (t, i, f) => conPrefisso(t, i, f, /^(\s*)\d+[.)] /, (n) => `${n}. `);
export const citazione = (t, i, f) => conPrefisso(t, i, f, /^(\s*)> ?/, () => '> ');

// Titolo: a ogni pressione cambia livello, ## → ### → nessuno → ## ... (livello 1 è per il titolo della
// verifica, non della traccia).
export function titolo(testo, inizio, fine) {
  const { s, e, righe } = righeSelezionate(testo, inizio, fine);
  const prima = righe.find((r) => r.trim() !== '') ?? '';
  const livello = /^#{1,6}(?= )/.exec(prima.trimStart())?.[0].length ?? 0;
  const prossimo = livello === 0 ? 2 : livello === 2 ? 3 : livello === 3 ? 0 : 2;
  const nuove = righe.map((r) => {
    if (r.trim() === '' && righe.some((x) => x.trim() !== '')) return r;
    const pulita = togliPrefisso(r).trimStart();
    return prossimo ? `${'#'.repeat(prossimo)} ${pulita}` : pulita;
  });
  return sostituisciRighe(testo, s, e, nuove, inizio === fine);
}

// ── Blocco di codice ──────────────────────────────────────────────────────
export function bloccoCodice(testo, inizio, fine) {
  const { s, e, righe } = righeSelezionate(testo, inizio, fine);
  const recinto = /^\s*```/;
  if (righe.length >= 2 && recinto.test(righe[0]) && recinto.test(righe[righe.length - 1])) {
    const interno = righe.slice(1, -1).join('\n');
    return { testo: testo.slice(0, s) + interno + testo.slice(e), inizio: s, fine: s + interno.length };
  }
  const interno = righe.join('\n').trim() === '' ? 'codice' : righe.join('\n');
  const blocco = '```\n' + interno + '\n```';
  return { testo: testo.slice(0, s) + blocco + testo.slice(e), inizio: s + 4, fine: s + 4 + interno.length };
}

// ── Tabella: inserisce uno schema da compilare ────────────────────────────
export function tabella(testo, inizio, fine) {
  const prima = testo.slice(0, fine);
  const dopo = testo.slice(fine);
  const schema = ['| Colonna 1 | Colonna 2 |', '|-----------|-----------|', '| dato      | dato      |'].join('\n');
  const davanti = prima === '' || prima.endsWith('\n\n') ? '' : prima.endsWith('\n') ? '\n' : '\n\n';
  const dietro = dopo === '' ? '\n' : dopo.startsWith('\n\n') ? '' : dopo.startsWith('\n') ? '\n' : '\n\n';
  const da = prima.length + davanti.length + 2;       // dentro «| Colonna 1»
  return { testo: prima + davanti + schema + dietro + dopo, inizio: da, fine: da + 'Colonna 1'.length };
}

// ── Invio dentro un elenco: continua l'elenco, o lo chiude se la voce è vuota ──
// Restituisce { testo, pos } oppure null (nessun intervento: l'a-capo normale).
export function invio(testo, pos) {
  const s = testo.lastIndexOf('\n', pos - 1) + 1;
  const m = /^(\s*)(?:([-*+])|(\d+)([.)])|(>)) (.*)$/.exec(testo.slice(s, pos));
  if (!m) return null;
  const [, rientro, punto, numero, sep, citaz, contenuto] = m;
  if (contenuto.trim() === '') {                                   // voce vuota: l'elenco finisce qui
    // Se sopra c'è una riga di testo si lascia una riga vuota: senza, in Markdown il testo scritto subito
    // dopo verrebbe letto come continuazione dell'ultima voce.
    const sopra = s > 0 && testo.slice(testo.lastIndexOf('\n', s - 2) + 1, s - 1).trim() !== '';
    const separa = sopra ? '\n' : '';
    return { testo: testo.slice(0, s) + separa + rientro + testo.slice(pos), pos: s + separa.length + rientro.length };
  }
  const marcatore = punto ?? (citaz ? '>' : `${Number(numero) + 1}${sep}`);
  const nuovo = `\n${rientro}${marcatore} `;
  return { testo: testo.slice(0, pos) + nuovo + testo.slice(pos), pos: pos + nuovo.length };
}

// Per nome, come li usa la barra.
export const FORMATI = {
  grassetto, corsivo, barrato, apice, pedice, codice, titolo,
  elencoPuntato, elencoNumerato, citazione, bloccoCodice, tabella,
};
