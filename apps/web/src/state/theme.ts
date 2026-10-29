import { create } from 'zustand';

export type ThemePref = 'light' | 'dark' | 'system';

const KEY = 'canvasly:theme';
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const resolve = (pref: ThemePref) => (pref === 'system' ? !!media?.matches : pref === 'dark');

function apply(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

interface ThemeState {
  pref: ThemePref;
  dark: boolean;
  setPref: (p: ThemePref) => void;
}

export const useTheme = create<ThemeState>()((set) => {
  const pref = readPref();
  apply(resolve(pref));
  return {
    pref,
    dark: resolve(pref),
    setPref: (p) => {
      try {
        localStorage.setItem(KEY, p);
      } catch {
        // per-browser preference only
      }
      apply(resolve(p));
      set({ pref: p, dark: resolve(p) });
    },
  };
});

media?.addEventListener('change', () => {
  const { pref } = useTheme.getState();
  if (pref !== 'system') return;
  apply(resolve(pref));
  useTheme.setState({ dark: resolve(pref) });
});
