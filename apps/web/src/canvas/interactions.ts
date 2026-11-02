import {
  closestSideAnchor,
  dist,
  eraseFromStroke,
  expandRect,
  hasText,
  insertObject,
  isSafeLink,
  localToWorld,
  makeConnector,
  makeFrame,
  makePen,
  makeShape,
  makeSticky,
  makeText,
  nearestSideAnchor,
  pointInPolygon,
  recognizeStroke,
  rectContainsRect,
  rectFromPoints,
  screenToWorld,
  zoomAt,
  DEFAULT_FRAME_SIZE,
  snapRect,
  snapToGrid,
  SHAPE_KINDS,
  worldToLocal,
  STICKY_SIZE,
  type BoardObject,
  type Camera,
  type ConnectorEnd,
  type Guide,
  type Rect,
  type ShapeKind,
  type Vec,
} from '@canvasly/shared';
import Konva from 'konva';
import type { Board } from '../doc/board';
import {
  addConnectedCopy,
  addObjects,
  deleteObjects,
  expandGroups,
  moveFrom,
  nextZ,
  patch,
  selectionBounds,
  setStartView,
} from '../doc/ops';
import { currentPreset } from '../state/drawing';
import { usePrefs } from '../state/prefs';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { hitTest } from './hitTest';
import { defaultShapeSize } from './shapePaths';
import { cellAt } from './widgets';

export const GRID_SIZE = 20;
const DRAG_THRESHOLD = 4; // screen px
const SNAP_DISTANCE = 6; // screen px
const STROKE_ERASER_RADIUS = 8; // screen px
const SPOT_ERASER_RADIUS = 12; // screen px
const SMART_MIN_SIZE = 24; // screen px; anything smaller stays as ink
const DOT_ATTACH_REACH = 24; // screen px; a line from a dot attaches when it's let go near a shape
const LINE_HANDLE_REACH = 12; // screen px
const BEND_SNAP = 8; // screen px; a line dragged back to about straight goes properly straight

type Gesture =
  /** `rightClick`: started with the right button; releasing without moving opens the context menu. */
  | { kind: 'pan'; last: Vec; rightClick?: { start: Vec; world: Vec } }
  | {
      kind: 'move';
      startScreen: Vec;
      startWorld: Vec;
      origins: Map<string, BoardObject>;
      startBounds: Rect | null;
      targets: Rect[];
      started: boolean;
      hitGroup: string[];
      shift: boolean;
      wasSelected: boolean;
    }
  | { kind: 'marquee'; start: Vec; startScreen: Vec; base: string[] }
  | { kind: 'shape'; shape: ShapeKind | 'frame' | 'startview'; start: Vec }
  | { kind: 'pen'; points: number[]; color: string; size: number; opacity: number; smart: boolean }
  | { kind: 'lasso'; points: number[] }
  | {
      kind: 'connector';
      start: ConnectorEnd;
      startScreen: Vec;
      arrow: boolean;
      /** Started from a connect dot: curved, meets shapes squarely, and a click adds a joined copy. */
      fromDot?: { id: string; side: readonly [number, number] };
    }
  | { kind: 'reattach'; id: string; which: 'start' | 'end'; started: boolean; startScreen: Vec }
  | { kind: 'bend'; id: string; started: boolean; startScreen: Vec }
  | { kind: 'eraser'; spot: boolean; last: Vec }
  | { kind: 'pinch'; startDist: number; startMid: Vec; startCam: Camera };

const DOUBLE_TAP_MS = 300;

const isShapeTool = (t: string): t is ShapeKind => (SHAPE_KINDS as readonly string[]).includes(t);

const ui = () => useUI.getState();
const vp = () => useViewport.getState();
const uniq = (ids: string[]) => [...new Set(ids)];
const eraserRadius = (spot: boolean) => (spot ? SPOT_ERASER_RADIUS : STROKE_ERASER_RADIUS) / vp().camera.zoom;

export const isEditableTarget = (e: Event): boolean =>
  e.target instanceof HTMLElement && !!e.target.closest('textarea, input, select, [contenteditable]');

/**
 * Pointer state machine for the canvas. Hit-testing is geometric (R-tree + shape math), so Konva only
 * handles events for overlay widgets (Transformer anchors, connector handles).
 * Doc writes during drags are coalesced to one per animation frame.
 */
