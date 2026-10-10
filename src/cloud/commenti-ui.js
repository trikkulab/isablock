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
    bersaglio = null; areaTesto = null; rigaBlocco = null;
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
  // Il testo del commento è la cosa più grande della scheda; blocco, autore e data
  // stanno in una riga piccola sotto (l'autore serve: i docenti del corso possono
  // essere più d'uno).
  function disegna() {
    if (!corpoEl) return;
    const { sketch, docente } = contesto;
    const bozza = areaTesto ? areaTesto.value : '';
    const n = mostrati.length;
    titoloEl.textContent = `Commenti su «${sketch.nome}»${docente && sketch.autoreNome ? ` di ${sketch.autoreNome}` : ''} (${n})`;
    programma.marcaBlocchi(mostrati.map((c) => c.bloccoId).filter(Boolean));
    corpoEl.textContent = '';
    corpoEl.hidden = !apertoCorpo;
    const lista = el('div', { class: 'commenti-lista' });
    if (n === 0) lista.append(el('p', { class: 'sketch-nota' }, 'Nessun commento per ora.'));
    for (const c of mostrati) lista.append(scheda(c));
    // il modulo sta sopra l'elenco: chi scrive non deve scorrere fino in fondo
    if (docente) corpoEl.append(modulo(bozza));
    corpoEl.append(lista);
  }

  function scheda(c) {
    const esiste = c.bloccoId && programma.esisteBlocco(c.bloccoId);
    const blocco = !c.bloccoId ? ''
      : esiste
        ? el('button', { type: 'button', class: 'commento-blocco', title: 'Vai al blocco',
            onclick: () => programma.selezionaBlocco(c.bloccoId) }, c.bloccoTesto || 'blocco')
        : el('span', { class: 'commento-orfano', title: 'Lo studente ha tolto o sostituito il blocco' },
            `blocco non più presente: ${c.bloccoTesto || ''}`);
    const mio = contesto.docente && c.autoreEmail === mioEmail;
    const nuovo = !contesto.docente && !c.letto;
    const meta = [blocco, c.autoreNome || 'Docente', c.creato ? formatoData.format(c.creato) : '',
      nuovo ? el('span', { class: 'cloud-badge commento-badge' }, 'nuovo') : '']
      .filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x]));
    if (sketchModificatoDopo(c)) meta.push(' · scritto prima dell\'ultima modifica dello sketch');
    const azioni = contesto.docente
      ? el('span', { class: 'commento-azioni' },
          mio ? el('button', { type: 'button', class: 'commento-azione', onclick: () => modifica(c) }, 'Modifica') : '',
          el('button', { type: 'button', class: 'commento-azione', onclick: () => elimina(c) }, 'Elimina'))
      : '';
    return el('article', { class: `commento${nuovo ? ' commento-nuovo' : ''}` },
      el('p', { class: 'commento-testo' }, c.testo),
      el('div', { class: 'commento-meta' }, el('span', {}, ...meta), azioni));
  }

  const sketchModificatoDopo = (c) =>
    !!(contesto.sketch.modificato && c.creato && contesto.sketch.modificato.getTime() - c.creato.getTime() > 2000);

  // Modulo per scrivere (solo docente): segue il blocco selezionato. Il blocco a cui
  // si riferisce il commento si ricorda anche se poi si clicca nel campo di testo
  // (Blockly allora deseleziona il blocco): si toglie con «Sull'intero sketch».
  let bersaglio = null;
  let rigaBlocco = null; let areaTesto = null; let btnInvia = null; let conteggio = null;
  function modulo(bozza = '') {
    rigaBlocco = el('p', { class: 'commento-selezione' });
    areaTesto = el('textarea', { class: 'sketch-nome gestione-area commenti-area', rows: '3', maxlength: String(MAX_TESTO),
      placeholder: 'Scrivi un commento…', 'aria-label': 'Testo del commento' });
    areaTesto.value = bozza;
    conteggio = el('span', { class: 'sketch-data' }, bozza ? `${bozza.length}/${MAX_TESTO}` : '');
    areaTesto.addEventListener('input', () => { conteggio.textContent = `${areaTesto.value.length}/${MAX_TESTO}`; });
    btnInvia = el('button', { type: 'button', class: 'modal-btn', onclick: invia }, 'Aggiungi commento');
    const form = el('div', { class: 'commenti-modulo' }, areaTesto,
      el('div', { class: 'commenti-modulo-riga' }, rigaBlocco, conteggio, btnInvia));
    aggiornaModulo();
    return form;
  }

  function aggiornaModulo() {
    if (!rigaBlocco) return;
    const sel = programma.bloccoSelezionato();
    if (sel) bersaglio = sel;
    rigaBlocco.textContent = '';
    if (bersaglio) {
      rigaBlocco.append(`Sul blocco: ${bersaglio.testo || '(senza descrizione)'} · `,
        el('button', { type: 'button', class: 'commento-togli', onclick: () => { bersaglio = null; aggiornaModulo(); } }, 'Sull\'intero sketch'));
    } else {
      rigaBlocco.append('Sull\'intero sketch · clicca un blocco per commentare quello');
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
      bersaglio = null;
      areaTesto.value = '';
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
