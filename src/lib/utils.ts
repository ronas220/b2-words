import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Fisher–Yates shuffle; returns a new array. */
export function shuffleArray<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

/** Russian plural form: pluralRu(1,'слово','слова','слов') → 'слово', (2) → 'слова', (5) → 'слов'. */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const m = Math.abs(n) % 100
  const d = m % 10
  if (m > 10 && m < 20) return many
  if (d > 1 && d < 5) return few
  if (d === 1) return one
  return many
}
