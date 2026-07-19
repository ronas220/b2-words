import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Flame,
  ListChecks,
  PartyPopper,
  Play,
  RotateCcw,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import { WORDS } from '@/data/words';
import type { WordEntry } from '@/data/words';
import { useAppState } from '@/state/app-state';
import { useSpeech } from '@/hooks/useSpeech';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { celebrate, hapticTick } from '@/lib/celebrate';
import { buildPlanQueue, introducedToday } from '@/lib/srs';
import { filterSelected } from '@/lib/selection';
import { loadBestScore, saveBestScore } from '@/lib/storage';
import type { StudyMode } from '@/lib/storage';
import { SpeakerButton } from '@/components/SpeakerButton';
import type { TabId } from '@/components/BottomNav';
import { cn, pluralRu, shuffleArray } from '@/lib/utils';

const ROUND_SIZE = 10; // free mode
const PLAN_ROUND_MAX = 20; // plan mode: min(queue length, 20)
const SPRINT_ROUND = 20; // sprint mode: questions per round over the whole selection

interface Question {
  word: WordEntry;
  options: string[];
  correct: number;
}

/** Build questions from a fixed pool (pool order is preserved for the SRS plan). */
function buildQuestions(pool: WordEntry[]): Question[] {
  return pool.map((word) => {
    // Prefer distractors with the same part of speech.
    const samePos = WORDS.filter((x) => x.w !== word.w && x.pos === word.pos && x.ru !== word.ru);
    const anyPos = WORDS.filter((x) => x.w !== word.w && x.ru !== word.ru);
    const distractorPool = samePos.length >= 3 ? samePos : anyPos;
    const distractors: string[] = [];
    for (const candidate of shuffleArray(distractorPool)) {
      if (distractors.length >= 3) break;
      if (!distractors.includes(candidate.ru)) distractors.push(candidate.ru);
    }
    const options = shuffleArray([word.ru, ...distractors]);
    return { word, options, correct: options.indexOf(word.ru) };
  });
}

function scoreMessage(score: number, total: number): string {
  if (score === total) return 'Идеально! 🏆';
  if (score >= Math.ceil(total * 0.8)) return 'Отличный результат! 🎉';
  if (score >= Math.ceil(total * 0.5)) return 'Хорошо, продолжайте! 💪';
  return 'Стоит повторить слова 📖';
}

/** Animated score ring (SVG) for the end screen. */
function ScoreRing({ score, total }: { score: number; total: number }) {
  const reducedMotion = useReducedMotion();
  const R = 52;
  const C = 2 * Math.PI * R;
  const [offset, setOffset] = useState(C);

  useEffect(() => {
    const target = C * (1 - score / total);
    if (reducedMotion) {
      setOffset(target);
      return;
    }
    const t = window.setTimeout(() => setOffset(target), 120);
    return () => window.clearTimeout(t);
  }, [score, total, C, reducedMotion]);

  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="10" className="stroke-muted" />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          className="stroke-primary transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none"
          strokeDasharray={C}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-4xl font-extrabold text-primary">{score}</span>
        <span className="text-sm text-muted-foreground">из {total}</span>
      </div>
    </div>
  );
}

