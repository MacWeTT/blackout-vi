const { test, expect } = require('./fixtures');

const watchPage = title => {
  return `<!doctype html><html><head><title>watch</title></head><body>
<ytd-watch-flexy><div id="player"><ytd-player><video></video></ytd-player></div>
<ytd-watch-metadata><h1>${title}</h1><ytd-channel-name><a href="/@someone">Someone</a></ytd-channel-name></ytd-watch-metadata></ytd-watch-flexy>
</body></html>`;
};

const open = async (context, title) => {
  await context.route('https://www.youtube.com/watch*', route => {
    route.fulfill({ contentType: 'text/html', body: watchPage(title) });
  });

  const page = await context.newPage();

  await page.goto('https://www.youtube.com/watch?v=abc&list=RDabc&start_radio=1');

  return page;
};

// Regression: the overlay's own text changed on every check, which woke the observer, which checked again, forever. The
// page froze (a radio link, a plain video: any watch page).
test('a harmless watch page loads and stays responsive', async ({ context }) => {
  const page = await open(context, 'Cooking pasta');

  await page.waitForTimeout(1500);

  const state = await page.evaluate(() => {
    return {
      watch: document.documentElement.getAttribute('data-gv-watch'),
      overlay: Boolean(document.getElementById('gv-overlay')),
    };
  });

  expect(state).toEqual({ watch: null, overlay: false });
});

test('a spoiler watch page is covered and stays responsive', async ({ context }) => {
  const page = await open(context, 'GTA 6 ending explained');

  await expect(page.locator('#gv-overlay[data-state="blocked"]')).toHaveCount(1);
  await page.waitForTimeout(1000);
  expect(
    await page.evaluate(() => {
      return document.documentElement.getAttribute('data-gv-watch');
    }),
  ).toBe('blocked');
});
