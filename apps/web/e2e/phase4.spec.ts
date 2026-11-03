import { expect, test, type Browser, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createBoard, openBoard, signUp, type TestUser } from './helpers';

const count = (page: Page) => page.evaluate(() => window.__canvasly!.store.size);
const types = (page: Page) =>
  page.evaluate(() => [...window.__canvasly!.store.all()].map((o) => o.type).sort());

async function newSignedInPage(browser: Browser): Promise<{ page: Page; user: TestUser }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const user = await signUp(page.request);
  return { page, user };
}

async function addSticky(page: Page, x: number, y: number, text: string) {
  await page.keyboard.press('n');
  await page.getByTestId('board-canvas').click({ position: { x, y } });
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
}

test('sharing: invite a viewer, upgrade to editor live, then remove', async ({ browser }) => {
  test.setTimeout(60_000);
  const { page: owner } = await newSignedInPage(browser);
  const { page: guest, user: guestUser } = await newSignedInPage(browser);
  const boardId = await createBoard(owner.request, 'Shared board');
  await openBoard(owner, boardId);
  await addSticky(owner, 500, 400, 'Owner note');

  // Invite the existing account as a viewer through the share dialog.
  await owner.getByTestId('share-button').click();
  await owner.getByTestId('invite-email').fill(guestUser.email);
  await owner.getByLabel('Role', { exact: true }).click();
  await owner.getByRole('option', { name: 'Viewer' }).click();
  await owner.getByRole('button', { name: 'Invite' }).click();
  await expect(owner.getByTestId('share-message')).toContainText(`Added ${guestUser.name}`);

  // Viewer: sees content, gets a view-only UI.
  await openBoard(guest, boardId);
  await expect(guest.getByTestId('view-only-badge')).toBeVisible();
  await expect.poll(() => count(guest)).toBe(1);
  await expect(guest.getByTestId('tool-sticky')).toHaveCount(0);
  await expect(guest.getByTestId('tool-comment')).toBeVisible();

  // Even a write forced around the UI never reaches anyone: the Durable Object drops viewer updates.
  await guest.evaluate(() => {
    const b = window.__canvasly!;
    b.doc.transact(() => b.objects.forEach((_, id) => b.objects.delete(id)));
  });
  await owner.waitForTimeout(500);
  expect(await count(owner)).toBe(1);

  // Upgrade to editor: the guest's UI unlocks without a reload, and their edits sync.
  await owner.getByLabel(`Role for ${guestUser.name}`).click();
  await owner.getByRole('option', { name: 'Editor' }).click();
  await expect(guest.getByTestId('view-only-badge')).toHaveCount(0);
  await guest.keyboard.press('r');
  await guest.getByTestId('board-canvas').click({ position: { x: 900, y: 650 } });
  await expect.poll(() => types(owner)).toContain('rect');

  // Remove: the guest is disconnected immediately.
  await owner.getByLabel(`Remove ${guestUser.name}`).click();
  await expect(guest.getByText('Your access to this board was removed.')).toBeVisible();
  const res = await guest.request.get(`/api/boards/${boardId}`);
  expect(res.status()).toBe(404);
});

test('public view-only link works signed out and can be disabled', async ({ browser }) => {
  const { page: owner } = await newSignedInPage(browser);
  const boardId = await createBoard(owner.request, 'Public board');
  await openBoard(owner, boardId);
  await addSticky(owner, 500, 400, 'Hello public');
  const settings = await (
    await owner.request.put(`/api/boards/${boardId}/link`, { data: { role: 'viewer' } })
  ).json();
  const token = (settings as { linkToken: string }).linkToken;

  const anonCtx = await browser.newContext();
  const anon = await anonCtx.newPage();
  await anon.goto(`/s/${token}`);
  await expect(anon.getByTestId('connection-status')).toHaveAttribute('data-status', 'online');
  await expect(anon.getByText('Public board')).toBeVisible();
  await expect(anon.getByTestId('view-only-badge')).toBeVisible();
  await expect.poll(() => count(anon)).toBe(1);
  await expect(anon.getByTestId('tool-comment')).toHaveCount(0); // anonymous visitors can't comment
  // No access to anything that isn't the public board.
  expect((await anon.request.get(`/api/boards/${boardId}`)).status()).toBe(401);

  await owner.request.put(`/api/boards/${boardId}/link`, { data: { role: null } });
  await expect(anon.getByText('This link was disabled.')).toBeVisible();
  await anonCtx.close();
});

test('editor link: a signed-in user who opens it joins as an editor', async ({ browser }) => {
  const { page: owner } = await newSignedInPage(browser);
  const boardId = await createBoard(owner.request, 'Team board');
  const settings = await (
    await owner.request.put(`/api/boards/${boardId}/link`, { data: { role: 'editor' } })
  ).json();
  const { page: joiner } = await newSignedInPage(browser);
  await joiner.goto(`/s/${(settings as { linkToken: string }).linkToken}`);
  await expect(joiner).toHaveURL(new RegExp(`/b/${boardId}$`));
  await expect(joiner.getByTestId('connection-status')).toHaveAttribute('data-status', 'online');
  await expect(joiner.getByTestId('view-only-badge')).toHaveCount(0);
  await expect(joiner.getByTestId('tool-sticky')).toBeVisible();
});

