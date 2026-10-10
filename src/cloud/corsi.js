// Corsi e iscrizioni, lato studente (e lettura lato docente). Qui si entra con il
// codice e si leggono i propri corsi; creare e gestire i corsi (docente) sta in
// gestione-corsi.js. Le regole stanno in firestore.rules.template.
//
// Modello: `corsi/<CODICE>` (l'id è il codice di accesso) e
// `iscrizioni/<CODICE>_<email minuscola>`. Vedi docs/CLOUD.md.

// Alfabeto Crockford Base32, come in isaquiz: niente I L O U (ambigui a occhio).
export const ALFABETO_CODICE = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const LUNGHEZZA_CODICE = 6;

// Codice casuale per un nuovo corso (anche: npm run codice).
export function generaCodice(lunghezza = LUNGHEZZA_CODICE) {
  const byte = crypto.getRandomValues(new Uint8Array(lunghezza));
  // 256 % 32 === 0: nessun bias
  return Array.from(byte, (b) => ALFABETO_CODICE[b % 32]).join('');
}

// Maiuscolo, "clemenza" di Crockford (I/L -> 1, O -> 0 per chi ricopia male),
// poi si tengono SOLO i caratteri dell'alfabeto: il risultato è sempre un id
// valido e innocuo (spazi, trattini, simboli spariscono).
export function normalizzaCodice(testo) {
  return String(testo ?? '')
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .split('')
    .filter((c) => ALFABETO_CODICE.includes(c))
    .join('');
}

export class ErroreCorsi extends Error {
  constructor(codice, messaggio) {
    super(messaggio);
    this.name = 'ErroreCorsi';
    this.codice = codice;
  }
}

// Nome mostrato: quello scritto nel corso, altrimenti materia – classe (anno).
export function nomeCorso(c) {
  if (c.nome) return c.nome;
  const parti = [c.materia, c.classe].filter(Boolean).join(' – ');
  const anno = c.annoScolastico ? ` (${c.annoScolastico})` : '';
  return (parti || c.id) + anno;
}

// Dal documento Firestore all'oggetto che l'interfaccia usa.
export function corsoDaDocumento(snap, ruolo) {
  const v = snap.data();
  return {
    id: snap.id,
    materia: v.materia ?? '',
    classe: v.classe ?? '',
    annoScolastico: v.annoScolastico ?? '',
    nomeScritto: v.nome ?? '',
    nome: nomeCorso({ ...v, id: snap.id }),
    iscrizioniAperte: v.iscrizioniAperte === true,
    attivo: v.attivo !== false,
    docenti: Array.isArray(v.docenti) ? v.docenti : [],
    ruolo,
  };
}

function traduci(err) {
  if (err instanceof ErroreCorsi) return err;
  const codice = err && err.code;
  if (codice === 'unavailable' || codice === 'deadline-exceeded') {
    return new ErroreCorsi('rete', 'Rete non disponibile: riprova tra poco.');
  }
  return new ErroreCorsi('altro', 'Qualcosa è andato storto. Riprova.');
}

export function creaCorsi({ sdk, db }, emailUtente, ruolo = 'studente') {
  const email = String(emailUtente || '').toLowerCase();
  const docCorso = (id) => sdk.doc(db, 'corsi', id);
  const docIscrizione = (codice) => sdk.doc(db, 'iscrizioni', `${codice}_${email}`);

  const daDocumento = corsoDaDocumento;

  // Entra in un corso con il codice. Con codice sbagliato, corso chiuso o
  // archiviato la risposta è la stessa (non si rivela quali codici esistono).
  async function iscriviti(codiceDigitato) {
    // Le regole lo vietano comunque: qui si dà un messaggio onesto invece di
    // "codice non valido".
    if (ruolo === 'docente') {
      throw new ErroreCorsi('docente', 'I docenti non si iscrivono ai corsi come studenti: i tuoi corsi li gestisci dalla finestra «Corsi».');
    }
    const codice = normalizzaCodice(codiceDigitato);
    if (codice.length < 4) throw new ErroreCorsi('codice', 'Scrivi il codice del corso.');
    try {
      if ((await sdk.getDoc(docIscrizione(codice))).exists()) {
        throw new ErroreCorsi('gia', 'Sei già iscritto a questo corso.');
      }
      try {
        await sdk.setDoc(docIscrizione(codice), { corsoId: codice, email, creato: sdk.serverTimestamp() });
      } catch (err) {
        if (err && err.code === 'permission-denied') {
          throw new ErroreCorsi('rifiutato', 'Codice non valido, oppure le iscrizioni a questo corso sono chiuse.');
        }
        throw err;
      }
      return daDocumento(await sdk.getDoc(docCorso(codice)), 'studente');
    } catch (err) {
      throw traduci(err);
    }
  }

  // I propri corsi: quelli a cui si è iscritti e quelli in cui si è docente.
  // I corsi archiviati (attivo: false) non compaiono.
  async function elenca({ archiviati = false } = {}) {
    try {
      // Solo il docente può interrogare `corsi` per email: le regole chiedono che sia
      // ancora in `docenti`, e una query di uno studente verrebbe rifiutata per intero.
      const [iscr, docente] = await Promise.all([
        sdk.getDocs(sdk.query(sdk.collection(db, 'iscrizioni'), sdk.where('email', '==', email))),
        ruolo === 'docente'
          ? sdk.getDocs(sdk.query(sdk.collection(db, 'corsi'), sdk.where('docenti', 'array-contains', email)))
          : Promise.resolve({ docs: [] }),
      ]);
      const perId = new Map();
      for (const d of docente.docs) perId.set(d.id, daDocumento(d, 'docente'));
      const mancanti = iscr.docs.map((d) => d.data().corsoId).filter((id) => !perId.has(id));
      const lette = await Promise.all(mancanti.map((id) => sdk.getDoc(docCorso(id)).catch(() => null)));
      for (const snap of lette) {
        // corso sparito o non più leggibile: si salta senza rumore
        if (snap && snap.exists()) perId.set(snap.id, daDocumento(snap, 'studente'));
      }
      return [...perId.values()]
        // gli archiviati li vede solo il docente che li ha chiesti
        .filter((c) => c.attivo || (archiviati && c.ruolo === 'docente'))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    } catch (err) {
      throw traduci(err);
    }
  }

  return { iscriviti, elenca };
}
