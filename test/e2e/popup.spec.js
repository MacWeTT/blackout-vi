const { test, expect, addTile, stateOf } = require('./fixtures');

const POPUP = id => {
  return `chrome-extension://${id}/src/popup/popup.html`;
};

const openPopup = async (context, extensionId) => {
  const popup = await context.newPage();

  await popup.setViewportSize({ width: 340, height: 600 }); // Chrome never makes a popup taller than this
  await popup.goto(POPUP(extensionId));
  // wait for the first render from storage, so a click never races it
  await expect(popup.locator('#levels .levels__button--on')).toHaveCount(1);

  return popup;
};

const level = popup => {
  return popup.locator('#levels .levels__button--on');
};

// the popup must never need a scrollbar: its content has to fit in 600px
const expectNoScroll = async (popup, label) => {
  const height = await popup.evaluate(() => {
    return document.documentElement.scrollHeight;
  });

  expect(height, label).toBeLessThanOrEqual(600);
};

const seedSubs = (popup, count) => {
  return popup.evaluate(total => {
    const subs = {};

    for (let i = 1; i <= total; i++) {
      subs[`@chan${i}`] = `Channel ${i}`;
    }

    return new Promise(resolve => {
      chrome.storage.local.set({ subs, syncedAt: Date.now() }, resolve);
    });
  }, count);
};

test.describe('layout', () => {
  test('defaults: Rules tab, News only, all sites, a gear for Settings', async ({ context, extensionId }) => {
    const popup = await openPopup(context, extensionId);

    await expect(popup.locator('[data-view="rules"]')).toHaveClass(/tabs__tab--on/);
    await expect(level(popup)).toHaveText('News only');
    await expect(popup.locator('#scopeChip')).toHaveText('All sites');
    await expect(popup.locator('#gear')).toBeVisible();
    await expectNoScroll(popup, 'rules');
  });

  test('the picture is only in the header band, so the palm trees show', async ({ context, extensionId }) => {
    const popup = await openPopup(context, extensionId);

    const look = await popup.evaluate(() => {
      const header = document.querySelector('.hd');

      return {
        bodyImage: getComputedStyle(document.body).backgroundImage,
        headerImage: getComputedStyle(header).backgroundImage,
        headerHeight: header.getBoundingClientRect().height,
      };
    });

    expect(look.bodyImage).toBe('none');
    expect(look.headerImage).toContain('background.jpg');
    expect(look.headerHeight).toBeLessThanOrEqual(110);
  });

  test('no screen needs scrolling, even with a long list and per-app cards', async ({ context, extensionId }) => {
    const popup = await openPopup(context, extensionId);

    await seedSubs(popup, 30);
    await popup.click('[data-view="trusted"]');
    await expect(popup.locator('.channel')).toHaveCount(30);
    await expectNoScroll(popup, 'trusted with a long list');

    await popup.click('#gear');
    await popup.uncheck('#global');
    await expect(popup.locator('.card')).toHaveCount(3);
    await expectNoScroll(popup, 'settings with per-app cards');

    await popup.click('#back');
    await expect(popup.locator('#summaryRows .box')).toHaveCount(3);
    await expectNoScroll(popup, 'rules, global off');
  });
});

