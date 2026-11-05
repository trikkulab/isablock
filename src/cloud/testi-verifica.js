// Testi della modalità verifica che il docente legge prima di agire (conferme di apertura, chiusura, riapertura).
// Stanno in un file solo per poterli rivedere senza toccare il codice (come testi.js per l'informativa) e per
// riusarli nella guida. Le frasi sono le stesse che si sono concordate: se cambia il comportamento, cambiano qui.

// Funzioni che esistono davvero. Il testo dell'apertura promette solo ciò che c'è: il blocco dello studente
// (elenco di scelta obbligatorio, niente altro finché non consegna) arriva con il passo 7 e ne accende la frase.
export const FUNZIONI = Object.freeze({ bloccoStudente: false });

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
    'Chi ha ancora tempo, secondo la propria scadenza personale, può riprendere a lavorare. Per chi ne ha bisogno puoi dare tempo in più dalle assegnazioni individuali.',
    'Se qualcuno aveva già consegnato o era stato raccolto, la consegna resta com\'è.',
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
