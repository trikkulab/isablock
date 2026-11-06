// La parte dello studente di una verifica, senza interfaccia: trovare le verifiche da fare e tenere una SESSIONE
// mentre ne svolge una (salvare il lavoro, sapere quanto tempo resta, consegnare, accorgersi della chiusura).
//
// Salvataggio live (parametri in verifica-config.js, sezione `client`, perché da lì dipendono le quote Spark):
//   - il programma si scrive solo se è CAMBIATO (hash), e al massimo una volta ogni `debounceSalvataggioMs`
//     (la scrittura parte quel tempo dopo la prima modifica non ancora salvata);
//   - se per `battitoMs` non si è scritto niente si scrive un segnale di vita (solo `ultimoSegnale`): è il battito
//     che dice al docente che lo studente c'è ancora, e cade solo se non c'è altra scrittura;
//   - ogni `campioneOgniMs` la scrittura che capita porta anche un campione {t, n} (ora, numero di blocchi),
//     in un anello di `maxCampioni` voci: serve alla colonna «23 (+4)» del docente, senza scritture in più.
//
// Il tempo è sempre quello del SERVER: la prima scrittura (l'ingresso) e ogni scrittura successiva portano
// `ultimoSegnale = ora del server`, e dal confronto con l'orologio locale (nel momento in cui arriva l'eco dal server)
// si stima lo scarto. Il timer è «scadenza − ora del server stimata», e non dipende dall'orologio del PC.
// A fine tempo la consegna parte da sola (origine «automatica»); le regole la accettano fino a scadenza + grazia.
//
// Copia locale (opzione `backup`, vedi src/verifica-backup.js): a ogni modifica, dopo `backupLocaleMs`, e dopo ogni
// scrittura riuscita; costa solo localStorage. All'ingresso, se la copia ha modifiche che il database non ha (e il database
// non si è mosso dopo di lei) si riparte da quella e il motore la scrive. Si elimina alla consegna; se la verifica finisce
// con modifiche mai arrivate al database resta, per salvarla su file.
//
// Traccia: la sessione ascolta la traccia assegnata e dice a chi la mostra (`onTraccia`) quando il docente la modifica; la
// revisione vista si scrive nel lavoro (`tracciaRevVista`).
import { creaLavoroStudente } from './lavori.js';
import { creaConsegneStudente } from './consegne.js';
import { creaVerifiche } from './verifiche.js';
import { verificaConfig } from './verifica-config.js';
import { hashText } from '../local-backup.js';
import { scegliPunto } from '../verifica-backup.js';

const C = verificaConfig.client;
const L = verificaConfig.regole;
const MINUTO = 60_000;
// Orologio e timer, sostituibili nei test con un tempo simulato.
export const tempoReale = Object.freeze({
  adesso: () => Date.now(),
  timeout: (fn, ms) => setTimeout(fn, ms),
  annulla: (id) => clearTimeout(id),
});

export const hashProgramma = (testo) => hashText(String(testo ?? ''));

