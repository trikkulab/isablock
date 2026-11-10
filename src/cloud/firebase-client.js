// Inizializzazione dell'SDK Firebase (bundle locale in vendor/firebase). Il
// resto di src/cloud/ non importa mai Firebase direttamente: passa da qui.
import * as sdk from '../../vendor/firebase/cloud.js';
import { contatoreAttivo, creaContatore, avvolgi, montaPulsanteContatore } from './contatore-letture.js';

let istanza = null;

export function avviaFirebase(config) {
  if (istanza) return istanza;
  const app = sdk.initializeApp(config.firebase);
  const auth = sdk.getAuth(app);
  const db = sdk.getFirestore(app);
  if (config.emulatori) {
    sdk.connectAuthEmulator(auth, `http://127.0.0.1:${config.emulatori.authPort}`, { disableWarnings: true });
    sdk.connectFirestoreEmulator(db, '127.0.0.1', config.emulatori.firestorePort);
  }
  // Con ?contatore=1 l'sdk conta le letture (solo nel browser, niente sul database): vedi contatore-letture.js.
  let sdkUsato = sdk;
  if (contatoreAttivo()) {
    const contatore = creaContatore({ storage: (() => { try { return sessionStorage; } catch { return null; } })() });
    sdkUsato = avvolgi(sdk, contatore);
    montaPulsanteContatore(contatore);
  }
  istanza = { sdk: sdkUsato, auth, db };
  return istanza;
}
