const { test, expect } = require('./fixtures');

// Real YouTube, signed out. Needs network; markup can change, which is the point of running it.
const search = async (context, query) => {
  const page = await context.newPage();

  await page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
  await page.waitForSelector('ytd-video-renderer', { timeout: 20000 });
  await page.waitForTimeout(3000);

  return page;
};

const counts = page => {
  return page.evaluate(() => {
    const tiles = [...document.querySelectorAll('ytd-video-renderer')];

    return {
      total: tiles.length,
      ok: tiles.filter(t => {
        return t.hasAttribute('data-gv-ok');
      }).length,
      blocked: tiles.filter(t => {
        return t.hasAttribute('data-gv-blocked');
      }).length,
    };
  });
};

test('live: a spoiler search blocks tiles and none stay pending', async ({ context }) => {
  const page = await search(context, 'gta 6 ending explained');
  const c = await counts(page);

  expect(c.blocked).toBeGreaterThan(0);
  expect(c.ok + c.blocked).toBe(c.total);
});

test('live: a harmless search shows every tile', async ({ context }) => {
  const page = await search(context, 'how to cook pasta');
  const c = await counts(page);

  expect(c.total).toBeGreaterThan(0);
  expect(c.blocked).toBe(0);
  expect(c.ok).toBe(c.total);
});

test('live: a blocked tile can be revealed', async ({ context }) => {
  const page = await search(context, 'gta 6 ending explained');
  const tile = page.locator('ytd-video-renderer[data-gv-blocked]').first();

  await tile.scrollIntoViewIfNeeded();
  await tile.click({ position: { x: 30, y: 30 } });
  await expect(tile).toHaveAttribute('data-gv-shown', '');
  expect(page.url()).toContain('/results');
});

test('live: trusting a channel from a card marks it trusted, and the mark survives a reload', async ({ context }) => {
  test.setTimeout(120000);

  const page = await search(context, 'gta 6 ending explained');
  // a story-spoiler card stays on screen after its channel is trusted (a gameplay one would correctly disappear)
  const badge = page
    .locator('ytd-video-renderer[data-gv-blocked]:has(.gv-card__kind[data-kind="Story spoiler"]) .gv-card__trust')
    .first();

  test.skip((await badge.count()) === 0, 'no story-spoiler card in the live results right now');

  await badge.scrollIntoViewIfNeeded();

  const key = await badge.getAttribute('data-key');
  const content = () => {
    return page.evaluate(selector => {
      return getComputedStyle(document.querySelector(selector), '::before').content;
    }, `.gv-card__trust[data-key="${key}"]`);
  };

  await badge.click();
  await expect.poll(content).toContain('Trusted');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('ytd-video-renderer', { timeout: 30000 });
  await page.waitForTimeout(3000);

  const trustedAfter = await page.evaluate(trustedKey => {
    return [...document.querySelectorAll('.gv-card__trust')].some(item => {
      return item.dataset.key === trustedKey && item.hasAttribute('data-trusted');
    });
  }, key);

  expect(trustedAfter).toBe(true);
});
