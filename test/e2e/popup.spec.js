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

const siteLevel = (popup, app) => {
  return popup.locator(`[data-site-row="${app}"] .levels__button--on`);
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
  test('defaults: Rules tab, Global settings on, News only, no gear or settings page', async ({
    context,
    extensionId,
  }) => {
    const popup = await openPopup(context, extensionId);

    await expect(popup.locator('[data-view="rules"]')).toHaveClass(/tabs__tab--on/);
    await expect(popup.locator('#global')).toBeChecked();
    await expect(level(popup)).toHaveText('News only');
    await expect(popup.locator('#scopeChip')).toHaveText('All sites');
    await expect(popup.locator('#siteRules')).toBeHidden();
    await expect(popup.locator('#gear')).toHaveCount(0);
    await expectNoScroll(popup, 'rules');
  });

  test('order on Rules: Global settings first, the level control, Panic mode last', async ({
    context,
    extensionId,
  }) => {
    const popup = await openPopup(context, extensionId);

    for (const global of [true, false]) {
      if (!global) {
        await popup.uncheck('#global');
        await expect(popup.locator('#siteRules')).toBeVisible();
      }

      const order = await popup.evaluate(() => {
        const top = selector => {
          return document.querySelector(selector).getBoundingClientRect().top;
        };
        const rules = document.getElementById('globalRules').hidden ? '#siteRules' : '#globalRules';

        return [top('#global'), top(rules), top('#panicBox')];
      });

      expect(order, `global ${global}`).toEqual(
        [...order].sort((a, b) => {
          return a - b;
        }),
      );
    }
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

  test('no screen needs scrolling: per-app rules, a long trusted list', async ({ context, extensionId }) => {
    const popup = await openPopup(context, extensionId);

    await popup.uncheck('#global');
    await expect(popup.locator('.siterow')).toHaveCount(3);
    await expect(popup.locator('.mini')).toHaveCount(3);
    await expectNoScroll(popup, 'rules with three per-app controls');

    await seedSubs(popup, 40);
    await popup.click('[data-view="trusted"]');
    await expect(popup.locator('.channel')).toHaveCount(40);
    await expectNoScroll(popup, 'trusted with a long list');
  });
});

test.describe('rules', () => {
  test('the level is saved and restored', async ({ context, extensionId }) => {
    const popup = await openPopup(context, extensionId);

    await popup.click('[data-level="story"]');
    await expect(level(popup)).toHaveText('No story');
    await expect(popup.locator('#desc')).toContainText('endings');

    await popup.reload();
    await expect(level(popup)).toHaveText('No story');
  });

  test('panic mode with global on is one switch, saved and restored', async ({ context, extensionId }) => {
    const popup = await openPopup(context, extensionId);

    await expect(popup.locator('#panic')).toBeVisible();
    await expect(popup.locator('#panicSites')).toBeHidden();
    await popup.check('#panic');

    await popup.reload();
    await expect(popup.locator('#panic')).toBeChecked();
  });

  test('Global settings off swaps the one control for three, Reddit included, and nothing says "coming soon"', async ({
    context,
    extensionId,
  }) => {
    const popup = await openPopup(context, extensionId);

    await popup.uncheck('#global');
    await expect(popup.locator('#globalRules')).toBeHidden();
    await expect(popup.locator('#siteRules')).toBeVisible();
    await expect(popup.locator('#scopeChip')).toHaveText('Per app');
    await expect(popup.locator('.siterow')).toHaveCount(3);
    await expect(popup.locator('[data-site-row="reddit"]')).toBeVisible();

    // panic mode is last, and is three small switches now
    await expect(popup.locator('#panic')).toBeHidden();
    await expect(popup.locator('[data-panic-site]')).toHaveCount(3);

    const text = await popup.evaluate(() => {
      return document.body.innerText.toLowerCase();
    });

    expect(text).not.toContain('coming soon');

    await popup.locator('[data-site-row="x"] [data-app-level="all"]').click();
    await popup.locator('[data-panic-site="reddit"] input').check();
    await expect(siteLevel(popup, 'x')).toHaveText('Nothing');
    await expect(siteLevel(popup, 'youtube')).toHaveText('News only');
    await expect(siteLevel(popup, 'reddit')).toHaveText('News only');

    await popup.reload();
    await expect(popup.locator('#global')).not.toBeChecked();
    await expect(siteLevel(popup, 'x')).toHaveText('Nothing');
    await expect(popup.locator('[data-panic-site="reddit"] input')).toBeChecked();
    await expect(popup.locator('[data-panic-site="x"] input')).not.toBeChecked();

    // turning Global settings back on goes back to the one shared control
    await popup.check('#global');
    await expect(popup.locator('#globalRules')).toBeVisible();
    await expect(popup.locator('#siteRules')).toBeHidden();
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

    await popup.uncheck('#global');
    await popup.locator('[data-site-row="youtube"] [data-app-level="story"]').click(); // gameplay is allowed on YouTube

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
