// Scheda di consegna in PDF (A4, layout fisso): impaginazione con jsPDF. Il risultato non dipende da browser né
// stampante. Le decisioni di contenuto e disposizione sono in docs/PDF-SCHEDA.md.
//
// Disposizione di ogni scheda (una o più pagine A4, ogni studente comincia su pagina nuova):
//   intestazione (verifica, corso e classe, studente, data) · traccia · riga 1: blocchi | pseudocodice · riga 2: C | Python
// Se i blocchi sono troppo larghi per la colonna (scala sotto 0,8) o troppo alti per una pagina, i blocchi vanno a tutta
// larghezza (tagliati su più pagine se serve, mai sotto circa 0,6 di scala per l'altezza), poi pseudocodice | C e Python sotto.
// Piè di pagina su ogni pagina: «verifica · classe · data» a sinistra, «Nome · riscontro · pagina x/n» a destra (n = pagine
// di QUELLA scheda).
//
// Il modulo non tocca il DOM: riceve la classe jsPDF (`creaPdfSchede({ jsPDF, ... })`), così si prova anche in Node.

const PAGINA = { w: 210, h: 297 };
const MARGINI = { sx: 15, dx: 15, alto: 15, basso: 20 };
const LARGHEZZA = PAGINA.w - MARGINI.sx - MARGINI.dx;          // 180
const SPAZIO_COLONNE = 6;
const COLONNA = (LARGHEZZA - SPAZIO_COLONNE) / 2;              // 87
const BASSO_UTILE = PAGINA.h - MARGINI.basso;                  // oltre questa quota non si scrive
const CAPIENZA = BASSO_UTILE - MARGINI.alto;                   // altezza utile di una pagina
const PT = 25.4 / 72;                                          // un punto tipografico in mm
const PX = 25.4 / 96;                                          // un pixel dell'editor in mm (scala 1:1)
const PAD = 2;                                                 // margine interno dei riquadri
const GIU = 4;                                                 // spazio sotto una sezione

const PT_CORPO = 9;                                            // testo della traccia
const PT_CODICE = 7.8;                                         // codici
const INTERLINEA = 1.35;

export const SCALA_MIN_COLONNA = 0.8;                          // sotto, i blocchi passano a tutta larghezza
export const SCALA_MIN_ALTEZZA = 0.6;                          // riduzione massima per fare stare i blocchi in una pagina

// Solo i font standard del PDF (Helvetica, Courier): quel che non sta in Latin-1 si sostituisce.
const SOSTITUZIONI = { '\u2018': "'", '\u2019': "'", '\u201a': "'", '\u201c': '"', '\u201d': '"', '\u201e': '"', '\u2013': '-', '\u2014': '-', '\u2212': '-', '\u2026': '...', '\u2022': '-', '\u00a0': ' ', '\t': '    ',
  '\u2260': '<>', '\u2264': '<=', '\u2265': '>=', '\u2190': '<-', '\u2192': '->' };       // i simboli dello pseudocodice (≠ ≤ ≥) che i font standard non hanno
// `simboli`: nei riquadri di codice ≠ ≤ ≥ restano (si disegnano a mano, vedi `simbolo`), altrove diventano <> <= >=.
export function pulisci(testo, { simboli = false } = {}) {
  return String(testo ?? '').replace(/[^\x00-\xff\n]|[\u0080-\u009f]|\t/g, (c) => (simboli && SIMBOLI.includes(c) ? c : SOSTITUZIONI[c] ?? '?'));
}
const SIMBOLI = '\u2260\u2264\u2265';                // ≠ ≤ ≥

// Spezza una riga di codice che non sta nella larghezza (in caratteri), in modo ordinato: a uno spazio se c'è, e la
// continuazione rientra di due spazi rispetto all'inizio della riga.
export function spezzaRiga(riga, max) {
  if (riga.length <= max) return [riga];
  const rientro = (/^ */.exec(riga) ?? [''])[0];
  const out = [];
  let resto = riga;
  let prefisso = '';
  while (prefisso.length + resto.length > max) {
    const spazio = max - prefisso.length;
    let taglio = resto.lastIndexOf(' ', spazio);
    if (taglio <= (out.length === 0 ? rientro.length : 0)) taglio = spazio;          // nessuno spazio utile: taglio netto
    out.push(prefisso + resto.slice(0, taglio).replace(/\s+$/, ''));
    resto = resto.slice(taglio).replace(/^\s+/, '');
    prefisso = rientro + '  ';
    if (prefisso.length >= max - 4) prefisso = '  ';
  }
  out.push(prefisso + resto);
  return out;
}