// ── Trovare le verifiche da fare ─────────────────────────────────────────────
export function creaVerificheStudente({ sdk, db }, emailUtente, nomeUtente) {
  const email = String(emailUtente || '').toLowerCase();
  const verifiche = creaVerifiche({ sdk, db }, email);
  const lavoro = creaLavoroStudente({ sdk, db }, email, nomeUtente);
  const consegne = creaConsegneStudente({ sdk, db }, email, nomeUtente);

  // Le verifiche aperte, nei corsi indicati, che lo studente deve ancora fare: ha un'assegnazione, non ha consegnato
  // e il suo tempo non è finito (qui si usa l'orologio del PC solo per questo filtro; il timer vero parte dopo l'ingresso).
  // Se non si riesce a controllare (rete, accesso) lancia l'errore: «non lo so» non è «non c'è niente».
  async function daFare(corsiIds, { adesso = Date.now() } = {}) {
    const trovate = [];
    for (const corsoId of corsiIds) {
      // Un errore (rete, accesso non ancora pronto) NON è «nessuna verifica»: si propaga, e chi chiama riprova.
      const aperte = await verifiche.elenca(corsoId, { soloAperte: true });
      for (const v of aperte) {
        let l;
        try { l = await lavoro.mio(v.id); } catch (err) {
          if (err && err.codice === 'assente') continue;                  // senza assegnazione non partecipa
          throw err;
        }
        if (l.consegnato) continue;
        if (l.scadenza && l.scadenza.getTime() + L.graziaSecondi * 1000 < adesso) continue;
        trovate.push({ verifica: v, lavoro: l });
      }
    }
    return trovate;
  }

  // Avvisa quando in uno dei corsi si apre (o cambia) una verifica: ascolto leggero, una lettura per cambiamento.
  // Restituisce la funzione per smettere di ascoltare.
  function ascoltaAperte(corsiIds, quandoCambia) {
    const stato = new Map();
    const annulla = corsiIds.map((corsoId) => sdk.onSnapshot(
      sdk.query(sdk.collection(db, 'verifiche'), sdk.where('corsoId', '==', corsoId), sdk.where('stato', '==', 'aperta')),
      (snap) => { stato.set(corsoId, snap.docs.map((d) => d.id)); quandoCambia([...stato.values()].flat()); },
      () => {}));
    return () => annulla.forEach((f) => f());
  }

  // Le consegne dello studente nelle verifiche CONCLUSE (chiuse, anche archiviate) dei corsi indicati, dalla verifica più
  // recente: { verifica, consegne: [v1, v2, …] }. Le bozze e le verifiche aperte non compaiono: una verifica in corso non
  // si rivede (e in verifica il menu è spento). Costo: una lettura per corso e una per ogni verifica conclusa.
  async function mieConsegne(corsiIds) {
    const trovate = [];
    for (const corsoId of corsiIds) {
      for (const v of await verifiche.elenca(corsoId, { soloChiuse: true })) {
        const mie = await consegne.mie(v.id);
        if (mie.length) trovate.push({ verifica: v, consegne: mie });
      }
    }
    const quando = (x) => (x.verifica.chiusaIl ?? x.verifica.fine)?.getTime() ?? 0;
    return trovate.sort((a, b) => quando(b) - quando(a));
  }

  return { daFare, ascoltaAperte, mieConsegne, email, verifiche, lavoro, consegne };
}

