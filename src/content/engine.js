// Shared engine for every site. A tile is hidden until it is judged; a blocked tile gets a card with a reveal click
// and a trust badge. Each site supplies an adapter: its tile selectors, how to find the author, and site-only hooks.
(() => {
  const LABELS = { story: 'Story spoiler', gameplay: 'Gameplay spoiler', content: 'GTA VI content' };
  // Comments get a one-line strip, not a card. "Potential" because the matching is by keywords and can be wrong.
  const STRIP_LABELS = {
    story: 'Potential story spoiler hidden',
    gameplay: 'Potential gameplay spoiler hidden',
    content: 'Potential spoiler hidden',
  };
  const KEY = 'gv_settings';

  const start = adapter => {
    const TILES = adapter.tiles.join(',');
    const listKey = adapter.trust.list;
    const modeKey = adapter.trust.mode;
    const root = document.documentElement;

    // Resolved settings for this site. localStorage is a synchronous cache so the right level applies before
    // chrome.storage answers.
    let settings = { level: 'content', panic: false, mode: 'gameplay', trusted: {} };
    let trust = GV.buildTrust({ trusted: settings.trusted, subsMode: settings.mode });

    try {
      settings = { ...settings, ...JSON.parse(localStorage.getItem(KEY)) };
    } catch {
      // no cache yet: the defaults stay
    }

    settings.level = GV.normalizeLevel(settings.level);

    settings.mode = GV.normalizeMode(settings.mode);

    trust = GV.buildTrust({ trusted: settings.trusted, subsMode: settings.mode });
    root.toggleAttribute('data-gv-everything', settings.level === 'everything');

    let stamp = 0; // bumped on settings change so cached verdicts are recomputed
    const paused = new Set();
    const dirty = new Map(); // tile -> true when an attribute changed (its text must be re-read for sure)
    let hooks = {};

    // Publishes a blocked card's size to the CSS (--gv-w, --gv-h) so its logo and text scale with it.
    const sizer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;

        entry.target.style.setProperty('--gv-w', Math.round(width));
        entry.target.style.setProperty('--gv-h', Math.round(height));

        // too small for the logo to fit beside the badge and text
        entry.target.toggleAttribute('data-gv-small', width < 200 || height < 120);
      }
    });

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
      setTimeout(() => {
        return toast.remove();
      }, 7000);
    };

    // The card is a real element so its text can have a hierarchy; its words come from CSS (data-kind),
    // so they never become part of the tile's own text and never feed back into the classifier.
    const showCard = (element, label, channel, trusted) => {
      let card = element.querySelector(':scope > .gv-card');

      if (!card) {
        card = document.createElement('div');
        card.className = 'gv-card';
        card.innerHTML = `<span class="gv-card__logo"></span><span class="gv-card__kind"></span><span class="gv-card__hint"></span><span class="gv-card__trust"></span>`;
        element.append(card);
      }

      card.querySelector('.gv-card__kind').dataset.kind = label;

      // the badge only appears when we can say who this is
      const badge = card.querySelector('.gv-card__trust');
      const known = channel.key || channel.name;

      badge.hidden = !known;
      badge.toggleAttribute('data-trusted', Boolean(trusted));
      badge.dataset.key = channel.key;
      badge.dataset.name = channel.name || channel.key;
    };

    // The strip's words come from CSS too (data-kind), so they never feed back into the classifier. Only its
    // Show button reveals the comment.
    const showStrip = (element, label) => {
      let strip = element.querySelector(':scope > .gv-strip');

      if (!strip) {
        strip = document.createElement('div');
        strip.className = 'gv-strip';
        strip.innerHTML = '<span class="gv-strip__kind"></span><button class="gv-strip__show" type="button"></button>';
        element.append(strip);
      }

      strip.querySelector('.gv-strip__kind').dataset.kind = label;
    };

    const hideCard = element => {
      element.querySelector(':scope > .gv-card')?.remove();
      element.querySelector(':scope > .gv-strip')?.remove();
    };

    const resumeIn = element => {
      for (const video of paused) {
        if (element.contains(video)) {
          paused.delete(video);
          video.play().catch(() => {});
        }
      }
    };

    const setState = (element, blocked, info = {}) => {
      if (blocked === null) {
        element.removeAttribute('data-gv-ok');
        element.removeAttribute('data-gv-blocked');
        element.removeAttribute('data-gv-shown');
        element.removeAttribute('data-gv-comment');
        sizer.unobserve(element);
        hideCard(element);
        delete element.__gvSig;

        return;
      }

      if (blocked) {
        element.setAttribute('data-gv-blocked', '');
        element.setAttribute('data-gv-label', info.label);
        element.removeAttribute('data-gv-ok');
        element.toggleAttribute('data-gv-comment', Boolean(info.comment));

        if (info.comment) {
          showStrip(element, info.strip);
        } else {
          sizer.observe(element);
          showCard(element, info.label, info.channel, info.trusted);
        }

        for (const video of element.querySelectorAll('video')) {
          video.pause();
          paused.add(video);
        }

        return;
      }

      element.setAttribute('data-gv-ok', '');
      element.removeAttribute('data-gv-blocked');
      element.removeAttribute('data-gv-shown');
      element.removeAttribute('data-gv-comment');
      sizer.unobserve(element);
      hideCard(element);
      resumeIn(element);
    };

    const check = (element, force = false) => {
      const { level, panic, mode } = settings;

      if (level === 'everything' || !element.isConnected) {
        return;
      }

      // Fast path for the backstop sweep and for churn inside a tile: same text, same settings, nothing to do.
      // An attribute change (aria-label, href...) forces a full re-read because textContent does not show it.
      const raw = element.textContent;

      if (!force && element.__gvStamp === stamp && element.__gvRaw === raw) {
        return;
      }

      const text = textOf(element);

      // no text yet: stays hidden, never revealed on a timeout
      if (!text) {
        setState(element, null);

        return;
      }

      const assumeGta = Boolean(hooks.assumeGta?.(element));
      const comment = Boolean(hooks.isComment?.(element));
      const channel = hooks.skipTrust?.(element) ? { key: '', name: '' } : adapter.channelOf(element, clean);
      const trusted = GV.isTrusted(trust, channel);
      const signature = [text, assumeGta, comment, channel.key, channel.name, trusted].join('|');

      if (element.__gvSig === signature && element.__gvStamp === stamp) {
        return;
      }

      const result = GV.classify(text, { assumeGta, panic });
      const keepHidden = GV.keepsStoryHidden(mode) && result.bucket === 'story';
      const blocked = GV.isBlocked(result, level) && !(trusted && !keepHidden);
      const info = { label: LABELS[result.bucket], strip: STRIP_LABELS[result.bucket], channel, trusted, comment };

      // a revealed tile keeps its reveal while it stays blocked
      if (blocked && element.hasAttribute('data-gv-blocked')) {
        element.setAttribute('data-gv-label', info.label);

        if (!element.hasAttribute('data-gv-shown')) {
          if (comment) {
            showStrip(element, info.strip);
          } else {
            showCard(element, info.label, channel, trusted);
          }
        }
      } else {
        setState(element, blocked, info);
      }

      element.__gvSig = signature;
      element.__gvStamp = stamp;
      element.__gvRaw = raw;
    };

    const queue = (tile, force) => {
      const top = outer(tile);

      dirty.set(top, dirty.get(top) || force);
    };

    // deep: the node was just added, so look for tiles inside it. Otherwise only the tile it belongs to matters:
    // scanning a whole container on every record made a long feed cost more with every tile added.
    const collect = (node, force, deep) => {
      const element = node.nodeType === 1 ? node : node.parentElement;

      if (!element) {
        return;
      }

      const up = element.closest(TILES);

      if (up) {
        queue(up, force);
      }

      if (deep) {
        for (const tile of element.querySelectorAll(TILES)) {
          queue(tile, force);
        }
      }
    };

    // our own card, toast and overlay change the DOM too; reacting to them would only make more work
    const OURS = '.gv-card,.gv-strip,#gv-toast,#gv-overlay';
    const isOurs = node => {
      return node.nodeType === 1
        ? node.matches(OURS) || Boolean(node.closest(OURS))
        : Boolean(node.parentElement?.closest(OURS));
    };

    const flush = () => {
      if (settings.level !== 'everything') {
        for (const [element, force] of dirty) {
          check(element, force);
        }
      }

      dirty.clear();
      hooks.onSweep?.();
    };

    // Runs as a microtask right after the DOM change, so a tile is classified before it can paint.
    const handleMutations = records => {
      for (const record of records) {
        if (isOurs(record.target)) {
          continue;
        }

        if (record.type === 'childList') {
          for (const node of record.addedNodes) {
            if (!isOurs(node)) {
              collect(node, false, true);
            }
          }

          collect(record.target, false, false);
        } else {
          // attributes feed the text we read (aria-label, title, alt), so they force a full re-read
          collect(record.target, record.type === 'attributes', false);
        }
      }

      flush();
    };

    const observer = new MutationObserver(handleMutations);

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'title', 'href', 'alt'],
    });

    // Backstop only; unchanged tiles cost one string compare.
    const sweep = () => {
      if (settings.level !== 'everything') {
        for (const element of document.querySelectorAll(TILES)) {
          if (!element.parentElement.closest(TILES)) {
            check(element);
          }
        }
      }

      hooks.onSweep?.();
    };

    const idle = () => {
      (window.requestIdleCallback || setTimeout)(sweep);
    };

    let scrollTimer;

    const handleScroll = () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(idle, 200);
    };

    // After the extension is reloaded or updated, tabs that were already open keep this script but lose the
    // chrome.* APIs ("Extension context invalidated"). Such an orphan stops its timers and observer quietly;
    // cards still reveal on click, which needs no extension API.
    const alive = () => {
      try {
        return Boolean(chrome.runtime?.id);
      } catch {
        return false;
      }
    };

    const handleVisibility = () => {
      if (!alive()) {
        observer.disconnect();
        clearInterval(timer);

        return;
      }

      if (!document.hidden) {
        idle();
      }
    };

    addEventListener('scroll', handleScroll, { passive: true });
    addEventListener('popstate', idle);
    document.addEventListener('visibilitychange', handleVisibility);
    const timer = setInterval(handleVisibility, 2000);

    const apply = incoming => {
      settings = { ...settings, ...incoming };

      settings.level = GV.normalizeLevel(settings.level);

      settings.mode = GV.normalizeMode(settings.mode);

      try {
        localStorage.setItem(KEY, JSON.stringify(settings));
      } catch {
        // storage blocked: the level still applies for this page
      }

      root.toggleAttribute('data-gv-everything', settings.level === 'everything');
      trust = GV.buildTrust({ trusted: settings.trusted, subsMode: settings.mode });
      stamp++;
      hooks.onApply?.();
      sweep();
    };

    // "Trust this channel": saved to sync storage and applied here at once, with an undo.
    const trustChannel = channel => {
      if (!alive()) {
        showToast('Spoiler Shield was reloaded. Refresh this tab to use Trust.', () => {});

        return;
      }

      const key = GV.entryKey(channel);
      const name = channel.name || channel.key;
      const trusted = { ...settings.trusted, [key]: name };

      chrome.storage.sync.set({ [listKey]: trusted });
      apply({ trusted });

      const kept = GV.keepsStoryHidden(settings.mode) ? ' Story spoilers stay hidden.' : '';

      showToast(`${name} trusted.${kept}`, () => {
        const without = { ...settings.trusted };

        delete without[key];
        chrome.storage.sync.set({ [listKey]: without });
        apply({ trusted: without });
      });
    };

    const untrustChannel = channel => {
      if (!alive()) {
        showToast('Spoiler Shield was reloaded. Refresh this tab to use Trust.', () => {});

        return;
      }

      const same = (key, name) => {
        return (channel.key && key === channel.key) || name.toLowerCase() === (channel.name || '').toLowerCase();
      };
      const before = settings.trusted;
      const trusted = Object.fromEntries(
        Object.entries(before).filter(([key, name]) => {
          return !same(key, name);
        }),
      );

      chrome.storage.sync.set({ [listKey]: trusted });
      apply({ trusted });
      showToast(`${channel.name || channel.key} is no longer trusted.`, () => {
        chrome.storage.sync.set({ [listKey]: before });
        apply({ trusted: before });
      });
    };

    // Reveal on click, then swallow that click so the tile doesn't open.
    const handleClick = event => {
      const badge = event.target.closest?.('.gv-card__trust');

      if (badge) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const channel = { key: badge.dataset.key, name: badge.dataset.name };

        // a trusted channel's badge shows a check; clicking it again takes the trust back
        if (badge.hasAttribute('data-trusted')) {
          untrustChannel(channel);
        } else {
          trustChannel(channel);
        }

        return;
      }

      const tile = event.target.closest?.('[data-gv-blocked]:not([data-gv-shown])');

      if (!tile) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      // a comment reveals only from its Show button, so a stray click in a thread never shows a spoiler
      if (tile.hasAttribute('data-gv-comment') && !event.target.closest('.gv-strip__show')) {
        return;
      }

      tile.setAttribute('data-gv-shown', '');
      tile.querySelector(':scope > .gv-strip')?.remove();
      resumeIn(tile);
    };

    // Anything that starts playing inside a hidden tile (or a site's hidden player) is paused straight away.
    const isHidden = video => {
      if (hooks.isPlayerHidden?.(video)) {
        return true;
      }

      const closest = video.closest(TILES);
      const tile = closest && outer(closest);

      return Boolean(tile) && !tile.hasAttribute('data-gv-ok') && !tile.hasAttribute('data-gv-shown');
    };

    const handlePlay = event => {
      const video = event.target;

      if (settings.level === 'everything' || video.localName !== 'video') {
        return;
      }

      if (isHidden(video)) {
        video.pause();
        paused.add(video);
      }
    };

    document.addEventListener('click', handleClick, true);
    document.addEventListener('play', handlePlay, true);

    // The site's settings out of everything in storage: its own override when global settings are off.
    const resolve = synced => {
      const site = synced.global === false ? synced.sites?.[adapter.site] || {} : {};

      return {
        level: site.level ?? synced.level,
        panic: site.panic ?? synced.panic,
        mode: synced[modeKey],
        trusted: synced[listKey],
      };
    };

    const load = () => {
      const defaults = {
        global: true,
        level: settings.level,
        panic: settings.panic,
        sites: {},
        [modeKey]: settings.mode,
        [listKey]: settings.trusted,
      };

      chrome.storage.sync.get(defaults, synced => {
        apply(resolve(synced));
      });
    };

    const api = {
      LABELS,
      paused,
      sizer,
      root,
      clean,
      textOf,
      idle,
      resumeIn,
      settings: () => {
        return settings;
      },
      trust: () => {
        return trust;
      },
    };

    hooks = adapter.setup?.(api) || {};
    load();
    chrome.storage.onChanged.addListener(load);
    hooks.onSweep?.();
  };

  globalThis.GV = { ...globalThis.GV, engine: { start, LABELS } };
})();
