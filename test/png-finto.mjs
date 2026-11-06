// Aiuto per le prove: un PNG a tinta unita (con un riquadro più scuro) generato senza librerie, per provare l'impaginazione.
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let c; let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function pezzo(tipo, dati) {
  const len = Buffer.alloc(4); len.writeUInt32BE(dati.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dati]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([len, corpo, crc]);
}
export function pngFinto(w, h, [r, g, b] = [120, 170, 235]) {
  const riga = Buffer.alloc(1 + w * 3);
  const dati = Buffer.alloc((1 + w * 3) * h);
  for (let y = 0; y < h; y++) {
    riga[0] = 0;
    for (let x = 0; x < w; x++) {
      const bordo = x < 3 || y < 3 || x >= w - 3 || y >= h - 3 || (y % 40 < 2);
      riga[1 + x * 3] = bordo ? 40 : r; riga[2 + x * 3] = bordo ? 40 : g; riga[3 + x * 3] = bordo ? 40 : b;
    }
    riga.copy(dati, y * riga.length);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pezzo('IHDR', ihdr), pezzo('IDAT', deflateSync(dati)), pezzo('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}
