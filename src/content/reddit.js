// Reddit adapter (the current web app). Posts and comments are the tiles. There are no joined-community features,
// so there is no trusted list. A top-level comment owns its replies, so a spoiler anywhere in the thread hides the
// whole thread: replies fold with their parent.
GV.engine.start({
  site: 'reddit',
  trust: { list: 'redditTrusted', mode: 'redditMode' }, // never used: Reddit has no trusted list
  tiles: ['shreddit-post', 'shreddit-comment'],
  channelOf: () => {
    return { key: '', name: '' };
  },

  setup: api => {
    // comments take their GTA context from the post they are under
    const aboutGta = () => {
      const post = document.querySelector('shreddit-post');

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

    const isComment = element => {
      return element.localName === 'shreddit-comment';
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
