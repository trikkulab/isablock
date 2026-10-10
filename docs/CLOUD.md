# Cloud (opzionale): autenticazione

Stato: **accesso, ruolo (studente/docente), sketch personali, corsi (creati e gestiti dal
docente nell'app) con iscrizione col codice o a mano, condivisione degli sketch col docente
del corso, commenti del docente sugli sketch condivisi**. La verifica non esiste ancora. Le decisioni di fondo sono nella nota di progetto
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
- Corsi e iscrizioni: vedi «Corsi e iscrizioni». Tutto il resto è negato.

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

## Accesso e menu Cloud

Nella toolbar c'è **un solo elemento** del cloud (`src/cloud/ui.js`):

- **Prima del login: «☁ Accedi».** Apre una finestra che spiega a cosa serve, che l'uso
  è facoltativo e **quali dati vengono salvati** (nome ed email della scuola, gli
  sketch salvati dallo studente, i corsi a cui si iscrive, e cosa vede il docente se si
  condivide uno sketch). Mentre la finestra è aperta il cloud si carica; il pulsante
  «Continua con Google» è pronto al clic successivo e apre **subito** il popup di
  Google. Così il passaggio in due clic (necessario perché Safari altrimenti blocca il
  popup aperto in ritardo) è una conferma naturale, e nessun file dell'SDK viene
  richiesto prima di aprire la finestra.
- **Dopo il login: «☁ Nome Cognome ▾».** Menu con intestazione (nome, email, badge
  Docente/Studente) e le voci Salva nel cloud, I miei sketch, Corsi (per il docente anche «Nuovo corso» e «Gestisci»), Esci. Si chiude con
  Esc, con un clic fuori e scegliendo una voce; si scorre con le frecce. Il nome (non
  una scritta fissa) serve nei laboratori con PC condivisi: si vede subito chi è
  collegato.
- I testi della finestra di accesso stanno in `src/cloud/testi.js`, per poterli rivedere
  col responsabile della protezione dei dati senza toccare il codice. **L'elenco dei dati
  deve restare uguale a ciò che il cloud salva davvero.** Periodo di conservazione e
  luogo dei server non sono dichiarati perché non ancora decisi.

## Sketch personali

Si usano dal menu «☁ Nome ▾» (vedi «Accesso e menu Cloud»): voci «Salva nel cloud» e «I miei sketch».

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

Un **docente** (chi ha un documento in `docenti`, creato da console) crea e gestisce i
corsi **dall'app**: menu «☁ Nome ▾» → «Corsi». Lo **studente** vi entra col codice o lo
aggiunge il docente. Da console resta solo l'abilitazione dei docenti (`docenti/<email>`).

**Corso** `corsi/<CODICE>`: l'id è il codice (Crockford Base32, 6 caratteri: niente I L O U) e
non cambia mai.

| Campo | Esempio | Note |
|---|---|---|
| `materia` | `Informatica` | 1–60 caratteri |
| `classe` | `3AINF` | testo libero, 1–20 caratteri |
| `annoScolastico` | `2026/27` | formato `AAAA/AA` imposto dalle regole (il client propone quello corrente, da settembre) |
| `docenti` | array di email minuscole | **`docenti[0]` è il titolare**, gli altri sono codocenti |
| `iscrizioniAperte` | boolean | `true`: gli studenti entrano col codice; `false`: solo a mano |
| `attivo` | boolean | `false` = archiviato (i corsi non si cancellano) |
| `nome` | `Laboratorio TPSIT` | facoltativo; se manca si mostra «materia – classe (anno)» |
| `creato` | ora del server | solo nei corsi creati dall'app; non cambia |

**Pannello docente** (`src/cloud/gestione-ui.js`, dati in `gestione-corsi.js`). In «Corsi» il
docente ha «Nuovo corso», «Mostra anche i corsi archiviati» e, per ogni corso, «Gestisci»:
- **Creare**: materia, classe, anno (proposto), nome facoltativo; il codice lo genera il
  browser (`generaCodice()`). Se è già preso le regole rifiutano la scrittura (sarebbe una
  modifica, `creato` non può cambiare) e il client riprova con un altro, fino a 5 volte.
  Chi crea è il titolare. Nessun tetto: ogni docente crea i corsi che vuole.
- **Codice**: grande, con «Copia», e il tasto per aprire/chiudere le iscrizioni.
- **Iscritti**: elenco di email (non c'è il nome: `utenti/` è privato), «Togli» e un campo
  dove incollare più email (una per riga, separate da virgole, o «Nome <email>»; al massimo 60
  per volta). Si può aggiungere anche a iscrizioni chiuse, non a un corso archiviato. Esito:
  quanti aggiunti, già iscritti, non accettati (email fuori dal dominio, di un docente).
  Nessun tetto sul numero di iscritti.
- **Codocenti**: si aggiungono per email, **uno alla volta, solo se esistono in `docenti`**
  (altrimenti un docente potrebbe dare accesso agli sketch condivisi a uno studente) e si
  tolgono tutti tranne il titolare, anche da soli. Per cambiare titolare serve la console.
- **Dati del corso** modificabili e **Archivia / Riattiva**. Archiviato: sparisce agli
  studenti, le iscrizioni col codice non funzionano, il docente non vede più gli sketch
  condivisi (riattivando tornano).

**Iscrizioni** `iscrizioni/<CODICE>_<email minuscola>` con `corsoId`, `email`, `creato`.
- *Con il codice*: lo studente lo digita (`ab-12 cd` vale `AB12CD`) e il documento lo crea
  l'app; le regole lo accettano solo se il corso è attivo e con le iscrizioni aperte. Codice
  sbagliato, corso chiuso o archiviato danno lo stesso messaggio.
- *Dal docente*: lo crea il docente del corso. Le regole controllano email minuscola, senza
  `/`, del dominio dell'istituto (o di prova in dev), mai quella di un docente. Funziona
  anche per chi non ha mai fatto login: l'informativa (`testi.js`) lo dice.
- *Togliere*: solo un docente del corso cancella il documento. Lo studente non esce da solo,
  e nessuno modifica un'iscrizione. Se le iscrizioni sono aperte, chi è stato tolto può
  rientrare col codice (non c'è un elenco di bloccati: si chiudono prima le iscrizioni).
- Uno studente può essere in più corsi. **Un docente non si iscrive mai come studente.**
  Per provare l'app «da studente» serve un account che non sia in `docenti`.

**Chi vede cosa.** Il corso lo legge chi è tra i suoi `docenti` o è iscritto; ognuno vede solo
le proprie iscrizioni, il docente anche l'elenco degli iscritti del suo corso (query con
`corsoId == <codice>`). Per leggere o scrivere il corso (e leggere iscritti e sketch
condivisi) un docente deve stare nell'array del corso **ed esistere ancora in `docenti`**:
se lo si toglie da `docenti` (console) perde subito accesso e gestione, anche se la sua email
resta nell'array (che nessuno aggiorna da solo: un altro docente lo toglie dal pannello; se è
il titolare, da console). Per questo solo il docente interroga `corsi` per email: una query
di uno studente verrebbe rifiutata per intero.

**Cosa resta da console**: abilitare o togliere un docente (`docenti/<email>`) e cambiare il
titolare di un corso. **La pulizia di fine anno non è ancora implementata**: è rimandata a
dopo la modalità verifica (le verifiche potrebbero andare archiviate prima di cancellare
dati; si prevede un export stampabile in PDF con il disegno dei blocchi e lo pseudocodice).
Intanto i corsi si archiviano e i dati restano.

Codice: `src/cloud/corsi.js` (studente, lettura), `gestione-corsi.js` (docente: dati),
`gestione-ui.js` e `corsi-ui.js` (interfaccia).

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
  e l'autore è ancora iscritto**. Se il docente toglie lo studente dal corso, o
  archivi il corso (`attivo: false`), lo sketch sparisce subito dalla vista del
  docente; lo studente continua a vederlo e a ritirare la condivisione (ma non a
  ri-condividerlo con un corso da cui è stato tolto). La condivisione resta scritta nello
  sketch: se lo studente viene **riaggiunto** al corso, il docente rivede subito gli sketch
  che aveva condiviso, senza che debba ricondividerli (comportamento voluto: rimedia a una
  rimozione per errore).
- **Vista del docente** (menu → «Corsi» → «Sketch condivisi»): per ogni corso, autore,
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

## Commenti del docente

Il docente commenta lo sketch che uno studente ha **condiviso** col suo corso, agganciando il
commento a un **blocco** (o all'intero sketch). Lo sketch non si tocca mai: il commento è un
documento a parte e non entra nel programma né nei tre output.

**Per il docente.** «Corsi» → «Sketch condivisi» → «Apri»: lo sketch si apre come copia (come
prima) e sotto il codice compare il pannello **«Commenti»**. Cliccando un blocco, il commento
sarà su quel blocco (la scelta resta anche se poi si clicca nel campo di testo; «Sull'intero
sketch» la toglie); poi «Aggiungi commento» (max 500 caratteri). Ogni commento ha «Modifica»
(solo il proprio) ed «Elimina» (proprio o di un altro docente del corso). I blocchi commentati
hanno un contorno arancione; cliccare «Blocco: …» in un commento seleziona il blocco (e
quindi evidenzia le righe nei tre codici).

**Per lo studente.** Nessuna notifica push: al login si legge una volta l'elenco dei propri
commenti. Sul menu «☁ Nome ▾» compare un numero rosso con i commenti **nuovi** (non letti);
in «I miei sketch» l'etichetta «💬 2 commenti del docente (1 nuovo)»; aprendo lo sketch il
pannello mostra i commenti (sola lettura), i blocchi commentati sono contornati e i commenti
diventano «letti». Se lo studente toglie il blocco, il commento resta come «Su un blocco che
non c'è più: SE x > 3» (si salva una breve descrizione del blocco); se lo sketch è stato
salvato dopo il commento, compare «Scritto prima dell'ultima modifica dello sketch». Lo
studente **non risponde e non cancella** i commenti.

**Dati** `commenti/<sketchId>_<n>` (n da 0 a 29: **tetto di 30 commenti per sketch**, imposto
dall'id deterministico):

| Campo | Note |
|---|---|
| `sketchId`, `sketchCreato` | lo sketch e la sua `creato` originale (gli id degli sketch si riusano: un commento non passa a un altro sketch con lo stesso id) |
| `proprietarioUid` | per la query «tutti i miei commenti» dello studente |
| `corsoId` | il corso in cui è stato scritto |
| `bloccoId`, `bloccoTesto` | id del blocco nel JSON del programma (o `null`) e la sua riga di pseudocodice |
| `testo` (1–500), `autoreEmail`, `autoreNome`, `creato`, `modificato`, `letto` | |

**Regole** (mutation check fatto: 37 controlli spenti a mano, tutti fermati dai test; 3 controlli
ridondanti sono stati tolti):
- *Scrive*: un docente ancora in `docenti`, del corso, con lo sketch **condiviso con quel corso**
  e l'autore iscritto; le regole confrontano il commento con lo sketch di adesso (`get`).
- *Legge*: lo studente autore; i docenti del corso finché lo sketch è ancora condiviso con quel
  corso (stessa creazione), l'autore è iscritto e il corso è attivo. Se lo studente condivide con un
  altro corso, o smette, o viene tolto, il docente di prima non legge più né sketch né commenti, e
  i docenti del nuovo corso non vedono i commenti scritti per il vecchio.
- *Modifica*: il docente solo il **testo** dei propri; lo studente solo `letto`.
- *Cancella*: l'autore, o un altro docente del corso; lo studente solo i commenti il cui sketch
  **non esiste più** (o è stato ricreato con lo stesso id).
- *Query*: le regole possono usare solo i campi che la query fissa, quindi il docente interroga
  con `sketchId` + `corsoId` + `sketchCreato` (il `Timestamp` **originale**, non una `Date`: `toDate()`
  perde i microsecondi e l'uguaglianza fallirebbe).
- **Niente Cloud Functions**: quando lo studente elimina uno sketch, il client cancella prima lo
  sketch e poi i suoi commenti (a quel punto orfani e quindi cancellabili); se la scheda si chiude
  a metà, i commenti orfani si ripuliscono quando si apre «I miei sketch». Un orfano non ripulito
  resta nel database finché non lo si ripulisce (rientra nella pulizia di fine anno, ancora da fare).
- **Quote Spark**: una lettura dei propri commenti al login (e a ogni apertura di «I miei sketch»);
  il docente una query per sketch aperto. Nessun polling.

Codice: `src/cloud/commenti.js` (dati), `commenti-ui.js` (pannello). `main.js` offre al cloud
sei piccole funzioni sui blocchi (`bloccoSelezionato`, `onSelezione`, `esisteBlocco`,
`descriviBlocco`, `selezionaBlocco`, `marcaBlocchi`) dentro l'oggetto `programma`: usa solo il
contorno CSS `blocco-commentato`, non l'icona di commento di Blockly (che finirebbe nel JSON).

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
   di prova li crea il docente dall'app («Corsi» → «Nuovo corso»).

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
