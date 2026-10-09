// Inizializzazione dell'SDK Firebase (bundle locale in vendor/firebase). Il
// resto di src/cloud/ non importa mai Firebase direttamente: passa da qui.
import * as sdk from '../../vendor/firebase/cloud.js';

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
  istanza = { sdk, auth, db };
  return istanza;
}
