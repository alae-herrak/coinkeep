export interface Sortable {
  id: number;
  sortOrder: number;
}

/**
 * Moves one item up or down within a list and returns the new sortOrder for
 * every item whose position changed. Orders are renumbered 0..n-1, which also
 * repairs gaps or duplicates left by earlier edits.
 */
export function moveItem<T extends Sortable>(items: readonly T[], id: number, direction: 'up' | 'down'): { id: number; sortOrder: number }[] {
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const index = sorted.findIndex((i) => i.id === id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= sorted.length) return [];

  const moved = sorted.splice(index, 1)[0]!;
  sorted.splice(target, 0, moved);

  return sorted.flatMap((item, i) => (item.sortOrder === i ? [] : [{ id: item.id, sortOrder: i }]));
}

/** sortOrder to use for an item appended to the end of a list. */
export function nextSortOrder(items: readonly Sortable[]): number {
  return items.reduce((max, i) => Math.max(max, i.sortOrder + 1), 0);
}
