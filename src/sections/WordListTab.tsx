import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Search, SearchX } from 'lucide-react';
import { WORDS } from '@/data/words';
import type { WordEntry } from '@/data/words';
import { useAppState } from '@/state/app-state';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { hapticTick } from '@/lib/celebrate';
import { SpeakerButton } from '@/components/SpeakerButton';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 200;

const ALL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** Letters that have at least one word in the dataset (X and Y do not). */
const PRESENT_LETTERS = new Set(WORDS.map((w) => w.w[0].toUpperCase()));

export function WordListTab() {
  const { known, setWordKnown } = useAppState();
  const reducedMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  /** Letter we must scroll to once its group is rendered (after limit expansion). */
  const [pendingJump, setPendingJump] = useState<string | null>(null);

  useEffect(() => {
    setLimit(PAGE_SIZE);
    setPendingJump(null);
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

  /** Letters that have matches under the current filter (search-aware). */
  const availableLetters = useMemo(() => {
    const set = new Set<string>();
    for (const w of filtered) set.add(w.w[0].toUpperCase());
    return set;
  }, [filtered]);

  const doScroll = useCallback(
    (letter: string) => {
      const header = document.getElementById(`letter-${letter}`);
      if (!header) return;
      hapticTick();
      // Scroll by the non-sticky group wrapper's document position instead of
      // scrollIntoView on the sticky header: on UPWARD jumps the header is
      // clamped at the bottom of its group, and scrollIntoView then lands at
      // the END of the group instead of its start.
      const anchor = header.parentElement ?? header;
      const top = anchor.getBoundingClientRect().top + window.scrollY - 140; // 8.75rem sticky offset
      window.scrollTo({ top: Math.max(top, 0), behavior: reducedMotion ? 'auto' : 'smooth' });
    },
    [reducedMotion],
  );

  const jumpTo = (letter: string) => {
    // Resolve to the nearest letter that actually has matches (search mode
    // may leave the exact letter empty); prefer the next one forward.
    let target = letter;
    if (!availableLetters.has(target)) {
      const from = ALL_LETTERS.indexOf(target);
      let found: string | null = null;
      for (let d = 1; d < ALL_LETTERS.length; d++) {
        const fwd = ALL_LETTERS[from + d];
        const bwd = ALL_LETTERS[from - d];
        if (fwd !== undefined && availableLetters.has(fwd)) {
          found = fwd;
          break;
        }
        if (bwd !== undefined && availableLetters.has(bwd)) {
          found = bwd;
          break;
        }
      }
      if (!found) return; // nothing to jump to — no-op cleanly
      target = found;
    }
    const firstIdx = filtered.findIndex((w) => w.w[0].toUpperCase() === target);
    if (firstIdx === -1) return;
    // Expand through the END of the target group (not just its first row) so
    // there is enough content below the header to scroll it up to the top.
    let lastIdx = firstIdx;
    for (let i = filtered.length - 1; i > firstIdx; i--) {
      if (filtered[i].w[0].toUpperCase() === target) {
        lastIdx = i;
        break;
      }
    }
    const need = lastIdx + 1;
    if (need > limit) {
      // Group not rendered yet: expand the slice, scroll after React commits.
      setPendingJump(target);
      setLimit(need);
    } else {
      doScroll(target);
    }
  };

  // Complete a pending jump once the target group exists in the DOM.
  useEffect(() => {
    if (!pendingJump) return;
    if (document.getElementById(`letter-${pendingJump}`)) {
      doScroll(pendingJump);
      setPendingJump(null);
    }
  }, [visible, pendingJump, doScroll]);

  return (
    <div className="flex flex-col py-4">
      {/* Sticky search bar (56px app header + this block's fixed 84px height) */}
      <div className="sticky top-14 z-30 -mx-4 bg-background px-4 pb-2 pt-1">
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
        <p className="mt-2 h-4 text-xs leading-4 text-muted-foreground">
          {filtered.length === 0 ? 'Ничего не найдено' : `Найдено слов: ${filtered.length}`}
        </p>
      </div>

      {/* A–Z jump rail: opaque, aligned to the content column edge (not the viewport edge) */}
      <nav
        aria-label="Быстрый переход по алфавиту"
        className="card-shadow fixed top-1/2 z-30 flex max-h-[70vh] -translate-y-1/2 flex-col items-center overflow-hidden rounded-full border bg-card py-1.5"
        style={{ right: 'max(0.25rem, calc(50vw - 14rem))' }}
      >
        {ALL_LETTERS.map((l) => {
          const present = PRESENT_LETTERS.has(l);
          return (
            <button
              key={l}
              type="button"
              disabled={!present}
              onClick={() => jumpTo(l)}
              aria-label={present ? `К букве ${l}` : `Буква ${l} — нет слов`}
              className={cn(
                'flex h-[17px] w-7 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
                present
                  ? 'text-primary hover:bg-primary/15 active:bg-primary/25'
                  : 'cursor-default text-muted-foreground/30',
              )}
            >
              {l}
            </button>
          );
        })}
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
        <div className="word-groups card-shadow mt-2 rounded-2xl border bg-card">
          {groups.map(([letter, words]) => (
            <div key={letter}>
              <div
                id={`letter-${letter}`}
                className="letter-header sticky top-[8.75rem] z-20 scroll-mt-36 border-b bg-secondary px-4 py-1.5 text-sm font-bold text-secondary-foreground"
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
                        'flex items-center gap-1 py-1.5 pl-2 pr-9 transition-opacity',
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

      {/* Runway: lets even the last letter header scroll up to the sticky offset */}
      <div aria-hidden="true" style={{ height: 'calc(100dvh - 16rem)' }} />
    </div>
  );
}
