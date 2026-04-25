/**
 * Pure crypto-js TOTP (RFC 6238) — works reliably with React Native Hermes engine.
 * Replaces @otplib which has Hermes compatibility issues in production builds.
 */
import CryptoJS from 'crypto-js';

function base32ToWordArray(base32: string): CryptoJS.lib.WordArray {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = base32.toUpperCase().replace(/\s/g, '').replace(/=+$/, '');
  const bytes: number[] = [];
  let bits = 0;
  let val = 0;

  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((val >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  // CryptoJS WordArray expects 32-bit big-endian words, not individual bytes.
  // Pack every 4 bytes into one word.
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    words.push(
      ((bytes[i]     || 0) << 24) |
      ((bytes[i + 1] || 0) << 16) |
      ((bytes[i + 2] || 0) <<  8) |
       (bytes[i + 3] || 0)
    );
  }
  return CryptoJS.lib.WordArray.create(words as any, bytes.length);
}

function numberTo8Bytes(n: number): CryptoJS.lib.WordArray {
  const hi = Math.floor(n / 0x100000000);
  const lo = n >>> 0;
  return CryptoJS.lib.WordArray.create([hi, lo] as any, 8);
}

export function generateTOTP(secret: string): string {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const key = base32ToWordArray(secret);
  const msg = numberTo8Bytes(counter);

  const hmac = CryptoJS.HmacSHA1(msg, key);
  const hex = hmac.toString(CryptoJS.enc.Hex);
  const bytes = hex.match(/.{2}/g)!.map(b => parseInt(b, 16));

  const offset = bytes[19] & 0x0f;
  const code =
    ((bytes[offset]     & 0x7f) << 24) |
    ((bytes[offset + 1] & 0xff) << 16) |
    ((bytes[offset + 2] & 0xff) <<  8) |
     (bytes[offset + 3] & 0xff);

  return String(code % 1_000_000).padStart(6, '0');
}
