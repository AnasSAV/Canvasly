import { z } from 'zod';
import type { BoardObject, ConnectorEnd, FrameObject, ShapeKind } from '../schemas/objects';
import { makeConnector, makeShape, makeSticky, makeText, newId } from './factories';
import { keysAbove } from './zorder';

export const TemplateId = z.enum(['blank', 'kanban', 'retrospective', 'mindmap', 'flowchart']);
export type TemplateId = z.infer<typeof TemplateId>;

export const TEMPLATES: readonly { id: TemplateId; name: string; description: string }[] = [
  { id: 'blank', name: 'Blank', description: 'Start from an empty canvas' },
  { id: 'kanban', name: 'Kanban', description: 'To do, doing and done columns' },
  { id: 'retrospective', name: 'Retrospective', description: 'Went well, to improve, action items' },
  { id: 'mindmap', name: 'Mind map', description: 'A central idea with branches' },
  { id: 'flowchart', name: 'Flowchart', description: 'Start, steps, decision and end' },
];

/** Builds objects in creation order; z keys are assigned at the end so later items paint on top. */
class Builder {
  private items: Omit<BoardObject, 'z'>[] = [];

  add<T extends BoardObject>(o: T): T {
    this.items.push(o);
    return o;
  }

  frame(name: string, x: number, y: number, w: number, h: number, fill = '#ffffff'): FrameObject {
    return this.add({
      id: newId(),
      type: 'frame',
      z: '',
      locked: false,
      groupId: null,
      x,
      y,
      w,
      h,
      rotation: 0,
      name,
      fill,
    });
  }

  sticky(text: string, x: number, y: number, color: string) {
    return this.add({ ...makeSticky({ x, y }, '', color), text });
  }

  shape(
    kind: ShapeKind,
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    stroke: string,
  ) {
    return this.add({ ...makeShape(kind, { x, y, w, h }, '', { fill, stroke }), text });
  }

  text(text: string, x: number, y: number, fontSize: number) {
    return this.add({ ...makeText({ x, y }, '', '#1a1a1a', fontSize), text, w: 800, h: fontSize * 1.25 });
  }

  connect(from: { id: string }, to: { id: string }, arrow = true) {
    const end = (id: string): ConnectorEnd => ({ kind: 'attached', objectId: id, anchor: 'auto' });
    return this.add(makeConnector(end(from.id), end(to.id), '', { arrow }));
  }

  build(): BoardObject[] {
    const keys = keysAbove(null, this.items.length);
    return this.items.map((o, i) => ({ ...o, z: keys[i]! }) as BoardObject);
  }
}

const YELLOW = '#fff9b1';
const GREEN = '#d5f692';
const PINK = '#ffcee0';
const BLUE = '#a6ccf5';
const ORANGE = '#ff9d48';

function kanban(b: Builder) {
  b.text('Team board', 0, -110, 40);
  const columns: [string, string[], string][] = [
    ['To do', ['Write the spec', 'Design review', 'Set up CI'], YELLOW],
    ['Doing', ['Build the canvas', 'Auth flow'], BLUE],
    ['Done', ['Kick-off meeting'], GREEN],
  ];
  columns.forEach(([name, cards, color], i) => {
    const x = i * 460;
    b.frame(name, x, 0, 420, 900, '#f4f5f7');
    cards.forEach((t, j) => b.sticky(t, x + 30, 30 + j * 230, color));
  });
}

function retrospective(b: Builder) {
  b.text('Sprint retrospective', 0, -110, 40);
  const columns: [string, string, string][] = [
    ['Went well', GREEN, 'Shipped on time'],
    ['To improve', PINK, 'Too many meetings'],
    ['Action items', BLUE, 'Async stand-ups'],
  ];
  columns.forEach(([name, color, sample], i) => {
    const x = i * 560;
    b.frame(name, x, 0, 520, 760);
    b.sticky(sample, x + 30, 30, color);
    b.sticky('', x + 270, 30, color);
  });
}

function mindmap(b: Builder) {
  const center = b.shape('ellipse', 'Central idea', -150, -90, 300, 180, '#e5dbff', '#7048e8');
  const branches = ['Goals', 'People', 'Timeline', 'Risks', 'Resources', 'Open questions'];
  branches.forEach((t, i) => {
    const angle = (i / branches.length) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * 520 - 110;
    const y = Math.sin(angle) * 360 - 50;
    const node = b.shape('rect', t, x, y, 220, 100, '#ffffff', '#7048e8');
    b.connect(center, node, false);
  });
}

function flowchart(b: Builder) {
  const start = b.shape('ellipse', 'Start', 0, 0, 220, 100, '#d3f9d8', '#2f9e44');
  const step1 = b.shape('rect', 'Collect input', 0, 200, 220, 100, '#ffffff', '#1a1a1a');
  const decide = b.shape('triangle', 'Valid?', 0, 400, 220, 160, '#fff3bf', '#f08c00');
  const step2 = b.shape('rect', 'Process', 0, 660, 220, 100, '#ffffff', '#1a1a1a');
  const fix = b.shape('rect', 'Ask to fix', 360, 430, 220, 100, '#ffe3e3', '#e03131');
  const end = b.shape('ellipse', 'End', 0, 860, 220, 100, '#d3f9d8', '#2f9e44');
  b.connect(start, step1);
  b.connect(step1, decide);
  b.connect(decide, step2);
  b.connect(decide, fix);
  b.connect(fix, step1);
  b.connect(step2, end);
  b.sticky('Yes → down, No → right', 380, 640, ORANGE);
}

/** Starting content for a new board (validated by callers with BoardObject). */
export function buildTemplate(id: TemplateId): BoardObject[] {
  const b = new Builder();
  if (id === 'kanban') kanban(b);
  else if (id === 'retrospective') retrospective(b);
  else if (id === 'mindmap') mindmap(b);
  else if (id === 'flowchart') flowchart(b);
  return b.build();
}
