import {
  CHART_PALETTE,
  cellKey,
  keysAbove,
  makeChart,
  makeConnector,
  makeFrame,
  makeShape,
  makeSticky,
  makeTable,
  makeText,
  type BoardObject,
  type ConnectorObject,
  type ShapeKind,
} from '@canvasly/shared';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { jsPDF } from 'jspdf';
import { resolve } from 'node:path';
import type * as OpsModule from '../src/doc/ops';
import type * as UIModule from '../src/state/ui';
import { createBoard, openBoard, signUp, type TestUser } from './helpers';

/** The screenshots in the README and docs, from the real app, with demo content and made-up people. */

const OUT = resolve(import.meta.dirname, '../../../docs/screenshots');
const shot = (page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }) =>
  page.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : {}) });

const person = (name: string, email: string): TestUser => ({
  name,
  email: `${email}-${Date.now().toString(36)}@example.com`,
  password: 'password1234',
});

const keys = keysAbove(null, 400);
let nextKey = 0;
const z = () => keys[nextKey++]!;

const YELLOW = '#fff9b1';
const GREEN = '#d5f692';
const BLUE = '#a6ccf5';
const PINK = '#ffcee0';
const INK = '#1e1e2e';
const ACCENT = '#0e7c7b';

const sticky = (x: number, y: number, text: string, color = YELLOW) => ({
  ...makeSticky({ x, y }, z(), color),
  text,
  w: 150,
  h: 150,
});

function step(kind: ShapeKind, x: number, y: number, text: string, fill: string, stroke = INK) {
  return {
    ...makeShape(kind, { x, y, w: 180, h: 96 }, z(), { fill, stroke }),
    text,
    cornerRadius: kind === 'rect' ? 18 : null,
  };
}

function link(from: BoardObject, to: BoardObject, patch: Partial<ConnectorObject> = {}) {
  const line = makeConnector(
    { kind: 'attached', objectId: from.id, anchor: [1, 0.5] },
    { kind: 'attached', objectId: to.id, anchor: [0, 0.5] },
    z(),
    { arrow: true, stroke: INK },
  );
  return { ...line, routing: 'curved' as const, ...patch };
}

/** A believable board: a plan with a flow, a kanban, a chart and a table. All of it is demo content. */
function launchBoard(): BoardObject[] {
  const out: BoardObject[] = [];
  const add = <T extends BoardObject>(o: T): T => {
    out.push(o);
    return o;
  };

  add({
    ...makeText({ x: 0, y: 0 }, z(), INK, 64),
    text: 'Product launch plan',
    font: 'poppins',
    bold: true,
    w: 760,
    h: 80,
  });

  const research = add(step('rect', 0, 130, 'Research', '#d9ecea'));
  const design = add(step('rect', 270, 130, 'Design', '#d9ecea'));
  const review = add({ ...step('diamond', 540, 118, 'Review', '#fff3bf'), h: 120 });
  const build = add(step('rect', 810, 60, 'Build', '#d3f9d8'));
  const rework = add(step('rect', 810, 200, 'Rework', '#ffe3e3'));
  const ship = add(step('rect', 1080, 130, 'Launch', ACCENT, ACCENT));
  ship.textColor = '#ffffff';
  ship.bold = true;
  add(link(research, design));
  add(link(design, review));
  add(link(review, build, { label: 'approved' }));
  add(link(review, rework, { label: 'changes', dash: 'dashed', stroke: '#e03131' }));
  add(link(build, ship, { endCap: 'open' }));
  add({
    ...link(rework, design, { routing: 'elbow', dash: 'dashed', stroke: '#e03131' }),
    start: { kind: 'attached', objectId: rework.id, anchor: [0.5, 1] },
    end: { kind: 'attached', objectId: design.id, anchor: [0.5, 1] },
  });

  const top = 390;
  const columns: [string, number, [string, string][]][] = [
    [
      'To do',
      0,
      [
        ['Write launch post', YELLOW],
        ['Plan the webinar', YELLOW],
        ['Press kit', PINK],
        ['Update docs', YELLOW],
      ],
    ],
    [
      'In progress',
      360,
      [
        ['Pricing page', BLUE],
        ['Onboarding emails', BLUE],
        ['Demo video', BLUE],
      ],
    ],
    [
      'Done',
      720,
      [
        ['Beta feedback', GREEN],
        ['Brand refresh', GREEN],
      ],
    ],
  ];
  for (const [name, x, notes] of columns) {
    add({ ...makeFrame({ x, y: top, w: 340, h: 370 }, z(), name), fill: '#ffffff' });
    notes.forEach(([text, color], i) => {
      add(sticky(x + 15 + (i % 2) * 165, top + 20 + Math.floor(i / 2) * 170, text, color));
    });
  }

  add({
    ...makeChart({ x: 0, y: 0 }, z()),
    x: 1100,
    y: top,
    w: 560,
    h: 370,
    title: 'Sign-ups per week (sample data)',
    labels: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'],
    series: [
      { name: 'Organic', color: CHART_PALETTE[0]!, values: [24, 38, 41, 67, 72, 96] },
      { name: 'Referral', color: CHART_PALETTE[1]!, values: [12, 19, 33, 28, 49, 61] },
    ],
  });

  const table = makeTable({ x: 0, y: 0 }, z(), 4, 3);
  const cells: Record<string, string> = {};
  const rows = [
    ['Task', 'Owner', 'Status'],
    ['Landing page', 'Maya', 'Done'],
    ['Demo video', 'Alex', 'In review'],
    ['Launch email', 'Sam', 'Drafting'],
  ];
  rows.forEach((row, r) =>
    row.forEach((text, c) => {
      cells[cellKey(table.rows[r]!.id, table.columns[c]!.id)] = text;
    }),
  );
  add({ ...table, x: 0, y: 800, cells });

  const heading = { ...makeText({ x: 560, y: 800 }, z(), INK, 26), bold: true, font: 'poppins' as const };
  add({ ...heading, text: 'Launch checklist', w: 300, h: 34 });
  add({
    ...makeText({ x: 560, y: 842 }, z(), INK, 22),
    text: '1. Final QA pass\n2. Schedule the post\n3. Brief the support team\n4. Go live',
    w: 340,
    h: 112,
  });

  add({
    ...makeChart({ x: 0, y: 0 }, z(), 'donut'),
    x: 1100,
    y: 800,
    w: 560,
    h: 240,
    title: 'Where sign-ups come from (sample data)',
    labels: ['Search', 'Social', 'Referral', 'Email'],
    series: [{ name: 'Share', color: CHART_PALETTE[0]!, values: [42, 26, 21, 11] }],
  });
  return out;
}

