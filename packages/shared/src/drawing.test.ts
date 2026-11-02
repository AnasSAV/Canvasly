import { describe, expect, it } from 'vitest';
import { eraseFromStroke, pointInPolygon, recognizeStroke } from './geometry/strokes';
import { continueList, listKind, toggleList } from './model/textFormat';
import { BoardObject, isSafeLink } from './schemas/objects';
import { makeShape, makeSticky, makeText } from './model/factories';

/** Walk straight between corners, the way a hand-drawn stroke is sampled. */
function polyline(corners: [number, number][], step = 5, wobble = 0): number[] {
  const out: number[] = [];
  let seed = 1;
  const jitter = () => {
    seed = (seed * 16807) % 2147483647;
    return ((seed % 1000) / 1000 - 0.5) * wobble;
  };
  for (let i = 0; i + 1 < corners.length; i++) {
    const [ax, ay] = corners[i]!;
    const [bx, by] = corners[i + 1]!;
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 0; k < n; k++)
      out.push(ax + ((bx - ax) * k) / n + jitter(), ay + ((by - ay) * k) / n + jitter());
  }
  const last = corners[corners.length - 1]!;
  out.push(last[0], last[1]);
  return out;
}

function ellipse(cx: number, cy: number, rx: number, ry: number, wobble = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i <= 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const w = wobble * Math.sin(i * 1.7);
    out.push(cx + (rx + w) * Math.cos(a), cy + (ry + w) * Math.sin(a));
  }
  return out;
}

describe('recognizeStroke', () => {
  it('recognizes lines', () => {
    const r = recognizeStroke(
      polyline(
        [
          [0, 0],
          [200, 100],
        ],
        5,
        2,
      ),
    );
    expect(r?.kind).toBe('line');
  });

  it('recognizes ellipses, even wobbly ones', () => {
    expect(recognizeStroke(ellipse(100, 100, 80, 50))?.kind).toBe('ellipse');
    expect(recognizeStroke(ellipse(100, 100, 60, 60, 3))?.kind).toBe('ellipse');
  });

  it('recognizes rectangles wherever the stroke starts', () => {
    const fromCorner: [number, number][] = [
      [0, 0],
      [200, 0],
      [200, 120],
      [0, 120],
      [0, 0],
    ];
    const fromSide: [number, number][] = [
      [100, 0],
      [200, 0],
      [200, 120],
      [0, 120],
      [0, 0],
      [100, 0],
    ];
    expect(recognizeStroke(polyline(fromCorner, 5, 2))?.kind).toBe('rect');
    expect(recognizeStroke(polyline(fromSide, 5, 2))?.kind).toBe('rect');
  });

  it('recognizes triangles and diamonds', () => {
    const triangle: [number, number][] = [
      [100, 0],
      [200, 160],
      [0, 160],
      [100, 0],
    ];
    const diamond: [number, number][] = [
      [100, 0],
      [200, 80],
      [100, 160],
      [0, 80],
      [100, 0],
    ];
    expect(recognizeStroke(polyline(triangle, 5, 2))?.kind).toBe('triangle');
    expect(recognizeStroke(polyline(diamond, 5, 2))?.kind).toBe('diamond');
  });

  it('leaves anything else as ink', () => {
    const zigzag: [number, number][] = [
      [0, 0],
      [50, 90],
      [100, 0],
      [150, 90],
      [200, 0],
    ];
    expect(recognizeStroke(polyline(zigzag))).toBeNull();
    const downward: [number, number][] = [
      [0, 0],
      [200, 0],
      [100, 160],
      [0, 0],
    ];
    expect(recognizeStroke(polyline(downward, 5, 1))).toBeNull();
    expect(recognizeStroke(ellipse(10, 10, 3, 3))).toBeNull();
    expect(recognizeStroke([0, 0, 1, 1])).toBeNull();
  });
});

describe('eraseFromStroke', () => {
  const stroke = polyline(
    [
      [0, 0],
      [100, 0],
    ],
    10,
  );

  it('splits a stroke around the erased spot', () => {
    const pieces = eraseFromStroke(stroke, [{ x: 50, y: 0 }], 6)!;
    expect(pieces).toHaveLength(2);
    expect(pieces[0]!.at(-2)).toBe(40);
    expect(pieces[1]![0]).toBe(60);
  });

  it('reports an untouched stroke, and drops pieces too short to draw', () => {
    expect(eraseFromStroke(stroke, [{ x: 50, y: 40 }], 6)).toBeNull();
    expect(eraseFromStroke([0, 0, 10, 0], [{ x: 0, y: 0 }], 2)).toEqual([]);
    expect(eraseFromStroke(stroke, [{ x: 50, y: 0 }], 200)).toEqual([]);
  });
});

describe('pointInPolygon', () => {
  it('handles a concave loop', () => {
    const c = [0, 0, 100, 0, 100, 100, 50, 30, 0, 100];
    expect(pointInPolygon({ x: 20, y: 20 }, c)).toBe(true);
    expect(pointInPolygon({ x: 50, y: 80 }, c)).toBe(false);
    expect(pointInPolygon({ x: 200, y: 20 }, c)).toBe(false);
  });
});

describe('lists', () => {
  it('toggles bullets and numbers, skipping blank lines', () => {
    expect(toggleList('a\n\nb', 'bullet')).toBe('• a\n\n• b');
    expect(toggleList('a\nb', 'number')).toBe('1. a\n2. b');
    expect(toggleList('• a\n• b', 'bullet')).toBe('a\nb');
    expect(toggleList('• a\n• b', 'number')).toBe('1. a\n2. b');
    expect(toggleList('', 'bullet')).toBe('• ');
    expect(listKind('1. a\n2. b')).toBe('number');
    expect(listKind('• a\nb')).toBeNull();
  });

  it('continues a list on Enter and renumbers what follows', () => {
    expect(continueList('• a', 3)).toEqual({ text: '• a\n• ', caret: 6 });
    expect(continueList('1. a\n2. b', 4)).toEqual({ text: '1. a\n2. \n3. b', caret: 8 });
    expect(continueList('plain', 5)).toBeNull();
  });

  it('ends the list when Enter is pressed on an empty item', () => {
    expect(continueList('• a\n• ', 6)).toEqual({ text: '• a\n', caret: 4 });
  });
});

describe('text styling', () => {
  it('accepts web and mail links, and drops anything that could run script', () => {
    expect(isSafeLink('https://example.com')).toBe(true);
    expect(isSafeLink('mailto:a@b.co')).toBe(true);
    expect(isSafeLink('javascript:alert(1)')).toBe(false);
    expect(isSafeLink('not a url')).toBe(false);
    const hostile = { ...makeText({ x: 0, y: 0 }, 'a0'), link: 'javascript:alert(1)' };
    expect(BoardObject.parse(hostile)).toMatchObject({ link: null });
  });

  it('defaults objects saved before styling existed', () => {
    const { bold: _b, link: _l, align: _a, ...sticky } = makeSticky({ x: 0, y: 0 }, 'a0');
    expect(BoardObject.parse(sticky)).toMatchObject({ bold: false, link: null, align: 'center' });
    const { highlight: _h, background: _g, ...text } = makeText({ x: 0, y: 0 }, 'a0');
    expect(BoardObject.parse(text)).toMatchObject({ highlight: 'transparent', background: 'transparent' });
    const shape = makeShape('rect', { x: 0, y: 0, w: 10, h: 10 }, 'a0');
    expect(BoardObject.safeParse(shape).success).toBe(true);
  });
});
