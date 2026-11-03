import { useUI } from '../state/ui';
import { Dialog } from './Dialog';

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
  {
    title: 'Text',
    items: [
      [`${MOD} B / I / U`, 'Bold / Italic / Underline'],
      [`${MOD} Shift X`, 'Strikethrough'],
      [`${MOD} Shift > / <`, 'Bigger / Smaller text'],
      [`${MOD} Shift 8 / 7`, 'Bulleted / Numbered list'],
    ],
  },
];

/** Keys get a keycap; joining words and gestures stay plain text. */
function Keys({ keys }: { keys: string }) {
  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
      {keys.split(' ').map((part, i) =>
        /^[a-z/+]/.test(part) || part.endsWith(',') ? (
          <span key={i} className="text-xs text-muted">
            {part}
          </span>
        ) : (
          <kbd key={i} className="kbd">
            {part}
          </kbd>
        ),
      )}
    </span>
  );
}

export function ShortcutsDialog() {
  const open = useUI((s) => s.shortcutsOpen);
  const setOpen = useUI((s) => s.setShortcutsOpen);
  if (!open) return null;
  return (
    <Dialog label="Keyboard shortcuts" title="Keyboard shortcuts" size="lg" onClose={() => setOpen(false)}>
      <div className="gap-8 sm:columns-2">
        {GROUPS.map((g) => (
          <section key={g.title} className="mb-6 break-inside-avoid last:mb-0">
            <h3 className="mb-1 text-xs font-semibold text-muted">{g.title}</h3>
            <dl>
              {g.items.map(([keys, what]) => (
                <div
                  key={what}
                  className="flex min-h-8 items-center justify-between gap-4 border-b border-line py-1 last:border-0"
                >
                  <dt className="text-[13px]">{what}</dt>
                  <dd className="shrink-0">
                    <Keys keys={keys} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
