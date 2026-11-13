import { describe, expect, it } from 'vitest';
import type { Account, Transaction } from '../db/types';
import { foldNote, matchNotes, noteShortcuts, transferLabel, transferShortcuts } from './shortcuts';
import { budgetProgress, isAheadOfPace, monthPace, perDayLeft } from './budgets';

let nextId = 1;
function tx(partial: Partial<Transaction>): Transaction {
  const id = nextId++;
  return { id, type: 'expense', amount: 1000, accountId: 1, toAccountId: null, categoryId: 1, date: '2026-11-10', note: '', createdAt: id, ...partial };
}

describe('noteShortcuts', () => {
  it('groups by note and category, ignoring case, accents and spacing, most used first', () => {
    const history = [
      tx({ note: 'breakfast' }),
      tx({ note: 'Breakfast ' }),
      tx({ note: 'Café', categoryId: 2 }),
      tx({ note: 'cafe', categoryId: 2 }),
      tx({ note: 'CAFE', categoryId: 2 }),
      tx({ note: 'breakfast', categoryId: 3 }),
      tx({ note: '' }),
      tx({ note: 'salary', type: 'income', categoryId: 9 }),
    ];
    const s = noteShortcuts(history, 'expense');
    expect(s.map((x) => [x.note, x.categoryId, x.count])).toEqual([
      ['CAFE', 2, 3],
      ['Breakfast', 1, 2],
      ['breakfast', 3, 1],
    ]);
  });

  it('keeps the most recent spelling', () => {
    const s = noteShortcuts([tx({ note: 'mlawi', createdAt: 5 }), tx({ note: 'Mlawi', createdAt: 9 }), tx({ note: 'MLAWI', createdAt: 1 })], 'expense');
    expect(s[0]!.note).toBe('Mlawi');
  });
});

describe('matchNotes', () => {
  const s = noteShortcuts([tx({ note: 'Breakfast' }), tx({ note: 'Akram DSI' }), tx({ note: 'bread' })], 'expense');
  it('matches the start of any word', () => {
    expect(matchNotes(s, 'bre').map((x) => x.note).sort()).toEqual(['Breakfast', 'bread']);
    expect(matchNotes(s, 'dsi').map((x) => x.note)).toEqual(['Akram DSI']);
    expect(matchNotes(s, 'fast')).toEqual([]);
    expect(matchNotes(s, '  ')).toEqual([]);
  });
});

describe('transferShortcuts', () => {
  it('counts account pairs in each direction', () => {
    const s = transferShortcuts([
      tx({ type: 'transfer', accountId: 2, toAccountId: 1, categoryId: null }),
      tx({ type: 'transfer', accountId: 2, toAccountId: 1, categoryId: null }),
      tx({ type: 'transfer', accountId: 1, toAccountId: 2, categoryId: null }),
      tx({}),
    ]);
    expect(s.map((x) => [x.fromId, x.toId, x.count])).toEqual([
      [2, 1, 2],
      [1, 2, 1],
    ]);
  });

  it('labels bank → cash as a withdrawal', () => {
    const acc = (id: number, type: Account['type'], name: string): Account => ({ id, type, name, startingBalance: 0, archived: false, sortOrder: id });
    expect(transferLabel(acc(2, 'bank', 'CIH'), acc(1, 'cash', 'Wallet'))).toBe('Withdraw cash');
    expect(transferLabel(acc(1, 'cash', 'Wallet'), acc(2, 'bank', 'CIH'))).toBe('Wallet → CIH');
  });
});

describe('foldNote', () => {
  it('normalises case, accents and inner spacing', () => {
    expect(foldNote('  Café   Noir ')).toBe('cafe noir');
  });
});

describe('monthPace / perDayLeft', () => {
  it('counts today as a day still to spend', () => {
    expect(monthPace('2026-11-13')).toEqual({ elapsed: 13 / 30, daysLeft: 18 });
    expect(monthPace('2026-11-30')).toEqual({ elapsed: 1, daysLeft: 1 });
  });

  it('splits what is left over the remaining days, never below zero', () => {
    const pace = monthPace('2026-11-13');
    expect(perDayLeft(budgetProgress(23500, 50000), pace)).toBe(Math.floor(26500 / 18));
    expect(perDayLeft(budgetProgress(40100, 30000), pace)).toBe(0);
  });

  it('flags spending ahead of the month', () => {
    const pace = monthPace('2026-11-13'); // 43% of the month gone
    expect(isAheadOfPace(budgetProgress(21500, 35000), pace)).toBe(true); // 61%
    expect(isAheadOfPace(budgetProgress(23500, 50000), pace)).toBe(false); // 47%
  });
});
