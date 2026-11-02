import { describe, expect, it } from 'vitest';
import { aabb, corners, localToWorld, rectFromPoints, rectsIntersect, unionRects, worldToLocal } from './box';
import {
  anchorFromPoint,
  clipToOutline,
  nearestSideAnchor,
  resolveConnector,
  type AttachTarget,
  curvePoints,
  elbowPoints,
  polylineMidpoint,
} from './connectors';
import { SHAPE_VERTICES, shapeTextBox } from './shapes';
import { snapRect, snapToGrid } from './snap';
import { fitFontSize, wrapText, type MeasureText } from './textFit';
import {
  fitRect,
  followCamera,
  nextZoomStep,
  screenToWorld,
  visibleWorldRect,
  worldToScreen,
  zoomAt,
} from './viewport';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('box', () => {
  const b = { x: 100, y: 50, w: 40, h: 20, rotation: 90 };

  it('round-trips local/world', () => {
    const p = { x: 13, y: 7 };
    const back = worldToLocal(b, localToWorld(b, p));
    close(back.x, p.x);
    close(back.y, p.y);
  });

  it('rotates around the origin (Konva model)', () => {
    const [, topRight] = corners(b);
    close(topRight.x, 100);
    close(topRight.y, 90);
  });

  it('computes rotated AABB', () => {
    const r = aabb(b);
    close(r.x, 80);
    close(r.y, 50);
    close(r.w, 20);
    close(r.h, 40);
  });

  it('unions and intersects', () => {
    expect(unionRects([])).toBeNull();
    expect(
      unionRects([rectFromPoints({ x: 10, y: 10 }, { x: 0, y: 0 }), { x: 5, y: 5, w: 20, h: 1 }]),
    ).toEqual({
      x: 0,
      y: 0,
      w: 25,
      h: 10,
    });
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0, w: 5, h: 5 })).toBe(false);
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 10, w: 5, h: 5 })).toBe(true);
  });
});

describe('viewport', () => {
  it('keeps the point under the cursor fixed when zooming', () => {
    const cam = { x: 30, y: -20, zoom: 1.5 };
    const p = { x: 400, y: 300 };
    const before = screenToWorld(cam, p);
    const next = zoomAt(cam, p, 3);
    const after = screenToWorld(next, p);
    close(before.x, after.x);
    close(before.y, after.y);
    expect(next.zoom).toBe(3);
  });

  it('clamps zoom', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 100).zoom).toBe(8);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 0).zoom).toBe(0.05);
  });

  it('fits a rect centered in the viewport', () => {
    const cam = fitRect({ x: 1000, y: 1000, w: 400, h: 200 }, 800, 600, 0, 10);
    expect(cam.zoom).toBe(2);
    const c = worldToScreen(cam, { x: 1200, y: 1100 });
    close(c.x, 400);
    close(c.y, 300);
    const vis = visibleWorldRect(cam, 800, 600);
    close(vis.x, 1000);
    close(vis.w, 400);
  });

  it('follows a peer by showing the same world area on a different-sized screen', () => {
    const peer = { x: -200, y: -100, zoom: 2, w: 800, h: 600 }; // sees world (100,50)-(500,350)
    const cam = followCamera(peer, 400, 300);
    const vis = visibleWorldRect(cam, 400, 300);
    close(cam.zoom, 1);
    close(vis.x, 100);
    close(vis.y, 50);
    close(vis.w, 400);
  });

  it('steps zoom', () => {
    expect(nextZoomStep(1, 1)).toBe(1.25);
    expect(nextZoomStep(1, -1)).toBe(0.75);
    expect(nextZoomStep(0.9, -1)).toBe(0.75);
  });
});

