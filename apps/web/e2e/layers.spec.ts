import { expect, test, type Page } from '@playwright/test';
import type * as UIModule from '../src/state/ui';
import { createBoard, openBoard, signUp } from './helpers';

type Obj = Record<string, unknown> & { id: string; type: string; x: number; y: number };

const all = (page: Page) =>
  page.evaluate(() => [...window.__canvasly!.store.all()] as unknown as Record<string, unknown>[]) as Promise<
    Obj[]
  >;

const selection = (page: Page) =>
  page.evaluate(async (url) => {
    const mod = (await import(/* @vite-ignore */ url)) as typeof UIModule;
    return mod.useUI.getState().selectedIds;
  }, '/src/state/ui.ts');

/** A rectangle, an ellipse and a sticky with text; the first two grouped. */
async function setUp(page: Page) {
  const canvas = page.getByTestId('board-canvas');
  await page.keyboard.press('r');
  await canvas.click({ position: { x: 400, y: 300 } });
  await page.keyboard.press('o');
  await canvas.click({ position: { x: 700, y: 300 } });
  await page.keyboard.press('n');
  await canvas.click({ position: { x: 1000, y: 500 } });
  await page.keyboard.type('Ideas\nmore');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await all(page)).length).toBe(3);

  await page.mouse.click(400, 300);
  await page.keyboard.down('Shift');
  await page.mouse.click(700, 300);
  await page.keyboard.up('Shift');
  await page.keyboard.press('Control+g');
  await page.mouse.click(1300, 800);
}

test.beforeEach(async ({ page }) => {
  await signUp(page.request);
  await openBoard(page, await createBoard(page.request));
});

/** Drags a row to just above or below another, with steps so that it reads as a drag. */
async function dragRow(page: Page, from: string, onto: string, where: 'above' | 'below', inset = 12) {
  const rows = page.getByTestId('layer-list').getByRole('listitem');
  const a = (await rows.filter({ hasText: from }).first().boundingBox())!;
  const b = (await rows.filter({ hasText: onto }).first().boundingBox())!;
  await page.mouse.move(a.x + 60, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + inset, b.y + (where === 'above' ? 3 : b.height - 3), { steps: 6 });
  await expect(page.getByTestId('layer-drop-line')).toBeVisible();
  await page.mouse.up();
}

const listed = (page: Page) => page.getByTestId('layer-list').getByRole('listitem');

test('the list is the stacking order: dragging a row changes what is on top', async ({ page }) => {
  const canvas = page.getByTestId('board-canvas');
  // Two shapes overlapping at one spot, the ellipse on top as it came last.
  await page.keyboard.press('r');
  await canvas.click({ position: { x: 600, y: 400 } });
  await page.keyboard.press('o');
  await canvas.click({ position: { x: 640, y: 420 } });
  await page.mouse.click(1300, 800);
  await page.getByTestId('layers-tab').click();
  await expect(listed(page)).toHaveText(['Ellipse', 'Rectangle']);

  await page.mouse.click(620, 410);
  const onTop = async () => {
    const [id] = await selection(page);
    return (await all(page)).find((o) => o.id === id)!.type;
  };
  await expect.poll(onTop).toBe('ellipse');

  await dragRow(page, 'Rectangle', 'Ellipse', 'above');
  await expect(listed(page)).toHaveText(['Rectangle', 'Ellipse']);

  // The canvas agrees, which a click on the overlap shows.
  await page.mouse.click(1300, 800);
  await page.mouse.click(620, 410);
  await expect.poll(onTop).toBe('rect');

  // One undo puts it back.
  await page.mouse.click(1300, 800);
  await page.keyboard.press('Control+z');
  await expect(listed(page)).toHaveText(['Ellipse', 'Rectangle']);
});

test('rows go into a group and back out, and groups move whole', async ({ page }) => {
  await setUp(page);
  await page.getByTestId('layers-tab').click();
  await expect(listed(page)).toHaveText(['Ideas', 'Group 1', 'Ellipse', 'Rectangle']);

  // A group moves as one, and never lands inside another.
  await dragRow(page, 'Group 1', 'Ideas', 'above');
  await expect(listed(page)).toHaveText(['Group 1', 'Ellipse', 'Rectangle', 'Ideas']);

  // Between a group's rows means joining it.
  await dragRow(page, 'Ideas', 'Rectangle', 'above');
  await expect(listed(page)).toHaveText(['Group 1', 'Ellipse', 'Ideas', 'Rectangle']);
  let objects = await all(page);
  const groupId = objects.find((o) => o.type === 'ellipse')!.groupId;
  expect(objects.find((o) => o.type === 'sticky')!.groupId).toBe(groupId);

  // Out past the end of the group, near the list's edge, means leaving it.
  await dragRow(page, 'Ellipse', 'Rectangle', 'below');
  await expect(listed(page)).toHaveText(['Group 1', 'Ideas', 'Rectangle', 'Ellipse']);
  objects = await all(page);
  expect(objects.find((o) => o.type === 'ellipse')!.groupId).toBeNull();

  // Further in, it stays inside.
  await dragRow(page, 'Ellipse', 'Rectangle', 'below', 50);
  await expect(listed(page)).toHaveText(['Group 1', 'Ideas', 'Rectangle', 'Ellipse']);
  expect((await all(page)).find((o) => o.type === 'ellipse')!.groupId).toBe(groupId);
});

