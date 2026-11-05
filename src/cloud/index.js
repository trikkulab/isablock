// Punto d'ingresso del cloud. Viene caricato con import() SOLO dopo il clic su
// "Accedi" (o al ricaricamento, se l'utente era già entrato: vedi
// SESSIONE_KEY in ui.js). Con appConfig.cloud.enabled spento non viene mai
// importato. Niente di questa cartella è usato dall'app offline.
import { caricaConfig } from './env.js';
import { avviaFirebase } from './firebase-client.js';
import { creaAuth } from './auth.js';
import { creaSketch } from './sketch.js';
import { creaCorsi } from './corsi.js';
import { creaCondivisi } from './condivisi.js';
import { creaGestione } from './gestione-corsi.js';
import { creaCommenti } from './commenti.js';
import { creaVerificaDocente } from './verifica-docente.js';
import { creaVerificheStudente, creaSessione } from './verifica-studente.js';
import { creaBackupVerifica, pulisciBackup } from '../verifica-backup.js';

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
  return {
    ambiente: config.ambiente,
    auth: creaAuth(client, config),
    sketchPer: (uid, profilo) => creaSketch(client, uid, profilo),
    condivisi: creaCondivisi(client),
    corsiPer: (email, ruolo) => creaCorsi(client, email, ruolo),
    gestionePer: (email) => creaGestione(client, email),
    commentiPer: (profilo) => creaCommenti(client, profilo),
    verificaDocentePer: (email) => creaVerificaDocente(client, email),
    // Lo studente: trovare le verifiche da fare e aprire la sessione di una di esse.
    verificaStudentePer: (email, nome) => ({
      ...creaVerificheStudente(client, email, nome),
      // La copia locale ha una chiave per studente e verifica (uid dell'account collegato).
      nuovaSessione: (vid, opzioni) => creaSessione(client, email, nome, vid,
        { backup: creaBackupVerifica({ uid: client.auth.currentUser?.uid ?? email, vid, email }), ...opzioni }),
      // Elimina le copie di verifiche finite (le non sincronizzate restano e sono restituite).
      pulisciCopie: (attive) => pulisciBackup({ uid: client.auth.currentUser?.uid ?? email, attive }),
    }),
  };
}