class Foglio {
  constructor(doc, { compress, registro }) {
    this.doc = doc;
    this.compress = compress;
    this.registro = registro;
    this.y = MARGINI.alto;
    this.decor = [];
    this.primaPagina = 1;
  }

  // ── Misure e disegno di base ─────────────────────────────────────────────
  larg(testo, font, stile, pt) {
    this.doc.setFont(font, stile); this.doc.setFontSize(pt);
    return this.doc.getTextWidth(testo);
  }

  reg(tipo, extra = {}) {
    if (!this.registro) return;
    this.registro.voci.push({ tipo, pagina: this.doc.getCurrentPageInfo().pageNumber, y: this.y, ...extra });
  }

  libero() { return BASSO_UTILE - this.y; }

  assicura(h) { if (h > this.libero() + 1e-6) this.nuovaPagina(); }

  nuovaPagina() {
    for (const d of [...this.decor].reverse()) this.chiudiDecor(d);       // dall'interno all'esterno: gli indici restano validi
    this.doc.addPage();
    this.y = MARGINI.alto;
    for (const d of this.decor) this.apriDecor(d);
  }

  // Un riquadro con sfondo (citazione) comincia dietro al contenuto: il suo sfondo si disegna a fine pezzo e si
  // inserisce nel flusso della pagina PRIMA di quel che è già scritto (`idx`), così sta dietro al testo.
  apriDecor(d) {
    d.y0 = this.y;
    d.pagina = this.doc.getCurrentPageInfo().pageNumber;
    d.idx = this.doc.internal.pages[d.pagina].length;
  }

  chiudiDecor(d) {
    if (d.tipo !== 'barra' || this.y - d.y0 < 0.5) return;
    const doc = this.doc;
    const pagina = this.doc.internal.pages[d.pagina];
    const n0 = pagina.length;
    doc.setFillColor(242);
    doc.rect(d.x, d.y0, d.w, this.y - d.y0, 'F');
    pagina.splice(d.idx, 0, ...pagina.splice(n0));                    // lo sfondo passa dietro al contenuto
    doc.setDrawColor(150); doc.setLineWidth(0.6);
    doc.line(d.x + 0.3, d.y0, d.x + 0.3, this.y);
  }

  // ── Testo con stili misti ────────────────────────────────────────────────
  // Da una lista di «run» a righe già spezzate: [{ segs: [{ testo, font, stile, pt, dy, barrato, w, x }], w }]
  righeDa(runs, larghezza, pt) {
    const righe = [];
    let riga = { segs: [], w: 0 };
    let spazio = null;                                         // lo spazio in attesa tra due parole della stessa riga
    const fine = () => { righe.push(riga); riga = { segs: [], w: 0 }; spazio = null; };
    const spec = (run) => {
      const ridotto = run.apice || run.pedice;
      const dimensione = (run.codice ? pt * 0.92 : pt) * (ridotto ? 0.72 : 1);
      const font = run.codice ? 'courier' : 'helvetica';
      const stile = run.codice ? (run.grassetto ? 'bold' : 'normal') : (run.grassetto && run.corsivo ? 'bolditalic' : run.grassetto ? 'bold' : run.corsivo ? 'italic' : 'normal');
      const dy = run.apice ? -pt * PT * 0.32 : run.pedice ? pt * PT * 0.14 : 0;
      return { font, stile, pt: dimensione, dy, barrato: !!run.barrato, codice: !!run.codice };
    };
    const aggiungi = (testo, s) => {
      const w = this.larg(testo, s.font, s.stile, s.pt);
      const ultimo = riga.segs[riga.segs.length - 1];
      if (ultimo && ultimo.font === s.font && ultimo.stile === s.stile && ultimo.pt === s.pt && ultimo.dy === s.dy && ultimo.barrato === s.barrato && ultimo.codice === s.codice) {
        ultimo.testo += testo; ultimo.w += w;
      } else riga.segs.push({ ...s, testo, w });
      riga.w += w;
    };
    for (const run of runs) {
      if (run.aCapo) { fine(); continue; }
      const s = spec(run);
      for (const pezzo of pulisci(run.testo).split(/( +)/)) {
        if (pezzo === '') continue;
        if (/^ +$/.test(pezzo)) {
          if (riga.segs.length > 0) spazio = { testo: ' ', s };
          continue;
        }
        let parola = pezzo;
        for (;;) {
          const wSp = spazio ? this.larg(' ', spazio.s.font, spazio.s.stile, spazio.s.pt) : 0;
          const w = this.larg(parola, s.font, s.stile, s.pt);
          if (riga.w + wSp + w <= larghezza + 1e-6) {
            if (spazio) aggiungi(' ', spazio.s);
            spazio = null;
            aggiungi(parola, s);
            break;
          }
          if (riga.segs.length > 0) { fine(); continue; }                // a capo e si riprova
          // Parola più larga della riga: la si taglia (rarissimo: indirizzi molto lunghi)
          let n = parola.length;
          while (n > 1 && this.larg(parola.slice(0, n), s.font, s.stile, s.pt) > larghezza) n--;
          aggiungi(parola.slice(0, n), s);
          fine();
          parola = parola.slice(n);
          if (parola === '') break;
        }
      }
    }
    if (riga.segs.length > 0 || righe.length === 0) righe.push(riga);
    // Un a capo seguito da niente non deve lasciare righe vuote in fondo
    while (righe.length > 1 && righe[righe.length - 1].segs.length === 0) righe.pop();
    return righe;
  }

