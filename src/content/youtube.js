// YouTube adapter: tile selectors, how to find a channel, the watch page, and the subscriptions sync.
GV.engine.start({
  site: 'youtube',
  trust: { list: 'trusted', mode: 'subsMode' },
  tiles: [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'yt-lockup-view-model',
    'ytd-playlist-renderer',
    'ytd-compact-playlist-renderer',
    'ytd-reel-item-renderer',
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
    'ytd-reel-video-renderer',
    'ytd-comment-thread-renderer',
    'ytm-video-with-context-renderer',
    'ytm-compact-video-renderer',
  ],

  // Which channel a tile belongs to: its /@handle link when it has one, else the name shown in the tile.
  channelOf: (element, clean) => {
    const link = 'a[href^="/@"],a[href^="/channel/"],a[href^="/c/"],a[href^="/user/"]';
    const names = 'ytd-channel-name,yt-content-metadata-view-model span:not(:has(*))';
    const first = element.querySelector(link);
    const key = first ? GV.channelKeyFromHref(first.getAttribute('href')) : '';
    let name = '';

    // The channel link's own text first, then name elements. Skip empty placeholders and stats that sit beside
    // the name ("194K views"). textContent, not innerText: a blocked tile's children are visibility:hidden.
    for (const node of [...element.querySelectorAll(link), ...element.querySelectorAll(names)]) {
      const text = node.textContent.split('\n').map(clean).find(GV.isChannelName) || '';

      if (text) {
        name = text;
        break;
      }
    }

    return { key, name };
  },

  setup: api => {
    let watchState = null; // null (ok) | 'pending' | 'blocked'
    let watch = { v: null, prev: '', title: '', r: null, shown: false };

    const handleReveal = () => {
      watch.shown = true;
      watchCheck();
    };

    const applyWatch = state => {
      watchState = state;

      if (state) {
        api.root.setAttribute('data-gv-watch', state);
      } else {
        api.root.removeAttribute('data-gv-watch');
      }

      let overlay = document.getElementById('gv-overlay');

      if (!state) {
        if (overlay) {
          api.sizer.unobserve(overlay);
          overlay.remove();
        }

        for (const video of api.paused) {
          if (video.closest('ytd-player,#movie_player')) {
            api.paused.delete(video);
            video.play().catch(() => {});
          }
        }

        return;
      }

      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'gv-overlay';
        overlay.innerHTML = `<div class="gv-box"><span class="gv-logo"></span><div class="gv-t"></div><button>Reveal</button></div>`;
        api.sizer.observe(overlay);
        overlay.querySelector('button').onclick = handleReveal;
      }

      overlay.dataset.state = state;
      overlay.querySelector('.gv-t').textContent =
        state === 'blocked' ? api.LABELS[watch.r.bucket] + ' hidden' : 'Checking video…';

      const host = document.getElementById('player');

      if (host && overlay.parentElement !== host) {
        host.append(overlay);
      }

      for (const video of document.querySelectorAll('ytd-player video,#movie_player video')) {
        if (!video.paused) {
          video.pause();
          api.paused.add(video);
        }
      }
    };

    // Watch page: the stale <h1> from the previous video must not count, so wait until the title changes.
    const watchCheck = () => {
      const { level, panic, mode } = api.settings();

      if (level === 'off' || location.pathname !== '/watch') {
        watch = { v: null, prev: watch.title, title: watch.title, r: null, shown: false };
        applyWatch(null);

        return;
      }

      const videoId = new URLSearchParams(location.search).get('v');

      if (videoId !== watch.v) {
        watch = { v: videoId, prev: watch.title, title: '', r: null, shown: false };
      }

      if (!watch.r) {
        const title = api.clean(document.querySelector('ytd-watch-metadata h1')?.textContent || '');

        if (title && title !== watch.prev) {
          const owner = api.clean(document.querySelector('ytd-watch-metadata ytd-channel-name')?.textContent || '');

          watch.title = title;
          watch.r = GV.classify(title + ' ' + owner, { panic });
        }
      }

      if (!watch.r) {
        applyWatch('pending');

        return;
      }

      // re-read the owner each time: the channel link can arrive after the title
      const ownerLink = document.querySelector('ytd-watch-metadata ytd-channel-name a');
      const owner = {
        key: GV.channelKeyFromHref(ownerLink?.getAttribute('href')),
        name:
          (document.querySelector('ytd-watch-metadata ytd-channel-name')?.textContent || '')
            .split('\n')
            .map(api.clean)
            .find(Boolean) || '',
      };
      const keepHidden = GV.keepsStoryHidden(mode) && watch.r.bucket === 'story';
      const bypass = GV.isTrusted(api.trust(), owner) && !keepHidden;
      const blocked = GV.isBlocked(watch.r, level) && !watch.shown && !bypass;

      applyWatch(blocked ? 'blocked' : null);
    };

    const handleNavigateStart = () => {
      watch.r = null;
      watch.prev = watch.title;
      watch.shown = false;
      watchCheck();
    };

    for (const name of ['yt-navigate-finish', 'yt-page-data-updated']) {
      document.addEventListener(name, api.idle);
    }

    document.addEventListener('yt-navigate-start', handleNavigateStart);

    // Reads your subscriptions page and stores the list locally; a failed read keeps the old list.
    const syncSubscriptions = async () => {
      try {
        const response = await fetch('/feed/channels', { credentials: 'same-origin' });
        const list = GV.parseSubscriptions(await response.text());

        if (!list.length) {
          chrome.storage.local.set({ syncError: 'No subscriptions found. Are you signed in?' });

          return;
        }

        const subs = Object.fromEntries(
          list.map(item => {
            return [item.key, item.name];
          }),
        );
        const avatars = Object.fromEntries(
          list.map(item => {
            return [item.key, item.avatar];
          }),
        );

        chrome.storage.local.set({ subs, avatars, syncedAt: Date.now(), syncError: '' });
      } catch {
        chrome.storage.local.set({ syncError: 'Could not read your subscriptions.' });
      }
    };

    // refresh the list once a day, but only for people who have synced before
    chrome.storage.local.get({ subs: {}, syncedAt: 0 }, ({ subs, syncedAt }) => {
      if (Object.keys(subs).length && Date.now() - syncedAt > 24 * 60 * 60 * 1000) {
        syncSubscriptions();
      }
    });

    return {
      // comments take their GTA context from the video being watched
      assumeGta: element => {
        return element.localName === 'ytd-comment-thread-renderer' && Boolean(watch.r?.gta);
      },
      skipTrust: element => {
        return element.localName === 'ytd-comment-thread-renderer';
      },
      isPlayerHidden: video => {
        return Boolean(watchState) && Boolean(video.closest('ytd-player,#movie_player'));
      },
      onSweep: watchCheck,
      // re-evaluate the open video when settings change
      onApply: () => {
        watch = { ...watch, r: null, prev: '', shown: false, v: null };
      },
    };
  },
});
