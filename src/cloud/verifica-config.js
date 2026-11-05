// Parametri della modalità verifica, in un posto solo. Vedi docs/CLOUD.md.
//
// `regole`: limiti che fanno rispettare anche le regole Firestore. Li legge
// scripts/build-rules.mjs e li scrive in firestore.rules (segnaposto
// @@VERIFICA_<nome>@@): cambiarli qui basta, ma poi vanno ripubblicate le regole.
// `client`: parametri solo dell'app (frequenza delle scritture, soglie della
// tabella del docente). Le quote Spark dipendono soprattutto da questi:
// con 30 studenti e 2 ore, debounce 25 s e battito 120 s fanno circa 4,5k
// scritture (9k nel caso peggiore) contro le 20.000 giornaliere. Non scendere
// sotto i 25 s di debounce senza rifare il conto; da tarare con una prova vera.

export const verificaConfig = Object.freeze({
  regole: Object.freeze({
    // Scritture accettate oltre la scadenza personale (latenza dell'auto-consegna).
    graziaSecondi: 20,
    // Tracce di una verifica: id t0…t(N-1), il tetto è imposto dall'id.
    maxTracce: 50,
    maxTitoloTraccia: 40,
    maxTestoTraccia: 6000,
    maxTitoloVerifica: 80,
    // Versioni di consegna per studente (id <email>_1…_N).
    maxVersioniConsegna: 9,
    // Campioni (ora, nBlocchi) tenuti nel lavoro: l'ultimo spinge fuori il più vecchio.
    maxCampioni: 12,
    // Programma di uno studente (JSON come testo, stesso tetto degli sketch) e suo numero di blocchi.
    maxProgramma: 200000,
    maxBlocchi: 5000,
  }),
  client: Object.freeze({
    // Apertura e riapertura: durata proposta (minuti dall'apertura) e massimo ammesso.
    durataPredefinitaMin: 90,
    durataRiaperturaMin: 30,
    durataMaxMin: 600,
    // Attesa dopo l'ultima modifica prima di scrivere il lavoro (si scrive solo se il contenuto è cambiato).
    debounceSalvataggioMs: 25000,
    // Se la consegna automatica a fine tempo non riesce (rete...), ogni quanto si riprova.
    riprovaConsegnaMs: 5000,
    // Segnale di vita, solo se nel frattempo non c'è stata un'altra scrittura.
    battitoMs: 120000,
    // Nessuna conferma dal server da tanto: lo studente è «offline».
    offlineStudenteMs: 45000,
    // Nessun segnale da tanto (2 battiti): per il docente è «offline da …».
    offlineDocenteMs: 240000,
    // Un campione (ora, nBlocchi) ogni tanto, dentro la scrittura normale.
    campioneOgniMs: 300000,
    // Finestra del «+N» nella colonna blocchi.
    finestraIncrementoMin: 5,
    // Timer: giallo sotto questa frazione del tempo, rosso sotto questi ms.
    timerGialloFrazione: 0.25,
    timerRossoMs: 300000,
    // Salto di blocchi tra due campioni oltre il quale il docente vede un avviso (da tarare).
    saltoBlocchi: 15,
  }),
});
