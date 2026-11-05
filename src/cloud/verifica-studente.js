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
import { creaLavoroStudente } from './lavori.js';
import { creaConsegneStudente } from './consegne.js';
import { creaVerifiche } from './verifiche.js';
import { verificaConfig } from './verifica-config.js';
import { hashText } from '../local-backup.js';

const C = verificaConfig.client;
const L = verificaConfig.regole;

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
  async function daFare(corsiIds, { adesso = Date.now() } = {}) {
    const trovate = [];
    for (const corsoId of corsiIds) {
      let aperte;
      try { aperte = await verifiche.elenca(corsoId, { soloAperte: true }); } catch { continue; }
      for (const v of aperte) {
        let l;
        try { l = await lavoro.mio(v.id); } catch { continue; }        // senza assegnazione non partecipa
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

  return { daFare, ascoltaAperte, verifiche, lavoro, consegne };
}

// ── Sessione di una verifica ─────────────────────────────────────────────────
// stato: 'in-corso' | 'consegnato' | 'terminata' (chiusa dal docente o tempo finito senza consegna)
// `calibra: false` (solo nei test con tempo simulato) lascia lo scarto a zero: con un orologio finto che salta, i campioni
// dell'eco dal server non sarebbero confrontabili.
export function creaSessione({ sdk, db }, emailUtente, nomeUtente, vid, { tempo = tempoReale, config = C, onCambio = () => {}, calibra = true } = {}) {
  const email = String(emailUtente || '').toLowerCase();
  const lavoro = creaLavoroStudente({ sdk, db }, email, nomeUtente);
  const consegne = creaConsegneStudente({ sdk, db }, email, nomeUtente);

  let stato = 'in-corso';
  let scadenza = null;            // Date
  let tracciaId = null;
  let offset = 0;                 // ora del server meno orologio locale (ms)
  const campioniOffset = [];      // {offset, latenza}: si tiene la stima con la latenza minore
  let ultimoInvio = null;         // quando è partita l'ultima scrittura (orologio locale)
  let ultimoSegnaleVisto = null;  // ultimoSegnale (ms) dell'ultimo eco già usato per stimare lo scarto
  let ultimaScrittura = null;     // quando è finita l'ultima scrittura (orologio locale)
  let ultimoCampione = null;      // ora del server dell'ultimo campione scritto
  let campioni = [];
  const corrente = { programma: null, nBlocchi: 0, esecuzioni: null };   // ultimo stato comunicato dall'interfaccia
  const salvato = { hash: null, esecuzioni: null };                      // ciò che è già nel database
  let timerDebounce = null;
  let timerBattito = null;
  let timerFine = null;
  let coda = Promise.resolve();   // le scritture una alla volta
  const annullaAscolti = [];
  const stat = { scritture: 0, battiti: 0, consegne: 0 };

  const ora = () => tempo.adesso() + offset;                              // ora del server stimata
  const restanteMs = () => (scadenza ? scadenza.getTime() - ora() : null);
  const notifica = () => onCambio({ stato, scadenza, tracciaId, restanteMs: restanteMs() });

  function cambiaStato(nuovo) {
    if (stato === nuovo) return;
    stato = nuovo;
    fermaTimer();
    notifica();
  }
  function fermaTimer() {
    for (const t of [timerDebounce, timerBattito, timerFine]) if (t !== null) tempo.annulla(t);
    timerDebounce = timerBattito = timerFine = null;
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
    if (dati.programma !== undefined) salvato.hash = dati.programmaHash;
    if (dati.esecuzioni !== undefined) salvato.esecuzioni = dati.esecuzioni;
    if (dati.campioni !== undefined) ultimoCampione = t;
    programmaBattito();
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
  function consegnaAutomatica() {
    if (stato !== 'in-corso') return;
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
    let fatta;
    try {
      fatta = await consegne.consegna(vid, {
        programma: corrente.programma ?? undefined, programmaHash: corrente.programma !== null ? hashProgramma(corrente.programma) : undefined,
        nBlocchi: corrente.nBlocchi, esecuzioni: corrente.esecuzioni ?? undefined, campioni,
      }, { origine });
    } catch (err) {
      if (err && err.codice === 'gia') { cambiaStato('consegnato'); return null; }       // consegnato da un'altra scheda
      if (err && err.codice === 'negato') cambiaStato('terminata');                       // chiusa, o tempo finito
      throw err;
    }
    stat.consegne++;
    cambiaStato('consegnato');
    return fatta;
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
    annullaAscolti.push(sdk.onSnapshot(sdk.doc(db, 'verifiche', vid, 'lavori', email), (snap) => {
      if (!snap.exists()) return;
      stimaOffset(snap);
      const d = snap.data();
      const nuova = d.scadenza && typeof d.scadenza.toDate === 'function' ? d.scadenza.toDate() : null;
      const cambiata = (nuova && !scadenza) || (nuova && scadenza && nuova.getTime() !== scadenza.getTime());
      if (nuova) scadenza = nuova;
      tracciaId = d.tracciaId ?? null;
      if (d.consegnato === true) { cambiaStato('consegnato'); return; }
      if (cambiata) { programmaFine(); notifica(); }
    }, () => {}));
    annullaAscolti.push(sdk.onSnapshot(sdk.doc(db, 'verifiche', vid), (snap) => {
      if (snap.exists() && snap.data().stato === 'chiusa' && stato === 'in-corso') cambiaStato('terminata');
    }, () => {}));
  }

  // ── Avvio ───────────────────────────────────────────────────────────────
  // Il primo salvataggio è l'ingresso in verifica (e, a ogni riapertura, serve anche a stimare lo scarto dall'ora del server).
  async function avvia() {
    const l = await lavoro.mio(vid);
    scadenza = l.scadenza;
    tracciaId = l.tracciaId;
    campioni = l.campioni ?? [];
    ultimoCampione = campioni.length ? campioni[campioni.length - 1].t : null;
    if (l.consegnato) { cambiaStato('consegnato'); return stato; }
    if (l.programma) { corrente.programma = l.programma; salvato.hash = l.programmaHash ?? hashProgramma(l.programma); corrente.nBlocchi = l.nBlocchi ?? 0; }
    if (l.esecuzioni) { corrente.esecuzioni = l.esecuzioni; salvato.esecuzioni = l.esecuzioni; }
    ascolta();
    await accoda(() => scriviOra());                        // ingresso
    programmaFine();
    notifica();
    return stato;
  }

  function termina() {
    fermaTimer();
    annullaAscolti.splice(0).forEach((f) => f());
  }

  return {
    avvia, aggiorna, salvaOra, consegna, termina,
    ora, restanteMs,
    stato: () => stato, scadenza: () => scadenza, tracciaId: () => tracciaId, offset: () => offset,
    fermo: () => coda,                                      // si risolve quando le scritture in corso sono finite
    statistiche: () => ({ ...stat }),
  };
}
