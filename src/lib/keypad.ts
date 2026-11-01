/**
 * State logic for the calculator-style amount keypad. The expression is kept
 * as a plain string like "12,5+30-2" (ASCII "-", comma decimals) and only
 * turned into centimes by evaluateExpression() in money.ts.
 */
import { DECIMAL_SEPARATOR, groupThousands, MINUS_SIGN } from './money';

export type DigitKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export type KeypadKey = DigitKey | ',' | '+' | '-' | 'back' | 'clear';

/** 9 integer digits = up to 999 999 999 DH per operand; plenty, and far from unsafe integers. */
export const MAX_INT_DIGITS = 9;

const OPERATOR_RE = /[+-]/;

function currentOperand(expr: string): string {
  const idx = Math.max(expr.lastIndexOf('+'), expr.lastIndexOf('-'));
  return expr.slice(idx + 1);
}

export function applyKey(expr: string, key: KeypadKey): string {
  const operand = currentOperand(expr);

  switch (key) {
    case 'clear':
      return '';
    case 'back':
      return expr.slice(0, -1);
    case '+':
    case '-': {
      // Amounts are entered as positive numbers; the transaction type gives the sign.
      if (expr === '') return '';
      let base = expr;
      if (base.endsWith(',')) base = base.slice(0, -1);
      if (OPERATOR_RE.test(base.slice(-1))) base = base.slice(0, -1);
      return base === '' ? '' : base + key;
    }
    case ',':
      if (operand.includes(',')) return expr;
      return expr + (operand === '' ? '0,' : ',');
    default: {
      if (operand.includes(',')) {
        const decimals = operand.split(',')[1] ?? '';
        return decimals.length >= 2 ? expr : expr + key;
      }
      // Replace a lone leading zero instead of producing "05".
      if (operand === '0') return expr.slice(0, -1) + key;
      if (operand.length >= MAX_INT_DIGITS) return expr;
      return expr + key;
    }
  }
}

/** True when the expression contains an operation (so a "= result" line is worth showing). */
export function hasOperator(expr: string): boolean {
  return OPERATOR_RE.test(expr.replace(/[+-]$/, ''));
}

/** Pretty-prints the raw expression: "1250,5+30-2" → "1 250,5 + 30 − 2". */
export function formatExpression(expr: string): string {
  if (expr === '') return '0';
  const tokens = expr.match(/[+-]|[^+-]+/g) ?? [];
  return tokens
    .map((t) => {
      if (t === '+') return ' + ';
      if (t === '-') return ` ${MINUS_SIGN} `;
      const [int = '', frac] = t.split(',');
      return groupThousands(int) + (frac !== undefined ? DECIMAL_SEPARATOR + frac : '');
    })
    .join('')
    .trim();
}

/** Builds the keypad expression for an existing amount (used when editing). */
export function expressionFromCentimes(centimes: number): string {
  const abs = Math.abs(Math.round(centimes));
  if (abs === 0) return '';
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  if (cents === 0) return String(whole);
  return `${whole},${String(cents).padStart(2, '0').replace(/0$/, '')}`;
}
