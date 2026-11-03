import { expect, test, type Page } from '@playwright/test';
import type * as UIModule from '../src/state/ui';
import { createBoard, openBoard, signUp } from './helpers';

type Obj = Record<string, unknown> & { id: string; type: string };

async function customColor(page: Page, hex: string) {
  await page.getByTestId('custom-color').click();
  await page.getByTestId('custom-color-hex').fill(hex);
  await page.getByTestId('custom-color-hex').press('Enter');
}

const all = (page: Page) =>
  page.evaluate(() => [...window.__canvasly!.store.all()] as unknown as Record<string, unknown>[]) as Promise<
    Obj[]
  >;
const ofType = async (page: Page, type: string) => (await all(page)).filter((o) => o.type === type);
const first = async (page: Page, type: string) => (await ofType(page, type))[0]!;

async function addText(page: Page, text: string, x = 700, y = 450) {
  await page.keyboard.press('t');
  await page.getByTestId('board-canvas').click({ position: { x, y } });
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await first(page, 'text')).text).toBe(text);
}

/** Drag the mouse through points, as a hand-drawn stroke. */
async function draw(page: Page, points: [number, number][]) {
  await page.mouse.move(...points[0]!);
  await page.mouse.down();
  for (const [x, y] of points.slice(1)) await page.mouse.move(x, y, { steps: 6 });
  await page.mouse.up();
}

const rectangle: [number, number][] = [
  [400, 300],
  [700, 302],
  [698, 500],
  [402, 498],
  [400, 300],
];

test.beforeEach(async ({ page }) => {
  await signUp(page.request);
  await openBoard(page, await createBoard(page.request));
});

test('text toolbar: format, align, size, colors and custom color', async ({ page }) => {
  await addText(page, 'Styled');
  const before = await first(page, 'text');

  await page.getByTestId('text-format').click();
  await page.getByTestId('format-bold').click();
  await page.getByTestId('format-italic').click();
  await page.getByTestId('format-underline').click();
  await page.getByTestId('format-strike').click();
  await expect
    .poll(() => first(page, 'text'))
    .toMatchObject({ bold: true, italic: true, underline: true, strike: true });
  expect((await first(page, 'text')).w).not.toBe(before.w); // bold is wider, and the box follows

  await page.getByTestId('format-strike').click(); // toggles back off
  await expect.poll(async () => (await first(page, 'text')).strike).toBe(false);

  await page.getByTestId('text-align').click();
  await page.getByTestId('align-center').click();
  await expect.poll(async () => (await first(page, 'text')).align).toBe('center');

  // Steps to the next common size, and typing sets any size.
  await page.getByRole('button', { name: 'Bigger text' }).click();
  await expect.poll(async () => (await first(page, 'text')).fontSize).toBe(30);
  const size = page.getByTestId('font-size');
  await size.fill('57');
  await size.press('Enter');
  await expect.poll(async () => (await first(page, 'text')).fontSize).toBe(57);
  await page.getByRole('button', { name: 'Smaller text' }).click();
  await expect.poll(async () => (await first(page, 'text')).fontSize).toBe(48);

  await page.getByRole('button', { name: 'Highlight' }).click();
  await page.getByRole('button', { name: 'Color #f5d128' }).click();
  await expect.poll(async () => (await first(page, 'text')).highlight).toBe('#f5d128');

  // Any color through the custom picker.
  await page.getByRole('button', { name: 'Text color' }).click();
  await customColor(page, '#12ab34');
  await expect.poll(async () => (await first(page, 'text')).color).toBe('#12ab34');
  await page.getByRole('button', { name: 'Background' }).click();
  await customColor(page, '#fedcba');
  await expect.poll(async () => (await first(page, 'text')).background).toBe('#fedcba');
});

test('more fonts, with the box refitting to each', async ({ page }) => {
  await addText(page, 'Fonts for everyone');
  const widths = new Set<unknown>();
  for (const font of ['abril', 'bangers', 'garamond', 'plexmono']) {
    await page.getByTestId('font-picker').click();
    await page.getByTestId(`font-${font}`).click();
    await expect.poll(async () => (await first(page, 'text')).font).toBe(font);
    widths.add((await first(page, 'text')).w);
  }
  expect(widths.size).toBe(4);
  expect(await page.evaluate(() => document.fonts.check('16px "Abril Fatface"'))).toBe(true);
});

