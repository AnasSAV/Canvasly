import { expect, test, type Page } from '@playwright/test';
import type * as ViewportModule from '../src/state/viewport';
import { createBoard, openBoard, signIn, signUp } from './helpers';

const types = (page: Page) =>
  page.evaluate(() => [...window.__canvasly!.store.all()].map((o) => o.type).sort());
const first = (page: Page, type: string) =>
  page.evaluate(
    (t) => [...window.__canvasly!.store.all()].find((o) => o.type === t) as unknown as Record<string, never>,
    type,
  );
const camera = (page: Page) =>
  page.evaluate(async (url) => {
    const mod = (await import(/* @vite-ignore */ url)) as typeof ViewportModule;
    return mod.useViewport.getState().camera;
  }, '/src/state/viewport.ts');

test.beforeEach(async ({ page }) => {
  await signUp(page.request);
  await openBoard(page, await createBoard(page.request));
});

test('the wheel zooms by default; trackpad mode scrolls instead', async ({ page }) => {
  await page.mouse.move(700, 450);
  const before = await camera(page);
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await camera(page)).zoom).toBeGreaterThan(before.zoom);
  // Zoom stays centered on the cursor.
  const after = await camera(page);
  expect((700 - after.x) / after.zoom).toBeCloseTo((700 - before.x) / before.zoom, 3);

  // Switch through the right-click menu.
  await page.mouse.click(700, 450, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Mouse or trackpad' }).click();
  await page.getByRole('menuitem', { name: /^Trackpad/ }).click();
  await page.mouse.move(700, 450);
  const c1 = await camera(page);
  await page.mouse.wheel(40, 60);
  await expect.poll(async () => (await camera(page)).x).toBeCloseTo(c1.x - 40, 0);
  expect((await camera(page)).zoom).toBe(c1.zoom);

  // Remembered across reloads.
  await page.reload();
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-status', 'online');
  await page.mouse.move(700, 450);
  const c2 = await camera(page);
  await page.mouse.wheel(0, 50);
  await expect.poll(async () => (await camera(page)).y).toBeCloseTo(c2.y - 50, 0);
});

