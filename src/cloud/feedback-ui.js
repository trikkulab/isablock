// Pannello dei feedback del docente sulla consegna di uno studente, nell'editor, accanto alla copia di prova
// («Apri una copia per provarla»). Stessa grafica e stessi gesti del pannello dei commenti sugli sketch
// (commenti-ui.js): si seleziona un blocco, si scrive, si invia. In più: ogni commento nasce come BOZZA e lo studente
// non lo vede finché il docente non preme «Pubblica feedback»; si commenta solo l'ULTIMA versione della consegna.
//
// Se nella copia si cambia la struttura del programma (si aggiunge, toglie o ricollega un blocco: non basta spostarlo
// sul foglio) il modulo per scrivere si blocca, perché gli id dei blocchi non sarebbero più quelli della consegna;
// con Ctrl-Z che riporta la copia com'era si sblocca da solo. I commenti già scritti non si perdono mai: stanno sul cloud.
//
// Lo studente che apre la sua consegna nell'editor (consegne-ui.js) vede lo stesso pannello in SOLA LETTURA (`solaLettura`): solo i
// commenti pubblicati su quella versione, senza modulo, bozze né pulsanti; cliccando il blocco di un commento lo si seleziona.
//
// Non conosce Blockly né Firebase: riceve `programma` (vedi main.js: bloccoSelezionato, onSelezione, onModifica,
// esisteBlocco, selezionaBlocco, marcaBlocchi, onSostituzione, copiaDiProva.strutturaCambiata) e `feedback` (feedback.js).
import { el } from './dom.js';
import { MAX_TESTO } from './feedback.js';
import { feedbackEtichette as K } from './etichette.js';

