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

export function createLocalBackup({
  key,
  maxAgeMs,
  getStorage = () => window.localStorage,
  now = Date.now,
  tabId = Math.random().toString(36).slice(2),
}) {
  const liveKey = `${key}:live`;
  let armed = false; // finché è false, save() non scrive mai
  let owner = false; // questa scheda è quella che salva
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

  function readRecord() {
    const rec = readJson(key);
    return rec && typeof rec.json === 'string' && typeof rec.savedAt === 'number' ? rec : null;
  }

  function writeRecord(rec) {
    try {
      storage().setItem(key, JSON.stringify(rec));
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

  // Un'altra scheda è viva se ha scritto il segnale di vita da poco.
  function otherTabIsLive() {
    const live = readJson(liveKey);
    return !!live && live.tabId !== tabId && now() - live.at < LIVE_STALE_MS;
  }

  function writeLive() {
    try {
      storage().setItem(liveKey, JSON.stringify({ tabId, at: now() }));
    } catch {
      // vedi sopra
    }
  }

  // Prova a diventare la scheda che salva. Fallisce se un'altra è viva.
  function claim() {
    if (otherTabIsLive()) {
      owner = false;
      return false;
    }
    owner = true;
    writeLive();
    return true;
  }

  return {
    // Da chiamare all'apertura, prima di abilitare i salvataggi. Stato:
    //   'unavailable' storage assente · 'other-tab' c'è un'altra scheda viva
    //   'none' niente da ripristinare · 'restorable' (con record) c'è una copia
    //   diversa dall'ultimo file salvato.
    inspect() {
      if (!storage()) return { status: 'unavailable' };
      if (otherTabIsLive()) return { status: 'other-tab' };
      const record = readRecord();
      if (!record) return { status: 'none' };
      if (now() - record.savedAt > maxAgeMs) {
        removeKey(key);
        return { status: 'none' };
      }
      if (record.hash === record.fileHash) return { status: 'none' };
      return { status: 'restorable', record };
    },

    // Da chiamare dopo la scelta sul ripristino (o subito se non c'è nulla).
    enable() {
      armed = true;
      if (!storage()) return;
      claim();
      if (!heartbeatTimer) {
        heartbeatTimer = setInterval(() => {
          if (owner) writeLive();
        }, HEARTBEAT_MS);
      }
    },

    // Scrive la copia. Risultato: 'saved' | 'unchanged' | 'empty' |
    // 'other-tab' | 'error' | 'disabled'. Un programma vuoto non scrive mai,
    // per non sovrascrivere una copia buona.
    save(json, { isEmpty = false } = {}) {
      if (!armed) return 'disabled';
      if (isEmpty) return 'empty';
      // Anche se eravamo la scheda che salva, un'altra potrebbe aver preso il
      // posto nel frattempo: claim() lo controlla ogni volta.
      if (!claim()) return 'other-tab';
      const previous = readRecord();
      const hash = hashText(json);
      if (previous && previous.hash === hash) return 'unchanged';
      const ok = writeRecord({
        v: 1,
        savedAt: now(),
        hash,
        fileHash: previous?.fileHash ?? null,
        json,
      });
      return ok ? 'saved' : 'error';
    },

    // Dopo un salvataggio su file (o l'apertura di un file): la copia
    // coincide con il file, quindi non c'è nulla da ripristinare.
    markFileSaved(json) {
      if (!armed || !claim()) return;
      const hash = hashText(json);
      writeRecord({ v: 1, savedAt: now(), hash, fileHash: hash, json });
    },

    // Cancella la copia (pulsante "Cancella copia" e "Nuovo").
    clear() {
      removeKey(key);
    },

    // Alla chiusura della pagina: libera il posto per altre schede.
    release() {
      if (owner) removeKey(liveKey);
      owner = false;
    },

    savedAt() {
      return readRecord()?.savedAt ?? null;
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
