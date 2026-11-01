import { db } from '../db/db';
import type { Category, CategoryKind } from '../db/types';
import { moveItem, nextSortOrder } from '../domain/reorder';
import { UserFacingError } from './errors';

export type CategoryInput = Pick<Category, 'name' | 'icon' | 'color' | 'kind'>;

function clean(input: CategoryInput): CategoryInput {
  const name = input.name.trim();
  if (!name) throw new UserFacingError('Give the category a name.');
  return { ...input, name };
}

async function assertUniqueName(name: string, kind: CategoryKind, exceptId?: number) {
  const lower = name.toLowerCase();
  const clash = (await db.categories.where('kind').equals(kind).toArray()).find(
    (c) => c.id !== exceptId && c.name.toLowerCase() === lower,
  );
  if (clash) throw new UserFacingError(`You already have a category called “${clash.name}”.`);
}

export async function createCategory(input: CategoryInput): Promise<number> {
  const data = clean(input);
  return db.transaction('rw', db.categories, async () => {
    await assertUniqueName(data.name, data.kind);
    const siblings = await db.categories.where('kind').equals(data.kind).toArray();
    return db.categories.add({ ...data, monthlyBudget: null, archived: false, sortOrder: nextSortOrder(siblings) });
  });
}

/** Updates name/icon/color. The kind can't change once transactions may use it. */
export async function updateCategory(id: number, input: Omit<CategoryInput, 'kind'>): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    const existing = await db.categories.get(id);
    if (!existing) throw new UserFacingError('This category no longer exists.');
    const data = clean({ ...input, kind: existing.kind });
    await assertUniqueName(data.name, existing.kind, id);
    await db.categories.update(id, { name: data.name, icon: data.icon, color: data.color });
  });
}

/** Sets (centimes) or clears (null) a category's monthly budget. */
export async function setCategoryBudget(id: number, monthlyBudget: number | null): Promise<void> {
  if (monthlyBudget !== null && (!Number.isSafeInteger(monthlyBudget) || monthlyBudget <= 0)) {
    throw new UserFacingError('Enter a budget greater than zero.');
  }
  const category = await db.categories.get(id);
  if (!category || category.kind !== 'expense') throw new UserFacingError('Budgets are for expense categories.');
  await db.categories.update(id, { monthlyBudget });
}

export async function setCategoryArchived(id: number, archived: boolean): Promise<void> {
  await db.categories.update(id, { archived });
}

export async function categoryUsageCount(id: number): Promise<number> {
  const [txs, bills] = await Promise.all([
    db.transactions.where('categoryId').equals(id).count(),
    db.recurringBills.where('categoryId').equals(id).count(),
  ]);
  return txs + bills;
}

/** Only unused categories can be deleted; used ones should be archived so history keeps its labels. */
export async function deleteCategory(id: number): Promise<void> {
  if ((await categoryUsageCount(id)) > 0) {
    throw new UserFacingError('This category is used by transactions or bills. Archive it instead.');
  }
  await db.categories.delete(id);
}

export async function moveCategory(id: number, direction: 'up' | 'down'): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    const cat = await db.categories.get(id);
    if (!cat) return;
    const siblings = (await db.categories.where('kind').equals(cat.kind).toArray()).filter((c) => !c.archived);
    const changes = moveItem(siblings, id, direction);
    await Promise.all(changes.map((c) => db.categories.update(c.id, { sortOrder: c.sortOrder })));
  });
}