  disegnaRiga(riga, x, yRiga, lh, grigio = 0) {
    const doc = this.doc;
    const base = yRiga + lh * 0.74;
    let cx = x;
    for (const s of riga.segs) {
      if (s.codice) {                                          // codice in riga: sfondo chiaro, senza bordo
        doc.setFillColor(238);
        doc.roundedRect(cx - 0.4, base - lh * 0.72, s.w + 0.8, lh * 0.98, 0.7, 0.7, 'F');
      }
      doc.setFont(s.font, s.stile); doc.setFontSize(s.pt); doc.setTextColor(grigio);
      doc.text(s.testo, cx, base + s.dy);
      if (s.barrato) { doc.setDrawColor(grigio); doc.setLineWidth(0.2); doc.line(cx, base - s.pt * PT * 0.3, cx + s.w, base - s.pt * PT * 0.3); }
      cx += s.w;
    }
  }

  // Disegna le righe di un testo in flusso (con salto pagina), tenendo insieme almeno due righe all'inizio e alla fine.
  flussoRighe(righe, ctx, lh, { grigio = 0, tipo = 'riga' } = {}) {
    righe.forEach((r, i) => {
      const resto = righe.length - i;
      this.assicura(lh * (i === 0 ? Math.min(2, righe.length) : resto === 2 && righe.length > 3 ? 2 : 1));
      this.disegnaRiga(r, ctx.x, this.y, lh, grigio);
      this.reg(tipo, { testo: r.segs.map((s) => s.testo).join(''), x: ctx.x, h: lh });
      this.y += lh;
    });
  }

  // ── Markdown della traccia ───────────────────────────────────────────────
  blocchiMd(nodi, ctx) {
    const lh = ctx.pt * PT * INTERLINEA;
    for (const n of nodi) {
      if (n.t === 'paragrafo') {
        this.flussoRighe(this.righeDa(n.righe, ctx.w, ctx.pt), ctx, lh, { grigio: ctx.grigio });
        if (!ctx.compatto) this.y += lh * 0.45;
      } else if (n.t === 'titolo') {
        const pt = Math.max(ctx.pt, [0, 12, 11, 10, 9.5][n.livello] ?? 9.5);
        const hl = pt * PT * INTERLINEA;
        const righe = this.righeDa(n.righe.map((r) => ({ ...r, grassetto: true })), ctx.w, pt);
        this.y += hl * 0.3;
        this.assicura(righe.length * hl + lh * 2);               // un titolo non resta mai solo in fondo alla pagina
        this.flussoRighe(righe, ctx, hl, { grigio: 0, tipo: 'titolo-md' });
        this.y += hl * 0.15;
      } else if (n.t === 'elenco') this.elencoMd(n, ctx);
      else if (n.t === 'citazione') {
        const d = { tipo: 'barra', x: ctx.x, w: ctx.w };
        this.y += 1;
        this.decor.push(d);
        this.apriDecor(d);
        this.y += 1.8;                                          // aria sopra il testo (sotto c'è già lo spazio dopo il paragrafo)
        this.blocchiMd(n.blocchi, { ...ctx, x: ctx.x + 4, w: ctx.w - 4, grigio: 70 });
        this.decor.pop();
        this.chiudiDecor(d);
        this.y += 1 + (ctx.compatto ? 0 : lh * 0.45);
      } else if (n.t === 'codice') this.codiceMd(n.testo, ctx);
      else if (n.t === 'tabella') this.tabellaMd(n, ctx);
      else if (n.t === 'linea') {
        this.assicura(4);
        this.doc.setDrawColor(150); this.doc.setLineWidth(0.25);
        this.doc.line(ctx.x, this.y + 1.5, ctx.x + ctx.w, this.y + 1.5);
        this.y += 3.5;
      }
    }
  }

