// Tabella live del docente: dai lavori degli studenti alle righe da mostrare (nessuna interfaccia, nessun database).
// Funzioni pure: l'ora è sempre un argomento (ora del SERVER stimata), così si provano con un orologio finto.
import { verificaConfig } from './verifica-config.js';

const C = verificaConfig.client;
const MINUTO = 60_000;

export const STATI_RIGA = Object.freeze({
  'non-entrato': 'Non entrato',
  scrive: 'Scrive',
  'ha-eseguito': 'Ha eseguito',
  errore: 'Errore',
  consegnato: 'Consegnato',
});

// Ora del server vista dal PC del docente. Ogni segnale appena arrivato dal server (`ultimoSegnale` = ora del server
// alla scrittura) dice che il server è almeno a quell'ora: la stima è lo scarto più grande osservato, cioè quello
// con la latenza minore. Se il PC va avanti di 5 minuti il segnale sembra «vecchio» solo finché non arriva il primo.
export function creaStimaOra({ adesso = Date.now } = {}) {
  let scarto = 0;
  let osservato = false;
  return {
    // `segnaleMs`: ultimoSegnale di un documento appena giunto dal server (non dalla copia locale).
    osserva(segnaleMs) {
      if (!Number.isFinite(segnaleMs)) return;
      const s = segnaleMs - adesso();
      if (!osservato || s > scarto) { scarto = s; osservato = true; }
    },
    ora: () => adesso() + scarto,
    scarto: () => scarto,
  };
}

// Quanti blocchi ha un programma (JSON del file, come testo), senza contare il contenitore INIZIO/FINE: lo stesso numero
// che l'editor comunica al salvataggio (`getAllBlocks` meno `program`). Serve dove c'è solo il programma e non il conteggio,
// per esempio nella consegna. null se il testo non si legge. Memorizzato: la tabella si ridisegna ogni secondo.
const conteggi = new Map();
export function contaBlocchi(programma) {
  if (typeof programma !== 'string' || programma === '') return null;
  if (conteggi.has(programma)) return conteggi.get(programma);
  let n = null;
  try {
    const stato = JSON.parse(programma);
    n = 0;
    // un blocco ha `type`; i figli stanno negli ingressi (`inputs.X.block` o `.shadow`) e nel blocco successivo (`next.block`)
    const visita = (b) => {
      while (b && typeof b === 'object') {
        if (typeof b.type === 'string' && b.type !== 'program') n++;
        for (const ingresso of Object.values(b.inputs ?? {})) { visita(ingresso?.block); visita(ingresso?.shadow); }
        b = b.next?.block;
      }
    };
    for (const radice of stato?.blocks?.blocks ?? []) visita(radice);
  } catch { n = null; }
  if (conteggi.size >= 200) conteggi.clear();
  conteggi.set(programma, n);
  return n;
}

// Incremento dei blocchi nella finestra: blocchi di adesso meno quelli del campione più vecchio dentro la finestra.
// null se non c'è nessun campione utile (o se non si conoscono i blocchi attuali).
export function incrementoBlocchi({ nBlocchi, campioni = [], ora, finestraMin = C.finestraIncrementoMin }) {
  if (nBlocchi === null || nBlocchi === undefined) return null;
  const da = ora - finestraMin * MINUTO;
  const nella = campioni.filter((c) => c && c.t >= da && c.t <= ora);
  if (nella.length === 0) return null;
  return nBlocchi - nella.reduce((m, c) => (c.t < m.t ? c : m)).n;
}

// Salto sospetto: tra due campioni consecutivi (l'ultimo è il valore attuale) i blocchi sono aumentati di `soglia` o più.
// Tipico di un programma incollato in una volta. Restituisce il salto più grande o 0.
export function saltoBlocchi({ nBlocchi, campioni = [], soglia = C.saltoBlocchi }) {
  const serie = campioni.filter(Boolean).sort((a, b) => a.t - b.t).map((c) => c.n);
  if (nBlocchi !== null && nBlocchi !== undefined) serie.push(nBlocchi);
  let massimo = 0;
  for (let i = 1; i < serie.length; i++) massimo = Math.max(massimo, serie[i] - serie[i - 1]);
  return massimo >= soglia ? massimo : 0;
}

