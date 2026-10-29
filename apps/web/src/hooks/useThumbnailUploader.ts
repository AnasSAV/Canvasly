import { useCallback, useEffect, useRef } from 'react';
import { renderThumbnail } from '../canvas/renderer2d';
import { contentBounds } from '../doc/ops';
import { LOCAL_ORIGIN, type Board } from '../doc/board';

/** While editing, refresh the dashboard preview at most this often. */
const INTERVAL_MS = 30_000;

/**
 * Re-renders and uploads the board thumbnail when this client has changed the board: periodically while
 * editing, and when leaving the board (tab hidden, navigation, unmount).
 * Returns `flush()` so in-app navigation can wait for the latest preview before showing the dashboard.
 */
export function useThumbnailUploader(board: Board, enabled: boolean): () => Promise<void> {
  const dirty = useRef(false);
  const inflight = useRef<Promise<void> | null>(null);

  const flush = useCallback(async () => {
    if (!enabled || !dirty.current) return inflight.current ?? undefined;
    dirty.current = false;
    const run = (async () => {
      const blob = await renderThumbnail(board.store, board.assetBase, contentBounds(board.store));
      if (!blob) return;
      await fetch(`/api/boards/${board.id}/thumbnail`, {
        method: 'PUT',
        body: blob,
        headers: { 'content-type': blob.type },
        keepalive: true, // survives page unload; thumbnails are well under the 64 KB keepalive limit
      }).catch(() => {
        dirty.current = true;
      });
    })();
    inflight.current = run;
    await run;
  }, [board, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onUpdate = (_: Uint8Array, origin: unknown) => {
      if (origin === LOCAL_ORIGIN) dirty.current = true;
    };
    board.doc.on('update', onUpdate);
    const timer = setInterval(() => void flush(), INTERVAL_MS);
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      board.doc.off('update', onUpdate);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      void flush();
    };
  }, [board, enabled, flush]);

  return flush;
}
