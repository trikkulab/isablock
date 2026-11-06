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
  return { righe, avvertenza: "L'apertura non si annulla: per fermare la verifica dovrai chiuderla." };
}

export const testoChiusura = {
  righe: [
    'Chi sta ancora lavorando non potrà più salvare. I lavori già salvati restano.',
    'Se non raccogli ora, potrai farlo dopo dalla verifica chiusa.',
  ],
  raccogli: 'Raccogli subito i lavori (consigliato)',
};

export const testoRiapertura = {
  righe: [
    'La riapertura vale per tutti: ognuno riparte dal proprio lavoro e ha tempo fino alla nuova fine (più il tempo in più che gli avevi dato).',
    'Chi aveva già consegnato può continuare e consegnare di nuovo. La consegna di prima resta nello storico, la valida è l\'ultima.',
  ],
};

export const testoArchivia = 'La verifica sparisce dall\'elenco (la ritrovi con «Mostra anche le archiviate»). Gli studenti vedono ancora la propria consegna. Per riaprirla dovrai prima ripristinarla.';

// Messaggio dopo la raccolta
export function esitoRaccolta({ create, giaAggiornati, nonEntrati, rifiutate }) {
  const parti = [`raccolti ${create.length}`];
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
  dopoFine: 'Torni al lavoro che avevi prima della verifica, se ne avevi uno.',
  ok: 'Ok',
  // Fascia in alto
  fasciaEtichetta: 'VERIFICA',
  consegnaPulsante: 'Consegna',
  tracciaTab: 'Traccia',
  tracciaAggiornata: (ora) => `Traccia aggiornata alle ${ora}. Rileggila: il testo che vedi qui sotto è quello nuovo.`,
  tracciaNonDisponibile: 'La traccia non è disponibile: avvisa il docente.',
  ripresaLocale: 'Ho ripreso il tuo lavoro dalla copia su questo computer: era più recente di quello salvato online.',
});
