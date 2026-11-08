# Cloud (opzionale): autenticazione

Stato: **accesso, ruolo (studente/docente), sketch personali, corsi (creati e gestiti dal
docente nell'app) con iscrizione col codice o a mano, condivisione degli sketch col docente
del corso, commenti del docente sugli sketch condivisi**. La **modalità verifica** è in costruzione (branch `cloud`, spenta con `enabled: false`): fatti il lato docente, il lavoro live dello studente, la consegna e riconsegna, la copia locale, la tabella live del docente con «Guarda» e la storia, i file di emergenza e il rientro senza rete, «Le mie consegne» e la scheda di consegna in PDF; restano la simulazione con 30 studenti (taratura) e le guide. Le decisioni di fondo sono nella nota di progetto
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
| `nome` | `Laboratorio TPSIT` | facoltativo; se manca si mostra la materia (classe e anno stanno in una riga a parte) |
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
  condivisi (riattivando tornano). **Un corso con una verifica aperta non si archivia**: il controllo avviene
  PRIMA di chiedere conferma, con un avviso nella sezione («Il corso ha una verifica aperta: terminala prima di
  archiviarlo»). Archiviando un corso le sue verifiche non si archiviano (sono già fuori vista: il pulsante
  «Verifiche» compare solo nei corsi attivi) e tornano com'erano riattivandolo.

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

## Modalità verifica (in costruzione)

Non ancora utilizzabile: per ora ci sono i dati e le regole di **verifiche, tracce e lavori** (passi 2-5 di 13);
le consegne e tutte le schermate arrivano nei passi successivi. Il piano e le decisioni
sono nella nota di progetto «Verifica: struttura approvata».

### Verifiche e tracce (dati e regole)

**Verifica** `verifiche/<id automatico>`: `corsoId`, `titolo` (≤80), `stato` (`bozza`, `aperta`,
`chiusa`), `fine` (fine prevista, obbligatoria per aprire), `tracciaDefault`, `creataDa`,
`creato`, `apertaIl`, `chiusaIl` (null finché non succede), `archiviata` (facoltativo, assente = false: vedi
sotto). **Niente scadenze personali né
assegnazioni di tracce qui**: stanno nel lavoro di ogni studente (passo 3), perché da tempo e
traccia si dedurrebbe chi ha bisogni particolari.
- *Transizioni*: bozza → aperta → chiusa → aperta (la chiusa si riapre, anche con la fine ormai
  passata: ai singoli si dà tempo con la scadenza personale). In bozza non si torna.
- *Aprire* richiede una `fine` nel futuro e una `tracciaDefault` che esista. A verifica aperta
  si cambiano solo titolo e fine (se cambia, nel futuro); a chiusa il titolo e `archiviata`.
- *Archiviare* (`archiviata: true`) è un riordino del docente, ammesso **solo per le verifiche chiuse** (le regole:
  archiviata ⇒ chiusa). Nasconde la verifica **solo dall'elenco del docente** (casella «Mostra anche le verifiche
  archiviate»): gli studenti vedono ancora la propria consegna. **Una archiviata non si riapre finché non si
  ripristina**, e, come ogni verifica aperta o chiusa, non si elimina.
- *Chi*: scrive un docente del corso ancora in `docenti` (la verifica nasce solo in un corso
  attivo). Lo studente iscritto legge solo se non è una bozza: la query è `corsoId == X` con
  `stato == 'aperta'` (o `in [...]`), l'unica forma che le regole possono dimostrare.
- *Si butta via solo una bozza*; il client cancella prima le sue tracce (le sottocollezioni non
  seguono il documento).

