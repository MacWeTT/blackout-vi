const { test, expect, stateOf } = require('./fixtures');

const SPOILER = 'bro when Jason dies in the final mission i actually cried';

// a YouTube comment thread, optionally with a reply nested inside it
const addYoutubeComment = (page, text, reply = '') => {
  return page.evaluate(
    ([content, nested]) => {
      const thread = document.createElement('ytd-comment-thread-renderer');

      thread.innerHTML = `<div class="body">${content}</div>${nested ? `<div class="replies">${nested}</div>` : ''}`;
      document.getElementById('feed').append(thread);
    },
    [text, reply],
  );
};

const stripText = page => {
  return page.evaluate(() => {
    return getComputedStyle(document.querySelector('.gv-strip__kind'), '::before').content;
  });
};

test.describe('YouTube comments', () => {
  test('a spoiler comment collapses to a one-line strip, not a card', async ({ openFixture }) => {
    const page = await openFixture();

    await addYoutubeComment(page, SPOILER);
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');
    await expect(page.locator('.gv-strip')).toBeVisible();
    await expect(page.locator('.gv-card')).toHaveCount(0);
    expect(await stripText(page)).toContain('Potential story spoiler hidden');

    // everything but the strip is gone, so the comment takes one line
    const height = await page.locator('#feed > :first-child').evaluate(element => {
      return element.getBoundingClientRect().height;
    });

    expect(height).toBeLessThan(70);
    await expect(page.locator('.body')).toBeHidden();
  });

  test('the strip names the kind: gameplay, story, or just a spoiler at the Nothing level', async ({ openFixture }) => {
    const gameplay = await openFixture();

    await addYoutubeComment(gameplay, 'GTA 6 gameplay first hour was great');
    await expect
      .poll(() => {
        return stateOf(gameplay, 0);
      })
      .toBe('blocked');
    expect(await stripText(gameplay)).toContain('Potential gameplay spoiler hidden');

    const nothing = await openFixture({ level: 'nothing' });

    await addYoutubeComment(nothing, 'GTA 6 trailer music is unreal');
    await expect
      .poll(() => {
        return stateOf(nothing, 0);
      })
      .toBe('blocked');
    expect(await stripText(nothing)).toContain('Potential spoiler hidden');
  });

  test('only the Show button reveals; clicking the strip itself does nothing', async ({ openFixture }) => {
    const page = await openFixture();

    await addYoutubeComment(page, SPOILER);
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');

    await page.locator('.gv-strip__kind').click();
    await page.locator('.gv-strip').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#feed > :first-child')).not.toHaveAttribute('data-gv-shown', '');
    await expect(page.locator('.body')).toBeHidden();

    await page.locator('.gv-strip__show').click();
    await expect(page.locator('#feed > :first-child')).toHaveAttribute('data-gv-shown', '');
    await expect(page.locator('.gv-strip')).toHaveCount(0);
    await expect(page.locator('.body')).toBeVisible();
  });

  test('comments follow the same level as posts', async ({ openFixture }) => {
    const cases = [
      ['nothing', ['blocked', 'blocked', 'blocked']],
      ['content', ['ok', 'blocked', 'blocked']],
      ['gameplay', ['ok', 'ok', 'blocked']],
      ['everything', ['pending', 'pending', 'pending']], // Everything: tiles are left untouched
    ];

    for (const [level, expected] of cases) {
      const page = await openFixture({ level });

      await addYoutubeComment(page, 'GTA 6 trailer music is unreal');
      await addYoutubeComment(page, 'GTA 6 gameplay first hour was great');
      await addYoutubeComment(page, 'GTA 6 ending explained, Jason dies');
      await page.waitForTimeout(300);

      const states = [];

      for (let i = 0; i < 3; i++) {
        states.push(await stateOf(page, i));
      }

      expect(states, level).toEqual(expected);
      await page.close();
    }
  });

  test('loose text directly inside the comment (not in an element) is hidden too', async ({ openFixture }) => {
    const page = await openFixture();

    await page.evaluate(() => {
      const thread = document.createElement('ytd-comment-thread-renderer');

      // a text node straight under the comment element, no wrapper
      thread.append(document.createTextNode('bro when Jason dies in the final mission i actually cried'));
      document.getElementById('feed').append(thread);
    });
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');

    const visible = await page.locator('#feed > :first-child').evaluate(element => {
      const style = getComputedStyle(element);

      return { size: style.fontSize, color: style.color };
    });

    expect(visible.size).toBe('0px');
    expect(visible.color).toBe('rgba(0, 0, 0, 0)');
    await expect(page.locator('.gv-strip__kind')).toBeVisible(); // the strip keeps its own look
  });

  test('a harmless comment is left alone', async ({ openFixture }) => {
    const page = await openFixture();

    await addYoutubeComment(page, 'great video, thanks for the pasta recipe');
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('ok');
    await expect(page.locator('.gv-strip')).toHaveCount(0);
  });

  test('replies fold with their parent: a spoiler in a reply hides the whole thread', async ({ openFixture }) => {
    const page = await openFixture();

    await addYoutubeComment(page, 'what a trailer', `<div class="reply">${SPOILER}</div>`);
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');
    await expect(page.locator('.reply')).toBeHidden();
    await expect(page.locator('.gv-strip')).toHaveCount(1);
  });

  test('a comment is never visible before it is judged', async ({ openFixture }) => {
    const page = await openFixture();

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

    for (let i = 0; i < 10; i++) {
      await addYoutubeComment(page, `${SPOILER} ${i}`);
    }

    await page.waitForTimeout(400);
    expect(
      await page.evaluate(() => {
        return window.__leaks;
      }),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------- X replies

const addTweet = (page, text, id = '') => {
  return page.evaluate(
    ([content, statusId]) => {
      const tweet = document.createElement('article');
      const link = statusId ? `<a href="/someone/status/${statusId}">link</a>` : '';

      tweet.setAttribute('data-testid', 'tweet');
      tweet.innerHTML =
        `<div data-testid="User-Name"><a href="/a">A</a><a href="/a">@a</a></div>` +
        `<div data-testid="tweetText">${content}</div>${link}`;
      document.getElementById('feed').append(tweet);
    },
    [text, id],
  );
};

const openStatusPage = async (context, extensionId, focalText) => {
  const page = await context.newPage();

  await page.addInitScript(() => {
    localStorage.setItem('gv_settings', JSON.stringify({ level: 'content', panic: false }));
  });
  await page.goto('https://x.com/someone/status/1');
  await addTweet(page, focalText, '1'); // the post being read: its own link carries its id

  return page;
};

test.describe('X replies', () => {
  test('on a GTA VI post, a reply that never says GTA is judged as GTA VI and hidden as a strip', async ({
    context,
    extensionId,
  }) => {
    const page = await openStatusPage(context, extensionId, 'GTA 6 trailer 3 is out');

    await addTweet(page, 'the ending was wild', '2');
    await expect
      .poll(() => {
        return stateOf(page, 1);
      })
      .toBe('blocked');
    await expect(page.locator('.gv-strip')).toHaveCount(1);
    await expect(page.locator('.gv-card')).toHaveCount(0);
    expect(await stripText(page)).toContain('Potential story spoiler hidden');

    // the post being read stays: it is news, which the default level allows
    expect(await stateOf(page, 0)).toBe('ok');
  });

  test('the same reply under a post that is not about GTA VI is left alone', async ({ context, extensionId }) => {
    const page = await openStatusPage(context, extensionId, 'Making pasta tonight');

    await addTweet(page, 'the ending was wild', '2');
    await expect
      .poll(() => {
        return stateOf(page, 1);
      })
      .toBe('ok');
  });

  test('only Show reveals a reply', async ({ context, extensionId }) => {
    const page = await openStatusPage(context, extensionId, 'GTA 6 trailer 3 is out');

    await addTweet(page, 'the ending was wild', '2');
    await expect(page.locator('.gv-strip')).toHaveCount(1);
    await page.locator('.gv-strip__kind').click();
    await expect(page.locator('.gv-strip')).toHaveCount(1);
    await page.locator('.gv-strip__show').click();
    await expect(page.locator('.gv-strip')).toHaveCount(0);
  });

  test('on the timeline a tweet still gets a card, not a strip', async ({ openFixture }) => {
    const page = await openFixture({}, 'x');

    await addTweet(page, 'GTA 6 ending explained');
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');
    await expect(page.locator('.gv-card')).toHaveCount(1);
    await expect(page.locator('.gv-strip')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------- Reddit

const addRedditPost = (page, title) => {
  return page.evaluate(text => {
    const post = document.createElement('shreddit-post');

    post.innerHTML = `<h1>${text}</h1>`;
    document.getElementById('feed').append(post);
  }, title);
};

const addRedditComment = (page, text, reply = '') => {
  return page.evaluate(
    ([content, nested]) => {
      const comment = document.createElement('shreddit-comment');

      comment.innerHTML = `<div class="c">${content}</div>${nested ? `<shreddit-comment><div class="r">${nested}</div></shreddit-comment>` : ''}`;
      document.getElementById('feed').append(comment);
    },
    [text, reply],
  );
};

test.describe('Reddit', () => {
  test('a post is judged and gets a card', async ({ openFixture }) => {
    const page = await openFixture({}, 'reddit');

    await addRedditPost(page, 'GTA 6 gameplay first hour is insane');
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');
    await expect(page.locator('.gv-card')).toHaveCount(1);
    await expect(page.locator('.gv-card__trust')).toBeHidden(); // no trusted list on Reddit
  });

  test('a harmless post is left alone', async ({ openFixture }) => {
    const page = await openFixture({}, 'reddit');

    await addRedditPost(page, 'Best pasta recipe');
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('ok');
  });

  test('a comment under a GTA VI post is judged as GTA VI even without the words, and becomes a strip', async ({
    openFixture,
  }) => {
    const page = await openFixture({}, 'reddit');

    await addRedditPost(page, 'GTA 6 trailer 3');
    await addRedditComment(page, 'the ending was wild');
    await expect
      .poll(() => {
        return stateOf(page, 1);
      })
      .toBe('blocked');
    await expect(page.locator('shreddit-comment .gv-strip')).toHaveCount(1);
    expect(await stripText(page)).toContain('Potential story spoiler hidden');
  });

  test('the same comment under an unrelated post is left alone', async ({ openFixture }) => {
    const page = await openFixture({}, 'reddit');

    await addRedditPost(page, 'Best pasta recipe');
    await addRedditComment(page, 'the ending was wild');
    await expect
      .poll(() => {
        return stateOf(page, 1);
      })
      .toBe('ok');
  });

  test('a spoiler in a reply hides the whole comment thread as one strip', async ({ openFixture }) => {
    const page = await openFixture({}, 'reddit');

    await addRedditPost(page, 'GTA 6 trailer 3');
    await addRedditComment(page, 'what a trailer', 'wait until you see the ending');
    await expect
      .poll(() => {
        return stateOf(page, 1);
      })
      .toBe('blocked');
    await expect(page.locator('.gv-strip')).toHaveCount(1);
    await expect(page.locator('.r')).toBeHidden();
  });

  test('only Show reveals a comment', async ({ openFixture }) => {
    const page = await openFixture({}, 'reddit');

    await addRedditPost(page, 'GTA 6 trailer 3');
    await addRedditComment(page, 'the ending was wild');
    await expect(page.locator('.gv-strip')).toHaveCount(1);
    await page.locator('.gv-strip__kind').click();
    await expect(page.locator('.gv-strip')).toHaveCount(1);
    await page.locator('.gv-strip__show').click();
    await expect(page.locator('.gv-strip')).toHaveCount(0);
    await expect(page.locator('.c')).toBeVisible();
  });

  test('a post is never visible before it is judged', async ({ openFixture }) => {
    const page = await openFixture({}, 'reddit');

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
      await addRedditPost(page, `GTA 6 ending ${i}`);
    }

    await page.waitForTimeout(400);
    expect(
      await page.evaluate(() => {
        return window.__leaks;
      }),
    ).toEqual([]);
  });

  test('Reddit follows its own level when Global settings is off in the popup', async ({
    context,
    extensionId,
    openFixture,
  }) => {
    const reddit = await openFixture({}, 'reddit');

    await addRedditPost(reddit, 'GTA 6 gameplay first hour');
    await expect
      .poll(() => {
        return stateOf(reddit, 0);
      })
      .toBe('blocked');

    const popup = await context.newPage();

    await popup.setViewportSize({ width: 340, height: 600 });
    await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
    await expect(popup.locator('#levels .levels__button--on')).toHaveCount(1);
    await popup.uncheck('#global');
    await popup.locator('[data-site-row="reddit"] [data-app-level="gameplay"]').click(); // Gameplay: shown

    await expect
      .poll(
        () => {
          return stateOf(reddit, 0);
        },
        { timeout: 8000 },
      )
      .toBe('ok');
  });
});

test.describe('Reddit, title only in an attribute', () => {
  test('a post whose title is only an attribute is still judged', async ({ openFixture }) => {
    const page = await openFixture({}, 'reddit');

    await page.evaluate(() => {
      const post = document.createElement('shreddit-post');

      post.setAttribute('post-title', 'GTA 6 ending explained'); // nothing inside it at all
      document.getElementById('feed').append(post);
    });
    await expect
      .poll(() => {
        return stateOf(page, 0);
      })
      .toBe('blocked');
  });
});

// ---------------------------------------------------------------- old Reddit (old.reddit.com)

const addOldPost = (page, title) => {
  return page.evaluate(text => {
    const post = document.createElement('div');

    post.className = 'thing link';
    post.innerHTML = `<a class="title">${text}</a>`;
    document.getElementById('feed').append(post);
  }, title);
};

const addOldComment = (page, text, reply = '') => {
  return page.evaluate(
    ([content, nested]) => {
      const comment = document.createElement('div');

      comment.className = 'thing comment';
      comment.innerHTML = `<div class="entry">${content}</div>${nested ? `<div class="child"><div class="thing comment"><div class="entry reply">${nested}</div></div></div>` : ''}`;
      document.getElementById('feed').append(comment);
    },
    [text, reply],
  );
};

test.describe('old Reddit', () => {
  test('a post is judged and gets a card', async ({ openFixture }) => {
    const page = await openFixture({}, 'oldreddit');

    await addOldPost(page, 'GTA 6 gameplay first hour is insane');
    await addOldPost(page, 'Best pasta recipe');
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
    await expect(page.locator('.gv-card')).toHaveCount(1);
  });

  test('a comment under a GTA VI post is a strip, and a reply folds with its parent', async ({ openFixture }) => {
    const page = await openFixture({}, 'oldreddit');

    await addOldPost(page, 'GTA 6 trailer 3');
    await addOldComment(page, 'the ending was wild');
    await addOldComment(page, 'what a trailer', 'wait until you see the ending');
    await addOldComment(page, 'love the music');
    await expect
      .poll(() => {
        return stateOf(page, 1);
      })
      .toBe('blocked');
    await expect
      .poll(() => {
        return stateOf(page, 2);
      })
      .toBe('blocked');
    await expect
      .poll(() => {
        return stateOf(page, 3);
      })
      .toBe('ok'); // content: shown at the default level
    await expect(page.locator('.thing.comment > .gv-strip')).toHaveCount(2);
    await expect(page.locator('.reply')).toBeHidden();
    expect(await stripText(page)).toContain('Potential story spoiler hidden');
  });

  test('a comment under an unrelated post is left alone, and Show reveals one that was hidden', async ({
    openFixture,
  }) => {
    const calm = await openFixture({}, 'oldreddit');

    await addOldPost(calm, 'Best pasta recipe');
    await addOldComment(calm, 'the ending was wild');
    await expect
      .poll(() => {
        return stateOf(calm, 1);
      })
      .toBe('ok');

    const page = await openFixture({}, 'oldreddit');

    await addOldPost(page, 'GTA 6 trailer 3');
    await addOldComment(page, 'the ending was wild');
    await expect(page.locator('.gv-strip')).toHaveCount(1);
    await page.locator('.gv-strip__kind').click();
    await expect(page.locator('.gv-strip')).toHaveCount(1);
    await page.locator('.gv-strip__show').click();
    await expect(page.locator('.gv-strip')).toHaveCount(0);
    await expect(page.locator('.entry')).toBeVisible();
  });
});
