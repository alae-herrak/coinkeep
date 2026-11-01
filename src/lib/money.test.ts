import { describe, expect, it } from 'vitest';
import { evaluateExpression, formatMAD, formatMADCompact, parseAmount, sumCentimes, toInputString } from './money';

// Normalise non-breaking spaces so expectations stay readable.
const plain = (s: string) => s.replace(/ /g, ' ');
const MINUS = '−';

describe('formatMAD', () => {
  it('formats with space thousands separator, comma decimals and DH suffix', () => {
    expect(plain(formatMAD(125000))).toBe('1 250,00 DH');
    expect(plain(formatMAD(0))).toBe('0,00 DH');
    expect(plain(formatMAD(5))).toBe('0,05 DH');
    expect(plain(formatMAD(99))).toBe('0,99 DH');
    expect(plain(formatMAD(100))).toBe('1,00 DH');
    expect(plain(formatMAD(99999))).toBe('999,99 DH');
    expect(plain(formatMAD(100000))).toBe('1 000,00 DH');
    expect(plain(formatMAD(123456789))).toBe('1 234 567,89 DH');
    expect(plain(formatMAD(100000000000))).toBe('1 000 000 000,00 DH');
  });

  it('uses a true minus sign for negatives', () => {
    expect(plain(formatMAD(-125000))).toBe(`${MINUS}1 250,00 DH`);
    expect(plain(formatMAD(-1))).toBe(`${MINUS}0,01 DH`);
  });

  it('never prints a negative zero', () => {
    expect(plain(formatMAD(-0))).toBe('0,00 DH');
  });

  it('supports sign display options', () => {
    expect(plain(formatMAD(2500, { sign: 'always' }))).toBe('+25,00 DH');
    expect(plain(formatMAD(-2500, { sign: 'always' }))).toBe(`${MINUS}25,00 DH`);
    expect(plain(formatMAD(0, { sign: 'always' }))).toBe('0,00 DH');
    expect(plain(formatMAD(-2500, { sign: 'never' }))).toBe('25,00 DH');
  });

  it('can hide decimals (rounded half away from zero) and the suffix', () => {
    expect(plain(formatMAD(125049, { decimals: false }))).toBe('1 250 DH');
    expect(plain(formatMAD(125050, { decimals: false }))).toBe('1 251 DH');
    expect(plain(formatMAD(-125050, { decimals: false }))).toBe(`${MINUS}1 251 DH`);
    expect(plain(formatMAD(-40, { decimals: false }))).toBe('0 DH');
    expect(plain(formatMAD(125000, { suffix: false }))).toBe('1 250,00');
  });

  it('uses non-breaking spaces so amounts never wrap', () => {
    expect(formatMAD(125000)).not.toContain(' ');
  });
});

describe('formatMADCompact', () => {
  it('formats small, thousand and million values', () => {
    expect(plain(formatMADCompact(0))).toBe('0 DH');
    expect(plain(formatMADCompact(85000))).toBe('850 DH');
    expect(plain(formatMADCompact(99960))).toBe('1k DH');
    expect(plain(formatMADCompact(100000))).toBe('1k DH');
    expect(plain(formatMADCompact(120000))).toBe('1,2k DH');
    expect(plain(formatMADCompact(125000))).toBe('1,3k DH');
    expect(plain(formatMADCompact(1200000))).toBe('12k DH');
    expect(plain(formatMADCompact(4550000))).toBe('45,5k DH');
    expect(plain(formatMADCompact(12000000))).toBe('120k DH');
    expect(plain(formatMADCompact(99999900))).toBe('1M DH');
    expect(plain(formatMADCompact(340000000))).toBe('3,4M DH');
  });

  it('handles negatives', () => {
    expect(plain(formatMADCompact(-120000))).toBe(`${MINUS}1,2k DH`);
    expect(plain(formatMADCompact(-20))).toBe('0 DH');
  });
});

