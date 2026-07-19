import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import {
  BookOpenCheck,
  Check,
  Flame,
  Hand,
  MoveLeft,
  MoveRight,
  PartyPopper,
  Pointer,
  RotateCcw,
  SearchX,
  Shuffle,
  Volume2,
  X,
} from 'lucide-react';
import { WORDS } from '@/data/words';
import type { WordEntry } from '@/data/words';
import { useAppState } from '@/state/app-state';
import { useSpeech } from '@/hooks/useSpeech';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { celebrate, hapticTick } from '@/lib/celebrate';
import { KNOWN_BOX, localDayKey } from '@/lib/srs';
import { SpeakerButton } from '@/components/SpeakerButton';
import { Progress } from '@/components/ui/progress';
import { cn, shuffleArray } from '@/lib/utils';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const SWIPE_THRESHOLD = 100;
const NEW_PER_DAY_OPTIONS = [5, 10, 15, 25];
const DAILY_GOAL_OPTIONS = [10, 20, 30, 50];

interface FlashcardsTabProps {
  active: boolean;
}

export function FlashcardsTab({ active }: FlashcardsTabProps) {
  const {
    known,
    knownCount,
    srs,
    activity,
    todayStudied,
    streak,
    rateWord,
    resetProgress,
    settings,
    updateSettings,
  } = useAppState();
  const { shuffle, letter, onlyUnlearned, autoplay, deckMode, newPerDay, dailyGoal } = settings;
  const isPlan = deckMode === 'plan';
  const { speak } = useSpeech();
  const reducedMotion = useReducedMotion();

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [order, setOrder] = useState<string[] | null>(null);
  /** Cards answered in «План» since entering the mode (session progress). */
  const [planDone, setPlanDone] = useState(0);
  const interactedRef = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const baseDeck = useMemo(
    () => (letter === 'ALL' ? WORDS : WORDS.filter((w) => w.w[0].toUpperCase() === letter)),
    [letter],
  );

  const configKey = isPlan
    ? 'plan'
    : `${letter}|${onlyUnlearned ? 'u' : 'a'}|${shuffle ? 's' : 'n'}`;

  // (Re)build the free-mode shuffle order and restore the persisted deck
  // position whenever the filter config or the deck mode changes.
  useEffect(() => {
    if (settingsRef.current.deckMode === 'plan') {
      setIndex(settingsRef.current.deckPos['plan'] ?? 0);
    } else {
      setOrder(shuffle ? shuffleArray(baseDeck).map((w) => w.w) : null);
      setIndex(settingsRef.current.deckPos[configKey] ?? 0);
    }
    setFlipped(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letter, shuffle, onlyUnlearned, baseDeck, deckMode]);

  /* ---------------- «План» queue: due reviews + today's new-word budget ---------------- */
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!isPlan) return;
    const t = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [isPlan]);

  const plan = useMemo(() => {
    if (!isPlan) return { queue: [] as WordEntry[], dueCount: 0, newCount: 0 };
    const now = nowTick;
    const due = WORDS.filter((w) => {
      const rec = srs[w.w];
      return rec !== undefined && rec.due <= now;
    });
    due.sort((a, b) => srs[a.w].due - srs[b.w].due); // oldest due first
    const introduced = activity[localDayKey()]?.newIntroduced ?? 0;
    const budget = Math.max(0, newPerDay - introduced);
    const fresh = budget > 0 ? WORDS.filter((w) => srs[w.w] === undefined).slice(0, budget) : [];
    return { queue: [...due, ...fresh], dueCount: due.length, newCount: fresh.length };
  }, [isPlan, srs, activity, newPerDay, nowTick]);

  const deck = useMemo(() => {
    if (isPlan) return plan.queue;
    let list = baseDeck;
    if (onlyUnlearned) list = list.filter((w) => !known[w.w]);
    if (order) {
      const pos = new Map(order.map((w, i) => [w, i] as const));
      list = [...list].sort((a, b) => (pos.get(a.w) ?? 0) - (pos.get(b.w) ?? 0));
    }
    return list;
  }, [isPlan, plan.queue, baseDeck, onlyUnlearned, known, order]);

  const clamped = deck.length === 0 ? 0 : Math.min(index, deck.length - 1);
  const current: WordEntry | undefined = deck[clamped];
  const currentIsNew = current !== undefined && srs[current.w] === undefined;

  // Autoplay: speak the word when a new card is shown — but never before
  // the first user gesture (mobile browsers block speech without one).
  const currentWord = current?.w;
  useEffect(() => {
    if (autoplay && interactedRef.current && currentWord) speak(currentWord);
  }, [currentWord, autoplay, speak]);

  const touch = () => {
    interactedRef.current = true;
  };

  const persistPos = useCallback(
    (pos: number) => {
      updateSettings({ deckPos: { ...settingsRef.current.deckPos, [configKey]: pos } });
    },
    [configKey, updateSettings],
  );

  const answer = useCallback(
    (knew: boolean) => {
      if (!current) return;
      touch();
      hapticTick();
      // In free+onlyUnlearned the card leaves the deck only if this answer
      // actually graduates it to «выучено» (box >= KNOWN_BOX).
      const removedFromFree =
        !isPlan &&
        onlyUnlearned &&
        knew &&
        Math.min(5, (srs[current.w]?.box ?? 1) + 1) >= KNOWN_BOX;
      rateWord(current.w, knew);
      setFlipped(false);
      if (isPlan) {
        setPlanDone((d) => d + 1);
        // The answered word always leaves the plan queue (next due >= +10 min),
        // so the card at the same index is the next one to study.
        const nextLen = deck.length - 1;
        const nextIndex = nextLen <= 0 ? 0 : Math.min(clamped, nextLen - 1);
        setIndex(nextIndex);
        persistPos(nextIndex);
        return;
      }
      const nextDeck = removedFromFree ? deck.filter((w) => w.w !== current.w) : deck;
      if (nextDeck.length === 0) {
        setIndex(0);
        persistPos(0);
        celebrate();
        return;
      }
      const nextIndex = removedFromFree ? clamped % nextDeck.length : (clamped + 1) % nextDeck.length;
      setIndex(nextIndex);
      persistPos(nextIndex);
      // finished a full pass through the deck
      if (nextIndex === 0 && deck.length > 1) celebrate();
    },
    [current, deck, clamped, isPlan, onlyUnlearned, srs, rateWord, persistPos],
  );

  // Confetti when the plan queue becomes empty after studying (not on a
  // fresh visit with nothing due yet).
  const prevLenRef = useRef(0);
  useEffect(() => {
    if (isPlan && prevLenRef.current > 0 && deck.length === 0) celebrate();
    prevLenRef.current = deck.length;
  }, [isPlan, deck.length]);

  /* ---------------- swipe gestures ---------------- */
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [fly, setFly] = useState(0); // -1 left / 0 none / +1 right
  const dragRef = useRef({ startX: 0, startY: 0, dx: 0, moved: false, pid: -1 });

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!current || fly !== 0) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, dx: 0, moved: false, pid: e.pointerId };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer already gone — ignore
    }
    setDragging(true);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (d.pid !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 6 || Math.abs(e.clientY - d.startY) > 6) d.moved = true;
    d.dx = dx;
    setDragX(dx);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = dragRef.current;
    if (d.pid !== e.pointerId) return;
    d.pid = -1;
    setDragging(false);
    const dx = cancelled ? 0 : d.dx;
    setDragX(0);
    if (!cancelled && Math.abs(dx) >= SWIPE_THRESHOLD) {
      const dir = dx > 0 ? 1 : -1;
      setFly(dir);
      window.setTimeout(
        () => {
          setFly(0);
          answer(dir > 0);
        },
        reducedMotion ? 0 : 170,
      );
    } else if (!cancelled && !d.moved) {
      // plain tap → flip the card
      touch();
      setFlipped((f) => !f);
    }
  };

  const effectiveX = dragging ? dragX : fly * 560;
  const rotation = effectiveX * 0.055;
  const glowRight = Math.min(1, Math.max(0, effectiveX / 130));
  const glowLeft = Math.min(1, Math.max(0, -effectiveX / 130));

  /* ---------------- keyboard ---------------- */
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        answer(true);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        answer(false);
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        touch();
        setFlipped((f) => !f);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, answer]);

  /* ---------------- filter handlers ---------------- */
  const pickLetter = (l: string) => {
    touch();
    updateSettings({ letter: l });
  };
  const pickMode = (mode: 'plan' | 'free') => {
    touch();
    if (mode === deckMode) return;
    if (mode === 'plan') setPlanDone(0);
    updateSettings({ deckMode: mode });
  };
  const toggleShuffle = () => {
    touch();
    updateSettings({ shuffle: !shuffle });
  };
  const toggleOnlyUnlearned = () => {
    touch();
    updateSettings({ onlyUnlearned: !onlyUnlearned });
    setIndex(0);
    setFlipped(false);
    persistPos(0);
  };
  const toggleAutoplay = () => {
    touch();
    updateSettings({ autoplay: !autoplay });
  };

  const onReset = () => {
    if (
      window.confirm(
        'Сбросить прогресс? Все отметки, повторения, статистика и серия будут удалены.',
      )
    ) {
      resetProgress();
      setIndex(0);
      setFlipped(false);
      setPlanDone(0);
      persistPos(0);
    }
  };

  const allLearned = !isPlan && onlyUnlearned && baseDeck.length > 0 && deck.length === 0;
  const planTotal = planDone + deck.length;

  return (
    <div
      className="flex flex-col gap-2 py-2"
      style={{ height: 'calc(100dvh - 8.5rem - env(safe-area-inset-bottom))' }}
    >
      {/* Stats header — streak + today's goal, compact single row */}
      <section className="card-shadow rounded-2xl border bg-card p-2">
        <div className="flex items-center gap-2.5">
          <span
            className="streak-flame flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-bold"
            title="Дней подряд с выполненной дневной целью"
            aria-label={`Серия: ${streak} дн.`}
          >
            <Flame
              size={15}
              className={streak > 0 ? 'text-orange-500' : 'text-muted-foreground/40'}
            />
            {streak}
          </span>
          <p className="shrink-0 whitespace-nowrap text-xs font-semibold">
            Сегодня {todayStudied}/{dailyGoal}
          </p>
          <Progress
            value={Math.min(100, (todayStudied / dailyGoal) * 100)}
            className="h-2 flex-1"
          />
          <button
            type="button"
            onClick={onReset}
            aria-label="Сбросить прогресс"
            title="Сбросить прогресс"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted active:scale-95 active:bg-muted/70"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </section>

      {/* Controls */}
      <section className="flex flex-col gap-2">
        <div className="chip-rail -mx-4 overflow-x-auto px-4">
          <div className="flex w-max items-center gap-1.5">
            <div
              className="flex shrink-0 rounded-full border bg-card p-0.5"
              role="group"
              aria-label="Режим колоды"
            >
              <button
                type="button"
                aria-pressed={isPlan}
                onClick={() => pickMode('plan')}
                className={cn(
                  'h-10 rounded-full px-3.5 text-sm font-semibold transition-all active:scale-95',
                  isPlan
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                План
              </button>
              <button
                type="button"
                aria-pressed={!isPlan}
                onClick={() => pickMode('free')}
                className={cn(
                  'h-10 rounded-full px-3.5 text-sm font-semibold transition-all active:scale-95',
                  !isPlan
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                Свободно
              </button>
            </div>
            {!isPlan && (
              <>
                <Chip active={letter === 'ALL'} onClick={() => pickLetter('ALL')}>
                  Все
                </Chip>
                {LETTERS.map((l) => (
                  <Chip key={l} active={letter === l} onClick={() => pickLetter(l)}>
                    {l}
                  </Chip>
                ))}
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isPlan ? (
            <>
              <label className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm text-muted-foreground">
                Новых:
                <select
                  value={newPerDay}
                  onChange={(e) => {
                    touch();
                    updateSettings({ newPerDay: Number(e.target.value) });
                  }}
                  aria-label="Новых слов в день"
                  className="cursor-pointer bg-transparent font-semibold text-foreground outline-none"
                >
                  {NEW_PER_DAY_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm text-muted-foreground">
                Цель:
                <select
                  value={dailyGoal}
                  onChange={(e) => {
                    touch();
                    updateSettings({ dailyGoal: Number(e.target.value) });
                  }}
                  aria-label="Дневная цель ответов"
                  className="cursor-pointer bg-transparent font-semibold text-foreground outline-none"
                >
                  {DAILY_GOAL_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <Chip active={autoplay} onClick={toggleAutoplay} icon={<Volume2 size={15} />}>
                Автоозвучка
              </Chip>
            </>
          ) : (
            <>
              <Chip active={shuffle} onClick={toggleShuffle} icon={<Shuffle size={15} />}>
                Перемешать
              </Chip>
              <Chip
                active={onlyUnlearned}
                onClick={toggleOnlyUnlearned}
                icon={<BookOpenCheck size={15} />}
              >
                Только невыученные
              </Chip>
              <Chip active={autoplay} onClick={toggleAutoplay} icon={<Volume2 size={15} />}>
                Автоозвучка
              </Chip>
            </>
          )}
        </div>
      </section>

      {current ? (
        <>
          {/* Deck progress — single compact line */}
          <div className="flex items-center gap-2.5">
            {isPlan ? (
              <>
                <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                  {planDone}/{planTotal}
                </span>
                <Progress
                  value={planTotal === 0 ? 0 : (planDone / planTotal) * 100}
                  className="h-1.5 flex-1"
                />
                <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                  Повторить: {plan.dueCount} · Новых: {plan.newCount}
                </span>
              </>
            ) : (
              <>
                <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                  {clamped + 1} из {deck.length}
                </span>
                <Progress value={((clamped + 1) / deck.length) * 100} className="h-1.5 flex-1" />
                <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                  выучено: {knownCount}
                </span>
              </>
            )}
          </div>

          {/* Swipe + flip card — takes all remaining height */}
          <div
            className={cn(
              'swipe-wrap relative min-h-[220px] flex-1 select-none',
              !dragging && 'snapping',
            )}
            style={{ transform: `translateX(${effectiveX}px) rotate(${rotation}deg)` }}
            role="button"
            tabIndex={0}
            aria-label={flipped ? 'Показать слово' : 'Показать перевод'}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => endDrag(e, false)}
            onPointerCancel={(e) => endDrag(e, true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                touch();
                setFlipped((f) => !f);
              }
            }}
          >
            <div className="flip-scene h-full">
              <div className={cn('flip-inner h-full', flipped && 'flipped')}>
                {/* Front */}
                <div className="flip-face card-shadow relative flex h-full flex-col items-center justify-center gap-2 overflow-hidden rounded-3xl border border-primary/10 bg-gradient-to-br from-card via-card to-indigo-100/70 p-4 dark:to-indigo-950/40">
                  {isPlan && currentIsNew && (
                    <span className="absolute left-3.5 top-3.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                      новое
                    </span>
                  )}
                  <SpeakerButton
                    text={current.w}
                    size={22}
                    label={`Озвучить слово ${current.w}`}
                    className="absolute right-3.5 top-3.5 bg-primary/10"
                  />
                  <span className="rounded-full bg-secondary px-3.5 py-1 text-xs font-semibold text-secondary-foreground">
                    {current.pos}
                  </span>
                  <p className="font-display text-center text-[clamp(1.9rem,9vw,3rem)] font-extrabold leading-tight tracking-tight">
                    {current.w}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground [@media(max-height:740px)]:hidden">
                    Тап — перевернуть · свайп — ответить
                  </p>
                </div>
                {/* Back */}
                <div className="flip-face flip-back card-shadow relative flex h-full flex-col items-center justify-center gap-2 overflow-hidden rounded-3xl border border-violet-300/40 bg-gradient-to-br from-card via-card to-violet-200/60 p-4 dark:border-violet-500/25 dark:to-violet-950/40">
                  <SpeakerButton
                    text={current.ph}
                    size={22}
                    label="Озвучить пример"
                    className="absolute right-3.5 top-3.5 bg-primary/10"
                  />
                  <p className="font-display text-center text-[clamp(1.15rem,5.5vw,1.5rem)] font-bold leading-snug text-primary">
                    {current.ru}
                  </p>
                  <div className="flex w-full flex-col items-center gap-1.5 rounded-2xl bg-muted/70 p-3 dark:bg-muted/40">
                    <p className="text-center text-sm font-medium leading-snug sm:text-base">
                      {current.ph}
                    </p>
                    <p className="text-center text-xs text-muted-foreground sm:text-sm">
                      {current.phr}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* swipe edge glows */}
            <div
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-end rounded-3xl bg-gradient-to-l from-emerald-500/50 via-emerald-500/10 to-transparent"
              style={{ opacity: glowRight }}
            >
              <Check size={48} strokeWidth={3} className="mr-5 text-white drop-shadow-md" />
            </div>
            <div
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-start rounded-3xl bg-gradient-to-r from-orange-500/50 via-orange-500/10 to-transparent"
              style={{ opacity: glowLeft }}
            >
              <X size={48} strokeWidth={3} className="ml-5 text-white drop-shadow-md" />
            </div>
          </div>

          {/* Answer buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => answer(false)}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-orange-200 bg-card text-base font-semibold text-orange-600 shadow-sm transition-all hover:bg-orange-50 active:scale-95 dark:border-orange-500/30 dark:text-orange-400 dark:hover:bg-orange-500/10"
            >
              <X size={20} />
              Не знаю
            </button>
            <button
              type="button"
              onClick={() => answer(true)}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
            >
              <Check size={20} />
              Знаю
            </button>
          </div>
        </>
      ) : isPlan ? (
        /* «План» finished — celebration state */
        <div className="card-shadow flex min-h-[220px] flex-1 flex-col items-center justify-center gap-3 rounded-3xl border bg-card p-6 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
            <PartyPopper size={30} />
          </span>
          <p className="font-display text-lg font-bold">План на сегодня выполнен!</p>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Flame size={15} className={streak > 0 ? 'text-orange-500' : 'text-muted-foreground/40'} />
            Серия: {streak} дн. · Сегодня {todayStudied}/{dailyGoal}
          </p>
          <button
            type="button"
            onClick={() => pickMode('free')}
            className="mt-1 flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-all active:scale-95"
          >
            Продолжить в свободном режиме
          </button>
        </div>
      ) : (
        <div className="card-shadow flex min-h-[220px] flex-1 flex-col items-center justify-center gap-3 rounded-3xl border bg-card p-6 text-center">
          {allLearned ? (
            <>
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                <PartyPopper size={30} />
              </span>
              <p className="font-display text-lg font-bold">Все слова по этому фильтру выучены!</p>
              <p className="text-sm text-muted-foreground">Отличная работа. Можно повторить всю колоду.</p>
              <button
                type="button"
                onClick={toggleOnlyUnlearned}
                className="mt-1 flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-all active:scale-95"
              >
                Показать все слова
              </button>
            </>
          ) : (
            <>
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <SearchX size={30} />
              </span>
              <p className="font-display text-lg font-bold">Нет слов для показа</p>
              <p className="text-sm text-muted-foreground">Попробуйте выбрать другую букву.</p>
            </>
          )}
        </div>
      )}

      {/* First-visit onboarding overlay */}
      {active && !settings.seenOnboarding && current && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 backdrop-blur-sm"
          style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
          onClick={() => updateSettings({ seenOnboarding: true })}
        >
          <div
            className="pop-in w-full max-w-sm rounded-3xl border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Hand size={20} />
              </span>
              <h2 className="font-display text-lg font-bold">Как учиться</h2>
            </div>
            <ul className="flex flex-col gap-3 text-sm">
              <li className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                  <MoveRight size={18} />
                </span>
                Свайп вправо — слово <b>&nbsp;знаю</b>
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400">
                  <MoveLeft size={18} />
                </span>
                Свайп влево — <b>&nbsp;не знаю</b>
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Pointer size={18} />
                </span>
                Тап по карточке — показать перевод
              </li>
            </ul>
            <button
              type="button"
              onClick={() => updateSettings({ seenOnboarding: true })}
              className="mt-5 h-12 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground transition-all active:scale-95"
            >
              Понятно
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-all active:scale-95',
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'bg-card text-muted-foreground hover:bg-muted active:bg-muted/70',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
