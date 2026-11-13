const LEVEL_NAMES = { nothing: 'Nothing', content: 'Content', gameplay: 'Gameplay', everything: 'Everything' };
// Content = trailers, news, release info, music and score. Each description says what is shown and what is hidden.
const DESCRIPTIONS = {
  nothing: 'Shows nothing about GTA VI. Hides content, gameplay and story.',
  content: 'Shows content: trailers, news, release info, music and score. Hides gameplay and story.',
  gameplay: 'Shows content and gameplay. Hides story, endings, deaths and missions.',
  everything: 'Shows everything: content, gameplay and story. Protection is off.',
};
const MODE_DESCRIPTIONS = {
  same: 'Trusted ones follow the same rules as everyone else.',
  gameplay: 'Trusted ones may show content and gameplay; story spoilers stay hidden.',
  everything: 'Trusted ones skip the shield completely, spoilers included.',
};

// Per-app rules (when Global settings is off). Reddit has no trusted list: it only gets a level and panic.
const APPS = {
  youtube: { label: 'YouTube', icon: '../../assets/brands/youtube.svg' },
  x: { label: 'X', icon: '../../assets/brands/x.svg' },
  reddit: { label: 'Reddit', icon: '../../assets/brands/reddit.svg' },
};

// What differs per trusted list: its mode (synced), the pick-list and pictures (local).
const SITES = {
  youtube: {
    label: 'YouTube',
    noun: 'channels',
    trust: 'trusted',
    mode: 'subsMode',
    subs: 'subs',
    avatars: 'avatars',
    synced: 'syncedAt',
    canSync: true,
    pickHint: 'subscriptions found. Switch on the channels you trust.',
  },
  x: {
    label: 'X',
    noun: 'accounts',
    trust: 'xTrusted',
    mode: 'xMode',
    subs: 'xSubs',
    avatars: 'xAvatars',
    synced: 'xSyncedAt',
    canSync: false,
    pickHint: 'accounts collected. Open your Following page on X and scroll to add more.',
  },
};
const DEFAULTS = {
  global: true,
  level: 'content',
  panic: false,
  sites: {},
  trusted: {},
  subsMode: 'gameplay',
  xTrusted: {},
  xMode: 'gameplay',
};

const $ = id => {
  return document.getElementById(id);
};

// everything the screens draw comes from one state object, refreshed from storage
let state = {
  ...DEFAULTS,
  subs: {},
  avatars: {},
  xSubs: {},
  xAvatars: {},
  syncedAt: 0,
  xSyncedAt: 0,
  syncError: '',
  view: 'rules', // 'rules' | 'trusted'
  trustSite: 'youtube',
};

// an app's own level and panic when global settings are off, otherwise the shared ones
const ruleOf = app => {
  const own = state.sites[app] || {};

  return { level: own.level ?? state.level, panic: own.panic ?? state.panic };
};

const rowsFor = site => {
  const config = SITES[site];
  const trusted = state[config.trust];
  const rows = new Map();

  for (const [key, name] of Object.entries(state[config.subs] || {})) {
    rows.set(key, { key, name, tag: site === 'x' ? 'following' : 'subscribed' });
  }

  for (const [key, name] of Object.entries(trusted)) {
    rows.set(key, rows.get(key) || { key, name, tag: 'added by you' });
  }

  return [...rows.values()]
    .map(row => {
      return { ...row, on: Boolean(trusted[row.key]), avatar: (state[config.avatars] || {})[row.key] || '' };
    })
    .sort((a, b) => {
      return Number(b.on) - Number(a.on) || a.name.localeCompare(b.name);
    });
};

const ago = time => {
  const minutes = Math.round((Date.now() - time) / 60000);

  if (minutes < 1) {
    return 'just now';
  }

  return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
};

const setActive = (buttons, isOn) => {
  buttons.forEach(button => {
    button.classList.toggle('levels__button--on', isOn(button));
  });
};

const iconOf = app => {
  const icon = document.createElement('span');

  icon.className = 'ico';
  icon.innerHTML = `<img src="${APPS[app].icon}" width="16" height="16" alt="${APPS[app].label}">`;

  return icon;
};

const handleAppChange = (app, values) => {
  save({ sites: { ...state.sites, [app]: { ...state.sites[app], ...values } } });
};

