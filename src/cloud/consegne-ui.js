// «Le mie consegne»: lo studente rivede il lavoro che ha consegnato nelle verifiche CONCLUSE. Sola lettura: la consegna è
// immutabile e resta com'è. Per ogni versione si può guardarla (blocchi + pseudocodice/C/Python), aprirne una COPIA
// nell'editor per lavorarci (non cambia la consegna) o salvarla su file. Non c'è per le verifiche aperte né in verifica
// (il menu del cloud, in verifica, è spento).
import { el, apriFinestra } from './dom.js';
import { formatoDataOra } from './data-ora.js';
import { etichettaCorso } from './corsi.js';
import { apriAnteprima } from './verifica-anteprima-ui.js';
import { contaBlocchi } from './verifica-tabella.js';

const ORIGINE = {
  studente: 'consegnata da te',
  automatica: 'consegnata da sola allo scadere del tempo',
  raccolta: 'raccolta dal docente alla chiusura',
  file: 'caricata dal docente dal tuo file di emergenza',
};

const slug = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'verifica';

export function montaConsegne({ toast, programma, dopoCaricamento = () => {} }) {
  let api = null;           // oggetto dello studente (verificaStudentePer) con mieConsegne()
  let corsi = null;         // i suoi corsi (corsiPer)
  let finestra = null;

  const messaggio = (err) => (err && err.message) || 'Qualcosa è andato storto. Riprova.';

  function scarica(testo, nomeFile) {
    const url = URL.createObjectURL(new Blob([testo], { type: 'application/json' }));
    const a = el('a', { href: url, download: nomeFile, hidden: '' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function guarda(v, c) {
    apriAnteprima({
      apri: (titolo, onChiudi, opzioni) => apriFinestra(titolo, onChiudi, opzioni),
      programma, email: api.email, nome: `${v.titolo} · consegna v${c.versione}`,
      titolo: `La tua consegna v${c.versione}: ${v.titolo}`,
      nota: 'Sola lettura: è la copia che hai consegnato e non si può modificare.',
      segui: (_e, cb) => { cb({ programma: c.programma, nBlocchi: contaBlocchi(c.programma), consegnato: true, ultimoSegnale: null }); return () => {}; },
    });
  }

  function apriInEditor(v, c) {
    if (programma.occupato()) { toast('Interrompi l\'esecuzione prima di aprire la consegna.', 'error'); return; }
    if (!programma.isVuoto() && !window.confirm('Aprire la consegna nell\'editor? Il programma corrente andrà perso.')) return;
    try { programma.carica(c.programma); } catch { toast('Non riesco ad aprire questa consegna.', 'error'); return; }
    dopoCaricamento();
    finestra?.chiudi();
    toast(`Consegna v${c.versione} aperta nell'editor: è una copia, la consegna resta com'è.`, 'success');
  }

  function riga(v, c, valida) {
    const n = contaBlocchi(c.programma);
    return el('div', { class: 'consegna-riga' },
      el('div', { class: 'consegna-info' },
        el('strong', {}, `v${c.versione}${valida ? ' · quella che vale' : ''}`),
        el('span', { class: 'sketch-data' }, [ORIGINE[c.origine] ?? c.origine, c.creato ? formatoDataOra.format(c.creato) : '', n === null ? '' : `${n} blocchi`].filter(Boolean).join(' · '))),
      el('button', { type: 'button', class: 'modal-btn', onclick: () => guarda(v, c) }, 'Guarda'),
      el('button', { type: 'button', class: 'modal-btn secondary', title: 'Apre una copia nell\'editor, per lavorarci', onclick: () => apriInEditor(v, c) }, 'Apri nell\'editor'),
      el('button', { type: 'button', class: 'modal-btn secondary', onclick: () => scarica(c.programma, `${slug(v.titolo)}_consegna-v${c.versione}.json`) }, 'Salva su file'));
  }

  async function apri() {
    if (!api || finestra) return;
    const f = apriFinestra('Le mie consegne', () => { finestra = null; }, { larga: true });
    finestra = f;
    const lista = el('div', { class: 'corsi-lista' }, el('p', { class: 'sketch-nota' }, 'Carico…'));
    f.corpo.append(
      el('p', { class: 'sketch-nota' }, 'Il lavoro che hai consegnato nelle verifiche concluse. Le consegne non si possono modificare: puoi guardarle, salvarle su file o aprirne una copia nell\'editor.'),
      lista);
    let trovate;
    try {
      const mieiCorsi = await corsi.elenca({ archiviati: true });
      trovate = await api.mieConsegne(mieiCorsi.map((c) => c.id));
      if (finestra !== f) return;
      const corsiPerId = new Map(mieiCorsi.map((c) => [c.id, c]));
      lista.textContent = '';
      if (trovate.length === 0) { lista.append(el('p', { class: 'sketch-nota' }, 'Non hai ancora consegne in verifiche concluse.')); return; }
      for (const { verifica: v, consegne } of trovate) {
        const chiusa = (v.chiusaIl ?? v.fine);
        // Una CORNICE per verifica: testata con titolo e data, sotto le sue consegne.
        lista.append(el('section', { class: 'consegne-gruppo', 'aria-label': v.titolo },
          el('header', { class: 'consegne-testata' },
            el('h3', { class: 'consegne-titolo' }, v.titolo),
            el('p', { class: 'consegne-meta' }, [corsiPerId.has(v.corsoId) ? etichettaCorso(corsiPerId.get(v.corsoId)) : '', chiusa ? `conclusa il ${formatoDataOra.format(chiusa)}` : ''].filter(Boolean).join(' · '))),
          el('div', { class: 'consegne-righe' }, ...[...consegne].reverse().map((c, i) => riga(v, c, i === 0)))));
      }
    } catch (err) {
      if (finestra !== f) return;
      lista.textContent = '';
      lista.append(el('p', { class: 'sketch-nota' }, messaggio(err)));
    }
  }

  return {
    entra(apiStudente, corsiStudente) { api = apiStudente; corsi = corsiStudente; },
    esci() { api = null; corsi = null; finestra?.chiudi(); finestra = null; },
    apri,
  };
}
