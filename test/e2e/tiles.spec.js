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
    nothing: ['blocked', 'blocked', 'blocked', 'ok'],
    content: ['ok', 'blocked', 'blocked', 'ok'],
    gameplay: ['ok', 'ok', 'blocked', 'ok'],
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
  const page = await openFixture({ level: 'everything' });

  await addTile(page, TAG, 'GTA 6 ending explained');
  await page.waitForTimeout(500);

  const faded = await page.evaluate(() => {
    return getComputedStyle(document.getElementById('feed').children[0]).opacity;
  });

  expect(faded).toBe('1');
});

test('panic mode blocks generic phrases without a GTA mention', async ({ openFixture }) => {
  const page = await openFixture({ level: 'content', panic: true });

  await addTile(page, TAG, 'Elden Ring all endings');
  await expect
    .poll(() => {
      return stateOf(page, 0);
    })
    .toBe('blocked');
});

test('without panic mode a non-GTA video stays visible', async ({ openFixture }) => {
  const page = await openFixture({ level: 'content', panic: false });

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

// The speed-up skips a tile whose text did not change, but an attribute change (not part of textContent) must still count.
test('a change only in an aria-label is still judged', async ({ openFixture }) => {
  const page = await openFixture();

  await page.evaluate(() => {
    const tile = document.createElement('ytd-rich-item-renderer');

    tile.innerHTML = '<a id="link" aria-label="Cooking pasta">watch</a>';
    document.getElementById('feed').append(tile);
  });
  await expect
    .poll(() => {
      return stateOf(page, 0);
    })
    .toBe('ok');

  await page.evaluate(() => {
    document.getElementById('link').setAttribute('aria-label', 'GTA 6 ending explained');
  });
  await expect
    .poll(() => {
      return stateOf(page, 0);
    })
    .toBe('blocked');
});

test('hundreds of tiles added while text churns elsewhere are all judged, and none leaks', async ({ openFixture }) => {
  const page = await openFixture();

  await page.evaluate(() => {
    window.__leaks = 0;

    const sample = () => {
      for (const el of document.getElementById('feed').children) {
        const unmarked = !el.hasAttribute('data-gv-ok') && !el.hasAttribute('data-gv-blocked');

        if (unmarked && getComputedStyle(el).opacity !== '0') {
          window.__leaks++;
        }
      }

      requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);

    const feed = document.getElementById('feed');
    let added = 0;

    return new Promise(resolve => {
      const step = () => {
        for (let i = 0; i < 10 && added < 300; i++, added++) {
          const tile = document.createElement('ytd-rich-item-renderer');

          tile.textContent = added % 3 === 0 ? `GTA 6 ending number ${added}` : `Cooking video ${added}`;
          feed.append(tile);
        }

        if (added < 300) {
          requestAnimationFrame(step);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(step);
    });
  });
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const tiles = [...document.getElementById('feed').children];

    return {
      total: tiles.length,
      blocked: tiles.filter(t => {
        return t.hasAttribute('data-gv-blocked');
      }).length,
      ok: tiles.filter(t => {
        return t.hasAttribute('data-gv-ok');
      }).length,
      leaks: window.__leaks,
    };
  });

  expect(result).toEqual({ total: 300, blocked: 100, ok: 200, leaks: 0 });
});
