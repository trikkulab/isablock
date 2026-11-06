// Immagine dei blocchi di un programma per la scheda di consegna in PDF (src/cloud/pdf-ui.js): un workspace Blockly di
// sola lettura, fuori schermo, da cui si prende il solo disegno dei blocchi (senza sfondo, griglia né comandi) come PNG.
// Il disegno SVG di Blockly si ricopia in un SVG autonomo con gli stili «inlined» (le regole CSS di Blockly dipendono da
// elementi genitori che nell'SVG isolato non ci sono), si carica come immagine e si rasterizza su un canvas a scala 2.
//
// Come creaAnteprima in main.js usa un secondo workspace: Blockly considera «principale» l'ultimo creato, quindi alla fine
// si rimette quello dell'editor (altrimenti scorciatoie, copia e incolla agirebbero su un'area morta).

const SCALA_RASTER = 2;                 // pixel del PNG per pixel dell'editor
const MAX_LATO = 7000;                  // limite sul lato del canvas (i browser hanno tetti diversi)
const MARGINE = 6;                      // px intorno ai blocchi

// Proprietà di stile che contano per il disegno dei blocchi.
const PROPRIETA = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'opacity',
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'display', 'visibility',
];

function copiaStili(origine, copia) {
  const o = [origine, ...origine.querySelectorAll('*')];
  const c = [copia, ...copia.querySelectorAll('*')];
  if (o.length !== c.length) return;
  for (let i = 0; i < o.length; i++) {
    const stile = getComputedStyle(o[i]);
    for (const p of PROPRIETA) {
      const v = stile.getPropertyValue(p);
      if (v) c[i].style.setProperty(p, v);
    }
    c[i].removeAttribute('class');
    c[i].removeAttribute('filter');
    c[i].removeAttribute('clip-path');
  }
}

// `carica(ws, json)`: carica il programma (come il file: versione e migrazioni). `testi(ws)`: i tre codici.
export function creaRenderBlocchi({ Blockly, principale, carica, testi }) {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1600px;height:3000px;background:#fff;pointer-events:none';
  document.body.append(host);
  const ws = Blockly.inject(host, {
    readOnly: true,
    media: 'vendor/blockly/media/',
    sounds: false,
    zoom: { controls: false, wheel: false, startScale: 1, maxScale: 1, minScale: 1 },
    move: { scrollbars: false, drag: false, wheel: false },
    trashcan: false,
  });
  const rimettiPrincipale = () => { try { Blockly.common.setMainWorkspace(principale()); } catch { /* versione senza questa funzione */ } };
  rimettiPrincipale();
  let distrutto = false;

  async function rasterizza() {
    const riquadro = ws.getBlocksBoundingBox();
    const w = Math.ceil(riquadro.right - riquadro.left) + 2 * MARGINE;
    const h = Math.ceil(riquadro.bottom - riquadro.top) + 2 * MARGINE;
    const canvasOrigine = ws.getCanvas();
    const gruppo = canvasOrigine.cloneNode(true);
    copiaStili(canvasOrigine, gruppo);
    gruppo.removeAttribute('transform');
    gruppo.setAttribute('transform', `translate(${MARGINE - riquadro.left} ${MARGINE - riquadro.top})`);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('xmlns', ns);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    // I blocchi sono già in coordinate dello spazio di lavoro, a scala 1 (zoom bloccato).
    svg.append(gruppo);
    const testoSvg = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(testoSvg)}`;
    await img.decode();
    const k = Math.min(SCALA_RASTER, MAX_LATO / w, MAX_LATO / h);
    const tela = document.createElement('canvas');
    tela.width = Math.max(1, Math.round(w * k));
    tela.height = Math.max(1, Math.round(h * k));
    const c = tela.getContext('2d');
    c.fillStyle = '#fff';
    c.fillRect(0, 0, tela.width, tela.height);
    c.drawImage(img, 0, 0, tela.width, tela.height);
    return { dataUrl: tela.toDataURL('image/png'), larghezzaPx: w, altezzaPx: h };
  }

  return {
    // { testi: { pseudocode, c, python }, immagine: { dataUrl, larghezzaPx, altezzaPx } | null } oppure null se il programma non si legge.
    async rendi(json) {
      if (distrutto) return null;
      try {
        ws.clear();
        carica(ws, json);
        const codici = testi(ws);
        const vuoto = ws.getAllBlocks(false).length === 0;
        let immagine = null;
        if (!vuoto) {
          Blockly.svgResize(ws);
          immagine = await rasterizza();
        }
        return { testi: codici, immagine };
      } catch { return null; }
    },
    distruggi() {
      if (distrutto) return;
      distrutto = true;
      try { ws.dispose(); } catch { /* già eliminato */ }
      host.remove();
      rimettiPrincipale();
    },
  };
}
