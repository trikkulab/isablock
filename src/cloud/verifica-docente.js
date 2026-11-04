// Le operazioni del docente su una verifica, composte dai moduli di dati (nessuna interfaccia):
// verifiche.js (verifica e tracce), lavori.js (traccia e scadenza di ogni studente) e
// consegne.js (raccolta e file di emergenza), più l'elenco degli iscritti del corso.
//
// Ciclo di vita:  crea (bozza, con la fine prevista) -> tracce -> assegna (facoltativo) -> apri
//                 -> [tempo aggiuntivo, iscritti tardivi] -> chiudi (+ raccogli) -> [riapri]
//
// Fine prevista e scadenze personali: la scadenza di ogni studente è un timestamp assoluto nel suo
// lavoro. In bozza è «fine + minuti extra»; se la fine cambia prima dell'apertura, TUTTE le
// scadenze di chi non è entrato si spostano della stessa differenza, extra compresi, in un unico
// batch insieme alla modifica della verifica (o stanno tutte al vecchio valore o tutte al nuovo).
// Nessun «motivo» del tempo aggiuntivo viene mai scritto da nessuna parte.
import { creaVerifiche, ErroreVerifica } from './verifiche.js';
import { creaLavoriDocente } from './lavori.js';
import { creaConsegneDocente } from './consegne.js';
import { creaGestione } from './gestione-corsi.js';

const MINUTO = 60_000;

