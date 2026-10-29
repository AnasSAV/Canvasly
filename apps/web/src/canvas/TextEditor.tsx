import { hasText, patchObject, worldToScreen, type TextBearingObject } from '@canvasly/shared';
import { useLayoutEffect, useRef } from 'react';
import { useBoard, useDocVersion } from '../doc/context';
import { deleteObjects } from '../doc/ops';
import { useTheme } from '../state/theme';
import { useUI } from '../state/ui';
import { ink } from './colors';
import { useViewport } from '../state/viewport';
import { FONT_FAMILY, LINE_HEIGHT, SHAPE_PADDING, STICKY_PADDING, autoFontSize } from './text';

/** Text layout for an object, in world units. */
function layout(o: TextBearingObject, dark: boolean) {
  switch (o.type) {
    case 'sticky':
      return {
        pad: STICKY_PADDING,
        fontSize: autoFontSize(o.text, o.w, o.h, STICKY_PADDING),
        align: 'center',
        color: '#1a1a1a',
        center: true,
      };
    case 'text':
      return { pad: 0, fontSize: o.fontSize, align: o.align, color: ink(o.color, dark), center: false };
    default:
      return {
        pad: SHAPE_PADDING,
        fontSize: Math.min(autoFontSize(o.text, o.w, o.h, SHAPE_PADDING), 28),
        align: 'center',
        color:
          o.fill === 'transparent' || o.fill.toLowerCase() === '#ffffff'
            ? ink(o.textColor, dark)
            : o.textColor,
        center: true,
      };
  }
}

/**
 * HTML textarea positioned exactly over the object being edited. Every keystroke is diffed into the
 * object's Y.Text, so the canvas (and later, collaborators) see edits live.
 */
export function TextEditor() {
  const board = useBoard();
  useDocVersion(board);
  const editingId = useUI((s) => s.editingId);
  const camera = useViewport((s) => s.camera);
  const dark = useTheme((s) => s.dark);
  const ref = useRef<HTMLTextAreaElement>(null);
  const obj = editingId ? board.store.get(editingId) : undefined;
  const o = obj && hasText(obj) ? obj : null;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editingId]);

  // Auto-grow so the textarea can be vertically centered, and keep text objects' height in sync.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !o) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
    if (o.type === 'text') {
      const h = Math.max(o.fontSize * LINE_HEIGHT, el.scrollHeight / camera.zoom);
      if (Math.abs(h - o.h) > 0.5) board.transact(() => patchObject(board.objects, o.id, { h }));
    }
  });

  if (!o) return null;
  const { pad, fontSize, align, color, center } = layout(o, dark);
  const pos = worldToScreen(camera, { x: o.x, y: o.y });
  const z = camera.zoom;

  const finish = () => {
    const ui = useUI.getState();
    if (ui.editingId !== o.id) return;
    ui.setEditing(null);
    board.undo.stopCapturing(); // the next action shouldn't merge into this edit's undo step
    const cur = board.store.get(o.id);
    if (cur?.type === 'text' && !cur.text.trim()) deleteObjects(board, [o.id]);
  };

  return (
    <div
      className="pointer-events-none absolute flex"
      style={{
        left: pos.x,
        top: pos.y,
        width: o.w * z,
        height: o.type === 'text' ? undefined : o.h * z,
        padding: pad * z,
        transform: `rotate(${o.rotation}deg)`,
        transformOrigin: '0 0',
        alignItems: center ? 'center' : 'flex-start',
      }}
    >
      <textarea
        ref={ref}
        value={o.text}
        spellCheck={false}
        onChange={(e) => board.transact(() => patchObject(board.objects, o.id, { text: e.target.value }))}
        onBlur={finish}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
            e.preventDefault();
            finish();
          }
        }}
        className="pointer-events-auto block w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: fontSize * z,
          lineHeight: LINE_HEIGHT,
          color,
          textAlign: align as 'left' | 'center' | 'right',
          maxHeight: o.type === 'text' ? undefined : (o.h - pad * 2) * z,
          caretColor: '#4f46e5',
        }}
      />
    </div>
  );
}