test('lists toggle from the toolbar and continue on Enter', async ({ page }) => {
  await addText(page, 'one');
  await page.getByTestId('text-list').click();
  await page.getByTestId('list-bullet').click();
  await expect.poll(async () => (await first(page, 'text')).text).toBe('• one');

  await page.keyboard.press('Enter'); // start editing
  await page.keyboard.press('Enter');
  await page.keyboard.type('two');
  await expect.poll(async () => (await first(page, 'text')).text).toBe('• one\n• two');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // an empty item ends the list
  await page.keyboard.type('plain');
  await expect.poll(async () => (await first(page, 'text')).text).toBe('• one\n• two\nplain');
  await page.keyboard.press('Escape');
  expect((await first(page, 'text')).h).toBeCloseTo(3 * 24 * 1.25, 0);
});

test('links: unsafe addresses are refused, and Ctrl+click follows a saved one', async ({ page, context }) => {
  await addText(page, 'Site');
  await page.getByTestId('link-button').click();
  await page.getByTestId('link-input').fill('javascript:alert(1)');
  await page.getByTestId('link-apply').click();
  await expect(page.getByText('Links must be http, https or mailto.')).toBeVisible();
  expect((await first(page, 'text')).link).toBeNull();

  await page.getByTestId('link-input').fill('example.com/page');
  await page.getByTestId('link-apply').click();
  await expect.poll(async () => (await first(page, 'text')).link).toBe('https://example.com/page');

  await context.route('https://example.com/**', (r) => r.fulfill({ body: 'ok' }));
  const o = await first(page, 'text');
  const opened = context.waitForEvent('page');
  await page.keyboard.down('Control');
  await page.mouse.click(700 + (o.x as number) + 5, 450 + (o.y as number) + 5);
  await page.keyboard.up('Control');
  expect((await opened).url()).toBe('https://example.com/page');
});

test('comment, more menu and changing the object type from the toolbar', async ({ page }) => {
  await addText(page, 'Convert me');
  const { id } = await first(page, 'text');

  await page.getByTestId('selection-comment').click();
  await expect(page.getByText('New comment')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('New comment')).toHaveCount(0);

  await page.getByTestId('convert-menu').click();
  await page.getByRole('menuitem', { name: 'Sticky note' }).click();
  await expect.poll(async () => (await all(page)).map((o) => o.type)).toEqual(['sticky']);
  expect(await first(page, 'sticky')).toMatchObject({ id, text: 'Convert me' });

  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await all(page)).map((o) => o.type)).toEqual(['text']);

  await page.mouse.click(1000, 800);
  const o = await first(page, 'text');
  await page.mouse.click(700 + (o.x as number) + 5, 450 + (o.y as number) + 5);
  await page.getByTestId('selection-more').click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect.poll(async () => (await ofType(page, 'text')).length).toBe(2);
});

test('pen presets: pick one, and set a custom color and size', async ({ page }) => {
  await page.getByTestId('tool-pen').click();
  await page.getByTestId('pen-preset-1').click();
  await draw(page, [
    [400, 300],
    [500, 340],
  ]);
  await expect.poll(async () => (await first(page, 'pen')).stroke).toBe('#e03131');

  await customColor(page, '#7048e8');
  await page.getByTestId('pen-preset-1').click(); // the active preset opens its editor
  await page.getByTestId('pen-size').fill('20');
  await draw(page, [
    [400, 500],
    [500, 540],
  ]);
  await expect.poll(async () => (await ofType(page, 'pen')).length).toBe(2);
  expect((await ofType(page, 'pen'))[1]).toMatchObject({ stroke: '#7048e8', size: 20 });

  // Presets are remembered.
  await page.reload();
  await page.getByTestId('board-canvas').waitFor();
  await page.getByTestId('tool-pen').click();
  await draw(page, [
    [800, 300],
    [900, 340],
  ]);
  await expect.poll(async () => (await ofType(page, 'pen')).length).toBe(3);
  expect((await ofType(page, 'pen'))[2]).toMatchObject({ stroke: '#7048e8', size: 20 });
});

