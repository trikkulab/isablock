// Scorciatoie da tastiera per creare i blocchi: una lettera (o un simbolo) = un blocco nuovo nell'area di lavoro.
// Il blocco compare libero sotto il puntatore del mouse (o in un punto libero dell'area visibile, se il mouse non è
// sull'area) e resta selezionato: lo studente lo trascina dove serve. Non si aggancia a nulla di proposito.
//
// La tabella SCORCIATOIE è l'unico posto in cui si decide quale tasto fa cosa: la usano sia la tastiera sia le
// etichette mostrate sui blocchi della tavolozza. Il modulo non conosce main.js: riceve Blockly e l'area di lavoro.

const FINESTRA_CIFRE_MS = 1000;   // due cifre premute entro questo tempo formano un numero solo (1, 2 -> 12)
const MAX_CIFRE = 9;

// tasto: il carattere prodotto (event.key, minuscolo); maiusc: se indicato, il tasto vale solo con (true) o senza
// (false) Maiusc; campi: valori iniziali dei menu del blocco; etichetta: cosa si scrive sul blocco in tavolozza.
export const SCORCIATOIE = Object.freeze([
  { tasto: 's', tipo: 'write', etichetta: 'S' },
  { tasto: 'l', tipo: 'read', etichetta: 'L' },
  { tasto: 'a', tipo: 'assign', etichetta: 'A' },
  { tasto: 'v', tipo: 'variable_get', etichetta: 'V' },
  { tasto: 't', tipo: 'text_literal', etichetta: 'T' },
  { tasto: 'm', tipo: 'controls_while', etichetta: 'M' },
  { tasto: 'e', tipo: 'controls_do_while', etichetta: 'E' },
  { tasto: 'f', tipo: 'controls_for_simple', etichetta: 'F' },
  { tasto: 'p', tipo: 'controls_for_simple' },               // alias di F: nessuna etichetta
  { tasto: 'r', tipo: 'repeat_times', etichetta: 'R' },
  { tasto: 'i', maiusc: false, tipo: 'controls_if_simple', etichetta: 'I' },
  { tasto: 'i', maiusc: true, tipo: 'controls_if_else', etichetta: '⇧I' },
  { tasto: 'c', tipo: 'comment_line', etichetta: 'C' },
  { tasto: 'b', tipo: 'bool_literal', etichetta: 'B' },
  { tasto: '+', tipo: 'arith_op', campi: { OP: 'ADD' } },
  { tasto: '-', tipo: 'arith_op', campi: { OP: 'SUB' } },
  { tasto: '*', tipo: 'arith_op', campi: { OP: 'MUL' } },
  { tasto: '/', tipo: 'arith_op', campi: { OP: 'DIV' } },
  { tasto: '%', tipo: 'arith_op', campi: { OP: 'MOD' } },
  { tasto: '=', tipo: 'compare_op', campi: { OP: 'EQ' } },
  { tasto: '<', tipo: 'compare_op', campi: { OP: 'LT' } },
  { tasto: '>', tipo: 'compare_op', campi: { OP: 'GT' } },
  { tasto: '&', tipo: 'logic_op', campi: { OP: 'AND' } },
  { tasto: '|', tipo: 'logic_op', campi: { OP: 'OR' } },
  { tasto: '!', tipo: 'not_op', etichetta: '!' },
]);

// Etichette per i blocchi che hanno piu' tasti (un solo badge per blocco).
const ETICHETTE_EXTRA = Object.freeze({
  number_literal: '0–9',
  arith_op: '+ − * / %',
  compare_op: '< > =',
  logic_op: '& |',
});

export function etichettaTavolozza(tipo) {
  if (ETICHETTE_EXTRA[tipo]) return ETICHETTE_EXTRA[tipo];
  return SCORCIATOIE.find((s) => s.tipo === tipo && s.etichetta)?.etichetta ?? null;
}

// Le scorciatoie di Blockly sulle stesse lettere (spostamento, navigazione, pulizia...) vanno tolte, altrimenti
// M, I, T, C, B farebbero altro. D (duplica) e X (stacca) restano: sono nella Guida.
const SCORCIATOIE_BLOCKLY_DA_TOGLIERE = [
  'start_move', 'start_move_stack', 'information', 'extended_information', 'focus_toolbox', 'cleanup', 'previous_stack',
];

