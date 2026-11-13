const path = require('path');
const os = require('os');
const fs = require('fs');
const base = require('@playwright/test');

const EXTENSION = path.resolve(__dirname, '../..');
const FIXTURE_URL = 'https://www.youtube.com/__fixture';
const FIXTURE_HTML = `<!doctype html><html><head><title>fixture</title>
<style>ytd-rich-item-renderer,ytd-video-renderer,ytd-comment-thread-renderer,yt-lockup-view-model{display:block;width:300px;height:80px;margin:6px;background:#eee;color:#000}ytd-comment-thread-renderer{height:auto;min-height:30px}</style>
</head><body><div id="feed"></div></body></html>`;

const X_URL = 'https://x.com/__fixture';
const X_HTML = `<!doctype html><html><head><title>fixture</title>
<style>article,[data-testid='trend']{display:block;width:400px;height:90px;margin:6px;background:#eee;color:#000}</style>
</head><body><div id="feed"></div></body></html>`;

const REDDIT_URL = 'https://www.reddit.com/__fixture';
const OLD_REDDIT_URL = 'https://old.reddit.com/__fixture';
const REDDIT_HTML = `<!doctype html><html><head><title>fixture</title>
<style>shreddit-post,shreddit-comment,div.thing{display:block;width:420px;margin:6px;padding:6px;background:#eee;color:#000}</style>
</head><body><div id="feed"></div></body></html>`;

// the Following page lists three accounts as UserCells
const FOLLOWING_HTML = `<!doctype html><html><head><title>following</title></head><body>
<div data-testid="UserCell"><img src="https://pbs.example/profile_images/1/a.jpg"><a href="/rockstargames">Rockstar Games</a><div>@rockstargames</div><div>Following</div></div>
<div data-testid="UserCell"><a href="/digitalfoundry">Digital Foundry</a><div>@digitalfoundry</div></div>
<div data-testid="UserCell"><a href="/i/lists/1">A list</a></div>
</body></html>`;

// Launches Chromium with the unpacked extension and serves a fake YouTube page on the real origin.
const test = base.test.extend({
  context: async ({}, use) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-'));
    const context = await base.chromium.launchPersistentContext(dir, {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });

    await context.route('https://www.youtube.com/__fixture*', route => {
      route.fulfill({ contentType: 'text/html', body: FIXTURE_HTML });
    });
    await context.route('https://x.com/__fixture*', route => {
      route.fulfill({ contentType: 'text/html', body: X_HTML });
    });
    // a post's own page on X: the tweet being read, then its replies
    await context.route('https://x.com/someone/status/*', route => {
      route.fulfill({ contentType: 'text/html', body: X_HTML });
    });
    await context.route('https://old.reddit.com/__fixture*', route => {
      route.fulfill({ contentType: 'text/html', body: REDDIT_HTML });
    });
    await context.route('https://www.reddit.com/__fixture*', route => {
      route.fulfill({ contentType: 'text/html', body: REDDIT_HTML });
    });
    await context.route('https://x.com/me/following', route => {
      route.fulfill({ contentType: 'text/html', body: FOLLOWING_HTML });
    });
    // a signed-in subscriptions page: two channels inside ytInitialData
    await context.route('https://www.youtube.com/feed/channels', route => {
      const data = {
        contents: [
          {
            channelRenderer: {
              channelId: 'UC1',
              title: { simpleText: 'Rockstar Games' },
              thumbnail: { thumbnails: [{ url: '//yt3.example/rockstar.jpg' }] },
              navigationEndpoint: { browseEndpoint: { canonicalBaseUrl: '/@RockstarGames' } },
            },
          },
          {
            channelRenderer: {
              channelId: 'UC2',
              title: { simpleText: 'Digital Foundry' },
              navigationEndpoint: { browseEndpoint: { canonicalBaseUrl: '/@DigitalFoundry' } },
            },
          },
        ],
      };

      route.fulfill({
        contentType: 'text/html',
        body: `<html><script>var ytInitialData = ${JSON.stringify(data)};</script></html>`,
      });
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    // the extension has no background worker, so ask chrome://extensions for its id
    const page = await context.newPage();

    await page.goto('chrome://extensions');

    const id = await page.evaluate(async () => {
      const list = await chrome.developerPrivate.getExtensionsInfo();

      return list.find(item => {
        return item.name.includes('Spoiler Shield');
      }).id;
    });

    await page.close();
    await use(id);
  },

  // settings go into localStorage before the page loads, the same cache the content script reads first
  openFixture: async ({ context }, use) => {
    await use(async (settings = {}, site = 'youtube') => {
      const page = await context.newPage();

      await page.addInitScript(value => {
        // the content script rewrites this cache, so always reset it for a clean start
        localStorage.setItem('gv_settings', JSON.stringify({ level: 'content', panic: false, ...value }));
      }, settings);
      const urls = { x: X_URL, reddit: REDDIT_URL, oldreddit: OLD_REDDIT_URL };

      await page.goto(urls[site] || FIXTURE_URL);

      return page;
    });
  },
});

const addTile = (page, tag, text) => {
  return page.evaluate(
    ([tagName, content]) => {
      const element = document.createElement(tagName);

      element.textContent = content;
      document.getElementById('feed').append(element);
    },
    [tag, text],
  );
};

// 'ok' | 'blocked' | 'pending' for the tile at index
const stateOf = (page, index) => {
  return page.evaluate(i => {
    const element = document.getElementById('feed').children[i];

    if (element.hasAttribute('data-gv-ok')) {
      return 'ok';
    }

    return element.hasAttribute('data-gv-blocked') ? 'blocked' : 'pending';
  }, index);
};

module.exports = { test, expect: base.expect, addTile, stateOf, FIXTURE_URL };
