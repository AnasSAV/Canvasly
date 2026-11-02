import { create } from 'zustand';

export interface PenPreset {
  color: string;
  size: number;
}

export type PresetKind = 'pen' | 'highlighter';

const DEFAULTS: Record<PresetKind, PenPreset[]> = {
  pen: [
    { color: '#1a1a1a', size: 2 },
    { color: '#e03131', size: 5 },
    { color: '#2f9e44', size: 10 },
  ],
  highlighter: [
    { color: '#f5d128', size: 24 },
    { color: '#c9df56', size: 24 },
    { color: '#6cd8fa', size: 24 },
  ],
};

interface Saved {
  presets: Record<PresetKind, PenPreset[]>;
  active: Record<PresetKind, number>;
}

const KEY = 'canvasly:drawing';

function load(): Saved {
  const fresh = { presets: DEFAULTS, active: { pen: 0, highlighter: 0 } };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null;
    return saved?.presets?.pen?.length === 3 && saved.presets.highlighter?.length === 3 && saved.active
      ? saved
      : fresh;
  } catch {
    return fresh;
  }
}

interface DrawingState extends Saved {
  setActive: (kind: PresetKind, index: number) => void;
  /** Change the preset in use. */
  update: (kind: PresetKind, patch: Partial<PenPreset>) => void;
}

/** The three pen and highlighter presets, remembered per browser. */
export const useDrawing = create<DrawingState>()((set, get) => {
  const persist = () => {
    try {
      const { presets, active } = get();
      localStorage.setItem(KEY, JSON.stringify({ presets, active }));
    } catch {
      // presets just won't be remembered
    }
  };
  return {
    ...load(),
    setActive: (kind, index) => {
      set((s) => ({ active: { ...s.active, [kind]: index } }));
      persist();
    },
    update: (kind, patch) => {
      set((s) => ({
        presets: {
          ...s.presets,
          [kind]: s.presets[kind].map((p, i) => (i === s.active[kind] ? { ...p, ...patch } : p)),
        },
      }));
      persist();
    },
  };
});

export const currentPreset = (kind: PresetKind): PenPreset => {
  const { presets, active } = useDrawing.getState();
  return presets[kind][active[kind]] ?? presets[kind][0]!;
};
