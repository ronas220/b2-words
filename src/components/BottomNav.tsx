import { BookOpen, ClipboardList, Layers } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TabId = 'cards' | 'list' | 'quiz';

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'cards', label: 'Карточки', icon: Layers },
  { id: 'list', label: 'Список', icon: BookOpen },
  { id: 'quiz', label: 'Тест', icon: ClipboardList },
];

interface BottomNavProps {
  tab: TabId;
  onChange: (tab: TabId) => void;
}

export function BottomNav({ tab, onChange }: BottomNavProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 backdrop-blur-lg"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-md px-2">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onChange(id)}
              className={cn(
                'flex h-16 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-all active:scale-95',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-8 items-center justify-center rounded-full transition-all',
                  active ? 'w-14 bg-primary/12 dark:bg-primary/20' : 'w-8',
                )}
              >
                <Icon size={21} strokeWidth={active ? 2.4 : 2} />
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
