const { test, expect, stateOf } = require('./fixtures');

const SPOILER = 'bro when Jason dies in the final mission i actually cried';

// 'ok' | 'blocked' | 'pending' for the n-th element matching a selector (comments are judged one text body at a time)
const stateAt = (page, selector, index) => {
  return page.evaluate(
    ([css, i]) => {
      const element = document.querySelectorAll(css)[i];

      if (element.hasAttribute('data-gv-ok')) {
        return 'ok';
      }

      return element.hasAttribute('data-gv-blocked') ? 'blocked' : 'pending';
    },
    [selector, index],
  );
};

const stripText = page => {
  return page.evaluate(() => {
    return getComputedStyle(document.querySelector('.gv-strip__kind'), '::before').content;
  });
};

// every one of these tests must leave the comment's author and actions alone: only the text is replaced
const leakSampler = (page, selector) => {
  return page.evaluate(css => {
    window.__leaks = [];

    const sample = () => {
      for (const el of document.querySelectorAll(css)) {
        const unmarked = !el.hasAttribute('data-gv-ok') && !el.hasAttribute('data-gv-blocked');

        if (unmarked && getComputedStyle(el).opacity !== '0') {
          window.__leaks.push(el.textContent);
        }
      }

      requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);
  }, selector);
};

const leaks = page => {
  return page.evaluate(() => {
    return window.__leaks;
  });
};

// ---------------------------------------------------------------- YouTube comments

const TEXT = '#content-text';

// a comment thread as YouTube builds it: each comment (and each reply) has its own #content-text
const addYoutubeComment = (page, text, reply = '') => {
  return page.evaluate(
    ([content, nested]) => {
      const thread = document.createElement('ytd-comment-thread-renderer');
      const replies = nested
        ? `<div class="replies"><ytd-comment-view-model><b class="author">@Replier</b><div id="content-text" class="reply">${nested}</div><div class="actions">Like</div></ytd-comment-view-model></div>`
        : '';

      thread.innerHTML = `<ytd-comment-view-model><b class="author">@Name</b><div id="content-text" class="main">${content}</div><div class="actions">Reply</div></ytd-comment-view-model>${replies}`;
      document.getElementById('feed').append(thread);
    },
    [text, reply],
  );
};

