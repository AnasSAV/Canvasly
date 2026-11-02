import {
  cellKey,
  continueList,
  hasText,
  localToWorld,
  patchObject,
  shapeTextBox,
  worldToScreen,
  type TableObject,
  type TextBearingObject,
} from '@canvasly/shared';
import { useLayoutEffect, useRef } from 'react';
import { useBoard, useDocVersion } from '../doc/context';
import { deleteObjects, moveTableCell, setCell, textShortcut } from '../doc/ops';
import { useTheme } from '../state/theme';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { ink } from './colors';
import {
  FONTS,
  FONT_FAMILY,
  LINE_HEIGHT,
  SHAPE_PADDING,
  STICKY_PADDING,
  autoFontSize,
  fontStyle,
  textBox,
  textDecoration,
  useFontEpoch,
} from './text';
import { cellPadding, cellRect } from './widgets';

/** Text layout for an object, in world units: where the text goes inside the box, and how it looks. */
function layout(o: TextBearingObject, dark: boolean) {
  switch (o.type) {
    case 'sticky':
      return {
        box: {
          x: STICKY_PADDING,
          y: STICKY_PADDING,
          w: o.w - STICKY_PADDING * 2,
          h: o.h - STICKY_PADDING * 2,
        },
        fontSize: autoFontSize(o.text, o.w, o.h, STICKY_PADDING, o),
        align: o.align,
        color: '#1a1a1a',
        center: true,
      };
    case 'text':
      return {
        box: { x: 0, y: 0, w: o.w, h: o.h },
        fontSize: o.fontSize,
        align: o.align,
        color: ink(o.color, dark),
        center: false,
      };
    default: {
      const box = shapeTextBox(o.type, o.w, o.h, SHAPE_PADDING);
      return {
        box,
        fontSize: Math.min(autoFontSize(o.text, box.w, box.h, 0, o), 28),
        align: o.align,
        color:
          o.fill === 'transparent' || o.fill.toLowerCase() === '#ffffff'
            ? ink(o.textColor, dark)
            : o.textColor,
        center: true,
      };
    }
  }
}

/**
 * HTML textarea positioned exactly over the object being edited. Every keystroke is diffed into the
 * object's Y.Text, so collaborators see edits live.
 */
export function TextEditor() {
  const board = useBoard();
  useDocVersion(board);
  const editingId = useUI((s) => s.editingId);
  const camera = useViewport((s) => s.camera);
  const dark = useTheme((s) => s.dark);
  useFontEpoch((s) => s.epoch); // refit once this object's font has loaded
  const ref = useRef<HTMLTextAreaElement>(null);
  /** Where to put the caret after a list keystroke rewrites the text. */
  const caretAfter = useRef<number | null>(null);
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
    if (caretAfter.current !== null) {
      el.setSelectionRange(caretAfter.current, caretAfter.current);
      caretAfter.current = null;
    }
    if (o.type === 'text') {
      const h = Math.max(o.fontSize * LINE_HEIGHT, el.scrollHeight / camera.zoom);
      const next = o.autoWidth ? textBox(o) : { w: o.w, h };
      if (Math.abs(next.w - o.w) > 0.5 || Math.abs(next.h - o.h) > 0.5) {
        board.transact(() => patchObject(board.objects, o.id, next));
      }
    }
  });

  if (!o) return null;
  const { box, fontSize, align, color, center } = layout(o, dark);
  const pos = worldToScreen(camera, { x: o.x, y: o.y });
  const z = camera.zoom;
  const hugging = o.type === 'text' && o.autoWidth;
  // Room past the end of the text, so the caret isn't clipped before the box catches up.
  const slack = hugging ? fontSize : 0;

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
        width: (o.w + slack) * z,
        height: o.type === 'text' ? undefined : o.h * z,
        paddingLeft: box.x * z,
        paddingTop: box.y * z,
        paddingRight: (o.w - box.x - box.w) * z,
        paddingBottom: o.type === 'text' ? 0 : (o.h - box.y - box.h) * z,
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
          if (textShortcut(board, [o.id], e)) {
            e.preventDefault();
          } else if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
            e.preventDefault();
            finish();
          } else if (e.key === 'Enter' && !e.shiftKey) {
            const el = e.currentTarget;
            const next = el.selectionStart === el.selectionEnd && continueList(el.value, el.selectionStart);
            if (!next) return;
            e.preventDefault();
            caretAfter.current = next.caret;
            board.transact(() => patchObject(board.objects, o.id, { text: next.text }));
          }
        }}
        className="pointer-events-auto block w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
        style={{
          fontFamily: FONTS[o.font].family,
          fontSize: fontSize * z,
          fontWeight: o.bold ? 700 : 400,
          fontStyle: fontStyle({ bold: false, italic: o.italic }),
          textDecoration: textDecoration(o) || undefined,
          lineHeight: LINE_HEIGHT,
          color,
          whiteSpace: hugging ? 'pre' : undefined,
          // Keep centered and right-aligned text where it will land, with the extra room split accordingly.
          marginLeft: (align === 'center' ? -slack / 2 : align === 'right' ? -slack : 0) * z,
          textAlign: align as 'left' | 'center' | 'right',
          maxHeight: o.type === 'text' ? undefined : box.h * z,
          caretColor: '#4262ff',
        }}
      />
    </div>
  );
}