export class Interactions {
  private g: Gesture | null = null;
  private raf = 0;
  private pending: (() => void) | null = null;
  private gestureZoom: number | null = null;
  /** Active touch points (screen coords) for pinch-zoom. */
  private touches = new Map<number, Vec>();
  private lastTap: { at: number; p: Vec } | null = null;
  /** Last pointer position in world coordinates (paste target). */
  lastWorld: Vec | null = null;

  constructor(
    private readonly board: Board,
    private readonly el: HTMLElement,
    private readonly getStage: () => Konva.Stage | null,
  ) {}

  attach() {
    const el = this.el;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('pointerleave', this.onPointerLeave);
    el.addEventListener('dblclick', this.onDoubleClick);
    el.addEventListener('contextmenu', this.onContextMenu);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('gesturestart', this.onGestureStart as EventListener);
    el.addEventListener('gesturechange', this.onGestureChange as EventListener);
    return () => {
      el.removeEventListener('pointerdown', this.onPointerDown);
      el.removeEventListener('pointermove', this.onPointerMove);
      el.removeEventListener('pointerup', this.onPointerUp);
      el.removeEventListener('pointercancel', this.onPointerUp);
      el.removeEventListener('pointerleave', this.onPointerLeave);
      el.removeEventListener('dblclick', this.onDoubleClick);
      el.removeEventListener('contextmenu', this.onContextMenu);
      el.removeEventListener('wheel', this.onWheel);
      el.removeEventListener('gesturestart', this.onGestureStart as EventListener);
      el.removeEventListener('gesturechange', this.onGestureChange as EventListener);
      cancelAnimationFrame(this.raf);
    };
  }

  // --- helpers ---
  private screen(e: MouseEvent): Vec {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  private world(e: MouseEvent): Vec {
    return screenToWorld(vp().camera, this.screen(e));
  }
  private snapPoint(p: Vec): Vec {
    return usePrefs.getState().snapToGrid
      ? { x: snapToGrid(p.x, GRID_SIZE), y: snapToGrid(p.y, GRID_SIZE) }
      : p;
  }
  /** Run `fn` on the next animation frame, replacing any not-yet-run scheduled work. */
  private schedule(fn: () => void) {
    this.pending = fn;
    this.raf ||= requestAnimationFrame(() => {
      this.raf = 0;
      const f = this.pending;
      this.pending = null;
      f?.();
    });
  }
  private flush() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    const f = this.pending;
    this.pending = null;
    f?.();
  }

  /** Connector end at world point p: attached to the shape under the pointer, or a free point. */
  private endAt(p: Vec, excludeId: string | null, squarely = false): ConnectorEnd {
    const zoom = vp().camera.zoom;
    const target = hitTest(
      this.board.store,
      p,
      squarely ? DOT_ATTACH_REACH / zoom : 0,
      (o) => o.type !== 'connector' && o.type !== 'pen' && o.id !== excludeId,
    );
    ui().setAttachHover(target?.id ?? null);
    if (target && target.type !== 'connector') {
      const anchor = squarely
        ? closestSideAnchor(target, p)
        : (nearestSideAnchor(target, p, 12 / zoom) ?? 'auto');
      return { kind: 'attached', objectId: target.id, anchor };
    }
    const s = this.snapPoint(p);
    return { kind: 'point', x: s.x, y: s.y };
  }

  /**
   * The selected line whose middle handle is at p. Worked out from the line itself, as Konva's hit canvas only catches
   * up on the next frame, and until then a click on a handle that just moved would land on the line instead.
   */
  private lineHandleAt(p: Vec): string | null {
    const ids = ui().selectedIds;
    const line = ids.length === 1 ? this.board.store.get(ids[0]!) : undefined;
    if (line?.type !== 'connector' || line.locked) return null;
    const r = this.board.store.resolve(line);
    return r && dist(r.mid, p) * vp().camera.zoom <= LINE_HANDLE_REACH ? line.id : null;
  }

  /** A second finger landed mid-gesture: drop whatever the first finger started. */
  private cancelGesture() {
    const g = this.g;
    this.g = null;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.pending = null;
    if (!g) return;
    const u = ui();
    if (((g.kind === 'move' || g.kind === 'bend') && g.started) || g.kind === 'eraser' || g.kind === 'pen') {
      this.board.endGesture();
    }
    if (g.kind === 'bend') u.setInteracting(false);
    if (g.kind === 'move') {
      u.setInteracting(false);
      u.setGuides([]);
    }
    if (g.kind === 'marquee') u.setMarquee(null);
    if (g.kind === 'pan') u.setPanning(false);
    u.setDraft(null);
    u.setAttachHover(null);
  }