export function QuizTab({ onNavigate }: { onNavigate: (tab: TabId) => void }) {
  const {
    settings,
    srs,
    activity,
    streak,
    todayStudied,
    selection,
    selectedCount,
    rateWord,
    logAnswer,
    updateSettings,
  } = useAppState();
  const { quizMode, newPerDay, dailyGoal } = settings;
  const isPlan = quizMode === 'plan';
  const isSprint = quizMode === 'sprint';
  const { speak } = useSpeech();

  const [round, setRound] = useState<Question[] | null>(null);
  const [qi, setQi] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);
  const [best, setBest] = useState<number>(() => loadBestScore());
  /** «Спринт»: words not yet asked + accumulated stats across rounds. */
  const [sprintRest, setSprintRest] = useState<WordEntry[]>([]);
  const [sprintTotal, setSprintTotal] = useState(0);
  const [sprintStat, setSprintStat] = useState<{
    asked: number;
    correct: number;
    errors: WordEntry[];
  }>({ asked: 0, correct: 0, errors: [] });
  const nextRef = useRef<() => void>(() => {});

  /* ---------------- «План» queue (shared SRS queue, same as Карточки) ---------------- */
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!isPlan) return;
    const t = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [isPlan]);

  const plan = useMemo(() => {
    if (!isPlan) return { queue: [] as WordEntry[], dueCount: 0, newCount: 0 };
    const pool = filterSelected(WORDS, (w) => w.w, selection);
    return buildPlanQueue(pool, (w) => w.w, srs, newPerDay, introducedToday(activity), nowTick);
  }, [isPlan, srs, activity, newPerDay, nowTick, selection]);

  const planEmpty = isPlan && plan.queue.length === 0;
  /** «Выбор» tab deselected everything — plan/sprint modes explain where to go. */
  const selectionEmpty = (isPlan || isSprint) && selection !== null && selection.size === 0;

  const question: Question | undefined = round?.[qi];

  const pickMode = (mode: StudyMode) => {
    if (mode === quizMode) return;
    hapticTick();
    setRound(null);
    setDone(false);
    updateSettings({ quizMode: mode });
  };

  const startRound = () => {
    if (isSprint) {
      startSprint();
      return;
    }
    const pool = isPlan ? plan.queue.slice(0, PLAN_ROUND_MAX) : shuffleArray(WORDS).slice(0, ROUND_SIZE);
    if (pool.length === 0) return;
    const r = buildQuestions(pool);
    setRound(r);
    setQi(0);
    setSelected(null);
    setScore(0);
    setAnswers([]);
    setDone(false);
    if (settings.autoplay) speak(r[0].word.w);
  };

  /** «Спринт»: fresh pass over ALL selected words, rounds of SPRINT_ROUND. */
  const startSprint = () => {
    const pool = shuffleArray(filterSelected(WORDS, (w) => w.w, selection));
    if (pool.length === 0) return;
    const r = buildQuestions(pool.slice(0, SPRINT_ROUND));
    setSprintRest(pool.slice(SPRINT_ROUND));
    setSprintTotal(pool.length);
    setSprintStat({ asked: 0, correct: 0, errors: [] });
    setRound(r);
    setQi(0);
    setSelected(null);
    setScore(0);
    setAnswers([]);
    setDone(false);
    if (settings.autoplay) speak(r[0].word.w);
  };

  /** Next sprint round from the remaining words. */
  const continueSprint = () => {
    hapticTick();
    const r = buildQuestions(sprintRest.slice(0, SPRINT_ROUND));
    setSprintRest(sprintRest.slice(SPRINT_ROUND));
    setRound(r);
    setQi(0);
    setSelected(null);
    setScore(0);
    setAnswers([]);
    setDone(false);
    if (settings.autoplay) speak(r[0].word.w);
  };

  const next = useCallback(() => {
    if (!round) return;
    if (qi + 1 >= round.length) {
      setDone(true);
      return;
    }
    const nextIndex = qi + 1;
    setQi(nextIndex);
    setSelected(null);
    if (settings.autoplay) speak(round[nextIndex].word.w);
  }, [round, qi, settings.autoplay, speak]);

  // Auto-advance ~700ms after a correct answer (manual «Дальше» only for wrong ones).
  useEffect(() => {
    if (selected === null || !question || selected !== question.correct) return;
    const t = window.setTimeout(() => nextRef.current(), 700);
    return () => window.clearTimeout(t);
  }, [selected, question]);
  nextRef.current = next;

  // End-of-round: persist best score (free mode only) + celebrate a great result.
  useEffect(() => {
    if (!done || !round) return;
    if (!isPlan && score > best) {
      setBest(score);
      saveBestScore(score);
    }
    if (score >= Math.ceil(round.length * 0.8)) celebrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const choose = (i: number) => {
    if (!question || selected !== null) return;
    hapticTick();
    setSelected(i);
    const ok = i === question.correct;
    setAnswers((a) => [...a, ok]);
    if (ok) setScore((s) => s + 1);
    // «План»/«Спринт» rate the Leitner box (correct = Знаю, wrong = box 1) and
    // log activity; «Свободно» only counts the answer toward the daily goal.
    if (isPlan || isSprint) {
      rateWord(question.word.w, ok);
    } else {
      logAnswer();
    }
    if (isSprint) {
      setSprintStat((s) => ({
        asked: s.asked + 1,
        correct: s.correct + (ok ? 1 : 0),
        errors: ok ? s.errors : [...s.errors, question.word],
      }));
    }
  };

  /* ---------------- header: mode switch + plan counters ---------------- */
  const header = (
    <div className="flex items-center justify-between gap-2">
      <div
        className="flex shrink-0 rounded-full border bg-card p-0.5"
        role="group"
        aria-label="Режим теста"
      >
        {(
          [
            ['plan', 'План'],
            ['sprint', 'Спринт'],
            ['free', 'Свободно'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            aria-pressed={quizMode === m}
            onClick={() => pickMode(m)}
            className={cn(
              'h-10 rounded-full px-3 text-sm font-semibold transition-all active:scale-95',
              quizMode === m
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {isPlan && (
        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
          Повторить: {plan.dueCount} · Новых: {plan.newCount}
        </span>
      )}
    </div>
  );

  /* ---------------- question screen ---------------- */
  if (round && !done) {
    // «Спринт» numbers questions across all rounds: 1..sprintTotal.
    const qGlobal = isSprint ? sprintTotal - sprintRest.length - round.length + qi + 1 : qi + 1;
    const qTotal = isSprint ? sprintTotal : round.length;
    return (
      <div className="flex flex-col gap-4 py-4">
        {header}
        {/* progress dots */}
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1.5" aria-label={`Вопрос ${qGlobal} из ${qTotal}`}>
            {round.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-2 w-2 rounded-full transition-colors duration-300',
                  i < answers.length
                    ? answers[i]
                      ? 'bg-emerald-500'
                      : 'bg-red-400'
                    : i === qi
                      ? 'bg-primary ring-2 ring-primary/30'
                      : 'bg-muted',
                )}
              />
            ))}
          </div>
          <span className="text-sm font-medium text-muted-foreground">
            {qGlobal} / {qTotal}
          </span>
        </div>

        <div className="card-shadow relative flex flex-col items-center gap-2 rounded-3xl border bg-gradient-to-br from-card via-card to-indigo-100/60 p-6 dark:to-indigo-950/40">
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
            {question!.word.pos}
          </span>
          <div className="flex items-center gap-2">
            <p className="font-display text-3xl font-extrabold tracking-tight">{question!.word.w}</p>
            <SpeakerButton text={question!.word.w} size={22} />
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          {question!.options.map((opt, i) => {
            const isCorrect = i === question!.correct;
            const isSelected = i === selected;
            const answered = selected !== null;
            return (
              <button
                key={i}
                type="button"
                disabled={answered}
                onClick={() => choose(i)}
                className={cn(
                  'flex min-h-[56px] w-full items-center justify-between gap-2 rounded-2xl border-2 bg-card px-4 py-3 text-left text-base font-medium shadow-sm transition-all',
                  !answered && 'hover:border-primary/50 active:scale-[0.98] active:bg-muted',
                  answered && isCorrect && 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300',
                  answered && isSelected && !isCorrect && 'border-red-400 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
                  answered && !isSelected && !isCorrect && 'opacity-50',
                )}
              >
                <span>{opt}</span>
                {answered && isCorrect && <Check size={20} className="shrink-0 text-emerald-600" />}
                {answered && isSelected && !isCorrect && (
                  <X size={20} className="shrink-0 text-red-500" />
                )}
              </button>
            );
          })}
        </div>

        {selected !== null && selected !== question!.correct && (
          <div className="pop-in flex flex-col gap-3">
            <p className="text-center text-sm text-muted-foreground">
              Правильный ответ:{' '}
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {question!.options[question!.correct]}
              </span>
            </p>
            <button
              type="button"
              onClick={next}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
            >
              Дальше
              <ArrowRight size={20} />
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ---------------- start / done / plan-completed screens ---------------- */
  return (
    <div className="flex flex-col gap-4 py-4">
      {header}

      {done && round && isSprint ? (
        sprintRest.length > 0 ? (
          /* «Спринт» between rounds — words remain */
          <div className="card-shadow flex min-h-[380px] flex-col items-center justify-center gap-4 rounded-3xl border bg-card p-8 text-center">
            <ScoreRing score={score} total={round.length} />
            <p className="font-display text-lg font-bold">
              Раунд завершён: {score} из {round.length}
            </p>
            <p className="text-sm text-muted-foreground">
              Пройдено {sprintStat.asked} из {sprintTotal} · ошибок: {sprintStat.errors.length}
            </p>
            <button
              type="button"
              onClick={continueSprint}
              className="mt-2 flex h-14 items-center gap-2 rounded-2xl bg-primary px-8 text-base font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
            >
              Дальше
              <ArrowRight size={20} />
            </button>
          </div>
        ) : (
          /* «Спринт» finished — overall result + error list */
          <div className="card-shadow flex min-h-[380px] flex-col items-center justify-center gap-4 rounded-3xl border bg-card p-8 text-center">
            <ScoreRing score={sprintStat.correct} total={sprintStat.asked} />
            <p className="font-display text-lg font-bold">
              Спринт завершён: {sprintStat.correct} из {sprintStat.asked} верно
            </p>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Flame
                size={15}
                className={streak > 0 ? 'text-orange-500' : 'text-muted-foreground/40'}
              />
              Серия: {streak} дн. · Сегодня {todayStudied}/{dailyGoal}
            </p>
            {sprintStat.errors.length > 0 ? (
              <div className="max-h-44 w-full overflow-y-auto rounded-2xl border bg-muted/40 text-left">
                <p className="border-b px-3 py-2 text-xs font-semibold text-muted-foreground">
                  Ошибки — ушли в 1 коробку ({sprintStat.errors.length}):
                </p>
                <ul className="divide-y">
                  {sprintStat.errors.map((w) => (
                    <li
                      key={w.w}
                      className="flex items-baseline justify-between gap-3 px-3 py-1.5"
                    >
                      <span className="font-display shrink-0 text-sm font-bold">{w.w}</span>
                      <span className="truncate text-xs text-muted-foreground">{w.ru}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                Без ошибок — отлично! 🎉
              </p>
            )}
            <button
              type="button"
              onClick={startSprint}
              className="mt-1 flex h-14 items-center gap-2 rounded-2xl bg-primary px-8 text-base font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
            >
              <RotateCcw size={20} />
              Пройти ещё раз
            </button>
            <button
              type="button"
              onClick={() => pickMode('plan')}
              className="flex h-11 items-center rounded-full px-4 text-sm font-semibold text-muted-foreground transition-all hover:bg-muted active:scale-95"
            >
              Вернуться к плану
            </button>
          </div>
        )
      ) : done && round ? (
        <div className="card-shadow flex min-h-[380px] flex-col items-center justify-center gap-4 rounded-3xl border bg-card p-8 text-center">
          <ScoreRing score={score} total={round.length} />
          <p className="font-display text-lg font-bold">{scoreMessage(score, round.length)}</p>
          {isPlan ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Flame
                size={15}
                className={streak > 0 ? 'text-orange-500' : 'text-muted-foreground/40'}
              />
              Серия: {streak} дн. · Сегодня {todayStudied}/{dailyGoal}
            </p>
          ) : (
            best > 0 && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Trophy size={15} className="text-amber-500" />
                Рекорд: {best} из {ROUND_SIZE}
                {score >= best && score > 0 && ' · новый рекорд!'}
              </p>
            )
          )}
          {isPlan && planEmpty ? (
            <button
              type="button"
              onClick={() => pickMode('free')}
              className="mt-2 flex h-14 items-center gap-2 rounded-2xl bg-primary px-8 text-base font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
            >
              Перейти в свободный режим
            </button>
          ) : (
            <button
              type="button"
              onClick={startRound}
              className="mt-2 flex h-14 items-center gap-2 rounded-2xl bg-primary px-8 text-base font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
            >
              <RotateCcw size={20} />
              Ещё раз
            </button>
          )}
        </div>
      ) : selectionEmpty ? (
        /* «Выбор» has no words — point there */
        <div className="card-shadow flex min-h-[380px] flex-col items-center justify-center gap-3 rounded-3xl border bg-card p-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
            <ListChecks size={30} />
          </span>
          <p className="font-display text-lg font-bold">Нет выбранных слов</p>
          <p className="text-sm text-muted-foreground">
            Перейдите во вкладку «Выбор» и отметьте слова для плана или спринта.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('select')}
            className="mt-1 flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-all active:scale-95"
          >
            Открыть выбор
          </button>
        </div>
      ) : planEmpty ? (
        /* «План» queue finished — celebration state (same style as Карточки) */
        <div className="card-shadow flex min-h-[380px] flex-col items-center justify-center gap-3 rounded-3xl border bg-card p-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
            <PartyPopper size={30} />
          </span>
          <p className="font-display text-lg font-bold">План на сегодня выполнен!</p>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Flame
              size={15}
              className={streak > 0 ? 'text-orange-500' : 'text-muted-foreground/40'}
            />
            Серия: {streak} дн. · Сегодня {todayStudied}/{dailyGoal}
          </p>
          <button
            type="button"
            onClick={() => pickMode('free')}
            className="mt-1 flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-all active:scale-95"
          >
            Перейти в свободный режим
          </button>
        </div>
      ) : (
        <div className="card-shadow flex min-h-[380px] flex-col items-center justify-center gap-4 rounded-3xl border bg-card p-8 text-center">
          {isSprint ? (
            <>
              <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg">
                <Zap size={36} />
              </span>
              <h2 className="font-display text-2xl font-bold">Спринт по выбранным словам</h2>
              <p className="max-w-[32ch] text-sm text-muted-foreground">
                {selectedCount} {pluralRu(selectedCount, 'слово', 'слова', 'слов')} · раунды по{' '}
                {SPRINT_ROUND} вопросов. Ответы двигают SRS-коробки и идут в дневную цель.
              </p>
              {selection === null && (
                <p className="max-w-[38ch] rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                  Сейчас выбраны все {WORDS.length} слов — можно сузить во вкладке «Выбор».
                </p>
              )}
              <button
                type="button"
                onClick={startRound}
                className="mt-2 flex h-14 items-center gap-2 rounded-2xl bg-primary px-8 text-base font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
              >
                <Play size={20} />
                Начать спринт
              </button>
            </>
          ) : (
            <>
              <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 text-4xl text-white shadow-lg">
                🧠
              </span>
              <h2 className="font-display text-2xl font-bold">Проверь себя</h2>
              {isPlan ? (
                <p className="max-w-[30ch] text-sm text-muted-foreground">
                  План на сегодня: {plan.dueCount + plan.newCount}{' '}
                  {plan.dueCount + plan.newCount === 1 ? 'слово' : 'слов'} в очереди · до{' '}
                  {PLAN_ROUND_MAX} вопросов за раунд.
                </p>
              ) : (
                <p className="max-w-[26ch] text-sm text-muted-foreground">
                  {ROUND_SIZE} вопросов. Выберите правильный перевод английского слова.
                </p>
              )}
              {!isPlan && best > 0 && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Trophy size={15} className="text-amber-500" />
                  Рекорд: {best} из {ROUND_SIZE}
                </p>
              )}
              <button
                type="button"
                onClick={startRound}
                className="mt-2 flex h-14 items-center gap-2 rounded-2xl bg-primary px-8 text-base font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
              >
                <Play size={20} />
                Начать тест
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
