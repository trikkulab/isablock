// Dal Markdown della traccia (token di markdown-it, vedi tokenizzaMarkdown in markdown.js) a una struttura di dati semplice
// che l'impaginatore del PDF (pdf-scheda.js) sa disegnare. Modulo PURO: niente DOM, niente jsPDF.
//
// ATTENZIONE: il PDF non usa la resa HTML di markdown.js, quindi ogni funzionalità del Markdown va gestita anche qui.
// La prova test/pdf-markdown.mjs fallisce se la configurazione di markdown.js cambia senza che questo file sia aggiornato.
//
// Nodi di blocco:
//   { t: 'titolo', livello, righe }            righe = «run» in linea (vedi sotto)
//   { t: 'paragrafo', righe }
//   { t: 'elenco', ordinato, inizio, voci }    voci = [[nodi di blocco], ...] (gli elenchi si annidano nelle voci)
//   { t: 'citazione', blocchi }
//   { t: 'codice', testo }
//   { t: 'tabella', intestazione: [righe], righe: [[righe]], }  (ogni cella è un array di «run»)
//   { t: 'linea' }
// «Run» in linea: { testo, grassetto, corsivo, barrato, apice, pedice, codice } oppure { aCapo: true }.

// Token che sappiamo disegnare. Tutto il resto finisce nel ripiego (testo semplice) e viene segnalato in `nonSupportati`.
export const TOKEN_BLOCCO = Object.freeze([
  'heading', 'paragraph', 'bullet_list', 'ordered_list', 'list_item', 'blockquote', 'fence', 'code_block', 'hr',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'inline',
]);
export const TOKEN_IN_LINEA = Object.freeze([
  'text', 'strong', 'em', 's', 'sub', 'sup', 'code_inline', 'link', 'image', 'softbreak', 'hardbreak',
]);

const STILI = { strong: 'grassetto', em: 'corsivo', s: 'barrato', sub: 'pedice', sup: 'apice' };

// Il testo di un token `inline` come lista di run con lo stile.
function runDi(inline, nonSupportati) {
  const out = [];
  const attivi = { grassetto: 0, corsivo: 0, barrato: 0, apice: 0, pedice: 0 };
  const hrefs = [];
  const aggiungi = (testo, extra = {}) => {
    if (testo === '') return;
    const run = { testo, ...extra };
    for (const k of Object.keys(attivi)) if (attivi[k] > 0) run[k] = true;
    out.push(run);
  };
  for (const f of inline.children ?? []) {
    const base = f.type.replace(/_(open|close)$/, '');
    if (f.type === 'text') aggiungi(f.content);
    else if (f.type === 'code_inline') aggiungi(f.content, { codice: true });
    else if (f.type === 'softbreak') aggiungi(' ');
    else if (f.type === 'hardbreak') out.push({ aCapo: true });
    else if (STILI[base] && f.type.endsWith('_open')) attivi[STILI[base]]++;
    else if (STILI[base] && f.type.endsWith('_close')) attivi[STILI[base]]--;
    else if (f.type === 'link_open') hrefs.push(f.attrGet?.('href') ?? (f.attrs ?? []).find((a) => a[0] === 'href')?.[1] ?? '');
    else if (f.type === 'link_close') { const h = hrefs.pop(); if (h) aggiungi(` (${h})`); }
    else if (f.type === 'image') aggiungi(`[immagine${f.content ? `: ${f.content}` : ''}]`);
    else { nonSupportati.add(f.type); aggiungi(f.content ?? ''); }       // ripiego: il testo, senza stile
  }
  return out;
}

// Indice del token di chiusura che corrisponde all'apertura in `i`.
function chiusura(tokens, i) {
  let livello = 0;
  for (let j = i; j < tokens.length; j++) {
    livello += tokens[j].nesting;
    if (livello === 0) return j;
  }
  return tokens.length - 1;
}

function celleDi(tokens, inizio, fine, nonSupportati) {
  const celle = [];
  for (let i = inizio; i < fine; i++) {
    if (tokens[i].type === 'th_open' || tokens[i].type === 'td_open') {
      const c = chiusura(tokens, i);
      const inline = tokens.slice(i + 1, c).find((x) => x.type === 'inline');
      celle.push(inline ? runDi(inline, nonSupportati) : []);
      i = c;
    }
  }
  return celle;
}

