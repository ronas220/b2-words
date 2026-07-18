import { Volume2, VolumeX } from 'lucide-react';
import { useSpeech } from '@/hooks/useSpeech';
import { hapticTick } from '@/lib/celebrate';
import { cn } from '@/lib/utils';

interface SpeakerButtonProps {
  text: string;
  size?: number;
  className?: string;
  label?: string;
}

/**
 * Round speaker icon-button (44×44 touch target by default).
 * Renders a disabled muted icon when the Web Speech API is unavailable.
 * Stops pointer/click propagation so it never triggers card flip or swipe.
 */
export function SpeakerButton({ text, size = 20, className, label }: SpeakerButtonProps) {
  const { speak, supported } = useSpeech();

  if (!supported) {
    return (
      <span
        title="Озвучка не поддерживается в этом браузере"
        className={cn(
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground/40',
          className,
        )}
      >
        <VolumeX size={size} />
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={label ?? `Озвучить: ${text}`}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        hapticTick();
        speak(text);
      }}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary transition-all hover:bg-primary/10 active:scale-90 active:bg-primary/20',
        className,
      )}
    >
      <Volume2 size={size} />
    </button>
  );
}
