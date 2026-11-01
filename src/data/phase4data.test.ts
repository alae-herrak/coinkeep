import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { createAccount } from './accounts';
import { createBill, markBillPaid, undoBillPaid, updateBill, type BillInput } from './bills';
import { setCategoryBudget } from './categories';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function setup() {
  const accountId = await createAccount({ name: 'Bank', type: 'bank', startingBalance: 0 });
  const bills = (await db.categories.filter((c) => c.name === 'Bills & Utilities').first())!.id;
  const salary = (await db.categories.filter((c) => c.name === 'Salary').first())!.id;
  const input = (over: Partial<BillInput> = {}): BillInput => ({
    name: 'Rent',
    amount: 300_000,
    categoryId: bills,
    accountId,
    frequency: 'monthly',
    nextDueDate: '2026-01-31',
    active: true,
    ...over,
  });
  return { accountId, bills, salary, input };
}

describe('bills', () => {
  it('validates input', async () => {
    const { salary, input } = await setup();
    await expect(createBill(input({ name: ' ' }))).rejects.toThrow('name');
    await expect(createBill(input({ amount: 0 }))).rejects.toThrow('greater than zero');
    await expect(createBill(input({ categoryId: salary }))).rejects.toThrow('expense category');
    await expect(createBill(input({ nextDueDate: '2026-02-30' }))).rejects.toThrow('due date');
  });

  it('mark as paid records the expense and advances, keeping the 31st anchor', async () => {
    const { input } = await setup();
    const id = await createBill(input());
    expect((await db.recurringBills.get(id))!.anchorDay).toBe(31);

    const paid = await markBillPaid(id, '2026-01-30');
    const tx = await db.transactions.get(paid.transactionId);
    expect(tx).toMatchObject({ type: 'expense', amount: 300_000, date: '2026-01-30', note: 'Rent' });
    expect((await db.recurringBills.get(id))!.nextDueDate).toBe('2026-02-28');

    await markBillPaid(id, '2026-02-27');
    expect((await db.recurringBills.get(id))!.nextDueDate).toBe('2026-03-31');
  });

  it('keeps the anchor when edited without changing the due date', async () => {
    const { input } = await setup();
    const id = await createBill(input());
    await markBillPaid(id, '2026-01-30'); // now due Feb 28, anchor 31
    await updateBill(id, input({ amount: 310_000, nextDueDate: '2026-02-28' }));
    expect((await db.recurringBills.get(id))!.anchorDay).toBe(31);
    await updateBill(id, input({ nextDueDate: '2026-02-15' }));
    expect((await db.recurringBills.get(id))!.anchorDay).toBe(15);
  });

  it('weekly bills have no anchor and advance 7 days', async () => {
    const { input } = await setup();
    const id = await createBill(input({ frequency: 'weekly', nextDueDate: '2026-12-29' }));
    expect((await db.recurringBills.get(id))!.anchorDay).toBeUndefined();
    await markBillPaid(id);
    expect((await db.recurringBills.get(id))!.nextDueDate).toBe('2027-01-05');
  });

  it('undo removes the expense and restores the due date', async () => {
    const { input } = await setup();
    const id = await createBill(input());
    const paid = await markBillPaid(id, '2026-01-30');
    await undoBillPaid(paid);
    expect(await db.transactions.count()).toBe(0);
    expect((await db.recurringBills.get(id))!.nextDueDate).toBe('2026-01-31');
  });
});

describe('setCategoryBudget', () => {
  it('sets and clears budgets on expense categories only', async () => {
    const { bills, salary } = await setup();
    await setCategoryBudget(bills, 50_000);
    expect((await db.categories.get(bills))!.monthlyBudget).toBe(50_000);
    await setCategoryBudget(bills, null);
    expect((await db.categories.get(bills))!.monthlyBudget).toBeNull();
    await expect(setCategoryBudget(bills, 0)).rejects.toThrow();
    await expect(setCategoryBudget(salary, 100)).rejects.toThrow('expense');
  });
});
