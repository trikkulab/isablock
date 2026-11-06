// Verifiche e tracce: accesso ai dati (nessuna interfaccia). Cosa è permesso lo
// decidono le REGOLE (firestore.rules.template); qui si controlla in anticipo per
// dare messaggi chiari. Una verifica nasce in BOZZA, si apre, si chiude e si può
// riaprire; le tracce si scrivono con calma in bozza e lo studente le legge solo
// a verifica aperta (e solo quella che gli è assegnata, vedi i lavori).
// I limiti stanno in verifica-config.js (sezione `regole`), gli stessi delle regole.
import { verificaConfig } from './verifica-config.js';

const L = verificaConfig.regole;

export class ErroreVerifica extends Error {
  constructor(codice, messaggio) {
    super(messaggio);
    this.name = 'ErroreVerifica';
    this.codice = codice;
  }
}

function traduci(err, permessoNegato = 'Operazione non consentita.') {
  if (err instanceof ErroreVerifica) return err;
  const codice = err && err.code;
  if (codice === 'permission-denied') return new ErroreVerifica('negato', permessoNegato);
  if (codice === 'unavailable' || codice === 'deadline-exceeded') {
    return new ErroreVerifica('rete', 'Rete non disponibile: riprova tra poco.');
  }
  return new ErroreVerifica('altro', 'Qualcosa è andato storto. Riprova.');
}

const testo = (v, max, etichetta) => {
  const t = String(v ?? '').trim();
  if (!t) throw new ErroreVerifica('dati', `Scrivi ${etichetta}.`);
  if (t.length > max) throw new ErroreVerifica('dati', `${etichetta[0].toUpperCase()}${etichetta.slice(1)}: al massimo ${max} caratteri.`);
  return t;
};

export const idTraccia = (n) => `t${n}`;
export const numeroTraccia = (id) => Number(String(id).slice(1));

export function verificaDaDocumento(snap) {
  const d = snap.data();
  return {
    id: snap.id,
    corsoId: d.corsoId,
    titolo: d.titolo,
    stato: d.stato,
    fine: d.fine ? d.fine.toDate() : null,
    tracciaDefault: d.tracciaDefault ?? null,
    creataDa: d.creataDa,
    creato: d.creato ? d.creato.toDate() : null,
    apertaIl: d.apertaIl ? d.apertaIl.toDate() : null,
    chiusaIl: d.chiusaIl ? d.chiusaIl.toDate() : null,
    archiviata: d.archiviata === true,
  };
}

function tracciaDaDocumento(snap) {
  const d = snap.data();
  return {
    id: snap.id,
    numero: numeroTraccia(snap.id),
    titolo: d.titolo,
    testoMd: d.testoMd,
    rev: d.rev,
    modificato: d.modificato ? d.modificato.toDate() : null,
  };
}

const perNumero = (a, b) => a.numero - b.numero;

