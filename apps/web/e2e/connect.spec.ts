import { expect, test, type Page } from '@playwright/test';
import type * as UIModule from '../src/state/ui';
import { createBoard, openBoard, signUp } from './helpers';

type Obj = Record<string, unknown> & { id: string; type: string; x: number; y: number; w: number; h: number };

const all = (page: Page) =>
  page.evaluate(() => [...window.__canvasly!.store.all()] as unknown as Record<string, unknown>[]) as Promise<
    Obj[]
  >;
const ofType = async (page: Page, type: string) => (await all(page)).filter((o) => o.type === type);
const selection = (page: Page) =>
  page.evaluate(async (url) => {
    const mod = (await import(/* @vite-ignore */ url)) as typeof UIModule;
    return mod.useUI.getState().selectedIds;
  }, '/src/state/ui.ts');

/** A selected rectangle, 160 by 100, centered on the point. */
async function addRect(page: Page, x: number, y: number) {
  await page.keyboard.press('r');
  await page.getByTestId('board-canvas').click({ position: { x, y } });
}

/** Connect dots sit 22px outside the middle of each side. */
const rightDot = (x: number, y: number): [number, number] => [x + 80 + 22, y];
const leftDot = (x: number, y: number): [number, number] => [x - 80 - 22, y];
const bottomDot = (x: number, y: number): [number, number] => [x, y + 50 + 22];

test.beforeEach(async ({ page }) => {
  await signUp(page.request);
  await openBoard(page, await createBoard(page.request));
});

test('dragging from a dot draws a curved arrow, meeting the other shape squarely', async ({ page }) => {
  await addRect(page, 900, 500);
  await page.mouse.click(1300, 860);
  await addRect(page, 400, 250);
  const [target, source] = (await ofType(page, 'rect')).sort((a, b) => b.x - a.x);

  await page.mouse.move(...rightDot(400, 250));
  await page.mouse.down();
  await page.mouse.move(700, 400, { steps: 4 });
  // The other shape is highlighted as the target while hovering it.
  await page.mouse.move(835, 505, { steps: 4 });
  await page.mouse.up();

  await expect.poll(async () => (await ofType(page, 'connector')).length).toBe(1);
  const line = (await ofType(page, 'connector'))[0]!;
  expect(line).toMatchObject({
    routing: 'curved',
    endCap: 'arrow',
    start: { kind: 'attached', objectId: source!.id, anchor: [1, 0.5] },
    end: { kind: 'attached', objectId: target!.id },
  });
  // Dropped toward the left of the target: it lands on the left side, not floating at some angle.
  expect((line.end as { anchor: number[] }).anchor).toEqual([0, 0.5]);

  // It stays attached when the shape moves.
  await page.mouse.click(1300, 860);
  await page.mouse.move(900, 500);
  await page.mouse.down();
  await page.mouse.move(1000, 650, { steps: 5 });
  await page.mouse.up();
  const resolved = await page.evaluate((id) => {
    const store = window.__canvasly!.store;
    return store.resolve(store.get(id) as never)!.end;
  }, line.id);
  const moved = (await all(page)).find((o) => o.id === target!.id)!;
  expect(resolved.x).toBeCloseTo(moved.x, 0);
  expect(resolved.y).toBeCloseTo(moved.y + moved.h / 2, 0);
});

test('dragging from a dot to empty space leaves a free end there', async ({ page }) => {
  await addRect(page, 400, 300);
  await page.mouse.move(...bottomDot(400, 300));
  await page.mouse.down();
  await page.mouse.move(600, 700, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await ofType(page, 'connector')).length).toBe(1);
  const line = (await ofType(page, 'connector'))[0]!;
  expect((line.start as { anchor: number[] }).anchor).toEqual([0.5, 1]);
  expect(line.end).toMatchObject({ kind: 'point' });
});

test('clicking a dot adds a joined copy on that side, as one undo step', async ({ page }) => {
  await addRect(page, 500, 400);
  const original = (await ofType(page, 'rect'))[0]!;
  await page.getByTestId('corner-radius').click();
  await page.getByTestId('corner-round').click();
  await expect.poll(async () => (await ofType(page, 'rect'))[0]!.cornerRadius).not.toBeNull();
  await page.getByTestId('corner-radius').click();

  await page.mouse.click(...rightDot(500, 400));
  await expect.poll(async () => (await ofType(page, 'rect')).length).toBe(2);
  const copy = (await ofType(page, 'rect')).find((o) => o.id !== original.id)!;
  expect(copy.w).toBe(original.w);
  expect(copy.h).toBe(original.h);
  expect(copy.y).toBe(original.y);
  expect(copy.x).toBeGreaterThan(original.x + original.w);
  expect(copy.cornerRadius).toBe(20); // it carries the look across
  expect(await selection(page)).toEqual([copy.id]);
  const line = (await ofType(page, 'connector'))[0]!;
  expect(line).toMatchObject({ routing: 'curved' });
  expect((line.start as { anchor: number[] }).anchor).toEqual([1, 0.5]);
  expect((line.end as { anchor: number[] }).anchor).toEqual([0, 0.5]);

  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await all(page)).length).toBe(1);

  // Back to the left, and a line from an object that can't be copied just doesn't add anything.
  await page.mouse.click(500, 400);
  await page.mouse.click(...leftDot(500, 400));
  await expect.poll(async () => (await ofType(page, 'rect')).length).toBe(2);
  const left = (await ofType(page, 'rect')).find((o) => o.id !== original.id)!;
  expect(left.x + left.w).toBeLessThan(original.x);
});

