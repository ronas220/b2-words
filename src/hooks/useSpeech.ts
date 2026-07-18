import { useCallback, useEffect, useState } from 'react';

let cachedVoice: SpeechSynthesisVoice | null = null;

function normalizeLang(lang: string): string {
  return lang.replace('_', '-').toLowerCase();
}

function pickVoice(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return;
  cachedVoice =
    voices.find((v) => normalizeLang(v.lang) === 'en-us') ??
    voices.find((v) => normalizeLang(v.lang) === 'en-gb') ??
    voices.find((v) => normalizeLang(v.lang).startsWith('en')) ??
    null;
}

export interface Speech {
  speak: (text: string) => void;
  supported: boolean;
}

/**
 * Text-to-speech via the Web Speech API.
 * Prefers an en-US voice, then en-GB, then any en*, then the browser default.
 * Never speaks on its own — call speak() from a user-gesture handler.
 */
export function useSpeech(): Speech {
  const [supported] = useState<boolean>(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window,
  );

  useEffect(() => {
    if (!supported) return;
    pickVoice();
    window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', pickVoice);
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      if (!cachedVoice) pickVoice();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'en-US';
      utter.rate = 0.95;
      if (cachedVoice) utter.voice = cachedVoice;
      synth.speak(utter);
    },
    [supported],
  );

  return { speak, supported };
}