// one level control per app, each on a single row beside its logo
const renderSiteRules = () => {
  const container = $('siteRules');

  container.replaceChildren();

  for (const app of Object.keys(APPS)) {
    const row = document.createElement('div');
    const bar = document.createElement('div');

    row.className = 'siterow';
    row.dataset.siteRow = app;
    bar.className = 'levels levels--mini';

    for (const [value, name] of Object.entries(LEVEL_NAMES)) {
      const button = document.createElement('button');

      button.type = 'button';
      button.className = 'levels__button' + (value === ruleOf(app).level ? ' levels__button--on' : '');
      button.dataset.appLevel = value;
      button.textContent = name;
      button.onclick = () => {
        handleAppChange(app, { level: value });
      };
      bar.append(button);
    }

    row.append(iconOf(app), bar);
    container.append(row);
  }
};

// panic: one switch when global, otherwise a small switch per app
const renderPanicSites = () => {
  const container = $('panicSites');

  container.replaceChildren();

  for (const app of Object.keys(APPS)) {
    const item = document.createElement('label');
    const toggle = document.createElement('input');

    item.className = 'mini';
    item.dataset.panicSite = app;
    toggle.type = 'checkbox';
    toggle.className = 'switch switch--small';
    toggle.checked = ruleOf(app).panic;
    toggle.onchange = () => {
      handleAppChange(app, { panic: toggle.checked });
    };
    item.append(iconOf(app), toggle);
    container.append(item);
  }
};

const renderRules = () => {
  $('global').checked = state.global;
  $('globalHint').textContent = state.global
    ? 'One set of rules for YouTube, X and Reddit'
    : 'Each app has its own rules';
  $('scopeChip').textContent = state.global ? 'All sites' : 'Per app';
  $('globalRules').hidden = !state.global;
  $('siteRules').hidden = state.global;
  $('panic').hidden = !state.global;
  $('panicSites').hidden = state.global;

  if (state.global) {
    $('desc').textContent = DESCRIPTIONS[state.level];
    $('panic').checked = state.panic;
    setActive($('levels').querySelectorAll('[data-level]'), button => {
      return button.dataset.level === state.level;
    });

    return;
  }

  renderSiteRules();
  renderPanicSites();
};

const handleChannelToggle = (row, on) => {
  const key = SITES[state.trustSite].trust;
  const trusted = { ...state[key] };

  if (on) {
    trusted[row.key] = row.name;
  } else {
    delete trusted[row.key];
  }

  save({ [key]: trusted });
};

const renderTrusted = () => {
  const site = state.trustSite;
  const config = SITES[site];
  const query = $('search').value.trim().toLowerCase();
  const rows = rowsFor(site).filter(row => {
    return row.name.toLowerCase().includes(query);
  });
  const mode = state[config.mode];
  const hasTrusted = Object.keys(state[config.trust]).length > 0;

  // a mode with nobody trusted does nothing, so it stays greyed out until someone is trusted
  $('modes').classList.toggle('levels--disabled', !hasTrusted);
  setActive($('siteSwitch').querySelectorAll('[data-trust-site]'), button => {
    return button.dataset.trustSite === site;
  });
  setActive($('modes').querySelectorAll('[data-mode]'), button => {
    return button.dataset.mode === mode;
  });
  $('modeDesc').textContent = hasTrusted
    ? MODE_DESCRIPTIONS[mode]
    : `Trust ${config.noun === 'accounts' ? 'an account' : 'a channel'} to turn this on.`;

  const list = $('list');

  list.replaceChildren();

  if (!rows.length) {
    const empty = document.createElement('div');

    empty.className = 'list__empty';
    empty.textContent = config.canSync
      ? 'Nothing trusted yet. Sync to pick from your subscriptions, or use Trust on a hidden card.'
      : 'Nothing trusted yet. Open your Following page and scroll, or use Trust on a hidden post.';
    list.append(empty);
  }

  for (const row of rows) {
    const item = document.createElement('label');
    const avatar = document.createElement(row.avatar ? 'img' : 'span');
    const name = document.createElement('span');
    const tag = document.createElement('span');
    const toggle = document.createElement('input');

    item.className = 'channel';
    avatar.className = 'channel__avatar';

    if (row.avatar) {
      avatar.src = row.avatar;
      avatar.alt = '';
    } else {
      avatar.textContent = row.name.charAt(0).toUpperCase();
    }

    name.className = 'channel__name';
    name.textContent = row.name;
    tag.className = 'channel__tag';
    tag.textContent = row.tag;
    toggle.type = 'checkbox';
    toggle.className = 'switch';
    toggle.checked = row.on;
    toggle.onchange = () => {
      handleChannelToggle(row, toggle.checked);
    };
    item.append(avatar, name, tag, toggle);
    list.append(item);
  }

  const count = Object.keys(state[config.subs] || {}).length;
  const syncedAt = state[config.synced];
  const idle = config.canSync ? 'Not synced yet' : 'Collected as you browse';

  $('sync').hidden = !config.canSync;
  $('syncTitle').textContent = syncedAt ? `Synced ${ago(syncedAt)}` : idle;
  $('syncDetail').textContent = (config.canSync && state.syncError) || `${count} ${config.pickHint}`;
};

