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
  if (consegnato || verifica.stato !== 'aperta' || !lavoro.scadenza) return null;
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
  if (consegnato || verifica.stato !== 'aperta' || !lavoro.entrato || !lavoro.ultimoSegnale) return null;
  const da = ora - lavoro.ultimoSegnale.getTime();
  return da > C.offlineDocenteMs ? { stato: 'offline', da: Math.max(0, da) } : { stato: 'online', da: Math.max(0, da) };
}

export function costruisciRighe({ verifica, lavori, ultime = {}, ora }) {
  return lavori.map((lavoro) => {
    const consegna = ultime[lavoro.email] ?? null;
    const consegnato = lavoro.consegnato || !!consegna;
    return {
      email: lavoro.email,
      nome: lavoro.studenteNome,
      stato: statoRiga(lavoro, consegna),
      nBlocchi: lavoro.nBlocchi,
      incremento: incrementoBlocchi({ nBlocchi: lavoro.nBlocchi, campioni: lavoro.campioni, ora }),
      salto: saltoBlocchi({ nBlocchi: lavoro.nBlocchi, campioni: lavoro.campioni }),
      esecuzioni: lavoro.esecuzioni && lavoro.esecuzioni.n > 0 ? { n: lavoro.esecuzioni.n, esito: lavoro.esecuzioni.esito ?? null } : null,
      timer: timerRiga({ lavoro, verifica, ora, consegnato }),
      connessione: connessioneRiga({ lavoro, verifica, ora, consegnato }),
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
  };
}

// Ordine delle righe: prima chi richiede attenzione (offline, salto, errore), poi per cognome/email.
const peso = (r) => (r.connessione && r.connessione.stato === 'offline' ? 0 : r.salto > 0 ? 1 : r.stato === 'errore' ? 2 : 3);
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
