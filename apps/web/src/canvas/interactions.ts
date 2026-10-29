import {
  dist,
  hasText,
  makeConnector,
  makePen,
  makeShape,
  makeSticky,
  makeText,
  nearestSideAnchor,
  rectFromPoints,
  screenToWorld,
  snapRect,
  snapToGrid,
  DEFAULT_SHAPE_SIZE,
  STICKY_SIZE,
  type BoardObject,
  type ConnectorEnd,
  type Rect,
  type ShapeKind,
  type Vec,
} from '@canvasly/shared';
import Konva from 'konva';
import type { Board } from '../doc/board';
import { addObjects, deleteObjects, expandGroups, moveFrom, nextZ, patch, selectionBounds } from '../doc/ops';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { hitTest } from './hitTest';

export const GRID_SIZE = 20;
const DRAG_THRESHOLD = 4; // screen px
const SNAP_DISTANCE = 6; // screen px

type Gesture =
  | { kind: 'pan'; last: Vec }
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
  | { kind: 'shape'; shape: ShapeKind; start: Vec }
  | { kind: 'pen'; points: number[] }
  | { kind: 'connector'; start: ConnectorEnd; startScreen: Vec; arrow: boolean }
  | { kind: 'reattach'; id: string; which: 'start' | 'end'; started: boolean; startScreen: Vec }
  | { kind: 'eraser' };