const render = () => {
  const { view } = state;

  $('rules').hidden = view !== 'rules';
  $('trusted').hidden = view !== 'trusted';
  document.querySelectorAll('[data-view]').forEach(button => {
    button.classList.toggle('tabs__tab--on', button.dataset.view === view);
  });

  if (view === 'rules') {
    renderRules();
  } else {
    renderTrusted();
  }
};

const save = values => {
  version++;
  Object.assign(state, values);
  render();
  chrome.storage.sync.set(values);
};

const handleLevelClick = event => {
  save({ level: event.currentTarget.dataset.level });
};

const handleViewClick = event => {
  state.view = event.currentTarget.dataset.view;
  render();
};

const handleSiteClick = event => {
  state.trustSite = event.currentTarget.dataset.trustSite;
  render();
};

const handleModeClick = event => {
  save({ [SITES[state.trustSite].mode]: event.currentTarget.dataset.mode });
};

// The popup reads the subscriptions page itself (host permission), so no open YouTube tab is needed.
const handleSync = async () => {
  $('syncTitle').textContent = 'Syncing…';

  try {
    const response = await fetch('https://www.youtube.com/feed/channels', { credentials: 'include' });
    const list = GV.parseSubscriptions(await response.text());

    if (!list.length) {
      chrome.storage.local.set({ syncError: 'No subscriptions found. Are you signed in to YouTube?' });

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
    chrome.storage.local.set({ syncError: 'Could not read your subscriptions. Check your connection.' });
  }
};

// A read that started before a newer read or a save must not overwrite it, so reads carry a version.
let version = 0;

const refresh = () => {
  const mine = ++version;

  chrome.storage.sync.get(DEFAULTS, synced => {
    const localDefaults = { subs: {}, avatars: {}, xSubs: {}, xAvatars: {}, syncedAt: 0, xSyncedAt: 0, syncError: '' };

    chrome.storage.local.get(localDefaults, local => {
      if (mine !== version) {
        return;
      }

      state = { ...state, ...synced, ...local };
      state.level = GV.normalizeLevel(state.level);
      state.subsMode = GV.normalizeMode(state.subsMode);
      state.xMode = GV.normalizeMode(state.xMode);

      for (const app of Object.keys(state.sites)) {
        if (state.sites[app].level) {
          state.sites[app] = { ...state.sites[app], level: GV.normalizeLevel(state.sites[app].level) };
        }
      }

      render();
    });
  });
};

$('levels')
  .querySelectorAll('[data-level]')
  .forEach(button => {
    button.onclick = handleLevelClick;
  });
document.querySelectorAll('[data-view]').forEach(button => {
  button.onclick = handleViewClick;
});
document.querySelectorAll('[data-trust-site]').forEach(button => {
  button.onclick = handleSiteClick;
});
document.querySelectorAll('[data-mode]').forEach(button => {
  button.onclick = handleModeClick;
});
$('global').onchange = () => {
  save({ global: $('global').checked });
};
$('panic').onchange = () => {
  save({ panic: $('panic').checked });
};
$('search').oninput = renderTrusted;
$('sync').onclick = handleSync;
chrome.storage.onChanged.addListener(refresh);
refresh();