// ── Sessione di una verifica ─────────────────────────────────────────────────
// stato: 'in-corso' | 'consegnato' | 'terminata' (chiusa dal docente o tempo finito senza consegna)
// `calibra: false` (solo nei test con tempo simulato) lascia lo scarto a zero: con un orologio finto che salta, i campioni
// dell'eco dal server non sarebbero confrontabili.
export function creaSessione({ sdk, db }, emailUtente, nomeUtente, vid, { tempo = tempoReale, config = C, onCambio = () => {}, onTraccia = () => {}, backup = null, calibra = true, titolo = '', rientroOffline = null } = {}) {
  const email = String(emailUtente || '').toLowerCase();
  const lavoro = creaLavoroStudente({ sdk, db }, email, nomeUtente);
  const consegne = creaConsegneStudente({ sdk, db }, email, nomeUtente);

  let stato = 'in-corso';
  let origineConsegna = null;     // 'studente' o 'automatica', dopo la consegna
  let programmaIniziale = null;   // il programma già salvato nel database all'ingresso (per riprendere dopo un ricaricamento)
  let scadenza = null;            // Date
  let tracciaId = null;
  let offset = 0;                 // ora del server meno orologio locale (ms)
  const campioniOffset = [];      // {offset, latenza}: si tiene la stima con la latenza minore
  let ultimoInvio = null;         // quando è partita l'ultima scrittura (orologio locale)
  let ultimoSegnaleVisto = null;  // ultimoSegnale (ms) dell'ultimo eco già usato per stimare lo scarto
  let ultimaScrittura = null;     // quando è finita l'ultima scrittura (orologio locale)
  let ultimoCampione = null;      // ora del server dell'ultimo campione scritto
  let ultimaIstantanea = null;    // ora del server dell'ultima istantanea periodica (storia)
  let campioni = [];
  const corrente = { programma: null, nBlocchi: 0, esecuzioni: null };   // ultimo stato comunicato dall'interfaccia
  const salvato = { hash: null, esecuzioni: null, revVista: null, programma: null, nBlocchi: null };                      // ciò che è già nel database
  let timerDebounce = null;
  let timerBattito = null;
  let timerFine = null;
  let timerBackup = null;
  let timerOffline = null;
  let timerGuardia = null;
  let offline = false;            // il server non risponde da più di `offlineStudenteMs`
  let inizioOffline = null;       // orologio locale: da quando il server non risponde (anche prima di dichiararsi offline)
  let ripresa = null;             // 'locale' | 'server' | 'uguali' | null: da dove si è ripartiti all'ingresso
  let traccia = null;             // { id, titolo, testoMd, rev } l'ultima vista
  let entrataNuova = false;       // è il primo ingresso in questa verifica
  let coda = Promise.resolve();   // le scritture una alla volta
  const annullaAscolti = [];
  const stat = { scritture: 0, battiti: 0, consegne: 0 };

  const ora = () => tempo.adesso() + offset;                              // ora del server stimata
  const restanteMs = () => (scadenza ? scadenza.getTime() - ora() : null);
  const notifica = () => onCambio({ stato, scadenza, tracciaId, restanteMs: restanteMs(), origine: origineConsegna, offline, offlineDa: offline ? inizioOffline : null });

  function cambiaStato(nuovo) {
    if (stato === nuovo) return;
    const prima = stato;
    stato = nuovo;
    fermaTimer();
    if (prima === 'in-corso') chiudiBackup(nuovo);
    notifica();
  }
  function fermaTimer() {
    for (const t of [timerDebounce, timerBattito, timerFine, timerBackup, timerOffline, timerGuardia]) if (t !== null) tempo.annulla(t);
    timerDebounce = timerBattito = timerFine = timerBackup = timerOffline = timerGuardia = null;
  }

  // ── Copia locale ────────────────────────────────────────────────────────
  function scriviBackup() {
    if (!backup || corrente.programma === null) return;
    backup.salva({
      finoA: (scadenza ? scadenza.getTime() : Date.now()) + 2 * 60 * 60 * 1000,
      programma: corrente.programma, hash: hashProgramma(corrente.programma), hashBase: salvato.hash,
      nBlocchi: corrente.nBlocchi, esecuzioni: corrente.esecuzioni, traccia, titolo, nome: String(nomeUtente || email),
    });
  }
  function programmaBackup() {
    if (!backup || timerBackup !== null || stato !== 'in-corso') return;
    timerBackup = tempo.timeout(() => { timerBackup = null; scriviBackup(); }, config.backupLocaleMs ?? 1500);
  }
  // Consegnata: la copia non serve più. Terminata con tutto già nel database: idem. Terminata con modifiche mai arrivate:
  // resta (aggiornata), perché lo studente possa salvarla su file e portarla al docente.
  function chiudiBackup(nuovo) {
    if (!backup) return;
    if (nuovo === 'consegnato' || !haDaScrivere()) backup.cancella();
    else scriviBackup();
  }

  // ── Scrittura del lavoro ────────────────────────────────────────────────
  function haDaScrivere() {
    return corrente.programma !== null && hashProgramma(corrente.programma) !== salvato.hash;
  }

  async function scriviOra({ battito = false } = {}) {
    if (stato !== 'in-corso') return;
    clearAndNull('debounce');
    const dati = {};
    if (haDaScrivere()) {
      dati.programma = corrente.programma;
      dati.programmaHash = hashProgramma(corrente.programma);
      dati.nBlocchi = corrente.nBlocchi;
    }
    if (corrente.esecuzioni && JSON.stringify(corrente.esecuzioni) !== JSON.stringify(salvato.esecuzioni)) dati.esecuzioni = corrente.esecuzioni;
    if (traccia && traccia.rev !== salvato.revVista) dati.tracciaRevVista = traccia.rev;
    const t = ora();
    if (ultimoCampione === null || t - ultimoCampione >= config.campioneOgniMs) {
      campioni = [...campioni, { t: Math.round(t), n: corrente.nBlocchi }].slice(-L.maxCampioni);
      dati.campioni = campioni;
    }
    ultimoInvio = tempo.adesso();
    try {
      await lavoro.salva(vid, dati);
    } catch (err) {
      // Dopo la chiusura o a tempo scaduto le regole rifiutano: la verifica per lui è finita.
      if (err && err.codice === 'negato') { cambiaStato('terminata'); return; }
      // Rete assente o altro: niente va perso (il programma resta in memoria), si riprova al prossimo battito.
      programmaBattito();
      if (haDaScrivere()) programmaDebounce();
      throw err;
    }
    stat.scritture++;
    if (battito) stat.battiti++;
    ultimaScrittura = tempo.adesso();
    const programmaPrima = salvato.programma;
    const nBlocchiPrima = salvato.nBlocchi;
    if (dati.programma !== undefined) { salvato.hash = dati.programmaHash; salvato.programma = dati.programma; salvato.nBlocchi = dati.nBlocchi; }
    if (dati.esecuzioni !== undefined) salvato.esecuzioni = dati.esecuzioni;
    if (dati.campioni !== undefined) ultimoCampione = t;
    if (dati.tracciaRevVista !== undefined) salvato.revVista = dati.tracciaRevVista;
    if (stato === 'in-corso') scriviBackup();              // ora il database ha questo programma: la copia lo sa
    if (dati.programma !== undefined) storia(t, dati.programma, dati.nBlocchi, programmaPrima, nBlocchiPrima);
    programmaBattito();
  }

  // ── Storia del lavoro ───────────────────────────────────────────────────
  // Istantanee del programma per capire come evolve: una ogni `istantaneaOgniMs` (solo se è cambiato) e, se i blocchi
  // sono saliti di colpo (`saltoBlocchi` o più rispetto al salvataggio precedente), la coppia prima/dopo. I posti sono
  // a anello e dipendono dall'ora (la nuova rimpiazza la più vecchia), quindi non serve ricordare nulla tra un
  // ricaricamento e l'altro. Scritture a parte e senza bloccare il salvataggio: se falliscono si perde solo l'istantanea.
  function storia(t, programma, n, programmaPrima, nBlocchiPrima) {
    if (!lavoro.istantanea) return;
    const scrivi = (sid, tipo, p, nb) => inBackground(() => lavoro.istantanea(vid, sid, { tipo, programma: p, nBlocchi: nb }));
    if (programmaPrima && nBlocchiPrima !== null && n - nBlocchiPrima >= config.saltoBlocchi) {
      const k = Math.floor(t / MINUTO) % L.maxIstantaneeSalto;
      scrivi(`a${k}`, 'prima', programmaPrima, nBlocchiPrima);
      scrivi(`d${k}`, 'dopo', programma, n);
    }
    if (n > 0 && (ultimaIstantanea === null || t - ultimaIstantanea >= config.istantaneaOgniMs)) {
      scrivi(`p${Math.floor(t / config.istantaneaOgniMs) % L.maxIstantanee}`, 'periodica', programma, n);
      ultimaIstantanea = t;
    }
  }

  function clearAndNull(quale) {
    if (quale === 'debounce' && timerDebounce !== null) { tempo.annulla(timerDebounce); timerDebounce = null; }
    if (quale === 'battito' && timerBattito !== null) { tempo.annulla(timerBattito); timerBattito = null; }
  }
  // Le scritture una alla volta. Chi aspetta il risultato vede l'errore; la coda no (l'errore non blocca le successive).
  const accoda = (fn) => { const p = coda.then(fn); coda = p.catch(() => {}); return p; };
  const inBackground = (fn) => { accoda(fn).catch(() => {}); };

  // Battito: se per `battitoMs` non si scrive altro, si scrive un segnale di vita.
  function programmaBattito() {
    clearAndNull('battito');
    if (stato !== 'in-corso') return;
    timerBattito = tempo.timeout(() => { timerBattito = null; inBackground(() => scriviOra({ battito: true })); }, config.battitoMs);
  }

  function programmaDebounce() {
    if (timerDebounce !== null || stato !== 'in-corso') return;
    timerDebounce = tempo.timeout(() => { timerDebounce = null; inBackground(() => scriviOra()); }, config.debounceSalvataggioMs);
  }

  // L'interfaccia comunica il programma (JSON come testo) e le statistiche a ogni modifica: costa solo un confronto.
  function aggiorna({ programma, nBlocchi, esecuzioni } = {}) {
    if (programma !== undefined) corrente.programma = programma;
    if (nBlocchi !== undefined) corrente.nBlocchi = nBlocchi;
    if (esecuzioni !== undefined) corrente.esecuzioni = esecuzioni;
    programmaBackup();
    if (stato === 'in-corso' && (haDaScrivere() || (corrente.esecuzioni && JSON.stringify(corrente.esecuzioni) !== JSON.stringify(salvato.esecuzioni)))) programmaDebounce();
  }

  const salvaOra = () => accoda(() => scriviOra());

  // ── Fine del tempo e consegna ───────────────────────────────────────────
  function programmaFine() {
    if (timerFine !== null) { tempo.annulla(timerFine); timerFine = null; }
    if (stato !== 'in-corso' || !scadenza) return;
    const resta = Math.max(0, restanteMs());
    timerFine = tempo.timeout(() => {
      timerFine = null;
      if (restanteMs() > 250) { programmaFine(); return; }       // la scadenza è slittata (tempo aggiuntivo) o la stima è cambiata
      consegnaAutomatica();
    }, resta);
  }

  // A fine tempo la consegna parte da sola. Se non riesce (rete, o altro) NON si lascia perdere: si riprova ogni
  // `riprovaConsegnaMs` finché le regole la accettano (scadenza + grazia); passato quel limite la verifica è terminata e
  // vale l'ultimo lavoro salvato, che il docente raccoglie.
  // Guardia: oltre scadenza + grazia le regole non accettano più nulla. Se a quel punto la verifica è ancora «in corso» la
  // consegna è rimasta in sospeso (rete caduta, ma non ancora dichiarata) e non fallirà mai da sola: la verifica è terminata.
  function guardiaFine() {
    if (timerGuardia !== null || stato !== 'in-corso') return;
    timerGuardia = tempo.timeout(() => {
      timerGuardia = null;
      if (stato !== 'in-corso') return;
      if (restanteMs() < -L.graziaSecondi * 1000) { cambiaStato('terminata'); return; }
      if (restanteMs() <= 0) guardiaFine();                    // se arriva tempo aggiuntivo la guardia smette
    }, config.riprovaConsegnaMs ?? 5000);
  }

  function consegnaAutomatica() {
    if (stato !== 'in-corso') return;
    guardiaFine();
    // Offline la consegna non partirebbe (resterebbe in sospeso, senza mai fallire): si aspetta la rete fino al limite
    // delle regole, poi la verifica è terminata e lo studente ha il file di emergenza.
    if (offline) {
      if (restanteMs() < -L.graziaSecondi * 1000) { cambiaStato('terminata'); return; }
      timerFine = tempo.timeout(() => { timerFine = null; consegnaAutomatica(); }, config.riprovaConsegnaMs ?? 5000);
      return;
    }
    inBackground(async () => {
      try {
        await consegna({ origine: 'automatica' });
      } catch {
        if (stato !== 'in-corso') return;
        if (restanteMs() < -L.graziaSecondi * 1000) { cambiaStato('terminata'); return; }
        timerFine = tempo.timeout(() => { timerFine = null; consegnaAutomatica(); }, config.riprovaConsegnaMs ?? 5000);
      }
    });
  }

  async function consegna({ origine = 'studente' } = {}) {
    if (stato !== 'in-corso') return null;
    clearAndNull('debounce');
    ultimoInvio = tempo.adesso();
    // L'origine si registra PRIMA di scrivere: il server può confermare (e l'ascolto accorgersene) prima che questa funzione finisca,
    // e chi legge lo stato deve già poter dire se è stata una consegna a mano o allo scadere del tempo.
    origineConsegna = origine;
    let fatta;
    try {
      fatta = await consegne.consegna(vid, {
        programma: corrente.programma ?? undefined, programmaHash: corrente.programma !== null ? hashProgramma(corrente.programma) : undefined,
        nBlocchi: corrente.nBlocchi, esecuzioni: corrente.esecuzioni ?? undefined, campioni,
      }, { origine, giaEntrato: lavoro.giaEntrato(vid) });
    } catch (err) {
      origineConsegna = null;
      if (err && err.codice === 'gia') { cambiaStato('consegnato'); return null; }       // consegnato da un'altra scheda
      if (err && err.codice === 'negato') cambiaStato('terminata');                       // chiusa, o tempo finito
      throw err;
    }
    stat.consegne++;
    cambiaStato('consegnato');
    return fatta;
  }

  // ── Rete ────────────────────────────────────────────────────────────────
  // Offline = il server non risponde da più di `offlineStudenteMs`. Lo dice l'ascolto del lavoro: Firestore segna lo
  // snapshot come «dalla copia locale» (fromCache) quando non raggiunge il server. Non basta `navigator.onLine`, che non
  // vede una rete scolastica che accetta il collegamento ma non porta da nessuna parte. Le scritture, offline, restano
  // in sospeso (non falliscono): per questo l'interfaccia deve saperlo, per offrire il file di emergenza.
  function reteDaSnapshot(daCache) {
    if (stato !== 'in-corso') return;
    if (!daCache) {
      if (timerOffline !== null) { tempo.annulla(timerOffline); timerOffline = null; }
      inizioOffline = null;
      if (offline) { offline = false; notifica(); }
      return;
    }
    if (inizioOffline !== null) return;
    inizioOffline = tempo.adesso();
    timerOffline = tempo.timeout(() => { timerOffline = null; if (stato === 'in-corso') { offline = true; notifica(); } }, config.offlineStudenteMs);
  }

  // Ciò che serve al file di emergenza (src/verifica-file.js): il programma com'è adesso, e quanto ne era arrivato al server.
  function datiEmergenza() {
    return {
      verifica: vid, studente: email, studenteNome: String(nomeUtente || email),
      programma: corrente.programma, nBlocchi: corrente.nBlocchi, nBlocchiSincronizzati: salvato.nBlocchi,
      offlineDa: offline || inizioOffline !== null ? inizioOffline : null, senzaSalvare: corrente.programma !== null && haDaScrivere(),
    };
  }

  // ── Ascolti: il docente può dare tempo, o chiudere la verifica ─────────────
  function stimaOffset(snapLavoro) {
    const d = snapLavoro.data();
    const ts = d && d.ultimoSegnale && typeof d.ultimoSegnale.toMillis === 'function' ? d.ultimoSegnale.toMillis() : null;
    if (!calibra || ts === null || ts === ultimoSegnaleVisto || snapLavoro.metadata.hasPendingWrites || ultimoInvio === null) return;
    ultimoSegnaleVisto = ts;
    const t1 = tempo.adesso();
    const latenza = t1 - ultimoInvio;
    if (latenza < 0 || latenza > 10000) return;
    campioniOffset.push({ offset: ts - (ultimoInvio + t1) / 2, latenza });
    if (campioniOffset.length > 6) campioniOffset.shift();
    offset = campioniOffset.reduce((m, c) => (c.latenza < m.latenza ? c : m)).offset;
  }

  function ascolta() {
    annullaAscolti.push(sdk.onSnapshot(sdk.doc(db, 'verifiche', vid, 'lavori', email), { includeMetadataChanges: true }, (snap) => {
      reteDaSnapshot(snap.metadata.fromCache);
      if (!snap.exists()) return;
      stimaOffset(snap);
      const d = snap.data();
      const nuova = d.scadenza && typeof d.scadenza.toDate === 'function' ? d.scadenza.toDate() : null;
      const cambiata = (nuova && !scadenza) || (nuova && scadenza && nuova.getTime() !== scadenza.getTime());
      if (nuova) scadenza = nuova;
      tracciaId = d.tracciaId ?? null;
      // «Consegnato» conta solo se lo ha confermato il server: una scrittura locale ancora in attesa non basta (se poi
      // fallisse, lo studente crederebbe di aver consegnato). Nel caso normale lo stato cambia quando consegna() ha finito.
      if (d.consegnato === true && !snap.metadata.hasPendingWrites) { cambiaStato('consegnato'); return; }
      if (cambiata) { programmaFine(); notifica(); }
    }, () => {}));
    annullaAscolti.push(sdk.onSnapshot(sdk.doc(db, 'verifiche', vid), (snap) => {
      if (snap.exists() && snap.data().stato === 'chiusa' && stato === 'in-corso') cambiaStato('terminata');
    }, () => {}));
  }

  // ── Traccia ─────────────────────────────────────────────────────────────
  // Ascolta la traccia assegnata: una lettura all'inizio e una per ogni modifica del docente (di norma nessuna).
  // `prima` si risolve alla prima risposta (o all'errore), così l'ingresso può già portare la revisione vista.
  function ascoltaTraccia(tid, visto) {
    let primaVolta = true;
    return new Promise((risolvi) => {
      annullaAscolti.push(sdk.onSnapshot(sdk.doc(db, 'verifiche', vid, 'tracce', tid), (snap) => {
        if (!snap.exists()) { risolvi(); return; }
        const d = snap.data();
        const nuova = { id: tid, titolo: d.titolo, testoMd: d.testoMd, rev: d.rev ?? 0 };
        const modificata = d.modificato && typeof d.modificato.toDate === 'function' ? d.modificato.toDate() : null;
        // «Aggiornata» = il docente l'ha cambiata dopo l'ultima revisione che lo studente aveva visto
        // (mai al primo ingresso: non ha visto niente prima).
        const aggiornata = visto !== null && nuova.rev > visto && !(primaVolta && entrataNuova);
        visto = Math.max(visto ?? 0, nuova.rev);
        traccia = nuova;
        primaVolta = false;
        onTraccia({ traccia: nuova, aggiornata, modificata: aggiornata ? (modificata ?? new Date(ora())) : null, daCopia: false });
        if (stato === 'in-corso' && nuova.rev !== salvato.revVista && entrato()) inBackground(() => scriviOra());
        risolvi();
      }, () => { risolvi(); }));
    });
  }
  const entrato = () => lavoro.giaEntrato(vid);

  // ── Avvio ───────────────────────────────────────────────────────────────
  // Il primo salvataggio è l'ingresso in verifica (e, a ogni riapertura, serve anche a stimare lo scarto dall'ora del server).
  //
  // `rientroOffline` ({ scadenza: Date, scartoMs }): la pagina è stata ricaricata a verifica in corso e il server non risponde.
  // Non si legge nulla dal server: la sessione riparte dai dati locali (scadenza e scarto dell'orologio dall'indizio, programma e
  // traccia dalla copia), già dichiarata offline. Quando la rete torna, l'ascolto la riporta online e le scritture riprendono.
  function lavoroOffline() {
    const b = backup?.leggi();
    return {
      scadenza: rientroOffline.scadenza, tracciaId: b?.traccia?.id ?? null, campioni: [], consegnato: false,
      entrato: rientroOffline.scadenza,                       // era già entrato (altrimenti non ci sarebbe la copia)
      programma: null, programmaHash: null, nBlocchi: null, esecuzioni: null, tracciaRevVista: b?.traccia?.rev ?? null,
    };
  }

  async function avvia() {
    if (rientroOffline) { offset = rientroOffline.scartoMs ?? 0; offline = true; inizioOffline = tempo.adesso(); }
    const l = rientroOffline ? lavoroOffline() : await lavoro.mio(vid);
    scadenza = l.scadenza;
    tracciaId = l.tracciaId;
    campioni = l.campioni ?? [];
    ultimoCampione = campioni.length ? campioni[campioni.length - 1].t : null;
    if (l.consegnato) { cambiaStato('consegnato'); return stato; }
    programmaIniziale = l.programma ?? null;
    if (l.programma) { corrente.programma = l.programma; salvato.hash = l.programmaHash ?? hashProgramma(l.programma); corrente.nBlocchi = l.nBlocchi ?? 0; salvato.programma = l.programma; salvato.nBlocchi = l.nBlocchi ?? 0; }
    if (l.esecuzioni) { corrente.esecuzioni = l.esecuzioni; salvato.esecuzioni = l.esecuzioni; }
    entrataNuova = !l.entrato;
    riprendiDallaCopia(l);
    ascolta();
    if (l.tracciaId) {
      salvato.revVista = l.tracciaRevVista;
      if (rientroOffline) ascoltaTraccia(l.tracciaId, l.tracciaRevVista);               // si aggancia, ma senza aspettare: parte dalla copia
      else {
        // Si aspetta la traccia (al massimo qualche secondo) per portare la revisione già nel salvataggio d'ingresso.
        await Promise.race([ascoltaTraccia(l.tracciaId, l.tracciaRevVista), new Promise((r) => setTimeout(r, 4000).unref?.())]);
      }
      if (!traccia && backup?.leggi()?.traccia?.id === l.tracciaId) {                 // senza rete: la traccia della copia locale
        traccia = backup.leggi().traccia;
        onTraccia({ traccia, aggiornata: false, modificata: null, daCopia: true });
      }
    }
    if (rientroOffline) inBackground(() => scriviOra());     // senza server non si aspetta: se la rete torna, la scrittura riparte
    else await accoda(() => scriviOra());                    // ingresso
    programmaFine();
    notifica();
    return stato;
  }

  // Se la copia locale ha modifiche che il database non ha, e il database non si è mosso dopo di lei, si riparte da lei.
  function riprendiDallaCopia(l) {
    const b = backup?.leggi();
    if (!b) return;
    if (rientroOffline) {                                    // il server non si conosce: la copia è l'unica fonte
      ripresa = 'locale';
      programmaIniziale = b.programma;
      corrente.programma = b.programma;
      corrente.nBlocchi = b.nBlocchi ?? 0;
      if (b.esecuzioni) corrente.esecuzioni = b.esecuzioni;
      salvato.hash = b.hashBase ?? null;                     // ciò che il server aveva all'ultima sincronizzazione
      return;
    }
    const hashServer = l.programma ? (l.programmaHash ?? hashProgramma(l.programma)) : null;
    ripresa = scegliPunto({ hashLocale: hashProgramma(b.programma), hashBase: b.hashBase ?? null, hashServer });
    if (ripresa !== 'locale') return;
    programmaIniziale = b.programma;
    corrente.programma = b.programma;
    corrente.nBlocchi = b.nBlocchi ?? 0;
    if (b.esecuzioni && (b.esecuzioni.n ?? 0) >= (corrente.esecuzioni?.n ?? 0)) corrente.esecuzioni = b.esecuzioni;
    salvato.hash = hashServer;                              // il database ha ancora l'altro: l'ingresso scrive questo
  }

  function termina() {
    fermaTimer();
    annullaAscolti.splice(0).forEach((f) => f());
  }

  return {
    avvia, aggiorna, salvaOra, consegna, termina,
    offline: () => offline,
    datiEmergenza,
    ora, restanteMs,
    stato: () => stato, scadenza: () => scadenza, tracciaId: () => tracciaId, offset: () => offset,
    programmaSalvato: () => programmaIniziale,              // se non è null, l'interfaccia lo ricarica nell'editor (ripresa)
    origine: () => origineConsegna,
    ripresa: () => ripresa,                                 // 'locale' | 'server' | 'uguali' | null
    salvaBackupOra: () => { if (stato === 'in-corso') scriviBackup(); },   // prima di chiudere la pagina
    tracciaCorrente: () => traccia,
    senzaSalvare: () => corrente.programma !== null && haDaScrivere(),     // modifiche mai arrivate al database
    // Si risolve quando le scritture in corso (e quelle che accodano) sono finite. Con la rete caduta le scritture restano
    // in sospeso e non finiscono mai: in quel caso non si aspetta.
    fermo: async () => { let c; do { if (inizioOffline !== null) return; c = coda; await c; } while (c !== coda); },
    statistiche: () => ({ ...stat }),
  };
}
