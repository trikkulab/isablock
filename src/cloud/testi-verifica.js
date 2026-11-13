// Testi della modalità verifica che il docente legge prima di agire (conferme di apertura, chiusura, riapertura).
// Stanno in un file solo per poterli rivedere senza toccare il codice (come testi.js per l'informativa) e per
// riusarli nella guida. Le frasi sono le stesse che si sono concordate: se cambia il comportamento, cambiano qui.

// Funzioni che esistono davvero. Il testo dell'apertura promette solo ciò che c'è: il blocco dello studente
// (elenco di scelta obbligatorio, niente altro finché non consegna) esiste dal passo 7b, e la sua frase è accesa.
export const FUNZIONI = Object.freeze({ bloccoStudente: true });

const plurale = (n, uno, molti) => (n === 1 ? uno : molti);

// Conferma di apertura: le righe di riepilogo e l'avvertenza finale (che si mostra in evidenza).
export function testoApertura({ iscritti, tracce, tracciaPredefinita, diversi }) {
  const studenti = plurale(iscritti, '1 studente iscritto', `${iscritti} studenti iscritti`);
  const righe = [
    FUNZIONI.bloccoStudente
      ? `Gli studenti iscritti (${iscritti}) la vedranno subito. Chi ha già fatto l'accesso, o lo farà durante la verifica, dovrà scegliere questa verifica e non potrà usare altro in IsaBlock finché non consegna o non scade il tempo.`
      : `La verifica sarà aperta per ${studenti}.`,
    `Tracce: ${tracce}${tracciaPredefinita ? ` (per tutti: ${tracciaPredefinita})` : ''}.${diversi
      ? ` Con una traccia o un tempo diverso: ${plurale(diversi, '1 studente', `${diversi} studenti`)}.` : ''}`,
  ];
  return { righe, avvertenza: "L'avvio non si annulla: la verifica non torna in bozza e non si potrà più eliminare. Per fermarla dovrai terminarla; una verifica terminata si può solo archiviare." };
}

export const testoChiusura = {
  righe: [
    'Chi sta ancora lavorando non potrà più salvare. I lavori già salvati restano.',
    'Appena la verifica è terminata, IsaBlock raccoglie i lavori: crea le consegne dal lavoro com\'è in quel momento. Chi non è mai entrato non ha una consegna.',
  ],
};

// Raccolta rilanciata dal docente con un file di emergenza già caricato: la scelta è sua
export const testoConflitto = {
  titolo: 'Attenzione: file di emergenza già caricato',
  righe: [
    'Per questi studenti l\'ultima consegna viene da un file di emergenza, e il lavoro sul server è diverso. Se raccogli, il lavoro del server diventa la nuova ultima versione e prende il posto del file (il file resta nello storico). Le consegne non si possono correggere.',
    'Di solito il file è il lavoro più recente (lo studente era offline). Ma dopo una riapertura può essere il contrario. La scelta e la responsabilità sono tue: confronta i due programmi con «Confronta».',
  ],
  tieni: 'Tieni il file',
  raccoglicomunque: 'Raccogli comunque',
  conferma: 'Conferma le scelte',
  nota: 'Chi lasci su «Tieni il file» non viene toccato: potrai rilanciare la raccolta in qualsiasi momento.',
  suggerimento: {
    file: 'Sembra più recente il file: il server non ha segnali dello studente dopo il caricamento del file.',
    lavoro: 'Sembra più recente il lavoro sul server: lo studente ha dato segnali dopo il caricamento del file (verifica riaperta?). Controlla con «Confronta».',
    nessuno: 'Non so dire quale sia più recente: confronta i due programmi.',
  },
};

export const testoRiapertura = {
  righe: [
    'La riapertura vale per tutti: ognuno riparte dal proprio lavoro e ha tempo fino alla nuova fine (più il tempo in più che gli avevi dato).',
    'Chi aveva già consegnato può continuare e consegnare di nuovo. La consegna di prima resta nello storico, la valida è l\'ultima.',
  ],
};

// Riapertura di UN solo studente (a verifica chiusa): la finestra aperta dal pulsante sulla sua riga nella tabella.
export const testoRiaperturaStudenti = {
  righe: (nome, quanti) => [
    nome ? `Riapri la verifica solo per ${nome}: gli altri restano chiusi.` : `Riapri la verifica solo per questi ${quanti} studenti: gli altri restano chiusi.`,
    'Ognuno riparte dal proprio lavoro, con la sua traccia, e ha tempo fino alla fine che scegli qui sotto. Chi aveva già consegnato può consegnare di nuovo: la consegna di prima resta nello storico, la valida è l\'ultima. Chi non era mai entrato entra adesso.',
    'Alla fine consegnano da sé, o si consegnano da soli allo scadere del tempo. Finché stanno lavorando non li raccogli con «Raccogli i lavori».',
  ],
  nuovi: (n) => (n === 1 ? 'Uno di loro non aveva ancora la verifica (è arrivato dopo): riceve la traccia' : `${n} di loro non avevano ancora la verifica (sono arrivati dopo): ricevono la traccia`),
};

