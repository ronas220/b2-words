/**
 * Word selection for the SRS plan («Выбор» tab).
 * Runtime shape: `Set<string> | null` — null means "all words selected"
 * (the default). A missing/invalid storage record also means "all".
 */

export const SELECTION_KEY = 'b2words.selection.v1';

export type SelectionSet = Set<string> | null;

/** Stored as the most compact of: all / include-list / exclude-list. */
export type StoredSelection =
  | { m: 'all' }
  | { m: 'inc'; w: string[] }
  | { m: 'exc'; w: string[] };

export function isSelected(sel: SelectionSet, word: string): boolean {
  return sel === null || sel.has(word);
}

export function selectedCount(sel: SelectionSet, total: number): number {
  return sel === null ? total : sel.size;
}

/** Keep only the selected items; null selection passes everything through. */
export function filterSelected<T>(items: T[], keyOf: (item: T) => string, sel: SelectionSet): T[] {
  if (sel === null) return items;
  return items.filter((it) => sel.has(keyOf(it)));
}

/**
 * Add/remove words from the selection. Pure.
 * Selecting everything collapses back to null («all»); deselecting from «all»
 * materializes the complement set.
 */
export function applySelection(
  sel: SelectionSet,
  words: string[],
  on: boolean,
  allWords: string[],
): SelectionSet {
  if (on) {
    if (sel === null) return null;
    const next = new Set(sel);
    for (const w of words) next.add(w);
    return next.size >= allWords.length ? null : next;
  }
  const next = sel === null ? new Set(allWords) : new Set(sel);
  for (const w of words) next.delete(w);
  return next;
}

/** Serialize using whichever representation is smallest for 1335 ids. */
export function serializeSelection(sel: SelectionSet, allWords: string[]): StoredSelection {
  if (sel === null) return { m: 'all' };
  const excluded = allWords.filter((w) => !sel.has(w));
  if (excluded.length < sel.size) return { m: 'exc', w: excluded };
  return { m: 'inc', w: [...sel] };
}

/** Parse + validate a stored value; unknown words are dropped, garbage → null (all). */
export function parseSelection(raw: unknown, valid: Set<string>, allWords: string[]): SelectionSet {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = raw as Partial<StoredSelection>;
  if (v.m === 'all') return null;
  if (v.m === 'inc' && Array.isArray(v.w)) {
    return new Set(v.w.filter((w) => typeof w === 'string' && valid.has(w)));
  }
  if (v.m === 'exc' && Array.isArray(v.w)) {
    const excluded = new Set(v.w.filter((w) => typeof w === 'string' && valid.has(w)));
    return new Set(allWords.filter((w) => !excluded.has(w)));
  }
  return null;
}

export function loadSelection(valid: Set<string>, allWords: string[]): SelectionSet {
  try {
    const raw = localStorage.getItem(SELECTION_KEY);
    if (!raw) return null; // no record → everything selected
    return parseSelection(JSON.parse(raw), valid, allWords);
  } catch {
    return null;
  }
}

export function saveSelection(sel: SelectionSet, allWords: string[]): void {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify(serializeSelection(sel, allWords)));
  } catch {
    // storage unavailable — ignore
  }
}
