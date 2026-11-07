// La Guida: una finestra con una o più SEZIONI. Senza il cloud ha solo «Editor» (le spiegazioni dell'editor, scritte in
// index.html) e si presenta com'è sempre stata. Con il cloud acceso si aggiungono altre sezioni (per esempio «Privacy e
// dati»), registrate dal cloud: compare allora una barra con le schede. Le pagine delle sezioni aggiunte si costruiscono la
// prima volta che si aprono. Il modulo non conosce il cloud né Blockly.
export function creaGuida({ modale, barra, pagine }) {
  const sezioni = new Map();       // id -> { titolo, costruisci, pagina, bottone }
  let corrente = 'editor';

  function disegnaBarra() {
    barra.textContent = '';
    barra.hidden = sezioni.size < 2;
    for (const [id, s] of sezioni) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'verifica-scheda';
      b.setAttribute('role', 'tab');
      b.dataset.sezione = id;
      b.textContent = s.titolo;
      b.addEventListener('click', () => mostra(id));
      s.bottone = b;
      barra.append(b);
    }
    aggiornaSchede();
  }

  function aggiornaSchede() {
    for (const [id, s] of sezioni) {
      const attiva = id === corrente;
      if (s.pagina) s.pagina.hidden = !attiva;
      if (s.bottone) { s.bottone.classList.toggle('attiva', attiva); s.bottone.setAttribute('aria-selected', String(attiva)); }
    }
  }

  function mostra(id) {
    const s = sezioni.get(id);
    if (!s) return;
    if (!s.pagina) {                                 // pagina costruita alla prima apertura
      s.pagina = document.createElement('div');
      s.pagina.className = 'guida-pagina';
      s.pagina.append(s.costruisci());
      pagine.append(s.pagina);
    }
    corrente = id;
    aggiornaSchede();
  }

  // La sezione dell'editor è già nella pagina (index.html).
  sezioni.set('editor', { titolo: 'Editor', pagina: document.getElementById('guidaEditor'), costruisci: null, bottone: null });
  disegnaBarra();

  return {
    // Aggiunge una sezione (se c'è già con lo stesso id, la sostituisce). `costruisci()` restituisce l'elemento della pagina.
    registra(id, titolo, costruisci) {
      sezioni.set(id, { titolo, costruisci, pagina: null, bottone: null });
      disegnaBarra();
    },
    apri(id = 'editor') {
      modale.hidden = false;
      mostra(sezioni.has(id) ? id : 'editor');
    },
    chiudi() { modale.hidden = true; },
    aperta: () => !modale.hidden,
  };
}
