import { z } from 'zod';
import type { BoardObject, ConnectorEnd, FrameObject, ShapeKind } from '../schemas/objects';
import { makeConnector, makeShape, makeSticky, makeTable, makeText, newId } from './factories';
import { keysAbove } from './zorder';

export const TemplateId = z.enum([
  'blank',
  'kanban',
  'retrospective',
  'mindmap',
  'flowchart',
  'swot',
  'eisenhower',
  'roadmap',
  'journey',
  'businessmodel',
  'brainstorm',
  'weekly',
  'orgchart',
  'proscons',
  'okr',
]);
export type TemplateId = z.infer<typeof TemplateId>;

export type TemplateCategory = 'Agile' | 'Diagrams' | 'Strategy' | 'Meetings' | 'Planning';

export const TEMPLATES: readonly {
  id: TemplateId;
  name: string;
  description: string;
  category?: TemplateCategory;
}[] = [
  { id: 'blank', name: 'Blank', description: 'Start from an empty canvas' },
  { id: 'kanban', name: 'Kanban', description: 'To do, doing and done columns', category: 'Agile' },
  {
    id: 'retrospective',
    name: 'Retrospective',
    description: 'Went well, to improve, action items',
    category: 'Agile',
  },
  { id: 'mindmap', name: 'Mind map', description: 'A central idea with branches', category: 'Diagrams' },
  { id: 'flowchart', name: 'Flowchart', description: 'Start, steps, decision and end', category: 'Diagrams' },
  { id: 'orgchart', name: 'Org chart', description: 'Reporting lines for a team', category: 'Diagrams' },
  {
    id: 'swot',
    name: 'SWOT analysis',
    description: 'Strengths, weaknesses, opportunities, threats',
    category: 'Strategy',
  },
  {
    id: 'businessmodel',
    name: 'Business model canvas',
    description: 'Nine building blocks of a business',
    category: 'Strategy',
  },
  { id: 'okr', name: 'OKRs', description: 'Objectives with measurable key results', category: 'Strategy' },
  {
    id: 'eisenhower',
    name: 'Eisenhower matrix',
    description: 'Urgent vs. important priorities',
    category: 'Planning',
  },
  {
    id: 'roadmap',
    name: 'Roadmap',
    description: 'Quarterly timeline across workstreams',
    category: 'Planning',
  },
  {
    id: 'weekly',
    name: 'Weekly planner',
    description: 'A table with a row per workstream',
    category: 'Planning',
  },
  {
    id: 'journey',
    name: 'User journey map',
    description: 'Stages, actions, feelings and ideas',
    category: 'Planning',
  },
  {
    id: 'brainstorm',
    name: 'Brainstorm',
    description: 'A prompt with clusters of ideas',
    category: 'Meetings',
  },
  { id: 'proscons', name: 'Pros and cons', description: 'Weigh up a decision', category: 'Meetings' },
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
    // Seeded on the server, which can't measure text: an estimate until the text is first edited.
    const w = Math.ceil(text.length * fontSize * 0.56);
    return this.add({ ...makeText({ x, y }, '', '#1a1a1a', fontSize), text, w, h: fontSize * 1.25 });
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

function quadrants(b: Builder, title: string, cells: [string, string, string][]) {
  b.text(title, 0, -110, 40);
  cells.forEach(([name, color, sample], i) => {
    const x = (i % 2) * 660;
    const y = Math.floor(i / 2) * 560;
    b.frame(name, x, y, 620, 500);
    b.sticky(sample, x + 30, y + 30, color);
  });
}

function swot(b: Builder) {
  quadrants(b, 'SWOT analysis', [
    ['Strengths', GREEN, 'What do we do best?'],
    ['Weaknesses', PINK, 'Where do we fall short?'],
    ['Opportunities', BLUE, 'What could we take advantage of?'],
    ['Threats', ORANGE, 'What could hurt us?'],
  ]);
}

function eisenhower(b: Builder) {
  quadrants(b, 'Eisenhower matrix', [
    ['Do first: urgent and important', PINK, 'Critical deadline'],
    ['Schedule: important, not urgent', BLUE, 'Long-term planning'],
    ['Delegate: urgent, not important', ORANGE, 'Routine requests'],
    ['Drop: neither', YELLOW, 'Distractions'],
  ]);
}

function roadmap(b: Builder) {
  b.text('Product roadmap', 0, -130, 40);
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  const lanes: [string, string, [number, number, string][]][] = [
    [
      'Product',
      '#d0ebff',
      [
        [0, 2, 'Discovery'],
        [2, 2, 'Beta launch'],
      ],
    ],
    [
      'Design',
      '#e5dbff',
      [
        [0, 1, 'Research'],
        [1, 2, 'Design system'],
      ],
    ],
    [
      'Engineering',
      '#d3f9d8',
      [
        [1, 2, 'Core platform'],
        [3, 1, 'Scale'],
      ],
    ],
  ];
  const cw = 340;
  const left = 200;
  quarters.forEach((q, i) => b.shape('rect', q, left + i * cw, -50, cw - 10, 50, '#f1f3f5', '#ced4da'));
  lanes.forEach(([lane, color, bars], row) => {
    const y = 20 + row * 130;
    b.shape('rect', lane, 0, y, left - 20, 110, '#f1f3f5', '#ced4da');
    for (const [start, span, label] of bars) {
      b.shape('chevron', label, left + start * cw, y + 15, span * cw - 10, 80, color, '#868e96');
    }
  });
}

function journey(b: Builder) {
  b.text('User journey map', 0, -130, 40);
  const stages = ['Discover', 'Sign up', 'First use', 'Habit', 'Advocate'];
  const rows: [string, string][] = [
    ['Actions', YELLOW],
    ['Thoughts', BLUE],
    ['Pain points', PINK],
    ['Opportunities', GREEN],
  ];
  const cw = 260;
  const left = 190;
  stages.forEach((st, i) => b.shape('arrowblock', st, left + i * cw, -50, cw - 10, 60, '#d9ecea', '#0e7c7b'));
  rows.forEach(([row, color], r) => {
    const y = 40 + r * 230;
    b.shape('rect', row, 0, y, left - 20, 200, '#f1f3f5', '#ced4da');
    stages.forEach((_, i) => b.sticky('', left + i * cw + 25, y, color));
  });
}

function businessModel(b: Builder) {
  b.text('Business model canvas', 0, -110, 40);
  const blocks: [string, number, number, number, number][] = [
    ['Key partners', 0, 0, 1, 2],
    ['Key activities', 1, 0, 1, 1],
    ['Key resources', 1, 1, 1, 1],
    ['Value propositions', 2, 0, 1, 2],
    ['Customer relationships', 3, 0, 1, 1],
    ['Channels', 3, 1, 1, 1],
    ['Customer segments', 4, 0, 1, 2],
  ];
  const cw = 340;
  const ch = 380;
  for (const [name, c, r, cs, rs] of blocks) b.frame(name, c * cw, r * ch, cs * cw - 20, rs * ch - 20);
  b.frame('Cost structure', 0, 2 * ch, 2.5 * cw - 20, 280);
  b.frame('Revenue streams', 2.5 * cw, 2 * ch, 2.5 * cw - 20, 280);
}

function brainstorm(b: Builder) {
  const prompt = b.shape('cloud', 'What should we try next?', -220, -110, 440, 220, '#d9ecea', '#0e7c7b');
  const clusters: [number, number, string, string[]][] = [
    [-760, -330, YELLOW, ['Idea', 'Idea']],
    [340, -330, BLUE, ['Idea', 'Idea']],
    [-760, 150, GREEN, ['Idea', 'Idea']],
    [340, 150, PINK, ['Idea', 'Idea']],
  ];
  for (const [x, y, color, notes] of clusters) {
    const first = b.sticky(notes[0]!, x, y, color);
    b.sticky(notes[1]!, x + 220, y, color);
    b.connect(prompt, first, false);
  }
}

function weekly(b: Builder) {
  b.text('Weekly planner', -480, -240, 40);
  const table = makeTable({ x: 0, y: 0 }, '', 5, 6);
  const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const lanes = ['', 'Focus', 'Meetings', 'Personal', 'Notes'];
  const cells: Record<string, string> = {};
  table.rows.forEach((r, ri) =>
    table.columns.forEach((c, ci) => {
      const text = ri === 0 ? days[ci] : ci === 0 ? lanes[ri] : '';
      if (text) cells[`${r.id}:${c.id}`] = text;
    }),
  );
  const rows = table.rows.map((r, i) => ({ ...r, h: i === 0 ? 44 : 120 }));
  b.add({ ...table, rows, cells, h: rows.reduce((n, r) => n + r.h, 0), y: -180 });
}

function orgchart(b: Builder) {
  const node = (t: string, x: number, y: number, fill: string) =>
    b.shape('roundrect', t, x, y, 220, 90, fill, '#0e7c7b');
  const lead = node('Team lead', 0, 0, '#d9ecea');
  const heads = [-480, 0, 480].map((x, i) =>
    node(['Design', 'Engineering', 'Product'][i]!, x, 180, '#ffffff'),
  );
  heads.forEach((h) => b.connect(lead, h, false));
  [-240, 240].forEach((x, i) => b.connect(heads[1]!, node(`Engineer ${i + 1}`, x, 360, '#ffffff'), false));
}

function proscons(b: Builder) {
  b.text('Decision: …', 0, -110, 40);
  const columns: [string, string, string][] = [
    ['Pros', GREEN, 'A good reason'],
    ['Cons', PINK, 'A concern'],
  ];
  columns.forEach(([name, color, sample], i) => {
    const x = i * 560;
    b.frame(name, x, 0, 520, 700);
    b.sticky(sample, x + 30, 30, color);
    b.sticky('', x + 270, 30, color);
  });
}

function okr(b: Builder) {
  b.text('Objectives and key results', 0, -110, 40);
  [0, 1, 2].forEach((i) => {
    const y = i * 280;
    const objective = b.shape('roundrect', `Objective ${i + 1}`, 0, y + 45, 300, 130, '#d9ecea', '#0e7c7b');
    [0, 1, 2].forEach((k) => {
      const kr = b.sticky(`Key result ${k + 1}`, 420 + k * 220, y, k === 0 ? GREEN : k === 1 ? YELLOW : BLUE);
      if (k === 0) b.connect(objective, kr);
    });
  });
}

const BUILDERS: Partial<Record<TemplateId, (b: Builder) => void>> = {
  kanban,
  retrospective,
  mindmap,
  flowchart,
  swot,
  eisenhower,
  roadmap,
  journey,
  businessmodel: businessModel,
  brainstorm,
  weekly,
  orgchart,
  proscons,
  okr,
};

/** Starting content for a new board or an insert (validated by callers with BoardObject). */
export function buildTemplate(id: TemplateId): BoardObject[] {
  const b = new Builder();
  BUILDERS[id]?.(b);
  return b.build();
}
