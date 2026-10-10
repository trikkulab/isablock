// Commenti del docente sugli sketch condivisi. Solo accesso ai dati: nessuna
// interfaccia (commenti-ui.js). Il commento è un documento a parte, `commenti/
// <sketchId>_<n>` (n da 0 a 29): lo sketch dello studente non si tocca mai, e il
// commento non entra nel programma né nei tre output. Le regole stanno in
// firestore.rules.template.
//
// Un commento è agganciato a un blocco con l'id che Blockly salva nel JSON del
// programma (`bloccoId`, o null per l'intero sketch), più una piccola descrizione
// del blocco (`bloccoTesto`) per riconoscerlo anche se lo studente lo toglie.
//
// ATTENZIONE: `sketchCreato` è il Timestamp ORIGINALE dello sketch (non una Date:
// toDate() perde i microsecondi e le regole confrontano l'uguaglianza esatta).

export const MAX_COMMENTI_PER_SKETCH = 30; // come nelle regole
export const MAX_TESTO = 500;              // caratteri, come nelle regole
export const MAX_BLOCCO_TESTO = 200;       // caratteri, come nelle regole

export class ErroreCommenti extends Error {
  constructor(codice, messaggio) {
    super(messaggio);
    this.name = 'ErroreCommenti';
    this.codice = codice;
  }
}

function traduci(err, negato = 'Operazione non consentita.') {
  if (err instanceof ErroreCommenti) return err;
  const codice = err && err.code;
  if (codice === 'permission-denied') return new ErroreCommenti('negato', negato);
  if (codice === 'unavailable' || codice === 'deadline-exceeded') {
    return new ErroreCommenti('rete', 'Rete non disponibile: riprova tra poco.');
  }
  return new ErroreCommenti('altro', 'Qualcosa è andato storto. Riprova.');
}

function testoPulito(testo) {
  const t = String(testo ?? '').trim();
  if (!t) throw new ErroreCommenti('testo', 'Scrivi il commento.');
  if (t.length > MAX_TESTO) throw new ErroreCommenti('testo', `Il commento può avere al massimo ${MAX_TESTO} caratteri.`);
  return t;
}

const daDocumento = (d) => {
  const v = d.data();
  return {
    id: d.id,
    sketchId: v.sketchId,
    sketchCreato: v.sketchCreato,           // Timestamp originale
    corsoId: v.corsoId,
    bloccoId: v.bloccoId ?? null,
    bloccoTesto: v.bloccoTesto ?? '',
    testo: v.testo,
    autoreEmail: v.autoreEmail,
    autoreNome: v.autoreNome,
    creato: v.creato?.toDate?.() ?? null,
    modificato: v.modificato?.toDate?.() ?? null,
    letto: v.letto === true,
  };
};

const piuVecchioPrima = (a, b) => (a.creato?.getTime() ?? 0) - (b.creato?.getTime() ?? 0);

