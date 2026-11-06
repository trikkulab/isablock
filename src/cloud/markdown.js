// Resa del Markdown delle tracce di una verifica. UN SOLO modulo per anteprima del docente,
// scheda «Traccia» dello studente, così il testo si vede sempre allo stesso modo.
//
// Cosa rende: titoli, grassetto, corsivo, barrato (~~testo~~), apice (x^2^), pedice (H~2~O), elenchi
// puntati e numerati, citazioni, codice (in riga e a blocco), tabelle, righe orizzontali.
// Cosa NON rende (volutamente):
//   - HTML scritto a mano: viene mostrato come testo, mai eseguito;
//   - link: non sono cliccabili, appaiono come «testo (indirizzo)»;
//   - immagini: non si caricano (per ora), resta il testo alternativo tra parentesi quadre.
// Il risultato è una stringa HTML già sicura da assegnare a innerHTML: questo è l'UNICO posto
// dell'interfaccia cloud dove succede, e solo con l'output di rendiMarkdown().
//
// ATTENZIONE: la scheda di consegna in PDF NON usa questa resa HTML: ricompone il testo da sola (src/cloud/pdf-markdown.js
// e pdf-scheda.js). Se qui si aggiunge una funzionalità (un plugin, una regola abilitata), va aggiunta anche lì. Vedi
// docs/PDF-SCHEDA.md: la prova test/pdf-markdown.mjs fallisce se la configurazione qui sotto cambia senza aggiornare il PDF.
//
// La libreria (vendor/markdown/markdown-it.js, ~100 KB) si carica solo alla prima resa e funziona
// offline perché è un file locale.

// Tetto di sicurezza sulla lunghezza resa (le regole ne ammettono molti meno: maxTestoTraccia).
const MAX_RESA = 50000;

let pronto = null;

async function carica() {
  const { MarkdownIt, sub, sup } = await import('../../vendor/markdown/markdown-it.js');
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false });
  md.use(sub).use(sup);

  // Link: mai un <a>. Il testo resta, con l'indirizzo scritto tra parentesi (se c'è).
  md.renderer.rules.link_open = (tokens, i, opzioni, env) => {
    const href = tokens[i].attrGet('href') || '';
    const pila = env.pilaLink ?? (env.pilaLink = []);
    pila.push(href);
    return '<span class="md-link">';
  };
  md.renderer.rules.link_close = (tokens, i, opzioni, env) => {
    const href = (env.pilaLink ?? []).pop() || '';
    return href ? ` (${md.utils.escapeHtml(href)})</span>` : '</span>';
  };

  // Immagini: mai un <img>. Resta il testo alternativo.
  md.renderer.rules.image = (tokens, i) => {
    const alt = tokens[i].content || '';
    return `<span class="md-immagine">[immagine${alt ? `: ${md.utils.escapeHtml(alt)}` : ''}]</span>`;
  };

  return md;
}

// HTML della resa di `testo` (stringa vuota se non c'è testo).
export async function rendiMarkdown(testo) {
  if (typeof testo !== 'string' || !testo.trim()) return '';
  pronto ??= carica();
  const md = await pronto;
  return md.render(testo.slice(0, MAX_RESA), {});
}

// I «token» del Markdown (struttura del testo, non HTML), per chi lo ricompone in un altro formato (il PDF).
export async function tokenizzaMarkdown(testo) {
  if (typeof testo !== 'string' || !testo.trim()) return [];
  pronto ??= carica();
  const md = await pronto;
  return md.parse(testo.slice(0, MAX_RESA), {});
}
