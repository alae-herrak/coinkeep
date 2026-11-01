import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { CoinkeepDB } from './db';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from './seed';

let counter = 0;
const opened: CoinkeepDB[] = [];
function freshDb() {
  const d = new CoinkeepDB(`coinkeep-test-${counter++}`);
  opened.push(d);
  return d;
}

afterEach(async () => {
  for (const d of opened.splice(0)) {
    d.close();
    await Dexie.delete(d.name);
  }
});

describe('database schema and seed', () => {
  it('seeds default categories on first open', async () => {
    const d = freshDb();
    const expense = await d.categories.where('kind').equals('expense').sortBy('sortOrder');
    const income = await d.categories.where('kind').equals('income').sortBy('sortOrder');
    expect(expense.map((c) => c.name)).toEqual(DEFAULT_EXPENSE_CATEGORIES.map((c) => c.name));
    expect(income.map((c) => c.name)).toEqual(DEFAULT_INCOME_CATEGORIES.map((c) => c.name));
    expect(expense.every((c) => c.monthlyBudget === null && !c.archived)).toBe(true);
  });

  it('gives every seeded category a distinct color within its kind', () => {
    for (const list of [DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES]) {
      expect(new Set(list.map((c) => c.color)).size).toBe(list.length);
    }
  });

  it('seeds default settings', async () => {
    const d = freshDb();
    expect((await d.settings.get('theme'))?.value).toBe('system');
    expect((await d.settings.get('onboardingDone'))?.value).toBe(false);
  });

  it('does not re-seed when reopened', async () => {
    const d = freshDb();
    await d.open();
    const before = await d.categories.count();
    d.close();
    await d.open();
    expect(await d.categories.count()).toBe(before);
  });

  it('queries transactions by date range', async () => {
    const d = freshDb();
    const accountId = await d.accounts.add({ name: 'Cash', type: 'cash', startingBalance: 0, archived: false, sortOrder: 0 });
    const base = { type: 'expense' as const, accountId, toAccountId: null, categoryId: 1, note: '', createdAt: 0 };
    await d.transactions.bulkAdd([
      { ...base, amount: 100, date: '2026-01-31' },
      { ...base, amount: 200, date: '2026-02-01' },
      { ...base, amount: 300, date: '2026-02-28' },
      { ...base, amount: 400, date: '2026-03-01' },
    ]);
    const feb = await d.transactions.where('date').between('2026-02-01', '2026-02-28', true, true).toArray();
    expect(feb.map((t) => t.amount)).toEqual([200, 300]);
  });
});