test('frames stay beneath everything, wherever they are dragged', async ({ page }) => {
  const canvas = page.getByTestId('board-canvas');
  await page.keyboard.press('f');
  await page.mouse.move(300, 200);
  await page.mouse.down();
  await page.mouse.move(800, 600, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.press('r');
  await canvas.click({ position: { x: 1000, y: 300 } });
  await page.mouse.click(1300, 800);
  await page.getByTestId('layers-tab').click();
  await expect(listed(page)).toHaveText(['Rectangle', 'Frame 1']);

  await dragRow(page, 'Frame 1', 'Rectangle', 'above');
  await expect(listed(page)).toHaveText(['Rectangle', 'Frame 1']);
  await dragRow(page, 'Rectangle', 'Frame 1', 'below');
  await expect(listed(page)).toHaveText(['Rectangle', 'Frame 1']);
});

test('dragging can be cancelled, and a click still just selects', async ({ page }) => {
  await setUp(page);
  await page.getByTestId('layers-tab').click();
  const before = await listed(page).allTextContents();

  const row = (await listed(page).filter({ hasText: 'Ideas' }).boundingBox())!;
  await page.mouse.move(row.x + 60, row.y + 10);
  await page.mouse.down();
  await page.mouse.move(row.x + 60, row.y + 70, { steps: 4 });
  await expect(page.getByTestId('layer-drag-label')).toHaveText('Ideas');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('layer-drop-line')).toHaveCount(0);
  await page.mouse.up();
  expect(await listed(page).allTextContents()).toEqual(before);

  await page.mouse.click(1300, 800);
  await listed(page).filter({ hasText: 'Ideas' }).getByRole('button').first().click();
  expect(await selection(page)).toHaveLength(1);
  expect(await listed(page).allTextContents()).toEqual(before);
});

test('a row can be moved from the keyboard', async ({ page }) => {
  await setUp(page);
  await page.getByTestId('layers-tab').click();
  const ideas = listed(page).filter({ hasText: 'Ideas' }).getByRole('button').first();
  await ideas.focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(listed(page)).toHaveText(['Group 1', 'Ideas', 'Ellipse', 'Rectangle']);
  await expect(page.locator('[data-first] [data-row-main]:focus')).toHaveText('Ideas');
  await page.keyboard.press('Alt+ArrowUp');
  await expect(listed(page)).toHaveText(['Ideas', 'Group 1', 'Ellipse', 'Rectangle']);
});

test('grouping brings its members together in the stack', async ({ page }) => {
  const canvas = page.getByTestId('board-canvas');
  await page.keyboard.press('r');
  await canvas.click({ position: { x: 400, y: 300 } });
  await page.keyboard.press('n');
  await canvas.click({ position: { x: 700, y: 300 } });
  await page.keyboard.press('Escape');
  await page.keyboard.press('o');
  await canvas.click({ position: { x: 1000, y: 300 } });
  await page.mouse.click(1300, 800);
  await page.mouse.click(400, 300);
  await page.keyboard.down('Shift');
  await page.mouse.click(1000, 300);
  await page.keyboard.up('Shift');
  await page.keyboard.press('Control+g');

  const order = await page.evaluate(() => window.__canvasly!.store.getSorted().map((o) => o.type));
  expect(order).toEqual(['sticky', 'rect', 'ellipse']);
});

test('the tab opens a list, top first, with groups as folders that collapse', async ({ page }) => {
  await setUp(page);
  await page.getByTestId('layers-tab').click();
  const rows = page.getByTestId('layer-list').getByRole('listitem');

  await expect(rows).toHaveText(['Ideas', 'Group 1', 'Ellipse', 'Rectangle']);

  await page.getByTestId('layer-group-toggle').click();
  await expect(rows).toHaveText(['Ideas', 'Group 1']);
  await page.getByTestId('layer-group-toggle').click();
  await expect(rows).toHaveText(['Ideas', 'Group 1', 'Ellipse', 'Rectangle']);

  // The panel itself collapses back to the tab.
  await page.getByTestId('layers-collapse').click();
  await expect(page.getByTestId('layers-panel')).toHaveCount(0);
  await expect(page.getByTestId('layers-tab')).toBeVisible();
});