describe('parseAmount', () => {
  it('parses integers and decimals with comma or dot', () => {
    expect(parseAmount('1250')).toBe(125000);
    expect(parseAmount('12,5')).toBe(1250);
    expect(parseAmount('12.5')).toBe(1250);
    expect(parseAmount('12,05')).toBe(1205);
    expect(parseAmount('0.99')).toBe(99);
    expect(parseAmount(',5')).toBe(50);
    expect(parseAmount('12,')).toBe(1200);
  });

  it('avoids float errors', () => {
    expect(parseAmount('0.29')).toBe(29);
    expect(parseAmount('1.15')).toBe(115);
    expect(parseAmount('4.35')).toBe(435);
    expect(parseAmount('19999999.99')).toBe(1999999999);
  });

  it('accepts spaces, NBSP and a DH suffix', () => {
    expect(parseAmount(' 1 250,00 ')).toBe(125000);
    expect(parseAmount('1 250,00 DH')).toBe(125000);
    expect(parseAmount(formatMAD(123456789))).toBe(123456789);
  });

  it('handles mixed separators with the last one as decimal', () => {
    expect(parseAmount('1.250,50')).toBe(125050);
    expect(parseAmount('1,250.50')).toBe(125050);
    expect(parseAmount('1.250.000,50')).toBe(125000050);
    expect(parseAmount('12,50.5')).toBeNull();
    expect(parseAmount('1.25,5')).toBeNull();
  });

  it('handles signs', () => {
    expect(parseAmount('-12,5')).toBe(-1250);
    expect(parseAmount(`${MINUS}12,5`)).toBe(-1250);
    expect(parseAmount('+3')).toBe(300);
    expect(parseAmount(formatMAD(-125000))).toBe(-125000);
  });

  it('rejects invalid input', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount(',')).toBeNull();
    expect(parseAmount('.')).toBeNull();
    expect(parseAmount('-')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('12a')).toBeNull();
    expect(parseAmount('1,2,3')).toBeNull();
    expect(parseAmount('1.2.3')).toBeNull();
    expect(parseAmount('12,345')).toBeNull(); // more than 2 decimals
    expect(parseAmount('1e5')).toBeNull();
    expect(parseAmount('--5')).toBeNull();
  });
});

describe('toInputString', () => {
  it('round-trips through parseAmount', () => {
    for (const v of [0, 1, 50, 100, 125050, -1205, 999999999]) {
      expect(parseAmount(toInputString(v))).toBe(v);
    }
    expect(toInputString(125000)).toBe('1250');
    expect(toInputString(125050)).toBe('1250,50');
  });
});

describe('evaluateExpression', () => {
  it('adds and subtracts amounts exactly', () => {
    expect(evaluateExpression('12,5+30')).toBe(4250);
    expect(evaluateExpression(`100${MINUS}12,25`)).toBe(8775);
    expect(evaluateExpression('0.1+0.2')).toBe(30);
    expect(evaluateExpression('10+20+30-5')).toBe(5500);
  });

  it('tolerates leading and trailing operators', () => {
    expect(evaluateExpression('12+')).toBe(1200);
    expect(evaluateExpression('-5+10')).toBe(500);
    expect(evaluateExpression('10+-3')).toBe(700);
    expect(evaluateExpression('10--3')).toBe(1300);
    expect(evaluateExpression('+')).toBe(0);
  });

  it('rejects invalid input', () => {
    expect(evaluateExpression('')).toBeNull();
    expect(evaluateExpression('12,345+1')).toBeNull();
    expect(evaluateExpression('a+1')).toBeNull();
  });
});

describe('sumCentimes', () => {
  it('sums integers and rejects floats', () => {
    expect(sumCentimes([1, 2, 3])).toBe(6);
    expect(sumCentimes([])).toBe(0);
    expect(() => sumCentimes([1, 0.5])).toThrow();
  });
});
