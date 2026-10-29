import type { Board } from './doc/board';

declare global {
  interface Window {
    /** Dev-only handle used by Playwright tests and for poking at the board from the console. */
    __canvasly?: Board;
  }
}

export function exposeForDebugging(board: Board | null) {
  if (import.meta.env.DEV) window.__canvasly = board ?? undefined;
}