function blocchiDi(tokens, da, a, nonSupportati) {
  const out = [];
  for (let i = da; i < a; i++) {
    const t = tokens[i];
    switch (t.type) {
      case 'heading_open': {
        const c = chiusura(tokens, i);
        const inline = tokens[i + 1];
        out.push({ t: 'titolo', livello: Number(t.tag.slice(1)) || 1, righe: inline?.type === 'inline' ? runDi(inline, nonSupportati) : [] });
        i = c; break;
      }
      case 'paragraph_open': {
        const c = chiusura(tokens, i);
        const inline = tokens[i + 1];
        out.push({ t: 'paragrafo', righe: inline?.type === 'inline' ? runDi(inline, nonSupportati) : [] });
        i = c; break;
      }
      case 'bullet_list_open':
      case 'ordered_list_open': {
        const c = chiusura(tokens, i);
        const voci = [];
        for (let j = i + 1; j < c; j++) {
          if (tokens[j].type === 'list_item_open') {
            const cj = chiusura(tokens, j);
            voci.push(blocchiDi(tokens, j + 1, cj, nonSupportati));
            j = cj;
          }
        }
        const ordinato = t.type === 'ordered_list_open';
        const inizio = ordinato ? Number(t.attrGet?.('start') ?? (t.attrs ?? []).find((x) => x[0] === 'start')?.[1] ?? 1) || 1 : 1;
        out.push({ t: 'elenco', ordinato, inizio, voci });
        i = c; break;
      }
      case 'blockquote_open': {
        const c = chiusura(tokens, i);
        out.push({ t: 'citazione', blocchi: blocchiDi(tokens, i + 1, c, nonSupportati) });
        i = c; break;
      }
      case 'fence':
      case 'code_block':
        out.push({ t: 'codice', testo: String(t.content ?? '').replace(/\n$/, '') });
        break;
      case 'hr':
        out.push({ t: 'linea' });
        break;
      case 'table_open': {
        const c = chiusura(tokens, i);
        let intestazione = []; const righe = [];
        for (let j = i + 1; j < c; j++) {
          if (tokens[j].type === 'thead_open' || tokens[j].type === 'tbody_open') {
            const cj = chiusura(tokens, j);
            const testa = tokens[j].type === 'thead_open';
            for (let k = j + 1; k < cj; k++) {
              if (tokens[k].type === 'tr_open') {
                const ck = chiusura(tokens, k);
                const celle = celleDi(tokens, k + 1, ck, nonSupportati);
                if (testa) intestazione = celle; else righe.push(celle);
                k = ck;
              }
            }
            j = cj;
          }
        }
        out.push({ t: 'tabella', intestazione, righe });
        i = c; break;
      }
      default:
        if (t.nesting === 1) {
          // Blocco sconosciuto: lo si salta intero, tenendo il testo dei suoi paragrafi come testo semplice.
          nonSupportati.add(t.type);
          const c = chiusura(tokens, i);
          const dentro = blocchiDi(tokens, i + 1, c, nonSupportati);
          out.push(...dentro);
          i = c;
        } else if (t.type === 'inline') {
          out.push({ t: 'paragrafo', righe: runDi(t, nonSupportati) });
        } else if (t.nesting === 0) {
          nonSupportati.add(t.type);
          if (t.content) out.push({ t: 'paragrafo', righe: [{ testo: t.content }] });
        }
    }
  }
  return out;
}

// `tokens`: l'elenco di token di tokenizzaMarkdown(). Mai un errore: il peggio che può capitare è del testo semplice.
export function convertiMarkdown(tokens) {
  const nonSupportati = new Set();
  let blocchi = [];
  try { blocchi = blocchiDi(tokens ?? [], 0, (tokens ?? []).length, nonSupportati); } catch { blocchi = []; }
  return { blocchi, nonSupportati: [...nonSupportati] };
}

// Ripiego totale (il Markdown non si legge): il testo così com'è, un paragrafo per riga vuota.
export function testoSemplice(testo) {
  const blocchi = String(testo ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    .map((p) => ({ t: 'paragrafo', righe: [{ testo: p.replace(/\s*\n\s*/g, ' ') }] }));
  return { blocchi, nonSupportati: [] };
}
