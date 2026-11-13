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

test.describe('trusted channels', () => {
  test('a subscription you have not trusted is hidden like any other channel', async ({ openFixture }) => {
    const page = await openFixture({ subsMode: 'all', subs: SUBS });

    await addChannelTile(page, 'GTA 6 gameplay first hour', DF);
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');
  });

  test('off: even a trusted channel follows the normal rules', async ({ openFixture }) => {
    const page = await openFixture({ subsMode: 'off', trusted: SUBS });

    await addChannelTile(page, 'GTA 6 gameplay first hour', DF);
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');
  });

  test('allow gameplay: gameplay shows, story spoilers stay hidden', async ({ openFixture }) => {
    const page = await openFixture({ subsMode: 'gameplay', trusted: SUBS });

    await addChannelTile(page, 'GTA 6 gameplay first hour', DF);
    await addChannelTile(page, 'GTA 6 ending explained', DF);
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('ok');
    await expect
      .poll(() => {
        return stateOf(page, 1);
      })
      .toBe('blocked');
  });

  test('allow all: even a story spoiler from a subscription shows', async ({ openFixture }) => {
    const page = await openFixture({ subsMode: 'all', trusted: SUBS });

    await addChannelTile(page, 'GTA 6 ending explained', DF);
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('ok');
  });

  test('another channel is still hidden', async ({ openFixture }) => {
    const page = await openFixture({ subsMode: 'all', trusted: SUBS });

    await addChannelTile(page, 'GTA 6 gameplay first hour', { handle: 'SomeoneElse', name: 'Someone Else' });
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');
  });

  test('a tile with no identifiable channel is hidden even when everything is trusted', async ({ openFixture }) => {
    const page = await openFixture({ subsMode: 'all', trusted: SUBS });

    await page.evaluate(() => {
      const tile = document.createElement('ytd-rich-item-renderer');

      tile.textContent = 'GTA 6 gameplay first hour';
      document.getElementById('feed').append(tile);
    });
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');
  });

  test('a name-only tile (sidebar style) matches by channel name', async ({ openFixture }) => {
    const page = await openFixture({ subsMode: 'gameplay', trusted: SUBS });

    await addChannelTile(page, 'GTA 6 gameplay first hour', { handle: '', name: 'Digital Foundry' });
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('ok');
  });
});

test.describe('trust badge on the card', () => {
  test('clicking it trusts the channel, shows a toast, and undo brings the card back', async ({ openFixture }) => {
    const page = await openFixture({ subsMode: 'all' });

    await addChannelTile(page, 'GTA 6 gameplay first hour', OTHER);
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');

    const badge = page.locator('.gv-card__trust');

    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('data-name', 'Someone Else');
    await badge.click();
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('ok');
    await expect(page.locator('#gv-toast')).toContainText('Someone Else trusted');

    await page.locator('#gv-toast button').click();
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');
  });

  test('after trusting, the card that stays shows a check, and clicking it takes the trust back', async ({
    openFixture,
  }) => {
    const page = await openFixture({ subsMode: 'gameplay' });

    await addChannelTile(page, 'GTA 6 ending explained', OTHER);
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');

    const badge = page.locator('.gv-card__trust');
    const text = () => {
      return page.evaluate(() => {
        return getComputedStyle(document.querySelector('.gv-card__trust'), '::before').content;
      });
    };

    expect(await text()).toContain('+ Trust');
    await badge.click();

    // story spoilers from trusted channels stay hidden in this mode, so the card is still there, now with a check
    await expect(badge).toHaveAttribute('data-trusted', '');
    expect(await text()).toContain('✓');
    expect(await text()).toContain('Trusted Someone Else');
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');
    await expect(page.locator('#gv-toast')).toContainText('Story spoilers stay hidden');

    await badge.click();
    await expect(badge).not.toHaveAttribute('data-trusted', '');
    expect(await text()).toContain('+ Trust');
    await expect(page.locator('#gv-toast')).toContainText('no longer trusted');
  });

  test('the toast sits in the bottom-right corner, fully on screen', async ({ openFixture }) => {
    const page = await openFixture({ subsMode: 'all' });

    await addChannelTile(page, 'GTA 6 gameplay first hour', OTHER);
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');
    await page.locator('.gv-card__trust').click();
    await expect(page.locator('#gv-toast')).toBeVisible();

    const { box, view } = await page.evaluate(() => {
      const rect = document.getElementById('gv-toast').getBoundingClientRect();

      return {
        box: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        view: { width: innerWidth, height: innerHeight },
      };
    });

    expect(box.left).toBeGreaterThan(view.width / 2);
    expect(box.top).toBeGreaterThan(view.height / 2);
    expect(box.right).toBeLessThanOrEqual(view.width);
    expect(box.bottom).toBeLessThanOrEqual(view.height);
  });

  test('no badge when the channel is unknown', async ({ openFixture }) => {
    const page = await openFixture();

    await page.evaluate(() => {
      const tile = document.createElement('ytd-rich-item-renderer');

      tile.textContent = 'GTA 6 gameplay first hour';
      document.getElementById('feed').append(tile);
    });
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');
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
  await expect
    .poll(() => {
      return stateOf(page, 0);
    })
    .toBe('blocked');
  await expect(page.locator('.gv-card__trust')).toHaveAttribute('data-name', '@rockstargames');
});

test('Sync now lists every subscription but trusts none; you switch on the ones you want', async ({
  context,
  extensionId,
  openFixture,
}) => {
  const page = await openFixture({ subsMode: 'all' });
  const popup = await context.newPage();

  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  await popup.click('#manage');
  await popup.click('#sync');
  await expect(popup.locator('.channel__name')).toHaveText(['Digital Foundry', 'Rockstar Games'], { timeout: 8000 });
  await expect(popup.locator('#syncTitle')).toContainText('Synced');
  await expect(popup.locator('.channel__tag').first()).toHaveText('subscribed');

  // pictures: the channel's picture when the page gave one, otherwise its first letter
  await expect(popup.locator('img.channel__avatar')).toHaveAttribute('src', 'https://yt3.example/rockstar.jpg');
  await expect(popup.locator('span.channel__avatar')).toHaveText('D');

  // nothing is trusted yet, so the tile is still hidden
  await expect(popup.locator('.list .switch:checked')).toHaveCount(0);
  await addChannelTile(page, 'GTA 6 gameplay first hour', DF);
  await expect
    .poll(() => {
      return stateOf(page, 0);
    })
    .toBe('blocked');

  // switching Digital Foundry on trusts it, and the open page picks that up
  await popup.locator('.channel', { hasText: 'Digital Foundry' }).locator('.switch').check();
  await expect
    .poll(
      () => {
        return stateOf(page, 0);
      },
      { timeout: 8000 },
    )
    .toBe('ok');
  await expect(popup.locator('.list .switch:checked')).toHaveCount(1);
});
