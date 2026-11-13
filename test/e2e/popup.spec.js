const { test, expect } = require('./fixtures');

const POPUP = id => `chrome-extension://${id}/src/popup/popup.html`;

test('popup saves level, subscriptions mode and panic mode and restores them', async ({ context, extensionId }) => {
  const popup = await context.newPage();

  await popup.goto(POPUP(extensionId));
  await expect(popup.locator('[data-level].levels__button--on')).toHaveText('News');
  await expect(popup.locator('[data-subs].levels__button--on')).toHaveText('Same rules');

  await popup.click('[data-level="story"]');
  await popup.click('[data-subs="gameplay"]');
  await popup.check('#panic');
  await expect(popup.locator('[data-level].levels__button--on')).toHaveText('Story');
  await expect(popup.locator('#desc')).toContainText('endings');
  await expect(popup.locator('#subsDesc')).toContainText('story spoilers stay hidden');

  await popup.reload();
  await expect(popup.locator('[data-level].levels__button--on')).toHaveText('Story');
  await expect(popup.locator('[data-subs].levels__button--on')).toHaveText('Allow gameplay');
  await expect(popup.locator('#panic')).toBeChecked();
});

test('panic mode is the last control on the main screen, below the subscriptions control', async ({
  context,
  extensionId,
}) => {
  const popup = await context.newPage();

  await popup.goto(POPUP(extensionId));

  const order = await popup.evaluate(() => {
    const top = id => document.getElementById(id).getBoundingClientRect().top;

    return [top('levels'), top('subs'), top('panic')];
  });

  expect(order).toEqual([...order].sort((a, b) => a - b));
});

test('changing the level in the popup reaches an open page', async ({ context, extensionId, openFixture }) => {
  const page = await openFixture();

  await page.evaluate(() => {
    const tile = document.createElement('ytd-rich-item-renderer');

    tile.textContent = 'GTA 6 gameplay first hour';
    document.getElementById('feed').append(tile);
  });
  await expect(page.locator('#feed > :first-child')).toHaveAttribute('data-gv-blocked', '');

  const popup = await context.newPage();

  await popup.goto(POPUP(extensionId));
  await popup.click('[data-level="story"]');
  await expect(page.locator('#feed > :first-child')).toHaveAttribute('data-gv-ok', '', { timeout: 5000 });
});
