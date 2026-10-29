import { createContext, useContext, useSyncExternalStore } from 'react';
import type { Board } from './board';

export const BoardContext = createContext<Board | null>(null);

export function useBoard(): Board {
  const board = useContext(BoardContext);
  if (!board) throw new Error('useBoard must be used inside <BoardContext>');
  return board;
}

/** Re-render whenever the board's objects change; returns a monotonically increasing version. */
export function useDocVersion(board: Board): number {
  return useSyncExternalStore(board.store.subscribe, board.store.getVersion);
}
