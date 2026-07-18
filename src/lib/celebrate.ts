import confetti from 'canvas-confetti';

const COLORS = ['#4f46e5', '#7c3aed', '#22c55e', '#f59e0b', '#ffffff'];

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Tasteful two-burst celebration; no-op when reduced motion is preferred. */
export function celebrate(): void {
  if (prefersReducedMotion()) return;
  confetti({
    particleCount: 80,
    spread: 75,
    startVelocity: 38,
    origin: { y: 0.65 },
    colors: COLORS,
    disableForReducedMotion: true,
  });
  window.setTimeout(() => {
    confetti({
      particleCount: 40,
      angle: 60,
      spread: 60,
      origin: { x: 0, y: 0.8 },
      colors: COLORS,
      disableForReducedMotion: true,
    });
    confetti({
      particleCount: 40,
      angle: 120,
      spread: 60,
      origin: { x: 1, y: 0.8 },
      colors: COLORS,
      disableForReducedMotion: true,
    });
  }, 180);
}

/** Short haptic tick; silently unsupported on most desktops/iOS. */
export function hapticTick(): void {
  try {
    navigator.vibrate?.(10);
  } catch {
    // not supported — ignore
  }
}
