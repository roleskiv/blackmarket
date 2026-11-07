import { useCallback, useEffect, useState } from 'react';

/** Non-sensitive preferences, persisted in localStorage when available. */
export interface Settings {
  sound: boolean;
  musicVolume: number;
  sfxVolume: number;
  turbo: boolean;
  reducedMotion: boolean;
  showHistory: boolean;
}

const KEY = 'black-market:settings:v1';

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  musicVolume: 0.45,
  sfxVolume: 0.8,
  turbo: false,
  reducedMotion: false,
  showHistory: true,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* storage blocked */
  }
  return { ...DEFAULT_SETTINGS, reducedMotion: !!prefersReduced() };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* storage blocked */
    }
  }, [settings]);
  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  return [settings, update] as const;
}