  elencoMd(n, ctx) {
    const lh = ctx.pt * PT * INTERLINEA;
    const rientro = 5.5;
    n.voci.forEach((voce, i) => {
      this.assicura(lh * 2);
      const yMarca = this.y;
      if (n.ordinato) {
        const numero = `${n.inizio + i}.`;
        this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(ctx.pt); this.doc.setTextColor(ctx.grigio ?? 0);
        const w = this.doc.getTextWidth(numero);
        this.doc.text(numero, ctx.x + rientro - 1.2 - w, yMarca + lh * 0.74);
      } else {
        const r = 0.55;
        this.doc.setFillColor(ctx.grigio ?? 0);
        this.doc.circle(ctx.x + rientro - 2.2, yMarca + lh * 0.55, r, 'F');
      }
      this.blocchiMd(voce, { ...ctx, x: ctx.x + rientro, w: ctx.w - rientro, compatto: true });
    });
    if (!ctx.compatto) this.y += lh * 0.45;
  }

  codiceMd(testo, ctx) {
    const lh = PT_CODICE * PT * 1.3;
    const max = Math.floor((ctx.w - 2 * PAD) / this.larg('M', 'courier', 'normal', PT_CODICE));
    const righe = pulisci(testo, { simboli: true }).split('\n').flatMap((r) => spezzaRiga(r, max));
    this.riquadroSpezzato(righe, ctx.x, ctx.w, lh);
    this.y += 1.5;
  }

  tabellaMd(n, ctx) {
    const pt = ctx.pt;
    const lh = pt * PT * INTERLINEA;
    this.y += lh * 0.2;
    const colonne = Math.max(n.intestazione.length, ...n.righe.map((r) => r.length), 1);
    const celle = (riga) => Array.from({ length: colonne }, (_, i) => riga[i] ?? []);
    const intest = celle(n.intestazione).map((c) => c.map((r) => ({ ...r, grassetto: true })));
    const tutte = [intest, ...n.righe.map(celle)];
    // Larghezza naturale (tutto su una riga) e minima (la parola più lunga) di ogni colonna
    const nat = new Array(colonne).fill(0); const min = new Array(colonne).fill(0);
    for (const riga of tutte) riga.forEach((c, i) => {
      const una = this.righeDa(c, 1e6, pt)[0];
      nat[i] = Math.max(nat[i], una.w);
      const stretta = this.righeDa(c, 0.5, pt);
      min[i] = Math.max(min[i], ...stretta.map((r) => r.w));
    });
    const margine = 1.6;
    const disp = ctx.w - colonne * 2 * margine;
    let larghezze;
    const sommaNat = nat.reduce((a, b) => a + b, 0);
    if (sommaNat <= disp) larghezze = nat.map((v) => v + 3);              // larga quanto il contenuto (come nell'app), non a tutta larghezza
    else {
      const sommaMin = min.reduce((a, b) => a + b, 0);
      const extra = Math.max(0, disp - sommaMin);
      const richiesto = nat.reduce((a, v, i) => a + (v - min[i]), 0) || 1;
      larghezze = min.map((m, i) => m + extra * ((nat[i] - m) / richiesto));
    }
    const scala = Math.min(1, disp / larghezze.reduce((a, b) => a + b, 0));
    larghezze = larghezze.map((v) => v * scala + 2 * margine);
    tutte.forEach((riga, ri) => {
      const righeCella = riga.map((c, i) => this.righeDa(c, larghezze[i] - 2 * margine, pt));
      const h = Math.max(...righeCella.map((r) => r.length)) * lh + 1.2;
      this.assicura(h);
      let x = ctx.x;
      riga.forEach((_, i) => {
        if (ri === 0 && n.intestazione.length) { this.doc.setFillColor(238); this.doc.rect(x, this.y, larghezze[i], h, 'F'); }
        this.doc.setDrawColor(150); this.doc.setLineWidth(0.2);
        this.doc.rect(x, this.y, larghezze[i], h);
        righeCella[i].forEach((r, k) => this.disegnaRiga(r, x + margine, this.y + 0.6 + k * lh, lh, ctx.grigio ?? 0));
        x += larghezze[i];
      });
      this.reg('tabella-riga', { h, testo: riga.map((c) => c.map((r) => r.testo ?? '').join('')).join(' | ') });
      this.y += h;
    });
    this.y += lh * 0.7;
  }

