const { test, expect, stateOf } = require('./fixtures');

const open = (openFixture, settings) => {
  return openFixture(settings, 'x');
};

// a tweet the way X renders it: an article with the author's name block and the tweet text
const addTweet = (page, text, author = { handle: 'someone', name: 'Some One' }) => {
  return page.evaluate(
    ([content, { handle, name }]) => {
      const tweet = document.createElement('article');

      tweet.setAttribute('data-testid', 'tweet');
      tweet.innerHTML =
        `<div data-testid="User-Name"><a href="/${handle}">${name}</a><a href="/${handle}">@${handle}</a></div>` +
        `<div data-testid="tweetText">${content}</div>`;
      document.getElementById('feed').append(tweet);
    },
    [text, author],
  );
};

const ROCKSTAR = { handle: 'RockstarGames', name: 'Rockstar Games' };

test.describe('tweets', () => {
  const cases = [
    ['GTA 6 Trailer 3 is incredible', 'ok'],
    ['Making pasta tonight', 'ok'],
    ['GTA 6 ending explained, Jason dies', 'blocked'],
    ['GTA 6 gameplay leaked, first hour', 'blocked'],
  ];

  for (const [text, expected] of cases) {
    test(`"${text}" is ${expected}`, async ({ openFixture }) => {
      const page = await open(openFixture);

      await addTweet(page, text);
      await expect
        .poll(() => {
          return stateOf(page, 0);
        })
        .toBe(expected);
    });
  }

  test('a tweet is never visible before it is judged', async ({ openFixture }) => {
    const page = await open(openFixture);

    await page.evaluate(() => {
      window.__leaks = [];

      const sample = () => {
        for (const el of document.getElementById('feed').children) {
          const unmarked = !el.hasAttribute('data-gv-ok') && !el.hasAttribute('data-gv-blocked');

          if (unmarked && getComputedStyle(el).opacity !== '0') {
            window.__leaks.push(el.textContent);
          }
        }

        requestAnimationFrame(sample);
      };

      requestAnimationFrame(sample);
    });

    for (let i = 0; i < 8; i++) {
      await addTweet(page, `GTA 6 ending number ${i}`);
    }

    await page.waitForTimeout(400);
    expect(
      await page.evaluate(() => {
        return window.__leaks;
      }),
    ).toEqual([]);
  });

  test('a trend is judged too', async ({ openFixture }) => {
    const page = await open(openFixture);

    await page.evaluate(() => {
      const trend = document.createElement('div');

      trend.setAttribute('data-testid', 'trend');
      trend.textContent = 'GTA 6 ending leaked';
      document.getElementById('feed').append(trend);
    });
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');
  });

  test('clicking the card reveals the tweet and does not open it', async ({ openFixture }) => {
    const page = await open(openFixture);

    await addTweet(page, 'GTA 6 ending explained');
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');
    await page.locator('#feed > :first-child').click({ position: { x: 20, y: 20 } });
    await expect(page.locator('#feed > :first-child')).toHaveAttribute('data-gv-shown', '');
    await expect(page.locator('.gv-card')).toBeHidden();
  });

  test('the card logo loads on X too', async ({ openFixture }) => {
    const page = await open(openFixture);

    await addTweet(page, 'GTA 6 ending explained');
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');

    const ok = await page.evaluate(async () => {
      const image = getComputedStyle(document.querySelector('.gv-card__logo')).backgroundImage;

      return (await fetch(image.match(/url\("?([^")]+)"?\)/)[1])).ok;
    });

    expect(ok).toBe(true);
  });
});

test.describe('trusted accounts on X', () => {
  test('a trusted account skips the shield for gameplay but not story spoilers', async ({ openFixture }) => {
    const page = await open(openFixture, { mode: 'gameplay', trusted: { '@rockstargames': 'Rockstar Games' } });

    await addTweet(page, 'GTA 6 gameplay first hour', ROCKSTAR);
    await addTweet(page, 'GTA 6 ending explained', ROCKSTAR);
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

  test('allow all: a story spoiler from a trusted account shows', async ({ openFixture }) => {
    const page = await open(openFixture, { mode: 'all', trusted: { '@rockstargames': 'Rockstar Games' } });

    await addTweet(page, 'GTA 6 ending explained', ROCKSTAR);
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('ok');
  });

  test('an account you did not trust is hidden', async ({ openFixture }) => {
    const page = await open(openFixture, { mode: 'all', trusted: { '@rockstargames': 'Rockstar Games' } });

    await addTweet(page, 'GTA 6 gameplay first hour', { handle: 'randomguy', name: 'Random Guy' });
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');
  });

  test('the badge names the account and trusting it clears the card', async ({ openFixture }) => {
    const page = await open(openFixture, { mode: 'all' });

    await addTweet(page, 'GTA 6 gameplay first hour', { handle: 'randomguy', name: 'Random Guy' });
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');

    const badge = page.locator('.gv-card__trust');

    await expect(badge).toHaveAttribute('data-name', 'Random Guy');
    await expect(badge).toHaveAttribute('data-key', '@randomguy');
    await badge.click();
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('ok');
    await expect(page.locator('#gv-toast')).toContainText('Random Guy trusted');
  });

  test('a tweet without an author block has no badge and is never trusted', async ({ openFixture }) => {
    const page = await open(openFixture, { mode: 'all', trusted: { '@rockstargames': 'Rockstar Games' } });

    await page.evaluate(() => {
      const tweet = document.createElement('article');

      tweet.setAttribute('data-testid', 'tweet');
      tweet.textContent = 'GTA 6 gameplay first hour';
      document.getElementById('feed').append(tweet);
    });
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');
    await expect(page.locator('.gv-card__trust')).toBeHidden();
  });

  test('visiting your Following page collects the accounts for the popup', async ({ context, extensionId }) => {
    const page = await context.newPage();

    await page.goto('https://x.com/me/following');
    await page.waitForTimeout(1500);

    const popup = await context.newPage();

    await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

    const stored = await popup.evaluate(() => {
      return new Promise(resolve => {
        chrome.storage.local.get({ xSubs: {}, xAvatars: {} }, resolve);
      });
    });

    expect(stored.xSubs).toEqual({ '@rockstargames': 'Rockstar Games', '@digitalfoundry': 'Digital Foundry' });
    expect(stored.xAvatars['@rockstargames']).toContain('profile_images');
  });
});