  private pinchMetrics(): { dist: number; mid: Vec } {
    const [a, b] = [...this.touches.values()] as [Vec, Vec];
    return {
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }

  private editAt(p: Vec) {
    const u = ui();
    if (u.tool !== 'select' || this.board.readOnly) return;
    const hit = hitTest(this.board.store, p, 2 / vp().camera.zoom);
    if (!hit || hit.locked) return;
    if (hasText(hit)) {
      u.select([hit.id]);
      u.setEditing(hit.id);
    } else if (hit.type === 'table') {
      const cell = cellAt(hit, worldToLocal(hit, p));
      u.select([hit.id]);
      if (cell) u.setEditingCell({ id: hit.id, ...cell });
    } else if (hit.type === 'chart') {
      u.select([hit.id]);
      u.setChartEditor(hit.id);
    } else if (hit.type === 'connector') {
      u.select([hit.id]);
      u.setEditingLabel(hit.id);
    }
  }

  /** Right-click without dragging: select what's under the pointer and open the menu there. */
  private openContextMenu(screen: Vec, world: Vec) {
    const u = ui();
    const hit = hitTest(this.board.store, world, 2 / vp().camera.zoom);
    if (hit && !u.selectedIds.includes(hit.id)) u.select(expandGroups(this.board.store, [hit.id]));
    u.setContextMenu({ x: screen.x, y: screen.y, world, targetId: hit?.id ?? null });
  }

  private finishCreate(o: BoardObject, edit: boolean) {
    addObjects(this.board, [o]);
    const u = ui();
    u.select([o.id]);
    u.setTool('select');
    if (edit) u.setEditing(o.id);
  }

  // --- events ---
  onPointerDown = (e: PointerEvent) => {
    if (isEditableTarget(e)) return;
    const screen = this.screen(e);
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, screen);
      if (this.touches.size === 2) {
        // Two fingers: pinch-zoom + pan, whatever the first finger was doing.
        this.cancelGesture();
        const { dist: d, mid } = this.pinchMetrics();
        this.g = { kind: 'pinch', startDist: d, startMid: mid, startCam: vp().camera };
        e.preventDefault();
        return;
      }
    }
    if (this.g) return;
    const u = ui();
    const p = this.world(e);
    this.lastWorld = p;
    if (u.editingId) u.setEditing(null);
    if (u.editingCell) u.setEditingCell(null);
    if (u.editingLabelId) u.setEditingLabel(null);

    // Overlay widgets drawn by Konva take precedence.
    const node = this.getStage()?.getIntersection(screen);
    if (node) {
      const handle = node.getAttr('connectorHandle') as { id: string; which: 'start' | 'end' } | undefined;
      if (handle && e.button === 0 && !this.board.readOnly) {
        this.g = { kind: 'reattach', ...handle, started: false, startScreen: screen };
        this.el.setPointerCapture(e.pointerId);
        return;
      }
      const dot = node.getAttr('connectDot') as { id: string; side: [number, number] } | undefined;
      if (dot && e.button === 0 && !this.board.readOnly) {
        this.g = {
          kind: 'connector',
          start: { kind: 'attached', objectId: dot.id, anchor: dot.side },
          startScreen: screen,
          arrow: true,
          fromDot: dot,
        };
        this.el.setPointerCapture(e.pointerId);
        return;
      }
      if (node.getParent() instanceof Konva.Transformer) return;
    }
    if (e.button === 0 && !this.board.readOnly && u.tool === 'select') {
      const mid = this.lineHandleAt(p);
      if (mid) {
        this.g = { kind: 'bend', id: mid, started: false, startScreen: screen };
        this.el.setPointerCapture(e.pointerId);
        return;
      }
    }
    // Keep focus/text selection where they are (and avoid middle-click autoscroll). Transformer anchors
    // above still need the native mousedown, which this would suppress.
    e.preventDefault();