describe('connectors', () => {
  const rect: AttachTarget = { x: 0, y: 0, w: 100, h: 50, rotation: 0, outline: 'rect' };
  const ellipse: AttachTarget = { x: 0, y: 0, w: 100, h: 50, rotation: 0, outline: 'ellipse' };

  it('clips to rect and ellipse outlines', () => {
    const r = clipToOutline(rect, { x: 500, y: 25 });
    close(r.x, 100);
    close(r.y, 25);
    const e = clipToOutline(ellipse, { x: 50, y: -500 });
    close(e.x, 50);
    close(e.y, 0);
  });

  it('clips to triangle outline', () => {
    const tri: AttachTarget = { x: 0, y: 0, w: 100, h: 100, rotation: 0, outline: 'triangle' };
    const bottom = clipToOutline(tri, { x: 50, y: 1000 });
    close(bottom.x, 50);
    close(bottom.y, 100);
  });

  it('clips to every polygon outline, staying inside the box', () => {
    for (const outline of Object.keys(SHAPE_VERTICES)) {
      const target: AttachTarget = { x: 0, y: 0, w: 100, h: 100, rotation: 0, outline };
      for (const toward of [
        { x: 1000, y: 50 },
        { x: 50, y: 1000 },
        { x: -500, y: -500 },
      ]) {
        const p = clipToOutline(target, toward);
        expect(p.x).toBeGreaterThanOrEqual(-1e-6);
        expect(p.x).toBeLessThanOrEqual(100 + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(-1e-6);
        expect(p.y).toBeLessThanOrEqual(100 + 1e-6);
      }
    }
    // A diamond's right tip, not the box edge's corner.
    const d = clipToOutline(
      { x: 0, y: 0, w: 100, h: 100, rotation: 0, outline: 'diamond' },
      { x: 75, y: 25 },
    );
    close(d.x, 75);
    close(d.y, 25);
  });

  it('keeps shape text boxes inside the shape box', () => {
    const b = shapeTextBox('diamond', 200, 100, 4);
    expect(b.x).toBeGreaterThan(0);
    expect(b.x + b.w).toBeLessThan(200);
    expect(shapeTextBox('rect', 200, 100, 10)).toEqual({ x: 10, y: 10, w: 180, h: 80 });
  });

  it('resolves auto-attached ends toward each other and follows moved targets', () => {
    const targets: Record<string, AttachTarget> = {
      a: rect,
      b: { ...rect, x: 300 },
    };
    const conn = {
      start: { kind: 'attached' as const, objectId: 'a', anchor: 'auto' as const },
      end: { kind: 'attached' as const, objectId: 'b', anchor: 'auto' as const },
      routing: 'straight' as const,
    };
    const r = resolveConnector(conn, (id) => targets[id])!;
    close(r.start.x, 100);
    close(r.end.x, 300);
    targets.b = { ...rect, x: 0, y: 300 };
    const moved = resolveConnector(conn, (id) => targets[id])!;
    close(moved.start.y, 50);
    close(moved.end.y, 300);
  });

  it('returns null when an attached object is missing', () => {
    expect(
      resolveConnector(
        {
          start: { kind: 'attached', objectId: 'gone', anchor: 'auto' },
          end: { kind: 'point', x: 0, y: 0 },
          routing: 'straight',
        },
        () => undefined,
      ),
    ).toBeNull();
  });

  it('produces elbow routing points', () => {
    const r = resolveConnector(
      { start: { kind: 'point', x: 0, y: 0 }, end: { kind: 'point', x: 100, y: 40 }, routing: 'elbow' },
      () => undefined,
    )!;
    expect(r.points).toEqual([0, 0, 50, 0, 50, 40, 100, 40]);
  });

  it('finds side anchors and fixed anchors on rotated boxes', () => {
    expect(nearestSideAnchor(rect, { x: 98, y: 26 }, 5)).toEqual([1, 0.5]);
    expect(nearestSideAnchor(rect, { x: 50, y: 25 }, 5)).toBeNull();
    const rotated = { ...rect, rotation: 45 };
    const p = localToWorld(rotated, { x: 25, y: 10 });
    const [nx, ny] = anchorFromPoint(rotated, p);
    close(nx, 0.25);
    close(ny, 0.2);
  });
});

describe('snap', () => {
  it('snaps to grid', () => {
    expect(snapToGrid(29, 20)).toBe(20);
    expect(snapToGrid(31, 20)).toBe(40);
    expect(snapToGrid(-11, 20)).toBe(-20);
  });

  it('snaps edges and centers to nearby targets with guides', () => {
    const target = { x: 0, y: 0, w: 100, h: 100 };
    const res = snapRect({ x: 103, y: 200, w: 50, h: 50 }, [target], 5);
    expect(res.dx).toBe(-3);
    expect(res.dy).toBe(0);
    expect(res.guides).toContainEqual({ orientation: 'v', pos: 100, from: 0, to: 250 });
  });

  it('prefers the closest candidate and ignores far ones', () => {
    const res = snapRect({ x: 48, y: 500, w: 4, h: 4 }, [{ x: 0, y: 0, w: 100, h: 100 }], 3);
    // center 50 aligns with target center 50 exactly
    expect(res.dx).toBe(0);
    expect(res.guides.some((g) => g.orientation === 'v' && g.pos === 50)).toBe(true);
    expect(snapRect({ x: 200, y: 200, w: 10, h: 10 }, [{ x: 0, y: 0, w: 10, h: 10 }], 3)).toEqual({
      dx: 0,
      dy: 0,
      guides: [],
    });
  });
});

describe('text fit', () => {
  // Monospace-ish: every char is 0.6em wide.
  const measure: MeasureText = (t, size) => t.length * size * 0.6;

  it('wraps words and breaks long words', () => {
    expect(wrapText('hello world foo', 60, 10, measure)).toEqual(['hello', 'world foo']);
    expect(wrapText('abcdefghij', 30, 10, measure)).toEqual(['abcde', 'fghij']);
    expect(wrapText('a\nb', 100, 10, measure)).toEqual(['a', 'b']);
  });

  it('shrinks font as text grows', () => {
    const short = fitFontSize('Hi', 180, 180, measure);
    const long = fitFontSize('This is a much longer sticky note that needs to wrap a lot', 180, 180, measure);
    expect(short).toBe(48);
    expect(long).toBeLessThan(short);
    const lines = wrapText('This is a much longer sticky note that needs to wrap a lot', 180, long, measure);
    expect(lines.length * long * 1.25).toBeLessThanOrEqual(180);
  });
});

describe('line routes', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 200, y: 100 };
  const right = { x: 1, y: 0 };
  const left = { x: -1, y: 0 };
  const down = { x: 0, y: 1 };
  const up = { x: 0, y: -1 };

  it('elbows run across, turn once in the middle, and bends move that turn', () => {
    expect(elbowPoints(a, b, right, left)).toEqual([0, 0, 100, 0, 100, 100, 200, 100]);
    expect(elbowPoints(a, b, right, left, { x: 30, y: 0 })).toEqual([0, 0, 130, 0, 130, 100, 200, 100]);
    expect(elbowPoints(a, b, down, up)).toEqual([0, 0, 0, 50, 200, 50, 200, 100]);
  });

  it('elbows need only one corner when the ends face across each other', () => {
    expect(elbowPoints(a, b, right, up)).toEqual([0, 0, 200, 0, 200, 100]);
    expect(elbowPoints(a, b, down, left)).toEqual([0, 0, 0, 100, 200, 100]);
  });

  it('curves leave and arrive along the directions given', () => {
    const pts = curvePoints(a, b, right, left);
    expect(pts.slice(0, 2)).toEqual([0, 0]);
    expect(pts.slice(-2)).toEqual([200, 100]);
    expect(Math.abs(pts[3]!)).toBeLessThan(Math.abs(pts[2]!) / 2); // starts out flat
    const n = pts.length;
    expect(Math.abs(pts[n - 1]! - pts[n - 3]!)).toBeLessThan(Math.abs(pts[n - 2]! - pts[n - 4]!)); // and arrives flat
  });

  it('a bent curve passes through the point it was pulled to', () => {
    const through = { x: 50, y: 200 };
    const pts = curvePoints(a, b, right, left, through);
    let closest = Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      closest = Math.min(closest, Math.hypot(pts[i]! - through.x, pts[i + 1]! - through.y));
    }
    expect(closest).toBeLessThan(0.001);
  });

  it('finds the middle by length, not by point count', () => {
    expect(polylineMidpoint([0, 0, 100, 0])).toEqual({ x: 50, y: 0 });
    expect(polylineMidpoint([0, 0, 10, 0, 10, 90])).toEqual({ x: 10, y: 40 });
    expect(polylineMidpoint([5, 5])).toEqual({ x: 5, y: 5 });
  });

  it('resolves attached lines out of the side they are anchored to, even when rotated', () => {
    const shapes: Record<string, AttachTarget> = {
      s: { x: 0, y: 0, w: 100, h: 100, rotation: 0, outline: 'rect' },
      e: { x: 300, y: 200, w: 100, h: 100, rotation: 0, outline: 'rect' },
    };
    const get = (id: string) => shapes[id];
    const r = resolveConnector(
      {
        start: { kind: 'attached', objectId: 's', anchor: [1, 0.5] },
        end: { kind: 'attached', objectId: 'e', anchor: [0, 0.5] },
        routing: 'elbow',
      },
      get,
    )!;
    expect(r.points).toEqual([100, 50, 200, 50, 200, 250, 300, 250]);

    shapes.s = { ...shapes.s!, rotation: 90 };
    const rotated = resolveConnector(
      {
        start: { kind: 'attached', objectId: 's', anchor: [1, 0.5] },
        end: { kind: 'point', x: 500, y: 500 },
        routing: 'curved',
      },
      get,
    )!;
    // Rotated 90 degrees around its corner, the shape's right side now faces down.
    expect(rotated.points[3]!).toBeGreaterThan(rotated.points[1]!);
    expect(Math.abs(rotated.points[2]! - rotated.points[0]!)).toBeLessThan(
      Math.abs(rotated.points[3]! - rotated.points[1]!),
    );
  });

  it('puts the handle on the line where it was pulled to, for every route', () => {
    const ends = {
      start: { kind: 'point', x: 0, y: 0 },
      end: { kind: 'point', x: 200, y: 100 },
    } as const;
    const at = (routing: 'straight' | 'curved' | 'elbow', bend: { x: number; y: number } | null) =>
      resolveConnector({ ...ends, routing, bend }, () => undefined)!.mid;
    expect(at('straight', null)).toEqual({ x: 100, y: 50 });
    expect(at('straight', { x: 10, y: -80 })).toEqual({ x: 110, y: -30 });
    expect(at('curved', { x: 10, y: -80 })).toEqual({ x: 110, y: -30 });
    // A bend moves an elbow's middle segment sideways, and the handle stays in the middle of that segment.
    expect(at('elbow', null)).toEqual({ x: 100, y: 50 });
    expect(at('elbow', { x: 30, y: 999 })).toEqual({ x: 130, y: 50 });
  });

  it('keeps a bend relative, so that it follows when the ends move', () => {
    const bend = { x: 0, y: 40 };
    const line = (x: number) =>
      resolveConnector(
        {
          start: { kind: 'point', x, y: 0 },
          end: { kind: 'point', x: x + 100, y: 0 },
          routing: 'straight',
          bend,
        },
        () => undefined,
      )!.points;
    expect(line(0)).toEqual([0, 0, 50, 40, 100, 0]);
    expect(line(500)).toEqual([500, 0, 550, 40, 600, 0]);
  });
});
