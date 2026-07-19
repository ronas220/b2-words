import {
  BOX_INTERVALS,
  DAY,
  MINUTE,
  buildPlanQueue,
  computeStreak,
  introducedToday,
  knownFromSrs,
  migrateKnownToSrs,
  rate,
  recordAnswer,
} from './src/lib/srs';
import type { ActivityMap, SrsState } from './src/lib/srs';
import {
  applySelection,
  filterSelected,
  isSelected,
  parseSelection,
  selectedCount,
  serializeSelection,
} from './src/lib/selection';
import type { SelectionSet } from './src/lib/selection';

const NOW = 1_750_000_000_000; // fixed epoch ms for deterministic checks
let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL ${name} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

// 1. NEW word + «Знаю» behaves as box 1 → box 2, due = now + 1 day.
{
  const s = rate({}, 'apple', true, NOW);
  eq('new+knew → box 2 / due +1d', s['apple'], { box: 2, due: NOW + DAY, lapses: 0 });
}

// 2. box 2 + «Знаю» → box 3, due = now + 3 days, lapses preserved.
{
  const s0: SrsState = { apple: { box: 2, due: NOW, lapses: 4 } };
  const s = rate(s0, 'apple', true, NOW);
  eq('box2+knew → box 3 / due +3d / lapses kept', s['apple'], {
    box: 3,
    due: NOW + 3 * DAY,
    lapses: 4,
  });
}

// 3. box 3 + «Не знаю» → box 1, due = now + 10 min, lapses + 1.
{
  const s0: SrsState = { apple: { box: 3, due: NOW, lapses: 4 } };
  const s = rate(s0, 'apple', false, NOW);
  eq('box3+lapse → box 1 / due +10min / lapses+1', s['apple'], {
    box: 1,
    due: NOW + 10 * MINUTE,
    lapses: 5,
  });
}

// 4. box 5 + «Знаю» stays box 5 (graduated cap), due = now + 21 days.
{
  const s0: SrsState = { apple: { box: 5, due: NOW, lapses: 0 } };
  const s = rate(s0, 'apple', true, NOW);
  eq('box5+knew → box 5 cap / due +21d', s['apple'], { box: 5, due: NOW + 21 * DAY, lapses: 0 });
}

// 5. knownFromSrs: box >= 3 counts as learned, box < 3 / missing does not.
{
  const s: SrsState = {
    a: { box: 2, due: NOW, lapses: 0 },
    b: { box: 3, due: NOW, lapses: 0 },
    c: { box: 5, due: NOW, lapses: 0 },
  };
  eq('knownFromSrs = box>=3', knownFromSrs(s), { b: true, c: true });
}

// 6. Migration: legacy known words graduate to box 5, due = now + 21 days.
{
  const s = migrateKnownToSrs({ apple: true, banana: true }, NOW);
  eq('migrate known → box 5 / due +21d', s, {
    apple: { box: 5, due: NOW + BOX_INTERVALS[5], lapses: 0 },
    banana: { box: 5, due: NOW + BOX_INTERVALS[5], lapses: 0 },
  });
}

// 7. Streak: 4 goal-days (11th–14th) + today below goal → 4; today at goal → 5.
{
  const goal = 20;
  const today = new Date(2025, 5, 15, 12, 0, 0); // local noon
  const act: ActivityMap = {};
  for (const [d, studied] of [
    [11, 25],
    [12, 20],
    [13, 30],
    [14, 20],
    [15, 5],
  ] as const) {
    const key = `2025-06-${String(d).padStart(2, '0')}`;
    act[key] = { studied, newIntroduced: 0 };
  }
  eq('streak (today below goal) ends yesterday', computeStreak(act, goal, today), 4);
  const act2: ActivityMap = { ...act, '2025-06-15': { studied: 20, newIntroduced: 0 } };
  eq('streak (today at goal) includes today', computeStreak(act2, goal, today), 5);
  const act3: ActivityMap = { '2025-06-12': { studied: 50, newIntroduced: 0 } };
  eq('streak broken by gap days', computeStreak(act3, goal, today), 0);
}

// 8. recordAnswer: +1 studied, +1 newIntroduced only for NEW words; prunes >120 days.
{
  const today = new Date(2025, 5, 15, 12, 0, 0);
  const old = '2025-01-01'; // >120 days before 2025-06-15
  const act: ActivityMap = {
    [old]: { studied: 99, newIntroduced: 9 },
    '2025-06-15': { studied: 3, newIntroduced: 1 },
  };
  const s1 = recordAnswer(act, true, today);
  eq('recordAnswer(new) bumps studied+new', s1['2025-06-15'], { studied: 4, newIntroduced: 2 });
  eq('recordAnswer prunes >120d', old in s1, false);
  const s2 = recordAnswer(act, false, today);
  eq('recordAnswer(known) bumps studied only', s2['2025-06-15'], {
    studied: 4,
    newIntroduced: 1,
  });
}

