import { expect, test, type Page } from '@playwright/test';
import type * as ViewportModule from '../src/state/viewport';
import { createBoard, openBoard, signIn, signUp } from './helpers';

const types = (page: Page) =>
  page.evaluate(() => [...window.__canvasly!.store.all()].map((o) => o.type).sort());

const objectOfType = (page: Page, type: string) =>
  page.evaluate(
    (t) => [...window.__canvasly!.store.all()].find((o) => o.type === t) as Record<string, unknown>,
    type,
  );

/** World rect currently visible on a page. */
const visibleRect = (page: Page) =>
  page.evaluate(async (url) => {
    const mod = (await import(/* @vite-ignore */ url)) as typeof ViewportModule;
    return mod.useViewport.getState().visibleRect();
  }, '/src/state/viewport.ts');

test('two browsers edit the same board live', async ({ browser }) => {
  test.setTimeout(60_000);
  // Same account in two isolated browser contexts (separate cookies, IndexedDB, WebSockets).
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const user = await signUp(a.request);
  await signIn(b.request, user);
  const boardId = await createBoard(a.request, 'Collab');
  await openBoard(a, boardId);
  await openBoard(b, boardId);
  const canvasA = a.getByTestId('board-canvas');
  const canvasB = b.getByTestId('board-canvas');

  // 1. A creates a sticky; B sees it, text included.
  await a.keyboard.press('n');
  await canvasA.click({ position: { x: 500, y: 400 } });
  await a.keyboard.type('Hello from A');
  await a.keyboard.press('Escape');
  await expect.poll(() => objectOfType(b, 'sticky').then((o) => o?.text)).toBe('Hello from A');

  // 2. Presence: each sees the other in the header, and B's cursor shows up for A.
  await expect(a.getByTestId('presence-avatar')).toHaveCount(2);
  await b.mouse.move(900, 500);
  await b.mouse.move(910, 505);
  await expect(a.getByTestId('remote-cursor')).toHaveCount(1);
  await expect(a.getByTestId('remote-cursor')).toContainText(user.name);

  // 3. B selects and drags the sticky; A sees the move and B's selection.
  const before = (await objectOfType(a, 'sticky')) as { id: string; x: number };
  await b.mouse.move(500, 400);
  await b.mouse.down();
  await b.mouse.move(600, 450, { steps: 6 });
  await b.mouse.up();
  await expect
    .poll(async () => ((await objectOfType(a, 'sticky')) as { x: number }).x)
    .toBeCloseTo(before.x + 100, 0);
  await expect
    .poll(() => a.evaluate(() => window.__canvasly!.presence.getPeers().flatMap((p) => p.selection)))
    .toContain(before.id);

  // 4. Undo is per user: A's undo reverts A's rectangle, not B's ellipse or B's move.
  //    (Runs fast on purpose: each creation must still be its own undo step.)
  await a.keyboard.press('r');
  await canvasA.click({ position: { x: 300, y: 720 } });
  await b.keyboard.press('o');
  await canvasB.click({ position: { x: 950, y: 720 } });
  await expect.poll(() => types(a)).toEqual(['ellipse', 'rect', 'sticky']);
  await a.keyboard.press('Control+z');
  await expect.poll(() => types(b)).toEqual(['ellipse', 'sticky']);
  expect(((await objectOfType(b, 'sticky')) as { x: number }).x).toBeCloseTo(before.x + 100, 0);
  await b.keyboard.press('Control+z');
  await expect.poll(() => types(a)).toEqual(['sticky']);

  // 5. Follow: A follows B; when B pans, A's view tracks B's. A panning stops following.
  await a.getByTestId('presence-avatar').nth(1).click();
  await expect(a.getByTestId('follow-banner')).toBeVisible();
  await b.mouse.move(700, 500);
  await b.mouse.down({ button: 'right' });
  await b.mouse.move(400, 300, { steps: 5 });
  await b.mouse.up({ button: 'right' });
  await expect
    .poll(async () => {
      const [ra, rb] = await Promise.all([visibleRect(a), visibleRect(b)]);
      return Math.round(ra.x + ra.w / 2 - (rb.x + rb.w / 2));
    })
    .toBe(0);
  await a.mouse.move(700, 500);
  await a.mouse.wheel(0, 200);
  await expect(a.getByTestId('follow-banner')).toHaveCount(0);

  // 6. Offline: B's edits stay local, then sync when the connection returns.
  await ctxB.setOffline(true);
  await expect(b.getByTestId('connection-status')).not.toHaveAttribute('data-status', 'online');
  await b.keyboard.press('n');
  await canvasB.click({ position: { x: 1100, y: 300 } });
  await b.keyboard.press('Escape');
  expect(await types(b)).toEqual(['sticky', 'sticky']);
  await a.waitForTimeout(500);
  expect(await types(a)).toEqual(['sticky']);
  await ctxB.setOffline(false);
  await expect(b.getByTestId('connection-status')).toHaveAttribute('data-status', 'online', {
    timeout: 15_000,
  });
  await expect.poll(() => types(a)).toEqual(['sticky', 'sticky']);

  await ctxA.close();
  await ctxB.close();
});
