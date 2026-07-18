import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  loadKnown,
  loadSettings,
  saveKnown,
  saveSettings,
} from '@/lib/storage';
import type { Settings } from '@/lib/storage';

interface AppState {
  known: Record<string, true>;
  knownCount: number;
  setWordKnown: (word: string, isKnown: boolean) => void;
  resetProgress: () => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
}

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [known, setKnown] = useState<Record<string, true>>(() => loadKnown());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

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
    setKnown((prev) => {
      const next = { ...prev };
      if (isKnown) {
        next[word] = true;
      } else {
        delete next[word];
      }
      saveKnown(next);
      return next;
    });
  }, []);

  const resetProgress = useCallback(() => {
    setKnown(() => {
      saveKnown({});
      return {};
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const value = useMemo<AppState>(
    () => ({
      known,
      knownCount: Object.keys(known).length,
      setWordKnown,
      resetProgress,
      settings,
      updateSettings,
    }),
    [known, setWordKnown, resetProgress, settings, updateSettings],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
