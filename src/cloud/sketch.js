// Sketch personali nel cloud: salvare, elencare, riaprire, rinominare ed
// eliminare i PROPRI programmi. Solo accesso ai dati: nessuna interfaccia.
//
// Un documento per sketch in `sketch/<uid>_<n>`, n da 0 a 49: l'id
// deterministico è il tetto di 50 sketch per persona, imposto dalle regole
// (niente Cloud Functions). `programma` è il testo JSON del file salvato, lo
// stesso che produce "Salva", così si riapre con lo stesso codice di
// caricamento. Le regole stanno in firestore.rules.template.

export const MAX_SKETCH = 50;
export const MAX_PROGRAMMA = 200000; // caratteri, come nelle regole
export const MAX_NOME = 60;          // caratteri, come nelle regole

export class ErroreSketch extends Error {
  constructor(codice, messaggio) {
    super(messaggio);
    this.name = 'ErroreSketch';
    this.codice = codice;
  }
}

function traduci(err) {
  if (err instanceof ErroreSketch) return err;
  const codice = err && err.code;
  if (codice === 'permission-denied') return new ErroreSketch('negato', 'Operazione non consentita.');
  if (codice === 'unavailable' || codice === 'deadline-exceeded') {
    return new ErroreSketch('rete', 'Rete non disponibile: riprova tra poco.');
  }
  return new ErroreSketch('altro', 'Qualcosa è andato storto. Riprova.');
}

function nomePulito(nome) {
  const n = String(nome ?? '').trim();
  if (!n) throw new ErroreSketch('nome', 'Dai un nome allo sketch.');
  if (n.length > MAX_NOME) throw new ErroreSketch('nome', `Il nome può avere al massimo ${MAX_NOME} caratteri.`);
  return n;
}

function programmaValido(programma) {
  if (typeof programma !== 'string' || !programma) throw new ErroreSketch('programma', 'Il programma è vuoto.');
  if (programma.length > MAX_PROGRAMMA) {
    throw new ErroreSketch('programma', 'Il programma è troppo grande per essere salvato nel cloud.');
  }
  return programma;
}

// `profilo` = { email, nome } dell'autore: finiscono nello sketch (servono al
// docente per riconoscere chi ha condiviso, e alle regole per controllare
// l'iscrizione). Le regole accettano solo l'email del proprio account.
export const MAX_NOME_AUTORE = 80;

export function creaSketch({ sdk, db }, uid, profilo = {}) {
  const email = String(profilo.email || '').toLowerCase();
  const nomeAutore = String(profilo.nome || email).trim().slice(0, MAX_NOME_AUTORE) || email;
  const autore = () => (email ? { proprietarioEmail: email, proprietarioNome: nomeAutore } : {});
  const raccolta = () => sdk.collection(db, 'sketch');
  const docDi = (id) => sdk.doc(db, 'sketch', id);

  // Elenco dei propri sketch, dal più recente. Include `programma`: ogni
  // documento è una lettura, e si apre senza un secondo giro di rete.
  async function elenca() {
    try {
      const snap = await sdk.getDocs(sdk.query(raccolta(), sdk.where('proprietarioUid', '==', uid)));
      return snap.docs
        .map((d) => {
          const v = d.data();
          return {
            id: d.id,
            nome: v.nome,
            creato: v.creato?.toDate?.() ?? null,
            modificato: v.modificato?.toDate?.() ?? null,
            condivisoCon: v.condivisoCon ?? null,
            programma: v.programma,
          };
        })
        .sort((a, b) => (b.modificato?.getTime() ?? 0) - (a.modificato?.getTime() ?? 0));
    } catch (err) {
      throw traduci(err);
    }
  }

  // Nuovo sketch nel primo numero libero. Se un'altra scheda ha occupato lo
  // stesso numero nel frattempo le regole rifiutano la scrittura (non
  // sovrascrive): si rilegge l'elenco e si riprova.
  async function nuovo(nome, programma) {
    const n = nomePulito(nome);
    const p = programmaValido(programma);
    try {
      for (let tentativo = 0; tentativo < 3; tentativo++) {
        const occupati = new Set((await elenca()).map((s) => s.id));
        let libero = null;
        for (let i = 0; i < MAX_SKETCH; i++) {
          if (!occupati.has(`${uid}_${i}`)) { libero = i; break; }
        }
        if (libero === null) {
          throw new ErroreSketch('pieno', `Hai già ${MAX_SKETCH} sketch nel cloud: eliminane qualcuno per salvarne un altro.`);
        }
        const id = `${uid}_${libero}`;
        try {
          await sdk.setDoc(docDi(id), {
            proprietarioUid: uid,
            nome: n,
            creato: sdk.serverTimestamp(),
            modificato: sdk.serverTimestamp(),
            programma: p,
            condivisoCon: null,
            ...autore(),
          });
          return { id, nome: n };
        } catch (err) {
          if (err && err.code === 'permission-denied' && tentativo < 2) continue; // numero occupato da un'altra scheda
          throw err;
        }
      }
    } catch (err) {
      throw traduci(err);
    }
    throw new ErroreSketch('altro', 'Qualcosa è andato storto. Riprova.');
  }

  // Aggiorna uno sketch già salvato (nome e/o programma).
  async function aggiorna(id, { nome, programma }) {
    // L'autore si riscrive a ogni salvataggio: completa anche gli sketch creati
    // prima che esistesse la condivisione.
    const campi = { modificato: sdk.serverTimestamp(), ...autore() };
    if (nome !== undefined) campi.nome = nomePulito(nome);
    if (programma !== undefined) campi.programma = programmaValido(programma);
    try {
      await sdk.updateDoc(docDi(id), campi);
    } catch (err) {
      throw traduci(err);
    }
  }

  const rinomina = (id, nome) => aggiorna(id, { nome });

  // Condivide lo sketch con un corso (codice) in cui si è iscritti, o ritira la
  // condivisione (null). Il docente vede l'ultima versione salvata.
  async function condividi(id, corsoId) {
    try {
      await sdk.updateDoc(docDi(id), {
        condivisoCon: corsoId ?? null,
        modificato: sdk.serverTimestamp(),
        ...autore(),
      });
    } catch (err) {
      throw traduci(err);
    }
  }

  async function elimina(id) {
    try {
      await sdk.deleteDoc(docDi(id));
    } catch (err) {
      throw traduci(err);
    }
  }

  return { elenca, nuovo, aggiorna, rinomina, condividi, elimina };
}
