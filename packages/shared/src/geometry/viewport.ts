import type { Rect } from './box';
import type { Vec } from './vec';

/** screen = world * zoom + (x, y) */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

export const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function screenToWorld(cam: Camera, p: Vec): Vec {
  return { x: (p.x - cam.x) / cam.zoom, y: (p.y - cam.y) / cam.zoom };
}

export function worldToScreen(cam: Camera, p: Vec): Vec {
  return { x: p.x * cam.zoom + cam.x, y: p.y * cam.zoom + cam.y };
}

/** Zoom to `zoom` keeping the world point under `screenPoint` fixed. */
export function zoomAt(cam: Camera, screenPoint: Vec, zoom: number): Camera {
  const z = clampZoom(zoom);
  const world = screenToWorld(cam, screenPoint);
  return { zoom: z, x: screenPoint.x - world.x * z, y: screenPoint.y - world.y * z };
}

export function visibleWorldRect(cam: Camera, width: number, height: number): Rect {
  return { x: -cam.x / cam.zoom, y: -cam.y / cam.zoom, w: width / cam.zoom, h: height / cam.zoom };
}

/** Camera that fits `rect` into a viewport of the given size with screen-space padding. */
export function fitRect(rect: Rect, width: number, height: number, padding = 64, maxZoom = 1): Camera {
  const availW = Math.max(1, width - padding * 2);
  const availH = Math.max(1, height - padding * 2);
  const zoom = clampZoom(Math.min(maxZoom, availW / Math.max(rect.w, 1), availH / Math.max(rect.h, 1)));
  return {
    zoom,
    x: width / 2 - (rect.x + rect.w / 2) * zoom,
    y: height / 2 - (rect.y + rect.h / 2) * zoom,
  };
}

/** Zoom steps used by +/- buttons and keyboard shortcuts. */
const ZOOM_STEPS = [0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];

export function nextZoomStep(zoom: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > zoom + 1e-6) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((s) => s < zoom - 1e-6) ?? MIN_ZOOM;
}

/**
 * Camera for following someone: show exactly the world area they see, scaled to fit our viewport
 * (sizes differ between screens, so we fit their visible rect rather than copying their camera).
 */
export function followCamera(
  peer: { x: number; y: number; zoom: number; w: number; h: number },
  width: number,
  height: number,
): Camera {
  return fitRect(visibleWorldRect(peer, peer.w, peer.h), width, height, 0, MAX_ZOOM);
}
