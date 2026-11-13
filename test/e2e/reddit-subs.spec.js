const { test, expect, stateOf } = require('./fixtures');

// a post in a given subreddit, the way the current Reddit marks it
const addPost = (page, sub, title) => {
  return page.evaluate(
    ([name, text]) => {
      const post = document.createElement('shreddit-post');

      post.setAttribute('subreddit-prefixed-name', name);
      post.innerHTML = `<h1>${text}</h1>`;
      document.getElementById('feed').append(post);
    },
    [sub, title],
  );
};

const blocks = (extra, more = {}) => {
  return { extra, ...more };
};

const kindOf = page => {
  return page.evaluate(() => {
    return document.querySelector('.gv-card__kind').dataset.kind;
  });
};

test.describe('Reddit: block subreddits', () => {
  test('Block GTA subs hides every post from a GTA subreddit, whatever it says', async ({ openFixture }) => {
    const page = await openFixture(blocks({ redditBlockGta: true }), 'reddit');

    await addPost(page, 'r/GTA6', 'Best pasta recipe'); // harmless text, but in a GTA sub
    await addPost(page, 'r/cooking', 'Best pasta recipe');
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');
    await expect
      .poll(() => {
        return stateOf(page, 1);
      })
      .toBe('ok');
    expect(await kindOf(page)).toBe('r/GTA6 hidden');
  });

  test('Block gaming subs hides gaming subreddits and leaves the rest', async ({ openFixture }) => {
    const page = await openFixture(blocks({ redditBlockGaming: true }), 'reddit');

    await addPost(page, 'r/gaming', 'Look at my setup');
    await addPost(page, 'r/IndiaPS5', 'Look at my setup');
    await addPost(page, 'r/NintendoSwitch', 'Look at my setup');
    await addPost(page, 'r/cooking', 'Look at my setup');
    await addPost(page, 'r/AskReddit', 'Look at my setup');
    await page.waitForTimeout(300);

    const states = [];

    for (let i = 0; i < 5; i++) {
      states.push(await stateOf(page, i));
    }

    expect(states).toEqual(['blocked', 'blocked', 'blocked', 'ok', 'ok']);
  });

  test('the two blocks are separate: a gaming sub is not hidden by the GTA block, and the reverse', async ({
    openFixture,
  }) => {
    const gtaOnly = await openFixture(blocks({ redditBlockGta: true }), 'reddit');

    await addPost(gtaOnly, 'r/gaming', 'Look at my setup');
    await expect
      .poll(() => {
        return stateOf(gtaOnly, 0);
      })
      .toBe('ok');

    const gamingOnly = await openFixture(blocks({ redditBlockGaming: true }), 'reddit');

    await addPost(gamingOnly, 'r/GTA6', 'Look at my setup');
    await expect
      .poll(() => {
        return stateOf(gamingOnly, 0);
      })
      .toBe('ok'); // r/GTA6 has "gta" but no gaming word, so only the GTA block covers it
  });

  test('with both blocks off nothing is hidden by subreddit', async ({ openFixture }) => {
    const page = await openFixture({}, 'reddit');

    await addPost(page, 'r/GTA6', 'Best pasta recipe');
    await addPost(page, 'r/gaming', 'Best pasta recipe');
    await page.waitForTimeout(300);
    expect(await stateOf(page, 0)).toBe('ok');
    expect(await stateOf(page, 1)).toBe('ok');
  });

  test('at the Everything level the blocks do nothing: protection is off', async ({ openFixture }) => {
    const page = await openFixture(
      blocks({ redditBlockGta: true, redditBlockGaming: true }, { level: 'everything' }),
      'reddit',
    );

    await addPost(page, 'r/GTA6', 'Best pasta recipe');
    await page.waitForTimeout(300);
    expect(await stateOf(page, 0)).toBe('pending'); // untouched
  });

  test('a trusted subreddit is exempt from the blocks, and its spoilers are still caught', async ({ openFixture }) => {
    const page = await openFixture(
      blocks({ redditBlockGta: true }, { mode: 'gameplay', trusted: { 'r/gta6': 'r/GTA6' } }),
      'reddit',
    );

    await addPost(page, 'r/GTA6', 'Best pasta recipe');
    await addPost(page, 'r/GTA6', 'GTA 6 ending explained'); // a story spoiler: still hidden in Gameplay mode
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
    expect(await kindOf(page)).toBe('Story spoiler');
  });

  test('the cover offers Trust for the subreddit, on the right, and trusting clears it', async ({ openFixture }) => {
    const page = await openFixture(blocks({ redditBlockGta: true }), 'reddit');

    await addPost(page, 'r/GTA6', 'Best pasta recipe');
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');

    const badge = page.locator('.gv-card__trust');

    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('data-key', 'r/gta6');
    await expect(badge).toHaveAttribute('data-name', 'r/GTA6');

    // on the right, like on every other site: the badge sits closer to the right edge than to the left
    const place = await page.evaluate(() => {
      const card = document.querySelector('.gv-card').getBoundingClientRect();
      const trust = document.querySelector('.gv-card__trust').getBoundingClientRect();

      return { fromLeft: trust.left - card.left, fromRight: card.right - trust.right };
    });

    expect(place.fromRight).toBeLessThan(place.fromLeft);

    await badge.click();
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('ok');
    await expect(page.locator('#gv-toast')).toContainText('r/GTA6 trusted');
  });

  test('comments in a blocked subreddit are hidden too, as strips naming the subreddit', async ({ openFixture }) => {
    const page = await openFixture(blocks({ redditBlockGta: true }), 'reddit');

    await addPost(page, 'r/GTA6', 'Best pasta recipe');
    await page.evaluate(() => {
      const comment = document.createElement('shreddit-comment');

      comment.innerHTML = '<div slot="commentMeta" class="meta">u/x</div><div slot="comment" class="c">nice one</div>';
      document.getElementById('feed').append(comment);
    });
    await expect(page.locator('.gv-strip')).toHaveCount(1);

    const text = await page.evaluate(() => {
      return getComputedStyle(document.querySelector('.gv-strip__kind'), '::before').content;
    });

    expect(text).toContain('r/GTA6 hidden');
    await expect(page.locator('.meta')).toBeVisible();
  });

  test('old Reddit: a post in a blocked subreddit is hidden', async ({ openFixture }) => {
    const page = await openFixture(blocks({ redditBlockGaming: true }), 'oldreddit');

    await page.evaluate(() => {
      for (const sub of ['PS5', 'cooking']) {
        const post = document.createElement('div');

        post.className = 'thing link';
        post.setAttribute('data-subreddit', sub);
        post.innerHTML = '<a class="title">Look at my setup</a>';
        document.getElementById('feed').append(post);
      }
    });
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');
    expect(await stateOf(page, 1)).toBe('ok');
  });
});