export function creaVerificaDocente({ sdk, db }, emailDocente) {
  const verifiche = creaVerifiche({ sdk, db }, emailDocente);
  const lavori = creaLavoriDocente({ sdk, db });
  const consegne = creaConsegneDocente({ sdk, db }, emailDocente);
  const corsi = creaGestione({ sdk, db }, emailDocente);
  const rifVerifica = (vid) => sdk.doc(db, 'verifiche', vid);
  const rifLavoro = (vid, email) => sdk.doc(db, 'verifiche', vid, 'lavori', email);

  const valida = (d) => d instanceof Date && !Number.isNaN(d.getTime());
  const vuoto = (codice, msg) => new ErroreVerifica(codice, msg);

  // Sposta di `delta` ms la scadenza di chi non è ancora entrato e applica `dati` alla verifica,
  // tutto in un batch. Restituisce quanti lavori ha spostato.
  async function spostaEAggiorna(vid, delta, dati) {
    const elenco = delta ? (await lavori.elenca(vid)).filter((l) => !l.entrato && l.scadenza) : [];
    const b = sdk.writeBatch(db);
    for (const l of elenco) {
      b.update(rifLavoro(vid, l.email), { scadenza: sdk.Timestamp.fromDate(new Date(l.scadenza.getTime() + delta)) });
    }
    b.update(rifVerifica(vid), dati);
    try { await b.commit(); } catch (err) {
      const c = err && err.code;
      if (c === 'permission-denied') throw vuoto('negato', 'Non posso aggiornare la verifica: controlla stato, fine e traccia di default.');
      if (c === 'unavailable' || c === 'deadline-exceeded') throw vuoto('rete', 'Rete non disponibile: riprova tra poco.');
      throw vuoto('altro', 'Qualcosa è andato storto. Riprova.');
    }
    return elenco.length;
  }

  // ── Creazione e preparazione (bozza) ──────────────────────────────────────
  async function crea(corsoId, { titolo, fine }) {
    if (fine !== undefined && fine !== null && !valida(fine)) throw vuoto('fine', 'La fine prevista non è una data valida.');
    const v = await verifiche.crea(corsoId, { titolo });
    if (fine) await verifiche.modifica(v.id, { fine });
    return verifiche.leggi(v.id);
  }

  // Cambia la fine prevista. In bozza sposta con sé le scadenze di chi non è entrato
  // (extra compresi); da aperta cambia solo il default (le scadenze personali restano).
  async function cambiaFine(vid, nuovaFine) {
    if (!valida(nuovaFine)) throw vuoto('fine', 'La fine prevista non è una data valida.');
    const v = await verifiche.leggi(vid);
    if (v.stato === 'chiusa') throw vuoto('stato', 'La verifica è chiusa: per dare tempo si riapre o si cambia la scadenza di uno studente.');
    if (v.stato === 'aperta' && !(nuovaFine.getTime() > Date.now())) throw vuoto('fine', 'La nuova fine deve essere nel futuro.');
    const delta = v.stato === 'bozza' && v.fine ? nuovaFine.getTime() - v.fine.getTime() : 0;
    await spostaEAggiorna(vid, delta, { fine: sdk.Timestamp.fromDate(nuovaFine) });
  }

  // Assegna traccia e/o tempo extra (in minuti, rispetto alla fine prevista) a uno studente, in bozza
  // o a verifica aperta; crea il lavoro se manca. Richiede che la fine prevista sia già impostata.
  async function assegna(vid, email, { tracciaId, minutiExtra } = {}) {
    const e = String(email || '').toLowerCase();
    const v = await verifiche.leggi(vid);
    if (v.stato === 'chiusa') throw vuoto('stato', 'La verifica è chiusa.');
    if (!v.fine) throw vuoto('fine', 'Imposta prima la fine prevista della verifica.');
    if (minutiExtra !== undefined && (!Number.isFinite(minutiExtra) || minutiExtra < 0)) throw vuoto('dati', 'I minuti extra devono essere zero o più.');
    const esistente = (await lavori.elenca(vid)).find((l) => l.email === e);
    if (!esistente) {
      const t = tracciaId ?? v.tracciaDefault;
      if (!t) throw vuoto('traccia', 'Scegli la traccia.');
      const r = await lavori.creaMancanti(vid, [e], {
        tracciaDefault: t, scadenza: new Date(v.fine.getTime() + (minutiExtra ?? 0) * MINUTO),
      });
      if (r.rifiutate.length) throw vuoto('negato', 'Non posso assegnarlo: non è iscritto al corso, o la traccia non esiste.');
      return;
    }
    if (tracciaId !== undefined && tracciaId !== esistente.tracciaId) await lavori.impostaTraccia(vid, e, tracciaId);
    if (minutiExtra !== undefined) await lavori.impostaScadenza(vid, e, new Date(v.fine.getTime() + minutiExtra * MINUTO));
  }

  // ── Apertura ──────────────────────────────────────────────────────────────
  // bozza -> aperta. Crea il lavoro di tutti gli iscritti che non lo hanno (con la traccia di default),
  // poi, in un batch solo, sposta le scadenze se la fine è cambiata e apre. Se qualcosa non va non resta
  // niente a metà: i lavori creati sono innocui e riprovando non si duplicano né si spostano due volte.
  async function apri(vid, { fine, tracciaDefault } = {}) {
    const v = await verifiche.leggi(vid);
    if (v.stato !== 'bozza') throw vuoto('stato', 'Si apre solo una verifica in bozza (una chiusa si riapre).');
    const nuovaFine = fine ?? v.fine;
    if (!valida(nuovaFine) || !(nuovaFine.getTime() > Date.now())) throw vuoto('fine', 'Indica una fine prevista nel futuro.');
    const traccia = tracciaDefault ?? v.tracciaDefault;
    if (!traccia) throw vuoto('traccia', 'Scegli la traccia di default.');
    if (!(await verifiche.tracce(vid)).some((t) => t.id === traccia)) throw vuoto('traccia', 'La traccia di default non esiste.');
    const iscritti = await corsi.iscritti(v.corsoId);
    // I lavori nuovi nascono alla vecchia fine (se c'era): il batch sposta poi tutti insieme.
    const base = v.fine ?? nuovaFine;
    const creazione = await lavori.creaMancanti(vid, iscritti, { tracciaDefault: traccia, scadenza: base });
    const delta = nuovaFine.getTime() - base.getTime();
    await spostaEAggiorna(vid, delta, {
      stato: 'aperta', apertaIl: sdk.serverTimestamp(), fine: sdk.Timestamp.fromDate(nuovaFine), tracciaDefault: traccia,
    });
    return { iscritti: iscritti.length, create: creazione.create.length, rifiutate: creazione.rifiutate };
  }

  // Iscritti arrivati dopo l'apertura (o dopo l'assegnazione): crea il lavoro di chi manca, con la
  // fine prevista della verifica e la traccia di default.
  async function aggiungiIscritti(vid) {
    const v = await verifiche.leggi(vid);
    if (v.stato === 'chiusa') throw vuoto('stato', 'La verifica è chiusa.');
    if (!v.fine || !v.tracciaDefault) throw vuoto('fine', 'Servono fine prevista e traccia di default.');
    const r = await lavori.creaMancanti(vid, await corsi.iscritti(v.corsoId), { tracciaDefault: v.tracciaDefault, scadenza: v.fine });
    return { create: r.create, rifiutate: r.rifiutate };
  }

  // ── Durante e dopo ────────────────────────────────────────────────────────
  // Tempo aggiuntivo a uno studente: sposta la sua scadenza (anche all'indietro, con minuti negativi).
  const tempoAggiuntivo = (vid, email, minuti) => lavori.aggiungiMinuti(vid, email, minuti);

  // aperta -> chiusa. Con `raccogli: true` raccoglie subito. Restituisce l'esito della raccolta (o null).
  async function chiudi(vid, { raccogli = false } = {}) {
    await verifiche.chiudi(vid);
    return raccogli ? consegne.raccogli(vid, await lavori.elenca(vid)) : null;
  }

  // Raccolta (a verifica chiusa): rilanciabile.
  async function raccogli(vid) {
    const v = await verifiche.leggi(vid);
    if (v.stato !== 'chiusa') throw vuoto('stato', 'Si raccoglie a verifica chiusa.');
    return consegne.raccogli(vid, await lavori.elenca(vid));
  }

  // chiusa -> aperta. Le scadenze personali restano quelle che sono: per chi ne ha bisogno si usa tempoAggiuntivo.
  const riapri = (vid, opzioni) => verifiche.riapri(vid, opzioni);

  // Carica il file di emergenza di uno studente (a verifica chiusa) come nuova versione.
  async function caricaFile(vid, email, file) {
    const e = String(email || '').toLowerCase();
    const lavoro = (await lavori.elenca(vid)).find((l) => l.email === e);
    if (!lavoro) throw vuoto('assente', 'Questo studente non ha il lavoro per la verifica.');
    return consegne.caricaFile(vid, lavoro, file);
  }

  // Tutto ciò che serve alla tabella del docente, in tre letture.
  async function situazione(vid) {
    const [verifica, elencoLavori, elencoConsegne] = await Promise.all([verifiche.leggi(vid), lavori.elenca(vid), consegne.elenca(vid)]);
    return { verifica, lavori: elencoLavori, consegne: elencoConsegne, ultime: consegne.ultimePerStudente(elencoConsegne) };
  }

  return {
    // pezzi di base, se servono alla UI
    verifiche, lavori, consegne,
    // operazioni composte
    crea, cambiaFine, assegna, apri, aggiungiIscritti, tempoAggiuntivo, chiudi, raccogli, riapri, caricaFile, situazione,
  };
}
