// «C'è una verifica in corso su questo computer»: un indizio nel localStorage, indipendente da Blockly e da Firebase.
// Serve a main.js, all'avvio, PRIMA che il cloud si carichi: se lo studente ricarica la pagina nel mezzo di una verifica
// non gli si deve proporre di riprendere vecchie copie (sarebbe una porta verso lavoro preparato prima). Finita la
// verifica, la proposta normale di ripristino parte come sempre. L'indizio scade da solo (scadenza + margine): una
// verifica dimenticata non deve bloccare per sempre.
const CHIAVE = 'isablock.verifica.inCorso';
const MARGINE_MS = 2 * 60 * 60 * 1000;

const storage = () => { try { return window.localStorage; } catch { return null; } };

// `titolo`, `email`, `scadenzaMs` e `scartoMs` (ora del server meno orologio del PC) servono a RIENTRARE in verifica quando la
// pagina si ricarica senza rete (src/cloud/verifica-studente-ui.js): senza il server la scadenza, il titolo e lo scarto
// dell'orologio non si potrebbero sapere. L'orologio del PC offline è falsabile: limite accettato.
export function segnaVerificaInCorso({ vid, scadenzaMs, titolo = '', email = '', scartoMs = 0 }) {
  try {
    storage()?.setItem(CHIAVE, JSON.stringify({ vid, titolo: String(titolo).slice(0, 80), email: String(email).toLowerCase(), scadenzaMs: scadenzaMs ?? null, scartoMs, finoA: (scadenzaMs ?? Date.now()) + MARGINE_MS }));
  } catch { /* storage non disponibile */ }
}

// Aggiorna scadenza e scarto di un indizio già segnato (il docente può dare tempo; lo scarto si calibra dopo l'ingresso).
export function aggiornaVerificaInCorso({ scadenzaMs, scartoMs }) {
  try {
    const v = leggiVerificaInCorso();
    if (!v) return;
    if (scadenzaMs !== undefined && scadenzaMs !== null) { v.scadenzaMs = scadenzaMs; v.finoA = scadenzaMs + MARGINE_MS; }
    if (scartoMs !== undefined) v.scartoMs = scartoMs;
    storage()?.setItem(CHIAVE, JSON.stringify(v));
  } catch { /* storage non disponibile */ }
}

export function cancellaVerificaInCorso() {
  try { storage()?.removeItem(CHIAVE); } catch { /* storage non disponibile */ }
}

// L'indizio, se c'è ed è ancora valido; altrimenti null (e se è scaduto lo toglie).
export function leggiVerificaInCorso(adesso = Date.now()) {
  try {
    const s = storage();
    const grezzo = s?.getItem(CHIAVE);
    if (!grezzo) return null;
    const v = JSON.parse(grezzo);
    if (!v || typeof v.finoA !== 'number' || v.finoA < adesso) { s.removeItem(CHIAVE); return null; }
    return v;
  } catch { return null; }
}
