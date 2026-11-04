// Lavori: il documento personale di ogni studente in una verifica (nessuna interfaccia).
// Cosa è permesso lo decidono le REGOLE (firestore.rules.template); qui si controlla in
// anticipo per dare messaggi chiari. Id del documento = email minuscola dello studente.
//   - Il DOCENTE assegna traccia e scadenza (creaMancanti, impostaScadenza, ...).
//   - Lo STUDENTE scrive il proprio programma e le statistiche (salva), mai traccia e scadenza.
// Né qui né nell'interfaccia si scrive mai un «motivo» del tempo aggiuntivo: è solo una scadenza.
import { verificaConfig } from './verifica-config.js';

const L = verificaConfig.regole;

export class ErroreLavoro extends Error {
  constructor(codice, messaggio) {
    super(messaggio);
    this.name = 'ErroreLavoro';
    this.codice = codice;
  }
}

function traduci(err, permessoNegato = 'Operazione non consentita.') {
  if (err instanceof ErroreLavoro) return err;
  const codice = err && err.code;
  if (codice === 'permission-denied') return new ErroreLavoro('negato', permessoNegato);
  if (codice === 'unavailable' || codice === 'deadline-exceeded') {
    return new ErroreLavoro('rete', 'Rete non disponibile: riprova tra poco.');
  }
  return new ErroreLavoro('altro', 'Qualcosa è andato storto. Riprova.');
}

const data = (t) => (t && typeof t.toDate === 'function' ? t.toDate() : null);

export function lavoroDaDocumento(snap) {
  const d = snap.data();
  return {
    email: snap.id,
    studenteNome: d.studenteNome ?? null,
    tracciaId: d.tracciaId ?? null,
    scadenza: data(d.scadenza),
    entrato: data(d.entrato),
    consegnato: d.consegnato === true,
    ultimoSegnale: data(d.ultimoSegnale),
    programma: d.programma ?? null,
    programmaHash: d.programmaHash ?? null,
    nBlocchi: d.nBlocchi ?? null,
    esecuzioni: d.esecuzioni ?? null,
    campioni: d.campioni ?? [],
    tracciaRevVista: d.tracciaRevVista ?? null,
    // Timestamp originale: serve a rimandarlo uguale nelle scritture successive
    entratoTs: d.entrato ?? null,
  };
}

const perEmail = (a, b) => a.email.localeCompare(b.email, 'it');

// ── Docente ──────────────────────────────────────────────────────────────
export function creaLavoriDocente({ sdk, db }) {
  const col = (vid) => sdk.collection(db, 'verifiche', vid, 'lavori');
  const doc = (vid, email) => sdk.doc(db, 'verifiche', vid, 'lavori', email);

  async function elenca(vid) {
    try {
      const snap = await sdk.getDocs(col(vid));
      return snap.docs.map(lavoroDaDocumento).sort(perEmail);
    } catch (err) { throw traduci(err); }
  }

  // Crea il lavoro di chi non ce l'ha ancora (si può rilanciare: non tocca quelli esistenti,
  // così non azzera traccia e tempo già assegnati). `iscritti` sono le email del corso;
  // `perStudente` ({email: {tracciaId, scadenza}}) sostituisce il default per chi ha una
  // traccia o un tempo diversi. `tracciaDefault` null (o assente) = «traccia di tutti»: la traccia
  // resta vuota, ammessa solo in bozza, e l'apertura la sostituisce con l'id vero.
  // Restituisce { create, esistenti, rifiutate }.
  async function creaMancanti(vid, iscritti, { tracciaDefault, scadenza, perStudente = {} }) {
    if (!(scadenza instanceof Date)) throw new ErroreLavoro('dati', 'Manca la fine prevista.');
    const esistenti = new Set((await elenca(vid)).map((l) => l.email));
    const nuovi = iscritti.map((e) => e.toLowerCase()).filter((e) => !esistenti.has(e));
    const esiti = await Promise.all(nuovi.map(async (email) => {
      const p = perStudente[email] ?? {};
      try {
        await sdk.setDoc(doc(vid, email), {
          studenteEmail: email,
          tracciaId: p.tracciaId !== undefined ? p.tracciaId : (tracciaDefault ?? null),
          scadenza: sdk.Timestamp.fromDate(p.scadenza ?? scadenza),
          entrato: null,
          consegnato: false,
        });
        return [email, true];
      } catch (err) {
        if (err && err.code === 'permission-denied') return [email, false];
        throw traduci(err);
      }
    }));
    return {
      create: esiti.filter(([, ok]) => ok).map(([e]) => e),
      esistenti: [...esistenti],
      rifiutate: esiti.filter(([, ok]) => !ok).map(([e]) => e),
    };
  }

  const aggiorna = async (vid, email, dati, negato) => {
    try { await sdk.updateDoc(doc(vid, email.toLowerCase()), dati); } catch (err) { throw traduci(err, negato); }
  };

  const impostaScadenza = (vid, email, scadenza) =>
    aggiorna(vid, email, { scadenza: sdk.Timestamp.fromDate(scadenza) }, 'Non posso cambiare la scadenza.');

  // Tempo aggiuntivo: sposta in avanti (o indietro, con minuti negativi) la scadenza attuale.
  async function aggiungiMinuti(vid, email, minuti) {
    if (!Number.isFinite(minuti) || minuti === 0) throw new ErroreLavoro('dati', 'Indica quanti minuti.');
    try {
      const snap = await sdk.getDoc(doc(vid, email.toLowerCase()));
      if (!snap.exists()) throw new ErroreLavoro('assente', 'Questo studente non ha ancora il lavoro per la verifica.');
      const nuova = new Date(snap.data().scadenza.toDate().getTime() + minuti * 60000);
      await impostaScadenza(vid, email, nuova);
      return nuova;
    } catch (err) { throw traduci(err); }
  }

  // Cambia la traccia assegnata: solo finché lo studente non è entrato. `null` = «traccia di tutti»
  // (solo in bozza).
  const impostaTraccia = (vid, email, tracciaId) =>
    aggiorna(vid, email, { tracciaId }, 'La traccia si cambia solo prima che lo studente entri, e deve esistere.');

  // Toglie il lavoro di chi non è mai entrato.
  async function togli(vid, email) {
    try { await sdk.deleteDoc(doc(vid, email.toLowerCase())); }
    catch (err) { throw traduci(err, 'Si può togliere solo chi non è ancora entrato.'); }
  }

  return { elenca, creaMancanti, impostaScadenza, aggiungiMinuti, impostaTraccia, togli };
}

