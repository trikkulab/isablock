// Vista del docente: gli sketch che gli studenti del suo corso hanno condiviso.
// Solo lettura: il docente non scrive mai sugli sketch.
//
// Le regole non accettano un elenco "tutti gli sketch condivisi col corso":
// non possono dimostrare che ogni autore sia ancora iscritto. Per questo si
// legge prima l'elenco degli iscritti del corso (permesso ai docenti) e poi,
// per ognuno, i suoi sketch condivisi con quel corso (una query per iscritto,
// in parallelo). Chi è stato tolto dal corso non compare più.

export class ErroreCondivisi extends Error {
  constructor(messaggio) {
    super(messaggio);
    this.name = 'ErroreCondivisi';
  }
}

export function creaCondivisi({ sdk, db }) {
  // Ritorna { iscritti: n, sketch: [...] } con gli sketch in ordine di autore e,
  // per lo stesso autore, dal più recente.
  async function elenca(corsoId) {
    try {
      const iscr = await sdk.getDocs(sdk.query(sdk.collection(db, 'iscrizioni'), sdk.where('corsoId', '==', corsoId)));
      const email = [...new Set(iscr.docs.map((d) => String(d.data().email || '').toLowerCase()).filter(Boolean))];
      const risultati = await Promise.all(email.map((e) =>
        sdk.getDocs(sdk.query(sdk.collection(db, 'sketch'),
          sdk.where('condivisoCon', '==', corsoId), sdk.where('proprietarioEmail', '==', e)))));
      const sketch = risultati.flatMap((snap) => snap.docs.map((d) => {
        const v = d.data();
        return {
          id: d.id,
          nome: v.nome,
          autoreNome: v.proprietarioNome || v.proprietarioEmail,
          autoreEmail: v.proprietarioEmail,
          modificato: v.modificato?.toDate?.() ?? null,
          programma: v.programma,
        };
      }));
      sketch.sort((a, b) =>
        a.autoreNome.localeCompare(b.autoreNome, 'it')
        || (b.modificato?.getTime() ?? 0) - (a.modificato?.getTime() ?? 0));
      return { iscritti: email.length, sketch };
    } catch (err) {
      const rete = err && (err.code === 'unavailable' || err.code === 'deadline-exceeded');
      throw new ErroreCondivisi(rete ? 'Rete non disponibile: riprova tra poco.' : 'Non riesco a leggere gli sketch condivisi.');
    }
  }

  return { elenca };
}
