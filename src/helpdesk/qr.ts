/**
 * Minimal, real QR Code encoder (ISO/IEC 18004) — byte mode, error
 * correction level M, versions 1–6 (up to 106 bytes), automatic mask
 * selection by penalty score. Used for printable asset-tag stickers.
 *
 * Structure follows the reference algorithm (finder/timing/alignment
 * patterns, Reed–Solomon over GF(256) with 0x11D, zig-zag placement,
 * BCH-protected format bits).
 */

/** [ecCodewordsPerBlock, blocks, dataCodewordsPerBlock] for level M, versions 1..6. */
const EC_M: [number, number, number][] = [
  [10, 1, 16],
  [16, 1, 28],
  [26, 1, 44],
  [18, 2, 32],
  [24, 2, 43],
  [16, 4, 27],
];

const FORMAT_BITS_M = 0; // L=1, M=0, Q=3, H=2

export function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

export function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

export function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    for (let i = 0; i < result.length; i++) result[i] ^= gfMul(divisor[i], factor);
  }
  return result;
}

function utf8(text: string): number[] {
  return [...new TextEncoder().encode(text)];
}

export interface QrCode {
  version: number;
  size: number;
  mask: number;
  /** modules[y][x] — true = dark. */
  modules: boolean[][];
}

export function encodeQr(text: string): QrCode {
  const bytes = utf8(text);
  let version = 0;
  for (let v = 1; v <= EC_M.length; v++) {
    const [, blocks, dataPer] = EC_M[v - 1];
    if (blocks * dataPer * 8 >= 4 + 8 + bytes.length * 8) {
      version = v;
      break;
    }
  }
  if (!version) throw new Error('QR payload too long (max 106 bytes)');
  const [ecPer, blocks, dataPer] = EC_M[version - 1];
  const capacity = blocks * dataPer;

  // --- data bits
  const bits: number[] = [];
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, capacity * 8 - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < capacity; pad ^= 0xec ^ 0x11) data.push(pad);

  // --- blocks + EC, interleaved
  const divisor = rsDivisor(ecPer);
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  for (let b = 0; b < blocks; b++) {
    const block = data.slice(b * dataPer, (b + 1) * dataPer);
    dataBlocks.push(block);
    ecBlocks.push(rsRemainder(block, divisor));
  }
  const codewords: number[] = [];
  for (let i = 0; i < dataPer; i++) for (const blk of dataBlocks) codewords.push(blk[i]);
  for (let i = 0; i < ecPer; i++) for (const blk of ecBlocks) codewords.push(blk[i]);

  // --- function patterns
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFn = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const setFn = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    isFn[y][x] = true;
  };
  for (let i = 0; i < size; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(x, y, dist !== 2 && dist !== 4);
      }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  if (version >= 2) {
    const c = size - 7;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(c + dx, c + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // reserve format areas (drawn for real after masking)
  drawFormat(modules, isFn, size, 0, setFn);

  // --- zig-zag data placement
  let bit = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFn[y][x] && bit < totalBits) {
          modules[y][x] = ((codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1;
          bit++;
        }
      }
    }
  }

  // --- choose the mask with the lowest penalty
  let best = 0;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(modules, isFn, size, m);
    drawFormat(modules, isFn, size, m, setFn);
    const score = penalty(modules, size);
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
    applyMask(modules, isFn, size, m); // undo (XOR)
  }
  applyMask(modules, isFn, size, best);
  drawFormat(modules, isFn, size, best, setFn);
  return { version, size, mask: best, modules };
}

export function formatBits(mask: number): number {
  const data = (FORMAT_BITS_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function drawFormat(_m: boolean[][], _f: boolean[][], size: number, mask: number, setFn: (x: number, y: number, d: boolean) => void) {
  const bits = formatBits(mask);
  const get = (i: number) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) setFn(8, i, get(i));
  setFn(8, 7, get(6));
  setFn(8, 8, get(7));
  setFn(7, 8, get(8));
  for (let i = 9; i < 15; i++) setFn(14 - i, 8, get(i));
  for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, get(i));
  for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, get(i));
  setFn(8, size - 8, true);
}

function maskBit(m: number, x: number, y: number): boolean {
  switch (m) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function applyMask(modules: boolean[][], isFn: boolean[][], size: number, m: number) {
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!isFn[y][x] && maskBit(m, x, y)) modules[y][x] = !modules[y][x];
}

function penalty(mod: boolean[][], size: number): number {
  let score = 0;
  const line = (get: (i: number, j: number) => boolean) => {
    for (let i = 0; i < size; i++) {
      let run = 1;
      for (let j = 1; j <= size; j++) {
        if (j < size && get(i, j) === get(i, j - 1)) run++;
        else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      // finder-like patterns
      for (let j = 0; j + 10 < size; j++) {
        const seq = Array.from({ length: 11 }, (_, k) => (get(i, j + k) ? 1 : 0)).join('');
        if (seq === '10111010000' || seq === '00001011101') score += 40;
      }
    }
  };
  line((i, j) => mod[i][j]);
  line((i, j) => mod[j][i]);
  for (let y = 0; y < size - 1; y++)
    for (let x = 0; x < size - 1; x++) {
      const c = mod[y][x];
      if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) score += 3;
    }
  let dark = 0;
  for (const row of mod) for (const c of row) if (c) dark++;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  score += Math.max(0, k) * 10;
  return score;
}

/** Decorative-but-deterministic barcode stripe widths (1–3) for a label. */
export function barcodeStripes(text: string, count = 46): number[] {
  const out: number[] = [];
  let h = 2166136261;
  for (let i = 0; i < count; i++) {
    const c = text.charCodeAt(i % text.length) || 0;
    h = Math.imul(h ^ (c + i * 31), 16777619) >>> 0;
    out.push(1 + (h % 3));
  }
  return out;
}