// `profilo` = { uid, email, nome } di chi usa l'app: l'uid serve allo studente per
// leggere i propri commenti, email e nome al docente per firmare.
export function creaCommenti({ sdk, db }, profilo = {}) {
  const uid = profilo.uid;
  const email = String(profilo.email || '').toLowerCase();
  const nome = String(profilo.nome || email).trim().slice(0, 80) || email;
  const raccolta = () => sdk.collection(db, 'commenti');
  const docDi = (id) => sdk.doc(db, 'commenti', id);

  // Docente: i commenti scritti per uno sketch nel suo corso. Lo sketch deve essere
  // ancora condiviso con quel corso e della stessa creazione (le regole lo controllano).
  async function perSketch({ sketchId, sketchCreato, corsoId }) {
    try {
      const snap = await sdk.getDocs(sdk.query(raccolta(),
        sdk.where('sketchId', '==', sketchId), sdk.where('corsoId', '==', corsoId),
        sdk.where('sketchCreato', '==', sketchCreato)));
      return snap.docs.map(daDocumento).sort(piuVecchioPrima);
    } catch (err) { throw traduci(err); }
  }

  // Studente: tutti i commenti sui propri sketch (una sola lettura).
  async function mieiCommenti() {
    try {
      const snap = await sdk.getDocs(sdk.query(raccolta(), sdk.where('proprietarioUid', '==', uid)));
      return snap.docs.map(daDocumento).sort(piuVecchioPrima);
    } catch (err) { throw traduci(err); }
  }

  // Scrive un commento nel primo posto libero (0..29). `sketch` = { id, creatoTs,
  // proprietarioUid, corsoId } dello sketch che il docente sta guardando.
  // Se un altro docente occupa lo stesso numero nel frattempo le regole rifiutano la
  // scrittura (non sovrascrive): si rilegge e si riprova.
  async function commenta({ sketch, bloccoId = null, bloccoTesto = '', testo }) {
    const t = testoPulito(testo);
    const descr = String(bloccoTesto ?? '').slice(0, MAX_BLOCCO_TESTO);
    try {
      for (let tentativo = 0; tentativo < 3; tentativo++) {
        const esistenti = await perSketch({ sketchId: sketch.id, sketchCreato: sketch.creatoTs, corsoId: sketch.corsoId });
        const occupati = new Set(esistenti.map((c) => c.id));
        let libero = null;
        for (let n = 0; n < MAX_COMMENTI_PER_SKETCH; n++) {
          if (!occupati.has(`${sketch.id}_${n}`)) { libero = n; break; }
        }
        if (libero === null) {
          throw new ErroreCommenti('pieno', `Questo sketch ha già ${MAX_COMMENTI_PER_SKETCH} commenti: cancellane qualcuno.`);
        }
        const id = `${sketch.id}_${libero}`;
        try {
          await sdk.setDoc(docDi(id), {
            sketchId: sketch.id,
            sketchCreato: sketch.creatoTs,
            proprietarioUid: sketch.proprietarioUid,
            corsoId: sketch.corsoId,
            bloccoId: bloccoId || null,
            bloccoTesto: descr,
            testo: t,
            autoreEmail: email,
            autoreNome: nome,
            creato: sdk.serverTimestamp(),
            modificato: sdk.serverTimestamp(),
            letto: false,
          });
          return id;
        } catch (err) {
          if (err && err.code === 'permission-denied' && tentativo < 2) continue;
          throw err;
        }
      }
    } catch (err) {
      throw traduci(err, 'Non posso commentare: lo sketch non è più condiviso con il tuo corso, o lo studente non è più iscritto.');
    }
    throw new ErroreCommenti('altro', 'Qualcosa è andato storto. Riprova.');
  }

  async function modifica(id, testo) {
    const t = testoPulito(testo);
    try {
      await sdk.updateDoc(docDi(id), { testo: t, modificato: sdk.serverTimestamp() });
    } catch (err) { throw traduci(err, 'Puoi modificare solo i tuoi commenti, su sketch ancora condivisi con il tuo corso.'); }
  }

  async function elimina(id) {
    try { await sdk.deleteDoc(docDi(id)); } catch (err) { throw traduci(err); }
  }

  // Studente: segna come letti (toglie il «nuovo»).
  async function segnaLetti(ids) {
    try {
      await Promise.all(ids.map((id) => sdk.updateDoc(docDi(id), { letto: true })));
    } catch (err) { throw traduci(err); }
  }

  // Studente: toglie i commenti che non hanno più uno sketch (eliminato, o ricreato
  // con lo stesso id). `sketchAttuali` = elenco dei propri sketch con `id` e
  // `creatoTs`. Le regole lo permettono solo in questo caso. Ritorna quanti ne ha tolti.
  async function ripulisciOrfani(commenti, sketchAttuali) {
    const creato = new Map(sketchAttuali.map((s) => [s.id, s.creatoTs]));
    const orfani = commenti.filter((c) => {
      const ts = creato.get(c.sketchId);
      return !ts || !ts.isEqual(c.sketchCreato);
    });
    const esiti = await Promise.all(orfani.map((c) => sdk.deleteDoc(docDi(c.id)).then(() => true, () => false)));
    return esiti.filter(Boolean).length;
  }

  return { perSketch, mieiCommenti, commenta, modifica, elimina, segnaLetti, ripulisciOrfani };
}

// Il commento si riferisce ancora allo sketch com'è adesso?
export const dellaStessaCreazione = (commento, creatoTs) => !!creatoTs && creatoTs.isEqual(commento.sketchCreato);

// Quanti commenti nuovi (non letti) per sketch.
export function nuoviPerSketch(commenti) {
  const m = new Map();
  for (const c of commenti) if (!c.letto) m.set(c.sketchId, (m.get(c.sketchId) ?? 0) + 1);
  return m;
}
