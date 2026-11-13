// Trusted channels: pure helpers, no DOM, so they run in the content script, the popup and Node tests.
(() => {
  // '/@Handle/videos' -> '@handle', '/channel/UCabc' -> 'UCabc', anything else -> ''
  const channelKeyFromHref = href => {
    const path = String(href || '').split(/[?#]/)[0];
    const handle = path.match(/^\/(@[^/]+)/);

    if (handle) {
      return decodeURIComponent(handle[1]).toLowerCase();
    }

    const other = path.match(/^\/(?:channel|c|user)\/([^/]+)/);

    return other ? decodeURIComponent(other[1]) : '';
  };

  const lower = text => {
    return String(text || '')
      .trim()
      .toLowerCase();
  };

  // A real channel name, not a stat that sits beside it in the tile ("194K views", "3 hours ago", "12:30").
  const isChannelName = text => {
    const value = String(text || '').trim();

    if (!value || /^\d[\d.,:]*\s*[kmb]?(\s|$)/i.test(value)) {
      return false;
    }

    return !/\b(views?|watching|ago|subscribers?|likes?|streamed|premiered)\b/i.test(value);
  };

  // Entry key used for storage: the channel's own key, or its lowercased name when the tile showed no link.
  const entryKey = ref => {
    return ref.key || (ref.name ? 'name:' + lower(ref.name) : '');
  };

  // mode is what a trusted channel may show: 'same' (the list is ignored), 'gameplay' (content and gameplay skip the
  // shield, story spoilers stay hidden) or 'everything' (every rule is skipped).
  // Nothing is trusted unless the user added it: subscriptions are only a list to pick from.
  const keepsStoryHidden = mode => {
    return GV.normalizeMode(mode) !== 'everything';
  };

  const buildTrust = settings => {
    const { trusted = {}, subsMode = 'gameplay' } = settings;
    const entries = GV.normalizeMode(subsMode) === 'same' ? {} : trusted;
    const keys = new Set();
    const names = new Set();

    for (const [key, name] of Object.entries(entries)) {
      keys.add(key);

      // a name that looks like a stat must never match other tiles
      if (isChannelName(name)) {
        names.add(lower(name));
      }
    }

    return { keys, names };
  };

  // ref: { key, name }. An unidentified channel (no key, no name) is never trusted: failure means "stays hidden".
  const isTrusted = (trust, ref) => {
    if (!ref || (!ref.key && !ref.name)) {
      return false;
    }

    return Boolean(
      (ref.key && trust.keys.has(ref.key)) || (isChannelName(ref.name) && trust.names.has(lower(ref.name))),
    );
  };

  // Reads the subscriptions page (/feed/channels): its ytInitialData holds one channelRenderer per channel.
  const parseSubscriptions = html => {
    const marker = html.indexOf('ytInitialData');
    const start = marker < 0 ? -1 : html.indexOf('{', marker);

    if (start < 0) {
      return [];
    }

    let depth = 0;
    let inString = false;
    let end = -1;

    for (let i = start; i < html.length; i++) {
      const char = html[i];

      if (inString) {
        if (char === '\\') {
          i++;
        } else if (char === '"') {
          inString = false;
        }
      } else if (char === '"') {
        inString = true;
      } else if (char === '{') {
        depth++;
      } else if (char === '}' && --depth === 0) {
        end = i;
        break;
      }
    }

    let data;

    try {
      data = JSON.parse(html.slice(start, end + 1));
    } catch {
      return [];
    }

    const found = new Map();

    const walk = node => {
      if (!node || typeof node !== 'object') {
        return;
      }

      const renderer = node.channelRenderer;

      if (renderer) {
        const url = renderer.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl || '';
        const key = channelKeyFromHref(url) || renderer.channelId || '';
        const name = renderer.title?.simpleText || '';
        const picture = renderer.thumbnail?.thumbnails?.[0]?.url || '';
        const avatar = picture.startsWith('//') ? 'https:' + picture : picture;

        if (key && name) {
          found.set(key, { name, avatar });
        }
      }

      for (const value of Object.values(node)) {
        walk(value);
      }
    };

    walk(data);

    return [...found].map(([key, { name, avatar }]) => {
      return { key, name, avatar };
    });
  };

  globalThis.GV = {
    ...globalThis.GV,
    channelKeyFromHref,
    entryKey,
    isChannelName,
    buildTrust,
    isTrusted,
    keepsStoryHidden,
    parseSubscriptions,
  };
})();
