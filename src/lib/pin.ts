/**
 * PIN hashing for the optional lock screen.
 *
 * The PIN is stored as SHA-256(salt + ":" + pin) with a random 16-byte salt,
 * via Web Crypto. This is a privacy screen, not encryption: the data itself
 * stays readable to anyone with access to the browser's storage, and a 4–6
 * digit PIN could be brute-forced offline. It stops casual snooping only.
 */

export const PIN_MIN = 4;
export const PIN_MAX = 6;

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);
}

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  return toHex(await crypto.subtle.digest('SHA-256', data));
}

/** Constant-time comparison of two hex strings of equal length. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPin(pin: string, salt: string, expectedHash: string): Promise<boolean> {
  return safeEqual(await hashPin(pin, salt), expectedHash);
}

/** After this many wrong tries the lock screen makes you wait. */
export const MAX_ATTEMPTS = 5;
/** Wait after too many wrong tries, doubling each further round (30 s, 60 s, 120 s…), capped at 15 min. */
export function lockoutMs(failedRounds: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, failedRounds - 1), 15 * 60_000);
}

/** Lock again after the app has been in the background at least this long. */
export const RELOCK_AFTER_MS = 30_000;
