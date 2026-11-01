import {
  MAX_ZOOM,
  fitRect,
  nextZoomStep,
  visibleWorldRect,
  zoomAt,
  type Camera,
  type Rect,
  type Vec,
} from '@canvasly/shared';
import { create } from 'zustand';

interface ViewportState {
  camera: Camera;
  width: number;
  height: number;
  setSize: (width: number, height: number) => void;
  setCamera: (camera: Camera) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAtPoint: (screen: Vec, zoom: number) => void;
  /** Step zoom in/out around the viewport center. */
  zoomStep: (dir: 1 | -1) => void;
  zoomTo: (zoom: number) => void;
  fit: (rect: Rect | null) => void;
  /** Show exactly this area (start view, no padding or zoom cap). */
  fitExact: (rect: Rect) => void;
  /** Center the camera on a world point, keeping zoom. */
  centerOn: (p: Vec) => void;
  visibleRect: () => Rect;
}

export const useViewport = create<ViewportState>()((set, get) => ({
  camera: { x: 0, y: 0, zoom: 1 },
  width: 0,
  height: 0,
  setSize: (width, height) => set({ width, height }),
  setCamera: (camera) => set({ camera }),
  panBy: (dx, dy) => set(({ camera }) => ({ camera: { ...camera, x: camera.x + dx, y: camera.y + dy } })),
  zoomAtPoint: (screen, zoom) => set(({ camera }) => ({ camera: zoomAt(camera, screen, zoom) })),
  zoomStep: (dir) => {
    const { camera, width, height } = get();
    set({ camera: zoomAt(camera, { x: width / 2, y: height / 2 }, nextZoomStep(camera.zoom, dir)) });
  },
  zoomTo: (zoom) => {
    const { camera, width, height } = get();
    set({ camera: zoomAt(camera, { x: width / 2, y: height / 2 }, zoom) });
  },
  fit: (rect) => {
    const { width, height } = get();
    if (!rect) {
      set({ camera: { x: width / 2, y: height / 2, zoom: 1 } });
      return;
    }
    set({ camera: fitRect(rect, width, height, 80, 2) });
  },
  fitExact: (rect) => {
    const { width, height } = get();
    set({ camera: fitRect(rect, width, height, 0, MAX_ZOOM) });
  },
  centerOn: (p) => {
    const { camera, width, height } = get();
    set({ camera: { ...camera, x: width / 2 - p.x * camera.zoom, y: height / 2 - p.y * camera.zoom } });
  },
  visibleRect: () => {
    const { camera, width, height } = get();
    return visibleWorldRect(camera, width, height);
  },
}));
