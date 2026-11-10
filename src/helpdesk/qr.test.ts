import { describe, expect, it } from 'vitest';
import { encodeQr, formatBits, gfMul, rsDivisor, rsRemainder, barcodeStripes } from './qr';

describe('QR encoder', () => {
  it('GF(256) multiply is consistent', () => {
    expect(gfMul(0, 77)).toBe(0);
    expect(gfMul(1, 77)).toBe(77);
    expect(gfMul(2, 0x80)).toBe(0x1d); // reduction by 0x11D
    expect(gfMul(3, 7)).toBe(gfMul(7, 3));
  });

  it('Reed–Solomon codewords have zero syndromes', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    const ecc = rsRemainder(data, rsDivisor(10));
    const codeword = [...data, ...ecc];
    // evaluate c(α^i) for i = 0..9 → must be 0
    for (let i = 0; i < 10; i++) {
      let alpha = 1;
      for (let k = 0; k < i; k++) alpha = gfMul(alpha, 2);
      let acc = 0;
      for (const c of codeword) acc = gfMul(acc, alpha) ^ c;
      expect(acc).toBe(0);
    }
  });

  it('format bits match the spec table (level M)', () => {
    // ISO/IEC 18004 Table C.1, EC level M masks 0..7
    expect(formatBits(0).toString(2).padStart(15, '0')).toBe('101010000010010');
    expect(formatBits(1).toString(2).padStart(15, '0')).toBe('101000100100101');
    expect(formatBits(7).toString(2).padStart(15, '0')).toBe('100101010100000');
  });

  it('picks the smallest version and draws finder patterns', () => {
    const small = encodeQr('HX-MBP-0142');
    expect(small.version).toBe(1);
    expect(small.size).toBe(21);
    const url = encodeQr('http://localhost:5180/helpdesk/fleet/HX-MBP-0142');
    expect(url.version).toBe(4);
    expect(url.size).toBe(33);
    for (const q of [small, url]) {
      const m = q.modules;
      const n = q.size;
      // 7×7 finder: dark ring, light ring, dark 3×3 core
      for (const [ox, oy] of [
        [0, 0],
        [n - 7, 0],
        [0, n - 7],
      ]) {
        expect(m[oy][ox]).toBe(true);
        expect(m[oy + 1][ox + 1]).toBe(false);
        expect(m[oy + 3][ox + 3]).toBe(true);
        expect(m[oy + 6][ox + 6]).toBe(true);
      }
      // timing pattern alternates
      for (let i = 8; i < n - 8; i++) expect(m[6][i]).toBe(i % 2 === 0);
      // dark module
      expect(m[n - 8][8]).toBe(true);
    }
  });

  it('is deterministic and rejects oversized payloads', () => {
    expect(encodeQr('abc').modules).toEqual(encodeQr('abc').modules);
    expect(() => encodeQr('x'.repeat(200))).toThrow();
  });

  it('barcode stripes are deterministic', () => {
    expect(barcodeStripes('HX-MBP-0142')).toEqual(barcodeStripes('HX-MBP-0142'));
    expect(barcodeStripes('HX-MBP-0142').every((w) => w >= 1 && w <= 3)).toBe(true);
  });
});
