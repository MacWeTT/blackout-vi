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

  const lower = text =>
    String(text || '')
      .trim()
      .toLowerCase();

  // Entry key used for storage: the channel's own key, or its lowercased name when the tile showed no link.
  const entryKey = ref => ref.key || (ref.name ? 'name:' + lower(ref.name) : '');

  // subsMode: 'same' (subscriptions get no special treatment), 'gameplay' (they skip news and gameplay rules,
  // story spoilers stay hidden) or 'all' (they skip every rule). Channels you trusted by hand follow the same story rule.
  const subsTrusted = mode => mode === 'gameplay' || mode === 'all';
  const keepsStoryHidden = mode => mode !== 'all';

  // The enabled set of keys and names. Subscriptions count only outside 'same'; disabled entries never count.
  const buildTrust = settings => {
    const { trusted = {}, subs = {}, disabled = {}, subsMode = 'same' } = settings;
    const entries = { ...(subsTrusted(subsMode) ? subs : {}), ...trusted };
    const keys = new Set();
    const names = new Set();

    for (const [key, name] of Object.entries(entries)) {
      if (!disabled[key]) {
        keys.add(key);
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

    return (ref.key && trust.keys.has(ref.key)) || (ref.name && trust.names.has(lower(ref.name)));
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

        if (key && name) {
          found.set(key, name);
        }
      }

      for (const value of Object.values(node)) {
        walk(value);
      }
    };

    walk(data);

    return [...found].map(([key, name]) => ({ key, name }));
  };

  globalThis.GV = {
    ...globalThis.GV,
    channelKeyFromHref,
    entryKey,
    buildTrust,
    isTrusted,
    keepsStoryHidden,
    subsTrusted,
    parseSubscriptions,
  };
})();