async function addToBoard(page: Page, objects: BoardObject[]) {
  await page.evaluate(
    async ({ url, objects }) => {
      const ops = (await import(/* @vite-ignore */ url)) as typeof OpsModule;
      ops.addObjects(window.__canvasly as never, objects);
    },
    { url: '/src/doc/ops.ts', objects },
  );
  await page.waitForTimeout(300);
}

/** Fit the board, with nothing selected. */
async function fit(page: Page) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+Digit1');
  await page.waitForTimeout(600);
}

async function leaveBoard(page: Page) {
  await page.getByTestId('main-menu').click();
  await page.getByRole('menuitem', { name: 'Back to boards' }).click();
  await page.getByTestId('greeting').waitFor();
}

function samplePdf(): Buffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const sections = ['Overview', 'Market', 'Roadmap', 'Pricing', 'Team', 'Risks'];
  sections.forEach((title, i) => {
    if (i) doc.addPage();
    doc.setFillColor(3, 88, 87);
    doc.rect(0, 0, 600, 90, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(30);
    doc.text(title, 48, 58);
    doc.setTextColor(30, 30, 46);
    doc.setFontSize(13);
    for (let l = 0; l < 26; l++)
      doc.text(`Sample document text, line ${l + 1} of this section.`, 48, 140 + l * 24);
    doc.text(`Page ${i + 1} of ${sections.length}`, 48, 800);
  });
  return Buffer.from(doc.output('arraybuffer'));
}

async function newPerson(browser: Browser, user: TestUser, colorScheme: 'light' | 'dark' = 'light') {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme });
  const page = await context.newPage();
  await signUp(page.request, user);
  return page;
}

