// «C'è una verifica in corso su questo computer»: un indizio nel localStorage, indipendente da Blockly e da Firebase.
// Serve a main.js, all'avvio, PRIMA che il cloud si carichi: se lo studente ricarica la pagina nel mezzo di una verifica
// non gli si deve proporre di riprendere vecchie copie (sarebbe una porta verso lavoro preparato prima). Finita la
// verifica, la proposta normale di ripristino parte come sempre. L'indizio scade da solo (scadenza + margine): una
// verifica dimenticata non deve bloccare per sempre.
const CHIAVE = 'isablock.verifica.inCorso';
const MARGINE_MS = 2 * 60 * 60 * 1000;

const storage = () => { try { return window.localStorage; } catch { return null; } };

export function segnaVerificaInCorso({ vid, scadenzaMs }) {
  try { storage()?.setItem(CHIAVE, JSON.stringify({ vid, finoA: (scadenzaMs ?? Date.now()) + MARGINE_MS })); } catch { /* storage non disponibile */ }
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