test('smart drawing turns a sketch into a shape, and keeps ink it cannot read', async ({ page }) => {
  await page.getByTestId('tool-pen').click();
  await page.getByTestId('tool-smartpen').click();
  await draw(page, rectangle);
  await expect.poll(async () => (await all(page)).map((o) => o.type)).toEqual(['rect']);
  expect(await first(page, 'rect')).toMatchObject({ fill: 'transparent', stroke: '#1a1a1a' });

  await draw(page, [
    [800, 300],
    [950, 450],
  ]);
  await expect.poll(async () => (await all(page)).map((o) => o.type).sort()).toEqual(['connector', 'rect']);

  await draw(page, [
    [300, 600],
    [340, 700],
    [380, 600],
    [420, 700],
    [460, 600],
  ]);
  await expect
    .poll(async () => (await all(page)).map((o) => o.type).sort())
    .toEqual(['connector', 'pen', 'rect']);
});

test('the eraser cuts strokes in two; the stroke eraser removes them; each is one undo', async ({ page }) => {
  await page.getByTestId('tool-pen').click();
  await draw(page, [
    [300, 400],
    [900, 400],
  ]);
  await expect.poll(async () => (await ofType(page, 'pen')).length).toBe(1);

  await page.getByTestId('tool-spoteraser').click();
  await draw(page, [
    [600, 350],
    [600, 450],
  ]);
  await expect.poll(async () => (await ofType(page, 'pen')).length).toBe(2);
  const pieces = await ofType(page, 'pen');
  const spans = pieces
    .map((p) => [p.x as number, (p.x as number) + (p.w as number)])
    .sort((a, b) => a[0]! - b[0]!);
  // Both sides of the cut remain, with a gap where the eraser went (world x 0 is at screen x 700).
  expect(spans[0]![1]).toBeLessThan(-100);
  expect(spans[1]![0]).toBeGreaterThan(-100);
  expect(spans[0]![0]).toBeCloseTo(-400, -1);
  expect(spans[1]![1]).toBeCloseTo(200, -1);

  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await ofType(page, 'pen')).length).toBe(1);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => (await ofType(page, 'pen')).length).toBe(2);

  await page.getByTestId('tool-eraser').click();
  await draw(page, [
    [400, 380],
    [400, 420],
  ]);
  await expect.poll(async () => (await ofType(page, 'pen')).length).toBe(1);
});

test('the lasso selects what it encircles and hands over to the select tool', async ({ page }) => {
  await page.keyboard.press('r');
  await page.getByTestId('board-canvas').click({ position: { x: 500, y: 400 } });
  await page.keyboard.press('r');
  await page.getByTestId('board-canvas').click({ position: { x: 1000, y: 400 } });
  await page.mouse.click(700, 800);
  await expect.poll(async () => (await all(page)).length).toBe(2);
  const left = (await all(page)).sort((a, b) => (a.x as number) - (b.x as number))[0]!;

  await page.getByTestId('tool-pen').click();
  await page.getByTestId('tool-lasso').click();
  await draw(page, [
    [350, 280],
    [650, 280],
    [650, 520],
    [350, 520],
    [350, 280],
  ]);
  await expect
    .poll(() =>
      page.evaluate(async (url) => {
        const mod = (await import(/* @vite-ignore */ url)) as typeof UIModule;
        const { selectedIds, tool } = mod.useUI.getState();
        return { selectedIds, tool };
      }, '/src/state/ui.ts'),
    )
    .toEqual({ selectedIds: [left.id], tool: 'select' });
});

test('styled text survives a reload', async ({ page }) => {
  await addText(page, 'Saved');
  await page.getByTestId('text-format').click();
  await page.getByTestId('format-bold').click();
  await page.getByTestId('font-picker').click();
  await page.getByTestId('font-oswald').click();
  await expect.poll(async () => (await first(page, 'text')).font).toBe('oswald');
  await page.waitForTimeout(300);
  await page.reload();
  await page.getByTestId('board-canvas').waitFor();
  await expect
    .poll(() => first(page, 'text').catch(() => null))
    .toMatchObject({ font: 'oswald', bold: true });
});
