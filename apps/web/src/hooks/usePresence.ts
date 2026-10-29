import { followCamera, type Camera } from '@canvasly/shared';
import { useEffect, useSyncExternalStore } from 'react';
import type { Board } from '../doc/board';
import type { Peer } from '../doc/presence';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';

export function usePeers(board: Board): Peer[] {
  return useSyncExternalStore(board.presence.subscribe, board.presence.getPeers);
}

/** Mirror our selection and viewport into awareness (cursor is published by the pointer handlers). */
export function usePresencePublisher(board: Board) {
  useEffect(() => {
    const { presence } = board;
    const publishViewport = () => {
      const { camera, width, height } = useViewport.getState();
      if (width && height) presence.setViewport({ ...camera, w: width, h: height });
    };
    publishViewport();
    presence.setSelection(useUI.getState().selectedIds);
    const unsubViewport = useViewport.subscribe(publishViewport);
    const unsubUI = useUI.subscribe((s, prev) => {
      if (s.selectedIds !== prev.selectedIds) presence.setSelection(s.selectedIds);
    });
    return () => {
      unsubViewport();
      unsubUI();
    };
  }, [board]);
}

const sameCamera = (a: Camera, b: Camera) =>
  Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.zoom - b.zoom) < 1e-6;

/**
 * While following a peer, keep our camera on what they see. Any camera change we didn't make
 * (pan, zoom, minimap, zoom-to-fit…) means the user took over, so following stops.
 */
export function useFollow(board: Board) {
  const followingId = useUI((s) => s.followingClientId);
  useEffect(() => {
    if (followingId === null) return;
    let applied: Camera | null = null;
    const sync = () => {
      const peer = board.presence.getPeer(followingId);
      if (!peer) {
        useUI.getState().setFollowing(null); // they left
        return;
      }
      if (!peer.viewport) return;
      const { width, height, setCamera } = useViewport.getState();
      applied = followCamera(peer.viewport, width, height);
      setCamera(applied);
    };
    sync();
    const unsubPeers = board.presence.subscribe(sync);
    const unsubViewport = useViewport.subscribe((s, prev) => {
      if (s.camera === prev.camera) return;
      if (applied && sameCamera(s.camera, applied)) return;
      useUI.getState().setFollowing(null);
    });
    return () => {
      unsubPeers();
      unsubViewport();
    };
  }, [board, followingId]);
}
