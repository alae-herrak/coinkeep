/**
 * Money helpers. All money in Coinkeep is Moroccan Dirham (MAD), stored as
 * integer centimes (1 MAD = 100 centimes). Never use floats for stored or
 * summed amounts — only for compact display.
 *
 * Change the constants below to adjust how amounts look everywhere.
 */

/** Separator between thousands groups. Non-breaking so "1 250" never wraps. */
export const THOUSANDS_SEPARATOR = ' ';
export const DECIMAL_SEPARATOR = ',';
/** Placed between the number and the currency suffix. */
export const SUFFIX_SEPARATOR = ' ';
export const CURRENCY_SUFFIX = 'DH';
/** Proper minus sign (U+2212), not a hyphen. */
export const MINUS_SIGN = '−';
export const PLUS_SIGN = '+';

export type SignDisplay = 'auto' | 'always' | 'never';

export interface FormatOptions {
  /** 'auto': minus only when negative; 'always': also + for positives; 'never': no sign. */
  sign?: SignDisplay;
  /** Show the ",00" part. Defaults to true. When false the value is rounded to whole dirhams. */
  decimals?: boolean;
  /** Append " DH". Defaults to true. */
  suffix?: boolean;
}

function assertInteger(centimes: number): number {
  if (!Number.isFinite(centimes)) return 0;
  // Defensive: values should always be integers, but never print garbage.
  return Math.round(centimes);
}

/** "1250000" → "1 250 000" (using THOUSANDS_SEPARATOR). Expects a string of digits. */
export function groupThousands(digits: string): string {
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += THOUSANDS_SEPARATOR;
    out += digits[i];
  }
  return out;
}

function signPrefix(value: number, sign: SignDisplay): string {
  if (sign === 'never' || value === 0) return '';
  if (value < 0) return MINUS_SIGN;
  return sign === 'always' ? PLUS_SIGN : '';
}

/** Formats centimes as e.g. "1 250,00 DH" / "−1 250,00 DH". */
export function formatMAD(centimes: number, options: FormatOptions = {}): string {
  const { sign = 'auto', decimals = true, suffix = true } = options;
  const value = assertInteger(centimes);
  const abs = Math.abs(value);

  let body: string;
  let shownValue = value;
  if (decimals) {
    const whole = Math.floor(abs / 100);
    const cents = abs % 100;
    body = `${groupThousands(String(whole))}${DECIMAL_SEPARATOR}${String(cents).padStart(2, '0')}`;
  } else {
    // Round half away from zero to whole dirhams.
    const whole = Math.floor((abs + 50) / 100);
    if (whole === 0) shownValue = 0;
    body = groupThousands(String(whole));
  }

  const prefix = signPrefix(shownValue, sign);
  return `${prefix}${body}${suffix ? SUFFIX_SEPARATOR + CURRENCY_SUFFIX : ''}`;
}

/**
 * Compact format for charts and tight spaces: "850 DH", "1,2k DH", "12k DH", "3,4M DH".
 * Uses floats, which is fine because the result is display-only.
 */
export function formatMADCompact(centimes: number, options: Pick<FormatOptions, 'sign' | 'suffix'> = {}): string {
  const { sign = 'auto', suffix = true } = options;
  const value = assertInteger(centimes);
  const dirhams = Math.abs(value) / 100;

  let body: string;
  if (dirhams < 1000) {
    body = String(Math.round(dirhams));
    // 999,6 DH rounds to 1000 — fall through to the "k" branch for consistency.
    if (body === '1000') body = '1k';
  } else if (dirhams < 999_950) {
    body = compactUnit(dirhams / 1000, 'k');
  } else {
    body = compactUnit(dirhams / 1_000_000, 'M');
  }

  const shownZero = body === '0';
  const prefix = shownZero ? '' : signPrefix(value, sign);
  return `${prefix}${body}${suffix ? SUFFIX_SEPARATOR + CURRENCY_SUFFIX : ''}`;
}