  // ── Riquadri di codice ───────────────────────────────────────────────────
  // Un riquadro chiaro con righe a larghezza fissa. Può spezzarsi tra due pagine (ogni pezzo ha il suo riquadro).
  riquadroSpezzato(righe, x, w, lh) {
    let da = 0;
    while (da < righe.length) {
      this.assicura(PAD * 2 + lh * Math.min(3, righe.length - da));
      const n = Math.min(righe.length - da, Math.max(1, Math.floor((this.libero() - 2 * PAD) / lh)));
      this.riquadroCodice(righe.slice(da, da + n), x, w, lh, PAD * 2 + n * lh);
      this.y += PAD * 2 + n * lh;
      da += n;
      if (da < righe.length) this.nuovaPagina();
    }
  }

  // Una riga di codice a larghezza fissa. ≠ ≤ ≥ non sono nei font standard del PDF: si disegnano con linee, nella loro cella.
  rigaCodice(r, x, base, cella) {
    const doc = this.doc;
    let da = 0;
    const testo = (a, b) => { if (b > a) doc.text(r.slice(a, b), x + a * cella, base); };
    for (let i = 0; i < r.length; i++) {
      if (!SIMBOLI.includes(r[i])) continue;
      testo(da, i);
      this.simbolo(r[i], x + i * cella, base, cella);
      da = i + 1;
    }
    testo(da, r.length);
  }

  simbolo(c, x, base, cella) {
    const doc = this.doc;
    const em = PT_CODICE * PT;
    const y = (k) => base - k * em;                           // k = altezza sopra la linea di base, in em
    const a = x + cella * 0.14; const b = x + cella * 0.86;
    doc.setDrawColor(0); doc.setLineWidth(em * 0.045); doc.setLineCap('round'); doc.setLineJoin('round');
    if (c === '\u2260') {                                     // = con una barra obliqua
      doc.line(a, y(0.42), b, y(0.42)); doc.line(a, y(0.2), b, y(0.2));
      doc.line(x + cella * 0.68, y(0.66), x + cella * 0.32, y(0.0));
    } else {                                                  // < o > con un trattino sotto
      const punta = c === '\u2264' ? a : b; const apertura = c === '\u2264' ? b : a;
      doc.line(apertura, y(0.66), punta, y(0.42)); doc.line(punta, y(0.42), apertura, y(0.18));
      doc.line(a, y(0.0), b, y(0.0));
    }
    doc.setLineCap('butt'); doc.setLineJoin('miter');
  }

  riquadroCodice(righe, x, w, lh, h) {
    const doc = this.doc;
    doc.setFillColor(246); doc.setDrawColor(150); doc.setLineWidth(0.25);
    doc.rect(x, this.y, w, h, 'FD');
    doc.setFont('courier', 'normal'); doc.setFontSize(PT_CODICE); doc.setTextColor(0);
    const cella = doc.getTextWidth('M');                       // il Courier ha celle di larghezza fissa
    righe.forEach((r, i) => { if (r !== '') this.rigaCodice(r, x + PAD, this.y + PAD + i * lh + lh * 0.74, cella); });
    this.reg('codice', { x, h, righe: righe.length, testo: righe.join('\n') });
  }

