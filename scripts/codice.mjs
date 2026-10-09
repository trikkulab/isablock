// Stampa codici di accesso casuali per i corsi (id del documento in `corsi`).
// Uso: npm run codice          un codice
//      npm run codice -- 5     cinque candidati
import { generaCodice } from '../src/cloud/corsi.js';

const n = Math.max(1, Math.min(20, Number(process.argv[2]) || 1));
for (let i = 0; i < n; i++) console.log(generaCodice());
