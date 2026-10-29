import { Grid3x3, Redo2, Sparkles, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Actions } from '../doc/actions';
import type { Board } from '../doc/board';
import { useUI } from '../state/ui';
import { IconButton, panel } from './IconButton';
import { addStressObjects } from './stress';

function useUndoState(board: Board) {
  const [state, setState] = useState({ canUndo: false, canRedo: false });
  useEffect(() => {
    const update = () => setState({ canUndo: board.undo.canUndo(), canRedo: board.undo.canRedo() });
    board.undo.on('stack-item-added', update);
    board.undo.on('stack-item-popped', update);
    board.undo.on('stack-cleared', update);
    update();
    return () => {
      board.undo.off('stack-item-added', update);
      board.undo.off('stack-item-popped', update);
      board.undo.off('stack-cleared', update);
    };
  }, [board]);
  return state;
}

export function TopBar({ board, actions }: { board: Board; actions: Actions }) {
  const { canUndo, canRedo } = useUndoState(board);
  const snap = useUI((s) => s.snapToGrid);
  const toggleSnap = useUI((s) => s.toggleSnap);
  return (
    <>
      <div className={`${panel} absolute top-3 left-3 z-10 flex h-11 items-center gap-2 px-3`}>
        <div className="h-5 w-5 rounded-md bg-indigo-600" />
        <span className="font-semibold tracking-tight">Canvasly</span>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-600">Local board</span>
      </div>
      <div className={`${panel} absolute top-3 right-3 z-10 flex items-center gap-0.5 p-1`}>
        <IconButton label="Undo (Ctrl Z)" disabled={!canUndo} onClick={actions.undo} data-testid="undo">
          <Undo2 size={18} />
        </IconButton>
        <IconButton label="Redo (Ctrl Shift Z)" disabled={!canRedo} onClick={actions.redo} data-testid="redo">
          <Redo2 size={18} />
        </IconButton>
        <div className="mx-1 h-6 w-px bg-gray-200" />
        <IconButton label="Snap to grid" active={snap} onClick={toggleSnap}>
          <Grid3x3 size={18} />
        </IconButton>
        {import.meta.env.DEV && (
          <IconButton label="Dev: add 1,000 objects" onClick={() => addStressObjects(board, 1000)}>
            <Sparkles size={18} />
          </IconButton>
        )}
      </div>
    </>
  );
}
