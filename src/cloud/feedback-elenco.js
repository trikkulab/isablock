// L'elenco dei feedback del docente su una consegna, in sola lettura: la scheda «Feedback» della finestra «Guarda»
// (verifica-anteprima-ui.js), per il docente e per lo studente. Raggruppa per versione della consegna, dalla più nuova.
// Il docente vede anche le bozze (con il segno); lo studente riceve solo i commenti pubblicati. Non legge niente dal
// database: riceve la lista (feedbackDaDocumento di feedback.js).
import { el } from './dom.js';
import { feedbackEtichette as K } from './etichette.js';

const formatoData = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// `lista`: feedback; `studente`: true = vista dello studente (niente segni «bozza»/«pubblicato», solo «modificato»);
// `ultimaVersione`: la versione che vale (per dire «quella che vale»); `suCommenta`: se c'è, in cima il pulsante per
// commentare nell'editor (solo il docente, a verifica chiusa). `punto`: se il docente sta guardando un punto della Storia,
// { versione } (una consegna: solo i suoi commenti) oppure { versione: null } (un'istantanea del lavoro: nessuna consegna,
// quindi nessun commento); senza `punto` si vedono tutte le versioni.
export function creaElencoFeedback({ lista: tutti, studente = false, ultimaVersione = null, suCommenta = null, punto = null }) {
  const lista = punto && punto.versione !== null ? tutti.filter((f) => f.versione === punto.versione) : punto ? [] : tutti;
  const radice = el('div', { class: 'feedback-elenco' });
  if (suCommenta) {
    radice.append(el('div', { class: 'feedback-elenco-azioni' },
      el('button', { type: 'button', class: 'modal-btn secondary', onclick: suCommenta }, K.commentaNellEditor),
      el('span', { class: 'sketch-nota' }, K.commentaNota)));
  }
  if (punto) {
    radice.append(el('p', { class: 'sketch-nota feedback-punto' }, punto.versione === null
      ? K.puntoIstantanea
      : `Stai guardando la consegna v${punto.versione}: qui ci sono solo i suoi commenti. «${K.questaConsegna}» o «${K.ultimaConsegna}» in Storia mostrano tutti.`));
  }
  if (lista.length === 0) {
    radice.append(el('p', { class: 'sketch-nota' }, studente ? K.nessunoStudente : punto && punto.versione !== null ? K.nessunoSuVersione : punto ? '' : K.nessuno));
    return radice;
  }
  const versioni = [...new Set(lista.map((f) => f.versione))].sort((a, b) => b - a);
  for (const v of versioni) {
    const suoi = lista.filter((f) => f.versione === v);
    const bozze = suoi.filter((f) => !f.pubblicato).length;
    radice.append(el('h4', { class: 'feedback-versione' },
      `Consegna v${v}${v === ultimaVersione ? ' · quella che vale' : ''}`,
      el('span', { class: 'sketch-data' }, ` · ${suoi.length} ${suoi.length === 1 ? 'commento' : 'commenti'}${!studente && bozze ? `, ${bozze} ${bozze === 1 ? 'bozza' : 'bozze'}` : ''}`)));
    for (const f of suoi) {
      const stato = studente
        ? (f.modificatoDopo ? el('span', { class: 'cloud-badge feedback-badge-pubblicato' }, K.modificato) : '')
        : f.pubblicato
          ? el('span', { class: 'cloud-badge feedback-badge-pubblicato' }, f.modificatoDopo ? K.pubblicatoModificato : K.pubblicato)
          : el('span', { class: 'cloud-badge feedback-badge-bozza' }, K.bozza);
      const blocco = f.bloccoId ? el('span', { class: 'commento-blocco' }, f.bloccoTesto || 'blocco') : '';
      const meta = [blocco, f.autoreNome || 'Docente', f.creato ? formatoData.format(f.creato) : '', stato]
        .filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x]));
      radice.append(el('article', { class: 'commento' },
        el('p', { class: 'commento-testo' }, f.testo),
        el('div', { class: 'commento-meta' }, el('span', {}, ...meta))));
    }
  }
  return radice;
}
