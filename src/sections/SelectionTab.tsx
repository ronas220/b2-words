import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Search, SearchX } from 'lucide-react';
import { WORDS } from '@/data/words';
import type { WordEntry } from '@/data/words';
import { useAppState } from '@/state/app-state';
import { isSelected } from '@/lib/selection';
import { hapticTick } from '@/lib/celebrate';
import { SpeakerButton } from '@/components/SpeakerButton';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 200;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

type StatusFilter = 'all' | 'new' | 'learning' | 'known';

function statusOf(
  srs: ReturnType<typeof useAppState>['srs'],
  word: string,
): Exclude<StatusFilter, 'all'> {
  const rec = srs[word];
  if (!rec) return 'new';
  return rec.box >= 3 ? 'known' : 'learning';
}

const STATUS_META: Record<Exclude<StatusFilter, 'all'>, { label: string; cls: string }> = {
  new: {
    label: 'Новое',
    cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  },
  learning: {
    label: 'В работе',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  known: {
    label: 'Выучено',
    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
};

const STATUS_CHIPS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Новые' },
  { id: 'learning', label: 'В работе' },
  { id: 'known', label: 'Выученные' },
];

export function SelectionTab() {
  const { srs, selection, selectedCount, setWordsSelected, selectAll, clearSelection } =
    useAppState();
  const [query, setQuery] = useState('');
  const [letter, setLetter] = useState('ALL');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [query, letter, status]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return WORDS.filter((w) => {
      if (letter !== 'ALL' && w.w[0].toUpperCase() !== letter) return false;
      if (status !== 'all' && statusOf(srs, w.w) !== status) return false;
      if (q && !w.w.toLowerCase().includes(q) && !w.ru.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, letter, status, srs]);

  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);

  const groups = useMemo(() => {
    const map = new Map<string, WordEntry[]>();
    for (const w of visible) {
      const l = w.w[0].toUpperCase();
      const arr = map.get(l);
      if (arr) {
        arr.push(w);
      } else {
        map.set(l, [w]);
      }
    }
    return [...map.entries()];
  }, [visible]);

  const filteredWords = useMemo(() => filtered.map((w) => w.w), [filtered]);

  const toggle = (w: WordEntry, on: boolean) => {
    hapticTick();
    setWordsSelected([w.w], on);
  };

  return (
    <div className="flex flex-col gap-3 py-4">
      {/* Sticky control panel: counter + global actions + search */}
      <div className="sticky top-14 z-30 -mx-4 flex flex-col gap-2 bg-background px-4 pb-2 pt-1">
        <div className="flex items-center gap-2">
          <p className="flex-1 whitespace-nowrap text-xs font-semibold">
            Выбрано {selectedCount} из {WORDS.length}
          </p>
          <button
            type="button"
            onClick={() => {
              hapticTick();
              selectAll();
            }}
            className="flex h-9 items-center rounded-full border bg-card px-3 text-xs font-semibold text-primary transition-all hover:bg-muted active:scale-95"
          >
            Все
          </button>
          <button
            type="button"
            onClick={() => {
              hapticTick();
              clearSelection();
            }}
            className="flex h-9 items-center rounded-full border bg-card px-3 text-xs font-semibold text-muted-foreground transition-all hover:bg-muted active:scale-95"
          >
            Снять все
          </button>
        </div>
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
            aria-label="Поиск слов для выбора"
            className="card-shadow h-11 w-full rounded-2xl border bg-card pl-11 pr-4 text-base outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </div>
      </div>

      {/* Letter filter */}
      <div className="chip-rail -mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-1.5">
          <Chip active={letter === 'ALL'} onClick={() => setLetter('ALL')}>
            Все
          </Chip>
          {LETTERS.map((l) => (
            <Chip key={l} active={letter === l} onClick={() => setLetter(l)}>
              {l}
            </Chip>
          ))}
        </div>
      </div>

      {/* Status filter + mass actions over the filtered set */}
      <div className="flex flex-wrap gap-2">
        {STATUS_CHIPS.map((c) => (
          <Chip key={c.id} active={status === c.id} onClick={() => setStatus(c.id)}>
            {c.label}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={filtered.length === 0}
          onClick={() => {
            hapticTick();
            setWordsSelected(filteredWords, true);
          }}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full border bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all enabled:active:scale-95 disabled:opacity-50"
        >
          <Check size={15} />
          Выбрать видимые ({filtered.length})
        </button>
        <button
          type="button"
          disabled={filtered.length === 0}
          onClick={() => {
            hapticTick();
            setWordsSelected(filteredWords, false);
          }}
          className="flex h-11 flex-1 items-center justify-center rounded-full border bg-card px-3 text-sm font-semibold text-muted-foreground transition-all enabled:active:scale-95 disabled:opacity-50"
        >
          Снять видимые
        </button>
      </div>

      {/* Grouped list */}
      {filtered.length === 0 ? (
        <div className="card-shadow mt-2 flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <SearchX size={30} />
          </span>
          <p className="font-display text-lg font-bold">Ничего не найдено</p>
          <p className="text-sm text-muted-foreground">Попробуйте изменить фильтры или запрос.</p>
        </div>
      ) : (
        <div className="selection-groups card-shadow mt-1 rounded-2xl border bg-card">
          {groups.map(([l, words]) => (
            <div key={l}>
              <div className="border-b bg-secondary px-4 py-1.5 text-sm font-bold text-secondary-foreground">
                {l}
              </div>
              <ul className="divide-y">
                {words.map((w) => {
                  const on = isSelected(selection, w.w);
                  const st = STATUS_META[statusOf(srs, w.w)];
                  return (
                    <li key={w.w} className="flex items-center gap-1 py-1 pl-1 pr-2">
                      <button
                        type="button"
                        aria-label={on ? `Убрать из плана: ${w.w}` : `Включить в план: ${w.w}`}
                        aria-pressed={on}
                        onClick={() => toggle(w, !on)}
                        className={cn(
                          'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all active:scale-90',
                          on
                            ? 'text-primary'
                            : 'text-muted-foreground/50 hover:bg-muted active:bg-muted/70',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors',
                            on ? 'border-primary bg-primary text-primary-foreground' : 'border-current',
                          )}
                        >
                          {on && <Check size={14} strokeWidth={3} />}
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
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
                          st.cls,
                        )}
                      >
                        {st.label}
                      </span>
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
          className="card-shadow mt-1 h-12 w-full rounded-2xl border bg-card text-sm font-semibold text-primary transition-all hover:bg-muted active:scale-[0.98]"
        >
          Показать ещё ({Math.min(PAGE_SIZE, filtered.length - limit)} из {filtered.length - limit})
        </button>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
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
      {children}
    </button>
  );
}