// ── Studente ─────────────────────────────────────────────────────────────
export function creaLavoroStudente({ sdk, db }, emailUtente, nomeUtente) {
  const mia = String(emailUtente || '').toLowerCase();
  const doc = (vid) => sdk.doc(db, 'verifiche', vid, 'lavori', mia);
  // Ultimo `entrato` noto: le regole vogliono che resti uguale dopo il primo salvataggio.
  const noti = new Map();

  async function mio(vid) {
    try {
      const snap = await sdk.getDoc(doc(vid));
      if (!snap.exists()) throw new ErroreLavoro('assente', 'Il docente non ti ha ancora assegnato questa verifica.');
      const l = lavoroDaDocumento(snap);
      noti.set(vid, l.entratoTs);
      return l;
    } catch (err) { throw traduci(err, 'Questa verifica non è disponibile.'); }
  }

  // Salva il programma e le statistiche (solo i campi dati; gli altri restano). Ogni
  // scrittura è anche il segnale di vita; la prima è l'ingresso in verifica.
  // dati: { programma, programmaHash, nBlocchi, esecuzioni, campioni, tracciaRevVista } (anche parziali)
  async function salva(vid, dati = {}) {
    if (!noti.has(vid)) await mio(vid);
    if (dati.programma !== undefined && String(dati.programma).length > L.maxProgramma) {
      throw new ErroreLavoro('programma', 'Il programma è troppo grande per essere salvato.');
    }
    const campi = {};
    for (const k of ['programma', 'programmaHash', 'nBlocchi', 'esecuzioni', 'campioni', 'tracciaRevVista']) {
      if (dati[k] !== undefined) campi[k] = dati[k];
    }
    if (campi.campioni && campi.campioni.length > L.maxCampioni) campi.campioni = campi.campioni.slice(-L.maxCampioni);
    const primo = noti.get(vid) === null;
    try {
      await sdk.updateDoc(doc(vid), {
        ...campi,
        studenteNome: String(nomeUtente || mia).slice(0, 80),
        entrato: primo ? sdk.serverTimestamp() : noti.get(vid),
        ultimoSegnale: sdk.serverTimestamp(),
      });
    } catch (err) { throw traduci(err, 'Non posso salvare: la verifica è chiusa o il tuo tempo è scaduto.'); }
    if (primo) await mio(vid);   // rilegge l'ora di ingresso scritta dal server
  }

  return { mio, salva };
}
