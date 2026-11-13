const { test, expect, addTile, stateOf } = require('./fixtures');

const POPUP = id => {
  return `chrome-extension://${id}/src/popup/popup.html`;
};

const openPopup = async (context, extensionId) => {
  const popup = await context.newPage();

  await popup.goto(POPUP(extensionId));
  // wait for the first render from storage, so a click never races it
  await expect(popup.locator('[data-level].levels__button--on')).toHaveCount(1);

  return popup;
};

const on = (popup, group) => {
  return popup.locator(`[data-${group}].levels__button--on`);
};

test('defaults: global settings on, News, panic off, a trusted row per site', async ({ context, extensionId }) => {
  const popup = await openPopup(context, extensionId);

  await expect(popup.locator('#global')).toBeChecked();
  await expect(popup.locator('#sites')).toBeHidden();
  await expect(on(popup, 'level')).toHaveText('News');
  await expect(popup.locator('#panic')).not.toBeChecked();
  await expect(popup.locator('[data-manage]')).toHaveText([/YouTube channels/, /X accounts/]);
});

test('panic mode is the last control, below the level control and the trusted rows', async ({
  context,
  extensionId,
}) => {
  const popup = await openPopup(context, extensionId);

  const order = await popup.evaluate(() => {
    const top = selector => {
      return document.querySelector(selector).getBoundingClientRect().top;
    };

    return [top('#levels'), top('#trustRows'), top('#panic')];
  });

  expect(order).toEqual(
    [...order].sort((a, b) => {
      return a - b;
    }),
  );
});

test('level and panic are saved and restored', async ({ context, extensionId }) => {
  const popup = await openPopup(context, extensionId);

  await popup.click('[data-level="story"]');
  await popup.check('#panic');
  await expect(on(popup, 'level')).toHaveText('Story');
  await expect(popup.locator('#desc')).toContainText('endings');

  await popup.reload();
  await expect(on(popup, 'level')).toHaveText('Story');
  await expect(popup.locator('#panic')).toBeChecked();
});

test('unchecking global settings shows the three site logos; each site keeps its own level', async ({
  context,
  extensionId,
}) => {
  const popup = await openPopup(context, extensionId);

  await popup.uncheck('#global');
  await expect(popup.locator('[data-site]')).toHaveCount(3);
  await expect(popup.locator('[data-manage]')).toHaveCount(1); // only the selected site's list

  await popup.click('[data-site="x"]');
  await popup.click('[data-level="all"]');
  await expect(on(popup, 'level')).toHaveText('Block all');
  await expect(popup.locator('[data-manage]')).toHaveText([/X accounts/]);

  await popup.click('[data-site="youtube"]');
  await expect(on(popup, 'level')).toHaveText('News'); // YouTube did not change
  await expect(popup.locator('[data-manage]')).toHaveText([/YouTube channels/]);

  await popup.reload();
  await expect(popup.locator('#global')).not.toBeChecked();
  await popup.click('[data-site="x"]');
  await expect(on(popup, 'level')).toHaveText('Block all');
});

test('Reddit has no trusted list: the rules apply to the whole site', async ({ context, extensionId }) => {
  const popup = await openPopup(context, extensionId);

  await popup.uncheck('#global');
  await popup.click('[data-site="reddit"]');
  await expect(popup.locator('[data-manage]')).toHaveCount(0);
  await expect(popup.locator('#siteNote')).toContainText('no joined-community feature');
  await popup.click('[data-level="story"]');
  await expect(on(popup, 'level')).toHaveText('Story');
});

test('global settings reach both YouTube and X', async ({ context, extensionId, openFixture }) => {
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

  await popup.click('[data-level="off"]');
  await expect(youtube.locator('html')).toHaveAttribute('data-gv-off', '', { timeout: 8000 });
  await expect(x.locator('html')).toHaveAttribute('data-gv-off', '', { timeout: 8000 });
});

test('with global settings off, one site changes and the other does not', async ({
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
  await popup.click('[data-site="youtube"]');
  await popup.click('[data-level="story"]'); // story only: gameplay is allowed on YouTube

  await expect
    .poll(
      () => {
        return stateOf(youtube, 0);
      },
      { timeout: 8000 },
    )
    .toBe('ok');
  expect(await stateOf(x, 0)).toBe('blocked'); // X still follows the global News level
});

test('the manage screen is per site: mode buttons for both, Sync now only for YouTube', async ({
  context,
  extensionId,
}) => {
  const popup = await openPopup(context, extensionId);

  await popup.click('[data-manage="youtube"]');
  await expect(popup.locator('#manageTitle')).toHaveText('Trusted channels');
  await expect(popup.locator('#sync')).toBeVisible();
  await expect(on(popup, 'mode')).toHaveText('Allow gameplay');
  await popup.click('[data-mode="all"]');
  await expect(popup.locator('#modeDesc')).toContainText('skip the shield');
  await popup.click('#back');

  await popup.click('[data-manage="x"]');
  await expect(popup.locator('#manageTitle')).toHaveText('Trusted accounts');
  await expect(popup.locator('#sync')).toBeHidden();
  await expect(on(popup, 'mode')).toHaveText('Allow gameplay'); // X has its own mode; YouTube's change stayed there
});