test('dots only show when they can be used', async ({ page }) => {
  await addRect(page, 500, 400);
  const count = async () => (await all(page)).length;

  // Locked: a click where the dot would be just deselects.
  await page.keyboard.press('Control+Shift+l');
  await page.mouse.click(...rightDot(500, 400));
  await page.waitForTimeout(150);
  expect(await count()).toBe(1);

  await page.mouse.click(500, 400);
  await page.keyboard.press('Control+Shift+l');
  await page.mouse.click(1300, 860);

  // With two selected there's no single object to connect from.
  await addRect(page, 900, 400);
  await page.keyboard.press('Control+a');
  await page.mouse.click(...rightDot(900, 400));
  await page.waitForTimeout(150);
  expect(await count()).toBe(2);
});

test('letting go near a shape attaches, without having to land exactly on it', async ({ page }) => {
  await addRect(page, 900, 500);
  await page.mouse.click(1300, 860);
  await addRect(page, 400, 250);
  await page.mouse.move(...rightDot(400, 250));
  await page.mouse.down();
  // 15px short of the target's left edge at x=820.
  await page.mouse.move(805, 500, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await ofType(page, 'connector')).length).toBe(1);
  expect((await ofType(page, 'connector'))[0]!.end).toMatchObject({ kind: 'attached', anchor: [0, 0.5] });

  // Well clear of it, the end stays free.
  await page.mouse.click(1300, 860);
  await page.mouse.click(400, 250);
  await page.mouse.move(...bottomDot(400, 250));
  await page.mouse.down();
  await page.mouse.move(700, 500, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await ofType(page, 'connector')).length).toBe(2);
  const free = (await ofType(page, 'connector')).find(
    (c) => (c.start as { anchor: number[] }).anchor[1] === 1,
  )!;
  expect(free.end).toMatchObject({ kind: 'point' });
});

test('the rotate handle moved off the bottom corner, and still rotates', async ({ page }) => {
  await addRect(page, 600, 400);
  // From the center, along the diagonal to past the bottom edge: (-70, +70) for this size of shape.
  await page.mouse.move(530, 470);
  await page.mouse.down();
  await page.mouse.move(500, 300, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await ofType(page, 'rect'))[0]!.rotation).not.toBe(0);

  // The top dot is free of it, and connects rather than rotating.
  const before = (await ofType(page, 'rect'))[0]!.rotation;
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await ofType(page, 'rect'))[0]!.rotation).toBe(0);
  expect(before).not.toBe(0);
  await page.mouse.move(600, 400 - 50 - 22);
  await page.mouse.down();
  await page.mouse.move(600, 150, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await ofType(page, 'connector')).length).toBe(1);
  expect((await ofType(page, 'rect'))[0]!.rotation).toBe(0);
});

test('corner radius: presets, the slider as one undo step, and shapes without corners', async ({ page }) => {
  await addRect(page, 500, 400);
  await page.getByTestId('corner-radius').click();

  await page.getByTestId('corner-square').click();
  await expect.poll(async () => (await ofType(page, 'rect'))[0]!.cornerRadius).toBe(0);
  await page.getByTestId('corner-full').click();
  await expect.poll(async () => (await ofType(page, 'rect'))[0]!.cornerRadius).toBe(50);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await ofType(page, 'rect'))[0]!.cornerRadius).toBe(0);

  const slider = page.getByTestId('corner-radius-input');
  await slider.fill('23');
  await expect.poll(async () => (await ofType(page, 'rect'))[0]!.cornerRadius).toBe(23);

  // A straight-sided shape can be rounded too, and an ellipse has nothing to round.
  await page.mouse.click(1300, 860);
  await page.getByTestId('tool-shapes').click();
  await page.getByTestId('tool-hexagon').click();
  await page.getByTestId('board-canvas').click({ position: { x: 900, y: 400 } });
  await page.getByTestId('corner-radius').click();
  await page.getByTestId('corner-round').click();
  await expect.poll(async () => (await ofType(page, 'hexagon'))[0]!.cornerRadius).toBeGreaterThan(0);

  await page.mouse.click(1300, 860);
  await page.keyboard.press('o');
  await page.getByTestId('board-canvas').click({ position: { x: 900, y: 700 } });
  await expect(page.getByTestId('selection-toolbar')).toBeVisible();
  await expect(page.getByTestId('corner-radius')).toHaveCount(0);
});
