import { useEffect } from 'react';
import { isEditableTarget } from '../canvas/interactions';
import type { Actions } from '../doc/actions';
import { usePrefs } from '../state/prefs';
import { useUI, type Tool } from '../state/ui';
import { useViewport } from '../state/viewport';

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  h: 'hand',
  n: 'sticky',
  t: 'text',
  r: 'rect',
  o: 'ellipse',
  l: 'line',
  a: 'arrow',
  p: 'pen',
  e: 'eraser',
  f: 'frame',
  c: 'comment',
};

const VIEWER_TOOLS = new Set<Tool>(['select', 'hand', 'comment']);

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Global keyboard shortcuts and clipboard events, ignored while typing in an input. */
export function useShortcuts(actions: Actions, openImagePicker: () => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e)) return;
      const ui = useUI.getState();
      if (ui.presenting !== null) return; // presentation mode has its own keys
      const vp = useViewport.getState();
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();

      if (e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) ui.setSpacePan(true);
        return;
      }

      if (mod) {
        if (actions.textShortcut(e)) {
          e.preventDefault();
          return;
        }
        const handled = (() => {
          if (key === 'z' && e.shiftKey) return actions.redo();
          if (key === 'z') return actions.undo();
          if (key === 'y') return actions.redo();
          if (key === 'd') return actions.duplicateSelected();
          if (key === 'a') return actions.selectAll();
          if (key === 'g' && e.shiftKey) return actions.ungroup();
          if (key === 'g') return actions.group();
          if (key === 'l' && e.shiftKey) return actions.toggleLock();
          if (key === '=' || key === '+') return vp.zoomStep(1);
          if (key === '-') return vp.zoomStep(-1);
          if (key === '0') return vp.zoomTo(1);
          return 'unhandled';
        })();
        if (handled !== 'unhandled') e.preventDefault();
        return;
      }
      if (e.altKey) {
        if (e.code === 'Digit1') {
          e.preventDefault();
          actions.showAll();
        }
        return;
      }
      if (e.key === '?') return ui.setShortcutsOpen(true);
      if (e.shiftKey && key === 'c') return usePrefs.getState().toggle('showComments');
      if (!e.shiftKey && key === 'g') return usePrefs.getState().toggle('showGrid');

      if (e.shiftKey && e.code === 'Digit1') return actions.zoomToFit();
      if (e.shiftKey && e.code === 'Digit0') return vp.zoomTo(1);

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          return actions.deleteSelected();
        case 'Escape':
          return actions.deselect();
        case ']':
          return actions.bringToFront();
        case '[':
          return actions.sendToBack();
        case 'Enter': {
          if (ui.selectedIds.length === 1 && !ui.readOnly) {
            e.preventDefault();
            actions.editSelected();
          }
          return;
        }
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          if (!ui.selectedIds.length) return;
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          return actions.nudge(dx, dy);
        }
      }
      if (!e.shiftKey && key === 'i' && !ui.readOnly) return openImagePicker();
      const tool = !e.shiftKey ? TOOL_KEYS[key] : undefined;
      if (tool && (!ui.readOnly || VIEWER_TOOLS.has(tool))) ui.setTool(tool);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') useUI.getState().setSpacePan(false);
    };
    const onBlur = () => useUI.getState().setSpacePan(false);

    const onCopy = (e: ClipboardEvent) => {
      if (isEditableTarget(e)) return;
      const text = actions.copy();
      if (!text) return;
      e.clipboardData?.setData('text/plain', text);
      e.preventDefault();
    };
    const onCut = (e: ClipboardEvent) => {
      if (isEditableTarget(e)) return;
      const text = actions.cut();
      if (!text) return;
      e.clipboardData?.setData('text/plain', text);
      e.preventDefault();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e)) return;
      e.preventDefault();
      // The clipboard is emptied when this event ends, so everything is read up front.
      void actions.pasteContent({
        html: e.clipboardData?.getData('text/html') ?? '',
        text: e.clipboardData?.getData('text/plain') ?? '',
        canva: e.clipboardData?.getData('application/x-canva') ?? '',
        files: [...(e.clipboardData?.files ?? [])],
      });
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  }, [actions, openImagePicker]);
}