export function creaVerifiche({ sdk, db }, emailUtente) {
  const mia = String(emailUtente || '').toLowerCase();
  const docVerifica = (vid) => sdk.doc(db, 'verifiche', vid);
  const docTraccia = (vid, tid) => sdk.doc(db, 'verifiche', vid, 'tracce', tid);
  const colTracce = (vid) => sdk.collection(db, 'verifiche', vid, 'tracce');

  // --- Verifiche (docente) ---
  async function crea(corsoId, { titolo }) {
    const t = testo(titolo, L.maxTitoloVerifica, 'il titolo della verifica');
    try {
      const rif = sdk.doc(sdk.collection(db, 'verifiche')); // id automatico
      await sdk.setDoc(rif, {
        corsoId, titolo: t, stato: 'bozza', fine: null, tracciaDefault: null,
        creataDa: mia, creato: sdk.serverTimestamp(), apertaIl: null, chiusaIl: null,
      });
      return leggi(rif.id);
    } catch (err) { throw traduci(err, 'Non posso creare la verifica in questo corso.'); }
  }

  async function leggi(vid) {
    try {
      const snap = await sdk.getDoc(docVerifica(vid));
      if (!snap.exists()) throw new ErroreVerifica('assente', 'Questa verifica non esiste.');
      return verificaDaDocumento(snap);
    } catch (err) { throw traduci(err, 'Questa verifica non esiste, o non è tua.'); } // un documento assente dà «negato»: le regole non vedono i suoi dati
  }

  // Le verifiche di un corso, la più recente per prima. Il docente le vede tutte; lo studente
  // (solo con `soloAperte`, l'unica query che le regole accettano per lui) quelle aperte.
  // Lo studente deve dichiarare lo stato (soloAperte o soloChiuse): le regole non gli fanno leggere le bozze, e una query
  // senza filtro sullo stato non si potrebbe dimostrare lecita.
  async function elenca(corsoId, { soloAperte = false, soloChiuse = false } = {}) {
    try {
      const vincoli = [sdk.where('corsoId', '==', corsoId)];
      if (soloAperte) vincoli.push(sdk.where('stato', '==', 'aperta'));
      if (soloChiuse) vincoli.push(sdk.where('stato', '==', 'chiusa'));
      const snap = await sdk.getDocs(sdk.query(sdk.collection(db, 'verifiche'), ...vincoli));
      return snap.docs.map(verificaDaDocumento).sort((a, b) => (b.creato ?? 0) - (a.creato ?? 0));
    } catch (err) { throw traduci(err); }
  }

  const aggiorna = async (vid, dati) => {
    try { await sdk.updateDoc(docVerifica(vid), dati); } catch (err) { throw traduci(err); }
  };

  // In bozza: titolo, fine e traccia di default. A verifica aperta: titolo e fine.
  async function modifica(vid, { titolo, fine, tracciaDefault }) {
    const d = {};
    if (titolo !== undefined) d.titolo = testo(titolo, L.maxTitoloVerifica, 'il titolo della verifica');
    if (fine !== undefined) d.fine = fine === null ? null : sdk.Timestamp.fromDate(fine);
    if (tracciaDefault !== undefined) d.tracciaDefault = tracciaDefault;
    await aggiorna(vid, d);
  }

  // bozza -> aperta. La fine prevista è obbligatoria (una verifica dimenticata aperta
  // non deve bloccare nessuno) e serve una traccia di default.
  async function apri(vid, { fine, tracciaDefault } = {}) {
    if (!(fine instanceof Date) || !(fine.getTime() > Date.now())) {
      throw new ErroreVerifica('fine', 'Indica una fine prevista nel futuro.');
    }
    const d = { stato: 'aperta', apertaIl: sdk.serverTimestamp(), fine: sdk.Timestamp.fromDate(fine) };
    if (tracciaDefault !== undefined) d.tracciaDefault = tracciaDefault;
    try {
      await sdk.updateDoc(docVerifica(vid), d);
    } catch (err) {
      throw traduci(err, 'Non posso aprirla: servono una traccia di default che esista e una fine nel futuro.');
    }
  }

  const chiudi = (vid) => aggiorna(vid, { stato: 'chiusa', chiusaIl: sdk.serverTimestamp() });

  // Archivia (nasconde dall'elenco del docente) o ripristina: solo per le verifiche chiuse. Una archiviata non si riapre
  // finché non si ripristina.
  const archivia = (vid, archiviata = true) => aggiorna(vid, { archiviata: !!archiviata });

  // chiusa -> aperta. La fine può restare nel passato: i singoli studenti hanno la
  // loro scadenza personale (nei lavori).
  async function riapri(vid, { fine } = {}) {
    const attuale = await leggi(vid);
    const f = fine ?? attuale.fine;
    if (!f) throw new ErroreVerifica('fine', 'Indica una fine prevista.');
    await aggiorna(vid, { stato: 'aperta', apertaIl: sdk.serverTimestamp(), fine: sdk.Timestamp.fromDate(f) });
  }

  // Si butta via solo una bozza: prima le sue tracce, poi la verifica.
  async function elimina(vid) {
    try {
      const snap = await sdk.getDocs(colTracce(vid));
      await Promise.all(snap.docs.map((d) => sdk.deleteDoc(d.ref)));
      await sdk.deleteDoc(docVerifica(vid));
    } catch (err) { throw traduci(err, 'Si può eliminare solo una verifica in bozza.'); }
  }

  // --- Tracce ---
  async function tracce(vid) {
    try {
      const snap = await sdk.getDocs(colTracce(vid));
      return snap.docs.map(tracciaDaDocumento).sort(perNumero);
    } catch (err) { throw traduci(err); }
  }

  async function leggiTraccia(vid, tid) {
    try {
      const snap = await sdk.getDoc(docTraccia(vid, tid));
      if (!snap.exists()) throw new ErroreVerifica('assente', 'Questa traccia non esiste.');
      return tracciaDaDocumento(snap);
    } catch (err) { throw traduci(err, 'Questa traccia non è disponibile.'); }
  }

  // Nuova traccia nel primo posto libero (t0, t1, ...). Se due schede scelgono lo
  // stesso numero la seconda scrittura è una modifica con rev sbagliato: viene
  // rifiutata dalle regole.
  async function nuovaTraccia(vid, { titolo, testoMd }) {
    const t = testo(titolo, L.maxTitoloTraccia, 'il titolo della traccia');
    const m = testo(testoMd, L.maxTestoTraccia, 'il testo della traccia');
    const esistenti = new Set((await tracce(vid)).map((x) => x.numero));
    let n = 0;
    while (esistenti.has(n)) n++;
    if (n >= L.maxTracce) throw new ErroreVerifica('pieno', `Una verifica può avere al massimo ${L.maxTracce} tracce.`);
    try {
      await sdk.setDoc(docTraccia(vid, idTraccia(n)), { titolo: t, testoMd: m, rev: 0, modificato: sdk.serverTimestamp() });
    } catch (err) { throw traduci(err, 'Non posso aggiungere la traccia (verifica chiusa, o non è tua).'); }
    return leggiTraccia(vid, idTraccia(n));
  }

  // Modifica una traccia: rev sale di uno (anche a verifica aperta, per correggere un refuso).
  async function modificaTraccia(vid, tid, { titolo, testoMd }) {
    const t = testo(titolo, L.maxTitoloTraccia, 'il titolo della traccia');
    const m = testo(testoMd, L.maxTestoTraccia, 'il testo della traccia');
    const attuale = await leggiTraccia(vid, tid);
    try {
      await sdk.setDoc(docTraccia(vid, tid), { titolo: t, testoMd: m, rev: attuale.rev + 1, modificato: sdk.serverTimestamp() });
    } catch (err) { throw traduci(err, 'Non posso modificare la traccia (verifica chiusa, o non è tua).'); }
    return leggiTraccia(vid, tid);
  }

  const eliminaTraccia = async (vid, tid) => {
    try { await sdk.deleteDoc(docTraccia(vid, tid)); }
    catch (err) { throw traduci(err, 'Una traccia si elimina solo finché la verifica è in bozza.'); }
  };

  return { crea, leggi, elenca, modifica, apri, chiudi, archivia, riapri, elimina, tracce, leggiTraccia, nuovaTraccia, modificaTraccia, eliminaTraccia };
}