test.describe('rules and settings', () => {
  test('the level is saved and restored', async ({ context, extensionId }) => {
    const popup = await openPopup(context, extensionId);

    await popup.click('[data-level="story"]');
    await expect(level(popup)).toHaveText('No story');
    await expect(popup.locator('#desc')).toContainText('endings');

    await popup.reload();
    await expect(level(popup)).toHaveText('No story');
  });

  test('Settings holds Global settings and Panic mode, and the gear and back both return', async ({
    context,
    extensionId,
  }) => {
    const popup = await openPopup(context, extensionId);

    await popup.click('#gear');
    await expect(popup.locator('#settings')).toBeVisible();
    await expect(popup.locator('#tabs')).toBeHidden();
    await expect(popup.locator('#global')).toBeChecked();
    await expect(popup.locator('#panic')).not.toBeChecked();
    await popup.check('#panic');

    await popup.click('#back');
    await expect(popup.locator('#rules')).toBeVisible();

    await popup.reload();
    await popup.click('#gear');
    await expect(popup.locator('#panic')).toBeChecked();
    await popup.click('#gear');
    await expect(popup.locator('#rules')).toBeVisible();
  });

  test('with Global settings off every app gets its own card, Reddit included, with no "coming soon"', async ({
    context,
    extensionId,
  }) => {
    const popup = await openPopup(context, extensionId);

    await popup.click('#gear');
    await popup.uncheck('#global');
    await expect(popup.locator('.card')).toHaveCount(3);
    await expect(popup.locator('#panicBox')).toBeHidden(); // panic is per app now
    await expect(popup.locator('[data-app="reddit"] .app-panic')).toBeVisible();

    const text = await popup.evaluate(() => {
      return document.body.innerText.toLowerCase();
    });

    expect(text).not.toContain('coming soon');

    await popup.locator('[data-app="x"] [data-app-level="all"]').click();
    await popup.locator('[data-app="reddit"] .app-panic').check();
    await expect(popup.locator('[data-app="x"] .levels__button--on')).toHaveText('Nothing');
    await expect(popup.locator('[data-app="youtube"] .levels__button--on')).toHaveText('News only');

    // Rules shows each app's current level
    await popup.click('#back');
    await expect(popup.locator('#scopeChip')).toHaveText('Per app');
    await expect(popup.locator('[data-summary="x"] small')).toHaveText('Nothing');
    await expect(popup.locator('[data-summary="youtube"] small')).toHaveText('News only');

    await popup.reload();
    await popup.click('#gear');
    await expect(popup.locator('[data-app="x"] .levels__button--on')).toHaveText('Nothing');
    await expect(popup.locator('[data-app="reddit"] .app-panic')).toBeChecked();
  });

  test('global settings reach both YouTube and X', async ({ context, extensionId, openFixture }) => {
    const youtube = await openFixture();
    const x = await openFixture({}, 'x');
    const popup = await openPopup(context, extensionId);

    await popup.click('[data-level="off"]');
    await expect(youtube.locator('html')).toHaveAttribute('data-gv-off', '', { timeout: 8000 });
    await expect(x.locator('html')).toHaveAttribute('data-gv-off', '', { timeout: 8000 });
  });

  test('with Global settings off, one app changes and the other does not', async ({
    context,
    extensionId,
    openFixture,
  }) => {
    const youtube = await openFixture();
    const x = await openFixture({}, 'x');

    await addTile(youtube, 'ytd-rich-item-renderer', 'GTA 6 gameplay first hour');
    await x.evaluate(() => {
      const tweet = document.createElement('article');

      tweet.setAttribute('data-testid', 'tweet');
      tweet.textContent = 'GTA 6 gameplay first hour';
      document.getElementById('feed').append(tweet);
    });
    await expect
      .poll(() => {
        return stateOf(youtube, 0);
      })
      .toBe('blocked');
    await expect
      .poll(() => {
        return stateOf(x, 0);
      })
      .toBe('blocked');

    const popup = await openPopup(context, extensionId);

    await popup.click('#gear');
    await popup.uncheck('#global');
    await popup.locator('[data-app="youtube"] [data-app-level="story"]').click(); // gameplay is allowed on YouTube

    await expect
      .poll(
        () => {
          return stateOf(youtube, 0);
        },
        { timeout: 8000 },
      )
      .toBe('ok');
    expect(await stateOf(x, 0)).toBe('blocked'); // X still follows News only
  });
});

test.describe('trusted tab', () => {
  test('YouTube channels and X accounts only: Reddit has no trusted list', async ({ context, extensionId }) => {
    const popup = await openPopup(context, extensionId);

    await popup.click('[data-view="trusted"]');
    await expect(popup.locator('[data-trust-site]')).toHaveText(['YouTube channels', 'X accounts']);
  });

  test('each list has its own mode, and Sync now is YouTube only', async ({ context, extensionId }) => {
    const popup = await openPopup(context, extensionId);

    await popup.click('[data-view="trusted"]');
    await expect(popup.locator('#sync')).toBeVisible();
    await expect(popup.locator('#modes .levels__button--on')).toHaveText('Allow gameplay');
    await popup.click('[data-mode="all"]');
    await expect(popup.locator('#modeDesc')).toContainText('skip the shield');

    await popup.click('[data-trust-site="x"]');
    await expect(popup.locator('#sync')).toBeHidden();
    await expect(popup.locator('#modes .levels__button--on')).toHaveText('Allow gameplay'); // YouTube's change stayed there
  });

  test('a long list scrolls by itself and the sync box stays pinned at the bottom', async ({
    context,
    extensionId,
  }) => {
    const popup = await openPopup(context, extensionId);

    await seedSubs(popup, 40);
    await popup.click('[data-view="trusted"]');
    await expect(popup.locator('.channel')).toHaveCount(40);

    const list = popup.locator('#list');
    const sync = popup.locator('#trusted > .box');
    const scrolls = await list.evaluate(element => {
      return element.scrollHeight > element.clientHeight;
    });

    expect(scrolls).toBe(true);
    await expectNoScroll(popup, 'the popup itself');

    const before = await sync.boundingBox();

    await list.evaluate(element => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(popup.locator('.channel__name').last()).toBeInViewport();

    const after = await sync.boundingBox();

    expect(after.y).toBe(before.y); // did not move while the list scrolled
    expect(after.y + after.height).toBeGreaterThan(560); // sits at the bottom of the 600px popup
    await expect(popup.locator('#sync')).toBeInViewport();

    // search filters the scrolling list
    await popup.fill('#search', 'Channel 12');
    await expect(popup.locator('.channel__name')).toHaveText(['Channel 12']);
  });
});