    // Middle mouse, Space/hand tool or right-drag pans. A right-click that doesn't drag opens the menu.
    if (e.button === 2 || e.button === 1 || (e.button === 0 && (u.spacePan || u.tool === 'hand'))) {
      this.g =
        e.button === 2
          ? { kind: 'pan', last: screen, rightClick: { start: screen, world: p } }
          : { kind: 'pan', last: screen };
      u.setPanning(e.button !== 2);
      this.el.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    const { store } = this.board;
    const zoom = vp().camera.zoom;
    const readOnly = this.board.readOnly;
    if (readOnly && u.tool !== 'select' && u.tool !== 'comment') return;
    if (isShapeTool(u.tool)) {
      this.g = { kind: 'shape', shape: u.tool, start: this.snapPoint(p) };
      this.el.setPointerCapture(e.pointerId);
      return;
    }
    switch (u.tool) {
      case 'select': {
        const hit = hitTest(store, p, (e.pointerType === 'touch' ? 8 : 2) / zoom);
        // Ctrl/Cmd-click follows a link (plain clicks select, so that linked objects can still be edited).
        if ((e.ctrlKey || e.metaKey) && hit && hasText(hit) && hit.link && isSafeLink(hit.link)) {
          window.open(hit.link, '_blank', 'noopener,noreferrer');
          return;
        }
        if (!hit && e.pointerType === 'touch') {
          // One finger on empty canvas pans (marquee needs a mouse or pen).
          this.g = { kind: 'pan', last: screen };
          break;
        }
        if (!hit) {
          this.g = { kind: 'marquee', start: p, startScreen: screen, base: e.shiftKey ? u.selectedIds : [] };
          if (!e.shiftKey) u.select([]);
          break;
        }
        const hitGroup = expandGroups(store, [hit.id]);
        const wasSelected = u.selectedIds.includes(hit.id);
        if (e.shiftKey && !wasSelected) u.select(uniq([...u.selectedIds, ...hitGroup]));
        else if (!e.shiftKey && !wasSelected) u.select(hitGroup);
        const origins = new Map<string, BoardObject>();
        for (const id of ui().selectedIds) {
          const o = store.get(id);
          if (o && !o.locked && !readOnly) origins.set(id, o);
        }
        this.g = {
          kind: 'move',
          startScreen: screen,
          startWorld: p,
          origins,
          startBounds: selectionBounds(store, origins.keys()),
          targets: [],
          started: false,
          hitGroup,
          shift: e.shiftKey,
          wasSelected,
        };
        break;
      }
      case 'frame':
      case 'startview':
        this.g = { kind: 'shape', shape: u.tool, start: this.snapPoint(p) };
        break;
      case 'comment':
        if (this.board.anonymous) return;
        u.setCommentDraft(p);
        return;
      case 'sticky': {
        const at = this.snapPoint({ x: p.x - STICKY_SIZE / 2, y: p.y - STICKY_SIZE / 2 });
        this.finishCreate(makeSticky(at, nextZ(store), u.stickyColor), true);
        return;
      }
      case 'text': {
        this.finishCreate(makeText(this.snapPoint({ x: p.x, y: p.y - 15 }), nextZ(store)), true);
        return;
      }
      case 'pen':
      case 'smartpen':
      case 'highlighter': {
        this.board.beginGesture();
        const marker = u.tool === 'highlighter';
        const { color, size } = currentPreset(marker ? 'highlighter' : 'pen');
        const stroke = { color, size, opacity: marker ? 0.4 : 1 };
        this.g = { kind: 'pen', points: [p.x, p.y], smart: u.tool === 'smartpen', ...stroke };
        u.setDraft({ kind: 'pen', points: [p.x, p.y], ...stroke });
        break;
      }
      case 'lasso':
        this.g = { kind: 'lasso', points: [p.x, p.y] };
        break;
      case 'line':
      case 'arrow':
        this.g = {
          kind: 'connector',
          start: this.endAt(p, null),
          startScreen: screen,
          arrow: u.tool === 'arrow',
        };
        break;
      case 'eraser':
      case 'spoteraser': {
        const spot = u.tool === 'spoteraser';
        this.board.beginGesture();
        this.g = { kind: 'eraser', spot, last: p };
        this.eraseAlong(p, p, spot);
        break;
      }
      case 'hand':
        break;
    }
    if (this.g) this.el.setPointerCapture(e.pointerId);
  };

  onPointerMove = (e: PointerEvent) => {
    const screen = this.screen(e);
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) this.touches.set(e.pointerId, screen);
    if (this.g?.kind === 'pinch') {
      if (this.touches.size < 2) return;
      const { startDist, startMid, startCam } = this.g;
      const { dist: d, mid } = this.pinchMetrics();
      const zoomed = zoomAt(startCam, startMid, startCam.zoom * (d / startDist));
      vp().setCamera({ ...zoomed, x: zoomed.x + mid.x - startMid.x, y: zoomed.y + mid.y - startMid.y });
      return;
    }
    const p = this.world(e);
    this.lastWorld = p;
    this.board.presence.setCursor(p);
    const u = ui();
    const g = this.g;
    const zoom = vp().camera.zoom;