test.describe('YouTube comments', () => {
  test('only the text of a spoiler comment is replaced by a strip: author and actions stay', async ({
    openFixture,
  }) => {
    const page = await openFixture();

    await addYoutubeComment(page, SPOILER);
    await expect
      .poll(() => {
        return stateAt(page, TEXT, 0);
      })
      .toBe('blocked');
    await expect(page.locator('.gv-strip')).toBeVisible();
    await expect(page.locator('.gv-card')).toHaveCount(0);
    expect(await stripText(page)).toContain('Potential story spoiler hidden');

    await expect(page.locator('.author')).toBeVisible();
    await expect(page.locator('.actions')).toBeVisible();

    const height = await page.locator(TEXT).evaluate(element => {
      return element.getBoundingClientRect().height;
    });

    expect(height).toBeLessThan(70); // the text collapsed to one line
  });

  test('the strip names the kind: gameplay, story, or just a spoiler at the Nothing level', async ({ openFixture }) => {
    const gameplay = await openFixture();

    await addYoutubeComment(gameplay, 'GTA 6 gameplay first hour was great');
    await expect
      .poll(() => {
        return stateAt(gameplay, TEXT, 0);
      })
      .toBe('blocked');
    expect(await stripText(gameplay)).toContain('Potential gameplay spoiler hidden');

    const nothing = await openFixture({ level: 'nothing' });

    await addYoutubeComment(nothing, 'GTA 6 trailer music is unreal');
    await expect
      .poll(() => {
        return stateAt(nothing, TEXT, 0);
      })
      .toBe('blocked');
    expect(await stripText(nothing)).toContain('Potential spoiler hidden');
  });

  test('only the Show button reveals; clicking the strip itself does nothing', async ({ openFixture }) => {
    const page = await openFixture();

    await addYoutubeComment(page, SPOILER);
    await expect
      .poll(() => {
        return stateAt(page, TEXT, 0);
      })
      .toBe('blocked');

    await page.locator('.gv-strip__kind').click();
    await page.locator('.gv-strip').click({ position: { x: 5, y: 5 } });
    await expect(page.locator(TEXT)).not.toHaveAttribute('data-gv-shown', '');
    await expect(page.locator('.gv-strip')).toHaveCount(1);

    await page.locator('.gv-strip__show').click();
    await expect(page.locator(TEXT)).toHaveAttribute('data-gv-shown', '');
    await expect(page.locator('.gv-strip')).toHaveCount(0);
    await expect(page.locator('.main')).toBeVisible();
    await expect(page.locator('.main')).toContainText('Jason dies');
  });

  test('comments follow the same level as posts', async ({ openFixture }) => {
    const cases = [
      ['nothing', ['blocked', 'blocked', 'blocked']],
      ['content', ['ok', 'blocked', 'blocked']],
      ['gameplay', ['ok', 'ok', 'blocked']],
      ['everything', ['pending', 'pending', 'pending']], // Everything: comments are left untouched
    ];

    for (const [level, expected] of cases) {
      const page = await openFixture({ level });

      await addYoutubeComment(page, 'GTA 6 trailer music is unreal');
      await addYoutubeComment(page, 'GTA 6 gameplay first hour was great');
      await addYoutubeComment(page, 'GTA 6 ending explained, Jason dies');
      await page.waitForTimeout(300);

      const states = [];

      for (let i = 0; i < 3; i++) {
        states.push(await stateAt(page, TEXT, i));
      }

      expect(states, level).toEqual(expected);
      await page.close();
    }
  });

  test('a harmless comment is left alone', async ({ openFixture }) => {
    const page = await openFixture();

    await addYoutubeComment(page, 'great video, thanks for the pasta recipe');
    await expect
      .poll(() => {
        return stateAt(page, TEXT, 0);
      })
      .toBe('ok');
    await expect(page.locator('.gv-strip')).toHaveCount(0);
  });

  test('each comment is judged on its own: a spoiler in a reply hides only the reply text', async ({ openFixture }) => {
    const page = await openFixture();

    await addYoutubeComment(page, 'what a trailer', SPOILER);
    await expect
      .poll(() => {
        return stateAt(page, TEXT, 1);
      })
      .toBe('blocked');
    expect(await stateAt(page, TEXT, 0)).toBe('ok');
    await expect(page.locator('.main')).toBeVisible(); // the parent comment is untouched
    await expect(page.locator('.gv-strip')).toHaveCount(1);
    await expect(page.locator('.author')).toHaveCount(2);
    await expect(page.locator('.author').first()).toBeVisible();
    await expect(page.locator('.author').last()).toBeVisible(); // the replier is still named
  });

  test('loose text directly inside the comment body (not in an element) is hidden too', async ({ openFixture }) => {
    const page = await openFixture();

    await page.evaluate(() => {
      const thread = document.createElement('ytd-comment-thread-renderer');
      const view = document.createElement('ytd-comment-view-model');
      const body = document.createElement('div');

      body.id = 'content-text';
      // a text node straight under the body element, no wrapper
      body.append(document.createTextNode('bro when Jason dies in the final mission i actually cried'));
      view.append(body);
      thread.append(view);
      document.getElementById('feed').append(thread);
    });
    await expect
      .poll(() => {
        return stateAt(page, TEXT, 0);
      })
      .toBe('blocked');

    const look = await page.locator(TEXT).evaluate(element => {
      const style = getComputedStyle(element);

      return { size: style.fontSize, color: style.color };
    });

    expect(look.size).toBe('0px');
    expect(look.color).toBe('rgba(0, 0, 0, 0)');
    await expect(page.locator('.gv-strip__kind')).toBeVisible(); // the strip keeps its own look
  });

  test('a site re-render that wipes the strip gets it back', async ({ openFixture }) => {
    const page = await openFixture();

    await addYoutubeComment(page, SPOILER);
    await expect(page.locator('.gv-strip')).toHaveCount(1);
    await page.evaluate(() => {
      document.querySelector('.gv-strip').remove(); // what a framework re-render can do
    });
    await expect(page.locator('.gv-strip')).toHaveCount(1);
  });

  test('a comment is never visible before it is judged', async ({ openFixture }) => {
    const page = await openFixture();

    await leakSampler(page, TEXT);

    for (let i = 0; i < 10; i++) {
      await addYoutubeComment(page, `${SPOILER} ${i}`);
    }

    await page.waitForTimeout(400);
    expect(await leaks(page)).toEqual([]);
  });
});

// ---------------------------------------------------------------- X replies

