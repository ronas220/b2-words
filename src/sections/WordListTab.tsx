import { useEffect, useMemo, useState } from 'react';
import { Check, Search, SearchX } from 'lucide-react';
import { WORDS } from '@/data/words';
import type { WordEntry } from '@/data/words';
import { useAppState } from '@/state/app-state';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { hapticTick } from '@/lib/celebrate';
import { SpeakerButton } from '@/components/SpeakerButton';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 200;

/** Letters actually present in the dataset, for the A–Z jump rail. */
const PRESENT_LETTERS = [...new Set(WORDS.map((w) => w.w[0].toUpperCase()))].sort();

export function WordListTab() {
  const { known, setWordKnown } = useAppState();
  const reducedMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return WORDS;
    return WORDS.filter(
      (w) => w.w.toLowerCase().includes(q) || w.ru.toLowerCase().includes(q),
    );
  }, [query]);

  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);

  const groups = useMemo(() => {
    const map = new Map<string, WordEntry[]>();
    for (const w of visible) {
      const letter = w.w[0].toUpperCase();
      const arr = map.get(letter);
      if (arr) {
        arr.push(w);
      } else {
        map.set(letter, [w]);
      }
    }
    return [...map.entries()];
  }, [visible]);

  const jumpTo = (letter: string) => {
    hapticTick();
    document
      .getElementById(`letter-${letter}`)
      ?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="flex flex-col py-4">
      {/* Sticky search bar */}
      <div className="sticky top-14 z-20 -mx-4 bg-background/95 px-4 pb-2 pt-1 backdrop-blur">
        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по слову или переводу…"
            aria-label="Поиск слов"
            className="card-shadow h-12 w-full rounded-2xl border bg-card pl-11 pr-4 text-base outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {filtered.length === 0 ? 'Ничего не найдено' : `Найдено слов: ${filtered.length}`}
        </p>
      </div>

      {/* A–Z jump rail */}
      <nav
        aria-label="Быстрый переход по алфавиту"
        className="card-shadow fixed right-1 top-1/2 z-30 flex max-h-[70vh] -translate-y-1/2 flex-col items-center overflow-hidden rounded-full border bg-card/85 py-1.5 backdrop-blur"
      >
        {PRESENT_LETTERS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => jumpTo(l)}
            aria-label={`К букве ${l}`}
            className="flex h-[17px] w-7 items-center justify-center rounded-full text-[10px] font-bold text-primary transition-colors hover:bg-primary/15 active:bg-primary/25"
          >
            {l}
          </button>
        ))}
      </nav>

      {/* Grouped list */}
      {filtered.length === 0 ? (
        <div className="card-shadow mt-2 flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <SearchX size={30} />
          </span>
          <p className="font-display text-lg font-bold">Ничего не найдено</p>
          <p className="text-sm text-muted-foreground">Попробуйте изменить запрос.</p>
        </div>
      ) : (
        <div className="card-shadow mt-2 overflow-hidden rounded-2xl border bg-card">
          {groups.map(([letter, words]) => (
            <div key={letter}>
              <div
                id={`letter-${letter}`}
                className="sticky top-[7.75rem] z-10 scroll-mt-32 border-b bg-secondary/95 px-4 py-1.5 text-sm font-bold text-secondary-foreground backdrop-blur"
              >
                {letter}
              </div>
              <ul className="divide-y">
                {words.map((w) => {
                  const isKnown = Boolean(known[w.w]);
                  return (
                    <li
                      key={w.w}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1.5 transition-opacity',
                        isKnown && 'opacity-55',
                      )}
                    >
                      <button
                        type="button"
                        aria-label={
                          isKnown
                            ? `Убрать отметку «выучено»: ${w.w}`
                            : `Отметить выученным: ${w.w}`
                        }
                        aria-pressed={isKnown}
                        onClick={() => {
                          hapticTick();
                          setWordKnown(w.w, !isKnown);
                        }}
                        className={cn(
                          'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all active:scale-90',
                          isKnown
                            ? 'text-primary'
                            : 'text-muted-foreground/50 hover:bg-muted active:bg-muted/70',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors',
                            isKnown
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-current',
                          )}
                        >
                          {isKnown && <Check size={14} strokeWidth={3} />}
                        </span>
                      </button>
                      <div className="min-w-0 flex-1 py-1">
                        <p className="truncate text-base font-semibold leading-tight">
                          <span className="font-display">{w.w}</span>
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {w.pos}
                          </span>
                        </p>
                        <p className="truncate text-sm text-muted-foreground">{w.ru}</p>
                      </div>
                      <SpeakerButton text={w.w} size={18} />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {limit < filtered.length && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE_SIZE)}
          className="card-shadow mt-4 h-12 w-full rounded-2xl border bg-card text-sm font-semibold text-primary transition-all hover:bg-muted active:scale-[0.98]"
        >
          Показать ещё ({Math.min(PAGE_SIZE, filtered.length - limit)} из {filtered.length - limit})
        </button>
      )}
    </div>
  );
}
