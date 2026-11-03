import { expect, test, type Browser, type Page } from '@playwright/test';
import { createBoard, signUp, type TestUser } from './helpers';

const signedIn = async (browser: Browser): Promise<{ page: Page; user: TestUser }> => {
  const page = await (await browser.newContext()).newPage();
  return { page, user: await signUp(page.request) };
};

async function inviteFromHome(page: Page, cardTitle: string, email: string, role: 'viewer' | 'editor') {
  const card = page.getByTestId('board-item').filter({ hasText: cardTitle });
  await card.hover();
  await card.getByTestId('board-share').click();
  await page.getByTestId('invite-email').fill(email);
  await page.getByLabel('Role', { exact: true }).click();
  await page.getByRole('option', { name: role === 'viewer' ? 'Viewer' : 'Editor' }).click();
  await page.getByRole('button', { name: 'Invite' }).click();
  await expect(page.getByTestId('share-message')).toContainText('Added');
}

test('a board can be shared from its card, and the home page shows it for both people', async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const { page: owner } = await signedIn(browser);
  const { page: guest, user: guestUser } = await signedIn(browser);
  await createBoard(owner.request, 'Launch plan');
  await createBoard(owner.request, 'Private notes');

  await owner.goto('/');
  await expect(owner.getByTestId('stat-total')).toHaveText('2');
  await expect(owner.getByTestId('stat-by-you')).toHaveText('0');
  await expect(owner.getByTestId('stat-with-you')).toHaveText('0');
  await expect(owner.getByTestId('board-badge')).toHaveCount(0);

  await inviteFromHome(owner, 'Launch plan', guestUser.email, 'viewer');
  await owner.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(owner.getByTestId('share-dialog')).toHaveCount(0);

  // The card and the numbers catch up as soon as the dialog closes.
  await expect(owner.getByTestId('stat-by-you')).toHaveText('1');
  const shared = owner.getByTestId('board-item').filter({ hasText: 'Launch plan' });
  await expect(shared.getByTestId('board-badge')).toHaveText('1');

  // The link setting shows up too.
  await shared.hover();
  await shared.getByRole('button', { name: 'Board options' }).click();
  await shared.getByRole('button', { name: 'Share', exact: true }).last().click();
  await owner.getByRole('radio', { name: /Anyone can view/ }).click();
  await expect(owner.getByTestId('share-link')).toBeVisible();
  await owner.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(shared.getByTestId('board-badge')).toHaveCount(2);
  await expect(shared).toContainText('Public');

  // The guest sees it as shared with them, without the owner's controls.
  await guest.goto('/');
  await expect(guest.getByTestId('stat-total')).toHaveText('1');
  await expect(guest.getByTestId('stat-with-you')).toHaveText('1');
  const card = guest.getByTestId('board-item');
  await expect(card).toContainText('Can view');
  await expect(card.getByTestId('board-share')).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Board options' })).toHaveCount(0);
  // Link settings are the owner's business.
  await expect(card).not.toContainText('Public');
});

test('someone invited before the share dialog finishes loading stays on the list', async ({ browser }) => {
  const { page: owner } = await signedIn(browser);
  const { user: guestUser } = await signedIn(browser);
  await createBoard(owner.request, 'Slow network');
  await owner.goto('/');

  // The dialog's first load gets its answer now, but only delivers it after the invite has gone through.
  let releaseLoad = () => {};
  const held = new Promise<void>((r) => (releaseLoad = r));
  await owner.route(/\/api\/boards\/[^/]+\/share$/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    await held;
    return route.fulfill({ response });
  });

  const card = owner.getByTestId('board-item').filter({ hasText: 'Slow network' });
  await card.hover();
  await card.getByTestId('board-share').click();
  await owner.getByTestId('invite-email').fill(guestUser.email);
  await owner.getByRole('button', { name: 'Invite' }).click();
  await expect(owner.getByTestId('share-message')).toContainText('Added');
  const list = owner.getByTestId('member-list');
  await expect(list).toContainText(guestUser.name);

  releaseLoad();
  await owner.waitForLoadState('networkidle');
  await owner.waitForTimeout(200);
  await expect(list).toContainText(guestUser.name);
});

test('filters count and narrow the list; sort and search work; the latest board is offered', async ({
  browser,
}) => {
  const { page } = await signedIn(browser);
  await createBoard(page.request, 'Zebra board');
  await createBoard(page.request, 'Apple board');
  await page.goto('/');

  await expect(page.getByTestId('filter-all')).toContainText('2');
  await expect(page.getByTestId('filter-mine')).toContainText('2');
  await expect(page.getByTestId('filter-shared')).toContainText('0');
  await expect(page.getByTestId('stat-week')).toHaveText('2');

  // Newest edit first by default, and that's the board to pick up again.
  const titles = page.getByTestId('board-item').locator('p.font-semibold');
  await expect(titles).toHaveText(['Apple board', 'Zebra board']);
  await expect(page.getByTestId('continue-board')).toContainText('Apple board');

  await page.getByTestId('board-sort').click();
  await page.getByRole('option', { name: 'Name' }).click();
  await expect(titles).toHaveText(['Apple board', 'Zebra board']);
  await page.getByTestId('board-sort').click();
  await page.getByRole('option', { name: 'Date created' }).click();
  await expect(titles).toHaveText(['Apple board', 'Zebra board']);

  await page.getByLabel('Search boards').fill('zeb');
  await expect(titles).toHaveText(['Zebra board']);
  await page.getByLabel('Search boards').fill('nothing like this');
  await expect(page.getByText('No boards match.')).toBeVisible();
  await page.getByLabel('Search boards').fill('');

  await page.getByTestId('filter-shared').click();
  await expect(page.getByTestId('board-item')).toHaveCount(0);
  await page.getByTestId('filter-mine').click();
  await expect(page.getByTestId('board-item')).toHaveCount(2);

  await page.getByTestId('continue-board').click();
  await expect(page).toHaveURL(/\/b\/[\w-]+$/);
});

test('a board made from a template gets its thumbnail once it has been opened', async ({ browser }) => {
  const { page } = await signedIn(browser);
  const res = await page.request.post('/api/boards', {
    data: { title: 'From a template', template: 'kanban' },
  });
  const { id } = (await res.json()) as { id: string };
  await page.goto('/');
  await expect(page.getByTestId('board-card').locator('img')).toHaveCount(0);

  await page.goto(`/b/${id}`);
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-status', 'online');
  await expect.poll(() => page.evaluate(() => window.__canvasly!.store.size)).toBeGreaterThan(0);
  await page.getByTestId('main-menu').click();
  await page.getByRole('menuitem', { name: 'Back to boards' }).click();
  await expect(page.getByTestId('board-card').locator('img')).toBeVisible();
});

test('a brand new account gets a welcome, not a wall of zeros', async ({ browser }) => {
  const { page } = await signedIn(browser);
  await page.goto('/');
  await expect(page.getByTestId('greeting')).toContainText(/Good|Up late/);
  await expect(page.getByText('Your space is ready')).toBeVisible();
  await expect(page.getByTestId('stats')).toHaveCount(0);
  await expect(page.getByTestId('continue-board')).toHaveCount(0);
  await expect(page.getByText('No boards yet')).toBeVisible();
});
