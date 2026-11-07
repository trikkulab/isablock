// Interfaccia dello STUDENTE per la modalità verifica. Non conosce Firebase né Blockly: riceve da ui.js l'oggetto di
// verifica-studente.js (daFare, ascoltaAperte, nuovaSessione, verifiche) e dal programma le poche funzioni di main.js.
//
// Il percorso:
//   1. all'accesso (e al ricaricamento, e quando una verifica si apre mentre si è dentro): se c'è una verifica aperta da
//      svolgere compare la finestra di SCELTA, che non si può chiudere (niente ✕, né Esc, né clic fuori): finché non si
//      sceglie, l'app sotto non è utilizzabile;
//   2. scelta la verifica, se l'editor ha del lavoro (non vuoto) si AVVISA: l'editor partirà vuoto, ma il lavoro resta in una
//      copia automatica su questo computer e si riprende a verifica finita; senza obbligo di salvare a mano;
//   3. in verifica: fascia in alto con titolo, timer (verde, giallo, rosso) e «Consegna»; l'editor parte vuoto (o riprende il
//      lavoro già salvato, se si ricarica); sono spenti Apri, esempi, salvataggi e cloud; c'è la scheda «Traccia»;
//   4. si finisce con la consegna (a mano, o da sola allo scadere del tempo) o perché il docente chiude la verifica: una
//      finestra lo dice, si torna al lavoro di prima, e se ce n'è un'altra da fare ricompare la scelta.
// I testi stanno in testi-verifica.js (testiStudente).
import { el, apriFinestra } from './dom.js';
import { rendiMarkdown } from './markdown.js';
import { verificaConfig } from './verifica-config.js';
import { testiStudente as T } from './testi-verifica.js';
import { formatoDataOra } from './data-ora.js';
import { puntoDomanda } from './aiuto-ui.js';
import { segnaVerificaInCorso, aggiornaVerificaInCorso, leggiVerificaInCorso, cancellaVerificaInCorso } from '../verifica-locale.js';
import { creaFileEmergenza, oraBreve } from '../verifica-file.js';

const C = verificaConfig.client;
const ZOOM_KEY = 'isablock.traccia.zoom';