  // ── Sezioni ──────────────────────────────────────────────────────────────
  etichetta(testo, x, w) {
    const doc = this.doc;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(0);
    doc.text(pulisci(testo), x, this.y + 3.2);
    doc.setDrawColor(120); doc.setLineWidth(0.25);
    doc.line(x, this.y + 4.4, x + w, this.y + 4.4);
    this.reg('sezione', { testo, x });
  }

  get hEtichetta() { return 6.2; }

  // Righe di codice spezzate per la colonna di larghezza `w`.
  righeCodice(testo, w) {
    const max = Math.floor((w - 2 * PAD) / this.larg('M', 'courier', 'normal', PT_CODICE));
    return pulisci(testo, { simboli: true }).replace(/\s+$/, '').split('\n').flatMap((r) => spezzaRiga(r, max));
  }

  // Due codici affiancati, di uguale altezza; si tengono su una pagina se ci stanno, altrimenti si spezzano (righe in pari).
  coppiaCodici(a, b, { x = MARGINI.sx, w = COLONNA } = {}) {
    const lh = PT_CODICE * PT * 1.3;
    const xb = x + w + SPAZIO_COLONNE;
    let da = 0;
    let primo = true;
    const tot = Math.max(a.righe.length, b ? b.righe.length : 0);
    const altezzaTot = this.hEtichetta + 2 * PAD + tot * lh;
    if (altezzaTot <= CAPIENZA && altezzaTot > this.libero()) this.nuovaPagina();
    while (da < tot) {
      this.assicura(this.hEtichetta + 2 * PAD + lh * Math.min(4, tot - da));
      const k = Math.max(1, Math.floor((this.libero() - this.hEtichetta - 2 * PAD) / lh));
      const pa = a.righe.slice(da, da + k); const pb = b ? b.righe.slice(da, da + k) : [];
      const n = Math.max(pa.length, pb.length);
      const sfx = primo ? '' : ' (continua)';
      this.etichetta(a.titolo + sfx, x, w);
      if (b) this.etichetta2(b.titolo + sfx, xb, w);
      const y0 = this.y;
      this.y = y0 + this.hEtichetta;
      const h = 2 * PAD + n * lh;
      this.riquadroCodice(pa, x, w, lh, h);
      if (b) this.riquadroCodice(pb, xb, w, lh, h);
      this.y = y0 + this.hEtichetta + h;
      da += k; primo = false;
      if (da < tot) this.nuovaPagina();
    }
    this.y += GIU;
  }

  // la seconda etichetta sulla stessa riga: non registra una nuova «sezione» di flusso, solo il disegno
  etichetta2(testo, x, w) {
    const registro = this.registro; this.registro = null;
    this.etichetta(testo, x, w);
    this.registro = registro;
    this.reg('sezione', { testo, x });
  }

  // I blocchi (immagine) in un riquadro bianco con filo sottile.
  riquadroBlocchi(img, x, y, w, h, scala, taglio = null) {
    const doc = this.doc;
    doc.setFillColor(255); doc.setDrawColor(150); doc.setLineWidth(0.25);
    doc.rect(x, y, w, h, 'FD');
    this.reg('blocchi', { x, h, scala });
    if (!img) return;
    const wi = img.larghezzaPx * PX * scala; const hi = img.altezzaPx * PX * scala;
    const formato = 'PNG';
    const compr = this.compress ? 'FAST' : 'NONE';
    if (taglio) {
      doc.saveGraphicsState();
      doc.rect(x + 0.3, y + 0.3, w - 0.6, h - 0.6, null);
      doc.clip();
      doc.discardPath();
      doc.addImage(img.dataUrl, formato, x + PAD, y + PAD - taglio.da, wi, hi, img.alias, compr);
      doc.restoreGraphicsState();
    } else doc.addImage(img.dataUrl, formato, x + PAD, y + PAD, wi, hi, img.alias, compr);
  }