// Lo studente può lavorare adesso: a verifica aperta sì; a verifica chiusa solo se il docente lo ha riaperto da solo e il
// suo tempo (più la grazia) non è finito. Dopo, per la tabella la sua verifica è chiusa come quella degli altri.
export function lavoraAdesso(verifica, lavoro, ora) {
  if (verifica.stato === 'aperta') return true;
  return verifica.stato === 'chiusa' && lavoro.riaperto === true && !!lavoro.scadenza
    && lavoro.scadenza.getTime() + verificaConfig.regole.graziaSecondi * 1000 > ora;
}

export function statoRiga(lavoro, ultimaConsegna) {
  if (lavoro.consegnato || ultimaConsegna) return 'consegnato';
  if (!lavoro.entrato) return 'non-entrato';
  const e = lavoro.esecuzioni;
  if (e && e.n > 0) return e.esito === 'errore' ? 'errore' : 'ha-eseguito';
  return 'scrive';
}

// Timer di uno studente: millisecondi rimasti e colore (verde/giallo/rosso). Niente timer per chi ha consegnato,
// per chi non ha scadenza o a verifica non aperta.
export function timerRiga({ lavoro, verifica, ora, consegnato }) {
  if (consegnato || !lavoraAdesso(verifica, lavoro, ora) || !lavoro.scadenza) return null;
  const restante = lavoro.scadenza.getTime() - ora;
  const inizio = verifica.apertaIl ? verifica.apertaIl.getTime() : (lavoro.entrato ? lavoro.entrato.getTime() : null);
  const totale = inizio === null ? null : lavoro.scadenza.getTime() - inizio;
  let colore = 'verde';
  if (restante <= C.timerRossoMs) colore = 'rosso';
  else if (totale !== null && totale > 0 && restante < totale * C.timerGialloFrazione) colore = 'giallo';
  return { restante, colore };
}

// Connessione: 'online', 'offline' (con da quanti ms), o null se non ha senso (non entrato, consegnato, verifica non aperta).
export function connessioneRiga({ lavoro, verifica, ora, consegnato }) {
  if (consegnato || !lavoraAdesso(verifica, lavoro, ora) || !lavoro.entrato || !lavoro.ultimoSegnale) return null;
  const da = ora - lavoro.ultimoSegnale.getTime();
  return da > C.offlineDocenteMs ? { stato: 'offline', da: Math.max(0, da) } : { stato: 'online', da: Math.max(0, da) };
}

export function costruisciRighe({ verifica, lavori, ultime = {}, ora }) {
  return lavori.map((lavoro) => {
    // A verifica APERTA conta solo il lavoro: dopo una riapertura le consegne di prima esistono ancora, ma lo studente
    // sta lavorando di nuovo (`consegnato` è tornato falso). A verifica chiusa la consegna (anche raccolta) fa fede.
    const lavora = lavoraAdesso(verifica, lavoro, ora);
    const consegna = lavoro.consegnato || !lavora ? (ultime[lavoro.email] ?? null) : null;
    const consegnato = lavoro.consegnato || !!consegna;
    // A verifica CHIUSA i blocchi sono quelli della consegna valida (anche caricata da file, quando il lavoro sul server è
    // vecchio o vuoto); la variazione degli ultimi minuti non ha più senso.
    const daConsegna = verifica.stato === 'chiusa' && !lavora && consegna && consegna.programma ? contaBlocchi(consegna.programma) : null;
    return {
      email: lavoro.email,
      nome: lavoro.studenteNome,
      stato: statoRiga(lavoro, consegna),
      nBlocchi: daConsegna ?? lavoro.nBlocchi,
      incremento: daConsegna !== null ? null : incrementoBlocchi({ nBlocchi: lavoro.nBlocchi, campioni: lavoro.campioni, ora }),
      salto: saltoBlocchi({ nBlocchi: lavoro.nBlocchi, campioni: lavoro.campioni }),
      esecuzioni: lavoro.esecuzioni && lavoro.esecuzioni.n > 0 ? { n: lavoro.esecuzioni.n, esito: lavoro.esecuzioni.esito ?? null } : null,
      riaperto: verifica.stato === 'chiusa' && lavora,      // sbloccato da solo e al lavoro adesso
      timer: timerRiga({ lavoro, verifica, ora, consegnato }),
      connessione: connessioneRiga({ lavoro, verifica, ora, consegnato }),
      doppiaSessione: lavoro.doppiaSessione > 0,
      versioneConsegna: consegna ? consegna.versione : null,
      origineConsegna: consegna ? consegna.origine : null,
    };
  });
}

