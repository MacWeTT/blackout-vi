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
      ok: tiles.filter(t => t.hasAttribute('data-gv-ok')).length,
      blocked: tiles.filter(t => t.hasAttribute('data-gv-blocked')).length,
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
