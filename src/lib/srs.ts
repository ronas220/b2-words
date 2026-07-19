import { KNOWN_KEY, loadKnown, saveKnown } from '@/lib/storage';

export const SRS_KEY = 'b2words.srs.v1';
export const ACTIVITY_KEY = 'b2words.activity.v1';

/** Leitner box 1..5; box 5 = graduated. */
export interface SrsRecord {
  box: 1 | 2 | 3 | 4 | 5;
  /** Epoch ms when the word becomes due for review. */
  due: number;
  lapses: number;
}

export type SrsState = Record<string, SrsRecord>;

export const MINUTE = 60 * 1000;
export const DAY = 24 * 60 * MINUTE;

/** Review interval per box: 10 min → 1d → 3d → 7d → 21d (graduated). */
export const BOX_INTERVALS: Record<number, number> = {
  1: 10 * MINUTE,
  2: 1 * DAY,
  3: 3 * DAY,
  4: 7 * DAY,
  5: 21 * DAY,
};

/** A word counts as «выучено» from box 3 up. */
export const KNOWN_BOX = 3;

/**
 * Rate a word. Words with no record are NEW and behave as box 1.
 * knew=true  → box = min(5, box+1), due = now + interval[new box]
 * knew=false → box = 1, due = now + 10 min, lapses + 1
 * Pure: returns a new state object.
 */
export function rate(state: SrsState, word: string, knew: boolean, now = Date.now()): SrsState {
  const prev = state[word];
  const next: SrsState = { ...state };
  if (knew) {
    const box = Math.min(5, (prev?.box ?? 1) + 1) as SrsRecord['box'];
    next[word] = { box, due: now + BOX_INTERVALS[box], lapses: prev?.lapses ?? 0 };
  } else {
    next[word] = { box: 1, due: now + BOX_INTERVALS[1], lapses: (prev?.lapses ?? 0) + 1 };
  }
  return next;
}

export function isNew(state: SrsState, word: string): boolean {
  return state[word] === undefined;
}

export function isDue(state: SrsState, word: string, now = Date.now()): boolean {
  const rec = state[word];
  return rec !== undefined && rec.due <= now;
}

/** Derived «выучено» map (box >= KNOWN_BOX) — the legacy known.v1 shape. */
export function knownFromSrs(state: SrsState): Record<string, true> {
  const known: Record<string, true> = {};
  for (const [word, rec] of Object.entries(state)) {
    if (rec.box >= KNOWN_BOX) known[word] = true;
  }
  return known;
}

/** First-run migration: every legacy «known» word graduates to box 5. */
export function migrateKnownToSrs(known: Record<string, true>, now = Date.now()): SrsState {
  const state: SrsState = {};
  for (const word of Object.keys(known)) {
    state[word] = { box: 5, due: now + BOX_INTERVALS[5], lapses: 0 };
  }
  return state;
}

function isSrsState(v: unknown): v is SrsState {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  return Object.values(v).every(
    (r) =>
      r !== null &&
      typeof r === 'object' &&
      typeof (r as SrsRecord).box === 'number' &&
      (r as SrsRecord).box >= 1 &&
      (r as SrsRecord).box <= 5 &&
      typeof (r as SrsRecord).due === 'number' &&
      typeof (r as SrsRecord).lapses === 'number',
  );
}

/** Load SRS state; on first run migrate legacy known.v1 (word→true) to box 5. */
export function loadSrs(now = Date.now()): SrsState {
  try {
    const raw = localStorage.getItem(SRS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isSrsState(parsed)) return parsed;
    } else {
      // No SRS data yet — seed it from the legacy known map (first run).
      const known = loadKnown();
      if (Object.keys(known).length > 0) {
        const migrated = migrateKnownToSrs(known, now);
        saveSrs(migrated);
        return migrated;
      }
    }
    return {};
  } catch {
    return {};
  }
}

export function saveSrs(state: SrsState): void {
  try {
    localStorage.setItem(SRS_KEY, JSON.stringify(state));
    // Keep the legacy known map in sync (box >= 3 ⟺ выучено).
    saveKnown(knownFromSrs(state));
  } catch {
    // storage unavailable — ignore
  }
}

