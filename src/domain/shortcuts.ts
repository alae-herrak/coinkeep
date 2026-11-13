/**
 * Quick-add shortcuts learned from history.
 *
 * - Note shortcuts: notes you keep typing ("Breakfast"), each with the category
 *   it usually goes with. Picking one fills in the note and category, never the
 *   amount (amounts vary too much to guess).
 * - Transfer shortcuts: account pairs you move money between ("Withdraw cash":
 *   bank → wallet). Picking one switches to a transfer between those accounts.
 */
import type { Account, Transaction } from '../db/types';
import { normalizeText } from './transactions';

export interface NoteShortcut {
  kind: 'note';
  type: 'expense' | 'income';
  /** The note as you last wrote it. */
  note: string;
  categoryId: number;
  count: number;
  /** createdAt of the most recent use, for tie-breaking. */
  lastUsed: number;
}

export interface TransferShortcut {
  kind: 'transfer';
  fromId: number;
  toId: number;
  count: number;
  lastUsed: number;
}

export type Shortcut = NoteShortcut | TransferShortcut;

/** Case-, accent- and spacing-insensitive form of a note, for grouping and matching. */
export function foldNote(note: string): string {
  return normalizeText(note).replace(/\s+/g, ' ');
}

const byUse = (a: Shortcut, b: Shortcut) => b.count - a.count || b.lastUsed - a.lastUsed;

/** All note shortcuts of one type, most used first. */
export function noteShortcuts(history: Transaction[], type: 'expense' | 'income'): NoteShortcut[] {
  const groups = new Map<string, NoteShortcut>();
  for (const t of history) {
    if (t.type !== type || t.categoryId === null) continue;
    const folded = foldNote(t.note);
    if (!folded) continue;
    const key = `${t.categoryId}|${folded}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { kind: 'note', type, note: t.note.trim(), categoryId: t.categoryId, count: 1, lastUsed: t.createdAt });
    } else {
      g.count += 1;
      if (t.createdAt > g.lastUsed) {
        g.lastUsed = t.createdAt;
        g.note = t.note.trim();
      }
    }
  }
  return [...groups.values()].sort(byUse);
}

/** Account pairs used for transfers, most used first. */
export function transferShortcuts(history: Transaction[]): TransferShortcut[] {
  const groups = new Map<string, TransferShortcut>();
  for (const t of history) {
    if (t.type !== 'transfer' || t.toAccountId === null) continue;
    const key = `${t.accountId}>${t.toAccountId}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { kind: 'transfer', fromId: t.accountId, toId: t.toAccountId, count: 1, lastUsed: t.createdAt });
    else {
      g.count += 1;
      g.lastUsed = Math.max(g.lastUsed, t.createdAt);
    }
  }
  return [...groups.values()].sort(byUse);
}

/** Notes whose words start with what's been typed, most used first. */
export function matchNotes(shortcuts: NoteShortcut[], query: string): NoteShortcut[] {
  const q = foldNote(query);
  if (!q) return [];
  return shortcuts.filter((s) => {
    const n = foldNote(s.note);
    return n.startsWith(q) || n.split(' ').some((w) => w.startsWith(q));
  });
}

/** "Withdraw cash" for bank/card → cash, otherwise "From → To". */
export function transferLabel(from: Account, to: Account): string {
  return to.type === 'cash' && from.type !== 'cash' ? 'Withdraw cash' : `${from.name} → ${to.name}`;
}

/** A shortcut becomes a chip once it's been used this many times; typed matches show from the first use. */
export const SHORTCUT_MIN_USES = 2;
