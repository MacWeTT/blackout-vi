// Reddit adapter. Works on the current web app (shreddit-* elements) and on old.reddit.com (div.thing). Posts and
// comments are the tiles. There are no joined-community features, so there is no trusted list. A top-level comment owns
// its replies, so a spoiler anywhere in the thread hides the whole thread: replies fold with their parent.
const OLD_REDDIT = location.hostname === 'old.reddit.com';
const POST = OLD_REDDIT ? 'div.thing.link' : 'shreddit-post';

// 'r/GTA6' for a post or a comment: its own attribute, else the post on the page, else the address
const subOf = element => {
  const own = element.getAttribute('subreddit-prefixed-name');

  if (own) {
    return own;
  }

  const name = element.getAttribute('subreddit-name');

  if (name) {
    return 'r/' + name;
  }

  // a post's permalink holds it too: /r/GTA6/comments/...
  const fromLink = /\/r\/([^/]+)\/comments\//.exec(element.getAttribute('permalink') || '')?.[1];

  if (fromLink) {
    return 'r/' + fromLink;
  }

  const host = element.closest('[data-subreddit]');

  if (host) {
    return 'r/' + host.getAttribute('data-subreddit');
  }

  const post = document.querySelector(POST);
  const fromPost = post?.getAttribute('subreddit-prefixed-name') || post?.dataset?.subreddit;

  if (fromPost) {
    return fromPost.startsWith('r/') ? fromPost : 'r/' + fromPost;
  }

  const fromAddress = /^\/r\/([^/]+)/.exec(location.pathname)?.[1];

  return fromAddress ? 'r/' + fromAddress : '';
};

GV.engine.start({
  site: 'reddit',
  trust: { list: 'redditTrusted', mode: 'redditMode' }, // never used: Reddit has no trusted list
  // a comment's tile is its own text body, so replies (their own comments) are judged on their own
  tiles: OLD_REDDIT
    ? ['div.thing.link', 'div.thing.comment > div.entry .usertext-body']
    : ['shreddit-post', "shreddit-comment [slot='comment']", "[data-testid='search-post-unit']"],
  // Extra settings (synced): block every post from GTA / gaming subreddits. Off until the user turns them on.
  extra: { redditBlockGta: false, redditBlockGaming: false },

  // The subreddit stands in for the "channel": it is what Trust applies to, so a trusted subreddit skips the blocks.
  channelOf: element => {
    const sub = subOf(element);

    return sub ? { key: sub.toLowerCase(), name: sub } : { key: '', name: '' };
  },

  // the current web app keeps a post's title in an attribute as well as in the page
  extraText: element => {
    return element.getAttribute('post-title') || '';
  },

  setup: api => {
    // comments take their GTA context from the post they are under
    const aboutGta = () => {
      const post = document.querySelector(POST);

      if (!post) {
        return false;
      }

      const raw = post.textContent + (post.getAttribute('post-title') || '');

      if (post.__gvCtxRaw !== raw) {
        post.__gvCtxRaw = raw;
        post.__gvCtx = GV.classify(api.textOf(post)).gta;
      }

      return Boolean(post.__gvCtx);
    };

    const isComment = element => {
      return OLD_REDDIT ? Boolean(element.closest('.thing.comment')) : element.matches("[slot='comment']");
    };

    return {
      isComment,
      // blocked by subreddit: the whole post (or comment) is hidden whatever it says
      forceBlock: (element, extra) => {
        const sub = subOf(element);
        const bare = sub.replace(/^r\//i, '').toLowerCase();
        const { gta, gaming } = GV_WORDS.subreddits;

        if (!bare) {
          return '';
        }

        const matches = list => {
          return list.some(pattern => {
            return pattern.test(bare);
          });
        };

        return (extra.redditBlockGta && matches(gta)) || (extra.redditBlockGaming && matches(gaming))
          ? `${sub} hidden`
          : '';
      },
      assumeGta: element => {
        return isComment(element) && aboutGta();
      },
    };
  },
});
