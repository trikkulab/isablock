// Consegne: la copia immutabile del lavoro di uno studente (nessuna interfaccia).
// Cosa è permesso lo decidono le REGOLE (firestore.rules.template); qui si controlla in
// anticipo per dare messaggi chiari. Id del documento = `<email>_<versione>`, l'ultima
// versione è quella valida. Una consegna non si modifica né si cancella mai.
//   - STUDENTE: consegna (manuale o automatica) = batch atomico {aggiorna il lavoro, crea la versione successiva}.
//     Mai una riconsegna: v2 e successive le crea solo il docente (decisione rimandata).
//   - DOCENTE: a verifica chiusa raccoglie dal lavoro com'è, o carica il file di emergenza.
import { lavoroDaDocumento } from './lavori.js';
import { verificaConfig } from './verifica-config.js';

const L = verificaConfig.regole;

export class ErroreConsegna extends Error {
  constructor(codice, messaggio) {
    super(messaggio);
    this.name = 'ErroreConsegna';
    this.codice = codice;
  }
}

function traduci(err, permessoNegato = 'Operazione non consentita.') {
  if (err instanceof ErroreConsegna) return err;
  const codice = err && err.code;
  if (codice === 'permission-denied') return new ErroreConsegna('negato', permessoNegato);
  if (codice === 'unavailable' || codice === 'deadline-exceeded') {
    return new ErroreConsegna('rete', 'Rete non disponibile: riprova tra poco.');
  }
  return new ErroreConsegna('altro', 'Qualcosa è andato storto. Riprova.');
}

const data = (t) => (t && typeof t.toDate === 'function' ? t.toDate() : null);

export function consegnaDaDocumento(snap) {
  const d = snap.data();
  return {
    id: snap.id,
    studenteEmail: d.studenteEmail,
    studenteNome: d.studenteNome,
    corsoId: d.corsoId,
    titolo: d.titolo,
    versione: d.versione,
    origine: d.origine,
    tracciaId: d.tracciaId,
    programma: d.programma,
    creato: data(d.creato),
    docenteEmail: d.docenteEmail ?? null,
    impronta: d.impronta ?? null,
    offlineDa: d.offlineDa ?? null,
    nBlocchiSincronizzati: d.nBlocchiSincronizzati ?? null,
    nomeFile: d.nomeFile ?? null,
  };
}

const perVersione = (a, b) => a.versione - b.versione;
const ultima = (elenco) => (elenco.length ? elenco[elenco.length - 1] : null);

async function intestazione(sdk, db, vid) {
  const snap = await sdk.getDoc(sdk.doc(db, 'verifiche', vid));
  if (!snap.exists()) throw new ErroreConsegna('assente', 'Questa verifica non esiste.');
  const v = snap.data();
  return { corsoId: v.corsoId, titolo: v.titolo };
}

// ── Studente ─────────────────────────────────────────────────────────────
export function creaConsegneStudente({ sdk, db }, emailUtente, nomeUtente) {
  const mia = String(emailUtente || '').toLowerCase();
  const nome = String(nomeUtente || mia).slice(0, 80);

  // Le proprie consegne di una verifica, dalla prima all'ultima.
  async function mie(vid) {
    try {
      const snap = await sdk.getDocs(sdk.query(sdk.collection(db, 'verifiche', vid, 'consegne'), sdk.where('studenteEmail', '==', mia)));
      return snap.docs.map(consegnaDaDocumento).sort(perVersione);
    } catch (err) { throw traduci(err); }
  }
  const miaUltima = async (vid) => ultima(await mie(vid));

  // Consegna: aggiorna il lavoro (con l'ultimo contenuto) e crea la v1 in UN batch. `dati` è l'ultimo
  // stato, come per salva(): { programma, programmaHash, nBlocchi, esecuzioni, campioni, tracciaRevVista }.
  // `origine`: 'studente' (pulsante) o 'automatica' (scaduto il tempo).
  // `giaEntrato: true` (lo sa il chiamante) evita di rimandare `entrato`: vedi lavori.js. Senza, si decide dalla lettura.
  async function consegna(vid, dati = {}, { origine = 'studente', giaEntrato = null } = {}) {
    if (origine !== 'studente' && origine !== 'automatica') throw new ErroreConsegna('dati', 'Origine non valida.');
    const rifLavoro = sdk.doc(db, 'verifiche', vid, 'lavori', mia);
    try {
      const snap = await sdk.getDoc(rifLavoro);
      if (!snap.exists()) throw new ErroreConsegna('assente', 'Il docente non ti ha ancora assegnato questa verifica.');
      const l = lavoroDaDocumento(snap);
      if (l.consegnato) throw new ErroreConsegna('gia', 'Hai già consegnato.');
      // Dopo una riapertura si riconsegna: il numero segue l'ultima consegna che c'è (v1 anche se era una raccolta del docente).
      const versione = ((ultima(await mie(vid)))?.versione ?? 0) + 1;
      if (versione > L.maxVersioniConsegna) throw new ErroreConsegna('limite', `Hai già consegnato ${L.maxVersioniConsegna} volte: non si può di più.`);
      const programma = dati.programma ?? l.programma;
      if (!programma) throw new ErroreConsegna('vuoto', 'Non c\'è niente da consegnare.');
      if (programma.length > L.maxProgramma) throw new ErroreConsegna('programma', 'Il programma è troppo grande per essere consegnato.');
      const { corsoId, titolo } = await intestazione(sdk, db, vid);
      const campi = {};
      for (const k of ['programmaHash', 'nBlocchi', 'esecuzioni', 'tracciaRevVista']) if (dati[k] !== undefined) campi[k] = dati[k];
      if (dati.campioni !== undefined) campi.campioni = dati.campioni.slice(-L.maxCampioni);
      const b = sdk.writeBatch(db);
      b.update(rifLavoro, {
        ...campi, programma, studenteNome: nome,
        ...((giaEntrato ?? !!l.entratoTs) ? {} : { entrato: sdk.serverTimestamp() }),   // solo se non era mai entrato
        ultimoSegnale: sdk.serverTimestamp(),
        consegnato: true, ultimaConsegna: versione,
      });
      b.set(sdk.doc(db, 'verifiche', vid, 'consegne', `${mia}_${versione}`), {
        studenteEmail: mia, studenteNome: nome, corsoId, titolo, versione, origine,
        tracciaId: l.tracciaId, programma, creato: sdk.serverTimestamp(),
      });
      await b.commit();
    } catch (err) { throw traduci(err, 'Non posso consegnare: la verifica è chiusa o il tuo tempo è scaduto.'); }
    return miaUltima(vid);
  }

  return { mie, miaUltima, consegna };
}

