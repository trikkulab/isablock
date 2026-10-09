// Accesso con Google e ruolo (studente/docente).
//
// Chi può entrare e chi è docente lo decidono le REGOLE di Firestore, non
// questo file: il client prova a leggere docenti/{mia email}; le regole
// rispondono "permesso negato" se l'account non è ammesso (dominio sbagliato,
// email non verificata, email di prova non in elenco), "assente" se è uno
// studente, "presente" se è un docente. Il ruolo non viene mai scritto da
// nessuna parte: si ricalcola a ogni accesso. Vedi docs/CLOUD.md.
import { DOMINIO } from './env.js';

export class ErroreAccesso extends Error {
  constructor(codice, messaggio) {
    super(messaggio);
    this.name = 'ErroreAccesso';
    this.codice = codice;
  }
}

export const RUOLI = Object.freeze({ studente: 'studente', docente: 'docente' });

function separaNome(displayName, email) {
  const parti = String(displayName || '').trim().split(/\s+/).filter(Boolean);
  if (parti.length === 0) return { nome: String(email || '').split('@')[0] || '', cognome: '' };
  return { nome: parti[0], cognome: parti.slice(1).join(' ') };
}

// Legge il ruolo e allinea utenti/{uid}. Lancia ErroreAccesso('non-ammesso')
// se le regole rifiutano l'account.
async function profiloDa({ sdk, db }, user) {
  const email = (user.email || '').toLowerCase();
  let ruolo;
  try {
    const snap = await sdk.getDoc(sdk.doc(db, 'docenti', email));
    ruolo = snap.exists() ? RUOLI.docente : RUOLI.studente;
    const { nome, cognome } = separaNome(user.displayName, email);
    await sdk.setDoc(sdk.doc(db, 'utenti', user.uid), { email, nome, cognome });
  } catch (err) {
    if (err && err.code === 'permission-denied') {
      throw new ErroreAccesso('non-ammesso', `Usa l'account della scuola (@${DOMINIO}) con l'email verificata.`);
    }
    throw new ErroreAccesso('rete', 'Impossibile contattare il servizio. Riprova più tardi.');
  }
  return { uid: user.uid, email, nome: user.displayName || email, ruolo };
}

export function creaAuth(client, config) {
  const { sdk, auth } = client;
  const ascoltatori = new Set();
  let generazione = 0;
  let corrente = null;

  const emetti = (stato) => ascoltatori.forEach((cb) => cb(stato));

  sdk.onAuthStateChanged(auth, async (user) => {
    const mia = ++generazione;
    if (!user) { corrente = null; emetti({ utente: null }); return; }
    try {
      const utente = await profiloDa(client, user);
      if (mia !== generazione) return;
      corrente = utente;
      emetti({ utente });
    } catch (err) {
      if (mia !== generazione) return;
      await sdk.signOut(auth);
      corrente = null;
      emetti({ utente: null, errore: err });
    }
  });

  return {
    ascolta(cb) { ascoltatori.add(cb); return () => ascoltatori.delete(cb); },
    utente: () => corrente,
    async accedi() {
      const provider = new sdk.GoogleAuthProvider();
      const params = { prompt: 'select_account' };
      if (config.suggerisciDominio) params.hd = DOMINIO;
      provider.setCustomParameters(params);
      // Il popup va aperto subito, senza await prima: Safari lo lega al gesto
      // dell'utente (come in isaquiz).
      try {
        await sdk.signInWithPopup(auth, provider);
      } catch (err) {
        if (err && (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request')) return;
        throw new ErroreAccesso('popup', err && err.code === 'auth/popup-blocked'
          ? 'Il browser ha bloccato la finestra di accesso: consentila e riprova.'
          : 'Accesso non riuscito. Riprova.');
      }
    },
    esci: () => sdk.signOut(auth),
  };
}
