# Cloud (opzionale): autenticazione

Stato: **accesso, ruolo (studente/docente) e sketch personali**. Condivisione col
docente, corsi e verifica non esistono ancora. Le decisioni di fondo sono nella nota di progetto
"cloud e verifica live"; qui c'è ciò che serve per usare e mantenere il codice.

## Principi

- Il cloud è uno strato **in più**: l'app offline funziona identica a prima.
  `appConfig.cloud.enabled` è `false` per default: senza, non compare "Accedi"
  e non si carica nulla da `src/cloud/` né da `vendor/firebase/`.
- Con l'interruttore acceso, l'SDK Firebase si carica **solo dopo il clic su
  "Accedi"** (o al ricaricamento, se l'utente era già entrato: indizio
  `isablock.cloud.sessione` in localStorage, tolto all'uscita).
- Niente Cloud Functions (piano gratuito). Nessuna chiave di servizio nel repo.
  I valori in `config.*.js` sono la config web: non sono segreti.

## Ambienti

| Ambiente | Quando | Config |
|---|---|---|
| emulatore | `localhost` / `127.0.0.1` | inline in `src/cloud/env.js`, progetto `demo-isablock` |
| scuola | host in `HOST_SCUOLA` (`isablock.trikkulab.it`) | `src/cloud/config.scuola.js` |
| dev | qualsiasi altro host | `src/cloud/config.dev.js` |

Su localhost si può forzare il progetto **dev reale** aggiungendo `?cloud=dev`
all'indirizzo (es. `http://localhost:8000/?cloud=dev`): serve per provare il
login Google vero. `localhost` è già tra i domini autorizzati di default; il
parametro vale solo per `dev`, mai per `scuola`. Senza parametro, localhost usa
sempre gli emulatori.

Entrambe le config sono committate (il sito esce via git su GitHub Pages, un file
ignorato non arriverebbe online); la scelta è per hostname, a runtime. Le config
si importano dinamicamente, e `scripts/publish-rel.sh` toglie `config.dev.js` da
`rel`: il sito pubblico non contiene mai il progetto dev.

Parte CLI: `npm run use:dev` / `npm run use:scuola` fanno `firebase login:use` e
`firebase use` (vedi `scripts/environments.json`). Non copiano config.

Collegare un progetto reale (una tantum): creare il progetto e la web app in
console, abilitare Authentication → Google e Firestore (europe-west8),
`firebase use --add` con alias `dev`/`scuola`, incollare
`firebase apps:sdkconfig web` in `config.<ambiente>.js` (campo `firebase`).
Poi `npm run deploy:rules:dev` (o `:scuola`), che rifiuta di partire se la CLI
non è sul progetto giusto.

## Regole Firestore

`firestore.rules.template` è il modello; `node scripts/build-rules.mjs <env>`
genera `firestore.rules` (ignorato da git) sostituendo dominio ed email di prova
da `scripts/environments.json`, completato da `scripts/environments.local.json` (ignorato da git, vedi sotto).

- **scuola**: solo dominio `isarome.it`, email verificata, nessuna email di prova.
- **dev**: dominio **oppure** le email di prova (`dev.emailProva`, nel file locale), sempre
  verificate: il dominio non vale per l'account personale.
- **docente** = esiste `docenti/{email minuscola}`, creato **solo da console**.
  Ognuno legge solo il documento della propria email: niente elenco consultabile
  (scelta diversa da isaquiz, dove l'array è leggibile da tutti).
- Il ruolo non è memorizzato: si ricalcola a ogni accesso. `utenti/{uid}`
  contiene solo email, nome, cognome, scrivibili solo dal proprietario.
- Il client non decide chi è ammesso: prova a leggere `docenti/{mia email}` e le
  regole rispondono (permesso negato = account non ammesso → uscita con messaggio).
- Tutto il resto è negato.

Aggiungere un docente: console Firestore → collezione `docenti` → documento con
ID = email in minuscolo. **Il contenuto del documento è ignorato: conta solo che
esista** (regole e client controllano l'esistenza, non leggono campi). La console
chiede almeno un campo: va bene uno qualsiasi, per convenzione `attivo: true`.
Per togliere il ruolo si cancella il documento. Un eventuale ruolo admin, o un
`attivo: false` che disattiva senza cancellare, si aggiungerà solo quando serviranno
(le regole andranno aggiornate e testate).

## Dati personali: environments.local.json

Il repository è pubblico, quindi `scripts/environments.json` non contiene email né
account. Quelli personali stanno in `scripts/environments.local.json` (ignorato da
git, **da ricreare su un'altra macchina**):

```json
{
  "dev": {
    "account": "account-della-CLI@esempio.it",
    "emailProva": ["prova1@esempio.it", "prova2@isarome.it"],
    "docentiProva": ["prova2@isarome.it"]
  }
}
```

Il file locale sovrascrive, per ambiente, i campi che contiene. Senza, `emailProva`
è vuota: le regole dev ammettono solo il dominio.

## Sketch personali

Dopo il login compaiono «☁ Salva» e «☁ I miei sketch» nella toolbar.

- **Salva**: propone un nome a caso (animale-aggettivo, es. `pangolino-ridente`,
  `src/cloud/nomi.js`), modificabile. Se si sta lavorando su uno sketch aperto
  dal cloud offre «Aggiorna» oppure «Salva come nuovo»; altrimenti crea un nuovo
  sketch. Nomi uguali sono ammessi (si distinguono dalla data).
- **I miei sketch**: elenco con data di modifica; Apri, Rinomina, Elimina. Aprire
  chiede conferma se c'è un programma in corso. Nuovo / apri file / esempio
  "scollegano" lo sketch aperto, così «Salva» non lo sovrascrive per errore.
- **Nessun salvataggio automatico nel cloud**: solo su richiesta. L'autosave
  resta quello locale (`src/local-backup.js`).
- **Dati**: `sketch/<uid>_<n>`, n da 0 a 49, con `proprietarioUid`, `nome`
  (max 60), `creato`, `modificato` (ora del server) e `programma` (testo JSON
  uguale al file di «Salva», max 200000 caratteri). L'id deterministico è il tetto
  di **50 sketch per persona**, imposto dalle regole senza Cloud Functions; una
  scrittura su un id occupato viene rifiutata, quindi due schede non si
  sovrascrivono.
- **Regole**: solo il proprietario legge, scrive ed elimina; nessun altro,
  docente compreso. Anche i docenti hanno sketch personali con le stesse regole.
  La condivisione esplicita col docente della classe è un passo successivo.
- Codice: `src/cloud/sketch.js` (dati), `src/cloud/sketch-ui.js` (interfaccia, non
  conosce Blockly: riceve da `main.js` solo `corrente/isVuoto/occupato/carica`).

## Sviluppo e test

```
npm run test:cloud     # regole sull'emulatore (ambiente "test"), + test del generatore
npm run emulators      # emulatori Auth + Firestore con regole dev (UI su :4100);
                       # i dati restano in .emulator-data (cancellarla per ripartire da zero)
                       # e i docenti di prova (environments.local.json, dev.docentiProva) si ricreano ogni volta
python3 -m http.server # e aprire http://localhost:8000 con cloud.enabled = true
npm run vendor:firebase  # rigenera vendor/firebase/cloud.js (solo per aggiornare Firebase)
```

Nell'emulatore l'accesso Google è una finestra fittizia dove si inventa l'account.
Il ruolo docente in locale lo danno i `docentiProva` di `scripts/environments.local.json`.

## Note

- Il popup Google dovrebbe aprirsi senza `await` tra clic e `signInWithPopup`
  (Safari). Qui la prima volta c'è il caricamento dell'SDK dopo il clic: su Safari
  il popup può essere bloccato; il messaggio chiede di riprovare, e il secondo
  clic funziona (SDK già caricato). Da verificare su Safari reale.
- Il dominio del sito va aggiunto tra i "domini autorizzati" di Authentication.