    if (!g) {
      if (u.tool === 'eraser' || u.tool === 'spoteraser') {
        u.setDraft({ kind: 'eraser', x: p.x, y: p.y, r: eraserRadius(u.tool === 'spoteraser') });
      } else if (u.tool === 'line' || u.tool === 'arrow') this.endAt(p, null);
      return;
    }

    switch (g.kind) {
      case 'pan': {
        // Tiny movements during a right-click shouldn't cancel the menu.
        if (g.rightClick && dist(screen, g.rightClick.start) < DRAG_THRESHOLD) return;
        if (g.rightClick) {
          g.last = g.rightClick.start;
          g.rightClick = undefined;
          u.setPanning(true);
        }
        vp().panBy(screen.x - g.last.x, screen.y - g.last.y);
        g.last = screen;
        break;
      }
      case 'move': {
        if (!g.started) {
          if (dist(screen, g.startScreen) < DRAG_THRESHOLD || g.origins.size === 0) return;
          g.started = true;
          this.board.beginGesture();
          u.setInteracting(true);
          // Moving a frame carries everything fully inside it.
          for (const o of [...g.origins.values()]) {
            if (o.type !== 'frame') continue;
            const frameRect = this.board.store.getBounds(o.id);
            if (!frameRect) continue;
            for (const id of this.board.store.query(frameRect)) {
              const child = this.board.store.get(id);
              const b = this.board.store.getBounds(id);
              if (child && b && !child.locked && child.type !== 'frame' && rectContainsRect(frameRect, b))
                g.origins.set(id, child);
            }
          }
          const moving = new Set(g.origins.keys());
          g.targets = this.board.store
            .query(vp().visibleRect())
            .filter((id) => !moving.has(id) && this.board.store.get(id)?.type !== 'connector')
            .map((id) => this.board.store.getBounds(id)!)
            .filter(Boolean);
        }
        let dx = p.x - g.startWorld.x;
        let dy = p.y - g.startWorld.y;
        const prefs = usePrefs.getState();
        let guides: Guide[] = [];
        if (g.startBounds && !e.altKey) {
          const moved = { ...g.startBounds, x: g.startBounds.x + dx, y: g.startBounds.y + dy };
          const snap = prefs.snapObjects
            ? snapRect(moved, g.targets, SNAP_DISTANCE / zoom)
            : { dx: 0, dy: 0, guides: [] };
          dx += snap.dx;
          dy += snap.dy;
          guides = snap.guides;
          if (prefs.snapToGrid) {
            if (snap.dx === 0) dx += snapToGrid(moved.x, GRID_SIZE) - moved.x;
            if (snap.dy === 0) dy += snapToGrid(moved.y, GRID_SIZE) - moved.y;
          }
        }
        u.setGuides(guides);
        const origins = g.origins;
        this.schedule(() => moveFrom(this.board, origins, dx, dy));
        break;
      }
      case 'marquee': {
        if (dist(screen, g.startScreen) < 2) return;
        const rect = rectFromPoints(g.start, p);
        u.setMarquee(rect);
        const base = g.base;
        this.schedule(() => {
          const store = this.board.store;
          const ids = store.query(rect).filter((id) => {
            if (store.get(id)?.type !== 'frame') return true;
            const b = store.getBounds(id);
            return !!b && rectContainsRect(rect, b);
          });
          const hits = expandGroups(store, ids);
          ui().select(uniq([...base, ...hits]));
        });
        break;
      }
      case 'shape': {
        const end = this.snapPoint(p);
        let rect = rectFromPoints(g.start, end);
        if (e.shiftKey && g.shape !== 'frame' && g.shape !== 'startview') {
          const s = Math.max(rect.w, rect.h);
          rect = { ...rect, w: s, h: s };
        } else if (isShapeTool(g.shape) && usePrefs.getState().suggestObjectSize) {
          // Suggest object size: lock onto the size of an existing shape of the same kind.
          const threshold = SNAP_DISTANCE / zoom;
          for (const o of this.board.store.all()) {
            if (o.type !== g.shape) continue;
            if (Math.abs(rect.w - o.w) < threshold) rect = { ...rect, w: o.w };
            if (Math.abs(rect.h - o.h) < threshold) rect = { ...rect, h: o.h };
          }
        }
        if (end.x < g.start.x) rect = { ...rect, x: g.start.x - rect.w };
        if (end.y < g.start.y) rect = { ...rect, y: g.start.y - rect.h };
        u.setDraft({ kind: 'shape', shape: g.shape, rect });
        break;
      }
      case 'pen': {
        const events = e.getCoalescedEvents?.() ?? [e];
        for (const ce of events.length ? events : [e]) {
          const wp = this.world(ce);
          const n = g.points.length;
          if (Math.hypot(wp.x - g.points[n - 2]!, wp.y - g.points[n - 1]!) * zoom >= 1.5)
            g.points.push(wp.x, wp.y);
        }
        const points = g.points;
        const { color, size, opacity } = g;
        this.schedule(() => ui().setDraft({ kind: 'pen', points: [...points], color, size, opacity }));
        break;
      }
      case 'lasso': {
        const n = g.points.length;
        if (Math.hypot(p.x - g.points[n - 2]!, p.y - g.points[n - 1]!) * zoom < 3) return;
        g.points.push(p.x, p.y);
        const points = g.points;
        this.schedule(() => ui().setDraft({ kind: 'lasso', points: [...points] }));
        break;
      }
      case 'connector': {
        // Holding off until it's a real drag, since a click on a connect dot means something else.
        if (g.fromDot && !u.draft && dist(screen, g.startScreen) < DRAG_THRESHOLD) return;
        const startId = g.start.kind === 'attached' ? g.start.objectId : null;
        u.setDraft({
          kind: 'connector',
          start: g.start,
          end: this.endAt(p, startId, !!g.fromDot),
          arrow: g.arrow,
          curved: !!g.fromDot,
        });
        break;
      }
      case 'reattach': {
        const c = this.board.store.get(g.id);
        if (c?.type !== 'connector') return;
        if (!g.started) {
          if (dist(screen, g.startScreen) < DRAG_THRESHOLD) return;
          g.started = true;
          this.board.beginGesture();
          u.setInteracting(true);
        }
        const other = g.which === 'start' ? c.end : c.start;
        const end = this.endAt(p, other.kind === 'attached' ? other.objectId : null);
        const { id, which } = g;
        this.schedule(() => patch(this.board, id, { [which]: end }));
        break;
      }
      case 'bend': {
        const c = this.board.store.get(g.id);
        if (c?.type !== 'connector') return;
        if (!g.started) {
          if (dist(screen, g.startScreen) < DRAG_THRESHOLD) return;
          g.started = true;
          this.board.beginGesture();
          u.setInteracting(true);
        }
        const r = this.board.store.resolve({ ...c, bend: null });
        if (!r) return;
        const x = p.x - (r.start.x + r.end.x) / 2;
        const y = p.y - (r.start.y + r.end.y) / 2;
        const bend = Math.hypot(x, y) * zoom < BEND_SNAP ? null : { x, y };
        const { id } = g;
        this.schedule(() => patch(this.board, id, { bend }));
        break;
      }
      case 'eraser': {
        u.setDraft({ kind: 'eraser', x: p.x, y: p.y, r: eraserRadius(g.spot) });
        this.eraseAlong(g.last, p, g.spot);
        g.last = p;
        break;
      }
    }
  };

  onPointerUp = (e: PointerEvent) => {
    const wasTouch = e.pointerType === 'touch' && this.touches.delete(e.pointerId);
    const g = this.g;
    if (g?.kind === 'pinch') {
      if (this.touches.size < 2) this.g = null;
      return;
    }
    if (wasTouch && e.type === 'pointerup') {
      const p = this.world(e);
      const now = performance.now();
      const tap =
        !g || (g.kind === 'move' && !g.started) || (g.kind === 'pan' && dist(g.last, this.screen(e)) < 10);
      if (
        tap &&
        this.lastTap &&
        now - this.lastTap.at < DOUBLE_TAP_MS &&
        dist(this.lastTap.p, p) * vp().camera.zoom < 30
      ) {
        this.lastTap = null;
        this.editAt(p);
      } else if (tap) this.lastTap = { at: now, p };
    }
    if (!g) return;
    this.g = null;
    this.flush();
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
    const u = ui();
    const { store } = this.board;

    switch (g.kind) {
      case 'pan':
        u.setPanning(false);
        if (g.rightClick && e.type === 'pointerup')
          this.openContextMenu(g.rightClick.start, g.rightClick.world);
        break;
      case 'move': {
        if (g.started) {
          this.board.endGesture();
          u.setInteracting(false);
          u.setGuides([]);
        } else if (g.wasSelected) {
          // Plain click inside a multi-selection narrows to the clicked group; shift-click toggles it off.
          if (g.shift) u.select(u.selectedIds.filter((id) => !g.hitGroup.includes(id)));
          else if (u.selectedIds.length > g.hitGroup.length) u.select(g.hitGroup);
        }
        break;
      }
      case 'marquee':
        u.setMarquee(null);
        break;
      case 'shape': {
        const draft = u.draft;
        u.setDraft(null);
        const zoom = vp().camera.zoom;
        let rect = draft?.kind === 'shape' ? draft.rect : null;
        const tiny = !rect || (rect.w * zoom < DRAG_THRESHOLD && rect.h * zoom < DRAG_THRESHOLD);
        if (g.shape === 'startview') {
          u.setTool('select');
          if (rect && !tiny) setStartView(this.board, rect);
          break;
        }
        if (!rect || tiny) {
          const { w, h } = g.shape === 'frame' ? DEFAULT_FRAME_SIZE : defaultShapeSize(g.shape);
          rect = { x: g.start.x - w / 2, y: g.start.y - h / 2, w, h };
        }
        rect = { ...rect, w: Math.max(rect.w, 8), h: Math.max(rect.h, 8) };
        if (g.shape === 'frame') {
          const n = [...store.all()].filter((o) => o.type === 'frame').length + 1;
          this.finishCreate(makeFrame(rect, nextZ(store), `Frame ${n}`), false);
        } else {
          this.finishCreate(makeShape(g.shape, rect, nextZ(store)), false);
        }
        break;
      }
      case 'pen': {
        u.setDraft(null);
        const pts = g.points.length === 2 ? [...g.points, g.points[0]! + 0.5, g.points[1]! + 0.5] : g.points;
        const z = nextZ(store);
        const seen = g.smart ? recognizeStroke(pts, SMART_MIN_SIZE / vp().camera.zoom) : null;
        if (seen?.kind === 'line') {
          const end = (v: Vec): ConnectorEnd => ({ kind: 'point', x: v.x, y: v.y });
          const line = makeConnector(end(seen.start), end(seen.end), z, { arrow: false, stroke: g.color });
          addObjects(this.board, [{ ...line, strokeWidth: g.size }]);
        } else if (seen) {
          const shape = makeShape(seen.kind, seen.rect, z, { fill: 'transparent', stroke: g.color });
          addObjects(this.board, [{ ...shape, strokeWidth: g.size }]);
        } else {
          addObjects(this.board, [makePen(pts, z, g.color, g.size, g.opacity)]);
        }
        this.board.endGesture();
        break;
      }
      case 'lasso': {
        u.setDraft(null);
        this.selectInLasso(g.points);
        break;
      }
      case 'connector': {
        u.setDraft(null);
        u.setAttachHover(null);
        const p = this.world(e);
        if (dist(this.screen(e), g.startScreen) < 8) {
          const from = g.fromDot && store.get(g.fromDot.id);
          if (from && g.fromDot && e.type === 'pointerup') {
            const added = addConnectedCopy(this.board, from, g.fromDot.side);
            if (added) u.select([added]);
          }
          break;
        }
        const startId = g.start.kind === 'attached' ? g.start.objectId : null;
        const end = this.endAt(p, startId, !!g.fromDot);
        u.setAttachHover(null);
        const line = makeConnector(g.start, end, nextZ(store), { arrow: g.arrow });
        this.finishCreate(g.fromDot ? { ...line, routing: 'curved' } : line, false);
        break;
      }
      case 'reattach':
        u.setAttachHover(null);
        if (g.started) {
          this.board.endGesture();
          u.setInteracting(false);
        }
        break;
      case 'bend':
        if (g.started) {
          this.board.endGesture();
          u.setInteracting(false);
        }
        break;
      case 'eraser':
        this.board.endGesture();
        break;
    }
  };

  /** Right button is reserved for panning on the canvas. */
  private onContextMenu = (e: MouseEvent) => {
    if (!isEditableTarget(e)) e.preventDefault();
  };

  private onPointerLeave = () => {
    if (this.g) return;
    this.board.presence.setCursor(null);
    if (ui().draft?.kind === 'eraser') ui().setDraft(null);
  };

  /** Erase along the path the pointer just moved, so a fast swipe doesn't skip strokes. */
  private eraseAlong(from: Vec, to: Vec, spot: boolean) {
    const r = eraserRadius(spot);
    const steps = Math.max(1, Math.ceil(dist(from, to) / r));
    const centers: Vec[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      centers.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    }
    const { store, objects } = this.board;
    if (!spot) {
      for (const c of centers) {
        const hit = hitTest(store, c, r, (o) => o.type === 'pen' && !o.locked);
        if (hit) deleteObjects(this.board, [hit.id]);
      }
      return;
    }
    const near = expandRect(rectFromPoints(from, to), r + 64);
    const replaced: [string, BoardObject[]][] = [];
    for (const id of store.query(near)) {
      const o = store.get(id);
      if (o?.type !== 'pen' || o.locked) continue;
      const local = centers.map((c) => worldToLocal(o, c));
      const pieces = eraseFromStroke(o.points, local, r + o.size / 2);
      if (!pieces) continue;
      replaced.push([
        id,
        pieces.map((piece) => {
          // Pieces are stored in world space, which also settles any rotation the stroke had.
          const world = piece.flatMap((_, i) => {
            if (i % 2) return [];
            const w = localToWorld(o, { x: piece[i]!, y: piece[i + 1]! });
            return [w.x, w.y];
          });
          return { ...makePen(world, o.z, o.stroke, o.size, o.opacity), groupId: o.groupId };
        }),
      ]);
    }
    if (!replaced.length) return;
    this.board.transact(() => {
      for (const [id, pieces] of replaced) {
        objects.delete(id);
        for (const piece of pieces) insertObject(objects, piece);
      }
    });
    const gone = new Set(replaced.map(([id]) => id));
    const u = ui();
    if (u.selectedIds.some((id) => gone.has(id))) u.select(u.selectedIds.filter((id) => !gone.has(id)));
  }

  /** Select what the loop encircles: an object's center has to be inside, or for a frame, all of it. */
  private selectInLasso(points: number[]) {
    if (points.length < 6) return;
    const { store } = this.board;
    const xs = points.filter((_, i) => i % 2 === 0);
    const ys = points.filter((_, i) => i % 2 === 1);
    const area = rectFromPoints(
      { x: Math.min(...xs), y: Math.min(...ys) },
      { x: Math.max(...xs), y: Math.max(...ys) },
    );
    const ids = store.query(area).filter((id) => {
      const b = store.getBounds(id);
      if (!b) return false;
      if (store.get(id)?.type === 'frame') {
        return [b.x, b.x + b.w].every((x) => [b.y, b.y + b.h].every((y) => pointInPolygon({ x, y }, points)));
      }
      return pointInPolygon({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, points);
    });
    const u = ui();
    u.select(expandGroups(store, ids));
    if (ids.length) u.setTool('select');
  }

  onDoubleClick = (e: MouseEvent) => {
    if (isEditableTarget(e)) return;
    // Double-clicking a line's middle handle straightens it again.
    const p = this.world(e);
    const mid = ui().tool === 'select' ? this.lineHandleAt(p) : null;
    if (mid) {
      if (!this.board.readOnly) patch(this.board, mid, { bend: null });
      return;
    }
    this.editAt(p);
  };

  onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const v = vp();
    const lineScale = e.deltaMode === 1 ? 20 : 1;
    const mouseMode = usePrefs.getState().navMode === 'mouse';
    // Mouse mode: the wheel zooms (Shift+wheel pans sideways). Trackpad mode: scrolling pans, pinch zooms.
    if (e.ctrlKey || e.metaKey || (mouseMode && !e.shiftKey)) {
      const delta = e.deltaY * lineScale;
      // Pinch gestures send many small deltas, a mouse wheel fewer large ones: keep both feeling similar.
      const rate = Math.abs(delta) < 40 ? 0.01 : 0.0015;
      v.zoomAtPoint(this.screen(e), v.camera.zoom * Math.exp(-delta * rate));
      return;
    }
    let dx = e.deltaX * lineScale;
    let dy = e.deltaY * lineScale;
    if (e.shiftKey && dx === 0) {
      dx = dy;
      dy = 0;
    }
    v.panBy(-dx, -dy);
  };

  // Safari trackpad pinch
  private onGestureStart = (e: Event) => {
    e.preventDefault();
    this.gestureZoom = vp().camera.zoom;
  };
  private onGestureChange = (e: Event & { scale?: number; clientX?: number; clientY?: number }) => {
    e.preventDefault();
    if (this.gestureZoom === null || e.scale === undefined) return;
    const p = this.screen(e as unknown as MouseEvent);
    vp().zoomAtPoint(p, this.gestureZoom * e.scale);
  };
}
