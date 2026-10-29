import { expect, test, type Page } from '@playwright/test';
import type * as ViewportModule from '../src/state/viewport';
import { createBoard, openBoard, signUp } from './helpers';

const objects = (page: Page) =>
  page.evaluate(() => [...window.__canvasly!.store.all()].map((o) => ({ type: o.type, id: o.id })));

const objectOf = (page: Page, id: string) =>
  page.evaluate((id) => window.__canvasly!.store.get(id) as Record<string, unknown> | undefined, id);

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await signUp(page.request);
  await openBoard(page, await createBoard(page.request));
});

test.afterEach(() => {
  expect(errors, 'no runtime errors in the page').toEqual([]);
});

test('creates, edits, moves, undoes and duplicates objects', async ({ page }) => {
  const canvas = page.getByTestId('board-canvas');

  // Sticky note with inline text editing
  await page.keyboard.press('n');
  await canvas.click({ position: { x: 500, y: 400 } });
  await page.keyboard.type('Hello Canvasly');
  await page.keyboard.press('Escape');
  let list = await objects(page);
  expect(list).toHaveLength(1);
  expect(await objectOf(page, list[0]!.id)).toMatchObject({ type: 'sticky', text: 'Hello Canvasly' });

  // Rectangle by dragging
  await page.keyboard.press('r');
  await page.mouse.move(800, 300);
  await page.mouse.down();
  await page.mouse.move(950, 420, { steps: 5 });
  await page.mouse.up();
  list = await objects(page);
  expect(list.map((o) => o.type).sort()).toEqual(['rect', 'sticky']);
  const rect = list.find((o) => o.type === 'rect')!;
  expect(await objectOf(page, rect.id)).toMatchObject({ w: 150, h: 120 });

  // Move the rectangle
  const before = (await objectOf(page, rect.id)) as { x: number; y: number };
  await page.mouse.move(870, 360);
  await page.mouse.down();
  await page.mouse.move(920, 400, { steps: 5 });
  await page.mouse.up();
  const after = (await objectOf(page, rect.id)) as { x: number; y: number };
  expect(after.x - before.x).toBeCloseTo(50, 0);
  expect(after.y - before.y).toBeCloseTo(40, 0);

  // Undo the move, then redo it
  await page.keyboard.press('Control+z');
  expect(await objectOf(page, rect.id)).toMatchObject({ x: before.x, y: before.y });
  await page.keyboard.press('Control+Shift+z');
  expect(await objectOf(page, rect.id)).toMatchObject({ x: after.x, y: after.y });

  // Select all + duplicate
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+d');
  expect(await objects(page)).toHaveLength(4);

  // Delete the duplicates (still selected)
  await page.keyboard.press('Delete');
  expect(await objects(page)).toHaveLength(2);
});

test('connects two shapes and the connector follows', async ({ page }) => {
  const canvas = page.getByTestId('board-canvas');
  await page.keyboard.press('r');
  await canvas.click({ position: { x: 400, y: 400 } });
  await page.keyboard.press('o');
  await canvas.click({ position: { x: 800, y: 400 } });

  await page.keyboard.press('a');
  await page.mouse.move(400, 400);
  await page.mouse.down();
  await page.mouse.move(800, 400, { steps: 8 });
  await page.mouse.up();
  const conn = (await objects(page)).find((o) => o.type === 'connector')!;
  const c = (await objectOf(page, conn.id)) as { start: { kind: string }; end: { kind: string } };
  expect(c.start.kind).toBe('attached');
  expect(c.end.kind).toBe('attached');

  const endY = () =>
    page.evaluate((id) => {
      const b = window.__canvasly!;
      const o = b.store.get(id);
      return o?.type === 'connector' ? b.store.resolve(o)!.end.y : NaN;
    }, conn.id);
  const y0 = await endY();

  // Drag the ellipse down 200px (zoom is 100%); the attached end follows.
  await page.mouse.move(800, 400);
  await page.mouse.down();
  await page.mouse.move(800, 600, { steps: 8 });
  await page.mouse.up();
  expect(await endY()).toBeGreaterThan(y0 + 100);
});

test('zooms around the cursor and fits content', async ({ page }) => {
  const canvas = page.getByTestId('board-canvas');
  await page.keyboard.press('n');
  await canvas.click({ position: { x: 300, y: 300 } });
  await page.keyboard.press('Escape');
  await page.mouse.move(700, 450);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  await expect(page.getByTestId('zoom-level')).not.toHaveText('100%');
  await page.keyboard.press('Shift+Digit1');
  await expect(page.getByTestId('zoom-level')).toHaveText('200%');
});

test('corner-resizing a text box scales its font; side handles only rewrap', async ({ page }) => {
  const canvas = page.getByTestId('board-canvas');
  await page.keyboard.press('t');
  await canvas.click({ position: { x: 500, y: 400 } });
  await page.keyboard.type('Drama is the best');
  await page.keyboard.press('Escape');
  const [text] = await objects(page);
  const o = (await objectOf(page, text!.id)) as {
    x: number;
    y: number;
    w: number;
    h: number;
    fontSize: number;
  };
  // Initial camera puts world (0,0) at the viewport center (700, 450); Transformer padding is 2px.
  const right = o.x + o.w + 700 + 2;
  const bottom = o.y + o.h + 450 + 2;

  await page.mouse.move(right, bottom);
  await page.mouse.down();
  await page.mouse.move(right + o.w / 2, bottom + o.h / 2, { steps: 8 });
  await page.mouse.up();
  const bigger = (await objectOf(page, text!.id)) as typeof o;
  expect(bigger.fontSize).toBeGreaterThan(o.fontSize * 1.3);
  expect(bigger.w).toBeGreaterThan(o.w * 1.3);

  const midY = bigger.y + bigger.h / 2 + 450;
  const midRight = bigger.x + bigger.w + 700 + 2;
  await page.mouse.move(midRight, midY);
  await page.mouse.down();
  await page.mouse.move(midRight - 100, midY, { steps: 5 });
  await page.mouse.up();
  const narrower = (await objectOf(page, text!.id)) as typeof o;
  expect(narrower.fontSize).toBe(bigger.fontSize);
  expect(narrower.w).toBeLessThan(bigger.w);
});

test('right-drag on empty board pans', async ({ page }) => {
  // Runs in the browser, where Vite serves source modules by URL.
  const camera = () =>
    page.evaluate(async (url) => {
      const mod = (await import(/* @vite-ignore */ url)) as typeof ViewportModule;
      return mod.useViewport.getState().camera;
    }, '/src/state/viewport.ts');
  const before = await camera();
  await page.mouse.move(600, 500);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(700, 560, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  const after = await camera();
  expect(after.x - before.x).toBeCloseTo(100, 0);
  expect(after.y - before.y).toBeCloseTo(60, 0);
});