const ui = () => useUI.getState();
const vp = () => useViewport.getState();
const uniq = (ids: string[]) => [...new Set(ids)];

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
    return ui().snapToGrid ? { x: snapToGrid(p.x, GRID_SIZE), y: snapToGrid(p.y, GRID_SIZE) } : p;
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
  private endAt(p: Vec, excludeId: string | null): ConnectorEnd {
    const zoom = vp().camera.zoom;
    const target = hitTest(
      this.board.store,
      p,
      0,
      (o) => o.type !== 'connector' && o.type !== 'pen' && o.id !== excludeId,
    );
    ui().setAttachHover(target?.id ?? null);
    if (target && target.type !== 'connector') {
      const anchor = nearestSideAnchor(target, p, 12 / zoom) ?? 'auto';
      return { kind: 'attached', objectId: target.id, anchor };
    }
    const s = this.snapPoint(p);
    return { kind: 'point', x: s.x, y: s.y };
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
    if (this.g || isEditableTarget(e)) return;
    const u = ui();
    const screen = this.screen(e);
    const p = this.world(e);
    this.lastWorld = p;
    if (u.editingId) u.setEditing(null);

    // Overlay widgets drawn by Konva take precedence.
    const node = this.getStage()?.getIntersection(screen);
    if (node) {
      const handle = node.getAttr('connectorHandle') as { id: string; which: 'start' | 'end' } | undefined;
      if (handle && e.button === 0) {
        this.g = { kind: 'reattach', ...handle, started: false, startScreen: screen };
        this.el.setPointerCapture(e.pointerId);
        return;
      }
      if (node.getParent() instanceof Konva.Transformer) return;
    }
    // Keep focus/text selection where they are (and avoid middle-click autoscroll). Transformer anchors
    // above still need the native mousedown, which this would suppress.
    e.preventDefault();

    // Middle mouse, Space/hand tool, or right-drag on empty board pans.
    const rightOnEmpty = e.button === 2 && !hitTest(this.board.store, p, 2 / vp().camera.zoom);
    if (e.button === 1 || rightOnEmpty || (e.button === 0 && (u.spacePan || u.tool === 'hand'))) {
      this.g = { kind: 'pan', last: screen };
      u.setPanning(true);
      this.el.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    const { store } = this.board;
    const zoom = vp().camera.zoom;
    switch (u.tool) {
      case 'select': {
        const hit = hitTest(store, p, 2 / zoom);
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
          if (o && !o.locked) origins.set(id, o);
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
      case 'rect':
      case 'ellipse':
      case 'triangle':
        this.g = { kind: 'shape', shape: u.tool, start: this.snapPoint(p) };
        break;
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
        this.board.beginGesture();
        this.g = { kind: 'pen', points: [p.x, p.y] };
        u.setDraft({ kind: 'pen', points: [p.x, p.y] });
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
        this.board.beginGesture();
        this.g = { kind: 'eraser' };
        this.erase(p);
        break;
      case 'hand':
        break;
    }
    if (this.g) this.el.setPointerCapture(e.pointerId);
  };

  onPointerMove = (e: PointerEvent) => {
    const screen = this.screen(e);
    const p = this.world(e);
    this.lastWorld = p;
    this.board.presence.setCursor(p);
    const u = ui();
    const g = this.g;
    const zoom = vp().camera.zoom;

    if (!g) {
      if (u.tool === 'eraser') u.setDraft({ kind: 'eraser', x: p.x, y: p.y, r: 8 / zoom });
      else if (u.tool === 'line' || u.tool === 'arrow') this.endAt(p, null);
      return;
    }

    switch (g.kind) {
      case 'pan': {
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
          const moving = new Set(g.origins.keys());
          g.targets = this.board.store
            .query(vp().visibleRect())
            .filter((id) => !moving.has(id) && this.board.store.get(id)?.type !== 'connector')
            .map((id) => this.board.store.getBounds(id)!)
            .filter(Boolean);
        }
        let dx = p.x - g.startWorld.x;
        let dy = p.y - g.startWorld.y;
        if (g.startBounds && !e.altKey) {
          const moved = { ...g.startBounds, x: g.startBounds.x + dx, y: g.startBounds.y + dy };
          const snap = snapRect(moved, g.targets, SNAP_DISTANCE / zoom);
          dx += snap.dx;
          dy += snap.dy;
          if (u.snapToGrid) {
            if (snap.dx === 0) dx += snapToGrid(moved.x, GRID_SIZE) - moved.x;
            if (snap.dy === 0) dy += snapToGrid(moved.y, GRID_SIZE) - moved.y;
          }
          u.setGuides(snap.guides);
        } else {
          u.setGuides([]);
        }
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
          const hits = expandGroups(this.board.store, this.board.store.query(rect));
          ui().select(uniq([...base, ...hits]));
        });
        break;
      }
      case 'shape': {
        const end = this.snapPoint(p);
        let rect = rectFromPoints(g.start, end);
        if (e.shiftKey) {
          const s = Math.max(rect.w, rect.h);
          rect = {
            x: end.x < g.start.x ? g.start.x - s : g.start.x,
            y: end.y < g.start.y ? g.start.y - s : g.start.y,
            w: s,
            h: s,
          };
        }
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
        this.schedule(() => ui().setDraft({ kind: 'pen', points: [...points] }));
        break;
      }
      case 'connector': {
        const startId = g.start.kind === 'attached' ? g.start.objectId : null;
        u.setDraft({ kind: 'connector', start: g.start, end: this.endAt(p, startId), arrow: g.arrow });
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
      case 'eraser': {
        u.setDraft({ kind: 'eraser', x: p.x, y: p.y, r: 8 / zoom });
        this.erase(p);
        break;
      }
    }
  };

  onPointerUp = (e: PointerEvent) => {
    const g = this.g;
    if (!g) return;
    this.g = null;
    this.flush();
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
    const u = ui();
    const { store } = this.board;

    switch (g.kind) {
      case 'pan':
        u.setPanning(false);
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
        if (!rect || (rect.w * zoom < DRAG_THRESHOLD && rect.h * zoom < DRAG_THRESHOLD)) {
          const { w, h } = g.shape === 'rect' ? DEFAULT_SHAPE_SIZE : { w: 120, h: 120 };
          rect = { x: g.start.x - w / 2, y: g.start.y - h / 2, w, h };
        }
        rect = { ...rect, w: Math.max(rect.w, 8), h: Math.max(rect.h, 8) };
        this.finishCreate(makeShape(g.shape, rect, nextZ(store)), false);
        break;
      }
      case 'pen': {
        u.setDraft(null);
        const pts = g.points.length === 2 ? [...g.points, g.points[0]! + 0.5, g.points[1]! + 0.5] : g.points;
        addObjects(this.board, [makePen(pts, nextZ(store), u.penColor, u.penSize)]);
        this.board.endGesture();
        break;
      }
      case 'connector': {
        u.setDraft(null);
        u.setAttachHover(null);
        const p = this.world(e);
        if (dist(this.screen(e), g.startScreen) < 8) break;
        const startId = g.start.kind === 'attached' ? g.start.objectId : null;
        const end = this.endAt(p, startId);
        u.setAttachHover(null);
        this.finishCreate(makeConnector(g.start, end, nextZ(store), { arrow: g.arrow }), false);
        break;
      }
      case 'reattach':
        u.setAttachHover(null);
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

  private erase(p: Vec) {
    const r = 8 / vp().camera.zoom;
    const hit = hitTest(this.board.store, p, r, (o) => o.type === 'pen' && !o.locked);
    if (hit) deleteObjects(this.board, [hit.id]);
  }

  onDoubleClick = (e: MouseEvent) => {
    const u = ui();
    if (u.tool !== 'select' || isEditableTarget(e)) return;
    const hit = hitTest(this.board.store, this.world(e), 2 / vp().camera.zoom);
    if (hit && hasText(hit) && !hit.locked) {
      u.select([hit.id]);
      u.setEditing(hit.id);
    }
  };

  onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const v = vp();
    const lineScale = e.deltaMode === 1 ? 20 : 1;
    if (e.ctrlKey || e.metaKey) {
      // Trackpad pinch arrives as ctrl+wheel with small deltas; clamp so mouse wheels don't jump.
      const delta = Math.max(-60, Math.min(60, e.deltaY * lineScale));
      v.zoomAtPoint(this.screen(e), v.camera.zoom * Math.exp(-delta * 0.01));
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
