# Cloud (opzionale): autenticazione

Stato: **accesso, ruolo (studente/docente), sketch personali, corsi con iscrizione
con codice, condivisione degli sketch col docente del corso**. Commenti del docente e
verifica non esistono ancora. Le decisioni di fondo sono nella nota di progetto
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
- **Regole**: solo il proprietario scrive ed elimina. Anche i docenti hanno sketch
  personali con le stesse regole. Un docente legge soltanto quelli che l'autore ha
  **condiviso** con un suo corso (vedi sotto).
- Codice: `src/cloud/sketch.js` (dati), `src/cloud/sketch-ui.js` (interfaccia, non
  conosce Blockly: riceve da `main.js` solo `corrente/isVuoto/occupato/carica`).

## Corsi e iscrizioni

I corsi si creano e si gestiscono **da console Firestore** (nessun pannello docente
per ora: con poche classi non serve). L'app permette solo di iscriversi con il codice
e di leggere i propri corsi («🎓 Corsi» nella toolbar).

**Creare un corso.** `npm run codice` stampa un codice casuale (Crockford Base32, 6
caratteri: niente I L O U; `npm run codice -- 5` ne dà cinque da scegliere). In
console: collezione `corsi` → documento con **ID = il codice** e i campi:

| Campo | Esempio | Note |
|---|---|---|
| `materia` | `Informatica` | |
| `classe` | `3AINF` | testo libero (come `classeId` in isaquiz) |
| `annoScolastico` | `2026/27` | |
| `docenti` | array di email (minuscole) | titolare e codocenti: per aggiungerne uno si aggiunge l'email |
| `iscrizioniAperte` | boolean | `true`: gli studenti si iscrivono col codice; `false`: solo a mano |
| `attivo` | boolean | `false` = archiviato (sparisce dagli elenchi); meglio che cancellare |
| `nome` | `Laboratorio TPSIT` | facoltativo; se manca si mostra «materia – classe (anno)» |

L'ID del corso è anche il suo codice, quindi **non si cambia**: per fermare nuovi
ingressi si mette `iscrizioniAperte: false`.

**Iscrizioni.** `iscrizioni/<CODICE>_<email minuscola>` con `corsoId` ed `email`.
- *Con il codice*: lo studente lo digita e il documento lo crea l'app. Le regole lo
  accettano solo se il corso esiste, è attivo e ha le iscrizioni aperte. Codice
  sbagliato, corso chiuso o archiviato danno lo stesso messaggio (non si rivela quali
  codici esistono). Il codice si scrive come capita: `ab-12 cd` vale `AB12CD`
  (maiuscolo, I/L→1, O→0, il resto scartato).
- *A mano (anche a corso chiuso)*: crea il documento con ID `<CODICE>_<email>`
  (es. `AB12CD_nome.cognome@isarome.it`) e i campi `corsoId` (il codice) ed `email`.
  Funziona anche per chi non ha mai fatto login.
- *Togliere uno studente*: cancella il suo documento in `iscrizioni`. Perde subito
  l'accesso al corso. Lo studente non può uscire da solo.
- Uno studente può essere in più corsi. **Un docente** (chi ha un documento in
  `docenti`) non si iscrive mai come studente, a nessun corso: le regole lo vietano e
  l'app non gli mostra il campo del codice. Per provare l'app «da studente» serve un
  account che non sia in `docenti`.

**Chi vede cosa.** Il corso lo legge chi è tra i suoi `docenti` o ha l'iscrizione;
ognuno vede solo le **proprie** iscrizioni. Nessuno scrive corsi dall'app.
Il docente vede nell'elenco anche il codice e se le iscrizioni sono aperte.

Codice: `src/cloud/corsi.js` (dati e codice), `src/cloud/corsi-ui.js` (interfaccia).

## Condivisione degli sketch col docente

Lo studente condivide **esplicitamente** uno sketch con un corso in cui è iscritto
(«I miei sketch» → «Condividi…»). Il docente di quel corso lo **legge**, mai lo scrive.

- **È un collegamento, non una copia.** Lo sketch resta uno solo, dello studente: il
  docente vede l'ultima versione che lo studente ha salvato nel cloud (non c'è
  salvataggio automatico, quindi vede solo ciò che è stato salvato). Salvando uno
  sketch condiviso, il «Salva» avvisa che il docente vedrà la nuova versione.
- **Un corso per sketch**; per cambiarlo si ripete «Condividi…». «Smetti di
  condividere» lo ritira in ogni momento.
