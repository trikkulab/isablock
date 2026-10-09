// Sceglie la configurazione cloud in base all'indirizzo da cui l'app è servita
// (il sito è pubblicato via git su GitHub Pages: un file ignorato da git non
// arriverebbe online, quindi la scelta avviene qui, a runtime).
//   localhost / 127.0.0.1  -> emulatori locali, progetto fittizio demo-isablock
//                             (con ?cloud=dev nell'indirizzo: progetto dev REALE,
//                             per provare Google vero senza cambiare indirizzo)
//   HOST_SCUOLA            -> config.scuola.js
//   qualsiasi altro host   -> config.dev.js (rimosso dal ramo rel: lì non c'è)
// Le config si importano in modo dinamico, così l'assenza di config.dev.js su
// rel non rompe niente.

export const HOST_SCUOLA = ['isablock.trikkulab.it'];
export const DOMINIO = 'isarome.it';
export const EMULATORI = Object.freeze({ authPort: 9199, firestorePort: 8186 });

export function ambienteDa(hostname, search = '') {
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return new URLSearchParams(search).get('cloud') === 'dev' ? 'dev' : 'emulatore';
  }
  return HOST_SCUOLA.includes(hostname) ? 'scuola' : 'dev';
}

export async function caricaConfig(hostname = window.location.hostname, search = window.location.search) {
  const ambiente = ambienteDa(hostname, search);
  if (ambiente === 'emulatore') {
    return {
      ambiente,
      firebase: { apiKey: 'demo-key', projectId: 'demo-isablock', authDomain: 'localhost' },
      suggerisciDominio: false,
      emulatori: EMULATORI,
    };
  }
  try {
    const mod = await import(ambiente === 'scuola' ? './config.scuola.js' : './config.dev.js');
    return { ambiente, ...mod.default };
  } catch {
    return { ambiente, firebase: null };
  }
}
