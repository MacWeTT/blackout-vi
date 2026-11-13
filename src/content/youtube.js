(() => {
  const TILES = [
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
  ].join(',');
  const LEVELS = ['all', 'news', 'story', 'off'];
  const LABELS = { story: 'Story spoiler', gameplay: 'Gameplay spoiler', news: 'GTA VI news' };
  const KEY = 'gv_settings';
  const root = document.documentElement;

  // localStorage is a synchronous cache so the right level applies before chrome.storage answers.
  let settings = {
    level: 'news',
    panic: false,
    subsMode: 'same',
    trusted: {},
    subs: {},
    disabled: {},
  };
  let trust = GV.buildTrust(settings);

  try {
    settings = { ...settings, ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    // no cache yet: the defaults stay
  }

  if (!LEVELS.includes(settings.level)) {
    settings.level = 'news';
  }

  root.toggleAttribute('data-gv-off', settings.level === 'off');

  let stamp = 0; // bumped on settings change so cached verdicts are recomputed
  const paused = new Set();

  // Publishes a blocked card's size to the CSS (--gv-w, --gv-h) so its logo and text scale with it.
  const sizer = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;

      entry.target.style.setProperty('--gv-w', Math.round(width));
      entry.target.style.setProperty('--gv-h', Math.round(height));
    }
  });
  const dirty = new Set();
  let watchState = null; // null (ok) | 'pending' | 'blocked'
  let watch = { v: null, prev: '', title: '', r: null, shown: false };

  const outer = element => {
    let current = element;
    let parent = current.parentElement?.closest(TILES);

    while (parent) {
      current = parent;
      parent = current.parentElement?.closest(TILES);
    }

    return current;
  };

  const clean = text => {
    return text.replace(/\s+/g, ' ').trim();
  };

  // Text nodes are joined with spaces: adjacent elements often have no whitespace between them in the DOM,
  // and "NewGTA 6" would otherwise slip past the word-boundary patterns.
  const textOf = element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const parts = [];

    while (walker.nextNode()) {
      parts.push(walker.currentNode.nodeValue);
    }

    let text = parts.join(' ');

    for (const node of element.querySelectorAll('[aria-label],[title],[alt]')) {
      const attrs = ['aria-label', 'title', 'alt'].map(name => {
        return node.getAttribute(name) || '';
      });

      text += ' ' + attrs.join(' ');
    }

    return clean(text);
  };

  // Which channel a tile belongs to: its /@handle link when it has one, else the name shown in the tile.
  const CHANNEL_LINK = 'a[href^="/@"],a[href^="/channel/"],a[href^="/c/"],a[href^="/user/"]';
  const CHANNEL_NAME = 'ytd-channel-name,yt-content-metadata-view-model span:not(:has(*))';

  const channelOf = element => {
    const link = element.querySelector(CHANNEL_LINK);
    const key = link ? GV.channelKeyFromHref(link.getAttribute('href')) : '';
    let name = '';

    // The channel link's own text first, then name elements. Skip empty placeholders and stats that sit beside
    // the name ("194K views"). textContent, not innerText: a blocked tile's children are visibility:hidden.
    const candidates = [...element.querySelectorAll(CHANNEL_LINK), ...element.querySelectorAll(CHANNEL_NAME)];

    for (const node of candidates) {
      const text = node.textContent.split('\n').map(clean).find(GV.isChannelName) || '';

      if (text) {
        name = text;
        break;
      }
    }

    return { key, name };
  };

  const showToast = (message, onUndo) => {
    document.getElementById('gv-toast')?.remove();

    const toast = document.createElement('div');
    const text = document.createElement('span');
    const undo = document.createElement('button');

    toast.id = 'gv-toast';
    text.textContent = message;
    undo.textContent = 'Undo';
    undo.onclick = () => {
      onUndo();
      toast.remove();
    };
    toast.append(text, undo);
    document.documentElement.append(toast);
    setTimeout(() => toast.remove(), 7000);
  };

  // The card is a real element so its text can have a hierarchy; its words come from CSS (data-kind),
  // so they never become part of the tile's own text and never feed back into the classifier.
  const showCard = (element, label, channel) => {
    let card = element.querySelector(':scope > .gv-card');

    if (!card) {
      card = document.createElement('div');
      card.className = 'gv-card';
      card.innerHTML = `<span class="gv-card__logo"></span><span class="gv-card__kind"></span><span class="gv-card__hint"></span><span class="gv-card__trust"></span>`;
      element.append(card);
    }

    card.querySelector('.gv-card__kind').dataset.kind = label;

    // the badge only appears when we can say which channel this is
    const badge = card.querySelector('.gv-card__trust');
    const known = channel.key || channel.name;

    badge.hidden = !known;
    badge.dataset.key = channel.key;
    badge.dataset.name = channel.name || channel.key;
  };

  const hideCard = element => {
    element.querySelector(':scope > .gv-card')?.remove();
  };

  const resumeIn = element => {
    for (const video of paused) {
      if (element.contains(video)) {
        paused.delete(video);
        video.play().catch(() => {});
      }
    }
  };

  const setState = (element, blocked, label, channel) => {
    if (blocked === null) {
      element.removeAttribute('data-gv-ok');
      element.removeAttribute('data-gv-blocked');
      element.removeAttribute('data-gv-shown');
      sizer.unobserve(element);
      hideCard(element);
      delete element.__gvSig;

      return;
    }

    if (blocked) {
      element.setAttribute('data-gv-blocked', '');
      element.setAttribute('data-gv-label', label);
      element.removeAttribute('data-gv-ok');
      sizer.observe(element);
      showCard(element, label, channel);

      for (const video of element.querySelectorAll('video')) {
        video.pause();
        paused.add(video);
      }

      return;
    }

    element.setAttribute('data-gv-ok', '');
    element.removeAttribute('data-gv-blocked');
    element.removeAttribute('data-gv-shown');
    sizer.unobserve(element);
    hideCard(element);
    resumeIn(element);
  };

  const check = element => {
    const { level, panic, subsMode } = settings;

    if (level === 'off' || !element.isConnected) {
      return;
    }

    const text = textOf(element);

    // no text yet: stays hidden, never revealed on a timeout
    if (!text) {
      setState(element, null);

      return;
    }

    const isComment = element.localName === 'ytd-comment-thread-renderer';
    const assumeGta = isComment && Boolean(watch.r?.gta);
    const channel = isComment ? { key: '', name: '' } : channelOf(element);
    const trusted = GV.isTrusted(trust, channel);
    const signature = [text, assumeGta, channel.key, channel.name, trusted].join('|');

    if (element.__gvSig === signature && element.__gvStamp === stamp) {
      return;
    }

    const result = GV.classify(text, { assumeGta, panic });
    const keepHidden = GV.keepsStoryHidden(subsMode) && result.bucket === 'story';
    const blocked = GV.isBlocked(result, level) && !(trusted && !keepHidden);
    const label = LABELS[result.bucket];

    // a revealed tile keeps its reveal while it stays blocked
    if (blocked && element.hasAttribute('data-gv-blocked')) {
      element.setAttribute('data-gv-label', label);

      if (!element.hasAttribute('data-gv-shown')) {
        showCard(element, label, channel);
      }
    } else {
      setState(element, blocked, label, channel);
    }

    element.__gvSig = signature;
    element.__gvStamp = stamp;
  };

  const handleReveal = () => {
    watch.shown = true;
    watchCheck();
  };

  const applyWatch = state => {
    watchState = state;

    if (state) {
      root.setAttribute('data-gv-watch', state);
    } else {
      root.removeAttribute('data-gv-watch');
    }

    let overlay = document.getElementById('gv-overlay');

    if (!state) {
      if (overlay) {
        sizer.unobserve(overlay);
        overlay.remove();
      }

      for (const video of paused) {
        if (video.closest('ytd-player,#movie_player')) {
          paused.delete(video);
          video.play().catch(() => {});
        }
      }

      return;
    }

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'gv-overlay';
      overlay.innerHTML = `<div class="gv-box"><span class="gv-logo"></span><div class="gv-t"></div><button>Reveal</button></div>`;
      sizer.observe(overlay);
      overlay.querySelector('button').onclick = handleReveal;
    }

    overlay.dataset.state = state;
    overlay.querySelector('.gv-t').textContent =
      state === 'blocked' ? LABELS[watch.r.bucket] + ' hidden' : 'Checking video…';

    const host = document.getElementById('player');

    if (host && overlay.parentElement !== host) {
      host.append(overlay);
    }

    for (const video of document.querySelectorAll('ytd-player video,#movie_player video')) {
      if (!video.paused) {
        video.pause();
        paused.add(video);
      }
    }
  };

  // Watch page: the stale <h1> from the previous video must not count, so wait until the title changes.
  const watchCheck = () => {
    const { level, panic, subsMode } = settings;

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
      const title = clean(document.querySelector('ytd-watch-metadata h1')?.textContent || '');

      if (title && title !== watch.prev) {
        const owner = clean(document.querySelector('ytd-watch-metadata ytd-channel-name')?.textContent || '');

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
          .map(clean)
          .find(Boolean) || '',
    };
    const keepHidden = GV.keepsStoryHidden(subsMode) && watch.r.bucket === 'story';
    const bypass = GV.isTrusted(trust, owner) && !keepHidden;
    const blocked = GV.isBlocked(watch.r, level) && !watch.shown && !bypass;

    applyWatch(blocked ? 'blocked' : null);
  };

  const collect = node => {
    const element = node.nodeType === 1 ? node : node.parentElement;

    if (!element) {
      return;
    }

    const up = element.closest(TILES);

    if (up) {
      dirty.add(outer(up));
    }

    for (const tile of element.querySelectorAll(TILES)) {
      dirty.add(outer(tile));
    }
  };

  const flush = () => {
    if (settings.level !== 'off') {
      for (const element of dirty) {
        check(element);
      }
    }

    dirty.clear();
    watchCheck();
  };

  // Runs as a microtask right after the DOM change, so a tile is classified before it can paint.
  const handleMutations = records => {
    for (const record of records) {
      if (record.type === 'childList') {
        for (const node of record.addedNodes) {
          collect(node);
        }
      }

      collect(record.target);
    }

    flush();
  };

  new MutationObserver(handleMutations).observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-label', 'title', 'href', 'alt'],
  });

  // Backstop only; unchanged tiles cost one string compare.
  const sweep = () => {
    if (settings.level !== 'off') {
      for (const element of document.querySelectorAll(TILES)) {
        if (!element.parentElement.closest(TILES)) {
          check(element);
        }
      }
    }

    watchCheck();
  };

  const idle = () => {
    (window.requestIdleCallback || setTimeout)(sweep);
  };

  let scrollTimer;

  const handleScroll = () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(idle, 200);
  };

  const handleNavigateStart = () => {
    watch.r = null;
    watch.prev = watch.title;
    watch.shown = false;
    watchCheck();
  };

  const handleVisibility = () => {
    if (!document.hidden) {
      idle();
    }
  };

  addEventListener('scroll', handleScroll, { passive: true });

  for (const name of ['yt-navigate-finish', 'yt-page-data-updated', 'popstate']) {
    document.addEventListener(name, idle);
  }

  document.addEventListener('yt-navigate-start', handleNavigateStart);
  document.addEventListener('visibilitychange', handleVisibility);
  setInterval(handleVisibility, 2000);

  // Reveal on click, then swallow that click so the video doesn't open.
  const handleClick = event => {
    const badge = event.target.closest?.('.gv-card__trust');

    if (badge) {
      event.preventDefault();
      event.stopImmediatePropagation();
      trustChannel({ key: badge.dataset.key, name: badge.dataset.name });

      return;
    }

    const tile = event.target.closest?.('[data-gv-blocked]:not([data-gv-shown])');

    if (!tile) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    tile.setAttribute('data-gv-shown', '');
    resumeIn(tile);
  };

  // Anything that starts playing inside a hidden tile or player is paused straight away.
  const isHidden = video => {
    if (watchState && video.closest('ytd-player,#movie_player')) {
      return true;
    }

    const closest = video.closest(TILES);
    const tile = closest && outer(closest);

    return Boolean(tile) && !tile.hasAttribute('data-gv-ok') && !tile.hasAttribute('data-gv-shown');
  };

  const handlePlay = event => {
    const video = event.target;

    if (settings.level === 'off' || video.localName !== 'video') {
      return;
    }

    if (isHidden(video)) {
      video.pause();
      paused.add(video);
    }
  };

  document.addEventListener('click', handleClick, true);
  document.addEventListener('play', handlePlay, true);

  const apply = incoming => {
    settings = { ...settings, ...incoming };

    if (!LEVELS.includes(settings.level)) {
      settings.level = 'news';
    }

    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      // storage blocked: the level still applies for this page
    }

    root.toggleAttribute('data-gv-off', settings.level === 'off');
    trust = GV.buildTrust(settings);
    stamp++;

    // re-evaluate the open video
    watch = { ...watch, r: null, prev: '', shown: false, v: null };
    sweep();
  };

  const load = () => {
    const defaults = {
      level: settings.level,
      panic: settings.panic,
      subsMode: settings.subsMode,
      trusted: settings.trusted,
      disabled: settings.disabled,
    };

    chrome.storage.sync.get(defaults, synced => {
      chrome.storage.local.get({ subs: settings.subs }, local => {
        apply({ ...synced, subs: local.subs });
      });
    });
  };

  // "Trust this channel": saved to sync storage and applied here at once, with an undo.
  const trustChannel = channel => {
    const key = GV.entryKey(channel);
    const name = channel.name || channel.key;
    const trusted = { ...settings.trusted, [key]: name };
    const disabled = { ...settings.disabled };

    delete disabled[key];
    chrome.storage.sync.set({ trusted, disabled });
    apply({ trusted, disabled });

    const kept = GV.keepsStoryHidden(settings.subsMode) ? ' Story spoilers stay hidden.' : '';

    showToast(`${name} trusted.${kept}`, () => {
      const without = { ...settings.trusted };

      delete without[key];
      chrome.storage.sync.set({ trusted: without });
      apply({ trusted: without });
    });
  };

  // Reads your subscriptions page and stores the list locally; a failed read keeps the old list.
  const syncSubscriptions = async () => {
    try {
      const response = await fetch('/feed/channels', { credentials: 'same-origin' });
      const list = GV.parseSubscriptions(await response.text());

      if (!list.length) {
        chrome.storage.local.set({ syncError: 'No subscriptions found. Are you signed in?' });

        return;
      }

      const subs = Object.fromEntries(list.map(item => [item.key, item.name]));

      chrome.storage.local.set({ subs, syncedAt: Date.now(), syncError: '' });
    } catch {
      chrome.storage.local.set({ syncError: 'Could not read your subscriptions.' });
    }
  };

  const handleStorageChange = () => {
    load();
  };

  load();
  chrome.storage.onChanged.addListener(handleStorageChange);

  // refresh the list once a day while the switch is on
  chrome.storage.local.get({ syncedAt: 0 }, ({ syncedAt }) => {
    if (GV.subsTrusted(settings.subsMode) && Date.now() - syncedAt > 24 * 60 * 60 * 1000) {
      syncSubscriptions();
    }
  });

  if (location.pathname === '/watch') {
    watchCheck();
  }
})();
