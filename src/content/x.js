// X adapter: tweets and trends are the tiles, the author is the trusted "channel", and the accounts you follow are
// collected while you scroll your Following page (X has no list we can fetch).
GV.engine.start({
  site: 'x',
  trust: { list: 'xTrusted', mode: 'xMode' },
  tiles: ["article[data-testid='tweet']", "[data-testid='trend']"],

  // The author's /handle link inside the tweet's name block; the display name is that block's first real name.
  channelOf: (element, clean) => {
    const box = element.querySelector("[data-testid='User-Name']");
    const profile = /^\/([^/?#]+)$/;
    const links = [...(box?.querySelectorAll('a[href^="/"]') || [])].filter(link => {
      const handle = profile.exec(link.getAttribute('href'))?.[1];

      return Boolean(handle) && handle !== 'i' && handle !== 'home';
    });

    if (!links.length) {
      return { key: '', name: '' };
    }

    const key = '@' + profile.exec(links[0].getAttribute('href'))[1].toLowerCase();
    let name = '';

    for (const link of links) {
      const text = link.textContent.split('\n').map(clean).find(GV.isChannelName) || '';

      if (text && !text.startsWith('@')) {
        name = text;
        break;
      }
    }

    return { key, name };
  },

  setup: api => {
    const following = /^\/[^/]+\/following\/?$/;
    const profile = /^\/([^/?#]+)$/;
    let timer = null;

    const harvest = () => {
      timer = null;

      const found = {};
      const avatars = {};

      for (const cell of document.querySelectorAll("[data-testid='UserCell']")) {
        const link = [...cell.querySelectorAll('a[href^="/"]')].find(item => {
          return profile.test(item.getAttribute('href'));
        });

        if (!link) {
          continue;
        }

        const key = '@' + profile.exec(link.getAttribute('href'))[1].toLowerCase();
        const lines = cell.innerText
          .split('\n')
          .map(line => {
            return line.trim();
          })
          .filter(Boolean);
        const name =
          lines.find(line => {
            return !line.startsWith('@') && !/^(Follow|Following|Follows you)$/i.test(line);
          }) || key;

        found[key] = name;
        avatars[key] = cell.querySelector("img[src*='profile_images']")?.src || '';
      }

      if (!Object.keys(found).length) {
        return;
      }

      chrome.storage.local.get({ xSubs: {}, xAvatars: {} }, local => {
        const isNew = Object.keys(found).some(key => {
          return !(key in local.xSubs);
        });

        if (isNew) {
          chrome.storage.local.set({
            xSubs: { ...local.xSubs, ...found },
            xAvatars: { ...local.xAvatars, ...avatars },
            xSyncedAt: Date.now(),
          });
        }
      });
    };

    // On a post's own page the other tweets are replies: comments. They are judged with the post's GTA context, so
    // "the ending was wild" under a GTA VI post is a spoiler even though it never says "GTA".
    const statusId = () => {
      return /^\/[^/]+\/status\/(\d+)/.exec(location.pathname)?.[1] || '';
    };

    const focal = id => {
      return [...document.querySelectorAll("article[data-testid='tweet']")].find(article => {
        return Boolean(article.querySelector(`a[href$="/status/${id}"]`));
      });
    };

    const isReply = element => {
      const id = statusId();

      return Boolean(id) && element !== focal(id);
    };

    const aboutGta = () => {
      const post = focal(statusId());

      if (!post) {
        return false;
      }

      const raw = post.textContent;

      if (post.__gvCtxRaw !== raw) {
        post.__gvCtxRaw = raw;
        post.__gvCtx = GV.classify(api.textOf(post)).gta;
      }

      return Boolean(post.__gvCtx);
    };

    return {
      isComment: isReply,
      // only the reply's text is replaced; its author, media and actions stay
      bodyOf: element => {
        return element.querySelector("[data-testid='tweetText']");
      },
      assumeGta: element => {
        return isReply(element) && aboutGta();
      },
      // only the Following page is read, and not more than twice a second
      onSweep: () => {
        if (following.test(location.pathname) && !timer) {
          timer = setTimeout(harvest, 500);
        }
      },
    };
  },
});