export const testoArchivia = 'La verifica sparisce dall\'elenco (la ritrovi con «Mostra anche le archiviate»). Gli studenti vedono ancora la propria consegna. Per riaprirla dovrai prima ripristinarla.';

// Messaggio dopo la raccolta
export function esitoRaccolta({ create, giaAggiornati, nonEntrati, rifiutate, conflitti = [], inCorso = [] }) {
  const parti = [`raccolti ${create.length}`];
  if (inCorso.length) parti.push(`ancora al lavoro ${inCorso.length}`);
  if (conflitti.length) parti.push(`da decidere ${conflitti.length}`);
  if (giaAggiornati.length) parti.push(`già consegnati ${giaAggiornati.length}`);
  if (nonEntrati.length) parti.push(`non entrati ${nonEntrati.length}`);
  if (rifiutate.length) parti.push(`non raccolti ${rifiutate.length}`);
  return parti.join(', ');
}

// ── Testi per lo STUDENTE (finestre e fascia della modalità verifica) ─────────
export const testiStudente = Object.freeze({
  sceltaTitolo: 'Verifica aperta',
  sceltaIntroUna: 'C\'è una verifica aperta per te. Per continuare devi svolgerla: finché non consegni, o non finisce il tempo, non puoi usare altro in IsaBlock.',
  sceltaIntroPiu: 'Ci sono più verifiche aperte per te. Scegli quale svolgere ora: finché non consegni, o non finisce il tempo, non puoi usare altro in IsaBlock.',
  inizia: 'Inizia',
  riprendi: 'Riprendi',
  // Se all'ingresso l'editor non è vuoto
  lavoroTitolo: 'Il tuo lavoro attuale non è vuoto',
  lavoroRighe: [
    'Entrando in verifica l\'editor parte vuoto.',
    'Il tuo lavoro non va perso: ne resta una copia automatica su questo computer, e finita la verifica potrai riprenderlo.',
  ],
  lavoroConferma: 'Entra in verifica',
  lavoroAnnulla: 'Annulla',
  // Consegna
  consegnaTitolo: 'Consegni il lavoro?',
  consegnaRighe: ['Dopo la consegna non potrai più modificarlo.'],
  consegnaConferma: 'Consegna',
  consegnaAnnulla: 'Continua a lavorare',
  // Fine della verifica per lo studente
  consegnatoTitolo: 'Lavoro consegnato',
  consegnatoRiga: 'Il tuo lavoro è stato consegnato. Non serve altro.',
  scadutoTitolo: 'Tempo scaduto',
  scadutoRiga: 'Il tempo è finito e il tuo lavoro è stato consegnato.',
  terminataTitolo: 'Verifica terminata',
  terminataRiga: 'La verifica è terminata (chiusa dal docente, o tempo finito). Il lavoro che avevi salvato resta a disposizione del docente.',
  // Rete caduta: il lavoro resta su questo computer; il file serve a consegnarlo al docente
  offlineTesto: 'Sei offline: il tuo lavoro non arriva al server. Puoi continuare a lavorare, resta su questo computer. Se la rete non torna, salva il file e consegnalo al docente.',
  offlineTempoFinito: 'Il tempo è finito e sei offline: salva il file e consegnalo al docente. Se la rete torna tra pochi secondi, il lavoro si consegna da solo.',
  offlineSalva: 'Salva su file',
  offlineSalvato: (nome) => `File salvato: ${nome}. Consegnalo al docente.`,
  offlineNienteDaSalvare: 'Non c\'è ancora niente da salvare: l\'editor è vuoto.',
  offlineConsegna: 'Sei offline: non posso consegnare online. Salva il file e consegnalo al docente.',
  tornataRete: 'Di nuovo online: il tuo lavoro si sta sincronizzando.',
  terminataConFileRiga: 'La verifica è terminata e il tuo lavoro non è arrivato al server (anche se non hai scritto niente, il file è la prova che c\'eri). Salva il file e consegnalo al docente: è l\'unico modo perché venga contato.',
  terminataConFileConferma: 'Non hai ancora salvato il file. Se chiudi, il tuo lavoro resta solo su questo computer. Chiudere lo stesso?',
  copieTitolo: 'Lavoro di verifica non consegnato',
  copieRiga: 'Su questo computer c\'è il lavoro di una verifica che non è arrivato al server. Salvalo su file e consegnalo al docente: è l\'unico modo perché venga contato.',
  dopoFine: 'Torni al lavoro che avevi prima della verifica, se ne avevi uno.',
  ok: 'Ok',
  // Fascia in alto
  fasciaEtichetta: 'VERIFICA',
  consegnaPulsante: 'Consegna',
  tracciaTab: 'Traccia',
  tracciaAggiornata: (ora) => `Traccia aggiornata alle ${ora}. Rileggila: il testo che vedi qui sotto è quello nuovo.`,
  tracciaNonDisponibile: 'La traccia non è disponibile: avvisa il docente.',
  altraSessione: 'Attenzione: questa verifica è aperta anche su un altro computer o in un\'altra scheda con il tuo account. I due lavori si sovrascrivono a vicenda. Usane uno solo; il docente è stato avvisato.',
  ripresaLocale: 'Ho ripreso il tuo lavoro dalla copia su questo computer: era più recente di quello salvato online.',
});
