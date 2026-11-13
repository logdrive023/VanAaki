// Gera os ícones PNG do PWA sem dependências (mesmo desenho do public/icon.svg). Mesma técnica do projeto dia-dia.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const inRect = (x, y, [rx, ry, w, h, r]) => {
  if (x < rx || y < ry || x >= rx + w || y >= ry + h) return false;
  const cx = Math.min(Math.max(x, rx + r), rx + w - r), cy = Math.min(Math.max(y, ry + r), ry + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const shapes = [
  ['r', [0, 0, 512, 512, 112], '#111318'], ['r', [96, 150, 320, 190, 40], '#FFC20E'],
  ['r', [130, 180, 80, 60, 12], '#111318'], ['r', [226, 180, 80, 60, 12], '#111318'], ['r', [322, 180, 62, 60, 12], '#111318'],
  ['c', [170, 350, 34], '#ffffff'], ['c', [342, 350, 34], '#ffffff'],
];
function icon(size) {
  const s = size / 512, raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / s, py = (y + 0.5) / s; let c = [0, 0, 0, 0];
      for (const [k, g, col] of shapes) {
        const hit = k === 'r' ? inRect(px, py, g) : (px - g[0]) ** 2 + (py - g[1]) ** 2 <= g[2] ** 2;
        if (hit) c = [...hex(col), 255];
      }
      raw.set(c, y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const n of [192, 512]) writeFileSync(`public/icon-${n}.png`, icon(n));
console.log('ícones gerados');
