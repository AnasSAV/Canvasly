import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useUI } from '../state/ui';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Tools',
    items: [
      ['V', 'Select'],
      ['H', 'Hand'],
      ['N', 'Sticky note'],
      ['T', 'Text'],
      ['R / O', 'Rectangle / Ellipse'],
      ['L / A', 'Line / Arrow'],
      ['P / E', 'Pen / Eraser'],
      ['F', 'Frame'],
      ['C', 'Comment'],
      ['I', 'Upload image'],
    ],
  },
  {
    title: 'Text',
    items: [
      [`${MOD} B / I / U`, 'Bold / Italic / Underline'],
      [`${MOD} Shift X`, 'Strikethrough'],
      [`${MOD} Shift > / <`, 'Bigger / Smaller text'],
      [`${MOD} Shift 8 / 7`, 'Bulleted / Numbered list'],
    ],
  },
  {
    title: 'Navigate',
    items: [
      ['Wheel', 'Zoom (mouse mode)'],
      ['Right-drag, Space + drag', 'Pan'],
      ['Shift + wheel', 'Pan sideways'],
      ['Alt + 1', 'Show all'],
      ['Shift + 1', 'Zoom to selection'],
      ['Shift + 0', 'Zoom to 100%'],
      ['G', 'Show grid'],
      ['Shift + C', 'Show comments on board'],
    ],
  },
  {
    title: 'Edit',
    items: [
      [`${MOD} Z / ${MOD} Shift Z`, 'Undo / Redo'],
      [`${MOD} C / X / V`, 'Copy / Cut / Paste'],
      [`${MOD} D`, 'Duplicate'],
      [`${MOD} A`, 'Select all'],
      [`${MOD} G / ${MOD} Shift G`, 'Group / Ungroup'],
      [`${MOD} Shift L`, 'Lock / Unlock'],
      ['] / [', 'Bring to front / Send to back'],
      ['Arrows', 'Nudge (Shift = 10px)'],
      ['Enter, double-click', 'Edit text'],
      ['Tab / Enter', 'Next cell in a table'],
      ['Alt while dragging', 'Turn off snapping'],
    ],
  },
];

export function ShortcutsDialog() {
  const open = useUI((s) => s.shortcutsOpen);
  const setOpen = useUI((s) => s.setShortcutsOpen);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, setOpen]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[8vh]"
      onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        className="max-h-[84vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900 dark:text-zinc-100"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="rounded-md p-1 hover:bg-gray-100 dark:hover:bg-zinc-800"
          >
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-zinc-400">
                {g.title}
              </h3>
              <dl className="flex flex-col gap-1.5 text-sm">
                {g.items.map(([keys, what]) => (
                  <div key={what} className="flex flex-col">
                    <dt className="font-mono text-xs text-indigo-600 dark:text-indigo-400">{keys}</dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