// a tweet the way X renders it: author block, text, actions; id gives it its own permalink
const addTweet = (page, text, id = '') => {
  return page.evaluate(
    ([content, statusId]) => {
      const tweet = document.createElement('article');
      const link = statusId ? `<a href="/someone/status/${statusId}">link</a>` : '';

      tweet.setAttribute('data-testid', 'tweet');
      tweet.innerHTML =
        `<div data-testid="User-Name"><a href="/a" class="author">A</a><a href="/a">@a</a></div>` +
        `<div data-testid="tweetText">${content}</div><div class="actions">reply like</div>${link}`;
      document.getElementById('feed').append(tweet);
    },
    [text, id],
  );
};

const openStatusPage = async (context, focalText) => {
  const page = await context.newPage();

  await page.addInitScript(() => {
    localStorage.setItem('gv_settings', JSON.stringify({ level: 'content', panic: false }));
  });
  await page.goto('https://x.com/someone/status/1');
  await addTweet(page, focalText, '1'); // the post being read: its own link carries its id

  return page;
};

test.describe('X replies', () => {
  test('on a GTA VI post, a reply that never says GTA is hidden: only its text, as a strip', async ({ context }) => {
    const page = await openStatusPage(context, 'GTA 6 trailer 3 is out');

    await addTweet(page, 'the ending was wild', '2');
    await expect
      .poll(() => {
        return stateOf(page, 1);
      })
      .toBe('blocked');
    await expect(page.locator('.gv-strip')).toHaveCount(1);
    await expect(page.locator('.gv-card')).toHaveCount(0);
    expect(await stripText(page)).toContain('Potential story spoiler hidden');

    // the reply's text is gone, but its author and actions are still there
    const reply = page.locator('#feed > :nth-child(2)');

    await expect(reply.locator('[data-testid="tweetText"]')).toBeHidden();
    await expect(reply.locator('[data-testid="User-Name"]')).toBeVisible();
    await expect(reply.locator('.actions')).toBeVisible();

    // the post being read stays: it is content, which the default level allows
    expect(await stateOf(page, 0)).toBe('ok');
  });

  test('the same reply under a post that is not about GTA VI is left alone', async ({ context }) => {
    const page = await openStatusPage(context, 'Making pasta tonight');

    await addTweet(page, 'the ending was wild', '2');
    await expect
      .poll(() => {
        return stateOf(page, 1);
      })
      .toBe('ok');
  });

  test('only Show reveals a reply; the author link keeps working', async ({ context }) => {
    const page = await openStatusPage(context, 'GTA 6 trailer 3 is out');

    await addTweet(page, 'the ending was wild', '2');
    await expect(page.locator('.gv-strip')).toHaveCount(1);

    // a click on the author must not be swallowed; a click on the strip must be
    await page.evaluate(() => {
      window.__prevented = [];
      document.addEventListener('click', event => {
        window.__prevented.push(event.defaultPrevented);
      });
      document.querySelectorAll('.author')[1].addEventListener('click', event => {
        event.preventDefault();
      });
    });

    await page.locator('.gv-strip__kind').click();
    await page.locator('#feed > :nth-child(2) .author').click();

    const prevented = await page.evaluate(() => {
      return window.__prevented;
    });

    expect(prevented[0]).toBe(true); // the strip swallowed it
    await expect(page.locator('.gv-strip')).toHaveCount(1);

    await page.locator('.gv-strip__show').click();
    await expect(page.locator('.gv-strip')).toHaveCount(0);
    await expect(page.locator('#feed > :nth-child(2) [data-testid="tweetText"]')).toBeVisible();
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

// a comment as the current Reddit builds it: meta, text (slot="comment"), actions, and its replies as child comments
const addRedditComment = (page, text, reply = '') => {
  return page.evaluate(
    ([content, nested]) => {
      const comment = document.createElement('shreddit-comment');
      const children = nested
        ? `<div slot="children"><shreddit-comment><div slot="commentMeta" class="meta">u/Replier</div><div slot="comment" class="r">${nested}</div><div slot="actionRow" class="votes">vote</div></shreddit-comment></div>`
        : '';

      comment.innerHTML = `<div slot="commentMeta" class="meta">u/Name</div><div slot="comment" class="c">${content}</div><div slot="actionRow" class="votes">vote</div>${children}`;
      document.getElementById('feed').append(comment);
    },
    [text, reply],
  );
};

const RTEXT = "shreddit-comment [slot='comment']";

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

  test('a comment under a GTA VI post is judged as GTA VI: its text becomes a strip, the author and votes stay', async ({
    openFixture,
  }) => {
    const page = await openFixture({}, 'reddit');

    await addRedditPost(page, 'GTA 6 trailer 3');
    await addRedditComment(page, 'the ending was wild');
    await expect
      .poll(() => {
        return stateAt(page, RTEXT, 0);
      })
      .toBe('blocked');
    await expect(page.locator('.gv-strip')).toHaveCount(1);
    expect(await stripText(page)).toContain('Potential story spoiler hidden');
    await expect(page.locator('.meta')).toBeVisible();
    await expect(page.locator('.votes')).toBeVisible();
  });

  test('the same comment under an unrelated post is left alone', async ({ openFixture }) => {
    const page = await openFixture({}, 'reddit');

    await addRedditPost(page, 'Best pasta recipe');
    await addRedditComment(page, 'the ending was wild');
    await expect
      .poll(() => {
        return stateAt(page, RTEXT, 0);
      })
      .toBe('ok');
  });

  test('each comment on its own: a spoiler in a reply hides only the reply text, not the thread', async ({
    openFixture,
  }) => {
    const page = await openFixture({}, 'reddit');

    await addRedditPost(page, 'GTA 6 trailer 3');
    await addRedditComment(page, 'what a trailer', 'wait until you see the ending');
    await expect
      .poll(() => {
        return stateAt(page, RTEXT, 1);
      })
      .toBe('blocked');
    expect(await stateAt(page, RTEXT, 0)).toBe('ok');
    await expect(page.locator('.c')).toBeVisible(); // the parent comment is untouched
    await expect(page.locator('.gv-strip')).toHaveCount(1);
    await expect(page.locator('.meta')).toHaveCount(2);
    await expect(page.locator('.meta').last()).toBeVisible(); // the replier is still named
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

  test('a post and its comments are never visible before they are judged', async ({ openFixture }) => {
    const page = await openFixture({}, 'reddit');

    await leakSampler(page, "shreddit-post, shreddit-comment [slot='comment']");

    for (let i = 0; i < 6; i++) {
      await addRedditPost(page, `GTA 6 ending ${i}`);
      await addRedditComment(page, `the ending was wild ${i}`);
    }

    await page.waitForTimeout(400);
    expect(await leaks(page)).toEqual([]);
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
      const child = nested
        ? `<div class="child"><div class="thing comment"><div class="entry"><div class="tagline replier">replier</div><div class="usertext-body reply">${nested}</div></div></div></div>`
        : '';

      comment.className = 'thing comment';
      comment.innerHTML = `<div class="entry"><div class="tagline author">user</div><div class="usertext-body main">${content}</div></div>${child}`;
      document.getElementById('feed').append(comment);
    },
    [text, reply],
  );
};

const OTEXT = 'div.thing.comment > div.entry .usertext-body';

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

  test('a comment under a GTA VI post: its text is a strip, replies are judged on their own', async ({
    openFixture,
  }) => {
    const page = await openFixture({}, 'oldreddit');

    await addOldPost(page, 'GTA 6 trailer 3');
    await addOldComment(page, 'the ending was wild');
    await addOldComment(page, 'what a trailer', 'wait until you see the ending');
    await addOldComment(page, 'love the music');
    await expect
      .poll(() => {
        return stateAt(page, OTEXT, 0);
      })
      .toBe('blocked');
    expect(await stateAt(page, OTEXT, 1)).toBe('ok'); // the parent of the spoiler reply is fine
    await expect
      .poll(() => {
        return stateAt(page, OTEXT, 2);
      })
      .toBe('blocked');
    expect(await stateAt(page, OTEXT, 3)).toBe('ok'); // content: shown at the default level
    await expect(page.locator('.gv-strip')).toHaveCount(2);
    // the reply's text element is the tile, so it holds the strip; its words are gone
    await expect(page.locator('.reply .gv-strip')).toHaveCount(1);
    expect(await page.locator('.reply').evaluate(element => {return getComputedStyle(element).color})).toBe('rgba(0, 0, 0, 0)');
    await expect(page.locator('.thing.comment .author').first()).toBeVisible();
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
        return stateAt(calm, OTEXT, 0);
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
    await expect(page.locator('.main')).toBeVisible();
  });
});
