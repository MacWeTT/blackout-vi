const { test, expect, stateOf } = require('./fixtures');

const TAG = 'ytd-rich-item-renderer';

// a tile with a channel: link and name like search results, or name only like the watch-page sidebar
const addChannelTile = (page, title, channel) => {
  return page.evaluate(
    ([text, { handle, name }]) => {
      const tile = document.createElement('ytd-rich-item-renderer');
      const link = handle ? `<a href="/@${handle}">${name}</a>` : '';
      const nameOnly = handle
        ? ''
        : `<yt-content-metadata-view-model><span>${name}</span></yt-content-metadata-view-model>`;

      tile.innerHTML = `<ytd-channel-name>${link}</ytd-channel-name>${nameOnly}<div>${text}</div>`;
      document.getElementById('feed').append(tile);
    },
    [title, channel],
  );
};

const DF = { handle: 'DigitalFoundry', name: 'Digital Foundry' };
// not in the fixture's synced subscriptions list
const OTHER = { handle: 'SomeoneElse', name: 'Someone Else' };
const SUBS = { '@digitalfoundry': 'Digital Foundry' };

test.describe('subscriptions mode', () => {
  test('same rules: a subscribed channel is hidden like any other', async ({ openFixture }) => {
    const page = await openFixture({ subsMode: 'same', subs: SUBS });

    await addChannelTile(page, 'GTA 6 gameplay first hour', DF);
    await expect.poll(() => stateOf(page, 0)).toBe('blocked');
  });

  test('allow gameplay: gameplay shows, story spoilers stay hidden', async ({ openFixture }) => {
    const page = await openFixture({ subsMode: 'gameplay', subs: SUBS });

    await addChannelTile(page, 'GTA 6 gameplay first hour', DF);
    await addChannelTile(page, 'GTA 6 ending explained', DF);
    await expect.poll(() => stateOf(page, 0)).toBe('ok');
    await expect.poll(() => stateOf(page, 1)).toBe('blocked');
  });

  test('allow all: even a story spoiler from a subscription shows', async ({ openFixture }) => {
    const page = await openFixture({ subsMode: 'all', subs: SUBS });

    await addChannelTile(page, 'GTA 6 ending explained', DF);
    await expect.poll(() => stateOf(page, 0)).toBe('ok');
  });

  test('another channel is still hidden', async ({ openFixture }) => {
    const page = await openFixture({ subsMode: 'all', subs: SUBS });

    await addChannelTile(page, 'GTA 6 gameplay first hour', { handle: 'SomeoneElse', name: 'Someone Else' });
    await expect.poll(() => stateOf(page, 0)).toBe('blocked');
  });

  test('a tile with no identifiable channel is hidden even when everything is trusted', async ({ openFixture }) => {
    const page = await openFixture({ subsMode: 'all', subs: SUBS });

    await page.evaluate(() => {
      const tile = document.createElement('ytd-rich-item-renderer');

      tile.textContent = 'GTA 6 gameplay first hour';
      document.getElementById('feed').append(tile);
    });
    await expect.poll(() => stateOf(page, 0)).toBe('blocked');
  });

  test('a name-only tile (sidebar style) matches by channel name', async ({ openFixture }) => {
    const page = await openFixture({ subsMode: 'gameplay', subs: SUBS });

    await addChannelTile(page, 'GTA 6 gameplay first hour', { handle: '', name: 'Digital Foundry' });
    await expect.poll(() => stateOf(page, 0)).toBe('ok');
  });
});

test.describe('trust badge on the card', () => {
  test('clicking it trusts the channel, shows a toast, and undo brings the card back', async ({ openFixture }) => {
    const page = await openFixture({ subsMode: 'all' });

    await addChannelTile(page, 'GTA 6 gameplay first hour', OTHER);
    await expect.poll(() => stateOf(page, 0)).toBe('blocked');

    const badge = page.locator('.gv-card__trust');

    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('data-name', 'Someone Else');
    await badge.click();
    await expect.poll(() => stateOf(page, 0)).toBe('ok');
    await expect(page.locator('#gv-toast')).toContainText('Someone Else trusted');

    await page.locator('#gv-toast button').click();
    await expect.poll(() => stateOf(page, 0)).toBe('blocked');
  });

  test('the badge does not reveal the tile or navigate', async ({ openFixture }) => {
    const page = await openFixture({ subsMode: 'gameplay' });

    await addChannelTile(page, 'GTA 6 ending explained', OTHER);
    await expect.poll(() => stateOf(page, 0)).toBe('blocked');
    await page.locator('.gv-card__trust').click();
    // story spoilers from trusted channels stay hidden in this mode, so the card is still there
    await expect.poll(() => stateOf(page, 0)).toBe('blocked');
    await expect(page.locator('#gv-toast')).toContainText('Story spoilers stay hidden');
  });

  test('no badge when the channel is unknown', async ({ openFixture }) => {
    const page = await openFixture();

    await page.evaluate(() => {
      const tile = document.createElement('ytd-rich-item-renderer');

      tile.textContent = 'GTA 6 gameplay first hour';
      document.getElementById('feed').append(tile);
    });
    await expect.poll(() => stateOf(page, 0)).toBe('blocked');
    await expect(page.locator('.gv-card__trust')).toBeHidden();
  });
});

test('a stat beside the channel is never used as its name', async ({ openFixture }) => {
  const page = await openFixture();

  await page.evaluate(() => {
    const tile = document.createElement('ytd-rich-item-renderer');

    // like a home-feed lockup: an avatar link with no text, then "194K views" and the age as the first spans
    tile.innerHTML =
      '<a href="/@rockstargames"><img alt=""></a><div>GTA 6 gameplay first hour</div>' +
      '<yt-content-metadata-view-model><span>194K views</span><span>2 days ago</span></yt-content-metadata-view-model>';
    document.getElementById('feed').append(tile);
  });
  await expect.poll(() => stateOf(page, 0)).toBe('blocked');
  await expect(page.locator('.gv-card__trust')).toHaveAttribute('data-name', '@rockstargames');
});

test('Sync now works from the popup alone, with no YouTube tab open', async ({ context, extensionId }) => {
  const popup = await context.newPage();

  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  await popup.click('#manage');
  await popup.click('#sync');
  await expect(popup.locator('.channel__name')).toHaveText(['Digital Foundry', 'Rockstar Games'], { timeout: 8000 });
  await expect(popup.locator('#syncTitle')).toContainText('Synced');
  await expect(popup.locator('.channel__tag').first()).toHaveText('subscribed');
});
