// Gestione dei corsi da parte del docente: creare un corso, modificarlo, aprire/
// chiudere le iscrizioni, archiviare, aggiungere e togliere iscritti e codocenti.
// Solo accesso ai dati: nessuna interfaccia (gestione-ui.js). Cosa è permesso lo
// decidono le REGOLE (firestore.rules.template); qui si controlla in anticipo per
// dare messaggi chiari. Il titolare del corso è `docenti[0]` e non cambia mai.
import { generaCodice, corsoDaDocumento } from './corsi.js';

export const MAX_MATERIA = 60;
export const MAX_CLASSE = 20;
export const MAX_NOME_CORSO = 60;
export const TENTATIVI_CODICE = 5;

export class ErroreGestione extends Error {
  constructor(codice, messaggio) {
    super(messaggio);
    this.name = 'ErroreGestione';
    this.codice = codice;
  }
}

// Anno scolastico corrente come "2026/27": da settembre in poi è l'anno che inizia.
export function annoCorrente(data = new Date()) {
  const y = data.getMonth() >= 8 ? data.getFullYear() : data.getFullYear() - 1;
  return `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
}

// Estrae le email da un testo incollato (una per riga, separate da virgole o
// punti e virgola, o nel formato "Nome Cognome <email>"). Minuscole, senza doppioni.
// `scartate` conta i pezzi di testo senza una email riconoscibile (nome senza @...).
export function analizzaElencoEmail(testo) {
  const trovate = String(testo ?? '').match(/[^\s,;<>"'()]+@[^\s,;<>"'()]+/g) || [];
  const valide = [];
  let doppie = 0;
  for (const t of trovate) {
    const e = t.toLowerCase().replace(/[.]+$/, '');
    if (!/^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/.test(e)) continue;
    if (valide.includes(e)) doppie++; else valide.push(e);
  }
  return { valide, doppie };
}

const ANNO_RE = /^[0-9]{4}\/[0-9]{2}$/;

function datiPuliti(d, { completi }) {
  const out = {};
  const testo = (k, max, etichetta, obbligatorio) => {
    if (d[k] === undefined) return;
    const v = String(d[k] ?? '').trim();
    if (obbligatorio && !v) throw new ErroreGestione('dati', `Scrivi ${etichetta}.`);
    if (v.length > max) throw new ErroreGestione('dati', `${etichetta[0].toUpperCase()}${etichetta.slice(1)}: al massimo ${max} caratteri.`);
    out[k] = v;
  };
  testo('materia', MAX_MATERIA, 'la materia', true);
  testo('classe', MAX_CLASSE, 'la classe', true);
  testo('nome', MAX_NOME_CORSO, 'il nome', false);
  if (d.annoScolastico !== undefined) {
    const a = String(d.annoScolastico).trim();
    if (!ANNO_RE.test(a)) throw new ErroreGestione('dati', 'L\'anno scolastico va scritto così: 2026/27.');
    out.annoScolastico = a;
  }
  if (completi) {
    for (const k of ['materia', 'classe', 'annoScolastico']) {
      if (out[k] === undefined) throw new ErroreGestione('dati', 'Mancano dei dati del corso.');
    }
  }
  // un nome vuoto non si scrive nel corso nuovo: se manca, si mostra "materia – classe"
  if (completi && !out.nome) delete out.nome;
  return out;
}

function traduci(err, permessoNegato = 'Operazione non consentita.') {
  if (err instanceof ErroreGestione) return err;
  const codice = err && err.code;
  if (codice === 'permission-denied') return new ErroreGestione('negato', permessoNegato);
  if (codice === 'unavailable' || codice === 'deadline-exceeded') {
    return new ErroreGestione('rete', 'Rete non disponibile: riprova tra poco.');
  }
  return new ErroreGestione('altro', 'Qualcosa è andato storto. Riprova.');
}

export function creaGestione({ sdk, db }, emailUtente) {
  const mia = String(emailUtente || '').toLowerCase();
  const docCorso = (id) => sdk.doc(db, 'corsi', id);
  const docIscr = (id, email) => sdk.doc(db, 'iscrizioni', `${id}_${email}`);

  // Crea un corso nuovo con un codice casuale: se è già preso la scrittura viene
  // rifiutata dalle regole (sarebbe una modifica) e si riprova con un altro. Il
  // titolare è chi crea. Restituisce il corso creato.
  async function crea(dati, { genera = generaCodice } = {}) {
    const d = datiPuliti(dati, { completi: true });
    let ultimo = null;
    for (let i = 0; i < TENTATIVI_CODICE; i++) {
      const id = genera();
      try {
        await sdk.setDoc(docCorso(id), {
          ...d, docenti: [mia], iscrizioniAperte: true, attivo: true, creato: sdk.serverTimestamp(),
        });
        return corsoDaDocumento(await sdk.getDoc(docCorso(id)), 'docente');
      } catch (err) {
        ultimo = err;
        if (!(err && err.code === 'permission-denied')) break;
      }
    }
    throw traduci(ultimo, 'Non riesco a creare il corso (serve l\'account di un docente abilitato). Riprova.');
  }

  async function leggi(id) {
    try {
      const snap = await sdk.getDoc(docCorso(id));
      if (!snap.exists()) throw new ErroreGestione('assente', 'Questo corso non esiste più.');
      return corsoDaDocumento(snap, 'docente');
    } catch (err) { throw traduci(err); }
  }

  // Modifica materia, classe, anno, nome (anche vuoto: toglie il nome scritto).
  async function modifica(id, dati) {
    const d = datiPuliti(dati, { completi: false });
    try { await sdk.updateDoc(docCorso(id), d); } catch (err) { throw traduci(err); }
  }
  const impostaIscrizioniAperte = async (id, aperte) => {
    try { await sdk.updateDoc(docCorso(id), { iscrizioniAperte: !!aperte }); } catch (err) { throw traduci(err); }
  };
  // I corsi non si cancellano: si archiviano (spariscono dagli elenchi degli studenti).
  const impostaAttivo = async (id, attivo) => {
    try { await sdk.updateDoc(docCorso(id), { attivo: !!attivo }); } catch (err) { throw traduci(err); }
  };

  // --- Iscritti ---
  async function iscritti(id) {
    try {
      const snap = await sdk.getDocs(sdk.query(sdk.collection(db, 'iscrizioni'), sdk.where('corsoId', '==', id)));
      return snap.docs.map((d) => String(d.data().email || '').toLowerCase()).filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'it'));
    } catch (err) { throw traduci(err); }
  }

  // Aggiunge studenti per email (già normalizzate da analizzaElencoEmail). Una
  // scrittura per email, così si sa quali sono entrate: { aggiunte, gia, rifiutate }.
  // Rifiutata = email non della scuola, o di un docente, o corso archiviato.
  async function aggiungiIscritti(id, emails) {
    const gia = new Set(await iscritti(id));
    const nuove = emails.filter((e) => !gia.has(e));
    const esiti = await Promise.all(nuove.map(async (e) => {
      try {
        await sdk.setDoc(docIscr(id, e), { corsoId: id, email: e, creato: sdk.serverTimestamp() });
        return [e, true];
      } catch (err) {
        if (err && err.code === 'permission-denied') return [e, false];
        throw traduci(err);
      }
    }));
    return {
      aggiunte: esiti.filter(([, ok]) => ok).map(([e]) => e),
      gia: emails.filter((e) => gia.has(e)),
      rifiutate: esiti.filter(([, ok]) => !ok).map(([e]) => e),
    };
  }

  async function togli(id, email) {
    try { await sdk.deleteDoc(docIscr(id, String(email).toLowerCase())); } catch (err) { throw traduci(err); }
  }

  // --- Codocenti (il titolare, docenti[0], non si tocca) ---
  async function aggiungiCodocente(id, email) {
    const e = String(email || '').trim().toLowerCase();
    if (!/^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/.test(e)) throw new ErroreGestione('email', 'Scrivi un\'email valida.');
    const corso = await leggi(id);
    if (corso.docenti.includes(e)) throw new ErroreGestione('gia', 'È già docente di questo corso.');
    try {
      await sdk.updateDoc(docCorso(id), { docenti: [...corso.docenti, e] });
    } catch (err) {
      throw traduci(err, 'Non posso aggiungerlo: l\'email deve essere quella di un docente già abilitato.');
    }
  }

  async function togliCodocente(id, email) {
    const e = String(email || '').toLowerCase();
    const corso = await leggi(id);
    if (corso.docenti[0] === e) throw new ErroreGestione('titolare', 'Il titolare del corso non si può togliere.');
    if (!corso.docenti.includes(e)) return;
    try {
      await sdk.updateDoc(docCorso(id), { docenti: corso.docenti.filter((x) => x !== e) });
    } catch (err) { throw traduci(err); }
  }

  return {
    crea, leggi, modifica, impostaIscrizioniAperte, impostaAttivo,
    iscritti, aggiungiIscritti, togli, aggiungiCodocente, togliCodocente,
  };
}