const formatoData = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function montaFeedbackEditor({ toast, programma }) {
  let feedback = null;          // oggetto di feedback.js
  let contesto = null;          // { consegna: { verificaId, studenteEmail, versione, corsoId }, nome, emailDocente, dopoCambio }
  let mostrati = [];
  let pannello = null; let corpoEl = null; let titoloEl = null;
  let apertoCorpo = true;
  let offSel = null; let offMod = null;
  let generazione = 0;          // scarta le risposte arrivate dopo un cambio di studente
  let bersaglio = null;         // { id, testo } del blocco a cui si riferirà il commento (si ricorda anche se si clicca nel campo)
  let areaTesto = null; let rigaBlocco = null; let btnInvia = null; let conteggio = null; let avvisoBlocco = null;
  let timerCambio = null;
  let bloccato = false;

  const messaggio = (err) => (err && err.message) || 'Qualcosa è andato storto. Riprova.';
  const strutturaCambiata = () => !!programma.copiaDiProva?.strutturaCambiata?.();
  const bozzeDa = () => mostrati.filter((f) => !f.pubblicato).length;

  function creaPannello() {
    titoloEl = el('strong', { class: 'commenti-titolo' });
    const freccia = el('span', { class: 'commenti-freccia', 'aria-hidden': 'true' }, '▾');
    const testa = el('button', { type: 'button', class: 'commenti-testa', 'aria-expanded': 'true', title: 'Mostra o nascondi i feedback',
      onclick: () => {
        apertoCorpo = !apertoCorpo;
        corpoEl.hidden = !apertoCorpo;
        freccia.textContent = apertoCorpo ? '▾' : '▸';
        testa.setAttribute('aria-expanded', String(apertoCorpo));
      } }, freccia, titoloEl);
    corpoEl = el('div', { class: 'commenti-corpo' });
    pannello = el('section', { class: 'commenti-pannello feedback-pannello', 'aria-label': K.pannello }, testa, corpoEl);
    document.querySelector('.outputs').insertBefore(pannello, document.getElementById('runSplitter'));
  }

  function nascondi() {
    generazione++;
    clearTimeout(timerCambio);
    offSel?.(); offSel = null; offMod?.(); offMod = null;
    contesto = null; mostrati = []; bersaglio = null; areaTesto = null; rigaBlocco = null; btnInvia = null; avvisoBlocco = null;
    bloccato = false;
    programma.marcaBlocchi([]);
    pannello?.remove(); pannello = null; corpoEl = null; titoloEl = null;
  }

  // `consegna` = { verificaId, studenteEmail, versione, corsoId }: l'ULTIMA versione dello studente. `nome`: «Anna Rossi».
  // `dopoCambio()`: chiamata dopo ogni scrittura (commento, modifica, eliminazione, pubblicazione): la tabella aggiorna i conteggi.
  async function mostra({ api, consegna, nome, emailDocente, dopoCambio = null, solaLettura = false }) {
    nascondi();
    feedback = api;
    const mia = ++generazione;
    contesto = { consegna, nome, emailDocente: String(emailDocente || '').toLowerCase(), dopoCambio, solaLettura };
    creaPannello();
    titoloEl.textContent = `${K.pannello}: carico…`;
    try {
      // Lo studente legge i propri pubblicati di tutta la verifica e tiene quelli di questa versione; il docente legge quelli della consegna.
      mostrati = solaLettura
        ? (await feedback.mieiPubblicati(consegna.verificaId)).filter((f) => f.versione === consegna.versione)
        : await feedback.perConsegna(consegna);
    } catch (err) {
      if (mia !== generazione) return;
      if (!solaLettura) toast(messaggio(err), 'error');          // lo studente senza commenti da leggere non vede errori: l'editor funziona uguale
      nascondi();
      return;
    }
    if (mia !== generazione) return;
    if (solaLettura) {
      if (mostrati.length === 0) { nascondi(); return; }          // niente da leggere: niente pannello (come per i commenti degli sketch)
      disegna();
      return;
    }
    offSel = programma.onSelezione(() => { if (contesto) aggiornaModulo(); });
    // Ogni modifica del programma: si ricontrolla se la struttura è ancora quella della consegna (con un po' di respiro).
    offMod = programma.onModifica(() => {
      clearTimeout(timerCambio);
      timerCambio = setTimeout(controllaStruttura, 150);
    });
    bloccato = strutturaCambiata();
    disegna();
  }

  function controllaStruttura() {
    if (!contesto) return;
    const ora = strutturaCambiata();
    if (ora !== bloccato) { bloccato = ora; disegna(); }
  }

  // Il testo non ancora inviato: chi cambia studente (◀ ▶) deve poter essere avvisato.
  const bozzaNonInviata = () => !!(areaTesto && areaTesto.value.trim());

  function disegna() {
    if (!corpoEl) return;
    const { consegna, nome } = contesto;
    const bozza = areaTesto ? areaTesto.value : '';
    const n = mostrati.length;
    titoloEl.textContent = contesto.solaLettura ? `${K.pannelloStudente} · v${consegna.versione} (${n})` : `${K.pannello} a ${nome} · v${consegna.versione} (${n})`;
    programma.marcaBlocchi(mostrati.map((f) => f.bloccoId).filter(Boolean));
    corpoEl.textContent = '';
    corpoEl.hidden = !apertoCorpo;
    const lista = el('div', { class: 'commenti-lista' });
    if (n === 0) lista.append(el('p', { class: 'sketch-nota' }, K.nessuno));
    for (const f of mostrati) lista.append(scheda(f));
    if (contesto.solaLettura) corpoEl.append(lista); else corpoEl.append(modulo(bozza), barraPubblica(), lista);
  }

  function barraPubblica() {
    const bozze = bozzeDa();
    const btn = el('button', { type: 'button', class: 'modal-btn', onclick: () => pubblica(btn) }, K.pubblica);
    btn.disabled = bozze === 0;
    return el('div', { class: 'feedback-pubblica' }, btn,
      el('span', { class: 'sketch-nota' }, bozze === 0
        ? (mostrati.length ? K.tuttoPubblicato : '')
        : `${bozze} ${bozze === 1 ? 'commento è una bozza' : 'commenti sono bozze'}: lo studente li vedrà solo dopo la pubblicazione.`));
  }

  function scheda(f) {
    const esiste = f.bloccoId && programma.esisteBlocco(f.bloccoId);
    const blocco = !f.bloccoId ? ''
      : esiste
        ? el('button', { type: 'button', class: 'commento-blocco', title: 'Vai al blocco', onclick: () => programma.selezionaBlocco(f.bloccoId) }, f.bloccoTesto || 'blocco')
        : el('span', { class: 'commento-orfano', title: 'Questo blocco non c\'è più nella copia che stai guardando' }, `blocco non presente: ${f.bloccoTesto || ''}`);
    const stato = contesto.solaLettura
      ? (f.modificatoDopo ? el('span', { class: 'cloud-badge feedback-badge-pubblicato' }, K.modificato) : '')
      : f.pubblicato
        ? el('span', { class: 'cloud-badge feedback-badge-pubblicato' }, f.modificatoDopo ? K.pubblicatoModificato : K.pubblicato)
        : el('span', { class: 'cloud-badge feedback-badge-bozza' }, K.bozza);
    const mio = f.autoreEmail === contesto.emailDocente;
    const meta = [blocco, f.autoreNome || 'Docente', f.creato ? formatoData.format(f.creato) : '', stato]
      .filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x]));
    const azioni = contesto.solaLettura ? '' : el('span', { class: 'commento-azioni' },
      mio ? el('button', { type: 'button', class: 'commento-azione', onclick: () => modifica(f) }, 'Modifica') : '',
      el('button', { type: 'button', class: 'commento-azione', onclick: () => elimina(f) }, 'Elimina'));
    return el('article', { class: 'commento' },
      el('p', { class: 'commento-testo' }, f.testo),
      el('div', { class: 'commento-meta' }, el('span', {}, ...meta), azioni));
  }

  function modulo(bozza = '') {
    rigaBlocco = el('p', { class: 'commento-selezione' });
    areaTesto = el('textarea', { class: 'sketch-nome gestione-area commenti-area', rows: '3', maxlength: String(MAX_TESTO),
      placeholder: 'Scrivi un commento…', 'aria-label': 'Testo del commento' });
    areaTesto.value = bozza;
    conteggio = el('span', { class: 'sketch-data' }, bozza ? `${bozza.length}/${MAX_TESTO}` : '');
    areaTesto.addEventListener('input', () => { conteggio.textContent = `${areaTesto.value.length}/${MAX_TESTO}`; });
    btnInvia = el('button', { type: 'button', class: 'modal-btn', onclick: invia }, K.aggiungi);
    avvisoBlocco = el('p', { class: 'feedback-avviso', role: 'status' }, K.copiaModificata);
    const form = el('div', { class: 'commenti-modulo' }, avvisoBlocco, areaTesto,
      el('div', { class: 'commenti-modulo-riga' }, rigaBlocco, conteggio, btnInvia));
    aggiornaModulo();
    return form;
  }

  function aggiornaModulo() {
    if (!rigaBlocco) return;
    areaTesto.disabled = bloccato;
    btnInvia.disabled = bloccato;
    avvisoBlocco.hidden = !bloccato;
    const sel = programma.bloccoSelezionato();
    if (sel && !bloccato) bersaglio = sel;
    rigaBlocco.textContent = '';
    if (bersaglio) {
      rigaBlocco.append(`Sul blocco: ${bersaglio.testo || '(senza descrizione)'} · `,
        el('button', { type: 'button', class: 'commento-togli', onclick: () => { bersaglio = null; aggiornaModulo(); } }, K.interaConsegna));
    } else {
      rigaBlocco.append('Sull\'intera consegna · clicca un blocco per commentare quello');
    }
  }

  async function invia() {
    if (bloccato || strutturaCambiata()) { bloccato = true; aggiornaModulo(); return; }
    const sel = bersaglio;
    btnInvia.disabled = true;
    const mia = generazione;
    try {
      await feedback.commenta({ consegna: contesto.consegna, bloccoId: sel ? sel.id : null, bloccoTesto: sel ? sel.testo : '', testo: areaTesto.value });
      if (mia !== generazione) return;
      bersaglio = null;
      areaTesto.value = '';
      await ricarica();
      toast('Commento aggiunto (bozza: lo studente lo vede dopo «Pubblica feedback»)', 'success');
    } catch (err) {
      toast(messaggio(err), 'error');
      if (btnInvia) btnInvia.disabled = bloccato;
    }
  }

  async function ricarica() {
    const mia = generazione;
    const lista = await feedback.perConsegna(contesto.consegna);
    if (mia !== generazione) return;
    mostrati = lista;
    disegna();
    contesto.dopoCambio?.();
  }

  async function pubblica(btn) {
    btn.disabled = true;
    const mia = generazione;
    try {
      const n = await feedback.pubblica(contesto.consegna);
      if (mia !== generazione) return;
      await ricarica();
      toast(n ? `Feedback pubblicato (${n}): ora lo studente lo vede, a verifica chiusa, in «Le mie consegne».` : 'Non c\'era niente da pubblicare.', 'success');
    } catch (err) {
      toast(messaggio(err), 'error');
      btn.disabled = false;
    }
  }

  async function modifica(f) {
    const nuovo = window.prompt(f.pubblicato ? 'Modifica il commento (lo studente lo vede già: comparirà «modificato»):' : 'Modifica il commento:', f.testo);
    if (nuovo === null) return;
    try { await feedback.modifica(f.id, nuovo); await ricarica(); toast('Commento modificato', 'success'); }
    catch (err) { toast(messaggio(err), 'error'); }
  }

  async function elimina(f) {
    if (!window.confirm(f.pubblicato ? 'Eliminare questo commento? Lo studente lo vede già. Non si può annullare.' : 'Eliminare questo commento? Non si può annullare.')) return;
    try { await feedback.elimina(f.id); await ricarica(); toast('Commento eliminato', 'success'); }
    catch (err) { toast(messaggio(err), 'error'); }
  }

  // Un caricamento che sostituisce il programma (Nuovo, file, un'altra copia) chiude il pannello: i blocchi non sono più quelli.
  programma.onSostituzione?.(() => nascondi());

  return { mostra, nascondi, bozzaNonInviata, attivo: () => !!contesto };
}