export function attivaScorciatoieBlocchi({ Blockly, workspace, blocklyDiv, bloccate }) {
  const registro = Blockly.ShortcutRegistry.registry;
  for (const nome of SCORCIATOIE_BLOCKLY_DA_TOGLIERE) registro.unregister(nome);

  let puntatore = null;          // ultima posizione del mouse sull'area di lavoro (coordinate dello schermo)
  let contaFallback = 0;
  let ultimoNumero = null;       // { blocco, quando }: per comporre i numeri a piu' cifre

  blocklyDiv.addEventListener('pointermove', (ev) => { puntatore = { x: ev.clientX, y: ev.clientY }; });
  blocklyDiv.addEventListener('pointerleave', () => { puntatore = null; });

  function posizioneNuovoBlocco() {
    const { Coordinate } = Blockly.utils;
    if (puntatore) {
      return Blockly.utils.svgMath.screenToWsCoordinates(workspace, new Coordinate(puntatore.x, puntatore.y));
    }
    const vista = workspace.getMetricsManager().getViewMetrics(true);
    const passo = contaFallback++ % 6;
    return new Coordinate(vista.left + 40 + passo * 30, vista.top + 40 + passo * 40);
  }

  function creaBlocco(tipo, campi = {}) {
    workspace.getToolbox()?.clearSelection();   // chiude la tavolozza aperta: il blocco non deve nascerle sotto
    Blockly.Events.setGroup(true);
    try {
      const blocco = workspace.newBlock(tipo);
      for (const [nome, valore] of Object.entries(campi)) blocco.setFieldValue(valore, nome);
      blocco.initSvg();
      blocco.render();
      blocco.moveTo(posizioneNuovoBlocco());
      Blockly.getFocusManager().focusNode(blocco);   // lo seleziona e gli dà il focus: Ctrl+Z, D, X, Canc valgono subito
      return blocco;
    } finally {
      Blockly.Events.setGroup(false);
    }
  }

  function inScrittura(ev) {
    const t = ev.target;
    const tag = t?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return true;
    // Menu a tendina o campo di Blockly aperto: i tasti sono suoi.
    return Boolean(Blockly.WidgetDiv.isVisible() || Blockly.DropDownDiv.isVisible());
  }

  // Etichetta con la lettera sui blocchi della tavolozza, ridisegnata ogni volta che si apre una categoria.
  function etichettaSulBlocco(blocco) {
    const testo = etichettaTavolozza(blocco.type);
    if (!testo) return;
    const { dom } = Blockly.utils;
    const g = dom.createSvgElement('g', {
      class: 'etichetta-scorciatoia',
      transform: 'translate(-8, -7)',   // parte un po' fuori dal bordo sinistro e si sovrappone appena al blocco
    }, blocco.getSvgRoot());
    const rect = dom.createSvgElement('rect', { height: 14, rx: 3, ry: 3 }, g);
    const t = dom.createSvgElement('text', { y: 10.5, 'text-anchor': 'middle' }, g);
    t.textContent = testo;
    // Riquadro largo quanto il testo (misurato, non stimato: i simboli come "+ − * / %" sono stretti).
    const larghezza = Math.ceil(t.getBBox().width || testo.length * 6) + 8;
    rect.setAttribute('width', larghezza);
    t.setAttribute('x', larghezza / 2);
  }

  workspace.addChangeListener((ev) => {
    if (ev.type !== Blockly.Events.TOOLBOX_ITEM_SELECT) return;
    setTimeout(() => {
      const aperta = workspace.getFlyout()?.getWorkspace();
      if (!aperta) return;
      for (const blocco of aperta.getTopBlocks(false)) {
        if (!blocco.getSvgRoot().querySelector(':scope > .etichetta-scorciatoia')) etichettaSulBlocco(blocco);
      }
    }, 0);
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.defaultPrevented || ev.repeat || ev.metaKey) return;
    if (ev.ctrlKey && !ev.altKey) return;            // Ctrl+... sono comandi; Ctrl+Alt e' AltGr su Windows
    if (document.querySelector('.modal:not([hidden])') || bloccate()) return;
    if (inScrittura(ev)) return;

    const tasto = ev.key.length === 1 ? ev.key.toLowerCase() : '';
    if (!tasto) return;

    if (tasto >= '0' && tasto <= '9') {
      ev.preventDefault();
      const ora = Date.now();
      const prosegue = ultimoNumero
        && ora - ultimoNumero.quando < FINESTRA_CIFRE_MS
        && !ultimoNumero.blocco.disposed
        && Blockly.common.getSelected() === ultimoNumero.blocco;
      if (prosegue) {
        const cifre = `${ultimoNumero.blocco.getFieldValue('VALUE')}${tasto}`;
        if (cifre.length <= MAX_CIFRE) ultimoNumero.blocco.setFieldValue(cifre, 'VALUE');
        ultimoNumero.quando = ora;
      } else {
        ultimoNumero = { blocco: creaBlocco('number_literal', { VALUE: tasto }), quando: ora };
      }
      return;
    }

    const voce = SCORCIATOIE.find((s) => s.tasto === tasto && (s.maiusc === undefined || s.maiusc === ev.shiftKey));
    if (!voce) return;
    ev.preventDefault();
    ultimoNumero = null;
    creaBlocco(voce.tipo, voce.campi);
  });
}
