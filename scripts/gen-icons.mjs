// Generates public/icons/icon-192.png and icon-512.png — a mint→sky gradient
// square matching the planner palette. Zero-dependency PNG encoder (zlib + CRC).
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function crc32(buf) {
  let c,
    table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function makeIcon(size) {
  const mint = [0xd9, 0xf5, 0xdc];
  const sky = [0xa9, 0xc6, 0xf7];
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0; // no filter
    for (let x = 0; x < size; x++) {
      const t = x / (size - 1);
      const o = row + 1 + x * 4;
      raw[o] = lerp(mint[0], sky[0], t);
      raw[o + 1] = lerp(mint[1], sky[1], t);
      raw[o + 2] = lerp(mint[2], sky[2], t);
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(join(root, "public", "icons"), { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(join(root, "public", "icons", `icon-${size}.png`), makeIcon(size));
  console.log(`wrote public/icons/icon-${size}.png`);
}
