const { test, expect, addTile, stateOf } = require('./fixtures');

const TAG = 'ytd-rich-item-renderer';

test.describe('classification at the default level (news only)', () => {
  const cases = [
    ['GTA 6 Official Trailer 3', 'ok'],
    ['GTA VI Soundtrack OST', 'ok'],
    ['Cooking pasta in 10 minutes', 'ok'],
    ['GTA 6 ENDING EXPLAINED', 'blocked'],
    ['GTA 6 gameplay first hour', 'blocked'],
    ['Jason dies in the last scene', 'blocked'],
  ];

  for (const [title, expected] of cases) {
    test(`"${title}" is ${expected}`, async ({ openFixture }) => {
      const page = await openFixture();

      await addTile(page, TAG, title);
      await expect
        .poll(() => {
          return stateOf(page, 0);
        })
        .toBe(expected);
    });
  }
});

test('every level blocks what it should', async ({ openFixture }) => {
  const titles = ['GTA 6 trailer', 'GTA 6 gameplay', 'GTA 6 ending', 'Cooking pasta'];
  const expected = {
    all: ['blocked', 'blocked', 'blocked', 'ok'],
    news: ['ok', 'blocked', 'blocked', 'ok'],
    story: ['ok', 'ok', 'blocked', 'ok'],
  };

  for (const level of Object.keys(expected)) {
    const page = await openFixture({ level });

    for (const title of titles) {
      await addTile(page, TAG, title);
    }

    const states = [];

    for (let i = 0; i < titles.length; i++) {
      states.push(await stateOf(page, i));
    }

    expect(states, level).toEqual(expected[level]);
    await page.close();
  }
});

test('level off hides nothing', async ({ openFixture }) => {
  const page = await openFixture({ level: 'off' });

  await addTile(page, TAG, 'GTA 6 ending explained');
  await page.waitForTimeout(500);

  const faded = await page.evaluate(() => {
    return getComputedStyle(document.getElementById('feed').children[0]).opacity;
  });

  expect(faded).toBe('1');
});

test('panic mode blocks generic phrases without a GTA mention', async ({ openFixture }) => {
  const page = await openFixture({ level: 'news', panic: true });

  await addTile(page, TAG, 'Elden Ring all endings');
  await expect
    .poll(() => {
      return stateOf(page, 0);
    })
    .toBe('blocked');
});

test('without panic mode a non-GTA video stays visible', async ({ openFixture }) => {
  const page = await openFixture({ level: 'news', panic: false });

  await addTile(page, TAG, 'Elden Ring all endings');
  await expect
    .poll(() => {
      return stateOf(page, 0);
    })
    .toBe('ok');
});

test('a nested tile is judged by its outer tile', async ({ openFixture }) => {
  const page = await openFixture();

  await page.evaluate(() => {
    const outer = document.createElement('ytd-rich-item-renderer');
    const inner = document.createElement('yt-lockup-view-model');

    inner.textContent = 'GTA 6 ending leaked';
    outer.append(inner);
    document.getElementById('feed').append(outer);
  });
  await expect
    .poll(() => {
      return stateOf(page, 0);
    })
    .toBe('blocked');

  const innerBlocked = await page.evaluate(() => {
    return document.querySelector('yt-lockup-view-model').hasAttribute('data-gv-blocked');
  });

  expect(innerBlocked).toBe(false);
});

test('aria-label text counts towards the verdict', async ({ openFixture }) => {
  const page = await openFixture();

  await page.evaluate(() => {
    const tile = document.createElement('ytd-video-renderer');

    tile.innerHTML = '<a aria-label="GTA 6 ending explained"></a>';
    document.getElementById('feed').append(tile);
  });
  await expect
    .poll(() => {
      return stateOf(page, 0);
    })
    .toBe('blocked');
});

// Home-feed tiles nest a lockup inside a rich item; only the outer tile is marked, so the inner one must never stay hidden.

const addNested = (page, text) => {
  return page.evaluate(content => {
    const outer = document.createElement('ytd-rich-item-renderer');
    const inner = document.createElement('yt-lockup-view-model');

    inner.innerHTML = `<a id="t">${content}</a>`;
    outer.append(inner);
    document.getElementById('feed').append(outer);
  }, text);
};

const innerOpacity = page => {
  return page.evaluate(() => {
    return getComputedStyle(document.querySelector('yt-lockup-view-model')).opacity;
  });
};

test('a normal nested tile is fully visible once classified ok', async ({ openFixture }) => {
  const page = await openFixture();

  await addNested(page, 'How to cook pasta');
  await expect
    .poll(() => {
      return stateOf(page, 0);
    })
    .toBe('ok');
  expect(await innerOpacity(page)).toBe('1');
});

test('a revealed nested blocked tile shows its content', async ({ openFixture }) => {
  const page = await openFixture();

  await addNested(page, 'GTA 6 ending explained');
  await expect
    .poll(() => {
      return stateOf(page, 0);
    })
    .toBe('blocked');
  await page.locator('#feed > :first-child').click({ position: { x: 20, y: 20 } });
  await expect(page.locator('#feed > :first-child')).toHaveAttribute('data-gv-shown', '');
  expect(await innerOpacity(page)).toBe('1');
  expect(
    await page.evaluate(() => {
      return getComputedStyle(document.getElementById('t')).visibility;
    }),
  ).toBe('visible');
});

test('words in neighbouring elements with no space between them are still read as words', async ({ openFixture }) => {
  const page = await openFixture();

  await page.evaluate(() => {
    const tile = document.createElement('ytd-rich-item-renderer');

    tile.innerHTML = '<span>New</span><span>GTA 6 ending explained</span>';
    document.getElementById('feed').append(tile);
  });
  await expect
    .poll(() => {
      return stateOf(page, 0);
    })
    .toBe('blocked');
});
