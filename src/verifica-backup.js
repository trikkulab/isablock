// Copia locale del lavoro DURANTE una verifica (localStorage). Non sa nulla di Blockly né di Firebase.
//
// Ha una chiave propria per studente e verifica (`isablock.verifica.backup.<uid>.<vid>`), distinta da quella delle copie
// automatiche normali: non compare mai nell'elenco di ripristino e la riapre solo la sessione di verifica dello stesso
// studente. È una regola dell'app, non una sicurezza (nei PC di laboratorio condivisi lo stesso browser serve più persone):
// per questo la copia si elimina a consegna, a chiusura e al prossimo avvio di chiunque se la verifica non è più attiva.
//
// Quale riaprire alla ripresa, copia locale o database? NON si confrontano le ore (l'orologio del PC è inaffidabile e,
// offline, non si può correggere): si guarda la DISCENDENZA degli hash. La copia ricorda `hashBase`, l'hash che il database
// aveva all'ultima sincronizzazione:
//   - locale == database                    → sono uguali;
//   - base == database e locale != database → il database non si è mosso dopo la copia: la locale ha modifiche non inviate;
//   - altrimenti                            → il database è cambiato da un'altra scheda o PC: vince il database.
// Il localStorage può mancare o lanciare (navigazione privata, spazio pieno): ogni accesso sta in try/catch.
export const PREFISSO = 'isablock.verifica.backup.';
// Una copia con modifiche mai arrivate al database non si elimina in silenzio alla scadenza (lo studente deve poterla
// salvare su file e portarla al docente), ma non resta in eterno su un computer condiviso.
const TENUTA_NON_SINCRONIZZATA_MS = 7 * 24 * 60 * 60 * 1000;

export const chiaveBackup = (uid, vid) => `${PREFISSO}${uid}.${vid}`;

// 'uguali' | 'locale' | 'server'
export function scegliPunto({ hashLocale, hashBase, hashServer }) {
  const s = hashServer ?? null;
  if ((hashLocale ?? null) === s) return 'uguali';
  if ((hashBase ?? null) === s) return 'locale';
  return 'server';
}

export const nonSincronizzata = (rec) => !!rec && rec.hash !== (rec.hashBase ?? null);

function storageDi(getStorage) {
  try { return getStorage() || null; } catch { return null; }
}

// La copia di UNA verifica di UNO studente.
export function creaBackupVerifica({ uid, vid, email = '', getStorage = () => window.localStorage, now = Date.now }) {
  const chiave = chiaveBackup(uid, vid);
  return {
    // `rec`: { finoA, programma, hash, hashBase, nBlocchi, esecuzioni, traccia }. Restituisce false se non riesce a scrivere.
    salva(rec) {
      try {
        storageDi(getStorage).setItem(chiave, JSON.stringify({ v: 1, uid, vid, email, ...rec, salvataAlle: now() }));
        return true;
      } catch { return false; }
    },
    leggi() {
      try {
        const r = JSON.parse(storageDi(getStorage)?.getItem(chiave) ?? 'null');
        return r && r.uid === uid && r.vid === vid && typeof r.programma === 'string' ? r : null;
      } catch { return null; }
    },
    cancella() {
      try { storageDi(getStorage)?.removeItem(chiave); } catch { /* storage non disponibile */ }
    },
  };
}

// Tutte le copie di verifica presenti nel browser (di chiunque), già lette.
export function elencaBackup({ getStorage = () => window.localStorage } = {}) {
  const st = storageDi(getStorage);
  const trovate = [];
  if (!st) return trovate;
  try {
    for (let i = 0; i < st.length; i++) {
      const k = st.key(i);
      if (!k || !k.startsWith(PREFISSO)) continue;
      let rec = null;
      try { rec = JSON.parse(st.getItem(k)); } catch { /* illeggibile: si elimina */ }
      trovate.push({ chiave: k, rec: rec && typeof rec === 'object' ? rec : null });
    }
  } catch { /* storage non disponibile */ }
  return trovate;
}

// Pulizia all'avvio. `attive`: gli id delle verifiche ancora da svolgere per lo studente collegato (`uid`).
// Si eliminano: le copie illeggibili; quelle di una verifica non più attiva per questo studente; quelle di chiunque altro
// scadute (`finoA`). Fanno eccezione le copie con modifiche non sincronizzate: restano (per salvarle su file) fino a una
// settimana oltre la scadenza. Restituisce quelle da non perdere, per chi vorrà proporre il file di emergenza.
export function pulisciBackup({ uid, attive = [], adesso = Date.now(), getStorage = () => window.localStorage }) {
  const st = storageDi(getStorage);
  const daSalvare = [];
  for (const { chiave, rec } of elencaBackup({ getStorage })) {
    let elimina;
    if (!rec || typeof rec.finoA !== 'number') elimina = true;
    else {
      const mia = rec.uid === uid;
      const finita = mia ? !attive.includes(rec.vid) : rec.finoA < adesso;
      if (!finita) continue;
      elimina = !nonSincronizzata(rec) || rec.finoA + TENUTA_NON_SINCRONIZZATA_MS < adesso;
      if (!elimina) daSalvare.push(rec);
    }
    if (elimina) { try { st?.removeItem(chiave); } catch { /* idem */ } }
  }
  return daSalvare;
}