/** Inline editor for one table cell. Tab moves across, Enter moves down, Esc finishes. */
export function CellEditor() {
  const board = useBoard();
  useDocVersion(board);
  const editing = useUI((s) => s.editingCell);
  const camera = useViewport((s) => s.camera);
  const dark = useTheme((s) => s.dark);
  const ref = useRef<HTMLTextAreaElement>(null);
  const obj = editing ? board.store.get(editing.id) : undefined;
  const table: TableObject | null = obj?.type === 'table' ? obj : null;
  const key = editing ? cellKey(editing.rowId, editing.colId) : '';

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [key]);

  if (!table || !editing) return null;
  const rect = cellRect(table, editing.rowId, editing.colId);
  if (!rect) return null;
  const z = camera.zoom;
  const pos = worldToScreen(camera, localToWorld(table, { x: rect.x, y: rect.y }));
  const isHeader = table.headerRow && table.rows[0]?.id === editing.rowId;

  const finish = () => {
    if (useUI.getState().editingCell?.id !== table.id) return;
    useUI.getState().setEditingCell(null);
    board.undo.stopCapturing();
  };

  return (
    <textarea
      ref={ref}
      value={table.cells[key] ?? ''}
      spellCheck={false}
      data-testid="cell-editor"
      onChange={(e) => setCell(board, table.id, key, e.target.value)}
      onBlur={(e) => {
        // Moving to another cell re-renders this same textarea; only a real blur ends editing.
        if (e.relatedTarget !== ref.current) finish();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          finish();
        } else if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault();
          board.undo.stopCapturing();
          const dir = e.key === 'Enter' ? 'down' : e.shiftKey ? 'left' : 'right';
          const next = moveTableCell(board, table, editing, dir);
          if (next) useUI.getState().setEditingCell({ id: table.id, ...next });
          else finish();
        }
      }}
      className="absolute z-[4] resize-none border-2 border-indigo-600 bg-white outline-none dark:bg-zinc-800"
      style={{
        left: pos.x,
        top: pos.y,
        width: rect.w * z,
        height: rect.h * z,
        padding: cellPadding * z,
        transform: `rotate(${table.rotation}deg)`,
        transformOrigin: '0 0',
        fontFamily: FONT_FAMILY,
        fontSize: table.fontSize * z,
        fontWeight: isHeader ? 600 : 400,
        lineHeight: LINE_HEIGHT,
        color: ink('#1a1a1a', dark),
      }}
    />
  );
}
