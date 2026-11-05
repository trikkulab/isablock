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

  // Applica `dati` alla verifica e, nello STESSO batch, aggiorna i lavori di chi non è ancora entrato:
  // la scadenza si sposta di `delta` ms e, con `traccia`, le tracce vuote («di tutti») diventano quella id.
  // `lavoriNoti` evita di rileggere l'elenco. Restituisce quanti lavori ha toccato.
  async function aggiornaTutto(vid, dati, { delta = 0, traccia = null, lavoriNoti = null } = {}) {
    const elenco = delta || traccia ? (lavoriNoti ?? await lavori.elenca(vid)).filter((l) => !l.entrato) : [];
    const b = sdk.writeBatch(db);
    let toccati = 0;
    for (const l of elenco) {
      const campi = {};
      if (delta && l.scadenza) campi.scadenza = sdk.Timestamp.fromDate(new Date(l.scadenza.getTime() + delta));
      if (traccia && l.tracciaId === null) campi.tracciaId = traccia;
      if (Object.keys(campi).length) { b.update(rifLavoro(vid, l.email), campi); toccati++; }
    }
    b.update(rifVerifica(vid), dati);
    try { await b.commit(); } catch (err) {
      const c = err && err.code;
      if (c === 'permission-denied') throw vuoto('negato', 'Non posso aggiornare la verifica: controlla stato, fine e traccia di default.');
      if (c === 'unavailable' || c === 'deadline-exceeded') throw vuoto('rete', 'Rete non disponibile: riprova tra poco.');
      throw vuoto('altro', 'Qualcosa è andato storto. Riprova.');
    }
    return toccati;
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
    await aggiornaTutto(vid, { fine: sdk.Timestamp.fromDate(nuovaFine) }, { delta });
  }

  // Assegna traccia e/o tempo extra (in minuti, rispetto alla fine prevista) a uno studente, in bozza
  // o a verifica aperta; crea il lavoro se manca. Richiede che la fine prevista sia già impostata.
  // `tracciaId`: non indicato = non si tocca (per un lavoro nuovo: «traccia di tutti»); `null` = «traccia di
  // tutti» (in bozza resta vuota e segue la traccia predefinita; da aperta diventa quella predefinita).
  async function assegna(vid, email, { tracciaId, minutiExtra } = {}) {
    const e = String(email || '').toLowerCase();
    const v = await verifiche.leggi(vid);
    if (v.stato === 'chiusa') throw vuoto('stato', 'La verifica è chiusa.');
    if (!v.fine) throw vuoto('fine', 'Imposta prima la fine prevista della verifica.');
    if (minutiExtra !== undefined && (!Number.isFinite(minutiExtra) || minutiExtra < 0)) throw vuoto('dati', 'I minuti extra devono essere zero o più.');
    const risolta = (t) => (t === null && v.stato === 'aperta' ? v.tracciaDefault : t);
    const esistente = (await lavori.elenca(vid)).find((l) => l.email === e);
    if (!esistente) {
      const t = risolta(tracciaId === undefined ? null : tracciaId);
      if (v.stato === 'aperta' && !t) throw vuoto('traccia', 'Manca la traccia predefinita.');
      const r = await lavori.creaMancanti(vid, [e], {
        tracciaDefault: t, scadenza: new Date(v.fine.getTime() + (minutiExtra ?? 0) * MINUTO),
      });
      if (r.rifiutate.length) throw vuoto('negato', 'Non posso assegnarlo: non è iscritto al corso, o la traccia non esiste.');
      return;
    }
    if (tracciaId !== undefined) {
      const t = risolta(tracciaId);
      if (t !== esistente.tracciaId) await lavori.impostaTraccia(vid, e, t);
    }
    if (minutiExtra !== undefined) await lavori.impostaScadenza(vid, e, new Date(v.fine.getTime() + minutiExtra * MINUTO));
  }

  // ── Apertura ──────────────────────────────────────────────────────────────
  // bozza -> aperta. Crea il lavoro di tutti gli iscritti che non lo hanno (con la traccia «di tutti», cioè
  // vuota), poi in UN batch sposta le scadenze se la fine è cambiata, sostituisce le tracce vuote con quella
  // predefinita e apre. Da aperta le tracce sono tutte esplicite. Si ferma se una traccia assegnata a mano non
  // esiste più. Se qualcosa non va non resta niente a metà: i lavori creati sono innocui e riprovando non si
  // duplicano né si spostano due volte.
  async function apri(vid, { fine, tracciaDefault } = {}) {
    const v = await verifiche.leggi(vid);
    if (v.stato !== 'bozza') throw vuoto('stato', 'Si apre solo una verifica in bozza (una chiusa si riapre).');
    const nuovaFine = fine ?? v.fine;
    if (!valida(nuovaFine) || !(nuovaFine.getTime() > Date.now())) throw vuoto('fine', 'Indica una fine prevista nel futuro.');
    const traccia = tracciaDefault ?? v.tracciaDefault;
    if (!traccia) throw vuoto('traccia', 'Scegli la traccia di default.');
    const esistenti = new Set((await verifiche.tracce(vid)).map((t) => t.id));
    if (!esistenti.has(traccia)) throw vuoto('traccia', 'La traccia di default non esiste.');
    const iscritti = await corsi.iscritti(v.corsoId);
    // I lavori nuovi nascono «di tutti» e alla vecchia fine (se c'era): il batch sposta poi tutti insieme.
    const base = v.fine ?? nuovaFine;
    const creazione = await lavori.creaMancanti(vid, iscritti, { tracciaDefault: null, scadenza: base });
    const attuali = await lavori.elenca(vid);
    const rotte = attuali.filter((l) => l.tracciaId !== null && !esistenti.has(l.tracciaId));
    if (rotte.length) {
      throw vuoto('traccia', rotte.length === 1
        ? 'La traccia assegnata a 1 studente non esiste più: riassegnala prima di aprire.'
        : `La traccia assegnata a ${rotte.length} studenti non esiste più: riassegnala prima di aprire.`);
    }
    await aggiornaTutto(vid, {
      stato: 'aperta', apertaIl: sdk.serverTimestamp(), fine: sdk.Timestamp.fromDate(nuovaFine), tracciaDefault: traccia,
    }, { delta: nuovaFine.getTime() - base.getTime(), traccia, lavoriNoti: attuali });
    return { iscritti: iscritti.length, create: creazione.create.length, rifiutate: creazione.rifiutate };
  }

  // Iscritti arrivati dopo l'apertura (o dopo l'assegnazione): crea il lavoro di chi manca, con la
  // fine prevista della verifica e la traccia di default.
  async function aggiungiIscritti(vid) {
    const v = await verifiche.leggi(vid);
    if (v.stato === 'chiusa') throw vuoto('stato', 'La verifica è chiusa.');
    if (!v.fine) throw vuoto('fine', 'Servono la fine prevista della verifica.');
    if (v.stato === 'aperta' && !v.tracciaDefault) throw vuoto('traccia', 'Manca la traccia di default.');
    // in bozza i nuovi seguono «la traccia di tutti» (vuota); da aperta quella predefinita, esplicita
    const r = await lavori.creaMancanti(vid, await corsi.iscritti(v.corsoId), {
      tracciaDefault: v.stato === 'bozza' ? null : v.tracciaDefault, scadenza: v.fine,
    });
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

  // Archivia una verifica CHIUSA (la nasconde dall'elenco del docente; gli studenti vedono ancora la propria consegna)
  // o la ripristina. Le verifiche aperte si chiudono prima; una archiviata non si riapre finché non si ripristina.
  async function archivia(vid, archiviata = true) {
    const v = await verifiche.leggi(vid);
    if (v.stato !== 'chiusa') throw vuoto('stato', 'Si archivia solo una verifica chiusa.');
    await verifiche.archivia(vid, archiviata);
  }

  // Cosa mostrare nella conferma di apertura: quanti studenti, le tracce, e chi ha una traccia o un tempo diversi.
  async function riepilogoApertura(vid) {
    const { verifica, tracce, righe } = await assegnazioni(vid);
    const predefinita = tracce.find((t) => t.id === verifica.tracciaDefault) ?? null;
    const diversi = righe.filter((r) => r.assegnato && ((r.tracciaId !== null && r.tracciaId !== verifica.tracciaDefault) || r.extraMinuti > 0)).length;
    return { titolo: verifica.titolo, iscritti: righe.length, tracce: tracce.length, tracciaPredefinita: predefinita?.titolo ?? null, diversi };
  }

  // Raccolta (a verifica chiusa): rilanciabile.
  async function raccogli(vid) {
    const v = await verifiche.leggi(vid);
    if (v.stato !== 'chiusa') throw vuoto('stato', 'Si raccoglie a verifica chiusa.');
    return consegne.raccogli(vid, await lavori.elenca(vid));
  }

  // chiusa -> aperta, PER TUTTI, in un solo batch atomico con la verifica:
  //   - la scadenza di ognuno diventa la nuova fine più il suo tempo in più (scadenza − vecchia fine, mai negativo);
  //   - chi aveva consegnato torna a poter lavorare (`consegnato` falso) e riconsegna: la consegna di prima resta.
  // Restituisce quanti lavori ha sbloccato.
  async function riapri(vid, { fine } = {}) {
    const v = await verifiche.leggi(vid);
    if (v.stato !== 'chiusa') throw vuoto('stato', 'Si riapre solo una verifica chiusa.');
    if (v.archiviata) throw vuoto('stato', 'La verifica è archiviata: ripristinala prima di riaprirla.');
    const nuovaFine = fine ?? v.fine;
    if (!valida(nuovaFine)) throw vuoto('fine', 'Indica una fine prevista.');
    const b = sdk.writeBatch(db);
    let sbloccati = 0;
    for (const l of await lavori.elenca(vid)) {
      const extra = l.scadenza && v.fine ? Math.max(0, l.scadenza.getTime() - v.fine.getTime()) : 0;
      const campi = { scadenza: sdk.Timestamp.fromDate(new Date(nuovaFine.getTime() + extra)) };
      if (l.consegnato) { campi.consegnato = false; sbloccati++; }
      b.update(rifLavoro(vid, l.email), campi);
    }
    b.update(rifVerifica(vid), { stato: 'aperta', apertaIl: sdk.serverTimestamp(), fine: sdk.Timestamp.fromDate(nuovaFine) });
    try { await b.commit(); } catch (err) {
      const c = err && err.code;
      if (c === 'permission-denied') throw vuoto('negato', 'Non posso riaprire la verifica.');
      if (c === 'unavailable' || c === 'deadline-exceeded') throw vuoto('rete', 'Rete non disponibile: riprova tra poco.');
      throw vuoto('altro', 'Qualcosa è andato storto. Riprova.');
    }
    return { sbloccati };
  }

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

  // ── Tracce, «per tutti» ed eliminazioni (bozza) ───────────────────────────
  // Le email di chi ha la traccia assegnata a mano (chi segue «di tutti» non conta). Serve a dire PRIMA di chiedere
  // conferma che una traccia non si può eliminare.
  async function studentiConTraccia(vid, tid) {
    return (await lavori.elenca(vid)).filter((l) => l.tracciaId === tid).map((l) => l.email);
  }

  // Elimina una traccia: non si può se è assegnata a mano a qualcuno (il messaggio dice quanti). Se era quella di
  // tutti, la traccia di tutti passa alla prima rimasta (o a nessuna: senza, non si apre).
  async function eliminaTraccia(vid, tid) {
    const v = await verifiche.leggi(vid);
    const usate = (await studentiConTraccia(vid, tid)).map((email) => ({ email }));
    if (usate.length) {
      const errore = vuoto('assegnata', usate.length === 1
        ? '1 studente ha questa traccia: riassegnalo prima.'
        : `${usate.length} studenti hanno questa traccia: riassegnali prima.`);
      errore.studenti = usate.map((l) => l.email);
      throw errore;
    }
    await verifiche.eliminaTraccia(vid, tid);
    if (v.tracciaDefault === tid) {
      const resto = await verifiche.tracce(vid);
      await verifiche.modifica(vid, { tracciaDefault: resto[0]?.id ?? null });
    }
  }

  // Cosa succede se `tid` diventa la traccia di tutti: quanti l'hanno già assegnata a mano (e la tengono) e quanti
  // studenti, invece, la riceveranno perché seguono «la traccia di tutti». Serve all'avviso della stella.
  async function impattoUsaPerTutti(vid, tid) {
    const v = await verifiche.leggi(vid);
    const [elencoLavori, iscritti] = await Promise.all([lavori.elenca(vid), corsi.iscritti(v.corsoId)]);
    const amano = elencoLavori.filter((l) => l.tracciaId === tid).length;
    const esplicite = elencoLavori.filter((l) => l.tracciaId !== null).length;
    return { amano, riceveranno: Math.max(0, iscritti.length - esplicite) };
  }

  const impostaTracciaDefault = (vid, tid) => verifiche.modifica(vid, { tracciaDefault: tid });

  // Quanto verrebbe tolto eliminando una verifica (per la conferma): le sue tracce e le assegnazioni degli studenti.
  async function riepilogoEliminazione(vid) {
    const [t, l] = await Promise.all([verifiche.tracce(vid), lavori.elenca(vid)]);
    return { tracce: t.length, assegnazioni: l.length };
  }

  // Elimina una verifica in bozza: prima le assegnazioni (altrimenti, tolta la verifica, nessuno potrebbe più
  // cancellarle e resterebbero orfane), poi le tracce, poi la verifica. Le verifiche aperte o chiuse non si eliminano.
  async function eliminaVerifica(vid) {
    const v = await verifiche.leggi(vid);
    if (v.stato !== 'bozza') throw vuoto('stato', 'Si elimina solo una verifica in bozza: una aperta o chiusa si conserva (e, da chiusa, si archivia).');
    for (const l of await lavori.elenca(vid)) await lavori.togli(vid, l.email);
    await verifiche.elimina(vid);
  }

  // Una riga per iscritto (e per chi ha il lavoro anche se non è più iscritto), per la tabella delle assegnazioni.
  // `tracciaId` null = «traccia di tutti»; `extraMinuti` = scadenza personale meno la fine prevista.
  async function assegnazioni(vid) {
    const [verifica, tracce, elencoLavori] = await Promise.all([verifiche.leggi(vid), verifiche.tracce(vid), lavori.elenca(vid)]);
    const iscritti = await corsi.iscritti(verifica.corsoId);
    const per = new Map(elencoLavori.map((l) => [l.email, l]));
    const emails = [...new Set([...iscritti, ...elencoLavori.map((l) => l.email)])].sort((a, b) => a.localeCompare(b, 'it'));
    const righe = emails.map((email) => {
      const l = per.get(email) ?? null;
      const extraMinuti = l && l.scadenza && verifica.fine ? Math.round((l.scadenza.getTime() - verifica.fine.getTime()) / MINUTO) : 0;
      return { email, assegnato: !!l, tracciaId: l ? l.tracciaId : null, extraMinuti, entrato: !!(l && l.entrato), consegnato: !!(l && l.consegnato) };
    });
    return { verifica, tracce, righe };
  }

  return {
    // pezzi di base, se servono alla UI
    verifiche, lavori, consegne,
    // operazioni composte
    crea, cambiaFine, assegna, apri, aggiungiIscritti, tempoAggiuntivo, chiudi, raccogli, riapri, caricaFile, situazione,
    archivia, riepilogoApertura, eliminaTraccia, studentiConTraccia, impattoUsaPerTutti, impostaTracciaDefault, riepilogoEliminazione, eliminaVerifica, assegnazioni,
  };
}
