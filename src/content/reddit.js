// Reddit adapter. Works on the current web app (shreddit-* elements) and on old.reddit.com (div.thing). Posts and
// comments are the tiles. There are no joined-community features, so there is no trusted list. A top-level comment owns
// its replies, so a spoiler anywhere in the thread hides the whole thread: replies fold with their parent.
const OLD_REDDIT = location.hostname === 'old.reddit.com';
const POST = OLD_REDDIT ? 'div.thing.link' : 'shreddit-post';

GV.engine.start({
  site: 'reddit',
  trust: { list: 'redditTrusted', mode: 'redditMode' }, // never used: Reddit has no trusted list
  tiles: OLD_REDDIT
    ? ['div.thing.link', 'div.thing.comment']
    : ['shreddit-post', 'shreddit-comment', "[data-testid='search-post-unit']"],
  channelOf: () => {
    return { key: '', name: '' };
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
      return OLD_REDDIT ? element.classList.contains('comment') : element.localName === 'shreddit-comment';
    };

    return {
      isComment,
      skipTrust: () => {
        return true;
      },
      assumeGta: element => {
        return isComment(element) && aboutGta();
      },
    };
  },
});
