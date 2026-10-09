// Punto d'ingresso del cloud. Viene caricato con import() SOLO dopo il clic su
// "Accedi" (o al ricaricamento, se l'utente era già entrato: vedi
// SESSIONE_KEY in ui.js). Con appConfig.cloud.enabled spento non viene mai
// importato. Niente di questa cartella è usato dall'app offline.
import { caricaConfig } from './env.js';
import { avviaFirebase } from './firebase-client.js';
import { creaAuth } from './auth.js';

export async function avviaCloud() {
  const config = await caricaConfig();
  if (!config.firebase) {
    const e = new Error('Il cloud non è ancora configurato per questo indirizzo.');
    e.codice = 'non-configurato';
    throw e;
  }
  const client = avviaFirebase(config);
  // Aspetta che l'SDK sia pronto, compreso l'iframe nascosto con cui il popup
  // di Google rimanda l'esito alla pagina: se il popup si apre prima, nell'
  // emulatore compare "Auth Emulator Internal Error" (e su Google vero il
  // login può fallire). authStateReady() non basta: l'iframe lo prepara
  // getRedirectResult(), che qui non serve per il risultato ma per l'attesa.
  await client.auth.authStateReady();
  await client.sdk.getRedirectResult(client.auth).catch(() => {});
  return { ambiente: config.ambiente, auth: creaAuth(client, config) };
}
