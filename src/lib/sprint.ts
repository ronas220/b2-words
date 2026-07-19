/**
 * «Спринт» session state — an intensive pass over ALL selected words with no
 * daily limits. Pure and framework-free so it can be unit-tested.
 *
 * Cards: «Знаю» removes the card, «Не знаю» returns it ~3 cards later;
 * the session ends when every card was answered «Знаю».
 */

export interface SprintSession<T> {
  /** Cards not yet cleared; the front element is the current card. */
  remaining: T[];
  /** How many cards were cleared with «Знаю». */
  done: number;
  /** Total cards in the session. */
  total: number;
}

/** How many cards later a «Не знаю» card comes back. */
export const SPRINT_REINSERT_GAP = 3;

/** Create a session; pass a shuffler (e.g. shuffleArray) to randomize the order. */
export function createSprint<T>(
  items: readonly T[],
  shuffler: (arr: T[]) => T[] = (arr) => arr,
): SprintSession<T> {
  const remaining = shuffler([...items]);
  return { remaining, done: 0, total: remaining.length };
}

/**
 * Answer the front card. «Знаю» drops it; «Не знаю» reinserts it
 * SPRINT_REINSERT_GAP positions later (or at the end when fewer cards remain).
 * Returns a NEW session object — the argument is never mutated.
 */
export function answerSprint<T>(s: SprintSession<T>, knew: boolean): SprintSession<T> {
  const [head, ...rest] = s.remaining;
  if (head === undefined) return s;
  if (knew) {
    return { remaining: rest, done: s.done + 1, total: s.total };
  }
  const idx = Math.min(SPRINT_REINSERT_GAP, rest.length);
  const remaining = [...rest.slice(0, idx), head, ...rest.slice(idx)];
  return { remaining, done: s.done, total: s.total };
}

/** Cards left to clear. */
export function sprintLeft<T>(s: SprintSession<T>): number {
  return s.remaining.length;
}

/** True when a non-empty session cleared every card. */
export function sprintComplete<T>(s: SprintSession<T>): boolean {
  return s.total > 0 && s.remaining.length === 0;
}
