// Novità mostrate nella finestra "Novità" (vedi main.js), dalla più recente
// alla più vecchia. Ogni rilascio ha una voce con lo stesso numero di
// appConfig.version: test/regression.mjs fallisce se manca. I testi sono per
// gli studenti, non messaggi di commit.
//
// silent: true = la voce resta nell'elenco ma non fa aprire da sola la
// finestra (per le correzioni che lo studente non nota).
export const changelog = Object.freeze([
  {
    version: '1.8.0',
    date: '2026-10-08',
    title: 'Il lavoro non si perde più',
    items: [
      'Mentre lavori, IsaBlock tiene una copia del programma su questo computer. Se chiudi la pagina per sbaglio, quando la riapri ti fa scegliere quale lavoro riprendere.',
      'Ogni scheda ha la sua copia: se lavori su più schede, non si sovrascrivono. Quelle che non riprendi restano nell’elenco, e le riapri dal pulsante in basso.',
      'La copia non sparisce da sola: la togli tu, con Nuovo o con Cancella copia.',
      'La copia non sostituisce il pulsante Salva: per portare il lavoro su un altro computer o consegnarlo, salva sempre il file.',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-10-03',
    title: 'Dal blocco al codice, e viceversa',
    items: [
      'Seleziona un blocco: nei tre output si evidenzia il pezzo di codice corrispondente (per un SE o un ciclo, tutto il costrutto).',
      'Clicca su una riga di codice: si seleziona il blocco corrispondente nell’area di lavoro.',
      'Clicca nel vuoto, oltre la fine di una riga, per togliere la selezione.',
      'Puoi ancora selezionare il testo trascinando il mouse, per copiarlo.',
      'Nuova finestra Novità (questa!): si apre da sola quando esce una versione nuova, e la riapri quando vuoi dal pulsante ✨ Novità in alto.',
    ],
  },
  {
    version: '1.5.1',
    date: '2026-10-02',
    title: 'ESEGUI nel ciclo MENTRE',
    items: [
      'Il ciclo MENTRE ora dice MENTRE condizione ESEGUI invece di RIPETI, per non confonderlo con il ciclo RIPETI N volte.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-09-29',
    title: 'Più avvisi mentre componi',
    items: [
      'Il contatore di un ciclo PER non si può modificare dentro il ciclo: se ci provi, sul blocco compare un’icona di avviso.',
      'Una divisione per zero ora viene segnalata sul blocco, prima ancora di eseguire.',
      'I fumetti di avviso vanno a capo e si leggono per intero.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-09-28',
    title: 'Il pannello Variabili',
    items: [
      'Durante l’esecuzione passo-passo, il riquadro Variabili mostra il valore di ogni variabile: in giallo quella appena cambiata.',
      'Gli array compaiono come una fila di caselle numerate.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-09-28',
    title: 'Nuovi cicli',
    items: [
      'Nuovo ciclo ESEGUI … MENTRE: le istruzioni si eseguono almeno una volta, poi si ripetono mentre la condizione è vera (in C è il do-while).',
      'Il ciclo PER ora ha un PASSO: puoi anche contare all’indietro, per esempio da 10 a 1 con passo -1.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-09-28',
    title: 'Array più chiari',
    items: [
      'Gli array si creano con un blocco DICHIARA, dove scegli nome e lunghezza.',
      'I file salvati con la vecchia versione degli array si aprono lo stesso: vengono convertiti da soli.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-09-22',
    title: 'Vero/falso, testo e array',
    items: [
      'Nuovi valori vero/falso, per le condizioni.',
      'Nuovi blocchi per il testo.',
      'Nuovi array di numeri interi, per tenere più valori sotto lo stesso nome.',
    ],
  },
]);

// Confronto di due versioni "x.y.z": negativo se a < b.
export function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

// "Nuova" = più recente dell'ultima versione vista. Chi non ha memoria di una
// versione vista (lo usava già prima delle Novità) ha come nuova solo la più
// recente tra le voci da annunciare (non silent), non una correzione da poco.
export function isUnseenNews(lista, voce, ultimaVista) {
  if (ultimaVista === null || ultimaVista === undefined) {
    return voce === (lista.find((e) => !e.silent) ?? lista[0]);
  }
  return compareVersions(voce.version, ultimaVista) > 0;
}

// Pagina con cui si apre la finestra da sola all'avvio: la voce da annunciare
// (non silent) PIÙ RECENTE tra quelle non ancora viste, oppure -1 se non ce n'è.
// Così chi salta alcuni rilasci vede la novità importante, non l'ultima
// correzione da poco; le voci silent restano raggiungibili dalle frecce.
export function indiceNovitaDaMostrare(lista, ultimaVista) {
  return lista.findIndex((e) => !e.silent && isUnseenNews(lista, e, ultimaVista));
}

