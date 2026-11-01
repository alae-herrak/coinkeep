import { describe, expect, it } from 'vitest';
import { applyKey, expressionFromCentimes, formatExpression, hasOperator, type KeypadKey } from './keypad';
import { evaluateExpression } from './money';

const type = (keys: KeypadKey[], start = '') => keys.reduce(applyKey, start);
const chars = (s: string) => s.split('') as KeypadKey[];
const plain = (s: string) => s.replace(/ /g, ' ');

describe('keypad', () => {
  it('builds numbers digit by digit', () => {
    expect(type(chars('1250'))).toBe('1250');
    expect(type(chars('12,5'))).toBe('12,5');
  });

  it('replaces a lone leading zero', () => {
    expect(type(chars('05'))).toBe('5');
    expect(type(chars('000'))).toBe('0');
    expect(type(chars('0,05'))).toBe('0,05');
  });

  it('adds a leading zero before a bare comma and allows one comma per operand', () => {
    expect(type([','])).toBe('0,');
    expect(type(chars('1,,2'))).toBe('1,2');
    expect(type(chars('1,2+,5'))).toBe('1,2+0,5');
  });

  it('limits decimals to two and integer digits to nine', () => {
    expect(type(chars('1,234'))).toBe('1,23');
    expect(type(chars('1234567890'))).toBe('123456789');
  });

  it('handles operators', () => {
    expect(type(['+'])).toBe('');
    expect(type(['-'])).toBe('');
    expect(type(chars('12+-'))).toBe('12-');
    expect(type(chars('12,+'))).toBe('12+');
    expect(type(chars('12+3-4'))).toBe('12+3-4');
  });

  it('backspace and clear', () => {
    expect(type(['1', '2', 'back'])).toBe('1');
    expect(type(['back'])).toBe('');
    expect(type(['1', '+', '2', 'clear'])).toBe('');
  });

  it('produces expressions evaluateExpression understands', () => {
    expect(evaluateExpression(type(chars('12,5+30-2,25')))).toBe(4025);
    expect(evaluateExpression(type(chars('12+')))).toBe(1200);
  });

  it('detects operators (ignoring a trailing one)', () => {
    expect(hasOperator('12')).toBe(false);
    expect(hasOperator('12+')).toBe(false);
    expect(hasOperator('12+3')).toBe(true);
  });

  it('formats expressions for display', () => {
    expect(formatExpression('')).toBe('0');
    expect(plain(formatExpression('1250,5+30-2'))).toBe('1 250,5 + 30 − 2');
    expect(plain(formatExpression('1250000'))).toBe('1 250 000');
    expect(formatExpression('12+')).toBe('12 +');
  });

  it('builds an expression from an existing amount', () => {
    expect(expressionFromCentimes(125000)).toBe('1250');
    expect(expressionFromCentimes(125050)).toBe('1250,5');
    expect(expressionFromCentimes(125005)).toBe('1250,05');
    expect(expressionFromCentimes(0)).toBe('');
    for (const v of [1, 99, 100, 125050, 999999999]) {
      expect(evaluateExpression(expressionFromCentimes(v))).toBe(v);
    }
  });
});