// ── Docente ──────────────────────────────────────────────────────────────
export function creaConsegneDocente({ sdk, db }, emailDocente) {
  const mia = String(emailDocente || '').toLowerCase();
  const col = (vid) => sdk.collection(db, 'verifiche', vid, 'consegne');
  const ref = (vid, email, n) => sdk.doc(db, 'verifiche', vid, 'consegne', `${email}_${n}`);

  async function elenca(vid) {
    try {
      const snap = await sdk.getDocs(col(vid));
      return snap.docs.map(consegnaDaDocumento).sort((a, b) => a.studenteEmail.localeCompare(b.studenteEmail, 'it') || perVersione(a, b));
    } catch (err) { throw traduci(err); }
  }

  // Ultima versione di ogni studente: { email: consegna }
  const ultimePerStudente = (consegne) => {
    const m = {};
    for (const c of consegne) if (!m[c.studenteEmail] || m[c.studenteEmail].versione < c.versione) m[c.studenteEmail] = c;
    return m;
  };

  // Raccolta (a verifica chiusa): per ogni studente ENTRATO crea una consegna dal lavoro com'è.
  // Si può rilanciare: salta chi ha già una consegna uguale al lavoro; se dopo una riapertura il
  // lavoro è cambiato, crea la versione successiva. Restituisce { create, giaAggiornati, nonEntrati, rifiutate }.
  async function raccogli(vid, lavori) {
    const { corsoId, titolo } = await intestazione(sdk, db, vid).catch((e) => { throw traduci(e); });
    const ultime = ultimePerStudente(await elenca(vid));
    const esito = { create: [], giaAggiornati: [], nonEntrati: [], rifiutate: [] };
    await Promise.all(lavori.map(async (l) => {
      if (!l.programma) { esito.nonEntrati.push(l.email); return; }
      const u = ultime[l.email];
      if (u && u.programma === l.programma) { esito.giaAggiornati.push(l.email); return; }
      const n = u ? u.versione + 1 : 1;
      if (n > L.maxVersioniConsegna) { esito.rifiutate.push(l.email); return; }
      try {
        await sdk.setDoc(ref(vid, l.email, n), {
          studenteEmail: l.email, studenteNome: l.studenteNome ?? l.email, corsoId, titolo, versione: n, origine: 'raccolta',
          tracciaId: l.tracciaId, programma: l.programma, creato: sdk.serverTimestamp(), docenteEmail: mia,
        });
        esito.create.push(l.email);
      } catch (err) {
        if (err && err.code === 'permission-denied') esito.rifiutate.push(l.email);
        else throw traduci(err);
      }
    }));
    return esito;
  }

  // Carica il file di emergenza di uno studente come nuova versione (a verifica chiusa).
  // `lavoro` è il suo lavoro (per traccia e nome); `file` ha già passato i controlli di integrità
  // dell'importazione: { programma, impronta, offlineDa, nBlocchiSincronizzati, nomeFile }.
  async function caricaFile(vid, lavoro, file) {
    const { corsoId, titolo } = await intestazione(sdk, db, vid).catch((e) => { throw traduci(e); });
    const esistenti = (await elenca(vid)).filter((c) => c.studenteEmail === lavoro.email);
    const n = (ultima(esistenti)?.versione ?? 0) + 1;
    if (n > L.maxVersioniConsegna) throw new ErroreConsegna('pieno', `Una consegna può avere al massimo ${L.maxVersioniConsegna} versioni.`);
    try {
      await sdk.setDoc(ref(vid, lavoro.email, n), {
        studenteEmail: lavoro.email, studenteNome: lavoro.studenteNome ?? file.studenteNome ?? lavoro.email, corsoId, titolo,
        versione: n, origine: 'file', tracciaId: lavoro.tracciaId, programma: file.programma, creato: sdk.serverTimestamp(),
        docenteEmail: mia, impronta: file.impronta, offlineDa: file.offlineDa ?? null,
        nBlocchiSincronizzati: file.nBlocchiSincronizzati ?? null, nomeFile: file.nomeFile,
      });
    } catch (err) { throw traduci(err, 'Non posso caricare il file: la verifica deve essere chiusa, e il file valido.'); }
    return n;
  }

  return { elenca, ultimePerStudente, raccogli, caricaFile };
}
