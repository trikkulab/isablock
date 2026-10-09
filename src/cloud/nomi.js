// Nomi casuali "animale-aggettivo" (es. pangolino-ridente), proposti come
// nome di un nuovo sketch. Il genere concorda: "lontra-sbadata", "gufo-sbadato".
// Nessuna dipendenza: si può provare con Node.

// [nome, genere]
const NOMI = [
  ['pangolino', 'm'], ['riccio', 'm'], ['tasso', 'm'], ['gufo', 'm'], ['delfino', 'm'],
  ['castoro', 'm'], ['tapiro', 'm'], ['procione', 'm'], ['geco', 'm'], ['scoiattolo', 'm'],
  ['polpo', 'm'], ['narvalo', 'm'], ['furetto', 'm'], ['criceto', 'm'], ['camaleonte', 'm'],
  ['pinguino', 'm'], ['fenicottero', 'm'], ['panda', 'm'], ['ghepardo', 'm'], ['cammello', 'm'],
  ['lontra', 'f'], ['medusa', 'f'], ['tartaruga', 'f'], ['marmotta', 'f'], ['civetta', 'f'],
  ['volpe', 'f'], ['giraffa', 'f'], ['balena', 'f'], ['foca', 'f'], ['lumaca', 'f'],
  ['farfalla', 'f'], ['formica', 'f'], ['rana', 'f'], ['zebra', 'f'], ['orecchia', 'f'],
  ['nuvola', 'f'], ['stella', 'f'], ['pigna', 'f'], ['coccinella', 'f'], ['cicala', 'f'],
  // isarome
  ['trikku', 'm'], ['ricky', 'm'], ['simon', 'm'],
  // altri animali
  ['ornitorinco', 'm'], ['bradipo', 'm'], ['armadillo', 'm'], ['canguro', 'm'], ['tricheco', 'm'],
  ['calamaro', 'm'], ['capibara', 'm'], ['axolotl', 'm'], ['koala', 'm'],
  ['salamandra', 'f'], ['libellula', 'f'], ['chiocciola', 'f'], ['lucciola', 'f'], ['aquila', 'f'],
  ['pantera', 'f'], ['alpaca', 'f'], ['cavalletta', 'f'], ['falena', 'f'], ['tigre', 'f'],
  ['mangusta', 'f'], ['gazza', 'f'],
  // creature fantastiche
  ['unicorno', 'm'], ['drago', 'm'], ['snaso', 'm'], ['ippogrifo', 'm'], ['basilisco', 'm'],
  ['fenice', 'f'],
  // informatica
  ['bug', 'm'], ['byte', 'm'], ['bit', 'm'], ['pixel', 'm'], ['cursore', 'm'], ['algoritmo', 'm'],
  ['ciclo', 'm'], ['puntatore', 'm'], ['vettore', 'm'],
  ['variabile', 'f'], ['funzione', 'f'], ['virgola', 'f'], ['parentesi', 'f'], ['stringa', 'f'],
  ['tastiera', 'f'], ['istruzione', 'f'],
];

// [maschile, femminile] (uguali se l'aggettivo non cambia)
const AGGETTIVI = [
  ['ridente', 'ridente'], ['curioso', 'curiosa'], ['birichino', 'birichina'], ['pigro', 'pigra'],
  ['allegro', 'allegra'], ['veloce', 'veloce'], ['saggio', 'saggia'], ['timido', 'timida'],
  ['brillante', 'brillante'], ['sbadato', 'sbadata'], ['coraggioso', 'coraggiosa'],
  ['goloso', 'golosa'], ['furbo', 'furba'], ['pasticcione', 'pasticciona'],
  ['danzante', 'danzante'], ['sognante', 'sognante'], ['fischiettante', 'fischiettante'],
  ['giocherellone', 'giocherellona'], ['spiritoso', 'spiritosa'], ['tranquillo', 'tranquilla'],
  ['vivace', 'vivace'], ['distratto', 'distratta'], ['gentile', 'gentile'], ['buffo', 'buffa'],
  ['cocciuto', 'cocciuta'], ['felice', 'felice'], ['sonnecchiante', 'sonnecchiante'],
  ['festoso', 'festosa'], ['audace', 'audace'], ['paziente', 'paziente'],
  ['dispettoso', 'dispettosa'], ['scattante', 'scattante'], ['pensieroso', 'pensierosa'],
  ['pimpante', 'pimpante'], ['intraprendente', 'intraprendente'], ['brontolone', 'brontolona'],
  ['chiacchierone', 'chiacchierona'], ['sorridente', 'sorridente'], ['svelto', 'svelta'],
  ['flemmatico', 'flemmatica'], ['ruspante', 'ruspante'], ['strampalato', 'strampalata'],
  ['sognatore', 'sognatrice'], ['esploratore', 'esploratrice'], ['trotterellante', 'trotterellante'],
  // le quattro casate: non sono aggettivi, ma suonano bene lo stesso (invariabili)
  ['grifondoro', 'grifondoro'], ['corvonero', 'corvonero'], ['tassorosso', 'tassorosso'],
  ['serpeverde', 'serpeverde'],
];

export const NUMERO_COMBINAZIONI = NOMI.length * AGGETTIVI.length;

// `caso` restituisce un numero in [0, 1): si può passare un generatore finto nei test.
export function nomeCasuale(caso = Math.random) {
  const [nome, genere] = NOMI[Math.floor(caso() * NOMI.length)];
  const aggettivo = AGGETTIVI[Math.floor(caso() * AGGETTIVI.length)][genere === 'm' ? 0 : 1];
  return `${nome}-${aggettivo}`;
}

// Per i test di concordanza.
export const _liste = { NOMI, AGGETTIVI };
