export const KNOWN_KEY = 'b2words.known.v1';
export const SETTINGS_KEY = 'b2words.settings.v1';
export const BEST_SCORE_KEY = 'b2words.bestscore.v1';

/** Study mode for Карточки (deckMode) and Тест (quizMode). */
export type StudyMode = 'plan' | 'sprint' | 'free';

export interface Settings {
  shuffle: boolean;
  letter: string; // 'ALL' or 'A'..'Z'
  onlyUnlearned: boolean;
  autoplay: boolean;
  dark: boolean;
  /** Persisted deck position, keyed by filter config "letter|mode|shuffle". */
  deckPos: Record<string, number>;
  seenOnboarding: boolean;
  /** Flashcards mode: SRS daily plan, sprint over the selection, or free browsing. */
  deckMode: StudyMode;
  /** Quiz mode: SRS daily plan, sprint over the selection, or random questions. */
  quizMode: StudyMode;
  /** Daily budget of NEW words introduced in «План» mode. */
  newPerDay: number; // 5 | 10 | 15 | 25
  /** Daily goal of card answers (Знаю/Не знаю) for the streak. */
  dailyGoal: number; // 10 | 20 | 30 | 50
}

export const DEFAULT_SETTINGS: Settings = {
  shuffle: false,
  letter: 'ALL',
  onlyUnlearned: false,
  autoplay: true,
  dark: false,
  deckPos: {},
  seenOnboarding: false,
  deckMode: 'plan',
  quizMode: 'plan',
  newPerDay: 15,
  dailyGoal: 20,
};

export function loadKnown(): Record<string, true> {
  try {
    const raw = localStorage.getItem(KNOWN_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, true>;
    }
    return {};
  } catch {
    return {};
  }
}

export function saveKnown(known: Record<string, true>): void {
  try {
    localStorage.setItem(KNOWN_KEY, JSON.stringify(known));
  } catch {
    // storage unavailable (private mode etc.) — ignore
  }
}

function systemPrefersDark(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  } catch {
    return false;
  }
}

function pickMode(v: unknown, fallback: StudyMode): StudyMode {
  return v === 'plan' || v === 'sprint' || v === 'free' ? v : fallback;
}

/**
 * Merge a possibly-partial / possibly-dirty settings object over `base`,
 * validating every field (used by loadSettings and by backup import).
 */
export function sanitizeSettings(p: Partial<Settings>, base: Settings): Settings {
  const bool = (v: unknown, fb: boolean): boolean => (typeof v === 'boolean' ? v : fb);
  return {
    ...base,
    shuffle: bool(p.shuffle, base.shuffle),
    letter: typeof p.letter === 'string' ? p.letter : base.letter,
    onlyUnlearned: bool(p.onlyUnlearned, base.onlyUnlearned),
    autoplay: bool(p.autoplay, base.autoplay),
    dark: bool(p.dark, base.dark),
    deckPos: p.deckPos && typeof p.deckPos === 'object' ? p.deckPos : {},
    seenOnboarding: bool(p.seenOnboarding, base.seenOnboarding),
    deckMode: pickMode(p.deckMode, base.deckMode),
    quizMode: pickMode(p.quizMode, base.quizMode),
    newPerDay: [5, 10, 15, 25].includes(Number(p.newPerDay))
      ? Number(p.newPerDay)
      : base.newPerDay,
    dailyGoal: [10, 20, 30, 50].includes(Number(p.dailyGoal))
      ? Number(p.dailyGoal)
      : base.dailyGoal,
  };
}

export function loadSettings(): Settings {
  const base: Settings = { ...DEFAULT_SETTINGS, dark: systemPrefersDark() };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return base;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return sanitizeSettings(parsed as Partial<Settings>, base);
    }
    return base;
  } catch {
    return base;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function loadBestScore(): number {
  try {
    const v = Number(localStorage.getItem(BEST_SCORE_KEY));
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}

export function saveBestScore(score: number): void {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // ignore
  }
}