// 9. buildPlanQueue: due first (oldest due first), then NEW within the remaining budget.
{
  const items = ['w1', 'w2', 'w3', 'w4', 'w5'];
  const keyOf = (w: string) => w;
  const srs: SrsState = {
    w1: { box: 2, due: NOW + DAY, lapses: 0 }, // not due yet
    w2: { box: 2, due: NOW - 100, lapses: 0 }, // due
    w4: { box: 3, due: NOW - 500, lapses: 0 }, // due, older
    // w3, w5 — NEW (no record)
  };
  const q = buildPlanQueue(items, keyOf, srs, 10, 0, NOW);
  eq('plan queue: due oldest-first, then new', q.queue, ['w4', 'w2', 'w3', 'w5']);
  eq('plan queue counters', { due: q.dueCount, fresh: q.newCount }, { due: 2, fresh: 2 });
}

// 10. buildPlanQueue: daily new budget caps NEW words; exhausted budget → none.
{
  const items = ['n1', 'n2', 'n3', 'n4'];
  const keyOf = (w: string) => w;
  const capped = buildPlanQueue(items, keyOf, {}, 5, 3, NOW); // budget 2
  eq('plan queue: budget caps new words', capped.queue, ['n1', 'n2']);
  const drained = buildPlanQueue(items, keyOf, {}, 5, 5, NOW); // budget 0
  eq('plan queue: exhausted budget yields no new', drained.queue, []);
  eq('plan queue: exhausted counters', { due: drained.dueCount, fresh: drained.newCount }, {
    due: 0,
    fresh: 0,
  });
}

// 11. introducedToday reads today's newIntroduced counter (local date).
{
  const act: ActivityMap = { '2025-06-15': { studied: 9, newIntroduced: 7 } };
  eq('introducedToday reads counter', introducedToday(act, new Date(2025, 5, 15, 23, 59)), 7);
  eq('introducedToday defaults to 0', introducedToday(act, new Date(2025, 5, 16, 0, 1)), 0);
}

/* ---------------- selection («Выбор» tab) ---------------- */

const ALL = ['a', 'b', 'c', 'd', 'e'];
const VALID = new Set(ALL);

// 12. Default = all selected (null); missing/garbage records also mean all.
{
  eq('selection default is all (null)', parseSelection(undefined, VALID, ALL), null);
  eq('selection garbage → all', parseSelection('{bad', VALID, ALL), null);
  eq('selection stored all → null', parseSelection({ m: 'all' }, VALID, ALL), null);
  eq('selectedCount of null = total', selectedCount(null, ALL.length), 5);
  eq('isSelected with null = true', isSelected(null, 'a'), true);
}

// 13. Deselect from «all» materializes the complement; re-select collapses to null.
{
  const after = applySelection(null, ['b'], false, ALL);
  eq('deselect one from all', after === null ? null : [...after], ['a', 'c', 'd', 'e']);
  const back = applySelection(after, ['b'], true, ALL);
  eq('re-select last missing → all (null)', back, null);
  const cleared = applySelection(null, ALL, false, ALL);
  eq('deselect all → empty set', cleared === null ? null : cleared.size, 0);
  const one = applySelection(cleared, ['c'], true, ALL);
  eq('select one into empty', one === null ? null : [...one], ['c']);
}

// 14. Serialization picks the smallest representation; round-trips preserve the set.
{
  eq('serialize null → all', serializeSelection(null, ALL), { m: 'all' });
  const small: SelectionSet = new Set(['a']);
  eq('serialize tiny set → inc', serializeSelection(small, ALL), { m: 'inc', w: ['a'] });
  const big: SelectionSet = new Set(['a', 'b', 'c', 'd']);
  eq('serialize big set → exc', serializeSelection(big, ALL), { m: 'exc', w: ['e'] });
  const rt1 = parseSelection(serializeSelection(small, ALL), VALID, ALL);
  eq('round-trip inc', rt1 === null ? null : [...rt1], ['a']);
  const rt2 = parseSelection(serializeSelection(big, ALL), VALID, ALL);
  eq('round-trip exc', rt2 === null ? null : [...rt2], ['a', 'b', 'c', 'd']);
  const withUnknown = parseSelection({ m: 'inc', w: ['a', 'zzz', 42] }, VALID, ALL);
  eq('load drops unknown words', withUnknown === null ? null : [...withUnknown], ['a']);
}

// 15. filterSelected + plan queue: deselected due words leave the queue.
{
  const items = ALL;
  eq('filterSelected null passes all', filterSelected(items, (w) => w, null), ALL);
  const sel: SelectionSet = new Set(['a', 'c']);
  eq('filterSelected set filters', filterSelected(items, (w) => w, sel), ['a', 'c']);
  const srs: SrsState = {
    b: { box: 2, due: NOW - 100, lapses: 0 }, // due but NOT selected
    a: { box: 2, due: NOW - 200, lapses: 0 }, // due and selected
  };
  const pool = filterSelected(items, (w) => w, sel);
  const q = buildPlanQueue(pool, (w) => w, srs, 10, 0, NOW);
  eq('plan queue respects selection (due b excluded)', q.queue, ['a', 'c']);
  eq('plan queue counters with selection', { due: q.dueCount, fresh: q.newCount }, {
    due: 1,
    fresh: 1,
  });
}

console.log(`\nSRS-MATH ${fail === 0 ? 'OK' : 'FAILED'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