**Traccia** `verifiche/<id>/tracce/t<n>`, n da 0 a 49 (**tetto di 50 tracce** imposto dall'id:
una per studente è possibile): `titolo` neutro (≤40), `testoMd` (Markdown, ≤6000), `rev`
(0 alla creazione, **+1 a ogni modifica**: lo studente si accorgerà dell'aggiornamento),
`modificato`. L'ordine è quello dell'id.
- Il docente le crea e le modifica in bozza **e a verifica aperta** (un refuso si corregge),
  mai a chiusa; si cancellano solo in bozza.
- Lo studente legge **solo la traccia che gli è assegnata** nel suo lavoro
  (`get(lavori/<email>).tracciaId`), mai prima dell'apertura e mai l'elenco. Le assegnazioni
  non sono visibili agli altri.

Mutation check: 82 controlli spenti a mano, tutti fermati dai test tranne i due `hasAll` (tenuti
apposta: senza, una chiave mancante verrebbe rifiutata solo per un errore di valutazione, un
comportamento implicito); i controlli ridondanti sono stati tolti.

Codice: `src/cloud/verifiche.js` (dati; `ErroreVerifica`); test `verifiche-rules.test.mjs` e
`verifiche.test.mjs`. Il bundle Firebase ora esporta anche `Timestamp`, `onSnapshot` e
`writeBatch`. Un documento che non esiste dà «negato» e non «assente»: le regole non vedono
i suoi dati.

### Lavori (dati e regole)

**Lavoro** `verifiche/<id>/lavori/<email minuscola>`: il documento personale dello studente in una
verifica. L'id è l'**email** (non l'uid): il docente lo crea prima del login dello studente.
- *Del docente*: `tracciaId` e `scadenza` (timestamp assoluto: la fine prevista o il tempo
  aggiuntivo; **nessun motivo viene mai scritto**). **In bozza `tracciaId` può essere vuoto (null) e
  vale «traccia di tutti»**: segue la traccia predefinita, qualunque sia. All'apertura il client lo
  sostituisce con l'id vero nello stesso batch che apre la verifica; da aperta in poi la traccia è sempre
  esplicita (le regole non ammettono il vuoto, e uno studente non scrive finché la sua traccia non è risolta). Il docente crea il lavoro in bozza o a verifica
  aperta, solo per chi è iscritto al corso; la scadenza si cambia in ogni stato, la traccia solo
  finché lo studente non è entrato. Si toglie solo il lavoro di chi non è mai entrato.
- *Dello studente*: `studenteNome`, `programma` (+ `programmaHash`), `nBlocchi`, `esecuzioni`
  (`{n, esito: mai|ok|errore, quando}`: niente riga raggiunta né valori), `campioni` (al massimo 12),
  `entrato`, `ultimoSegnale`, `tracciaRevVista`, `consegnato`. Ogni scrittura porta
  `ultimoSegnale = request.time` (è anche il battito); la prima fissa `entrato` e poi non cambia.
- *Quando scrive lo studente*: solo il proprio lavoro, a verifica **aperta**, entro la scadenza
  personale più la grazia (20 s), e finché non ha consegnato. `consegnato: true` solo insieme alla
  consegna (batch con `existsAfter`: la verifica positiva arriva con le regole delle consegne).
- *Lettura*: il docente del corso legge tutti i lavori (una `list`); lo studente solo il proprio, e non
  in bozza. L'elenco non è consultabile dagli studenti.
- Limiti in `verifica-config.js`: `maxProgramma`, `maxBlocchi`, `maxCampioni`. La forma interna dei
  campioni non è verificata dalle regole (le regole non hanno cicli): al peggio sporca il documento
  dello studente stesso.

Codice: `src/cloud/lavori.js` (`creaLavoriDocente`, `creaLavoroStudente`); test
`lavori-rules.test.mjs` e `lavori.test.mjs`. Mutation check: ogni condizione del blocco spenta a mano,
tutte fermate tranne i `hasAll` (tenuti apposta) e il ramo positivo di `consegnato`, che si prova
nel passo 4.

### Consegne (dati e regole)

**Consegna** `verifiche/<id>/consegne/<email>_<n>`, n da 1 a 9 (`maxVersioniConsegna`): la copia
**immutabile** del lavoro. Si crea e basta (`update` e `delete` sono sempre negati, per tutti);
l'ultima versione è quella valida. Campi: `studenteEmail`, `studenteNome`, `corsoId`, `titolo`
(della verifica: servono all'elenco dello studente), `versione`, `origine`, `tracciaId`, `programma`,
`creato` (= ora del server), più `docenteEmail` per raccolta e file.
- **studente / automatica** (solo v1): un **batch atomico** {aggiorna il lavoro con `consegnato: true`,
  crea la consegna}. Le due regole si richiamano a vicenda (`existsAfter` nel lavoro, `getAfter` nella
  consegna): né l'una né l'altra da sole. Il contenuto della consegna è quello del lavoro DOPO il batch
  (quindi l'ultimo salvataggio ne fa parte), la traccia quella assegnata. Stato `aperta` e scadenza con la
  grazia li impone l'update del lavoro. **Lo studente non riconsegna mai** (id esistente = nessuna
  scrittura possibile; la riconsegna dopo una riapertura individuale è una decisione ancora rimandata).
- **raccolta** (docente, a verifica **chiusa**): dal lavoro com'è; chi non è mai entrato non ha niente
  da raccogliere. Una v>1 richiede la precedente: rilanciata dopo una riapertura, il client crea la
  versione successiva solo se il lavoro è cambiato.
- **file** (docente, a verifica chiusa): il file di emergenza di uno studente (anche mai entrato, ma con
  un lavoro assegnato): `impronta`, `offlineDa`, `nBlocchiSincronizzati`, `nomeFile`. L'impronta la
  verifica il client all'importazione, non le regole.
- **Lettura**: lo studente le proprie (query `studenteEmail == <email>` dentro la verifica), il docente
  del corso tutte.
- Mutation check: condizioni tenute apposta anche se ridondanti: i `hasAll`, `d.versione is int` (protegge
  da un decimale inviato via API; il client non può provarlo, l'SDK manda sempre interi) e i controlli di
  identità del ramo studente.

Codice: `src/cloud/consegne.js` (`creaConsegneStudente`: `mie`, `miaUltima`, `consegna`;
`creaConsegneDocente`: `elenca`, `raccogli`, `caricaFile`); test `consegne-rules.test.mjs` e
`consegne.test.mjs`.

### Operazioni del docente (`verifica-docente.js`)

`creaVerificaDocente` compone verifiche, lavori e consegne nelle operazioni che userà l'interfaccia
(nessuna regola nuova): `crea`, `cambiaFine`, `assegna`, `apri`, `aggiungiIscritti`, `tempoAggiuntivo`,
`chiudi` (raccoglie sempre), `raccogli({daRaccogliere})`, `riapri`, `caricaFile`, `situazione` (verifica + lavori + consegne in tre
letture, per la tabella). Ciclo: *crea in bozza (con la fine prevista) → tracce → assegna (facoltativo) →
apri → tempo aggiuntivo / iscritti tardivi → chiudi (raccoglie da sola) → riapri*.
- **Scadenza personale = fine prevista + minuti extra**, assoluta nel lavoro. Se la fine cambia in bozza
  (`cambiaFine`) o all'apertura, le scadenze di chi non è entrato si spostano **della stessa differenza,
  extra compresi, in un solo batch** con la modifica della verifica; da aperta cambia solo il default.
- `apri`: crea il lavoro degli iscritti che non l'hanno (traccia di default, vecchia fine), poi in un batch
  sposta le scadenze e apre. Se fallisce non resta niente a metà e riprovare non sposta due volte.
- `assegna` richiede la fine già impostata; il tempo extra si dà come totale rispetto alla fine, mentre
  `tempoAggiuntivo` sposta la scadenza attuale (anche all'indietro). **Nessun motivo viene scritto mai.**
  Senza traccia indicata una nuova assegnazione è «di tutti» (vuota in bozza); `tracciaId: null` riporta
  «di tutti» (da aperta: la traccia predefinita).
- **«Di tutti» segue la traccia predefinita fino all'apertura**; una traccia scelta a mano resta, anche se
  coincide con quella di tutti. `apri` si ferma se una traccia assegnata a mano non esiste più.
- `eliminaTraccia`: **non si elimina una traccia assegnata a mano** («2 studenti hanno questa traccia:
  riassegnali prima»); se era quella di tutti, questa passa alla prima rimasta (o a nessuna: senza, non si apre).
- `impattoUsaPerTutti`: quanti l'hanno a mano e quanti la riceverebbero, per l'avviso della stella.
- `eliminaVerifica` (solo bozza): cancella prima le assegnazioni (altrimenti, tolta la verifica, nessuno
  potrebbe più eliminarle e resterebbero orfane), poi le tracce, poi la verifica. Una verifica aperta o
  chiusa **non si elimina** (consegne immutabili): si archivia (`archivia`, solo se chiusa).
- `riepilogoApertura`: per la conferma di apertura (studenti, tracce, traccia di tutti, quanti hanno una traccia o
  un tempo diversi: una traccia scelta a mano uguale a quella di tutti non conta).
- `assegnazioni`: una riga per iscritto (email, traccia, minuti in più, entrato, consegnato) per la tabella.
- `raccogli` si rilancia: crea la versione successiva solo se il lavoro è cambiato dall'ultima consegna.
- **Conflitto file/raccolta**: se l'ultima consegna di uno studente è di origine `file` e il lavoro sul server è diverso, `raccogli` NON scrive
  per lui: lo mette in `esito.conflitti` (con consegna, lavoro e un `suggerimento`). Il docente decide nella finestra «file di emergenza già
  caricato» («Tieni il file», preselezionato, o «Raccogli comunque», con «Confronta» per vedere i due programmi) e la raccolta si rilancia con
  `daRaccogliere`. Il suggerimento usa solo orari del server (`ultimoSegnale` del lavoro contro `creato` della consegna: dopo → 'lavoro',
  altrimenti 'file'); `ultimoSegnale` include i battiti, quindi è un indizio, non una prova. `creatoIl` e `offlineDa` del file vengono dal PC dello
  studente e si mostrano solo come dichiarati (`creatoIl` non è salvato nella consegna). «Confronta» apre UNA finestra (`verifica-confronto-ui.js`): due colonne (file a sinistra, server a destra) e un solo selettore Blocchi/Pseudocodice/C/Python che le cambia insieme; nelle viste di testo le righe presenti solo da una parte sono evidenziate con `diff-righe.js` (sottosequenza comune più lunga, confronto esatto: il testo viene dallo stesso motore, quindi cambiano solo le stringhe scritte a mano; prova `test/diff-righe.mjs`), nei blocchi nessuna evidenziazione. L'anteprima di `main.js` espone `testi()` ed `evidenzia()` per questo. Alla prima chiusura non ci sono conflitti (non esistono ancora file caricati); dopo una riapertura la chiusura raccoglie di nuovo e il conflitto può esserci: la finestra si apre subito dopo la chiusura.

### Markdown delle tracce (`markdown.js`)

Il testo di una traccia è Markdown. **Un solo modulo** (`rendiMarkdown`) lo trasforma in HTML per
anteprima del docente e scheda «Traccia» dello studente, così si vede sempre allo stesso modo.
La libreria (markdown-it con i plugin per apice e pedice, ~100 KB) sta in `vendor/markdown/` e si carica
solo alla prima resa; è un file locale, quindi funziona offline. `npm run vendor:markdown` la rigenera.
Il PDF della scheda di consegna NON usa questa resa HTML: ricompone il testo dai token (`tokenizzaMarkdown`, `pdf-markdown.js`);
una funzionalità nuova va aggiunta anche lì (vedi la nota «Promemoria Markdown» sotto, nella scheda di consegna in PDF).
- *Si rende*: titoli, grassetto, corsivo, barrato (`~~x~~`), apice (`x^2^`), pedice (`H~2~O`), elenchi
  puntati e numerati, citazioni, codice (in riga e a blocco), tabelle, righe orizzontali.
- *Non si rende, volutamente*: HTML scritto a mano (mostrato come testo), **link** (non cliccabili:
  «testo (indirizzo)») e **immagini** (resta «[immagine: testo alternativo]»). Le immagini si potranno
  aggiungere in seguito, senza servizi a pagamento (ridotte e salvate come dati nel database): le tracce
  già scritte resteranno valide.
- Il risultato è l'unico HTML assegnato a `innerHTML` nell'interfaccia cloud. Test:
  `markdown.test.mjs` (script, attributi iniettati, link `javascript:`, immagini remote, testo
  alternativo; mutation check: tutte le difese spente a mano, una sola mutazione non osservabile).

### Editor del testo di una traccia (`editor-markdown.js`, `formato-testo.js`)

Campo di testo Markdown con l'**anteprima accanto** (la stessa resa di `markdown.js`, aggiornata dopo
150 ms), barra dei formati e contatore dei caratteri (rosso oltre `maxTestoTraccia`; `valido()` dice
se si può salvare). Su schermo stretto (≤ 800 px) diventano due schede «Scrivi / Anteprima».
- **Barra**: grassetto, corsivo, barrato, apice, pedice | titolo, elenco puntato, elenco numerato,
  citazione | codice, blocco di codice, tabella (schema da compilare, con «Colonna 1» già selezionata).
  Ctrl/Cmd+B e Ctrl/Cmd+I per grassetto e corsivo, Ctrl/Cmd+S chiama `onSalva`. Premere due volte lo
  stesso pulsante toglie la formattazione; senza selezione si inserisce un segnaposto selezionato.
- **Elenchi**: Invio dentro un elenco (o una citazione) continua la voce e numera; su una voce vuota
  chiude l'elenco lasciando una riga vuota (senza, il testo dopo si attaccherebbe all'ultima voce).
- **Annulla** (Ctrl/Cmd+Z) funziona anche dopo un formato: le modifiche passano da `execCommand`; se il
  browser non lo permette il testo è giusto ma si perde l'annulla.
- I formati sono **funzioni pure** `(testo, inizio, fine) → {testo, inizio, fine}` in `formato-testo.js`,
  provate senza browser (`formato-testo.test.mjs`, mutation check fatto). Il widget non conosce Firebase.
  Verificato a mano in Chromium (Playwright) con pulsanti, scorciatoie, annulla, elenchi, tabella, contatore
  e anteprima con tentativi di iniezione.

### Interfaccia del docente: elenco e scheda della verifica (`verifiche-ui.js`)

Nel menu «Corsi», ogni corso attivo del docente ha il pulsante **«Verifiche»** (accanto a «Gestisci»).
- **Elenco** delle verifiche del corso (titolo, badge Bozza/Aperta/Chiusa, fine prevista) e **«Nuova
  verifica»**: titolo e fine prevista, proposta tra due ore (provvisoria: all'apertura si sceglierà la
  durata). La verifica nasce in bozza.
- **Scheda** (finestra grande): titolo e fine prevista, che si salvano da soli quando si esce dal campo
  («Salvato ✓»); in bozza cambiare la fine sposta le scadenze degli studenti (`cambiaFine`).
  Sotto, **tracce a sinistra** ed **editor Markdown a destra** (con anteprima). Si salva con «Salva» o
  Cmd/Ctrl+S (a verifica aperta il pulsante è «Pubblica modifica»); modifiche non salvate chiedono conferma
  se si cambia traccia o si chiude la finestra. «Nuova traccia» crea una bozza locale che esiste nel
  database solo dopo il salvataggio.
- **«Per tutti»** è discreto: con **una** sola traccia non compare niente; con due o più, una **stella
  piena** segna la traccia di tutti e sulle altre una stella vuota compare solo passandoci sopra o con la
  tastiera («Usa questa traccia per tutti», solo in bozza). La prima traccia salvata diventa quella di
  tutti; eliminando quella di tutti passa alla prima rimasta.
- **Avviso sulla stella**: se la traccia scelta come «per tutti» è già assegnata a mano ad altri, chiede
  conferma («è assegnata a mano a 1 studente: se diventa la traccia di tutti, la riceveranno anche gli
  altri 2»). Solo in quel caso; negli altri la stella funziona senza domande.
- **Assegnazioni individuali** (in bozza e a verifica aperta): sezione **chiusa di default** (la finestra
  può essere proiettata alla LIM). Aperta, una riga per iscritto con l'**email** (il nome non si conosce finché
  lo studente non entra): menu della traccia («Per tutti (Versione A)» o una traccia) e minuti in più; si salva
  alla modifica. «Per i selezionati» applica traccia e/o minuti a più studenti. Chi ha già iniziato non cambia
  traccia, chi ha consegnato non si tocca. Nessun campo «motivo». Aprendola, la finestra scorre fino a lì.
- **Eliminare una traccia** assegnata a mano: il controllo avviene **prima** di chiedere conferma. Se la traccia è
  assegnata, compare un avviso nella scheda («Non si può eliminare «…»: è assegnata a mano a 1 studente.
  Riassegnalo prima.», con il pulsante «Mostra le assegnazioni»), senza nessuna conferma generica e **senza email**
  (la finestra può essere proiettata). **«Elimina verifica»**
  (solo in bozza) chiede conferma con i numeri («Elimino la verifica «…», la sua traccia e le assegnazioni di 3
  studenti? Non si può annullare»).
- **Azioni sullo stato** (in alto a destra nella scheda), ognuna con la sua finestra di conferma, i cui testi stanno in
  `testi-verifica.js` (da rivedere senza toccare il codice, e da riusare nella guida):
  - **Avvia verifica…** (bozza; fino al 7 nov 2026 «Apri verifica…», rinominata perché «Apri» nell'app vuol già dire aprire uno sketch o una scheda; gli STATI restano «Aperta» e «Chiusa»): riepilogo (studenti iscritti, tracce e traccia di tutti, quanti hanno una traccia o
    un tempo diverso), scelta della fine come **«dura N minuti da adesso»** (proposta 90) oppure **«finisce alle…»**
    con l'anteprima di quando finirà (calcolata al clic), e l'avvertenza in evidenza **«L'avvio non si
    annulla: la verifica non torna in bozza e non si potrà più eliminare. Per fermarla dovrai terminarla; una verifica
    terminata si può solo archiviare»**. Non si apre senza una traccia e una traccia di tutti.
    Il testo sul blocco dello studente («dovrà scegliere questa verifica e non potrà usare altro…») resta spento
    (`FUNZIONI.bloccoStudente`) finché non esiste il blocco (passo 7).
  - **Termina verifica…** (aperta; prima «Chiudi verifica…»): raccoglie sempre i lavori subito (nessuna casella: va fatto prima di caricare i file di emergenza); dice com'è andata la raccolta.
  - **Raccogli i lavori**, **Riapri…** (stessa scelta della fine, proposta 30 minuti) e **Archivia…** (chiusa);
    **Ripristina** (archiviata: è l'unica azione). L'elenco ha la casella «Mostra anche le verifiche archiviate».
  - **Situazione (passo 9)**: da aperta o chiusa la scheda ha due schede, «Situazione» (si apre su questa) e «Tracce».
    La tabella ha una riga per studente: stato (Non entrato / Scrive / Ha eseguito / Errore / Consegnato), blocchi con la
    variazione degli ultimi 5 minuti, ⚠ se in un controllo i blocchi sono saliti di 15 o più (programma incollato),
    esecuzioni con l'esito dell'ultima, connessione (offline dopo 4 minuti senza segnali) e tempo rimasto verde/giallo/rosso.
    Si aggiorna da sola (`ascoltaSituazione`: una lettura per documento cambiato); il timer scorre con un orologio locale
    ogni secondo, senza letture. L'ora usata è quella del SERVER, stimata dai segnali degli studenti arrivati DOPO l'apertura
    della tabella (finché non ne arriva uno ci si fida del PC). Le righe si calcolano in `verifica-tabella.js` (funzioni
    pure, `test/verifica-tabella.mjs`); `verifica-tabella-ui.js` le disegna. Non c'è una colonna «ultima modifica»: il
    solo dato è `ultimoSegnale`, che vale anche per il battito.
  - **Guarda e Storia**: ogni riga ha «Guarda»: finestra in sola lettura con i blocchi (secondo workspace Blockly,
    `programma.anteprima` in main.js) e i tre codici dagli stessi generatori; segue lo studente (ritardo massimo ~25 s)
    senza letture in più (i dati sono già nella tabella). «Storia…» legge le istantanee (`lavori/<email>/storia`, ≤30
    letture): cursore, frecce, segni ⚠ sui salti, «In diretta». Nella Storia entrano anche le CONSEGNE (`creato` del server), ordinate nel tempo
    con le istantanee (`storiaConConsegne` in verifiche-ui.js). A verifica chiusa («Guarda» mostra l'ultima consegna) la partenza è «Ultima
    consegna», nel suo punto del tempo: le istantanee dopo di lei (per esempio il lavoro di una riapertura) stanno dopo, dichiarate «successive
    all'ultima consegna… non è una consegna»; le consegne più vecchie sono «Consegna precedente». Se l'ultima consegna è un file e il lavoro
    sul server è più recente (`ultimoSegnale` dopo `creato`) un avviso lo dice. Le scrive lo studente (best effort, a parte dal
    salvataggio): periodica ogni `istantaneaOgniMs` (5 min) se il programma è cambiato e ha blocchi, in 24 posti A ANELLO
    scelti dall'ora (`p<k>`, k = ora / intervallo mod 24: nessun contatore da ricordare), più la coppia `a<k>`/`d<k>`
    (prima/dopo) quando i blocchi salgono di `saltoBlocchi` (30 dall'8 nov 2026: è un indizio debole, vedi docs/SIMULAZIONE-30.md) o più tra due salvataggi (3 posti). Regole: solo lo studente a
    verifica aperta, entrato, non consegnato, entro scadenza+grazia; legge il docente; nessuno cancella (la pulizia di fine
    anno li toglie con lo script). Costo: ~700 scritture in più su 30 studenti × 2 h. Per infittire o allungare la storia:
    `istantaneaOgniMs` e `regole.maxIstantanee`, poi ripubblicare le regole.
  - **Consegna vista da «Guarda»**: a verifica CHIUSA «Guarda» e la colonna Blocchi mostrano la consegna valida (l'ultima
    versione, anche raccolta o da file); a verifica aperta il lavoro in diretta, e la consegna solo se il lavoro è vuoto.
    La consegna non conserva il numero di blocchi: lo calcola `contaBlocchi()` (verifica-tabella.js, pura, memorizzata) dal
    JSON del programma, escluso INIZIO/FINE; coincide con l'editor su tutti gli esempi dell'app (prova e2e).
  - **Le mie consegne (passo 11, studente)**: voce del menu cloud, solo per gli studenti (spenta in verifica insieme al menu).
    Elenca le verifiche CONCLUSE (chiuse, anche archiviate) dei suoi corsi dove ha almeno una consegna, dalla più recente
    (`mieConsegne` in verifica-studente.js: una lettura per corso + una per verifica conclusa; la query deve dichiarare
    `stato == 'chiusa'`, le regole non fanno elencare allo studente le bozze). Per ogni versione: origine («consegnata da te»,
    «da sola allo scadere», «raccolta dal docente», «caricata dal docente dal tuo file»), ora, blocchi, «quella che vale»
    sull'ultima; **Guarda** (stessa finestra del docente, sola lettura, senza storia), **Apri nell'editor** (una COPIA,
    con conferma se l'editor ha lavoro; la consegna non cambia) e **Salva su file** (normale file di lavoro `.json`).
    Le verifiche aperte non compaiono. La copia locale di un lavoro non consegnato (proposta del file all'avvio) si ELIMINA
    da sola se una consegna dello studente ha lo STESSO programma (per esempio il docente ha caricato il file di
    emergenza): si confronta il contenuto, non le date. Fix collegato: il secondo workspace di «Guarda» lasciava a Blockly un «workspace
    principale» chiuso: ora `creaAnteprima` rimette quello dell'editor alla creazione e alla chiusura.
  - **Scheda di consegna in PDF (passo 12)**: a verifica CHIUSA la tabella ha «Scarica PDF» su ogni riga con una consegna e
    «Scarica PDF di tutti» in testa (non compaiono a verifica aperta). Il PDF è generato dall'app con jsPDF (`vendor/pdf/jspdf.js`,
    creato da `npm run vendor:pdf`, caricato solo alla prima generazione, funziona offline), A4 a layout fisso, indipendente da
    browser e stampante; sostituisce la prima versione che stampava dal browser (Safari e Chrome davano risultati diversi).
    Decisioni di contenuto e disposizione: `docs/PDF-SCHEDA.md`. Moduli: `pdf-markdown.js` (traccia: token di markdown-it →
    struttura di dati, puro), `pdf-scheda.js` (impaginazione, senza DOM), `pdf-ui.js` (prepara le schede e scarica), `src/blocchi-immagine.js`
    (blocchi → PNG), `scheda-stampa.js` (parti pure: nomi, riscontro, ordine, data).
    - **Contenuto**: titolo della verifica, corso e classe, nome dello studente (senza email; se manca, la parte dell'email prima
      della chiocciola), solo la data della consegna, la TRACCIA che aveva (Markdown ricomposto a mano), blocchi, pseudocodice, C,
      Python. Non compaiono email, ora, scadenza, origine, nome del file né versione. Bianco e nero (grigi, filo sottile) salvo i blocchi.
    - **Disposizione**: blocchi | pseudocodice, poi C | Python. Se i blocchi in colonna scenderebbero sotto la scala 0,8 o
      non ci stanno in una pagina: blocchi a tutta larghezza (riducendo fino a 0,6 per l'altezza, tagliati su più pagine solo se ancora
      troppo alti), poi pseudocodice | C e Python sotto. Ciò che sta in una pagina intera non si spezza (va a pagina nuova); i
      codici troppo lunghi si spezzano con «(continua)». Un titolo di sezione non resta mai solo in fondo a una pagina.
    - **Piè di pagina su ogni pagina**: `verifica · classe · data` a sinistra, `Nome · riscontro XXXX-XXXX · pagina x/n` a destra
      (n = pagine di quella scheda). Il CODICE DI RISCONTRO è `codiceRiscontro()`, lo stesso della finestra «Guarda».
    - **File**: `cognome-nome_classe_verifica_v2.pdf` (minuscolo, senza accenti; la versione c'è solo nel nome) e
      `classe_verifica_tutte-le-consegne.pdf`. Ordine di «tutti»: per cognome e poi nome (primo termine = nome, il resto = cognome).
    - **Blocchi come immagine** (`blocchi-immagine.js`): workspace Blockly di sola lettura fuori schermo (uno per tutto il PDF); si
      copia il canvas dei blocchi in uno SVG autonomo con gli stili CSS già calcolati («inlined»: le regole di Blockly dipendono da
      elementi genitori che nello SVG isolato non ci sono), si rasterizza su canvas a scala 2. Alla fine si rimette il workspace
      principale dell'editor (stesso difetto già incontrato in «Guarda»).
    - **Font e caratteri**: solo Helvetica e Courier (font standard del PDF). Virgolette e trattini tipografici → ASCII, `≠ ≤ ≥` dello
      pseudocodice NON sono nei font standard: nei riquadri di codice si disegnano con linee, nella cella a larghezza fissa del
      Courier (`rigaCodice` in `pdf-scheda.js`); nel testo corrente della traccia diventano `<> <= >=`; il resto fuori da Latin-1 → `?`
      (il greco non serve).
    - **Promemoria Markdown**: se si aggiunge una funzionalità a `markdown.js` va aggiunta anche al PDF. `test/pdf-markdown.mjs` confronta le
      righe di configurazione di `markdown.js` con un'istantanea e fallisce con il messaggio «aggiorna anche il PDF»; token
      sconosciuti → testo semplice, mai un errore.
    - **Prove**: unitarie `test/pdf-markdown.mjs`, `test/pdf-scheda.mjs` (impaginazione con un registro delle voci disegnate: pagine,
      margini, titoli orfani, tagli, piè di pagina), `test/scheda-stampa.mjs`; e2e docente (`test/e2e/verifiche.mjs`) con download vero,
      testo estratto con Ghostscript. L'aspetto si controlla a occhio: `gs -sDEVICE=png16m -r80 -sOutputFile=p-%d.png file.pdf`.
    - **Non verificato** (per ora): Safari e Chrome veri (le prove girano in Chromium; le immagini SVG→canvas possono differire).
  - **Carica file (passo 10b)**: a verifica CHIUSA ogni riga ha «Carica file…» per il file di emergenza dello studente
    (anche se non è mai entrato). Formato e controlli in `src/verifica-file.js` (puro, sarà usato anche per PRODURRE il
    file nel passo 10a): JSON con marcatore `isablockEmergenza`, verifica, studente, programma, `offlineDa`, blocchi e UN
    campo `impronta` (hash sincrono a 106 bit di sale fisso + verifica + email + programma: ferma i ritocchi semplici,
    non è sicurezza). Si rifiuta se non è un file di emergenza, versione diversa, dati rotti, impronta falsa, altra verifica
    o altro studente (anche se genuino). Il NOME del file non fa fede: solo un avviso se non ricorda lo studente. Finestra
    di conferma con il confronto «ultimo salvataggio sul server / nel file», la versione che nascerà e «Guarda il programma
    del file»; la consegna nasce con origine `file` sopra le precedenti (che restano), la tabella mostra «Consegnato (v2) ·
    da file». `Apri` dell'editor rifiuta il file di emergenza (non si riapre mai).
- **Studente senza rete (passo 10a)**: il motore dichiara «offline» quando il server non risponde da `offlineStudenteMs`
  (45 s): lo dice l'ascolto del lavoro (`includeMetadataChanges`, snapshot `fromCache`), non `navigator.onLine`. Offline
  le scritture restano in sospeso (non falliscono): l'interfaccia mostra sotto la fascia l'avviso «Sei offline» con
  «Salva su file» (`sessione.datiEmergenza()` + `creaFileEmergenza`, download dal browser; nel file: ultimo programma,
  blocchi, quanti ne erano arrivati al server, «offline da hh:mm»), «Consegna» offline non apre la conferma ma rimanda
  al file, al ritorno della rete l'avviso sparisce da solo (Firestore si ricollega con ritardo crescente: anche decine di
  secondi). A fine tempo offline la consegna aspetta la rete fino a scadenza+grazia, poi la verifica è «terminata» e la
  finestra propone il file (solo se ci sono blocchi non arrivati al server; chiudere senza averlo salvato chiede
  conferma). Una GUARDIA chiude come «terminata» anche una consegna rimasta in sospeso oltre la grazia (rete caduta ma
  non ancora dichiarata offline). `fermo()` non aspetta le scritture quando la rete è giù.
- **Pagina ricaricata senza rete (passo 10c)**: la pagina stessa si apre solo se il browser ha i file (non c'è un service
  worker: con il computer completamente offline non si riapre); il caso coperto è «il server dati non risponde». Tre
  pezzi: (1) `auth.js` NON disconnette più chi ha un errore di rete nel leggere il ruolo (prima faceva `signOut`!): se
  l'account era già entrato riparte con il profilo ricordato nel localStorage (`isablock.cloud.profilo`: solo uid,
  email, nome, ruolo; le regole del server decidono comunque tutto) e segnala `senzaRete`; (2) l'indizio «verifica in
  corso» (`verifica-locale.js`) ora ha anche titolo, email, scadenza e scarto dell'orologio server-PC, tenuti aggiornati
  ogni secondo dalla fascia; (3) se i corsi non si leggono e c'è l'indizio dello stesso studente più la copia locale,
  `rientroSenzaRete()` avvia la sessione con l'opzione `rientroOffline` del motore: nessuna lettura dal server, già
  «offline», programma e traccia dalla copia, timer dalla scadenza ricordata, scrittura d'ingresso non attesa. Quando la
  rete torna l'ascolto la riporta online e le scritture ripartono; i corsi si rileggono al primo controllo utile. Senza
  copia locale (non aveva scritto niente) si parte in modalità normale. Lavori di verifiche finite con modifiche mai
  arrivate, rimasti sul computer: all'avvio una finestra propone «Salva su file» (una volta per pagina, solo dello studente
  collegato). Limite noto e accettato: l'orologio del PC offline è falsabile.
- A verifica chiusa la scheda è di sola lettura.
- **Le notifiche («toast») stanno sopra le finestre** (livello 3000 contro 2000 delle finestre): prima un messaggio
  che usciva mentre una finestra era aperta finiva nascosto dietro l'oscuramento e non lo vedeva nessuno (valeva
  per tutti gli errori e le conferme dentro le finestre del cloud).
- **Esc chiude solo la finestra in cima** (prima chiudeva tutte quelle impilate): `dom.js` tiene una pila.
  `apriFinestra` ha le opzioni `larga` e `puoChiudere` (può rifiutare la chiusura).
- Testo dei titoli di traccia: il suggerimento chiede un nome neutro, «senza note personali».

### Prove nel browser (`npm run test:e2e`)

`test/e2e/` pilota Chromium (Playwright) contro l'app vera e gli emulatori Auth e Firestore (vuoti, avviati
da `firebase emulators:exec` con `firebase.test.json`; stesse porte di `npm run emulators`, quindi non con
l'emulatore dev acceso). Il server statico e gli aiuti leggono le porte da `FIREBASE_AUTH_EMULATOR_HOST` e
`FIRESTORE_EMULATOR_HOST` (le imposta `emulators:exec`): con un'altra configurazione su altre porte la prova
gira anche accanto all'emulatore dev. Un
piccolo server statico (`server.mjs`) serve il progetto accendendo al volo l'interruttore del cloud, senza
toccare il working tree. L'accesso usa una credenziale Google finta via SDK (deterministico; il popup
dell'emulatore in Chromium senza interfaccia perdeva il clic a volte). Con `E2E_SCHERMATE=<cartella>` salva
le schermate. `verifiche.mjs` copre i passi 6c, 6d e 6e in 76 controlli, `studente.mjs` il passo 7b in 50 (i controlli sul database attendono la condizione fino a 5 s
invece di fare pause fisse, che sotto carico non bastano); i passi successivi con interfaccia
aggiungeranno i loro. Il bundle Firebase esporta per questo `signInWithCredential`.

### La parte dello studente: il motore (`verifica-studente.js`, passo 7a)

Senza interfaccia (quella è il 7b): trova le verifiche da fare e tiene la **sessione** mentre lo studente ne svolge una.
- `creaVerificheStudente`: `daFare(corsiIds)` (le verifiche **aperte** con un'assegnazione, non consegnate e con il tempo non
  finito) e `ascoltaAperte` (avvisa quando una verifica si apre o si chiude: una lettura per cambiamento).
- `creaSessione(...)`: `avvia`, `aggiorna({programma, nBlocchi, esecuzioni})` (l'interfaccia lo chiama a ogni modifica: costa un
  confronto), `salvaOra`, `consegna`, `termina`, `ora`/`restanteMs`/`stato`. Gli stati: `in-corso`, `consegnato`, `terminata`
  (chiusa dal docente, o tempo finito senza consegna).
- **Salvataggio** (parametri in `verifica-config.js`, sezione `client`, da cui dipendono le quote Spark): il programma si
  scrive **solo se è cambiato** (hash) e al massimo una volta ogni 25 s; se per 120 s non si scrive altro esce un **battito**
  (solo `ultimoSegnale`); ogni 5 minuti la scrittura che capita porta anche un **campione** {ora, blocchi} in un anello di 12.
  Una scrittura sbagliata per la rete non perde niente (il programma resta in memoria, si riprova al battito); una rifiutata
  dalle regole (chiusa, o tempo finito oltre la grazia) termina la sessione.
- **Ora del server**: la prima scrittura è l'ingresso, e dal confronto tra `ultimoSegnale` (ora del server) e l'orologio locale
  quando arriva l'eco si stima lo scarto (si tiene il campione con la latenza minore). Il timer è «scadenza − ora del server
  stimata»: un PC sbagliato di 5 minuti non cambia il tempo che resta (c'è un test).
- **Consegna**: a mano (porta con sé anche l'ultima versione non ancora salvata) o **automatica** a fine tempo; se la
  automatica non riesce (rete, o altro) **si riprova ogni 5 s** finché le regole la accettano (scadenza + grazia), poi la verifica
  è terminata e vale l'ultimo lavoro salvato (lo raccoglie il docente). Se il docente dà **tempo aggiuntivo** la fine slitta.
- Contratto con l'interfaccia: all'ingresso va comunicato **sempre** un programma (anche quello vuoto): senza, non c'è niente da
  consegnare.
- Test (`verifica-studente.test.mjs`, 19) con un **tempo simulato** (pausa, battito, campioni e consegna automatica senza
  aspettare); mutation check: 20 mutazioni, due ridondanti per costruzione (l'anello dei campioni è tagliato anche da `lavori.js`;
  lo slittamento della fine si ricontrolla anche allo scattare del timer).
  **Attenzione ai test con timer veri**: un test che fallisce senza spegnere la sessione tiene vivo il processo all'infinito
  (si spegne sempre in un `finally`).

### La parte dello studente: l'interfaccia (`verifica-studente-ui.js`, passo 7b)

**Il percorso.** All'accesso (e al ricaricamento, e quando il docente apre una verifica mentre lo studente è dentro) compare, se c'è
una verifica aperta da svolgere, la finestra **«Verifica aperta»**: **non si chiude** (niente ✕, né Esc, né clic fuori: opzione
`bloccante` di `apriFinestra`) e l'app sotto non è utilizzabile. Mostra titolo, corso e fine, con «Inizia» o «Riprendi». Si propone
solo una verifica con un'assegnazione, non consegnata e col tempo non finito; chi è iscritto senza assegnazione non vede niente.
- **Avviso sul lavoro non salvato**: se l'editor non è vuoto, prima di entrare compare «Il tuo lavoro attuale non è vuoto: l'editor parte
  vuoto, ne resta una copia automatica su questo computer e finita la verifica potrai riprenderlo». «Annulla» torna alla scelta senza
  toccare niente. **Nessun obbligo di salvare a mano.**
- **In verifica**: fascia blu in alto (etichetta, titolo, **timer** verde / giallo sotto il 25% del tempo / rosso sotto 5 minuti,
  e «Consegna»). L'editor è vuoto (o riprende il lavoro già salvato, se si è ricaricata la pagina). Spenti: Apri, Salva su file, esempi,
  menu del cloud (sketch, corsi, esci), copie automatiche. Restano: Nuovo (azzera il programma senza toccare la copia di prima), Esegui/Passo,
  le schede Pseudocodice, C e Python. C'è la scheda **«Traccia»** (Markdown reso dal modulo sicuro, con A−/A+ per il testo), aperta
  all'ingresso e nascosta a fine verifica.
- **Consegna**: conferma («Dopo la consegna non potrai più modificarlo», con il tempo rimasto) e poi «Lavoro consegnato». Allo scadere
  del tempo parte da sola: «Tempo scaduto». Se il docente chiude la verifica: «Verifica terminata». Poi si **torna al lavoro che c'era
  prima** (se c'era) e, se ne resta un'altra da fare, ricompare la scelta.
- **Ricaricare a metà verifica**: la scelta ricompare con «Riprendi» e il lavoro salvato torna nell'editor. Intanto la proposta di
  ripristinare vecchie copie **aspetta** (un indizio «verifica in corso» nel localStorage, `src/verifica-locale.js`, scade da solo dopo
  scadenza + 2 ore; se il cloud non risponde in 30 s l'avvio riparte lo stesso) e parte a verifica finita, come sempre.

**Come è fatta.** `main.js` ha pochi ganci (`modoVerifica.entra / esci / nessuna`, `onModifica`, `onEsecuzione`, `nBlocchi`, `correnteCompatto`):
all'ingresso salva subito l'ultima versione del lavoro di prima, la sua copia automatica va **in pausa** (non deve mai essere sovrascritta
da quella della verifica), all'uscita ricarica il lavoro di prima. I testi stanno in `testi-verifica.js` (`testiStudente`).

**Cose imparate (e corrette) con la prova nel browser:**
- Il campo `entrato` si manda **solo nell'ingresso**, mai «per sicurezza»: una rilettura subito dopo una scrittura può dare la copia locale con la
  scrittura «in attesa» (entrato vuoto), e rimandarlo faceva rifiutare il salvataggio successivo (e terminare a torto la verifica). Vale anche per la consegna.
- «Consegnato» conta solo se confermato dal server (non da una scrittura locale in attesa), e l'**origine** (a mano / automatica) si registra
  *prima* di scrivere, così il messaggio è giusto («Tempo scaduto» e non «Lavoro consegnato»).
- Un **errore nel controllo delle verifiche non è «nessuna verifica»**: si propaga, si riprova dopo 5 s (e dopo circa 30 s di insuccessi si
  rinuncia a bloccare l'avvio, ma si continua piano). Un avviso arrivato **durante** un controllo ne fa ripartire uno subito dopo (prima si perdeva).
- Un ricontrollo ogni minuto finché c'è una verifica aperta che non gli è stata proposta (il docente può aggiungere uno studente dopo l'apertura).

Prova nel browser: `test/e2e/studente.mjs` (50 controlli: scelta non chiudibile, avviso, fascia e timer, comandi spenti, traccia, salvataggio e battito,
consegna, ritorno al lavoro di prima, ricaricamento a metà con ripristino rinviato, chiusura da parte del docente, consegna automatica), dentro
`npm run test:e2e` insieme alla prova del docente. Il server di prova riduce i tempi di salvataggio (1,5 s di pausa, 5 s di battito).

### Parametri

Il file `src/cloud/verifica-config.js` raccoglie
tutti i parametri: la sezione `regole` (limiti che fanno rispettare anche le regole
Firestore: grazia sulla scadenza, tetto di tracce, lunghezze, versioni di consegna, campioni)
e la sezione `client` (debounce, battito, soglie di offline, timer, campioni, avvisi). I
valori di `regole` finiscono in `firestore.rules` tramite i segnaposto `@@VERIFICA_<nome>@@`
del modello; un test controlla che ogni valore e ogni segnaposto si corrispondano.
**Cambiare un valore di `regole` richiede di ripubblicare le regole.** I parametri `client`
decidono soprattutto le quote Spark (stima con 30 studenti e 2 ore: ~4,5k scritture, ~9k nel
caso peggiore, su 20.000 al giorno): non abbassare il debounce sotto i 25 s senza rifare il conto.

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
npm run test:e2e       # prove nel browser (Chromium) contro l'app vera: vedi «Prove nel browser»
npm run emulators      # emulatori Auth + Firestore con regole dev (UI su :4100);
                       # i dati restano in .emulator-data (cancellarla per ripartire da zero)
                       # e i docenti di prova (environments.local.json, dev.docentiProva) si ricreano ogni volta
python3 -m http.server # e aprire http://localhost:8000 con cloud.enabled = true
npm run vendor:firebase  # rigenera vendor/firebase/cloud.js (solo per aggiornare Firebase)
```

**Attenzione alle regole.** L'emulatore **ricarica da solo** `firestore.rules` quando il file cambia. Per
questo `test:cloud` e `test:e2e` NON lo toccano: scrivono le regole di test in `.regole-test.rules` (ignorato da
git; i test lo leggono da `REGOLE_FILE`) e usano `firebase.test.json`. `scripts/build-rules.mjs <ambiente>
[file]` scrive in `firestore.rules` solo se non gli si dà un file. Le due prove usano le stesse porte di
`npm run emulators`: con l'emulatore dev acceso non partono (porta occupata) senza toccare niente.

Nell'emulatore l'accesso Google è una finestra fittizia dove si inventa l'account.
Il ruolo docente in locale lo danno i `docentiProva` di `scripts/environments.local.json`.

## Note

- Il popup Google dovrebbe aprirsi senza `await` tra clic e `signInWithPopup`
  (Safari). Qui la prima volta c'è il caricamento dell'SDK dopo il clic: su Safari
  il popup può essere bloccato; il messaggio chiede di riprovare, e il secondo
  clic funziona (SDK già caricato). Da verificare su Safari reale.
- Il dominio del sito va aggiunto tra i "domini autorizzati" di Authentication.

## Finestra di accesso, informativa e Guida (6 nov 2026)

- **Informativa** (`src/cloud/testi.js`, un posto solo; DEVE restare identica a ciò che il cloud salva davvero): `riassuntoDati`
  (5 righe, quelle della finestra di accesso) e `gruppiDati` (il testo completo in tre gruppi: «Il tuo account e i corsi»,
  «Sketch e commenti», «Le verifiche»); `datiSalvati` è l'elenco piatto. Se cambiano i dati salvati si aggiorna QUI, in `gruppiDati`
  e, se serve, nel riassunto. Il DOM è in `informativa-ui.js`.
- **Finestra di accesso** (`ui.js`, `apriAccesso`): intro, riassunto di 5 righe e «Leggi tutto, voce per voce», che apre il testo
  completo DENTRO la finestra (il riassunto lascia posto, il testo scorre in un'area con altezza legata allo schermo); i
  pulsanti restano sempre in basso e in vista, come in tutte le altre finestre.
- **Guida a sezioni** (`src/guida.js`, markup in `index.html`): senza cloud ha solo «Editor» (le 6 spiegazioni di sempre, nessuna
  barra); con il cloud il cloud registra altre sezioni (`guida.registra(id, titolo, costruisci)`, in `montaCloud`) e compare la barra
  delle schede. Oggi: «Editor» e «Privacy e dati» (l'informativa completa, raggiungibile sempre, anche senza accedere). Le
  pagine delle sezioni aggiunte si costruiscono alla prima apertura. Il passo 14 (guide per studente e docente) aggiunge qui
  le sue sezioni.
- Prove: `test/e2e/accesso.mjs` (cloud acceso e spento; con `avviaServer(porta, { cloud })`). Lezione: un attributo `hidden` viene
  annullato da una regola CSS con `display` (visto tre volte: voce di menu, barra delle schede): ogni elemento nascosto con `hidden`
  che ha una classe con `display` ha bisogno di `[hidden] { display: none }`.

### Guide per lo studente e per il docente (passo 14, 7 nov 2026)

- **Testi** (`src/cloud/testi-guida.js`, un posto solo): `sezioni` con due sezioni, «Per lo studente» (6 capitoli: Primi passi, I miei
  sketch, I commenti del docente, La verifica, Se cade la rete, Dopo la verifica) e «Per il docente» (7: Corsi e iscritti, Sketch condivisi
  e commenti, Verifica: preparare / avviare / durante / terminare, Dopo: casi particolari), e `aiuti` (le note dei «?»). Ogni capitolo è
  una lista di blocchi `{p}`, `{h}`, `{ul}`, `{ol}`, `{nota}`; `**così**` è il grassetto, usato per i nomi dei pulsanti.
- **Etichette** (`src/cloud/etichette.js`): le etichette che la guida nomina (menu del cloud, sketch, corsi, commenti, verifica del docente,
  consegne dello studente) sono costanti, **lette anche dall'interfaccia** (`ui.js`, `corsi-ui.js`, `gestione-ui.js`, `sketch-ui.js`,
  `commenti-ui.js`, `verifiche-ui.js`, `verifica-tabella-ui.js`, `verifica-anteprima-ui.js`, `consegne-ui.js`): se una cambia, cambia anche
  nella guida. Quelle della verifica dello studente restano in `testiStudente` (`testi-verifica.js`). Restano scritte a mano nella
  guida (e nell'interfaccia): «Copia», «Togli», i titoli «Non entrato», «Aperta/Chiusa», A−/A+.
- **DOM** (`src/cloud/guida-ui.js`): `paginaGuidaCloud(id)` costruisce la pagina (barra di capitoli + un capitolo alla volta) senza
  `innerHTML`; registrata in `montaCloud` con `guida.registra` (`cloud-studente`, `cloud-docente`, poi `privacy`). Il menu del cloud ha la voce
  **«Guida del cloud»** che apre la Guida già sulla sezione del proprio ruolo (`guida.apri(id)`). Con il cloud spento le sezioni non ci sono e
  la Guida è identica (prova). Le schede della Guida hanno `data-sezione=<id>` (lo usa la prova).
- **«?»** (`src/cloud/aiuto-ui.js`, `puntoDomanda(chiave)`): un pulsante che apre/chiude una nota di 1-2 frasi, senza finestre. La nota è un riquadro che
  **galleggia** sopra la pagina (`position: fixed`, posizionato da `aiuto-ui.js` sotto il pulsante o sopra se manca spazio, tenuto dentro lo schermo), con una
  **freccina** che punta al «?» e il **titolo in grassetto** (il nome del pulsante o del punto spiegato). Si chiude con un secondo clic, Esc, un clic fuori,
  scorrendo o ridimensionando; una sola nota aperta alla volta. Testi in `aiuti` (`{ titolo, testo }`); **`aiutiAttivi`** (in `testi-guida.js`) dice quali si
  vedono: oggi solo **stella** (accanto a «Tracce», con più tracce), **fascia** (timer e «Consegna», dello studente) e **offline** («Sei offline»).
  **Spenti di proposito (7 nov 2026, per scelta di Ivan):** fine prevista, assegnazioni individuali, «Raccogli i lavori», «Carica file…», «Riapri…»: tra un
  pulsante e l'altro non era chiaro a cosa si riferissero (quello di «Carica file…» stava nell'intestazione «Programma»), e la guida e le finestre di conferma
  li spiegano già. Per riaccenderne uno: aggiungere la chiave a `aiutiAttivi` (e **tarare il posto**: accanto a un'etichetta, mai tra due pulsanti). Prima
  versione: nota nel flusso della pagina, rompeva il layout; poi riquadro con bordo a sinistra e «?» grigio: scartati da Ivan dopo averli visti.
- **Rinomina**: «Apri verifica…» → **«Avvia verifica…»** e «Chiudi verifica…» → **«Termina verifica…»** (finestre di conferma: «Avviare/Terminare la
  verifica», messaggi, impedimento e avvertenza). L'avvertenza ora dice anche che la verifica non torna in bozza e non si può più eliminare.
  «Riapri…» e gli stati (Aperta, Chiusa, «Verifica aperta» dello studente) restano.
- **Prove**: `test/e2e/accesso.mjs` (23 controlli, cloud acceso e spento): ci sono 4 schede nell'ordine giusto, le due guide si aprono, ogni capitolo
  si apre da solo e ha del testo, nessun testo con `undefined`/segnaposto; nessun controllo dipende dalle parole.


### Vista dal vivo di uno studente (8 nov 2026)

Mentre la finestra «Guarda» è aperta su uno studente al lavoro (verifica aperta, già entrato, non consegnato), il browser
del docente scrive nel suo lavoro il campo `osservato` (ora del server) subito e poi ogni `osservatoRinnovoMs` (2 min).
Lo studente, che ascolta già il proprio lavoro, salva ogni `osservatoDebounceMs` (5 s) invece di `debounceSalvataggioMs`
(25 s) finché il segno è più recente di `osservatoScadeMs` (4 min): chiusa la finestra, o spento il PC del docente, torna
da solo al ritmo normale. Regole: solo il docente del corso, `osservato == request.time`, verifica aperta, studente
entrato. Gli altri studenti non cambiano. Costo (simulazione, docs/SIMULAZIONE-30.md): +9% scritture con un solo studente
osservato alla volta. Le istantanee non cambiano (seguono il tempo). Solo il primo piano: la griglia di tessere non c'è.
