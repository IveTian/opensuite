/**
 * 生成 PWA 图标 PNG（纯 Node，无额外依赖）。
 * 蓝色圆角底 + 白色信封造型，输出 192 / 512 / 180。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, crc32 } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../public/icons");
mkdirSync(outDir, { recursive: true });

const ACCENT = [0x00, 0x6f, 0xee];
const WHITE = [0xff, 0xff, 0xff];

function insideRoundedRect(x, y, size, radius) {
  const cx = Math.max(radius, Math.min(x, size - 1 - radius));
  const cy = Math.max(radius, Math.min(y, size - 1 - radius));
  const dx = x < radius ? radius - x : x > size - 1 - radius ? x - (size - 1 - radius) : 0;
  const dy = y < radius ? radius - y : y > size - 1 - radius ? y - (size - 1 - radius) : 0;
  return dx * dx + dy * dy <= radius * radius;
}

/** 归一化坐标 [0,1] 内的简单信封轮廓 */
function inEnvelope(nx, ny) {
  const bodyTop = 0.28;
  const bodyBottom = 0.78;
  const bodyLeft = 0.22;
  const bodyRight = 0.78;
  if (ny < bodyTop || ny > bodyBottom) return false;
  if (nx < bodyLeft || nx > bodyRight) return false;
  const midY = (bodyTop + bodyBottom) / 2;
  const leftEdge = bodyLeft + ((ny - bodyTop) / (midY - bodyTop)) * 0.26;
  const rightEdge = bodyRight - ((ny - bodyTop) / (midY - bodyTop)) * 0.26;
  if (ny <= midY) return nx >= leftEdge && nx <= rightEdge;
  const bottomLeft = bodyLeft + ((ny - midY) / (bodyBottom - midY)) * 0.26;
  const bottomRight = bodyRight - ((ny - midY) / (bodyBottom - midY)) * 0.26;
  return nx >= bottomLeft && nx <= bottomRight;
}

function pixelColor(x, y, size) {
  const nx = x / (size - 1);
  const ny = y / (size - 1);
  const radius = Math.round(size * 0.18);
  if (!insideRoundedRect(x, y, size, radius)) return null;
  if (inEnvelope(nx, ny)) return WHITE;
  return ACCENT;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      const c = pixelColor(x, y, size);
      const i = 1 + x * 4;
      if (c) {
        row[i] = c[0];
        row[i + 1] = c[1];
        row[i + 2] = c[2];
        row[i + 3] = 255;
      }
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [180, 192, 512]) {
  const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  writeFileSync(join(outDir, name), makePng(size));
  console.log("wrote", name);
}
