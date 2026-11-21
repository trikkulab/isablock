// Feedback del docente sulle consegne di una verifica. Solo accesso ai dati: nessuna interfaccia.
// Il feedback è un documento a parte, `feedback/<verifica>_<email>_<versione>_<k>` (k da 0 a 29): la consegna
// non si tocca mai (è immutabile) e il commento non entra nel programma né nei tre output. Le regole stanno in
// firestore.rules.template.
//
// Si commenta solo l'ULTIMA versione della consegna, a verifica chiusa; ogni commento resta legato alla sua
// versione. Nasce come BOZZA (solo il docente la vede); «Pubblica» (`pubblica`) la rende visibile allo studente.
// Un commento è agganciato a un blocco con l'id che Blockly salva nel JSON (`bloccoId`, o null per l'intera
// consegna), più una piccola descrizione del blocco (`bloccoTesto`).

export const MAX_FEEDBACK_PER_CONSEGNA = 30; // come nelle regole
export const MAX_TESTO = 500;                // caratteri, come nelle regole
export const MAX_BLOCCO_TESTO = 200;         // caratteri, come nelle regole

export class ErroreFeedback extends Error {
  constructor(codice, messaggio) {
    super(messaggio);
    this.name = 'ErroreFeedback';
    this.codice = codice;
  }
}

function traduci(err, negato = 'Operazione non consentita.') {
  if (err instanceof ErroreFeedback) return err;
  const codice = err && err.code;
  if (codice === 'permission-denied') return new ErroreFeedback('negato', negato);
  if (codice === 'unavailable' || codice === 'deadline-exceeded') {
    return new ErroreFeedback('rete', 'Rete non disponibile: riprova tra poco.');
  }
  return new ErroreFeedback('altro', 'Qualcosa è andato storto. Riprova.');
}

function testoPulito(testo) {
  const t = String(testo ?? '').trim();
  if (!t) throw new ErroreFeedback('testo', 'Scrivi il commento.');
  if (t.length > MAX_TESTO) throw new ErroreFeedback('testo', `Il commento può avere al massimo ${MAX_TESTO} caratteri.`);
  return t;
}

const data = (t) => (t && typeof t.toDate === 'function' ? t.toDate() : null);
const idConsegna = (verificaId, studenteEmail, versione) => `${verificaId}_${String(studenteEmail).toLowerCase()}_${versione}`;

export function feedbackDaDocumento(d) {
  const v = d.data();
  const creato = data(v.creato);
  const modificato = data(v.modificato);
  const pubblicatoIl = data(v.pubblicatoIl);
  return {
    id: d.id,
    verificaId: v.verificaId,
    studenteEmail: v.studenteEmail,
    versione: v.versione,
    corsoId: v.corsoId,
    bloccoId: v.bloccoId ?? null,
    bloccoTesto: v.bloccoTesto ?? '',
    testo: v.testo,
    autoreEmail: v.autoreEmail,
    autoreNome: v.autoreNome,
    creato,
    modificato,
    pubblicato: v.pubblicato === true,
    pubblicatoIl,
    // Corretto dopo la pubblicazione (una correzione fatta prima non conta: lo studente non l'ha mai visto diverso).
    // Il confronto è al millisecondo: pubblicatoIl e modificato sono due istanti del server.
    modificatoDopo: !!(pubblicatoIl && modificato && modificato.getTime() > pubblicatoIl.getTime()),
  };
}

const piuVecchioPrima = (a, b) => (a.creato?.getTime() ?? 0) - (b.creato?.getTime() ?? 0);

