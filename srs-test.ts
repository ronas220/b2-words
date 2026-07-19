import {
  BOX_INTERVALS,
  DAY,
  MINUTE,
  computeStreak,
  knownFromSrs,
  migrateKnownToSrs,
  rate,
  recordAnswer,
} from './src/lib/srs';
import type { ActivityMap, SrsState } from './src/lib/srs';

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

console.log(`\nSRS-MATH ${fail === 0 ? 'OK' : 'FAILED'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
