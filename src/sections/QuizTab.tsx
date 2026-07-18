import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Play, RotateCcw, Trophy, X } from 'lucide-react';
import { WORDS } from '@/data/words';
import type { WordEntry } from '@/data/words';
import { useAppState } from '@/state/app-state';
import { useSpeech } from '@/hooks/useSpeech';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { celebrate, hapticTick } from '@/lib/celebrate';
import { loadBestScore, saveBestScore } from '@/lib/storage';
import { SpeakerButton } from '@/components/SpeakerButton';
import { cn, shuffleArray } from '@/lib/utils';

const ROUND_SIZE = 10;

interface Question {
  word: WordEntry;
  options: string[];
  correct: number;
}

function buildRound(): Question[] {
  const picks = shuffleArray(WORDS).slice(0, ROUND_SIZE);
  return picks.map((word) => {
    // Prefer distractors with the same part of speech.
    const samePos = WORDS.filter((x) => x.w !== word.w && x.pos === word.pos && x.ru !== word.ru);
    const anyPos = WORDS.filter((x) => x.w !== word.w && x.ru !== word.ru);
    const pool = samePos.length >= 3 ? samePos : anyPos;
    const distractors: string[] = [];
    for (const candidate of shuffleArray(pool)) {
      if (distractors.length >= 3) break;
      if (!distractors.includes(candidate.ru)) distractors.push(candidate.ru);
    }
    const options = shuffleArray([word.ru, ...distractors]);
    return { word, options, correct: options.indexOf(word.ru) };
  });
}

function scoreMessage(score: number): string {
  if (score === ROUND_SIZE) return 'Идеально! 🏆';
  if (score >= 8) return 'Отличный результат! 🎉';
  if (score >= 5) return 'Хорошо, продолжайте! 💪';
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

export function QuizTab() {
  const { settings } = useAppState();
  const { speak } = useSpeech();

  const [round, setRound] = useState<Question[] | null>(null);
  const [qi, setQi] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);
  const [best, setBest] = useState<number>(() => loadBestScore());
  const nextRef = useRef<() => void>(() => {});

  const question: Question | undefined = round?.[qi];

  const startRound = () => {
    const r = buildRound();
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
  nextRef.current = next;

  // Auto-advance ~700ms after a correct answer (manual «Дальше» only for wrong ones).
  useEffect(() => {
    if (selected === null || !question || selected !== question.correct) return;
    const t = window.setTimeout(() => nextRef.current(), 700);
    return () => window.clearTimeout(t);
  }, [selected, question]);

  // End-of-round: persist best score + celebrate a great result.
  useEffect(() => {
    if (!done || !round) return;
    if (score > best) {
      setBest(score);
      saveBestScore(score);
    }
    if (score >= 8) celebrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const choose = (i: number) => {
    if (!question || selected !== null) return;
    hapticTick();
    setSelected(i);
    const ok = i === question.correct;
    setAnswers((a) => [...a, ok]);
    if (ok) setScore((s) => s + 1);
  };

  /* ---------------- start / end screen ---------------- */
  if (!round || done) {
    return (
      <div className="flex flex-col py-4">
        <div className="card-shadow flex min-h-[420px] flex-col items-center justify-center gap-4 rounded-3xl border bg-card p-8 text-center">
          {done && round ? (
            <>
              <ScoreRing score={score} total={round.length} />
              <p className="font-display text-lg font-bold">{scoreMessage(score)}</p>
              {best > 0 && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Trophy size={15} className="text-amber-500" />
                  Рекорд: {best} из {ROUND_SIZE}
                  {score >= best && score > 0 && ' · новый рекорд!'}
                </p>
              )}
              <button
                type="button"
                onClick={startRound}
                className="mt-2 flex h-14 items-center gap-2 rounded-2xl bg-primary px-8 text-base font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
              >
                <RotateCcw size={20} />
                Ещё раз
              </button>
            </>
          ) : (
            <>
              <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 text-4xl text-white shadow-lg">
                🧠
              </span>
              <h2 className="font-display text-2xl font-bold">Проверь себя</h2>
              <p className="max-w-[26ch] text-sm text-muted-foreground">
                {ROUND_SIZE} вопросов. Выберите правильный перевод английского слова.
              </p>
              {best > 0 && (
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
      </div>
    );
  }

  /* ---------------- question screen ---------------- */
  return (
    <div className="flex flex-col gap-4 py-4">
      {/* progress dots */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5" aria-label={`Вопрос ${qi + 1} из ${round.length}`}>
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
          {qi + 1} / {round.length}
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