export function riepilogo(righe) {
  const conta = (f) => righe.filter(f).length;
  return {
    totale: righe.length,
    entrati: conta((r) => r.stato !== 'non-entrato'),
    consegnati: conta((r) => r.stato === 'consegnato'),
    offline: conta((r) => r.connessione && r.connessione.stato === 'offline'),
    conSalto: conta((r) => r.salto > 0),
    doppie: conta((r) => r.doppiaSessione),
  };
}

// Ordine delle righe: prima chi richiede attenzione (offline, salto, errore), poi per cognome/email.
const peso = (r) => (r.doppiaSessione ? -1 : r.connessione && r.connessione.stato === 'offline' ? 0 : r.salto > 0 ? 1 : r.stato === 'errore' ? 2 : 3);
export function ordinaRighe(righe, modo = 'email') {
  const perEmail = (a, b) => a.email.localeCompare(b.email, 'it');
  if (modo === 'attenzione') return [...righe].sort((a, b) => peso(a) - peso(b) || perEmail(a, b));
  return [...righe].sort(perEmail);
}

export function testoDurata(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const due = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${due(m)}:${due(ss)}` : `${m}:${due(ss)}`;
}

// Stima del consumo di questa verifica (letture e scritture del database), dai coefficienti di verifica-config.js
// (`stimaConsumi`). Si basa su quanti sono iscritti, quanti sono entrati e per quanti minuti ognuno ha lavorato (fino alla
// consegna, o alla scadenza personale, o a ora). Null se la verifica è ancora una bozza. Pura: `ora` è un argomento.
export function stimaConsumi({ verifica, lavori, ora, config = C.stimaConsumi }) {
  if (!config || verifica.stato === 'bozza') return null;
  const entrati = lavori.filter((l) => l.entrato);
  let minutiStudente = 0;
  for (const l of entrati) {
    const fermo = l.consegnato || !lavoraAdesso(verifica, l, ora);
    const fine = fermo ? (l.ultimoSegnale ? l.ultimoSegnale.getTime() : ora) : Math.min(ora, l.scadenza ? l.scadenza.getTime() : ora);
    minutiStudente += Math.max(0, (fine - l.entrato.getTime()) / MINUTO);
  }
  const letture = config.ingresso * entrati.length + config.perIscritto * lavori.length
    + minutiStudente * (config.perStudenteMinuto + config.perDocenteStudenteMinuto * config.docentiAperti);
  const scritture = config.scrittureStudenteMinuto * minutiStudente + config.scrittureIscritto * lavori.length + entrati.length;
  const frazione = (n, quota) => (quota ? n / quota : null);
  const fL = frazione(letture, config.quotaLetture);
  const fS = frazione(scritture, config.quotaScritture);
  const peggiore = Math.max(fL ?? 0, fS ?? 0);
  const livello = peggiore >= config.sogliaRossa ? 'rosso' : peggiore >= config.sogliaGialla ? 'giallo' : 'ok';
  return { letture: Math.round(letture), scritture: Math.round(scritture), frazioneLetture: fL, frazioneScritture: fS, livello, minutiStudente };
}