test.describe('Reddit tab in the popup', () => {
  const openPopup = async context => {
    const popup = await context.newPage();

    await popup.setViewportSize({ width: 340, height: 600 });

    return popup;
  };

  test('only the Reddit tab has the two checkboxes, and no sync', async ({ context, extensionId }) => {
    const popup = await openPopup(context);

    await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
    await expect(popup.locator('#levels .levels__button--on')).toHaveCount(1);
    await popup.click('[data-view="trusted"]');
    await expect(popup.locator('[data-trust-site]')).toHaveText(['YT', 'X', 'Reddit']);
    await expect(popup.locator('#redditBlocks')).toBeHidden();

    await popup.click('[data-trust-site="reddit"]');
    await expect(popup.locator('#blockGta')).toBeVisible();
    await expect(popup.locator('#blockGaming')).toBeVisible();
    await expect(popup.locator('#sync')).toBeHidden();
    await expect(popup.locator('#syncBox')).toBeHidden(); // nothing to sync on Reddit: the box would only repeat the hint

    const height = await popup.evaluate(() => {
      return document.documentElement.scrollHeight;
    });

    expect(height).toBeLessThanOrEqual(600);
  });

  test('ticking a block reaches an open Reddit page, and unticking lets the post back', async ({
    context,
    extensionId,
    openFixture,
  }) => {
    const reddit = await openFixture({}, 'reddit');

    await addPost(reddit, 'r/GTA6', 'Best pasta recipe');
    await expect
      .poll(() => {
        return stateOf(reddit, 0);
      })
      .toBe('ok');

    const popup = await openPopup(context);

    await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
    await expect(popup.locator('#levels .levels__button--on')).toHaveCount(1);
    await popup.click('[data-view="trusted"]');
    await popup.click('[data-trust-site="reddit"]');
    await popup.check('#blockGta');
    await expect
      .poll(
        () => {
          return stateOf(reddit, 0);
        },
        { timeout: 8000 },
      )
      .toBe('blocked');

    await popup.uncheck('#blockGta');
    await expect
      .poll(
        () => {
          return stateOf(reddit, 0);
        },
        { timeout: 8000 },
      )
      .toBe('ok');

    await popup.reload();
    await popup.click('[data-view="trusted"]');
    await popup.click('[data-trust-site="reddit"]');
    await expect(popup.locator('#blockGta')).not.toBeChecked();
  });

  test('the Reddit list starts empty with a hint on how to add one', async ({ context, extensionId }) => {
    const popup = await openPopup(context);

    await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
    await expect(popup.locator('#levels .levels__button--on')).toHaveCount(1);
    await popup.click('[data-view="trusted"]');
    await popup.click('[data-trust-site="reddit"]');
    await expect(popup.locator('.list__empty')).toContainText('Use Trust on a hidden Reddit post');
    await expect(popup.locator('#modes')).toHaveClass(/levels--disabled/);
    await expect(popup.locator('#modeDesc')).toHaveText('Trust a subreddit to turn this on.');
  });
});
