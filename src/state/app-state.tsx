import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { loadSettings, saveSettings } from '@/lib/storage';
import type { Settings } from '@/lib/storage';
import {
  BOX_INTERVALS,
  clearActivity,
  clearSrs,
  computeStreak,
  knownFromSrs,
  loadActivity,
  loadSrs,
  localDayKey,
  rate,
  recordAnswer,
  saveActivity,
  saveSrs,
} from '@/lib/srs';
import type { ActivityMap, SrsState } from '@/lib/srs';

interface AppState {
  /** Derived from SRS: words with box >= 3 count as «выучено». */
  known: Record<string, true>;
  knownCount: number;
  srs: SrsState;
  activity: ActivityMap;
  todayStudied: number;
  streak: number;
  /** Manual «выучено» toggle (List tab): check → box 5, uncheck → remove record. */
  setWordKnown: (word: string, isKnown: boolean) => void;
  /** Card answer (Знаю/Не знаю): rates the Leitner box and logs daily activity. */
  rateWord: (word: string, knew: boolean) => void;
  /** Log one studied answer toward the daily goal without touching SRS (free quiz). */
  logAnswer: () => void;
  resetProgress: () => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
}

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [srs, setSrs] = useState<SrsState>(() => loadSrs());
  const [activity, setActivity] = useState<ActivityMap>(() => loadActivity());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const srsRef = useRef(srs);
  srsRef.current = srs;

  // Apply the theme class to <html> and keep the theme-color meta in sync.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', settings.dark);
    root.style.colorScheme = settings.dark ? 'dark' : 'light';
    const color = settings.dark ? '#0c0c14' : '#f7f7fc';
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
      m.removeAttribute('media');
      m.content = color;
    });
  }, [settings.dark]);

  const setWordKnown = useCallback((word: string, isKnown: boolean) => {
    setSrs((prev) => {
      const next = { ...prev };
      if (isKnown) {
        next[word] = {
          box: 5,
          due: Date.now() + BOX_INTERVALS[5],
          lapses: prev[word]?.lapses ?? 0,
        };
      } else {
        delete next[word];
      }
      saveSrs(next);
      return next;
    });
  }, []);

  const rateWord = useCallback((word: string, knew: boolean) => {
    const wasNew = srsRef.current[word] === undefined;
    setSrs((prev) => {
      const next = rate(prev, word, knew);
      saveSrs(next);
      return next;
    });
    setActivity((prev) => {
      const next = recordAnswer(prev, wasNew);
      saveActivity(next);
      return next;
    });
  }, []);

  const logAnswer = useCallback(() => {
    setActivity((prev) => {
      const next = recordAnswer(prev, false);
      saveActivity(next);
      return next;
    });
  }, []);

  const resetProgress = useCallback(() => {
    clearSrs();
    clearActivity();
    setSrs({});
    setActivity({});
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const value = useMemo<AppState>(() => {
    const known = knownFromSrs(srs);
    const today = localDayKey();
    return {
      known,
      knownCount: Object.keys(known).length,
      srs,
      activity,
      todayStudied: activity[today]?.studied ?? 0,
      streak: computeStreak(activity, settings.dailyGoal),
      setWordKnown,
      rateWord,
      logAnswer,
      resetProgress,
      settings,
      updateSettings,
    };
  }, [srs, activity, setWordKnown, rateWord, logAnswer, resetProgress, settings, updateSettings]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
