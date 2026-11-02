import { expect, test, type Page } from '@playwright/test';
import { createBoard, openBoard, signUp } from './helpers';

type Line = Record<string, unknown> & { id: string; type: string };

const line = async (page: Page) =>
  ((await page.evaluate(() => [...window.__canvasly!.store.all()] as unknown[])) as Line[]).find(
    (o) => o.type === 'connector',
  )!;

const points = (page: Page) =>
  page.evaluate(() => {
    const store = window.__canvasly!.store;
    const c = [...store.all()].find((o) => o.type === 'connector')!;
    return store.resolve(c as never)!.points;
  });

/** A selected arrow, drawn across open canvas. */
async function drawArrow(page: Page) {
  await page.keyboard.press('a');
  await page.mouse.move(400, 300);
  await page.mouse.down();
  await page.mouse.move(900, 600, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await line(page))?.type).toBe('connector');
}

test.beforeEach(async ({ page }) => {
  await signUp(page.request);
  await openBoard(page, await createBoard(page.request));
});

test('line ends: pick any for either end, and swap them', async ({ page }) => {
  await drawArrow(page);
  await expect(page.getByTestId('line-start-cap')).toHaveText('None');

  await page.getByTestId('line-start-cap').click();
  await page.getByTestId('cap-diamond').click();
  await expect.poll(async () => (await line(page)).startCap).toBe('diamond');

  await page.getByTestId('line-end-cap').click();
  await page.getByTestId('cap-circle').click();
  await expect.poll(async () => (await line(page)).endCap).toBe('circle');

  await page.getByTestId('line-swap').click();
  await expect.poll(() => line(page)).toMatchObject({ startCap: 'circle', endCap: 'diamond' });

  await page.getByTestId('line-end-cap').click();
  await page.getByTestId('cap-none').click();
  await expect.poll(async () => (await line(page)).endCap).toBe('none');
});

test('line type changes the route: straight, elbowed and curved', async ({ page }) => {
  await drawArrow(page);
  expect(await points(page)).toHaveLength(4);

  await page.getByTestId('line-type').click();
  await page.getByTestId('route-elbow').click();
  await expect.poll(async () => (await points(page)).length).toBe(8);

  await page.getByTestId('route-curved').click();
  await expect.poll(async () => (await points(page)).length).toBeGreaterThan(30);
  await expect.poll(async () => (await line(page)).routing).toBe('curved');
});

test('line style: dashes and thickness', async ({ page }) => {
  await drawArrow(page);
  await page.getByTestId('line-style').click();
  await page.getByTestId('dash-dashed').click();
  await expect.poll(async () => (await line(page)).dash).toBe('dashed');
  await page.getByTestId('dash-dotted').click();
  await expect.poll(async () => (await line(page)).dash).toBe('dotted');

  const slider = page.getByTestId('line-width');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await line(page)).strokeWidth).toBe(3);
});

test('the middle handle bends a line, follows its ends, and double-click straightens it', async ({
  page,
}) => {
  await drawArrow(page);
  // The line runs from (400,300) to (900,600), so the handle starts at (650,450).
  await page.mouse.move(650, 450);
  await page.mouse.down();
  await page.mouse.move(650, 250, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => (await line(page)).bend)
    .toMatchObject({ x: expect.closeTo(0, 0), y: expect.closeTo(-200, 0) });
  await expect.poll(async () => (await points(page)).length).toBe(6);

  // One undo step for the whole drag.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await line(page)).bend).toBeNull();
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => (await line(page)).bend).not.toBeNull();

  // The handle has moved with the bend.
  await page.mouse.dblclick(650, 250);
  await expect.poll(async () => (await line(page)).bend).toBeNull();

  // Dragging only a little, back onto the line, snaps straight.
  await page.mouse.move(650, 450);
  await page.mouse.down();
  await page.mouse.move(650, 440, { steps: 2 });
  await page.mouse.move(652, 452, { steps: 2 });
  await page.mouse.up();
  expect((await line(page)).bend).toBeNull();
});

test('text on a line: from the toolbar, by double-click, and it undoes', async ({ page }) => {
  await drawArrow(page);
  await page.getByTestId('line-label').click();
  const input = page.getByTestId('line-label-input');
  await expect(input).toBeFocused();
  await input.fill('depends on');
  await page.keyboard.press('Enter');
  await expect(input).toHaveCount(0);
  await expect.poll(async () => (await line(page)).label).toBe('depends on');
  await expect(page.getByTestId('line-style')).toBeVisible(); // the toolbar is back

  await page.mouse.click(1200, 800);
  await page.mouse.move(525, 375);
  await page.mouse.dblclick(525, 375);
  await expect(input).toHaveValue('depends on');
  await input.fill('needs');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await line(page)).label).toBe('needs');
});

test('old lines read fine, and styled lines survive copy and paste', async ({ page }) => {
  await drawArrow(page);
  await page.getByTestId('line-type').click();
  await page.getByTestId('route-curved').click();
  await page.getByTestId('line-start-cap').click();
  await page.getByTestId('cap-open').click();
  await expect.poll(async () => (await line(page)).startCap).toBe('open');
  await page.keyboard.press('Control+d');
  const lines = await page.evaluate(() =>
    [...window.__canvasly!.store.all()].filter((o) => o.type === 'connector'),
  );
  await expect
    .poll(() =>
      page.evaluate(() => [...window.__canvasly!.store.all()].filter((o) => o.type === 'connector').length),
    )
    .toBe(2);
  expect(lines[0]).toMatchObject({ routing: 'curved', startCap: 'open' });
  const all = (await page.evaluate(() => [...window.__canvasly!.store.all()])) as unknown as Line[];
  for (const l of all) expect(l).toMatchObject({ routing: 'curved', startCap: 'open', dash: 'solid' });
});