// `profilo` = { email, nome } di chi usa l'app: email e nome del docente servono a firmare i commenti.
export function creaFeedback({ sdk, db }, profilo = {}) {
  const email = String(profilo.email || '').toLowerCase();
  const nome = String(profilo.nome || email).trim().slice(0, 80) || email;
  const raccolta = () => sdk.collection(db, 'feedback');
  const docDi = (id) => sdk.doc(db, 'feedback', id);

  // Docente: tutti i feedback di una verifica (bozze comprese), con una sola lettura. Una query sola per verifica
  // basta alla tabella (conteggi, «versione nuova senza commenti») e alla copia di prova.
  async function perVerifica(verificaId) {
    try {
      const snap = await sdk.getDocs(sdk.query(raccolta(), sdk.where('verificaId', '==', verificaId)));
      return snap.docs.map(feedbackDaDocumento).sort(piuVecchioPrima);
    } catch (err) { throw traduci(err); }
  }

  // Studente: tutti i propri feedback pubblicati di una verifica, di ogni versione (a verifica chiusa; le regole
  // lo impongono). La query ha i tre filtri che le regole vogliono.
  async function mieiPubblicati(verificaId) {
    try {
      const snap = await sdk.getDocs(sdk.query(raccolta(),
        sdk.where('verificaId', '==', verificaId), sdk.where('studenteEmail', '==', email), sdk.where('pubblicato', '==', true)));
      return snap.docs.map(feedbackDaDocumento).sort(piuVecchioPrima);
    } catch (err) { throw traduci(err); }
  }

  // I feedback di UNA versione di una consegna (docente).
  async function perConsegna({ verificaId, studenteEmail, versione }) {
    try {
      const snap = await sdk.getDocs(sdk.query(raccolta(),
        sdk.where('verificaId', '==', verificaId), sdk.where('studenteEmail', '==', String(studenteEmail).toLowerCase()),
        sdk.where('versione', '==', versione)));
      return snap.docs.map(feedbackDaDocumento).sort(piuVecchioPrima);
    } catch (err) { throw traduci(err); }
  }

  // Docente: i feedback di uno studente in una verifica, di ogni versione (bozze comprese).
  async function perStudente({ verificaId, studenteEmail }) {
    try {
      const snap = await sdk.getDocs(sdk.query(raccolta(),
        sdk.where('verificaId', '==', verificaId), sdk.where('studenteEmail', '==', String(studenteEmail).toLowerCase())));
      return snap.docs.map(feedbackDaDocumento).sort(piuVecchioPrima);
    } catch (err) { throw traduci(err); }
  }

  // Scrive un commento (bozza) nel primo posto libero (0..29). `consegna` = { verificaId, studenteEmail, versione,
  // corsoId } dell'ULTIMA versione che il docente sta guardando. Se un altro docente occupa lo stesso numero nel
  // frattempo le regole rifiutano la scrittura (non sovrascrive): si rilegge e si riprova.
  async function commenta({ consegna, bloccoId = null, bloccoTesto = '', testo }) {
    const t = testoPulito(testo);
    const descr = String(bloccoTesto ?? '').slice(0, MAX_BLOCCO_TESTO);
    const studente = String(consegna.studenteEmail).toLowerCase();
    const base = idConsegna(consegna.verificaId, studente, consegna.versione);
    try {
      for (let tentativo = 0; tentativo < 3; tentativo++) {
        const esistenti = await perConsegna({ verificaId: consegna.verificaId, studenteEmail: studente, versione: consegna.versione });
        const occupati = new Set(esistenti.map((f) => f.id));
        let libero = null;
        for (let k = 0; k < MAX_FEEDBACK_PER_CONSEGNA; k++) {
          if (!occupati.has(`${base}_${k}`)) { libero = k; break; }
        }
        if (libero === null) {
          throw new ErroreFeedback('pieno', `Questa consegna ha già ${MAX_FEEDBACK_PER_CONSEGNA} commenti: cancellane qualcuno.`);
        }
        const id = `${base}_${libero}`;
        try {
          await sdk.setDoc(docDi(id), {
            verificaId: consegna.verificaId,
            studenteEmail: studente,
            versione: consegna.versione,
            corsoId: consegna.corsoId,
            bloccoId: bloccoId || null,
            bloccoTesto: descr,
            testo: t,
            autoreEmail: email,
            autoreNome: nome,
            creato: sdk.serverTimestamp(),
            modificato: sdk.serverTimestamp(),
            pubblicato: false,
            pubblicatoIl: null,
          });
          return id;
        } catch (err) {
          if (err && err.code === 'permission-denied' && tentativo < 2) continue;
          throw err;
        }
      }
    } catch (err) {
      throw traduci(err, 'Non posso commentare: la verifica non è chiusa, questa non è più l\'ultima versione della consegna, o non sei docente del corso.');
    }
    throw new ErroreFeedback('altro', 'Qualcosa è andato storto. Riprova.');
  }

  async function modifica(id, testo) {
    const t = testoPulito(testo);
    try {
      await sdk.updateDoc(docDi(id), { testo: t, modificato: sdk.serverTimestamp() });
    } catch (err) { throw traduci(err, 'Puoi modificare solo i tuoi commenti.'); }
  }

  async function elimina(id) {
    try { await sdk.deleteDoc(docDi(id)); } catch (err) { throw traduci(err); }
  }

  // «Pubblica feedback»: rende visibili allo studente tutte le bozze di quella versione (di qualunque docente del
  // corso), in un solo batch. Ritorna quanti ne ha pubblicati (0 se non c'erano bozze).
  async function pubblica({ verificaId, studenteEmail, versione }) {
    try {
      const esistenti = await perConsegna({ verificaId, studenteEmail, versione });
      const bozze = esistenti.filter((f) => !f.pubblicato);
      if (bozze.length === 0) return 0;
      const b = sdk.writeBatch(db);
      for (const f of bozze) b.update(docDi(f.id), { pubblicato: true, pubblicatoIl: sdk.serverTimestamp() });
      await b.commit();
      return bozze.length;
    } catch (err) { throw traduci(err); }
  }

  return { perVerifica, mieiPubblicati, perConsegna, perStudente, commenta, modifica, elimina, pubblica };
}

// Per la tabella del docente: com'è messo il feedback di uno studente. `lista` = i feedback dello studente (tutte le
// versioni), `ultimaVersione` = la versione della sua ultima consegna (null se non ne ha).
//   bozze, pubblicati: commenti dell'ULTIMA versione
//   versioneSenzaCommenti: ci sono commenti di una versione precedente ma non dell'ultima (il docente deve ricominciare)
export function riepilogoFeedback(lista, ultimaVersione) {
  const dellUltima = lista.filter((f) => f.versione === ultimaVersione);
  return {
    bozze: dellUltima.filter((f) => !f.pubblicato).length,
    pubblicati: dellUltima.filter((f) => f.pubblicato).length,
    versioneSenzaCommenti: ultimaVersione != null && dellUltima.length === 0 && lista.some((f) => f.versione < ultimaVersione),
  };
}