function compactUnit(n: number, unit: string): string {
  // One decimal below 100 ("1,2k", "45,5k"), none above ("120k").
  if (n < 99.95) {
    const rounded = Math.round(n * 10) / 10;
    const [int, frac] = rounded.toFixed(1).split('.');
    return `${int}${frac === '0' ? '' : DECIMAL_SEPARATOR + frac}${unit}`;
  }
  return `${groupThousands(String(Math.round(n)))}${unit}`;
}

const SPACES = /[\s  ]/g;
const MINUS_CHARS = /^[-−]/;

/**
 * Parses a user-typed amount into integer centimes.
 * Accepts comma or dot as decimal separator ("12,5", "12.50"), spaces as
 * thousands separators ("1 250,00"), and — when both "," and "." appear —
 * treats the last one as the decimal separator ("1.250,50", "1,250.50").
 * Returns null for anything that isn't a clean amount (letters, >2 decimals…).
 */
export function parseAmount(input: string): number | null {
  let s = input.replace(SPACES, '');
  if (s.endsWith(CURRENCY_SUFFIX)) s = s.slice(0, -CURRENCY_SUFFIX.length);
  if (!/\d/.test(s)) return null;

  let negative = false;
  if (MINUS_CHARS.test(s)) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let intPart: string;
  let fracPart = '';

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalChar = lastComma > lastDot ? ',' : '.';
    const groupPattern = decimalChar === ',' ? /^\d{1,3}(\.\d{3})+$/ : /^\d{1,3}(,\d{3})+$/;
    const idx = s.lastIndexOf(decimalChar);
    const head = s.slice(0, idx);
    // The other separator may only appear as a thousands separator: "1.250.000,50".
    if (!groupPattern.test(head)) return null;
    intPart = head.replace(/[.,]/g, '');
    fracPart = s.slice(idx + 1);
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sepChar = lastComma >= 0 ? ',' : '.';
    const parts = s.split(sepChar);
    if (parts.length !== 2) return null;
    intPart = parts[0] ?? '';
    fracPart = parts[1] ?? '';
  } else {
    intPart = s;
  }

  if (intPart === '') intPart = '0';
  if (!/^\d+$/.test(intPart) || !/^\d{0,2}$/.test(fracPart)) return null;

  const centimes = Number(intPart) * 100 + Number(fracPart.padEnd(2, '0'));
  if (!Number.isSafeInteger(centimes)) return null;
  return negative ? -centimes : centimes;
}

/**
 * Formats centimes for an editable text field: "1250,5" → "1250,50", no
 * grouping or suffix, so it round-trips through parseAmount.
 */
export function toInputString(centimes: number): string {
  const value = assertInteger(centimes);
  const abs = Math.abs(value);
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  const sign = value < 0 ? '-' : '';
  return cents === 0 ? `${sign}${whole}` : `${sign}${whole}${DECIMAL_SEPARATOR}${String(cents).padStart(2, '0')}`;
}

/**
 * Evaluates a calculator-style expression of amounts joined by + and −
 * (e.g. "12,5+30−2.25") into integer centimes. Each operand is parsed with
 * parseAmount, so arithmetic is done on integers only.
 * A trailing operator is ignored ("12+" → 12,00). Returns null if invalid.
 */
export function evaluateExpression(expr: string): number | null {
  const s = expr.replace(SPACES, '').replace(/−/g, '-');
  if (s === '') return null;

  const tokens = s.match(/[+-]|[^+-]+/g);
  if (!tokens) return null;

  let total = 0;
  let op: '+' | '-' = '+';
  let expectOperand = true;
  for (const token of tokens) {
    if (token === '+' || token === '-') {
      if (expectOperand) {
        // A sign right after another operator (or at the start) applies to the next operand.
        if (token === '-') op = op === '-' ? '+' : '-';
        continue;
      }
      op = token;
      expectOperand = true;
      continue;
    }
    const value = parseAmount(token);
    if (value === null) return null;
    total = op === '+' ? total + value : total - value;
    op = '+';
    expectOperand = false;
  }
  return total;
}

/** Sum integer centime amounts. Throws if a non-integer sneaks in, to catch bugs early. */
export function sumCentimes(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) {
    if (!Number.isInteger(v)) throw new Error(`Non-integer money amount: ${v}`);
    total += v;
  }
  return total;
}