  // Scheda intera ----------------------------------------------------------
  scheda(s) {
    const doc = this.doc;
    const classe = [s.corso, s.classe].filter(Boolean).join(' · ');
    // Intestazione
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(0);
    const titoloRighe = this.righeDa([{ testo: s.titolo || 'Verifica', grassetto: true }], LARGHEZZA, 15);
    for (const r of titoloRighe) { this.disegnaRiga(r, MARGINI.sx, this.y, 7); this.reg('titolo', { testo: r.segs.map((g) => g.testo).join('') }); this.y += 7; }
    if (classe) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(70);
      doc.text(pulisci(classe), MARGINI.sx, this.y + 4); this.reg('classe', { testo: classe }); this.y += 6;
    }
    this.y += 2.5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(0);
    const nome = pulisci(s.studente);
    doc.text(nome, MARGINI.sx, this.y + 4);
    this.reg('studente', { testo: nome });
    if (s.data) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(70);
      doc.text(pulisci(`Consegna del ${s.data}`), PAGINA.w - MARGINI.dx, this.y + 4, { align: 'right' });
      this.reg('data', { testo: s.data });
    }
    this.y += 6.5;
    doc.setDrawColor(60); doc.setLineWidth(0.5);
    doc.line(MARGINI.sx, this.y, PAGINA.w - MARGINI.dx, this.y);
    this.y += 4.5;

    // Traccia
    if (s.traccia) {
      this.assicura(this.hEtichetta + 2 * PT_CORPO * PT * INTERLINEA);
      this.etichetta(`Traccia: ${s.traccia.titolo}`, MARGINI.sx, LARGHEZZA);
      this.y += this.hEtichetta;
      this.blocchiMd(s.traccia.blocchi, { x: MARGINI.sx, w: LARGHEZZA, pt: PT_CORPO, grigio: 0 });
      this.y += GIU - 1;
    }

    // Blocchi e codici
    const t = s.testi;
    const img = s.blocchi;
    const hE = this.hEtichetta;
    const lh = PT_CODICE * PT * 1.3;
    const righe = t ? {
      pseudo: this.righeCodice(t.pseudocode, COLONNA), c: this.righeCodice(t.c, COLONNA),
      py: this.righeCodice(t.python, COLONNA), pyLargo: this.righeCodice(t.python, LARGHEZZA),
    } : { pseudo: ['-'], c: ['-'], py: ['-'], pyLargo: ['-'] };
    const wmm = img ? img.larghezzaPx * PX : COLONNA; const hmm = img ? img.altezzaPx * PX : 12;
    const scalaCol = Math.min(1, (COLONNA - 2 * PAD) / wmm);
    const hBlocchi2 = hmm * scalaCol + 2 * PAD;
    const hPseudo = righe.pseudo.length * lh + 2 * PAD;
    const dueColonne = hE + hPseudo <= CAPIENZA && (!img || (scalaCol >= SCALA_MIN_COLONNA && hE + hBlocchi2 <= CAPIENZA));
    const blocchiTesto = { righe: !img ? ['Programma non leggibile.'] : [] };

    if (dueColonne) {
      const h = Math.max(hBlocchi2, hPseudo);
      if (hE + h > this.libero()) this.nuovaPagina();
      this.etichetta('Programma a blocchi', MARGINI.sx, COLONNA);
      this.etichetta2('Pseudocodice', MARGINI.sx + COLONNA + SPAZIO_COLONNE, COLONNA);
      const y0 = this.y + hE;
      this.y = y0;
      if (img) this.riquadroBlocchi(img, MARGINI.sx, y0, COLONNA, h, scalaCol);
      else {
        this.riquadroCodice(blocchiTesto.righe, MARGINI.sx, COLONNA, lh, h);
      }
      this.riquadroCodice(righe.pseudo, MARGINI.sx + COLONNA + SPAZIO_COLONNE, COLONNA, lh, h);
      this.y = y0 + h + GIU;
      this.coppiaCodici({ titolo: 'C', righe: righe.c }, { titolo: 'Python', righe: righe.py });
    } else {
      // Blocchi a tutta larghezza (o, se non si leggono, solo la frase che lo dice)
      if (!img) {
        this.assicura(hE + 2 * PAD + lh);
        this.etichetta('Programma a blocchi', MARGINI.sx, LARGHEZZA);
        this.y += hE;
        this.riquadroCodice(blocchiTesto.righe, MARGINI.sx, LARGHEZZA, lh, 2 * PAD + lh);
        this.y += 2 * PAD + lh + GIU;
      }
      const scalaL = Math.min(1, (LARGHEZZA - 2 * PAD) / wmm);
      const disp = CAPIENZA - hE - 2 * PAD;
      const scala = hmm * scalaL > disp ? Math.max(Math.min(scalaL, disp / hmm), Math.min(scalaL, SCALA_MIN_ALTEZZA)) : scalaL;
      const hTot = img ? hmm * scala : 0;
      let da = 0;
      let primo = true;
      // Se ci sta in una pagina intera, ma non in quello che resta di questa, si comincia da una pagina nuova: si taglia solo ciò che è più alto di una pagina.
      if (hE + 2 * PAD + hTot <= CAPIENZA) this.assicura(hE + 2 * PAD + hTot);
      while (da < hTot - 1e-6) {
        this.assicura(hE + 2 * PAD + Math.min(hTot - da, 40));
        const spazio = this.libero() - hE - 2 * PAD;
        const pezzo = Math.min(hTot - da, spazio);
        this.etichetta(`Programma a blocchi${primo ? '' : ' (continua)'}`, MARGINI.sx, LARGHEZZA);
        const y0 = this.y + hE;
        this.y = y0;
        this.riquadroBlocchi(img, MARGINI.sx, y0, LARGHEZZA, pezzo + 2 * PAD, scala, hTot > pezzo + 1e-6 || da > 0 ? { da } : null);
        this.y = y0 + pezzo + 2 * PAD + GIU;
        da += pezzo; primo = false;
        if (da < hTot - 1e-6) this.nuovaPagina();
      }
      this.coppiaCodici({ titolo: 'Pseudocodice', righe: righe.pseudo }, { titolo: 'C', righe: righe.c });
      const xPy = MARGINI.sx;
      this.coppiaCodici({ titolo: 'Python', righe: righe.pyLargo }, null, { x: xPy, w: LARGHEZZA });
    }
  }
}