export function clearSrs(): void {
  try {
    localStorage.removeItem(SRS_KEY);
    localStorage.removeItem(KNOWN_KEY);
  } catch {
    // ignore
  }
}

/* ---------------- daily activity + streak ---------------- */

export interface DayActivity {
  studied: number;
  /** NEW words rated for the first time this day (counts toward the daily new budget). */
  newIntroduced: number;
}

export type ActivityMap = Record<string, DayActivity>;

/** Local calendar day key YYYY-MM-DD. */
export function localDayKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const PRUNE_DAYS = 120;

/** +1 studied today (+1 newIntroduced when the word had no SRS record). Pure; prunes >120d. */
export function recordAnswer(
  activity: ActivityMap,
  wasNew: boolean,
  today = new Date(),
): ActivityMap {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - PRUNE_DAYS);
  const cutoffKey = localDayKey(cutoff);
  const next: ActivityMap = {};
  for (const [key, val] of Object.entries(activity)) {
    if (key >= cutoffKey) next[key] = val;
  }
  const key = localDayKey(today);
  const prev = next[key] ?? { studied: 0, newIntroduced: 0 };
  next[key] = {
    studied: prev.studied + 1,
    newIntroduced: prev.newIntroduced + (wasNew ? 1 : 0),
  };
  return next;
}

/**
 * Consecutive days with studied >= goal, ending today — or yesterday when
 * today has not reached the goal yet (the streak is not lost mid-day).
 */
export function computeStreak(activity: ActivityMap, goal: number, today = new Date()): number {
  const cursor = new Date(today);
  if ((activity[localDayKey(cursor)]?.studied ?? 0) < goal) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  while ((activity[localDayKey(cursor)]?.studied ?? 0) >= goal) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function loadActivity(): ActivityMap {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: ActivityMap = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (
        val !== null &&
        typeof val === 'object' &&
        typeof (val as DayActivity).studied === 'number'
      ) {
        out[key] = {
          studied: (val as DayActivity).studied,
          newIntroduced:
            typeof (val as DayActivity).newIntroduced === 'number'
              ? (val as DayActivity).newIntroduced
              : 0,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveActivity(activity: ActivityMap): void {
  try {
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activity));
  } catch {
    // ignore
  }
}

export function clearActivity(): void {
  try {
    localStorage.removeItem(ACTIVITY_KEY);
  } catch {
    // ignore
  }
}

/* ---------------- «На сегодня» plan queue (shared by Карточки and Тест) ---------------- */

export interface PlanQueue<T> {
  /** Due reviews (oldest due first) followed by new words within the budget. */
  queue: T[];
  dueCount: number;
  newCount: number;
}

/** How many NEW words were already introduced today (shared daily budget). */
export function introducedToday(activity: ActivityMap, today = new Date()): number {
  return activity[localDayKey(today)]?.newIntroduced ?? 0;
}

/**
 * Build today's SRS plan queue over `items`:
 *  1. words with a record whose due <= now, oldest due first;
 *  2. words with no record (NEW), capped by the remaining daily budget
 *     max(0, newPerDay - introduced).
 * Pure — the same builder feeds the flashcard deck and the quiz round, so both
 * surfaces share one queue definition and one daily new-word budget.
 */
export function buildPlanQueue<T>(
  items: T[],
  keyOf: (item: T) => string,
  srs: SrsState,
  newPerDay: number,
  introduced: number,
  now = Date.now(),
): PlanQueue<T> {
  const due = items.filter((it) => {
    const rec = srs[keyOf(it)];
    return rec !== undefined && rec.due <= now;
  });
  due.sort((a, b) => srs[keyOf(a)].due - srs[keyOf(b)].due);
  const budget = Math.max(0, newPerDay - introduced);
  const fresh =
    budget > 0 ? items.filter((it) => srs[keyOf(it)] === undefined).slice(0, budget) : [];
  return { queue: [...due, ...fresh], dueCount: due.length, newCount: fresh.length };
}
