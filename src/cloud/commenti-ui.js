// Interfaccia dei commenti del docente: un pannello a sé («Commenti») nella colonna
// del codice, sopra la striscia di esecuzione. Compare solo quando c'è qualcosa da
// mostrare: uno sketch cloud aperto dallo studente, o uno sketch condiviso aperto dal
// docente (revisione). Non conosce Blockly né Firebase: riceve `programma` (con le
// funzioni sui blocchi, vedi main.js) e l'oggetto `commenti` di commenti.js.
//
//   programma.bloccoSelezionato() -> { id, testo } | null     programma.onSelezione(cb) -> off
//   programma.esisteBlocco(id)    programma.descriviBlocco(id)
//   programma.selezionaBlocco(id) programma.marcaBlocchi(ids)
//
// Il commento non entra mai nel programma né nei tre output: i blocchi commentati
// hanno solo un contorno (classe CSS).
import { el } from './dom.js';
import { MAX_TESTO, nuoviPerSketch, dellaStessaCreazione } from './commenti.js';

const formatoData = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

export function montaCommenti({ toast, programma, dopoCambioConteggio }) {
  let commenti = null;        // oggetto di commenti.js, valido solo da loggati
  let ruolo = 'studente';
  let miei = [];              // studente: tutti i suoi commenti (una lettura al login)
  let contesto = null;        // { sketch, docente }: ciò che il pannello sta mostrando
  let mostrati = [];          // commenti dello sketch mostrato
  let pannello = null;
  let corpoEl = null;
  let titoloEl = null;
  let apertoCorpo = true;
  let off = null;             // annulla l'ascolto della selezione
  let generazione = 0;        // per scartare risposte arrivate dopo un cambio

  const messaggio = (err) => (err && err.message) || 'Qualcosa è andato storto. Riprova.';

  // --- Conteggi per l'esterno (menu, elenco sketch) -------------------------
  const nuoviTotali = () => miei.filter((c) => !c.letto).length;
  const info = (sketchId, creatoTs) => {
    const suoi = miei.filter((c) => c.sketchId === sketchId && (!creatoTs || dellaStessaCreazione(c, creatoTs)));
    return { totali: suoi.length, nuovi: suoi.filter((c) => !c.letto).length };
  };
  const annunciaConteggio = () => dopoCambioConteggio?.(nuoviTotali());

  async function caricaMiei() {
    if (!commenti || ruolo === 'docente') return;
    try {
      miei = await commenti.mieiCommenti();
    } catch { miei = []; } // senza commenti l'app funziona uguale: niente rumore
    annunciaConteggio();
  }

  // --- Pannello ---------------------------------------------------------------
  function creaPannello() {
    // Niente «chiudi»: il pannello si riduce alla sola testata (e si riapre con un clic),
    // così non si può perdere. Sparisce da solo quando lo sketch viene sostituito.
    titoloEl = el('strong', { class: 'commenti-titolo' });
    const freccia = el('span', { class: 'commenti-freccia', 'aria-hidden': 'true' }, '▾');
    const testa = el('button', { type: 'button', class: 'commenti-testa', 'aria-expanded': 'true',
      title: 'Mostra o nascondi i commenti',
      onclick: () => {
        apertoCorpo = !apertoCorpo;
        corpoEl.hidden = !apertoCorpo;
        freccia.textContent = apertoCorpo ? '▾' : '▸';
        testa.setAttribute('aria-expanded', String(apertoCorpo));
      } }, freccia, titoloEl);
    corpoEl = el('div', { class: 'commenti-corpo' });
    pannello = el('section', { class: 'commenti-pannello', 'aria-label': 'Commenti' }, testa, corpoEl);
    const colonna = document.querySelector('.outputs');
    colonna.insertBefore(pannello, document.getElementById('runSplitter'));
  }

  function nascondi() {
    generazione++;
    off?.(); off = null;
    contesto = null; mostrati = [];
    programma.marcaBlocchi([]);
    pannello?.remove(); pannello = null; corpoEl = null; titoloEl = null;
  }

  // Apre il pannello per uno sketch. `sketch` = { id, nome, creatoTs, modificato, autoreNome?,
  // proprietarioUid?, corsoId? }; `docente` true = revisione (si può commentare).
  async function mostra(sketch, { docente = false } = {}) {
    if (!commenti) return;
    nascondi();
    const mia = ++generazione;
    contesto = { sketch, docente };
    creaPannello();
    apertoCorpo = true;
    titoloEl.textContent = 'Commenti: carico…';
    try {
      if (docente) {
        mostrati = await commenti.perSketch({ sketchId: sketch.id, sketchCreato: sketch.creatoTs, corsoId: sketch.corsoId });
      } else {
        await caricaMiei();
        mostrati = miei.filter((c) => c.sketchId === sketch.id && dellaStessaCreazione(c, sketch.creatoTs));
      }
    } catch (err) {
      if (mia !== generazione) return;
      toast(messaggio(err), 'error');
      nascondi();
      return;
    }
    if (mia !== generazione) return;
    if (!docente && mostrati.length === 0) { nascondi(); return; } // niente da leggere: niente pannello
    if (docente) off = programma.onSelezione(() => { if (contesto === null) return; aggiornaModulo(); });
    disegna();
    if (!docente) segnaLetti();
  }

  // Lo studente apre il pannello: i commenti che vede diventano «letti».
  async function segnaLetti() {
    const nuovi = mostrati.filter((c) => !c.letto);
    if (nuovi.length === 0) return;
    try {
      await commenti.segnaLetti(nuovi.map((c) => c.id));
      for (const c of nuovi) c.letto = true; // stesso oggetto della cache `miei`
      annunciaConteggio();
    } catch { /* resteranno «nuovi» fino alla prossima apertura */ }
  }

  // --- Disegno ----------------------------------------------------------------
  function disegna() {
    if (!corpoEl) return;
    const { sketch, docente } = contesto;
    const n = mostrati.length;
    titoloEl.textContent = docente
      ? `Commenti su «${sketch.nome}» di ${sketch.autoreNome || 'uno studente'} (${n})`
      : `Commenti del docente su «${sketch.nome}» (${n})`;
    programma.marcaBlocchi(mostrati.map((c) => c.bloccoId).filter(Boolean));
    corpoEl.textContent = '';
    corpoEl.hidden = !apertoCorpo;
    const lista = el('div', { class: 'commenti-lista' });
    if (n === 0) lista.append(el('p', { class: 'sketch-nota' }, 'Nessun commento per ora. Seleziona un blocco per commentarlo, oppure scrivi un commento sull\'intero sketch.'));
    for (const c of mostrati) lista.append(scheda(c));
    corpoEl.append(lista);
    if (docente) corpoEl.append(modulo());
  }

  function scheda(c) {
    const esiste = c.bloccoId && programma.esisteBlocco(c.bloccoId);
    const dopo = sketchModificatoDopo(c);
    const blocco = c.bloccoId
      ? (esiste
          ? el('button', { type: 'button', class: 'commento-blocco', title: 'Vai al blocco',
              onclick: () => programma.selezionaBlocco(c.bloccoId) }, `Blocco: ${c.bloccoTesto || '(senza descrizione)'}`)
          : el('span', { class: 'commento-blocco commento-orfano' }, `Su un blocco che non c'è più: ${c.bloccoTesto || '(senza descrizione)'}`))
      : el('span', { class: 'commento-blocco commento-generale' }, 'Sull\'intero sketch');
    const mio = contesto.docente && c.autoreEmail === mioEmail;
    const azioni = contesto.docente
      ? el('div', { class: 'sketch-azioni' },
          mio ? el('button', { type: 'button', class: 'modal-btn secondary', onclick: () => modifica(c) }, 'Modifica') : '',
          el('button', { type: 'button', class: 'modal-btn secondary', onclick: () => elimina(c) }, 'Elimina'))
      : '';
    return el('article', { class: `commento${c.letto || contesto.docente ? '' : ' commento-nuovo'}` },
      el('div', { class: 'commento-testa' },
        el('strong', {}, c.autoreNome || 'Docente'),
        el('span', { class: 'sketch-data' }, c.creato ? ` · ${formatoData.format(c.creato)}` : ''),
        !contesto.docente && !c.letto ? el('span', { class: 'cloud-badge commento-badge' }, 'nuovo') : ''),
      blocco,
      el('p', { class: 'commento-testo' }, c.testo),
      dopo ? el('span', { class: 'sketch-data' }, 'Scritto prima dell\'ultima modifica dello sketch.') : '',
      azioni);
  }

  const sketchModificatoDopo = (c) =>
    !!(contesto.sketch.modificato && c.creato && contesto.sketch.modificato.getTime() - c.creato.getTime() > 2000);

  // Modulo per scrivere (solo docente): segue il blocco selezionato.
  // Il blocco a cui si riferisce il commento si ricorda anche se poi si clicca nel campo
  // di testo (Blockly allora deseleziona il blocco): si toglie con «Sull'intero sketch».
  let bersaglio = null;
  let rigaBlocco = null; let areaTesto = null; let btnInvia = null; let conteggio = null;
  function modulo() {
    bersaglio = null;
    rigaBlocco = el('p', { class: 'sketch-nota commento-selezione' });
    areaTesto = el('textarea', { class: 'sketch-nome gestione-area', rows: '3', maxlength: String(MAX_TESTO),
      placeholder: 'Scrivi un commento…', 'aria-label': 'Testo del commento' });
    conteggio = el('span', { class: 'sketch-data' });
    areaTesto.addEventListener('input', () => { conteggio.textContent = `${areaTesto.value.length}/${MAX_TESTO}`; });
    btnInvia = el('button', { type: 'button', class: 'modal-btn', onclick: invia }, 'Aggiungi commento');
    const form = el('div', { class: 'commenti-modulo' }, rigaBlocco, areaTesto,
      el('div', { class: 'sketch-azioni' }, btnInvia, conteggio));
    aggiornaModulo();
    return form;
  }

  function aggiornaModulo() {
    if (!rigaBlocco) return;
    const sel = programma.bloccoSelezionato();
    if (sel) bersaglio = sel;
    rigaBlocco.textContent = '';
    if (bersaglio) {
      rigaBlocco.append(`Il commento sarà sul blocco: ${bersaglio.testo || '(senza descrizione)'} `,
        el('button', { type: 'button', class: 'commento-togli', onclick: () => { bersaglio = null; aggiornaModulo(); } }, 'Sull\'intero sketch'));
    } else {
      rigaBlocco.append('Il commento sarà sull\'intero sketch. Per commentare un blocco, cliccalo.');
    }
  }

  async function invia() {
    const sel = bersaglio;
    btnInvia.disabled = true;
    const mia = generazione;
    try {
      await commenti.commenta({ sketch: contesto.sketch, bloccoId: sel ? sel.id : null,
        bloccoTesto: sel ? sel.testo : '', testo: areaTesto.value });
      if (mia !== generazione) return;
      await ricaricaDocente();
      toast('Commento aggiunto', 'success');
    } catch (err) {
      toast(messaggio(err), 'error');
      if (btnInvia) btnInvia.disabled = false;
    }
  }

  async function ricaricaDocente() {
    const { sketch } = contesto;
    mostrati = await commenti.perSketch({ sketchId: sketch.id, sketchCreato: sketch.creatoTs, corsoId: sketch.corsoId });
    disegna();
  }

  async function modifica(c) {
    const nuovo = window.prompt('Modifica il commento:', c.testo);
    if (nuovo === null) return;
    try { await commenti.modifica(c.id, nuovo); await ricaricaDocente(); toast('Commento modificato', 'success'); }
    catch (err) { toast(messaggio(err), 'error'); }
  }

  async function elimina(c) {
    if (!window.confirm('Eliminare questo commento? Non si può annullare.')) return;
    try { await commenti.elimina(c.id); await ricaricaDocente(); toast('Commento eliminato', 'success'); }
    catch (err) { toast(messaggio(err), 'error'); }
  }

  // --- Per sketch-ui e ui.js ----------------------------------------------------
  let mioEmail = '';

  // Apre «I miei sketch»: rilegge i commenti e toglie quelli di sketch che non ci sono più.
  async function aggiornaDaElenco(sketchSalvati) {
    if (!commenti || ruolo === 'docente') return;
    await caricaMiei();
    try {
      if (await commenti.ripulisciOrfani(miei, sketchSalvati)) await caricaMiei();
    } catch { /* si riproverà */ }
  }

  // Lo studente ha eliminato uno sketch: i suoi commenti non servono più.
  async function dopoEliminazione(sketchId) {
    if (!commenti || ruolo === 'docente') return;
    if (contesto && contesto.sketch.id === sketchId) nascondi();
    const orfani = miei.filter((c) => c.sketchId === sketchId);
    await Promise.all(orfani.map((c) => commenti.elimina(c.id).catch(() => {})));
    miei = miei.filter((c) => c.sketchId !== sketchId);
    annunciaConteggio();
  }

  return {
    mostra, nascondi, info, aggiornaDaElenco, dopoEliminazione,
    nuovi: nuoviTotali,
    entra(commentiDiUtente, ruoloUtente, email) {
      commenti = commentiDiUtente; ruolo = ruoloUtente; mioEmail = String(email || '').toLowerCase();
      miei = [];
      if (ruoloUtente !== 'docente') caricaMiei();
    },
    esci() { nascondi(); commenti = null; miei = []; ruolo = 'studente'; annunciaConteggio(); },
    // per i test e per ui.js
    nuoviPerSketch: () => nuoviPerSketch(miei),
  };
}