// Piè di pagina di ogni pagina della scheda, a scheda finita (si sa quante pagine ha).
function disegnaPiedi(doc, s, da, a) {
  const n = a - da + 1;
  const sinistra = pulisci([s.titolo, s.classe, s.data].filter(Boolean).join(' · '));
  const destra = pulisci(`${s.studente}${s.riscontro ? ` · riscontro ${s.riscontro}` : ''}`);
  for (let p = da; p <= a; p++) {
    doc.setPage(p);
    const y = PAGINA.h - 11;
    doc.setDrawColor(150); doc.setLineWidth(0.25);
    doc.line(MARGINI.sx, y - 3.5, PAGINA.w - MARGINI.dx, y - 3.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(70);
    const dx = `${destra} · pagina ${p - da + 1}/${n}`;
    const wDx = doc.getTextWidth(dx);
    doc.text(dx, PAGINA.w - MARGINI.dx, y, { align: 'right' });
    let sx = sinistra;
    const max = LARGHEZZA - wDx - 6;
    while (sx.length > 3 && doc.getTextWidth(sx) > max) sx = sx.slice(0, -2).replace(/\s+$/, '') + '...';
    doc.text(sx, MARGINI.sx, y);
  }
}

// `schede`: [{ titolo, corso, classe, data, studente, riscontro, traccia: { titolo, testoMd, blocchi } | null,
//              blocchi: { dataUrl, larghezzaPx, altezzaPx, alias? } | null, testi: { pseudocode, c, python } | null }]
// `traccia.blocchi` è la struttura di pdf-markdown.js (convertiMarkdown(...).blocchi); chi chiama la prepara (il Markdown si
// tokenizza in modo asincrono). Restituisce il documento jsPDF. `registro`: facoltativo, per le prove ({ voci: [], schede: [] }).
export function creaPdfSchede({ jsPDF, schede, compress = true, registro = null }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress });
  doc.setProperties({ title: schede.length === 1 ? `${schede[0].titolo} - ${schede[0].studente}` : (schede[0]?.titolo ?? 'Consegne'), creator: 'IsaBlock' });
  schede.forEach((s, i) => {
    if (i > 0) doc.addPage();
    const da = doc.getCurrentPageInfo().pageNumber;
    const foglio = new Foglio(doc, { compress, registro });
    foglio.scheda({ ...s, blocchi: s.blocchi ? { ...s.blocchi, alias: `b${i}` } : null });
    const a = doc.getCurrentPageInfo().pageNumber;
    disegnaPiedi(doc, s, da, a);
    doc.setPage(a);
    registro?.schede.push({ da, a, pagine: a - da + 1 });
  });
  return doc;
}

export const MISURE = Object.freeze({ PAGINA, MARGINI, LARGHEZZA, COLONNA, BASSO_UTILE, CAPIENZA });
