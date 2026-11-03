import { create } from 'zustand';

/** Per-browser preferences (View / Preferences menus), remembered across sessions. */
export interface Prefs {
  /** 'mouse': the wheel zooms. 'trackpad': two-finger scroll pans and pinch zooms. */
  navMode: 'mouse' | 'trackpad';
  showGrid: boolean;
  showComments: boolean;
  snapToGrid: boolean;
  snapObjects: boolean;
  showObjectSize: boolean;
  suggestObjectSize: boolean;
  showMinimap: boolean;
  reduceMotion: boolean;
}

const DEFAULTS: Prefs = {
  navMode: 'mouse',
  showGrid: true,
  showComments: true,
  snapToGrid: false,
  snapObjects: true,
  showObjectSize: false,
  suggestObjectSize: true,
  showMinimap: false,
  reduceMotion: false,
};

const KEY = 'canvasly:prefs';

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    return DEFAULTS;
  }
}

type BooleanPref = { [K in keyof Prefs]: Prefs[K] extends boolean ? K : never }[keyof Prefs];

interface PrefsState extends Prefs {
  setNavMode: (m: Prefs['navMode']) => void;
  toggle: (k: BooleanPref) => void;
}

const applyMotion = (reduce: boolean) => document.documentElement.classList.toggle('reduce-motion', reduce);

export const usePrefs = create<PrefsState>()((set, get) => {
  const persist = () => {
    try {
      const { setNavMode: _s, toggle: _t, ...prefs } = get();
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // preferences just won't be remembered
    }
  };
  const loaded = load();
  applyMotion(loaded.reduceMotion);
  return {
    ...loaded,
    setNavMode: (navMode) => {
      set({ navMode });
      persist();
    },
    toggle: (k) => {
      set({ [k]: !get()[k] });
      if (k === 'reduceMotion') applyMotion(get().reduceMotion);
      persist();
    },
  };
});
