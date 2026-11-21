// L'elenco dei feedback del docente su UNA consegna, in sola lettura: la scheda «Feedback» della finestra «Guarda»
// (verifica-anteprima-ui.js), per il docente e per lo studente. I commenti sono legati alla versione della consegna: si vedono
// solo quelli della versione che si sta guardando (così non si confondono con quelli di un'altra). Se ce ne sono su altre
// versioni, una riga lo ricorda. Il docente vede anche le bozze (con il segno); lo studente riceve solo i commenti pubblicati.
// Non legge niente dal database: riceve la lista (feedbackDaDocumento di feedback.js).
import { el } from './dom.js';
import { feedbackEtichette as K } from './etichette.js';

const formatoData = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// `lista`: tutti i feedback dello studente nella verifica (tutte le versioni); `versione`: la consegna che si guarda, oppure
// null se è un'istantanea del lavoro (non una consegna: nessun commento); `studente`: true = vista dello studente (niente segni
// «bozza»/«pubblicato», solo «modificato»); `ultimaVersione`: la versione che vale; `suCommenta`: se c'è, in cima il pulsante per
// commentare nell'editor (solo il docente, a verifica chiusa).
export function creaElencoFeedback({ lista: tutti, versione, studente = false, ultimaVersione = null, suCommenta = null }) {
  const radice = el('div', { class: 'feedback-elenco' });
  if (suCommenta) {
    radice.append(el('div', { class: 'feedback-elenco-azioni' },
      el('button', { type: 'button', class: 'modal-btn secondary', onclick: suCommenta }, K.commentaNellEditor),
      el('span', { class: 'sketch-nota' }, K.commentaNota)));
  }
  if (versione === null) {
    radice.append(el('p', { class: 'sketch-nota feedback-punto' }, K.puntoIstantanea));
    return radice;
  }
  const lista = tutti.filter((f) => f.versione === versione);
  const bozze = lista.filter((f) => !f.pubblicato).length;
  radice.append(el('h4', { class: 'feedback-versione' },
    `Consegna v${versione}${versione === ultimaVersione ? ' · quella che vale' : ''}`,
    el('span', { class: 'sketch-data' }, lista.length === 0 ? '' : ` · ${lista.length} ${lista.length === 1 ? 'commento' : 'commenti'}${!studente && bozze ? `, ${bozze} ${bozze === 1 ? 'bozza' : 'bozze'}` : ''}`)));
  if (lista.length === 0) radice.append(el('p', { class: 'sketch-nota' }, studente ? K.nessunoStudente : K.nessuno));
  for (const f of lista) {
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
  // Commenti su altre versioni: non si mostrano qui, ma si dice dove sono.
  const altre = [...new Set(tutti.filter((f) => f.versione !== versione).map((f) => f.versione))].sort((a, b) => b - a)
    .map((v) => `v${v} (${tutti.filter((f) => f.versione === v).length})`);
  if (altre.length) radice.append(el('p', { class: 'sketch-nota feedback-altre' }, `${K.altreVersioni} ${altre.join(', ')}. ${studente ? K.altreStudente : K.altreDocente}`));
  return radice;
}