const due = (n) => String(n).padStart(2, '0');
// 47:12 oppure 1:02:30
export function formatoTimer(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${due(m)}:${due(s % 60)}` : `${due(m)}:${due(s % 60)}`;
}

// verde, giallo (poco tempo: meno di una frazione del totale), rosso (meno di timerRossoMs)
export function coloreTimer(restanteMs, totaleMs) {
  if (restanteMs <= C.timerRossoMs) return 'rosso';
  if (totaleMs > 0 && restanteMs <= totaleMs * C.timerGialloFrazione) return 'giallo';
  return 'verde';
}

export function montaVerificaStudente({ toast, programma, quandoCambiaModo = () => {} }) {
  let api = null;                 // oggetto di verifica-studente.js (creaVerificheStudente + nuovaSessione)
  let corsiIds = [];
  let corsiCaricati = false;      // i corsi sono stati letti con successo almeno una volta
  let corsiApi = null;            // l'oggetto dei corsi dello studente, per rileggerli se all'ingresso il server non rispondeva
  let nomiCorsi = new Map();
  let smettiDiAscoltare = null;
  let sessione = null;            // la sessione in corso, se c'è
  let item = null;                // la verifica che si sta svolgendo { verifica, lavoro }
  let scelta = null;              // la finestra di scelta, se aperta
  let finestraConsegna = null;    // la finestra di conferma della consegna, se aperta
  let controllando = false;
  let daRifare = false;             // un avviso è arrivato mentre si controllava: si ricontrolla subito dopo
  let aperteViste = [];             // gli id delle verifiche aperte segnalate dall'ascolto (anche quelle senza assegnazione)
  let timerRicontrollo = null;
  let fallimenti = 0;               // controlli di fila andati male
  let mostrandoFine = false;      // la finestra «consegnato / terminata» è aperta: non si propone altro finché non si chiude
  let banda = null;
  let bandaOffline = null;        // l'avviso «sei offline» sotto la fascia
  let offlineStato = null;        // l'ultimo stato di rete comunicato dalla sessione { offline, offlineDa }
  let copieProposte = new Set();  // le copie non consegnate già proposte in questa pagina (non si ripropongono a ogni controllo)
  let finestraCopie = null;
  let hintScadenza = null;        // ultimi valori scritti nell'indizio «verifica in corso»
  let hintScarto = null;
  let fileSalvato = false;        // lo studente ha salvato almeno una volta il file di emergenza
  let timer = null;
  let totaleMs = 0;
  let annullaModifica = null;
  let annullaEsecuzione = null;
  const stat = { n: 0, esito: 'mai', quando: null };

  const messaggio = (err) => (err && err.message) || 'Qualcosa è andato storto. Riprova.';

  // Legge i corsi dello studente e si mette in ascolto delle verifiche che si aprono. Lancia se il server non risponde.
  async function caricaCorsi() {
    const elenco = await corsiApi.elenca();
    if (!api) return;
    corsiIds = elenco.map((c) => c.id);
    nomiCorsi = new Map(elenco.map((c) => [c.id, c.nome]));
    corsiCaricati = true;
    smettiDiAscoltare?.();
    smettiDiAscoltare = api.ascoltaAperte(corsiIds, (ids) => { aperteViste = ids; ricontrolla(); });
  }

  // ── Scelta della verifica ───────────────────────────────────────────────────
  async function ricontrolla() {
    if (controllando) { daRifare = true; return; }              // non si perde l'avviso: il controllo in corso potrebbe essere partito prima
    if (!api || sessione || mostrandoFine) return;
    controllando = true;
    try {
      if (!corsiCaricati && corsiApi) await caricaCorsi();                 // all'ingresso il server non rispondeva: si riprova
      const lista = await api.daFare(corsiIds);
      fallimenti = 0;
      if (!api || sessione || mostrandoFine) return;
      proponiCopie(api.pulisciCopie?.(lista.map((x) => x.verifica.id)) ?? []);   // le copie di verifiche finite si eliminano; quelle con modifiche mai arrivate si propongono
      // Una verifica aperta che non ti viene proposta (nessuna assegnazione, per ora) potrebbe riguardarti tra poco: il
      // docente può aggiungere uno studente dopo l'apertura. Si ricontrolla ogni minuto, finché ce n'è una.
      clearTimeout(timerRicontrollo);
      timerRicontrollo = null;
      if (aperteViste.some((id) => !lista.some((x) => x.verifica.id === id))) timerRicontrollo = setTimeout(ricontrolla, C.ricontrolloVerificheMs ?? 60000);
      if (lista.length === 0) {
        scelta?.chiudi();
        scelta = null;
        programma.modoVerifica.nessuna();
        return;
      }
      mostraScelta(lista);
    } catch {
      // Non si è riusciti a controllare (rete, accesso non ancora pronto): NON vuol dire che non ci sia niente da fare.
      // Si riprova tra poco, senza dichiarare «nessuna verifica» (che farebbe partire il ripristino delle copie).
      // Dopo circa 30 secondi di insuccessi (per esempio un corso da cui si è stati tolti) si rinuncia a bloccare l'avvio,
      // ma si continua a riprovare piano.
      fallimenti += 1;
      if (fallimenti === 6) programma.modoVerifica.nessuna();
      clearTimeout(timerRicontrollo);
      timerRicontrollo = setTimeout(ricontrolla, fallimenti >= 6 ? 60000 : 5000);
    } finally {
      controllando = false;
      if (daRifare) { daRifare = false; ricontrolla(); }
    }
  }

  function mostraScelta(lista) {
    if (!scelta) scelta = apriFinestra(T.sceltaTitolo, () => { scelta = null; }, { bloccante: true });
    const corpo = scelta.corpo;
    corpo.textContent = '';
    corpo.append(el('p', {}, lista.length === 1 ? T.sceltaIntroUna : T.sceltaIntroPiu));
    for (const x of lista) {
      const corso = nomiCorsi.get(x.verifica.corsoId) ?? '';
      const bottone = el('button', { type: 'button', class: 'modal-btn' }, x.lavoro.entrato ? T.riprendi : T.inizia);
      bottone.addEventListener('click', async () => {
        bottone.disabled = true;
        try { await inizia(x); } finally { bottone.disabled = false; }
      });
      corpo.append(el('div', { class: 'sketch-riga' },
        el('div', { class: 'sketch-info' },
          el('strong', {}, x.verifica.titolo),
          el('span', { class: 'sketch-data' }, [corso, x.lavoro.scadenza ? `finisce ${formatoDataOra.format(x.lavoro.scadenza)}` : ''].filter(Boolean).join(' · '))),
        bottone));
    }
  }

  // Avviso (non obbligo) se l'editor ha del lavoro: parte vuoto, ma il lavoro resta in una copia automatica.
  function confermaLavoro() {
    return new Promise((risolvi) => {
      let deciso = false;
      const f = apriFinestra(T.lavoroTitolo, () => { if (!deciso) risolvi(false); });
      const fine = (ok) => { deciso = true; risolvi(ok); f.chiudi(); };
      f.corpo.append(
        ...T.lavoroRighe.map((t) => el('p', {}, t)),
        el('div', { class: 'modal-actions' },
          el('button', { type: 'button', class: 'modal-btn', onclick: () => fine(true) }, T.lavoroConferma),
          el('button', { type: 'button', class: 'modal-btn secondary', onclick: () => fine(false) }, T.lavoroAnnulla)));
    });
  }

  // ── Svolgere la verifica ───────────────────────────────────────────────────
  // `rientro` ({ scartoMs }): la pagina si è ricaricata a verifica in corso senza rete: si riparte dai dati locali.
  async function inizia(x, { rientro = null } = {}) {
    if (sessione) return;
    if (!rientro && !programma.isVuoto() && !(await confermaLavoro())) return;
    if (sessione) return;
    scelta?.chiudi();
    scelta = null;
    programma.modoVerifica.entra();                 // l'editor si svuota; la copia automatica va in pausa e conserva il lavoro di prima
    segnaVerificaInCorso({ vid: x.verifica.id, scadenzaMs: x.lavoro.scadenza?.getTime(), titolo: x.verifica.titolo, email: api.email, scartoMs: rientro ? rientro.scartoMs : 0 });
    hintScadenza = x.lavoro.scadenza?.getTime() ?? null;
    hintScarto = rientro ? rientro.scartoMs : 0;
    quandoCambiaModo(true);
    item = x;
    stat.n = 0; stat.esito = 'mai'; stat.quando = null;
    sessione = api.nuovaSessione(x.verifica.id, {
      onCambio: quandoCambia, onTraccia: mostraTraccia, titolo: x.verifica.titolo,
      ...(rientro ? { rientroOffline: { scadenza: x.lavoro.scadenza, scartoMs: rientro.scartoMs } } : {}),
    });
    try {
      await sessione.avvia();
    } catch (err) {
      toast(messaggio(err), 'error');
      spegni();
      ricontrolla();
      return;
    }
    if (sessione && sessione.stato() === 'consegnato') {          // già consegnata (da un'altra scheda)
      toast('Questa verifica risulta già consegnata.', 'success');
      spegni();
      ricontrolla();
      return;
    }
    if (!sessione) return;
    const salvato = sessione.programmaSalvato();                 // ricaricando la pagina si riprende il lavoro già salvato
    if (salvato) {
      try { programma.carica(salvato); } catch { /* illeggibile: si riparte vuoti, il database conserva l'ultimo salvato */ }
    }
    annullaModifica = programma.onModifica(comunica);
    annullaEsecuzione = programma.onEsecuzione(registraEsecuzione);
    comunica();                                                  // contratto del motore: all'ingresso si comunica sempre un programma
    creaBanda(x.verifica.titolo);
    if (sessione.offline()) aggiornaOffline({ offline: true, offlineDa: sessione.datiEmergenza().offlineDa, restanteMs: sessione.restanteMs() });     // rientro senza rete
    if (!sessione.tracciaCorrente()) mostraTraccia(null);         // né online né dalla copia locale
    if (sessione.ripresa() === 'locale') toast(T.ripresaLocale, 'success');
    window.addEventListener('pagehide', salvaCopia);
  }

  // Chiudendo o nascondendo la pagina la copia locale si aggiorna subito, senza aspettare la pausa.
  const salvaCopia = () => sessione?.salvaBackupOra();

  function comunica() {
    if (!sessione) return;
    sessione.aggiorna({
      programma: programma.correnteCompatto(),
      nBlocchi: programma.nBlocchi(),
      esecuzioni: stat.n > 0 ? { n: stat.n, esito: stat.esito, quando: stat.quando } : undefined,
    });
  }

  function registraEsecuzione(evento) {
    if (!sessione) return;
    if (evento === 'avvio') { stat.n += 1; stat.quando = Math.round(sessione.ora()); }
    else if (evento === 'fine') stat.esito = 'ok';
    else if (evento === 'errore') stat.esito = 'errore';
    comunica();
  }

  // ── Fascia in alto: titolo, timer, consegna ─────────────────────────────────
  function creaBanda(titolo) {
    const timerEl = el('span', { class: 'banda-verifica-timer', 'aria-label': 'Tempo rimasto', role: 'timer' });
    const consegna = el('button', { type: 'button', class: 'modal-btn' }, T.consegnaPulsante);
    consegna.addEventListener('click', dialogoConsegna);
    banda = el('div', { class: 'banda-verifica', role: 'region', 'aria-label': 'Verifica in corso' },
      el('span', { class: 'banda-verifica-etichetta' }, T.fasciaEtichetta),
      el('span', { class: 'banda-verifica-titolo', title: titolo }, titolo),
      timerEl, consegna, puntoDomanda('fascia'));
    document.querySelector('header.toolbar').after(banda);
    totaleMs = item.verifica.apertaIl && sessione.scadenza() ? Math.max(0, sessione.scadenza().getTime() - item.verifica.apertaIl.getTime()) : (sessione.restanteMs() ?? 0);
    const aggiorna = () => {
      if (!sessione) return;
      const resta = sessione.restanteMs() ?? 0;
      totaleMs = Math.max(totaleMs, resta);                      // il tempo aggiuntivo allunga il totale, non fa tornare «gialla» la fascia
      timerEl.textContent = formatoTimer(resta);
      timerEl.dataset.colore = coloreTimer(resta, totaleMs);
      consegna.disabled = sessione.stato() !== 'in-corso';
      const sc = sessione.scadenza()?.getTime() ?? null;
      const scarto = Math.round(sessione.offset());
      if (sc !== hintScadenza || Math.abs(scarto - (hintScarto ?? 0)) > 1000) {        // l'indizio per rientrare senza rete resta aggiornato
        aggiornaVerificaInCorso({ scadenzaMs: sc, scartoMs: scarto });
        hintScadenza = sc; hintScarto = scarto;
      }
      if (bandaOffline) bandaOffline.testo.textContent = resta <= 0 ? T.offlineTempoFinito : T.offlineTesto;     // il tempo può finire mentre si è offline
    };
    aggiorna();
    timer = setInterval(aggiorna, 1000);
  }

  function dialogoConsegna() {
    if (!sessione || sessione.stato() !== 'in-corso') return;
    if (sessione.offline()) { toast(T.offlineConsegna, 'error'); return; }          // offline la consegna resterebbe in sospeso
    const resta = el('p', { class: 'sketch-nota' }, `Tempo rimasto: ${formatoTimer(sessione.restanteMs() ?? 0)}.`);
    const conferma = el('button', { type: 'button', class: 'modal-btn' }, T.consegnaConferma);
    const f = apriFinestra(T.consegnaTitolo, () => { finestraConsegna = null; });
    finestraConsegna = f;
    conferma.addEventListener('click', async () => {
      conferma.disabled = true;
      try {
        await sessione.consegna();                               // l'esito (consegnato) arriva da quandoCambia
        f.chiudi();
      } catch (err) {
        toast(messaggio(err), 'error');
        conferma.disabled = false;
      }
    });
    f.corpo.append(
      ...T.consegnaRighe.map((t) => el('p', {}, t)), resta,
      el('div', { class: 'modal-actions' }, conferma,
        el('button', { type: 'button', class: 'modal-btn secondary', onclick: () => f.chiudi() }, T.consegnaAnnulla)));
  }

  // ── Scheda «Traccia» ────────────────────────────────────────────────────────
  // Chiamata dalla sessione all'ingresso e a ogni modifica del docente (`aggiornata`: la traccia è cambiata mentre si
  // lavorava). `traccia` è null se non si è riusciti a leggerla.
  async function mostraTraccia(info) {
    const tab = document.getElementById('tabTraccia');
    const box = document.getElementById('tracciaBox');
    if (!tab || !box) return;
    const t = info && info.traccia;
    let html = '';
    if (t) { try { html = await rendiMarkdown(t.testoMd); } catch { html = ''; } }
    if (!sessione) return;                                       // nel frattempo la verifica è finita
    box.textContent = '';
    const corpo = el('div', { class: 'traccia-md' });
    if (html) corpo.innerHTML = html;                            // output sicuro di markdown.js: niente script, link o immagini
    else corpo.append(el('p', {}, T.tracciaNonDisponibile));
    let zoom = 100;
    try { zoom = Math.min(200, Math.max(80, Number(window.localStorage.getItem(ZOOM_KEY)) || 100)); } catch { /* storage non disponibile */ }
    const applica = () => { corpo.style.fontSize = `${zoom / 100}rem`;     // solo il testo della traccia: avviso, titolo e pulsanti restano fissi
      try { window.localStorage.setItem(ZOOM_KEY, String(zoom)); } catch { /* idem */ } };
    const ora = info && info.modificata ? info.modificata.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
    box.append(
      ...(info && info.aggiornata ? [el('div', { class: 'traccia-aggiornata', role: 'status' }, T.tracciaAggiornata(ora))] : []),
      el('div', { class: 'traccia-pannello-testa' },
        el('h3', { class: 'traccia-pannello-titolo' }, t ? t.titolo : T.tracciaTab),
        el('span', { class: 'traccia-zoom' },
          el('button', { type: 'button', 'aria-label': 'Testo più piccolo', onclick: () => { zoom = Math.max(80, zoom - 10); applica(); } }, 'A−'), ' ',
          el('button', { type: 'button', 'aria-label': 'Testo più grande', onclick: () => { zoom = Math.min(200, zoom + 10); applica(); } }, 'A+'))),
      corpo);
    applica();
    tab.hidden = false;
    tab.click();                                                 // aperta all'ingresso, e di nuovo se il docente la cambia
    if (info && info.aggiornata) toast(T.tracciaAggiornata(ora), 'success');
  }

  function nascondiTraccia() {
    const tab = document.getElementById('tabTraccia');
    const box = document.getElementById('tracciaBox');
    if (box) box.textContent = '';
    if (tab) {
      const attiva = tab.classList.contains('active');
      tab.hidden = true;
      if (attiva) document.querySelector('.tab-btn[data-tab="pseudocode"]')?.click();
    }
  }

  // ── Rete caduta e file di emergenza ─────────────────────────────────────────
  // Salva il file con ciò che c'è adesso (`dati` viene da sessione.datiEmergenza()). Restituisce il nome, o null se non c'è niente.
  function salvaFile(dati, titolo) {
    if (!dati || dati.programma === null) { toast(T.offlineNienteDaSalvare, 'error'); return null; }
    const f = creaFileEmergenza({
      verifica: dati.verifica, titolo, studente: dati.studente, studenteNome: dati.studenteNome, programma: dati.programma,
      nBlocchi: dati.nBlocchi, nBlocchiSincronizzati: dati.nBlocchiSincronizzati ?? null,
      offlineDa: dati.offlineDa ? oraBreve(new Date(dati.offlineDa)) : null,
    });
    const url = URL.createObjectURL(new Blob([f.testo], { type: 'application/json' }));
    const a = el('a', { href: url, download: f.nomeFile, hidden: '' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    fileSalvato = true;
    toast(T.offlineSalvato(f.nomeFile), 'success');
    return f.nomeFile;
  }

  // L'avviso sotto la fascia: compare quando la sessione dichiara la rete caduta, sparisce quando torna.
  function aggiornaOffline(c) {
    const era = !!(offlineStato && offlineStato.offline);
    offlineStato = { offline: !!c.offline, offlineDa: c.offlineDa ?? null };
    if (c.offline && !bandaOffline && banda) {
      const testo = el('span', { class: 'banda-offline-testo' });
      const salva = el('button', { type: 'button', class: 'modal-btn', onclick: () => salvaFile(sessione?.datiEmergenza(), item?.verifica.titolo) }, T.offlineSalva);
      bandaOffline = el('div', { class: 'banda-offline', role: 'alert' }, testo, puntoDomanda('offline'), salva);
      bandaOffline.testo = testo;
      banda.after(bandaOffline);
    }
    if (bandaOffline) {
      if (c.offline) bandaOffline.testo.textContent = (c.restanteMs ?? 1) <= 0 ? T.offlineTempoFinito : T.offlineTesto;
      else { bandaOffline.remove(); bandaOffline = null; }
    }
    if (era && !c.offline) toast(T.tornataRete, 'success');
  }

  // ── Rientro senza rete ──────────────────────────────────────────────────────
  // La pagina si è ricaricata (o il browser è stato riaperto) a verifica in corso e il server non risponde. Servono l'indizio
  // «verifica in corso» (titolo, scadenza, scarto dell'orologio) e la copia locale del lavoro, dello stesso studente. Senza
  // la copia lo studente non aveva scritto niente: si riparte in modalità normale.
  async function rientroSenzaRete() {
    const v = leggiVerificaInCorso();
    if (!v || !api || v.email !== api.email || typeof v.scadenzaMs !== 'number' || !api.copiaLocale?.(v.vid)) return false;
    await inizia({ verifica: { id: v.vid, titolo: v.titolo || 'Verifica', apertaIl: null }, lavoro: { scadenza: new Date(v.scadenzaMs) } }, { rientro: { scartoMs: v.scartoMs ?? 0 } });
    return !!sessione;
  }

  // Lavori di verifica con modifiche mai arrivate al server, rimasti su questo computer (verifica finita, pagina chiusa): si
  // propone di salvarli su file, una sola volta per pagina. Sono solo quelli dello studente collegato. Prima si controlla
  // se quel lavoro è GIÀ STATO CONSEGNATO (per esempio il docente ha caricato il file di emergenza): una consegna con lo
  // stesso identico programma vuol dire che non c'è più niente da salvare, e la copia locale si elimina. Si confronta il
  // contenuto, non le date (l'orologio del computer non è affidabile).
  async function proponiCopie(copie) {
    const mie = copie.filter((r) => r.email === api?.email && !copieProposte.has(r.vid));
    if (mie.length === 0) return;
    for (const r of mie) copieProposte.add(r.vid);              // subito: un controllo che parte mentre questo aspetta non le riproporrebbe
    const daProporre = [];
    for (const r of mie) {
      let consegnata = false;
      try { consegnata = (await api.consegne.mie(r.vid)).some((c) => c.programma === r.programma); } catch { /* non si sa: si propone */ }
      if (consegnata) api.eliminaCopia?.(r.vid); else daProporre.push(r);
    }
    if (daProporre.length === 0 || finestraCopie || sessione || mostrandoFine || !api) return;
    const f = apriFinestra(T.copieTitolo, () => { finestraCopie = null; });
    finestraCopie = f;
    f.corpo.append(el('p', {}, T.copieRiga),
      ...daProporre.map((r) => el('div', { class: 'sketch-riga' },
        el('div', { class: 'sketch-info' }, el('strong', {}, r.titolo || 'Verifica'),
          el('span', { class: 'sketch-data' }, `${r.nBlocchi ?? 0} blocchi · salvato ${formatoDataOra.format(new Date(r.salvataAlle ?? Date.now()))}`)),
        el('button', { type: 'button', class: 'modal-btn', onclick: () => salvaFile({
          verifica: r.vid, studente: r.email, studenteNome: r.nome || r.email, programma: r.programma, nBlocchi: r.nBlocchi ?? 0, nBlocchiSincronizzati: null, offlineDa: null,
        }, r.titolo) }, T.offlineSalva))),
      el('div', { class: 'modal-actions' }, el('button', { type: 'button', class: 'modal-btn secondary', onclick: () => f.chiudi() }, T.ok)));
  }

  // ── Fine della verifica ─────────────────────────────────────────────────────
  function quandoCambia(c) {
    if (c.stato === 'consegnato') fine('consegnato', c.origine);
    else if (c.stato === 'terminata') fine('terminata');
    else aggiornaOffline(c);
  }

  // Ripulisce tutto ciò che la modalità verifica aveva acceso e riporta l'app com'era.
  function spegni() {
    clearInterval(timer);
    timer = null;
    annullaModifica?.(); annullaModifica = null;
    annullaEsecuzione?.(); annullaEsecuzione = null;
    banda?.remove(); banda = null;
    bandaOffline?.remove(); bandaOffline = null; offlineStato = null;
    nascondiTraccia();
    window.removeEventListener('pagehide', salvaCopia);
    sessione?.termina();
    sessione = null;
    item = null;
    cancellaVerificaInCorso();
    programma.modoVerifica.esci();                // si torna al lavoro di prima; la copia automatica riprende
    quandoCambiaModo(false);
  }

  function fine(tipo, origine) {
    if (!sessione || mostrandoFine) return;
    mostrandoFine = true;
    const testo = tipo === 'consegnato'
      ? (origine === 'automatica' ? { titolo: T.scadutoTitolo, riga: T.scadutoRiga } : { titolo: T.consegnatoTitolo, riga: T.consegnatoRiga })
      : { titolo: T.terminataTitolo, riga: T.terminataRiga };
    finestraConsegna?.chiudi();                  // se era aperta la conferma e la consegna è partita da sola
    // Terminata con modifiche che il server non ha mai ricevuto (rete caduta): il file è l'unico modo di non perderle.
    // Anche con l'editor vuoto: il file è la prova che lo studente c'era (e non ha scritto niente) quando il server non ha
    // ricevuto nulla di suo.
    const dati = tipo === 'terminata' && sessione.senzaSalvare() ? sessione.datiEmergenza() : null;
    const titoloVerifica = item?.verifica.titolo;
    if (item) copieProposte.add(item.verifica.id);          // la finestra di fine ha già offerto il file: non si ripropone subito
    fileSalvato = false;
    spegni();
    const f = apriFinestra(testo.titolo, () => { mostrandoFine = false; ricontrolla(); }, { bloccante: true });
    const ok = el('button', { type: 'button', class: 'modal-btn', onclick: () => { if (!dati || fileSalvato || window.confirm(T.terminataConFileConferma)) f.chiudi(); } }, T.ok);
    f.corpo.append(
      el('p', {}, dati ? T.terminataConFileRiga : testo.riga), el('p', { class: 'sketch-nota' }, T.dopoFine),
      el('div', { class: 'modal-actions' },
        dati ? el('button', { type: 'button', class: 'modal-btn', onclick: () => salvaFile(dati, titoloVerifica) }, T.offlineSalva) : '', ok));
  }

  // ── Entrata e uscita dell'utente ───────────────────────────────────────────
  return {
    // Chiamata all'accesso di uno studente: `apiStudente` è l'oggetto del cloud, `corsi` quello dei suoi corsi.
    async entra(apiStudente, corsi, { senzaRete = false } = {}) {
      api = apiStudente;
      corsiApi = corsi;
      corsiCaricati = false;
      let nonRaggiungibile = senzaRete;
      try {
        if (!senzaRete) await caricaCorsi();
      } catch { corsiIds = []; nonRaggiungibile = true; }
      if (!api) return;
      // Il server non risponde: se la pagina si è ricaricata a verifica in corso, e c'è la copia, si rientra senza rete.
      if (nonRaggiungibile && await rientroSenzaRete()) return;
      if (!api) return;
      if (!smettiDiAscoltare) smettiDiAscoltare = api.ascoltaAperte(corsiIds, (ids) => { aperteViste = ids; ricontrolla(); });
      ricontrolla();
    },
    esci() {
      smettiDiAscoltare?.();
      smettiDiAscoltare = null;
      clearTimeout(timerRicontrollo);
      timerRicontrollo = null;
      aperteViste = [];
      finestraCopie?.chiudi(); finestraCopie = null; copieProposte = new Set();
      if (sessione) spegni();
      scelta?.chiudi();
      scelta = null;
      api = null;
      corsiApi = null;
      corsiCaricati = false;
      corsiIds = [];
      programma.modoVerifica.nessuna();
    },
    inVerifica: () => !!sessione,
  };
}