test('right-click opens the board menu; right-drag pans without opening it', async ({ page }) => {
  const c0 = await camera(page);
  await page.mouse.move(600, 500);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(680, 540, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  await expect(page.getByTestId('context-menu')).toHaveCount(0);
  expect(Math.round((await camera(page)).x - c0.x)).toBe(80);

  await page.mouse.click(600, 500, { button: 'right' });
  const menu = page.getByTestId('context-menu');
  for (const item of [
    'Paste',
    'Unlock all',
    'Add text',
    'Add sticky note',
    'Add comment',
    'Set start view',
    'Set current view as start',
    'Show grid',
    'Show comments on board',
    'Snap to grid',
    'Snap objects',
    'Show object size',
    'Suggest object size',
    'Mouse or trackpad',
    'Show all',
  ]) {
    await expect(menu.getByRole('menuitem', { name: item, exact: false }).first()).toBeVisible();
  }

  // Items act on the spot that was clicked.
  await menu.getByRole('menuitem', { name: 'Add sticky note' }).click();
  await expect(menu).toHaveCount(0);
  await page.keyboard.type('From the menu');
  await page.keyboard.press('Escape');
  const sticky = await first(page, 'sticky');
  expect(sticky.text).toBe('From the menu');

  // Esc closes without doing anything.
  await page.mouse.click(1100, 700, { button: 'right' });
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  // Right-clicking an object offers object actions.
  await page.mouse.click(600, 500, { button: 'right' });
  await menu.getByRole('menuitem', { name: 'Delete' }).click();
  await expect.poll(() => types(page)).toEqual([]);
});

test('unlock all and start view from the menu', async ({ page }) => {
  await page.keyboard.press('r');
  await page.getByTestId('board-canvas').click({ position: { x: 700, y: 450 } });
  await page.keyboard.press('Control+Shift+l');
  expect((await first(page, 'rect')).locked).toBe(true);
  await page.mouse.click(300, 700, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Unlock all' }).click();
  await expect.poll(async () => (await first(page, 'rect')).locked).toBe(false);

  // The board opens where the start view was set, not at "show all".
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, -400);
  const zoomed = await camera(page);
  await page.mouse.click(300, 700, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Set current view as start' }).click();
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-status', 'online');
  await expect
    .poll(async () => Math.abs((await camera(page)).zoom - zoomed.zoom) / zoomed.zoom)
    .toBeLessThan(0.1);
});

test('tables: create, edit cells, add rows, and sync to another browser', async ({ page, browser }) => {
  await page.getByTestId('tool-create').click();
  await page.getByTestId('create-table').click();
  const table = await first(page, 'table');
  const rows = table.rows as unknown as { id: string; h: number }[];
  const cols = table.columns as unknown as { id: string; w: number }[];
  expect(rows).toHaveLength(4);

  // Double-click the top-left cell (the table is centered in the 1400x900 viewport), type, Tab to the next.
  const left = 700 - (cols.length * cols[0]!.w) / 2;
  const top = 450 - (rows.length * rows[0]!.h) / 2;
  await page.mouse.dblclick(left + 20, top + 20);
  await expect(page.getByTestId('cell-editor')).toBeVisible();
  await page.keyboard.type('Name');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Status');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Done');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cell-editor')).toHaveCount(0);
  const cells = (await first(page, 'table')).cells as unknown as Record<string, string>;
  expect(cells[`${rows[0]!.id}:${cols[0]!.id}`]).toBe('Name');
  expect(cells[`${rows[0]!.id}:${cols[1]!.id}`]).toBe('Status');
  expect(cells[`${rows[1]!.id}:${cols[1]!.id}`]).toBe('Done');

  // Add and remove rows and columns from the toolbar.
  await page.getByTestId('table-add-row').click();
  await page.getByTestId('table-add-column').click();
  let t = await first(page, 'table');
  expect(t.rows as unknown as unknown[]).toHaveLength(5);
  expect(t.columns as unknown as unknown[]).toHaveLength(5);
  await page.getByTestId('table-delete-column').click();
  t = await first(page, 'table');
  expect(t.columns as unknown as unknown[]).toHaveLength(4);

  // Another browser sees the table and its text.
  const user = await page.evaluate(() => window.__canvasly!.presence.user.id);
  expect(user).toBeTruthy();
  const url = page.url();
  const email = (await (await page.request.get('/api/auth/get-session')).json()) as {
    user: { email: string };
  };
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await signIn(other.request, { email: email.user.email, password: 'password1234', name: '' });
  await other.goto(url);
  await expect(other.getByTestId('connection-status')).toHaveAttribute('data-status', 'online');
  await expect
    .poll(
      async () =>
        ((await first(other, 'table'))?.cells as unknown as Record<string, string>)?.[
          `${rows[0]!.id}:${cols[0]!.id}`
        ],
    )
    .toBe('Name');
  await ctx.close();
});

test('charts: insert, edit data and switch type', async ({ page }) => {
  await page.getByTestId('tool-create').click();
  await page.getByTestId('create-chart-bar').click();
  await expect(page.getByTestId('chart-editor')).toBeVisible();
  await page.getByTestId('chart-title').fill('Revenue');
  await page.getByTestId('chart-value-0-0').fill('99');
  let c = await first(page, 'chart');
  expect(c.title).toBe('Revenue');
  expect((c.series as unknown as { values: number[] }[])[0]!.values[0]).toBe(99);
  await page.getByTestId('chart-editor').getByRole('button', { name: 'Pie' }).click();
  c = await first(page, 'chart');
  expect(c.chartKind).toBe('pie');
  await page.getByRole('button', { name: 'Close chart data' }).click();
  await expect(page.getByTestId('chart-editor')).toHaveCount(0);
  await page.getByTestId('chart-edit').click();
  await expect(page.getByTestId('chart-editor')).toBeVisible();
});

test('new shapes, highlighter, stickers and templates from the panels', async ({ page }) => {
  await page.getByTestId('tool-shapes').click();
  await page.getByTestId('tool-star').click();
  await page.getByTestId('board-canvas').click({ position: { x: 500, y: 300 } });
  await page.getByTestId('tool-shapes').click();
  await page.getByTestId('tool-cloud').click();
  await page.getByTestId('board-canvas').click({ position: { x: 900, y: 300 } });
  expect(await types(page)).toEqual(['cloud', 'star']);

  // A connector attached to a star clips to the star's outline, inside its box.
  await page.keyboard.press('a');
  await page.mouse.move(500, 300);
  await page.mouse.down();
  await page.mouse.move(900, 300, { steps: 6 });
  await page.mouse.up();
  const resolved = await page.evaluate(() => {
    const b = window.__canvasly!;
    const c = [...b.store.all()].find((o) => o.type === 'connector');
    return c?.type === 'connector' ? b.store.resolve(c) : null;
  });
  expect(Number.isFinite(resolved!.start.x)).toBe(true);
  expect(resolved!.start.x).toBeLessThan(resolved!.end.x);

  // Highlighter strokes are translucent.
  await page.getByTestId('tool-pen').click();
  await page.getByTestId('tool-highlighter').click();
  await page.mouse.move(400, 600);
  await page.mouse.down();
  await page.mouse.move(800, 620, { steps: 6 });
  await page.mouse.up();
  expect((await first(page, 'pen')).opacity).toBeLessThan(1);
  await page.keyboard.press('v');

  // Stickers and templates insert into the current board.
  await page.getByTestId('tool-more').click();
  await page.getByRole('button', { name: 'Sticker 🚀' }).click();
  expect((await first(page, 'text')).text).toBe('🚀');
  const before = (await types(page)).length;
  await page.getByTestId('tool-templates').click();
  await page.getByTestId('insert-template-swot').click();
  await expect.poll(async () => (await types(page)).length).toBeGreaterThan(before + 4);
  // Undo removes the whole template in one step.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await types(page)).length).toBe(before);
});

test('board menu, shortcuts dialog and view toggles', async ({ page }) => {
  await page.getByTestId('board-menu').click();
  await page.getByRole('menuitem', { name: 'Preferences' }).click();
  await page.getByRole('menuitem', { name: 'Show object size' }).click();
  await page.keyboard.press('r');
  await page.getByTestId('board-canvas').click({ position: { x: 700, y: 450 } });
  await expect(page.getByTestId('object-size')).toHaveText('160 × 100');

  await page.getByTestId('help').click();
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);

  // G toggles the grid (a CSS background on the canvas).
  const canvas = page.getByTestId('board-canvas');
  const bg = () => canvas.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(await bg()).toContain('linear-gradient');
  await page.keyboard.press('g');
  expect(await bg()).toBe('none');

  await page.getByTestId('main-menu').click();
  await page.getByRole('menuitem', { name: 'Back to boards' }).click();
  await expect(page.getByRole('heading', { name: 'Your boards' })).toBeVisible();
  await expect(page.getByTestId('quick-template-kanban')).toBeVisible();
  await page.getByLabel('Search boards').fill('no such board');
  await expect(page.getByText('No boards match.')).toBeVisible();
});