test('rows select: a group, one member, and adding with Shift', async ({ page }) => {
  await setUp(page);
  await page.getByTestId('layers-tab').click();
  const objects = await all(page);
  const rect = objects.find((o) => o.type === 'rect')!;
  const ellipse = objects.find((o) => o.type === 'ellipse')!;
  const sticky = objects.find((o) => o.type === 'sticky')!;

  await page.getByTestId('layer-group').getByRole('button', { name: 'Group 1' }).click();
  expect((await selection(page)).sort()).toEqual([rect.id, ellipse.id].sort());

  // One member on its own, which clicking it on the canvas wouldn't do.
  await page.getByRole('button', { name: 'Ellipse', exact: true }).click();
  expect(await selection(page)).toEqual([ellipse.id]);

  await page.getByRole('button', { name: 'Ideas', exact: true }).click({ modifiers: ['Shift'] });
  expect((await selection(page)).sort()).toEqual([ellipse.id, sticky.id].sort());
  await page.getByRole('button', { name: 'Ideas', exact: true }).click({ modifiers: ['Shift'] });
  expect(await selection(page)).toEqual([ellipse.id]);
});

test('selecting on the canvas highlights the row and opens a closed group for one member', async ({
  page,
}) => {
  await setUp(page);
  await page.getByTestId('layers-tab').click();
  await page.getByTestId('layer-group-toggle').click();
  const rows = page.getByTestId('layer-list').getByRole('listitem');
  await expect(rows).toHaveCount(2);

  // Clicking a member on the canvas selects the whole group, so the group row lights up and stays closed.
  await page.mouse.click(400, 300);
  await expect(page.getByTestId('layer-group')).toHaveClass(/bg-selected/);
  await expect(rows).toHaveCount(2);

  // Selecting just one of them (through the layers state) reveals it.
  const ellipse = (await all(page)).find((o) => o.type === 'ellipse')!;
  await page.evaluate(
    async ({ url, id }) => {
      const mod = (await import(/* @vite-ignore */ url)) as typeof UIModule;
      mod.useUI.getState().select([id]);
    },
    { url: '/src/state/ui.ts', id: ellipse.id },
  );
  await expect(rows).toHaveCount(4);
});

test('groups rename, and the name survives a reload; lock and ungroup work from the row', async ({
  page,
}) => {
  await setUp(page);
  await page.getByTestId('layers-tab').click();
  const group = page.getByTestId('layer-group');

  await group.getByRole('button', { name: 'Group 1' }).dblclick();
  await page.getByTestId('group-name-input').fill('Header');
  await page.keyboard.press('Enter');
  await expect(group).toContainText('Header');

  await group.hover();
  await group.getByRole('button', { name: 'Lock group' }).click();
  await expect.poll(async () => (await all(page)).filter((o) => o.groupId).every((o) => o.locked)).toBe(true);
  await group.getByRole('button', { name: 'Unlock group' }).click();
  await expect.poll(async () => (await all(page)).some((o) => o.locked)).toBe(false);

  await page.waitForTimeout(400);
  await page.reload();
  await page.getByTestId('layers-tab').waitFor();
  await expect.poll(async () => (await all(page).catch(() => [])).length).toBe(3);
  await page.getByTestId('layers-tab').click();
  await expect(page.getByTestId('layer-group')).toContainText('Header');

  await page.getByTestId('layer-group').hover();
  await page.getByRole('button', { name: 'Ungroup' }).click();
  await expect(page.getByTestId('layer-group')).toHaveCount(0);
  await expect(page.getByTestId('layer-list').getByRole('listitem')).toHaveCount(3);
});

test('the layers panel takes turns with the other side panels', async ({ page }) => {
  await page.getByTestId('layers-tab').click();
  await expect(page.getByTestId('layers-panel')).toBeVisible();
  await expect(page.getByTestId('layer-list')).toContainText('Everything you add');
  await page.getByTestId('comments-toggle').click();
  await expect(page.getByTestId('layers-panel')).toHaveCount(0);
  await expect(page.getByTestId('layers-tab')).toHaveCount(0);
  await page.getByTestId('comments-toggle').click();
  await expect(page.getByTestId('layers-tab')).toBeVisible();
});
