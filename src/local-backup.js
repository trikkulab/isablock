// Copia di sicurezza locale (localStorage), pensata per non perdere il lavoro
// se il browser si chiude per errore. Non sa nulla di Blockly: lavora su
// testo (il JSON del programma) e su una chiave a scelta, così lo stesso
// meccanismo può servire anche ad altro (es. un futuro backup della modalità
// verifica, con una chiave distinta).
//
// Il localStorage può mancare o lanciare (navigazione privata, dati del sito
// bloccati): ogni accesso sta in try/catch e l'app funziona lo stesso.

// Hash veloce (djb2) per confrontare due testi senza tenerli entrambi.
export function hashText(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16);
}

const HEARTBEAT_MS = 5000;
// Una scheda è considerata chiusa se non dà segni di vita da tanto.
const LIVE_STALE_MS = 20000;

// Ogni scheda scrive la PROPRIA copia (chiave `${key}:${tabId}`), così più
// schede non si sovrascrivono. All'apertura si elencano le copie delle schede
// che non ci sono più (listCopies), da cui lo studente sceglie cosa
// riprendere. Una copia ripresa passa alla scheda corrente (adopt) e sparisce
// dalla lista.
export function createLocalBackup({
  key,
  maxAgeMs = Infinity,
  maxCopies = 5,
  getStorage = () => window.localStorage,
  now = Date.now,
  tabId = Math.random().toString(36).slice(2),
}) {
  const ownKey = `${key}:${tabId}`;
  const livePrefix = `${key}:live:`;
  let armed = false; // finché è false, save() non scrive mai
  let heartbeatTimer = null;

  function storage() {
    try {
      return getStorage() || null;
    } catch {
      return null;
    }
  }

  function readJson(k) {
    try {
      const raw = storage()?.getItem(k);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function readRecord(k) {
    const rec = readJson(k);
    return rec && typeof rec.json === 'string' && typeof rec.savedAt === 'number' ? rec : null;
  }

  function writeJson(k, value) {
    try {
      storage().setItem(k, JSON.stringify(value));
      return true;
    } catch {
      return false; // spazio pieno o storage assente
    }
  }

  function removeKey(k) {
    try {
      storage()?.removeItem(k);
    } catch {
      // niente da fare
    }
  }

  function allKeys() {
    try {
      const st = storage();
      const keys = [];
      for (let i = 0; i < st.length; i++) keys.push(st.key(i));
      return keys;
    } catch {
      return [];
    }
  }

  function isLive(id) {
    const live = readJson(livePrefix + id);
    return !!live && now() - live.at < LIVE_STALE_MS;
  }

  function writeLive() {
    writeJson(livePrefix + tabId, { at: now() });
  }

  return {
    available() {
      return !!storage();
    },

    // Le copie che si possono riprendere: quelle di schede ormai chiuse,
    // diverse dall'ultimo file salvato, non scadute, al massimo maxCopies
    // (le più recenti). Fa anche pulizia: toglie le scadute, quelle uguali a
    // un file e quelle in eccesso. Non include mai la copia di questa scheda.
    listCopies() {
      if (!storage()) return [];
      const copies = [];
      for (const k of allKeys()) {
        if (k !== key && !k.startsWith(`${key}:`)) continue;
        if (k.startsWith(livePrefix) || k === ownKey) continue;
        const record = readRecord(k);
        if (!record) continue;
        const id = k === key ? 'legacy' : k.slice(key.length + 1);
        if (id !== 'legacy' && isLive(id)) continue;
        if (now() - record.savedAt > maxAgeMs || record.hash === record.fileHash) {
          removeKey(k);
          continue;
        }
        copies.push({ ...record, storageKey: k });
      }
      copies.sort((x, y) => y.savedAt - x.savedAt);
      for (const extra of copies.splice(maxCopies)) removeKey(extra.storageKey);
      return copies;
    },

    // Da chiamare dopo la scelta sul ripristino (o subito se non c'è nulla).
    enable() {
      armed = true;
      if (!storage()) return;
      writeLive();
      if (!heartbeatTimer) heartbeatTimer = setInterval(writeLive, HEARTBEAT_MS);
    },

    // Scrive la copia di questa scheda. Risultato: 'saved' | 'unchanged' |
    // 'empty' | 'error' | 'disabled'. Un programma vuoto non scrive mai, per
    // non sovrascrivere una copia buona. `info` è un riassunto per la lista
    // (qualsiasi oggetto serializzabile).
    save(json, { isEmpty = false, info = null } = {}) {
      if (!armed) return 'disabled';
      if (isEmpty) return 'empty';
      const previous = readRecord(ownKey);
      const hash = hashText(json);
      if (previous && previous.hash === hash) return 'unchanged';
      const ok = writeJson(ownKey, {
        v: 2, savedAt: now(), hash, fileHash: previous?.fileHash ?? null, info, json,
      });
      return ok ? 'saved' : 'error';
    },

    // Dopo un salvataggio su file (o l'apertura di un file): la copia
    // coincide con il file, quindi non c'è nulla da ripristinare.
    markFileSaved(json, info = null) {
      if (!armed) return;
      const hash = hashText(json);
      writeJson(ownKey, { v: 2, savedAt: now(), hash, fileHash: hash, info, json });
    },

    // Una copia ripresa passa a questa scheda e sparisce dall'elenco. La
    // scrittura avviene prima della cancellazione: nessun momento senza copia.
    adopt(record) {
      if (writeJson(ownKey, { ...record, storageKey: undefined, savedAt: now() })) removeKey(record.storageKey);
    },

    // Scarta una copia dall'elenco (o quella di questa scheda se omessa).
    remove(record) {
      removeKey(record ? record.storageKey : ownKey);
    },

    // Alla chiusura della pagina: questa scheda non è più viva, la sua copia
    // diventa riprendibile da altre.
    release() {
      removeKey(livePrefix + tabId);
    },

    ownSavedAt() {
      return readRecord(ownKey)?.savedAt ?? null;
    },
  };
}

// Raggruppa molte notifiche ravvicinate in una sola azione ritardata.
export function createDebouncedSaver(action, delayMs = 1000) {
  let timer = null;
  return {
    schedule() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        action();
      }, delayMs);
    },
    // Esegue subito l'azione, ma solo se c'era una modifica in attesa.
    flush() {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
      action();
    },
    cancel() {
      clearTimeout(timer);
      timer = null;
    },
  };
}