test('comments: a viewer comments, the owner replies and resolves', async ({ browser }) => {
  test.setTimeout(45_000);
  const { page: owner } = await newSignedInPage(browser);
  const { page: viewer, user: viewerUser } = await newSignedInPage(browser);
  const boardId = await createBoard(owner.request, 'Feedback');
  await owner.request.post(`/api/boards/${boardId}/invites`, {
    data: { email: viewerUser.email, role: 'viewer' },
  });
  await openBoard(owner, boardId);
  await openBoard(viewer, boardId);

  await viewer.keyboard.press('c');
  await viewer.getByTestId('board-canvas').click({ position: { x: 600, y: 400 } });
  await viewer.getByTestId('comment-input').fill('Can we make this bigger?');
  await viewer.keyboard.press('Enter');

  await expect(owner.getByTestId('comment-pin')).toHaveCount(1);
  await owner.getByTestId('comment-pin').click();
  await expect(owner.getByTestId('comment')).toContainText(viewerUser.name);
  await owner.getByTestId('comment-input').fill('Done!');
  await owner.keyboard.press('Enter');
  await expect(viewer.getByTestId('comment-pin')).toContainText('2');

  await owner.getByTestId('resolve-thread').click();
  await owner.getByRole('button', { name: 'Close' }).first().click();
  await expect(viewer.getByTestId('comment-pin')).toHaveCount(0); // resolved threads hide by default
  await viewer.getByTestId('comments-toggle').click();
  await viewer.getByLabel('Show resolved').check();
  await expect(viewer.getByTestId('comments-panel')).toContainText('Can we make this bigger?');
});

test('templates, frames, presentation, export and import', async ({ page }) => {
  test.setTimeout(60_000);
  await signUp(page.request);
  await page.goto('/');
  await page.getByTestId('new-board').first().click();
  await page.getByTestId('template-kanban').click();
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-status', 'online');
  await expect.poll(() => types(page)).toContain('frame');

  // Frames panel lists the template's columns; presentation steps through them.
  await page.getByTestId('frames-toggle').click();
  await expect(page.getByTestId('frame-list').locator('li')).toHaveCount(3);
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await expect(page.getByTestId('presentation-bar')).toContainText('1 / 3 · To do');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('presentation-bar')).toContainText('2 / 3 · Doing');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('presentation-bar')).toHaveCount(0);

  // PNG and PDF downloads.
  for (const [label, ext] of [
    ['Board as PNG', '.png'],
    ['PDF (one page per frame)', '.pdf'],
  ] as const) {
    await page.getByTestId('export-menu').click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: label }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(new RegExp(`${ext.replace('.', '\\.')}$`));
    const bytes = await readFile((await file.path())!);
    expect(bytes.length).toBeGreaterThan(1000);
    if (ext === '.pdf') expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
  }

  // JSON round trip: export, then import into the same board doubles the content.
  const before = await count(page);
  await page.getByTestId('export-menu').click();
  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Board file (.json)' }).click();
  const jsonPath = (await (await jsonDownload).path())!;
  await page.getByTestId('import-input').setInputFiles(jsonPath);
  await expect.poll(() => count(page)).toBe(before * 2);

  // Theme cycles system -> light -> dark.
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveClass(/dark/);
});

test('touch: one-finger pan, pinch zoom and double-tap to edit on a phone', async ({
  browser,
  playwright,
}) => {
  const ctx = await browser.newContext({ ...playwright.devices['Pixel 7'] });
  const page = await ctx.newPage();
  await signUp(page.request);
  const boardId = await createBoard(page.request, 'Mobile');
  await openBoard(page, boardId);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ ...p, id })) });
  const camera = () =>
    page.evaluate(async (url) => {
      const mod = (await import(/* @vite-ignore */ url)) as {
        useViewport: { getState(): { camera: { x: number; y: number; zoom: number } } };
      };
      return mod.useViewport.getState().camera;
    }, '/src/state/viewport.ts');

  // Toolbar moves to the bottom on small screens; minimap and zoom controls are hidden.
  const bar = await page.getByRole('toolbar', { name: 'Tools' }).boundingBox();
  expect(bar!.y).toBeGreaterThan(page.viewportSize()!.height / 2);
  await expect(page.getByLabel('Minimap')).toBeHidden();

  // One finger on empty canvas pans.
  const c0 = await camera();
  await touch('touchStart', [{ x: 200, y: 400 }]);
  for (let i = 1; i <= 5; i++) await touch('touchMove', [{ x: 200 + i * 20, y: 400 + i * 10 }]);
  await touch('touchEnd', []);
  const c1 = await camera();
  expect(Math.round(c1.x - c0.x)).toBe(100);
  expect(Math.round(c1.y - c0.y)).toBe(50);

  // Two fingers moving apart zoom in.
  await touch('touchStart', [
    { x: 150, y: 400 },
    { x: 250, y: 400 },
  ]);
  for (let i = 1; i <= 5; i++)
    await touch('touchMove', [
      { x: 150 - i * 10, y: 400 },
      { x: 250 + i * 10, y: 400 },
    ]);
  await touch('touchEnd', []);
  expect((await camera()).zoom).toBeCloseTo(c1.zoom * 2, 1);

  // Create a sticky, then double-tap it to edit.
  await page.getByTestId('tool-sticky').tap();
  await page.getByTestId('board-canvas').tap({ position: { x: 200, y: 450 } });
  await page.keyboard.press('Escape');
  await expect(page.locator('textarea')).toHaveCount(0);
  await page.getByTestId('board-canvas').tap({ position: { x: 200, y: 450 } });
  await page.getByTestId('board-canvas').tap({ position: { x: 200, y: 450 } });
  await expect(page.locator('textarea')).toHaveCount(1);
  await ctx.close();
});
