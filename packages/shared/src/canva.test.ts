import { describe, expect, it } from 'vitest';
import { parseCanvaClipboard, type CanvaText } from './model/canvaClipboard';

/** Shaped like a real capture, with made-up text. */
const element = (a: unknown, rect = { A: 10, B: 20, D: 800, C: 100 }) => ({
  ...rect,
  'A?': 'K',
  _: 'x',
  a: { C: a },
});

const parseOne = (a: unknown) => {
  const parsed = parseCanvaClipboard(JSON.stringify({ a: 5, A: [element(a)], B: 1920, C: 1080 }));
  return parsed![0] as CanvaText;
};

describe('parseCanvaClipboard', () => {
  it('reads position, size and a single style', () => {
    const t = parseOne({
      A: ['Title\n'],
      B: [6],
      C: [
        { C: 'FONTID,1', G: '56.5px', I: 'bold', M: '#112233', Y: '1.4em', c: 'center' },
        { D: true, H: true, J: true, N: true, Z: true, d: true },
      ],
      D: [0, 6],
    });
    expect(t.rect).toEqual({ x: 20, y: 10, w: 800, h: 100 });
    expect(t.paragraphs).toHaveLength(1);
    expect(t.paragraphs[0]!.align).toBe('center');
    expect(t.paragraphs[0]!.runs).toEqual([
      {
        text: 'Title',
        fontId: 'FONTID',
        size: 56.5,
        bold: true,
        italic: false,
        underline: false,
        strike: false,
        color: '#112233',
        lineHeight: 1.4,
      },
    ]);
  });

  it('splits style changes inside a line, where each change clears or sets keys', () => {
    const t = parseOne({
      A: ['BY: Name   \n'],
      B: [12],
      C: [
        { G: '32px', I: 'bold', M: '#aa0000', c: 'start' },
        { J: true, M: '#222222' },
        { I: 'bold', M: '#aa0000' },
        { J: true, M: '#222222' },
        { H: true, N: true, d: true },
      ],
      D: [0, 4, 4, 3, 1],
    });
    expect(t.paragraphs[0]!.runs.map((r) => [r.text, r.bold, r.color])).toEqual([
      ['BY: ', true, '#aa0000'],
      ['Name', false, '#222222'],
      ['   ', true, '#aa0000'],
    ]);
  });

  it('separates paragraphs, each with its own style and alignment', () => {
    const t = parseOne({
      A: ['First line\n', 'Second\n'],
      B: [18],
      C: [
        { G: '32px', M: '#111111', c: 'end' },
        { G: '30px', M: '#555555', c: 'start' },
        { H: true, N: true, d: true },
      ],
      D: [0, 11, 7],
    });
    expect(t.paragraphs.map((p) => p.align)).toEqual(['right', 'left']);
    expect(t.paragraphs.map((p) => p.runs.map((r) => [r.text, r.size]))).toEqual([
      [['First line', 32]],
      [['Second', 30]],
    ]);
  });

  it('keeps blank paragraphs, so that spacing survives', () => {
    const t = parseOne({ A: ['a\n', '\n', 'b\n'], B: [5], C: [{ G: '20px' }], D: [0] });
    expect(t.paragraphs.map((p) => p.runs.map((r) => r.text))).toEqual([['a'], [], ['b']]);
  });

  it('reads underline, italic and rotation', () => {
    const parsed = parseCanvaClipboard(
      JSON.stringify({
        A: [
          {
            ...element({
              A: ['Marked\n'],
              B: [7],
              C: [
                { G: '20px', K: 'italic', O: 'underline' },
                { L: true, P: true },
              ],
              D: [0, 7],
            }),
            E: -180,
          },
        ],
      }),
    )![0] as CanvaText;
    expect(parsed.rotation).toBe(-180);
    expect(parsed.paragraphs[0]!.runs[0]).toMatchObject({ italic: true, underline: true, strike: false });
  });

  it('reads pictures as having no image, only a place', () => {
    const parsed = parseCanvaClipboard(
      JSON.stringify({
        A: [{ A: 1, B: 2, C: 3, D: 4, 'A?': 'I', a: { B: { A: { 'A?': 'd', A: 'MEDIAID', B: 1 } } } }],
      }),
    );
    expect(parsed).toEqual([{ kind: 'picture', rect: { x: 2, y: 1, w: 4, h: 3 }, rotation: 0 }]);
  });

  it('reads shapes: their paths, fills, and any text inside', () => {
    const parsed = parseCanvaClipboard(
      JSON.stringify({
        A: [
          {
            A: 10,
            B: 20,
            C: 300,
            D: 400,
            'A?': 'J',
            a: { D: 64, C: 48 },
            b: [{ A: 'M0 0H64V48H0z', B: { C: '#d99a9a' } }, { A: 'M1 1L2 2' }],
            f: [{ A: { C: { A: ['In shape\n'], B: [9], C: [{ G: '20px', c: 'center' }], D: [0] } } }],
          },
        ],
      }),
    );
    expect(parsed![0]).toMatchObject({
      kind: 'shape',
      viewBox: { w: 64, h: 48 },
      paths: [
        { d: 'M0 0H64V48H0z', fill: '#d99a9a' },
        { d: 'M1 1L2 2', fill: null },
      ],
      paragraphs: [{ align: 'center', runs: [{ text: 'In shape' }] }],
    });
  });

  it('reports elements it has no reader for, instead of guessing at them', () => {
    const parsed = parseCanvaClipboard(
      JSON.stringify({ A: [{ A: 1, B: 2, C: 3, D: 4, 'A?': 'Q', a: {} }], B: 1920, C: 1080 }),
    );
    expect(parsed).toEqual([
      { kind: 'other', canvaKind: 'Q', rect: { x: 2, y: 1, w: 4, h: 3 }, rotation: 0 },
    ]);
  });

  it('refuses anything that is not this format', () => {
    expect(parseCanvaClipboard('not json')).toBeNull();
    expect(parseCanvaClipboard('{"foo":1}')).toBeNull();
    expect(parseCanvaClipboard('{"A":[{"A":"x"}]}')).toBeNull();
  });

  it('survives text whose shape changed, as an element it cannot read', () => {
    const parsed = parseCanvaClipboard(
      JSON.stringify({ A: [{ A: 1, B: 2, C: 3, D: 4, 'A?': 'K', a: { C: { A: 'unexpected' } } }] }),
    );
    expect(parsed).toEqual([
      { kind: 'other', canvaKind: 'K', rect: { x: 2, y: 1, w: 4, h: 3 }, rotation: 0 },
    ]);
  });
});
