import { useState } from 'react';
import type { AnimationEvent as ReactAnimationEvent } from 'react';
import { GraduationCap, Moon, Sun } from 'lucide-react';
import { AppStateProvider, useAppState } from '@/state/app-state';
import { BottomNav } from '@/components/BottomNav';
import type { TabId } from '@/components/BottomNav';
import { FlashcardsTab } from '@/sections/FlashcardsTab';
import { WordListTab } from '@/sections/WordListTab';
import { SelectionTab } from '@/sections/SelectionTab';
import { QuizTab } from '@/sections/QuizTab';
import { cn } from '@/lib/utils';

function ThemeToggle() {
  const { settings, updateSettings } = useAppState();
  const dark = settings.dark;
  return (
    <button
      type="button"
      onClick={() => updateSettings({ dark: !dark })}
      aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted active:scale-90"
    >
      {dark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}

export default function App() {
  const [tab, setTab] = useState<TabId>('cards');

  // Remove tab-enter once the entrance animation finishes: its held
  // `transform: translateY(0)` would otherwise keep creating a containing
  // block that breaks position:fixed descendants (the A–Z rail, overlays).
  const clearEnter = (e: ReactAnimationEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('tab-enter');
  };

  return (
    <AppStateProvider>
      <div className="min-h-dvh bg-background text-foreground">
        <header className="fixed inset-x-0 top-0 z-40 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md">
              <GraduationCap size={20} />
            </span>
            <div className="flex-1 leading-tight">
              <h1 className="font-display text-base font-bold">B2 Words</h1>
              <p className="text-[11px] text-muted-foreground">Английский · 1335 слов</p>
            </div>
            <ThemeToggle />
          </div>
        </header>

        <main
          className="mx-auto max-w-md px-4 pt-14"
          style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
        >
          {/* All tabs stay mounted so deck position / quiz round survive tab switches */}
          <div className={cn(tab !== 'cards' && 'hidden', tab === 'cards' && 'tab-enter')} onAnimationEnd={clearEnter}>
            <FlashcardsTab active={tab === 'cards'} onNavigate={setTab} />
          </div>
          <div className={cn(tab !== 'list' && 'hidden', tab === 'list' && 'tab-enter')} onAnimationEnd={clearEnter}>
            <WordListTab />
          </div>
          <div className={cn(tab !== 'select' && 'hidden', tab === 'select' && 'tab-enter')} onAnimationEnd={clearEnter}>
            <SelectionTab />
          </div>
          <div className={cn(tab !== 'quiz' && 'hidden', tab === 'quiz' && 'tab-enter')} onAnimationEnd={clearEnter}>
            <QuizTab onNavigate={setTab} />
          </div>
        </main>

        <BottomNav tab={tab} onChange={setTab} />
      </div>
    </AppStateProvider>
  );
}
