// Date e ore nei campi «datetime-local» dell'interfaccia (ora locale del computer, senza fuso nel testo).
const due = (n) => String(n).padStart(2, '0');

// Date -> "2026-11-12T10:30"
export function perCampo(d) {
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}T${due(d.getHours())}:${due(d.getMinutes())}`;
}

// "2026-11-12T10:30" -> Date, oppure null se il testo non è una data e ora valide (anche 31 febbraio).
export function daCampo(testo) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(testo ?? '');
  if (!m) return null;
  const [anno, mese, giorno, ore, minuti] = m.slice(1).map(Number);
  const d = new Date(anno, mese - 1, giorno, ore, minuti);
  const uguale = d.getFullYear() === anno && d.getMonth() === mese - 1 && d.getDate() === giorno
    && d.getHours() === ore && d.getMinutes() === minuti;
  return uguale ? d : null;
}

// Fine prevista proposta per una verifica nuova: tra due ore, arrotondata ai 5 minuti successivi.
export function finePredefinita(ora = new Date(), ore = 2) {
  const cinque = 5 * 60_000;
  return new Date(Math.ceil((ora.getTime() + ore * 3_600_000) / cinque) * cinque);
}

export const formatoDataOra = new Intl.DateTimeFormat('it-IT', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});