- **Dati**: sullo sketch, `condivisoCon` (codice del corso o `null`), `proprietarioEmail`
  e `proprietarioNome` (servono al docente per riconoscere l'autore e alle regole per
  controllare l'iscrizione; si riscrivono a ogni salvataggio, così anche gli sketch
  vecchi si completano).
- **Chi legge**: il docente del corso (anche un codocente) **finché il corso è attivo
  e l'autore è ancora iscritto**. Se togli lo studente dal corso da console, o
  archivi il corso (`attivo: false`), lo sketch sparisce subito dalla vista del
  docente; lo studente continua a vederlo e a ritirare la condivisione (ma non a
  ri-condividerlo con un corso da cui è stato tolto).
- **Vista del docente** («🎓 Corsi» → «Sketch condivisi»): per ogni corso, autore,
  nome e data degli sketch condivisi. «Apri» lo mostra nell'editor **senza
  collegarlo al cloud**: è una copia, il «Salva» del docente ne crea uno suo e
  l'originale non si tocca mai.
- **Perché una query per iscritto.** Le regole di Firestore non sono filtri: devono
  essere dimostrabili dai vincoli della query, e «tutti gli sketch condivisi col
  corso X» non lo è (non dimostra che ogni autore sia ancora iscritto). Quindi il
  docente legge prima l'elenco degli iscritti del suo corso (permesso ai docenti,
  query con `corsoId == <codice>`) e poi, per ciascuno, i suoi sketch condivisi con
  quel corso (`condivisoCon == X` e `proprietarioEmail == <email>`), in parallelo.
  Per una classe di 25 sono circa 26 query a ogni apertura dell'elenco. Una query
  per un autore non iscritto viene rifiutata, quindi il docente non può nemmeno
  «sondare» email che non sono nel suo corso. Lo stesso motivo spiega perché non si
  può usare `in` con più email.
- Codice: `src/cloud/condivisi.js` (vista docente), `sketch.js` (`condividi`),
  `sketch-ui.js` e `corsi-ui.js`.

## Sito di prova (Firebase Hosting, progetto dev)

Per far provare l'app a pochi colleghi c'è un sito sul progetto dev:
`https://isablock-test.web.app` (sito Hosting `isablock-test`, definito in
`firebase.json`). **Il sito di produzione resta quello di GitHub Pages**; questo è solo
per le prove, con dati finti, e si può cancellare a fine prova.

- Non serve niente nel codice: un indirizzo che non sia `localhost` né
  `isablock.trikkulab.it` usa già la configurazione `dev`.
- `npm run deploy:test` prepara una **copia** dell'app in `.deploy-test/` (ignorata da
  git; senza `docs`, `test`, `scripts`, `node_modules`) e la pubblica. Nella copia
  accende l'interruttore del cloud (nel repository resta `false`), mette in cima un
  nastro «AMBIENTE DI PROVA» e il titolo «IsaBlock (prova)». `npm run deploy:test --
  --stage-only` prepara la cartella senza pubblicare, per guardarla. Le intestazioni
  `no-cache` su html/js/css fanno arrivare subito ai colleghi la versione nuova.
- Le **regole** si pubblicano a parte (`npm run deploy:rules:dev`): vanno pubblicate
  prima, e di nuovo ogni volta che cambiano.
- Chi può entrare: le regole dev ammettono chi ha un account `@isarome.it` con email
  verificata, oltre alle email di prova. **Quindi, tecnicamente, anche gli studenti**: il
  sito non è segreto e va comunicato solo ai colleghi coinvolti.
- Dati: nome ed email di chi accede finiscono in `utenti/` e negli sketch condivisi, su
  un progetto personale. Vanno avvisati i colleghi (ambiente di prova, niente di
  riservato, tutto cancellato a fine prova). Niente dati di alunni.

**Prima volta** (con l'account del progetto dev):
1. `npm run use:dev`
2. `firebase hosting:sites:create isablock-test` (il nome è unico al mondo: se è
   occupato se ne sceglie un altro e si aggiorna `site` in `firebase.json`)
3. `npm run deploy:rules:dev`, poi `npm run deploy:test`
4. Se il login Google dà errore di dominio: console → Authentication → Settings →
   *Authorized domains* → aggiungere `isablock-test.web.app`.
5. Per chi deve provare il ruolo docente: documento `docenti/<email>` da console; i corsi
   di prova si creano da console come in «Corsi e iscrizioni».

**Fine prova:** cancellare i dati dalla console (collezioni `utenti`, `sketch`,
`iscrizioni`, `corsi`, `docenti`) e, se si vuole, il sito con
`firebase hosting:sites:delete isablock-test`.

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