test('README and docs screenshots', async ({ browser }) => {
  const maya = person('Maya Chen', 'maya');
  const alex = person('Alex Rivera', 'alex');
  const owner = await newPerson(browser, maya);
  const guest = await newPerson(browser, alex);

  // Home page content: a few boards with real thumbnails.
  for (const [title, template] of [
    ['Sprint board', 'kanban'],
    ['Customer journey', 'journey'],
    ['Q4 OKRs', 'okr'],
    ['Team retro', 'retrospective'],
    ['Checkout flow', 'flowchart'],
  ] as const) {
    const res = await owner.request.post('/api/boards', { data: { title, template } });
    const { id } = (await res.json()) as { id: string };
    await openBoard(owner, id);
    await owner.waitForTimeout(500);
    await leaveBoard(owner);
  }

  // The main board.
  const id = await createBoard(owner.request, 'Product launch plan');
  await openBoard(owner, id);
  await addToBoard(owner, launchBoard());
  await fit(owner);
  await shot(owner, 'board');

  // Sharing, from inside a board.
  await owner.getByTestId('share-button').click();
  await owner.getByTestId('invite-email').fill(alex.email);
  await owner.getByRole('button', { name: 'Invite' }).click();
  await expect(owner.getByTestId('share-message')).toContainText('Added');
  await owner.waitForTimeout(200);
  await shot(owner, 'share');
  await owner.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  // Two people on one board: a live cursor, a remote selection and both avatars.
  await openBoard(guest, id);
  await guest.waitForTimeout(800);
  await guest.keyboard.press('Shift+Digit1');
  await guest.waitForTimeout(500);
  const objects = await guest.evaluate(() => [...window.__canvasly!.store.all()] as unknown as BoardObject[]);
  const target = objects.find((o) => o.type === 'chart')!;
  await guest.evaluate(
    async ({ url, ids }) => {
      const mod = (await import(/* @vite-ignore */ url)) as typeof UIModule;
      mod.useUI.getState().select(ids);
    },
    { url: '/src/state/ui.ts', ids: [target.id] },
  );
  await guest.mouse.move(1180, 400);
  await guest.mouse.move(1210, 430, { steps: 4 });
  await owner.waitForTimeout(900);
  await shot(owner, 'collaboration');
  const theirs = (await (
    await guest.request.post('/api/boards', { data: { title: 'Competitor analysis', template: 'swot' } })
  ).json()) as { id: string };
  await openBoard(guest, theirs.id);
  await guest.waitForTimeout(500);
  await leaveBoard(guest);
  await guest.request.post(`/api/boards/${theirs.id}/invites`, {
    data: { email: maya.email, role: 'viewer' },
  });
  await guest.close();

  // Layers, with a group.
  await owner.reload();
  await owner.getByTestId('board-canvas').waitFor();
  await owner.waitForTimeout(1200);
  await owner.getByTestId('layers-tab').click();
  await owner.evaluate(
    async ({ ops, ui }) => {
      const opsMod = (await import(/* @vite-ignore */ ops)) as typeof OpsModule;
      const board = window.__canvasly as never as Parameters<typeof opsMod.group>[0];
      const stickies = [...window.__canvasly!.store.all()]
        .filter((o) => o.type === 'sticky')
        .map((o) => o.id);
      opsMod.group(board, stickies.slice(0, 3));
      const uiMod = (await import(/* @vite-ignore */ ui)) as typeof UIModule;
      uiMod.useUI.getState().select(stickies.slice(0, 3));
    },
    { ops: '/src/doc/ops.ts', ui: '/src/state/ui.ts' },
  );
  await owner.waitForTimeout(500);
  await shot(owner, 'layers');
  await owner.getByTestId('layers-collapse').click();
  await owner.keyboard.press('Escape');

  // Dark mode.
  await owner.emulateMedia({ colorScheme: 'dark' });
  await fit(owner);
  await shot(owner, 'board-dark');
  await owner.emulateMedia({ colorScheme: 'light' });

  // Text tools, on a board of their own.
  const textBoard = await createBoard(owner.request, 'Brand notes');
  await openBoard(owner, textBoard);
  await owner.getByTestId('board-canvas').click({ position: { x: 800, y: 700 } });
  await addToBoard(owner, [
    {
      ...makeText({ x: -290, y: -440 }, keys[300]!, INK, 72),
      text: 'Make it clear.',
      font: 'playfair',
      bold: true,
      w: 560,
      h: 90,
    },
    {
      ...makeText({ x: 20, y: -280 }, keys[301]!, '#5f5f7a', 28),
      text: 'Fonts, lists, highlights and links',
      font: 'inter',
      highlight: '#fff3bf',
      w: 480,
      h: 35,
    },
    {
      ...makeText({ x: 20, y: -220 }, keys[302]!, INK, 26),
      text: '• Say one thing per slide\n• Use real numbers\n• End with the ask',
      font: 'poppins',
      w: 420,
      h: 98,
    },
    {
      ...makeText({ x: 20, y: -90 }, keys[303]!, INK, 34),
      text: 'Handwritten notes too',
      font: 'caveat',
      underline: true,
      w: 300,
      h: 43,
    },
  ]);
  await owner.mouse.click(800 + 40, 500 - 440 + 40);
  await owner.getByTestId('font-picker').click();
  await owner.waitForTimeout(500);
  await shot(owner, 'text-tools', { x: 330, y: 40, width: 1000, height: 620 });
  await owner.mouse.click(1500, 900);
  await leaveBoard(owner);

  // Connect dots and the line tools.
  const lineBoard = await createBoard(owner.request, 'System map');
  await openBoard(owner, lineBoard);
  const web = step('rect', -520, -170, 'Web app', '#d9ecea');
  const api = step('rect', -90, -170, 'API', '#d9ecea');
  const db = step('cylinder', 340, -250, 'Database', '#d3f9d8');
  const cache = step('rect', 340, -50, 'Rooms', '#fff3bf');
  const links: BoardObject[] = [
    link(web, api, { label: 'HTTPS', z: keys[320]! }),
    link(api, db, { z: keys[321]!, endCap: 'open' }),
    link(api, cache, { z: keys[322]!, dash: 'dashed', routing: 'elbow', startCap: 'circle' }),
  ];
  const picked = { ...step('rect', -90, 140, 'Worker', ACCENT, ACCENT), textColor: '#ffffff', bold: true };
  await addToBoard(owner, [web, api, db, cache, picked, ...links]);
  await owner.mouse.click(800 + picked.x + 90, 500 + picked.y + 48);
  await owner.waitForTimeout(400);
  await shot(owner, 'connect-dots', { x: 180, y: 180, width: 1240, height: 660 });
  await owner.mouse.click(1500, 900);
  // A line selected, with its toolbar and a menu open.
  const curve = links[1] as ConnectorObject;
  await owner.evaluate(
    async ({ url, id }) => {
      const mod = (await import(/* @vite-ignore */ url)) as typeof UIModule;
      mod.useUI.getState().select([id]);
    },
    { url: '/src/state/ui.ts', id: curve.id },
  );
  await owner.getByTestId('line-end-cap').click();
  await owner.waitForTimeout(300);
  await shot(owner, 'line-tools', { x: 180, y: 90, width: 1240, height: 660 });
  await owner.mouse.click(1500, 900);
  await leaveBoard(owner);

  // PDFs: one object with pages, then extracted.
  const pdfBoard = await createBoard(owner.request, 'Investor deck');
  await openBoard(owner, pdfBoard);
  await owner.getByTestId('file-input').setInputFiles({
    name: 'Investor deck.pdf',
    mimeType: 'application/pdf',
    buffer: samplePdf(),
  });
  await expect(owner.getByTestId('doc-title')).toBeVisible({ timeout: 60_000 });
  await owner.getByTestId('doc-next').click();
  await owner.getByTestId('doc-extract').click();
  await owner.getByTestId('extract-range').fill('1-3, 5');
  await owner.waitForTimeout(800);
  await shot(owner, 'pdf');
  await owner.getByTestId('extract-all').click();
  await owner.waitForTimeout(1500);
  await owner.mouse.click(30, 980);
  await owner.waitForTimeout(400);
  await shot(owner, 'pdf-extracted');
  await leaveBoard(owner);

  // Drop overlay, on a fresh board.
  const dropBoard = await createBoard(owner.request, 'Inbox');
  await openBoard(owner, dropBoard);
  await owner.getByTestId('board-root').evaluate((root) => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'report.pdf', { type: 'application/pdf' }));
    root.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await owner.waitForTimeout(300);
  await shot(owner, 'drop');

  await owner.request.delete(`/api/boards/${dropBoard}`);

  // Back to the main board, so that it's the one to pick up again on the home page.
  await openBoard(owner, id);
  await owner.waitForTimeout(800);
  await owner.keyboard.press('Shift+Digit1');
  await owner.mouse.click(1500, 950);
  await owner.keyboard.press('n');
  await owner.getByTestId('board-canvas').click({ position: { x: 1450, y: 150 } });
  await owner.keyboard.press('Escape');
  await owner.keyboard.press('Delete');
  await owner.waitForTimeout(500);
  await leaveBoard(owner);
  await owner.setViewportSize({ width: 1600, height: 1240 });
  await owner.waitForTimeout(1200);
  await shot(owner, 'home');
  await owner.emulateMedia({ colorScheme: 'dark' });
  await owner.waitForTimeout(400);
  await shot(owner, 'home-dark');

  await owner.emulateMedia({ colorScheme: 'light' });
  await owner.setViewportSize({ width: 1600, height: 1000 });
  await owner.getByTestId('new-board').click();
  await owner.waitForTimeout(400);
  await shot(owner, 'templates');

  const visitor = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  await visitor.goto('/');
  await visitor.getByRole('heading', { name: 'Welcome back' }).waitFor();
  await visitor.waitForTimeout(1600); // the board on the left draws itself in
  await shot(visitor, 'sign-in');
});
